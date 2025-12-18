/* eslint-disable no-console */
/**
 * Rehydrate real explainability artifacts for SUCCESS/DONE runs whose Insights tab
 * is missing data because required pipeline artifacts were never written.
 *
 * This does NOT synthesize/approximate data.
 * It re-runs the missing pipeline stages to produce the real artifacts:
 * - baseline_resume.json
 * - job_extracted.txt
 * - evidence_scores.json
 * - jd_rubric.json (+ prompt_used_rubric.txt)
 * - embeddings artifacts (relevance_matrix.json, relevance_summary.json, jd_requirement_embeddings.json)
 * - selection_plan.json (+ selection_debug.json)
 *
 * It does NOT re-run LaTeX/PDF generation.
 * It does NOT overwrite existing artifacts unless --force is provided.
 *
 * Usage:
 *   node scripts/rehydrate_insights_for_completed_runs.js
 *   node scripts/rehydrate_insights_for_completed_runs.js --limit 5000 --force --verbose
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import crypto from "node:crypto";

import { loadEvidenceRules, scoreMasterResume } from "../scoring/evidenceScorer.js";
import {
  computeMasterResumeHash,
  getCachePath,
  readCachedEvidenceScores,
  writeCachedEvidenceScores
} from "../scoring/evidenceCache.js";
import { runEmbeddingStage } from "../embeddings/engine.js";
import { runSelectionStage } from "../selection/selector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const out = {
    runsRoot: path.join(__dirname, "..", "runs"),
    resumesDir: path.join(__dirname, "..", "resumes"),
    evidenceRulesPath: path.join(__dirname, "..", "scoring", "evidence_rules_v1.json"),
    evidenceCacheRoot: path.join(__dirname, "..", "cache", "evidence_scores"),
    embedCacheRoot: path.join(__dirname, "..", "cache", "embeddings"),
    selectionConfigPath: path.join(__dirname, "..", "selection", "selection_config_v1.json"),
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
    embeddingDims:
      Number.isFinite(Number(process.env.OPENAI_EMBEDDING_DIMS)) && Number(process.env.OPENAI_EMBEDDING_DIMS) > 0
        ? Number(process.env.OPENAI_EMBEDDING_DIMS)
        : null,
    embedPreprocessVersion: process.env.EMBED_PREPROCESS_VERSION || "embed_text_v1",
    limit: Infinity,
    force: false,
    verbose: false,
    onlyRunId: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--runs-root") out.runsRoot = argv[i + 1] || out.runsRoot;
    if (a === "--resumes-dir") out.resumesDir = argv[i + 1] || out.resumesDir;
    if (a === "--limit") out.limit = Number(argv[i + 1] || out.limit);
    if (a === "--force") out.force = true;
    if (a === "--verbose") out.verbose = true;
    if (a === "--run-id") out.onlyRunId = argv[i + 1] || null;
  }

  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = Infinity;
  return out;
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(filePath, obj) {
  await fs.promises.writeFile(filePath, JSON.stringify(obj, null, 2), "utf8");
}

async function statIfExists(filePath) {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}

function exists(runDir, filename) {
  return fs.existsSync(path.join(runDir, filename));
}

function stageOk(status) {
  const isSuccess = (status?.status || "").toString().toLowerCase() === "success";
  const isDone = (status?.stage || "").toString().toUpperCase() === "DONE";
  return isSuccess && isDone;
}

async function ensureBaselineResume({ runDir, resumeId, resumesDir, force, verbose }) {
  const outPath = path.join(runDir, "baseline_resume.json");
  if (!force && fs.existsSync(outPath)) return { ok: true, wrote: false };

  const filePath = path.join(resumesDir, `${resumeId}.json`);
  if (!fs.existsSync(filePath)) return { ok: false, error: `Missing master resume: ${filePath}` };

  const master = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  await writeJson(outPath, master);
  if (verbose) console.log(`  wrote baseline_resume.json (resume_id=${resumeId})`);
  return { ok: true, wrote: true, master };
}

async function ensureJobExtracted({ runDir, jobJson, force, verbose }) {
  const outPath = path.join(runDir, "job_extracted.txt");
  if (!force && fs.existsSync(outPath)) return { ok: true, wrote: false };

  const text = (jobJson?.job?.description_text || "").toString();
  if (!text.trim()) return { ok: false, error: "job.json missing job.description_text" };

  await fs.promises.writeFile(outPath, text, "utf8");
  if (verbose) console.log(`  wrote job_extracted.txt (${text.length} chars)`);
  return { ok: true, wrote: true };
}

async function ensureFinalResumeFromTailored({ runDir, force, verbose }) {
  const outPath = path.join(runDir, "final_resume.json");
  if (!force && fs.existsSync(outPath)) return { ok: true, wrote: false };

  const tailored = await readJsonIfExists(path.join(runDir, "tailored.json"));
  const finalResume = tailored?.final_resume;
  if (!finalResume || typeof finalResume !== "object") {
    return { ok: true, wrote: false }; // not available; don't treat as failure
  }
  await writeJson(outPath, finalResume);
  if (verbose) console.log("  wrote final_resume.json (from tailored.json)");
  return { ok: true, wrote: true };
}

async function ensureEvidenceScores({
  runId,
  runDir,
  masterResume,
  evidenceRulesPath,
  evidenceCacheRoot,
  force,
  verbose
}) {
  const outPath = path.join(runDir, "evidence_scores.json");
  if (!force && fs.existsSync(outPath)) return { ok: true, wrote: false };

  const resumeHash = computeMasterResumeHash(masterResume);
  const rulesInfo = loadEvidenceRules(evidenceRulesPath);
  const cachePaths = getCachePath(resumeHash, rulesInfo.hash, evidenceCacheRoot);

  const cacheLookup = await readCachedEvidenceScores({ resumeHash, rulesHash: rulesInfo.hash, cacheRoot: evidenceCacheRoot });
  if (cacheLookup?.data) {
    const artifact = { ...cacheLookup.data, run_id: runId };
    await writeJson(outPath, artifact);
    if (verbose) console.log(`  wrote evidence_scores.json (cache HIT)`);
    return { ok: true, wrote: true, cache: "hit" };
  }

  const scored = scoreMasterResume(masterResume, rulesInfo.rules);
  const artifact = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    rules_version: rulesInfo.rules?.version || "v1",
    rules_hash: rulesInfo.hash,
    rules_path: rulesInfo.path,
    resume_hash: resumeHash,
    tool_lexicon_size: scored.tool_lexicon_size,
    summary: scored.summary,
    bullets: scored.bullets
  };
  await writeJson(outPath, artifact);
  await writeCachedEvidenceScores({ resumeHash, rulesHash: rulesInfo.hash, cacheRoot: evidenceCacheRoot, data: artifact });
  if (verbose) console.log(`  wrote evidence_scores.json (cache MISS → saved ${cachePaths?.filePath || ""})`);
  return { ok: true, wrote: true, cache: "miss" };
}

async function ensureRubric({ runDir, jobPayload, jobText, force, verbose }) {
  const outPath = path.join(runDir, "jd_rubric.json");
  if (!force && fs.existsSync(outPath)) return { ok: true, wrote: false };

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY not set (required to regenerate jd_rubric.json)" };
  }

  // Import rubric extraction helper from server.js without starting the server.
  // server.js was modified to only listen when executed directly.
  const mod = await import(path.join(__dirname, "..", "server.js"));
  const runRubricExtraction = mod?.runRubricExtraction;
  if (typeof runRubricExtraction !== "function") {
    return { ok: false, error: "runRubricExtraction not available from server.js" };
  }

  const appendLog = verbose ? (line) => console.log(`  [rubric] ${line}`) : null;
  await runRubricExtraction({ jobPayload, jobText, runDir, appendLog, forceMock: false, forceRealModel: true });
  if (!fs.existsSync(outPath)) return { ok: false, error: "Rubric stage completed but jd_rubric.json not found" };
  if (verbose) console.log("  wrote jd_rubric.json");
  return { ok: true, wrote: true };
}

async function ensureEmbeddings({
  runId,
  runDir,
  masterResume,
  rubric,
  jobExtractedHash,
  masterResumeHash,
  embedCacheRoot,
  embeddingModel,
  embeddingDims,
  preprocessVersion,
  force,
  verbose
}) {
  const needAny =
    force ||
    !exists(runDir, "relevance_matrix.json") ||
    !exists(runDir, "relevance_summary.json") ||
    !exists(runDir, "jd_requirement_embeddings.json");
  if (!needAny) return { ok: true, wrote: false };

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY not set (required for embeddings stage)" };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const logger = verbose ? (line) => console.log(`  [embed] ${line}`) : null;

  await runEmbeddingStage({
    runId,
    runDir,
    masterResume,
    rubric,
    jobExtractedHash,
    masterResumeHash,
    openaiClient: openai,
    mockMode: false,
    config: {
      cacheRoot: embedCacheRoot,
      embeddingModel,
      embeddingDims,
      preprocessVersion
    },
    logger
  });

  const ok = exists(runDir, "relevance_matrix.json");
  if (!ok) return { ok: false, error: "Embeddings stage completed but relevance_matrix.json not found" };
  if (verbose) console.log("  wrote embeddings artifacts (relevance_matrix/summary, jd_requirement_embeddings)");
  return { ok: true, wrote: true };
}

async function ensureSelectionPlan({
  runId,
  runDir,
  selectionConfigPath,
  embedCacheRoot,
  embeddingModel,
  embeddingDims,
  preprocessVersion,
  force,
  verbose
}) {
  const outPath = path.join(runDir, "selection_plan.json");
  if (!force && fs.existsSync(outPath)) return { ok: true, wrote: false };

  const logger = verbose ? (line) => console.log(`  [select] ${line}`) : null;

  await runSelectionStage({
    runId,
    runDir,
    configPath: selectionConfigPath,
    embedConfigOverride: {
      cacheRoot: embedCacheRoot,
      embeddingModel,
      embeddingDims,
      preprocessVersion
    },
    logger
  });

  if (!fs.existsSync(outPath)) return { ok: false, error: "Selection stage completed but selection_plan.json not found" };
  if (verbose) console.log("  wrote selection_plan.json");
  return { ok: true, wrote: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.runsRoot)) {
    console.error(`Runs root not found: ${args.runsRoot}`);
    process.exit(1);
  }

  const entries = await fs.promises.readdir(args.runsRoot, { withFileTypes: true });
  const runIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const withMeta = await Promise.all(
    runIds.map(async (runId) => {
      const runDir = path.join(args.runsRoot, runId);
      const s = (await statIfExists(path.join(runDir, "status.json"))) || (await statIfExists(runDir));
      return { runId, runDir, mtimeMs: s ? s.mtimeMs : 0 };
    })
  );
  withMeta.sort((a, b) => b.mtimeMs - a.mtimeMs);

  let processed = 0;
  let eligible = 0;
  let updated = 0;
  const failures = [];

  for (const t of withMeta.slice(0, Number.isFinite(args.limit) ? args.limit : withMeta.length)) {
    processed += 1;
    if (args.onlyRunId && t.runId !== args.onlyRunId) continue;

    const status = await readJsonIfExists(path.join(t.runDir, "status.json"));
    if (!stageOk(status)) continue;

    eligible += 1;

    const missing = {
      baseline: !exists(t.runDir, "baseline_resume.json"),
      job_text: !exists(t.runDir, "job_extracted.txt"),
      evidence: !exists(t.runDir, "evidence_scores.json"),
      rubric: !exists(t.runDir, "jd_rubric.json"),
      embed: !exists(t.runDir, "relevance_matrix.json"),
      selection: !exists(t.runDir, "selection_plan.json"),
      final_resume: !exists(t.runDir, "final_resume.json")
    };

    const needsAny = Object.values(missing).some(Boolean) || args.force;
    if (!needsAny) continue;

    const jobJson = await readJsonIfExists(path.join(t.runDir, "job.json"));
    if (!jobJson) {
      failures.push({ runId: t.runId, error: "Missing job.json" });
      continue;
    }

    const meta = await readJsonIfExists(path.join(t.runDir, "meta.json"));
    const resumeId = (meta?.resume_id || "default").toString();

    if (args.verbose) {
      console.log(`\n[${t.runId}] rehydrate (force=${args.force}) missing=${JSON.stringify(missing)}`);
    }

    try {
      // 1) baseline
      const baseRes = await ensureBaselineResume({ runDir: t.runDir, resumeId, resumesDir: args.resumesDir, force: args.force, verbose: args.verbose });
      if (!baseRes.ok) throw new Error(baseRes.error);
      const masterResume = baseRes.master || (await readJsonIfExists(path.join(t.runDir, "baseline_resume.json")));
      if (!masterResume) throw new Error("Unable to load baseline/master resume");

      // 2) job text
      const jobTextRes = await ensureJobExtracted({ runDir: t.runDir, jobJson, force: args.force, verbose: args.verbose });
      if (!jobTextRes.ok) throw new Error(jobTextRes.error);
      const jobText = await fs.promises.readFile(path.join(t.runDir, "job_extracted.txt"), "utf8");
      const jobTextHash = jobText
        ? `sha256:${crypto.createHash("sha256").update(jobText, "utf8").digest("hex")}`
        : null;

      // 3) evidence scores
      const evRes = await ensureEvidenceScores({
        runId: t.runId,
        runDir: t.runDir,
        masterResume,
        evidenceRulesPath: args.evidenceRulesPath,
        evidenceCacheRoot: args.evidenceCacheRoot,
        force: args.force,
        verbose: args.verbose
      });
      if (!evRes.ok) throw new Error(evRes.error);

      // 3b) final resume JSON (from tailored.json, if present)
      await ensureFinalResumeFromTailored({ runDir: t.runDir, force: args.force, verbose: args.verbose });

      // 4) rubric (LLM)
      const jobPayload = { job: jobJson.job || {}, meta: jobJson.meta || {}, debug: jobJson.debug || {} };
      const rubricRes = await ensureRubric({ runDir: t.runDir, jobPayload, jobText, force: args.force, verbose: args.verbose });
      if (!rubricRes.ok) throw new Error(rubricRes.error);
      const rubric = await readJsonIfExists(path.join(t.runDir, "jd_rubric.json"));
      if (!rubric) throw new Error("Unable to read jd_rubric.json after rubric stage");

      // 5) embeddings
      const embRes = await ensureEmbeddings({
        runId: t.runId,
        runDir: t.runDir,
        masterResume,
        rubric,
        jobExtractedHash: jobTextHash,
        masterResumeHash: computeMasterResumeHash(masterResume),
        embedCacheRoot: args.embedCacheRoot,
        embeddingModel: args.embeddingModel,
        embeddingDims: args.embeddingDims,
        preprocessVersion: args.embedPreprocessVersion,
        force: args.force,
        verbose: args.verbose
      });
      if (!embRes.ok) throw new Error(embRes.error);

      // 6) selection
      const selRes = await ensureSelectionPlan({
        runId: t.runId,
        runDir: t.runDir,
        selectionConfigPath: args.selectionConfigPath,
        embedCacheRoot: args.embedCacheRoot,
        embeddingModel: args.embeddingModel,
        embeddingDims: args.embeddingDims,
        preprocessVersion: args.embedPreprocessVersion,
        force: args.force,
        verbose: args.verbose
      });
      if (!selRes.ok) throw new Error(selRes.error);

      updated += 1;
    } catch (err) {
      failures.push({ runId: t.runId, error: err?.message || String(err) });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        runsRoot: args.runsRoot,
        processed,
        eligible,
        updated,
        failures
      },
      null,
      2
    )
  );

  if (failures.length) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
