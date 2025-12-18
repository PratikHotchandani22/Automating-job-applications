/* eslint-disable no-console */
/**
 * Batch-compute user-facing insights for historical runs.
 *
 * Writes `${runDir}/insights.json` for each run, derived from:
 * - selection_plan.json (coverage + uncovered requirement ids)
 * - jd_rubric.json (job_meta + requirements + keywords)
 *
 * Usage:
 *   node scripts/backfill_run_insights.js
 *   node scripts/backfill_run_insights.js --limit 2000
 *   node scripts/backfill_run_insights.js --force
 *   node scripts/backfill_run_insights.js --runs-root "/abs/path/to/runs"
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MUST_WEIGHT = 0.7;
const NICE_WEIGHT = 0.3;

function parseArgs(argv) {
  const out = {
    runsRoot: path.join(__dirname, "..", "runs"),
    limit: Infinity,
    force: false,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--runs-root") out.runsRoot = argv[i + 1] || out.runsRoot;
    if (a === "--limit") out.limit = Number(argv[i + 1] || out.limit);
    if (a === "--force") out.force = true;
    if (a === "--verbose") out.verbose = true;
  }
  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = Infinity;
  return out;
}

async function readJson(filePath) {
  const raw = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function statIfExists(filePath) {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
}

function computeInsights({ selectionPlan, jdRubric, jobJson, statusJson }) {
  const out = {};

  // Best-effort job meta (for UI labeling).
  const rubricTitle = (jdRubric?.job_meta?.job_title || "").toString().trim();
  const rubricCompany = (jdRubric?.job_meta?.company || "").toString().trim();
  const rubricSource = (jdRubric?.job_meta?.source_platform || "").toString().trim();

  const jobTitle =
    rubricTitle ||
    (jobJson?.job?.title || "").toString().trim();
  const company =
    rubricCompany ||
    (jobJson?.job?.company || "").toString().trim();
  const sourcePlatform =
    rubricSource ||
    (jobJson?.meta?.platform || "").toString().trim() ||
    (statusJson?.platform || "").toString().trim();

  if (jobTitle) out.job_title = jobTitle;
  if (company) out.company = company;
  if (sourcePlatform) out.source_platform = sourcePlatform;

  // Keywords (top skills employers request) - only if rubric exists.
  const topKeywords = Array.isArray(jdRubric?.top_keywords)
    ? jdRubric.top_keywords.filter(Boolean)
    : Array.isArray(jdRubric?.keywords)
      ? jdRubric.keywords
          .map((k) => (typeof k === "string" ? k : k?.term))
          .filter(Boolean)
      : [];
  if (topKeywords.length) out.top_keywords = topKeywords.slice(0, 20);

  // Match strength + uncovered requirements (requires selection_plan + rubric requirements).
  const cov = selectionPlan?.coverage || null;
  if (cov) {
    const mustTotal = Number(cov?.must_total || 0);
    const niceTotal = Number(cov?.nice_total || 0);
    const mustCovered = Number(cov?.must_covered || 0);
    const niceCovered = Number(cov?.nice_covered || 0);

    const mustPct = mustTotal > 0 ? mustCovered / mustTotal : null;
    const nicePct = niceTotal > 0 ? niceCovered / niceTotal : null;
    const weightedPct =
      (mustPct !== null || nicePct !== null)
        ? Math.round(100 * ((mustPct ?? 0) * MUST_WEIGHT + (nicePct ?? 0) * NICE_WEIGHT))
        : null;

    if (typeof weightedPct === "number" && Number.isFinite(weightedPct)) {
      out.coverage_percent = Math.max(0, Math.min(100, weightedPct));
    }

    const rubricReqs = Array.isArray(jdRubric?.requirements) ? jdRubric.requirements : [];
    const reqTextById = new Map(
      rubricReqs
        .map((r) => ({
          id: r?.req_id,
          text: (r?.requirement || r?.text || "").toString().trim()
        }))
        .filter((x) => x.id && x.text)
        .map((x) => [x.id, x.text])
    );

    const uncoveredIds = Array.isArray(cov?.uncovered_requirements)
      ? cov.uncovered_requirements.map((r) => r?.req_id).filter(Boolean)
      : [];
    const uncoveredText = uncoveredIds.map((id) => reqTextById.get(id)).filter(Boolean);
    if (uncoveredText.length) out.uncovered_requirements = uncoveredText.slice(0, 60);
  }

  out._schema = "run_insights_v1";
  out._computed_at = new Date().toISOString();
  out._inputs = {
    has_status: Boolean(statusJson),
    has_job: Boolean(jobJson),
    has_rubric: Boolean(jdRubric),
    has_selection_plan: Boolean(selectionPlan)
  };
  return out;
}

async function shouldRecompute({ runDir, force }) {
  if (force) return true;
  const insightsPath = path.join(runDir, "insights.json");
  const insightsStat = await statIfExists(insightsPath);
  if (!insightsStat) return true;

  const deps = ["selection_plan.json", "jd_rubric.json"].map((f) => path.join(runDir, f));
  const depStats = await Promise.all(deps.map(statIfExists));
  const newestDep = depStats.filter(Boolean).reduce((m, s) => Math.max(m, s.mtimeMs), 0);
  return newestDep > insightsStat.mtimeMs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.runsRoot;

  if (!fs.existsSync(root)) {
    console.error(`Runs root not found: ${root}`);
    process.exit(1);
  }

  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  const runIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  // Sort newest-ish first (by status.json mtime if present, else folder mtime).
  const withMeta = await Promise.all(
    runIds.map(async (runId) => {
      const runDir = path.join(root, runId);
      const s = (await statIfExists(path.join(runDir, "status.json"))) || (await statIfExists(runDir));
      return { runId, runDir, mtimeMs: s ? s.mtimeMs : 0 };
    })
  );
  withMeta.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const targets = withMeta.slice(0, Number.isFinite(args.limit) ? args.limit : withMeta.length);
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of targets) {
    processed += 1;
    const runDir = t.runDir;
    try {
      const recompute = await shouldRecompute({ runDir, force: args.force });
      if (!recompute) {
        skipped += 1;
        continue;
      }

      const statusJson = await readJsonIfExists(path.join(runDir, "status.json"));
      const jobJson = await readJsonIfExists(path.join(runDir, "job.json"));
      const selectionPlan = await readJsonIfExists(path.join(runDir, "selection_plan.json"));
      const jdRubric = await readJsonIfExists(path.join(runDir, "jd_rubric.json"));

      // Always write best-effort insights (even if some stages never ran).
      const insights = computeInsights({ selectionPlan, jdRubric, jobJson, statusJson });
      await fs.promises.writeFile(path.join(runDir, "insights.json"), JSON.stringify(insights, null, 2), "utf8");
      updated += 1;

      if (args.verbose && updated % 50 === 0) console.log(`Updated ${updated}/${processed}...`);
    } catch (err) {
      failed += 1;
      if (args.verbose) console.warn(`Failed ${path.basename(runDir)}: ${err?.message || err}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        runsRoot: root,
        processed,
        updated,
        skipped,
        failed
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

