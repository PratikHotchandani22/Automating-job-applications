import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import { loadEvidenceRules, scoreBulletEvidence } from "../scoring/evidenceScorer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rulesPath = path.join(__dirname, "..", "scoring", "evidence_rules_v1.json");
const { rules } = loadEvidenceRules(rulesPath);

const metricResult = scoreBulletEvidence("Optimized pipeline to 99% accuracy and 120ms latency", rules);
assert.strictEqual(metricResult.features.metric_score, 1, "Metric detection should score 1");
assert.ok(metricResult.features.metric_matches.some((m) => m.includes("99%")), "Should capture percentage metric");
assert.ok(metricResult.features.scope_matches.includes("latency"), "Should detect scope cue");

const fluffResult = scoreBulletEvidence("Responsible for data entry and reporting", rules);
assert.ok(fluffResult.features.fluff_penalty < 0, "Fluff penalty should be negative when fluff present");
assert.ok(fluffResult.reasons.some((r) => r.code === "FLUFF_HARD"), "Hard fluff reason should be emitted");

const actionResult = scoreBulletEvidence("Optimized ETL jobs using PySpark and Databricks", rules);
assert.strictEqual(actionResult.features.action_score, 1, "Strong verb should score 1");
assert.ok(actionResult.reasons.some((r) => r.code === "ACTION_STRONG"), "Should mark action as strong");
assert.ok(actionResult.features.tool_matches.includes("PySpark"), "Tool match should include PySpark");

console.log("Evidence scorer rule tests passed.");
