import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { buildRubricPayload, normalizeRubricOutput, runRubricExtraction, validateRubric } from "../server.js";

const jobPayload = {
  job: {
    title: "Data Scientist",
    company: "ExampleCorp",
    location: "Remote",
    description_text: "We need a data scientist with Python and cloud skills."
  },
  meta: { platform: "test", url: "http://example.com", confidence: 0.8 }
};

const baseRubric = {
  version: "jd_rubric_v1",
  job_meta: {
    job_title: "Data Scientist",
    company: "ExampleCorp",
    location: "Remote",
    employment_type: "",
    seniority: "",
    job_url: "",
    platform: "test"
  },
  requirements: Array.from({ length: 12 }, (_, idx) => ({
    req_id: `R${idx + 1}`,
    type: idx % 2 === 0 ? "must" : "nice",
    weight: 3,
    requirement: `Requirement ${idx + 1}`,
    jd_evidence: ["short evidence snippet"],
    category: "other"
  })),
  keywords: Array.from({ length: 10 }, (_, idx) => ({
    term: `Keyword ${idx + 1}`,
    importance: 3,
    type: "tool",
    jd_evidence: ["keyword evidence"]
  })),
  constraints: { years_experience_min: null, education: [], certifications: [], work_authorization: [] },
  notes: { summary: "Summary", ambiguities: [] }
};

const invalid = validateRubric({ ...baseRubric, extra: true });
assert.ok(!invalid.valid && invalid.errors.some((e) => e.includes("Unexpected top-level key")), "Extra keys should fail validation");

const noisyRubric = {
  ...baseRubric,
  requirements: Array.from({ length: 22 }, (_, idx) => ({
    req_id: `R${idx + 1}`,
    type: idx % 2 === 0 ? "must" : "nice",
    weight: (idx % 5) + 1,
    requirement: `Requirement ${idx + 1} about Python and SQL ${idx % 4 === 0 ? "Python" : ""}`,
    jd_evidence: ["this evidence string should be trimmed to the word limit for requirements which is more than twenty words long right now"],
    category: idx % 3 === 0 ? "data" : "other"
  })),
  keywords: Array.from({ length: 25 }, (_, idx) => ({
    term: `Keyword ${idx + 1}`,
    importance: (idx % 5) + 1,
    type: "tool",
    jd_evidence: ["this keyword evidence should truncate beyond the allowed words for keywords which is twelve maximum"]
  }))
};

const normalized = normalizeRubricOutput(noisyRubric, jobPayload);
assert.strictEqual(normalized.requirements.length, 20, "Requirements should trim to max 20");
assert.ok(normalized.requirements.every((req, idx) => req.req_id === `R${idx + 1}`), "Requirement IDs should be renumbered");
assert.ok(
  normalized.requirements.every((req) => req.jd_evidence.every((ev) => ev.split(/\s+/).length <= 20)),
  "Requirement evidence should respect word limit"
);
assert.ok(
  normalized.keywords.every((kw) => kw.jd_evidence.every((ev) => ev.split(/\s+/).length <= 12)),
  "Keyword evidence should respect word limit"
);

const payload = buildRubricPayload(jobPayload, jobPayload.job.description_text, "latest_v1");
assert.ok(payload.raw_text_hash.startsWith("sha256:"), "Raw text hash should be prefixed");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rubric-run-"));
const rubricRun = await runRubricExtraction({
  jobPayload,
  jobText: "Python SQL AWS cloud security leadership product sense analytics pipelines data mining",
  runDir: tmpDir,
  appendLog: () => {},
  forceMock: true
});
assert.ok(fs.existsSync(path.join(tmpDir, "jd_rubric.json")), "Artifact should be written in mock mode");
assert.ok(rubricRun.requirements.length >= 12, "Mock rubric should include requirements");

let emptyFailed = false;
try {
  await runRubricExtraction({
    jobPayload,
    jobText: "",
    runDir: fs.mkdtempSync(path.join(os.tmpdir(), "rubric-empty-")),
    appendLog: () => {},
    forceMock: false,
    forceRealModel: true,
    mockModelResponse: "{}"
  });
} catch (error) {
  emptyFailed = true;
  assert.strictEqual(error.stage, "rubric", "Empty JD should surface rubric stage error");
}
assert.ok(emptyFailed, "Empty JD should fail rubric extraction");

console.log("Rubric schema and normalization tests passed.");
