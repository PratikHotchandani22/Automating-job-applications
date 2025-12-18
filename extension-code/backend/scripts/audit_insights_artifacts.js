/* eslint-disable no-console */
/**
 * Audit which SUCCESS/DONE runs are missing the real artifacts that power the dashboard "Insights" tab.
 *
 * No synthesis, no regeneration.
 *
 * Usage:
 *   node scripts/audit_insights_artifacts.js
 *   node scripts/audit_insights_artifacts.js --runs-root "/abs/path/to/runs" --limit 2000 --verbose
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const out = {
    runsRoot: path.join(__dirname, "..", "runs"),
    limit: Infinity,
    verbose: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--runs-root") out.runsRoot = argv[i + 1] || out.runsRoot;
    if (a === "--limit") out.limit = Number(argv[i + 1] || out.limit);
    if (a === "--verbose") out.verbose = true;
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

function hasAny(runDir, filenames) {
  return filenames.some((f) => exists(runDir, f));
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

  const withMeta = await Promise.all(
    runIds.map(async (runId) => {
      const runDir = path.join(root, runId);
      const s = (await statIfExists(path.join(runDir, "status.json"))) || (await statIfExists(runDir));
      return { runId, runDir, mtimeMs: s ? s.mtimeMs : 0 };
    })
  );
  withMeta.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const required = {
    jd_rubric: ["jd_rubric.json"],
    selection_plan: ["selection_plan.json"],
    tailored_json: ["tailored.json", "tailored_resume.json"],
    baseline_resume: ["baseline_resume.json"],
    final_resume: ["final_resume.json"],
    meta: ["meta.json"],
    job_text: ["job_extracted.txt"]
  };

  let processed = 0;
  let successDone = 0;
  let okAll = 0;
  const missingRuns = [];

  for (const t of withMeta.slice(0, Number.isFinite(args.limit) ? args.limit : withMeta.length)) {
    processed += 1;
    const status = await readJsonIfExists(path.join(t.runDir, "status.json"));
    if (!status) continue;

    const isSuccess = (status.status || "").toString().toLowerCase() === "success";
    const isDone = (status.stage || "").toString().toUpperCase() === "DONE";
    if (!isSuccess || !isDone) continue;

    successDone += 1;

    const missing = [];
    for (const [key, files] of Object.entries(required)) {
      if (!hasAny(t.runDir, files)) missing.push(key);
    }

    if (!missing.length) {
      okAll += 1;
      continue;
    }

    // Best-effort label for human readability.
    const insights = await readJsonIfExists(path.join(t.runDir, "insights.json"));
    const job = await readJsonIfExists(path.join(t.runDir, "job.json"));
    const title = (insights?.job_title || job?.job?.title || "").toString();
    const company = (insights?.company || job?.job?.company || "").toString();

    missingRuns.push({
      runId: t.runId,
      title: title || null,
      company: company || null,
      missing
    });

    if (args.verbose) {
      console.log(`[${t.runId}] missing: ${missing.join(", ")}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        runsRoot: root,
        processed,
        successDone,
        okAll,
        missingCount: missingRuns.length,
        missingRuns
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
