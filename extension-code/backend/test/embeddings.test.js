import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { runEmbeddingStage, embedTextV1, computeCosineSimilarity } from "../embeddings/engine.js";
import { computeMasterResumeHash } from "../scoring/evidenceCache.js";

process.env.MOCK_MODE = "1";

const resume = {
  id: "test",
  work_experience: [
    {
      id: "role1",
      company: "ACME",
      role: "Engineer",
      bullets: ["Built **models** with _Python_.", "- Led a small team."]
    }
  ],
  projects: []
};

const rubric = {
  requirements: [
    { req_id: "R1", requirement: "Build production ML models", type: "must", weight: 5 },
    { req_id: "R2", requirement: "Lead engineering teams", type: "nice", weight: 2 }
  ]
};

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "embeddings-test-"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function runStage(runDir, cacheRoot) {
  return runEmbeddingStage({
    runId: path.basename(runDir),
    runDir,
    masterResume: resume,
    rubric,
    jobExtractedHash: "sha256:test",
    masterResumeHash: computeMasterResumeHash(resume),
    openaiClient: null,
    mockMode: true,
    config: {
      cacheRoot,
      embeddingModel: "text-embedding-3-large",
      embeddingDims: 8,
      preprocessVersion: "embed_text_v1"
    }
  });
}

async function main() {
  const normalized = embedTextV1("  **Bold** _text_  - bullet  ");
  assert.strictEqual(normalized, "Bold text - bullet");

  assert.strictEqual(computeCosineSimilarity([1, 0], [1, 0]), 1);
  assert.strictEqual(computeCosineSimilarity([1, 0], [-1, 0]), -1);
  assert.strictEqual(computeCosineSimilarity([1, 0], [0, 1]), 0);

  const tempRoot = makeTempDir();
  const cacheRoot = path.join(tempRoot, "cache");
  const runDir1 = path.join(tempRoot, "run1");
  fs.mkdirSync(runDir1, { recursive: true });
  const first = await runStage(runDir1, cacheRoot);

  assert.strictEqual(first.meta.embedding_dims, 8);
  assert.strictEqual(first.meta.embedding_model, "text-embedding-3-large");
  assert.strictEqual(first.meta.resume_bullet_embeddings_cache_hit, false);
  assert.ok((first.meta.resume_bullet_embeddings_compute_ms || 0) >= 0);
  assert.ok(fs.existsSync(first.meta.resume_bullet_embeddings_cache_path));
  assert.ok(fs.existsSync(path.join(runDir1, "jd_requirement_embeddings.json")));
  assert.ok(fs.existsSync(path.join(runDir1, "relevance_matrix.json")));
  assert.ok(fs.existsSync(path.join(runDir1, "relevance_summary.json")));

  const matrix = readJson(path.join(runDir1, "relevance_matrix.json"));
  assert.strictEqual(matrix.thresholds.top_k_per_requirement, 12);
  assert.strictEqual(matrix.thresholds.top_k_per_bullet, 8);

  const runDir2 = path.join(tempRoot, "run2");
  fs.mkdirSync(runDir2, { recursive: true });
  const second = await runStage(runDir2, cacheRoot);
  assert.strictEqual(second.meta.resume_bullet_embeddings_cache_hit, true);
  assert.strictEqual(second.meta.resume_bullet_embeddings_compute_ms, 0);

  console.log("Embeddings tests passed.");
}

main();
