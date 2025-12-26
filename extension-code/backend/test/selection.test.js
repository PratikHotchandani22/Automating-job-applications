import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { runSelectionStage, rankRequirements, computeRedundancy } from "../selection/selector.js";
import { computeMasterResumeHash } from "../scoring/evidenceCache.js";

process.env.MOCK_MODE = "1";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "selection-test-"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function buildConfig(configPath) {
  writeJson(configPath, {
    config_version: "selection_config_v1",
    budgets: {
      target_resume_words_min: 100,
      target_resume_words_max: 700,
      experience_bullets_min: 1,
      experience_bullets_max: 2,
      project_bullets_min: 0,
      project_bullets_max: 0,
      award_lines_min: 0,
      award_lines_max: 0,
      per_role_caps: { most_recent: 1, next: 1, older: 1 },
      max_bullets_per_requirement: 2
    },
    thresholds: {
      must_min_rel: 0.35,
      nice_min_rel: 0.3,
      cover_threshold: 0.45,
      redundancy: { hard_block: 0.92, penalty_start: 0.85 },
      min_evidence_tier_nice: "medium"
    },
    weights: {
      edge: { w_rel: 0.6, w_evd: 0.35, w_red: 0.2, w_risk: 0.15 },
      fill: { alpha: 0.5, beta: 0.3, gamma: 0.2 }
    }
  });
}

async function runIntegrationTest() {
  const runDir = makeTempDir();
  const configPath = path.join(runDir, "selection_config.json");
  buildConfig(configPath);

  const baseline = {
    id: "test",
    work_experience: [
      {
        id: "role_recent",
        company: "ACME",
        role: "Engineer",
        dates: "2024",
        bullets: ["Built ML models", "Optimized pipelines"]
      },
      {
        id: "role_old",
        company: "OldCo",
        role: "Analyst",
        dates: "2022",
        bullets: ["Analyzed data"]
      }
    ],
    projects: []
  };
  writeJson(path.join(runDir, "baseline_resume.json"), baseline);
  fs.writeFileSync(path.join(runDir, "job_extracted.txt"), "sample job text", "utf8");

  const rubric = {
    version: "jd_rubric_v1",
    job_meta: {},
    requirements: [
      { req_id: "R1", type: "must", weight: 5, requirement: "Build ML systems" },
      { req_id: "R2", type: "nice", weight: 3, requirement: "Communicate results" }
    ]
  };
  writeJson(path.join(runDir, "jd_rubric.json"), rubric);

  const evidence = {
    run_id: "test-run",
    resume_hash: computeMasterResumeHash(baseline),
    bullets: [
      {
        bullet_id: "role_recent_b1",
        parent_type: "experience",
        parent_id: "role_recent",
        text: "Built ML systems end-to-end",
        evidence_score: 0.9,
        tier: "strong",
        features: {}
      },
      {
        bullet_id: "role_recent_b2",
        parent_type: "experience",
        parent_id: "role_recent",
        text: "Led ML project",
        evidence_score: 0.85,
        tier: "strong",
        features: {}
      },
      {
        bullet_id: "role_old_b1",
        parent_type: "experience",
        parent_id: "role_old",
        text: "Partnered with stakeholders",
        evidence_score: 0.7,
        tier: "medium",
        features: {}
      }
    ]
  };
  writeJson(path.join(runDir, "evidence_scores.json"), evidence);

  const relevance = {
    version: "relevance_matrix_v1",
    per_requirement_top_bullets: {
      R1: [
        { bullet_id: "role_recent_b1", score: 0.9 },
        { bullet_id: "role_recent_b2", score: 0.89 },
        { bullet_id: "role_old_b1", score: 0.2 }
      ],
      R2: [
        { bullet_id: "role_recent_b2", score: 0.88 },
        { bullet_id: "role_old_b1", score: 0.8 }
      ]
    },
    per_bullet_top_requirements: {
      role_recent_b1: [
        { req_id: "R1", score: 0.9 },
        { req_id: "R2", score: 0.2 }
      ],
      role_recent_b2: [
        { req_id: "R2", score: 0.88 },
        { req_id: "R1", score: 0.89 }
      ],
      role_old_b1: [
        { req_id: "R2", score: 0.8 },
        { req_id: "R1", score: 0.2 }
      ]
    }
  };
  writeJson(path.join(runDir, "relevance_matrix.json"), relevance);

  const selection = await runSelectionStage({
    runId: "run-selection",
    runDir,
    configPath,
    embedConfigOverride: { embeddingModel: "local-test", embeddingDims: 2, cacheRoot: runDir },
    resumeEmbeddingsOverride: {
      vectorLookup: {
        role_recent_b1: [1, 0],
        role_recent_b2: [0.99, 0.01],
        role_old_b1: [0, 1]
      },
      cachePath: path.join(runDir, "resume_embeddings.json")
    }
  });

  const plan = JSON.parse(fs.readFileSync(selection.planPath, "utf8"));
  assert.strictEqual(plan.version, "selection_plan_v1");
  assert.strictEqual(plan.coverage.must_covered, 1);
  assert.strictEqual(plan.coverage.nice_covered, 1);
  assert.ok(plan.selection_notes.dropped_due_to_redundancy.includes("role_recent_b2"));
  assert.strictEqual(plan.budgets_used.experience_bullets, 2);
  const selectedIds = plan.selected.work_experience.flatMap((role) => role.bullets.map((b) => b.bullet_id));
  assert.deepStrictEqual(selectedIds.sort(), ["role_recent_b1", "role_old_b1"].sort());
  assert.ok(plan.job_extracted_hash, "job hash should be populated");
}

function runUnitChecks() {
  const reqs = [
    { req_id: "R1", type: "nice", weight: 5 },
    { req_id: "R2", type: "must", weight: 3 },
    { req_id: "R3", type: "must", weight: 5 }
  ];
  const ordered = rankRequirements(reqs, { R1: 2, R2: 1, R3: 5 }).map((r) => r.req_id);
  assert.deepStrictEqual(ordered, ["R3", "R2", "R1"], "must and weight should drive ordering");

  const redundancy = computeRedundancy([1, 0], [{ bullet_id: "b1", vector: [0.93, 0.01] }], {
    hard_block: 0.92,
    penalty_start: 0.85
  });
  assert.ok(redundancy.blocked, "similar bullets should hard block");
  const soft = computeRedundancy([1, 0], [{ bullet_id: "b2", vector: [0.9, 0.3] }], {
    hard_block: 0.95,
    penalty_start: 0.85
  });
  assert.ok(soft.penalty > 0 && !soft.blocked, "penalty should apply without blocking");
}

async function main() {
  runUnitChecks();
  await runIntegrationTest();
  console.log("Selection tests passed.");
}

main();
