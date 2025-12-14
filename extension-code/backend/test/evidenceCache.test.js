import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import {
  canonicalJsonStringify,
  computeMasterResumeHash,
  readCachedEvidenceScores,
  sha256File,
  sha256String,
  validateEvidenceScoresJson,
  writeCachedEvidenceScores
} from "../scoring/evidenceCache.js";

function buildArtifact({ runId, rulesHash, resumeHash }) {
  return {
    run_id: runId,
    generated_at: new Date().toISOString(),
    rules_version: "v1",
    rules_hash: rulesHash,
    rules_path: "/tmp/rules.json",
    resume_hash: resumeHash,
    tool_lexicon_size: 1,
    summary: {
      count: 1,
      strong: 1,
      medium: 0,
      weak: 0,
      min: 0.9,
      max: 0.9,
      mean: 0.9,
      top: [],
      bottom: []
    },
    bullets: [
      {
        bullet_id: "b1",
        parent_type: "experience",
        parent_id: "exp1",
        text: "Built something useful",
        evidence_score: 0.9,
        tier: "strong",
        features: {},
        reasons: []
      }
    ]
  };
}

function testStableHashing() {
  const resumeA = {
    work_experience: [
      { id: "r1", bullets: ["Did a thing"], metadata: { created_at: "yesterday" } }
    ],
    projects: []
  };
  const resumeB = {
    projects: [],
    work_experience: [
      { metadata: { created_at: "yesterday" }, bullets: ["Did a thing"], id: "r1" }
    ]
  };

  const canonicalA = canonicalJsonStringify(resumeA);
  const canonicalB = canonicalJsonStringify(resumeB);
  assert.strictEqual(canonicalA, canonicalB, "Canonical JSON should be stable across key order");

  const hashA = computeMasterResumeHash(resumeA);
  const hashB = computeMasterResumeHash(resumeB);
  assert.strictEqual(hashA, hashB, "Resume hash should ignore key order and ephemeral fields");

  const tmpFile = path.join(os.tmpdir(), `hash-check-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, "hello hash", "utf8");
  assert.strictEqual(
    sha256File(tmpFile),
    sha256String("hello hash"),
    "sha256File should hash file contents"
  );
  fs.unlinkSync(tmpFile);
}

async function testCacheHitMiss() {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-cache-"));
  const resumeHash = "resume123";
  const rulesHash = "rules456";
  const artifact = buildArtifact({ runId: "runA", rulesHash, resumeHash });

  const miss = await readCachedEvidenceScores({ resumeHash, rulesHash, cacheRoot });
  assert.strictEqual(miss.data, null, "First read should miss");
  assert.strictEqual(miss.reason, "missing");

  const validation = validateEvidenceScoresJson(artifact);
  assert.ok(validation.valid, "Fixture artifact should validate");

  await writeCachedEvidenceScores({ resumeHash, rulesHash, cacheRoot, data: artifact });

  const hit = await readCachedEvidenceScores({ resumeHash, rulesHash, cacheRoot });
  assert.ok(hit.data, "Cache hit should return data");
  assert.strictEqual(hit.data.bullets.length, 1, "Cached bullets should be preserved");

  fs.writeFileSync(hit.cachePath, "{not json", "utf8");
  const corrupt = await readCachedEvidenceScores({ resumeHash, rulesHash, cacheRoot });
  assert.strictEqual(corrupt.data, null, "Corrupt cache should be ignored");
  assert.strictEqual(corrupt.reason, "corrupt");

  fs.writeFileSync(hit.cachePath, JSON.stringify({ foo: "bar" }), "utf8");
  const invalid = await readCachedEvidenceScores({ resumeHash, rulesHash, cacheRoot });
  assert.strictEqual(invalid.data, null, "Invalid cache should be ignored");
  assert.strictEqual(invalid.reason, "invalid");

  fs.rmSync(cacheRoot, { recursive: true, force: true });
}

testStableHashing();
await testCacheHitMiss();
console.log("Evidence cache tests passed.");
