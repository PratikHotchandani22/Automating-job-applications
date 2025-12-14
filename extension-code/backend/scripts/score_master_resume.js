import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { loadEvidenceRules, scoreMasterResume } from "../scoring/evidenceScorer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const defaultRulesPath = path.join(projectRoot, "scoring", "evidence_rules_v1.json");
const defaultResumePath = path.join(projectRoot, "resumes", "default.json");
const runsRoot = path.join(projectRoot, "runs");

function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

async function main() {
  try {
    const rulesPath = getArg("--rules", defaultRulesPath);
    const resumePath = getArg("--resume", defaultResumePath);
    const runId = getArg("--run", `evidence-dev-${uuidv4()}`);
    const runDir = path.join(runsRoot, runId);

    const { rules, hash, path: resolvedRulesPath } = loadEvidenceRules(rulesPath);
    const resume = JSON.parse(fs.readFileSync(resumePath, "utf8"));
    const scored = scoreMasterResume(resume, rules);
    const artifact = {
      run_id: runId,
      generated_at: new Date().toISOString(),
      rules_version: rules.version || "v1",
      rules_hash: hash,
      rules_path: resolvedRulesPath,
      tool_lexicon_size: scored.tool_lexicon_size,
      summary: scored.summary,
      bullets: scored.bullets
    };

    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "evidence_scores.json"), JSON.stringify(artifact, null, 2));
    fs.writeFileSync(path.join(runDir, "baseline_resume.json"), JSON.stringify(resume, null, 2));

    const topPreview = artifact.summary.top.map((t) => `- ${t.evidence_score.toFixed(3)} ${t.bullet_id}: ${t.text.slice(0, 120)}`);
    const bottomPreview = artifact.summary.bottom.map((t) => `- ${t.evidence_score.toFixed(3)} ${t.bullet_id}: ${t.text.slice(0, 120)}`);

    console.log(`Evidence scoring complete. Run saved to ${runDir}`);
    console.log(`Rules version: ${artifact.rules_version} (hash=${artifact.rules_hash})`);
    console.log(`Summary: count=${artifact.summary.count}, strong=${artifact.summary.strong}, medium=${artifact.summary.medium}, weak=${artifact.summary.weak}`);
    console.log("Top bullets:");
    console.log(topPreview.join("\n"));
    console.log("Bottom bullets:");
    console.log(bottomPreview.join("\n"));
  } catch (error) {
    console.error("Failed to score resume:", error.message || error);
    process.exit(1);
  }
}

main();
