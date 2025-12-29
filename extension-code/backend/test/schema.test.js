import assert from "assert";
import { normalizeTailoredOutput, validateTailored } from "../server.js";

const masterResume = {
  id: "default",
  summary: "Seasoned engineer.",
  skills: {
    programming_languages: ["Python"],
    data_science_analytics: ["SQL"],
    machine_learning_ai: ["ML"],
    frameworks_libraries: ["React"],
    tools_cloud_technologies: ["AWS"]
  },
  work_experience: [
    {
      id: "role_1",
      company: "ACME",
      role: "Software Engineer",
      dates: "2020-2022",
      location: "Remote",
      bullets: ["Built systems with Python"]
    }
  ],
  projects: [
    {
      id: "project_1",
      name: "Project One",
      dates: "2023",
      tags: ["Python"],
      links: ["", ""],
      bullets: ["Created analytics pipeline"]
    }
  ],
  awards: []
};

const finalResume = {
  summary: "Seasoned engineer.",
  skills: {
    programming_languages: ["Python"],
    data_science_analytics: ["SQL"],
    machine_learning_ai: ["ML"],
    frameworks_libraries: ["React"],
    tools_cloud_technologies: ["AWS"]
  },
  work_experience: [
    {
      id: "role_1",
      company: "ACME",
      role: "Software Engineer",
      dates: "2020-2022",
      location: "Remote",
      bullets: ["Built systems with Python"]
    }
  ],
  projects: [
    {
      id: "project_1",
      name: "Project One",
      date: "2023",
      keywords: ["Python"],
      links: { github: "", webapp: "" },
      bullets: ["Created analytics pipeline"]
    }
  ],
  awards: []
};

const jobPayload = {
  job: {
    title: "Software Engineer",
    company: "ACME",
    location: "Remote",
    description_text: "We need a software engineer who can build systems with Python.",
    source_platform: "test"
  },
  meta: { platform: "test", url: "http://example.com", confidence: 0.6 }
};

const baseTailored = {
  version: "latest_v3",
  job: {
    title: "Software Engineer",
    company: "ACME",
    location: "Remote",
    location_hint: "Remote",
    job_url: "http://example.com",
    source_platform: "test",
    confidence: 0.6,
    raw_job_text_hash: "hash",
    extracted_preview: "Preview of the job"
  },
  jd_rubric: {
    top_keywords: ["Python"],
    requirements: [{ req_id: "req_1", type: "must", weight: 1, text: "Build systems with Python", jd_snippet: "build systems" }]
  },
  evidence_index: [
    {
      bullet_id: "role_1_b1",
      parent_type: "experience",
      parent_id: "role_1",
      original_text: "Built systems with Python",
      detected_skills_tools: ["Python"],
      has_metric: false
    }
  ],
  mapping: {
    requirement_to_evidence: [
      { req_id: "req_1", missing_in_resume: false, evidence: [{ bullet_id: "role_1_b1", match_type: "direct" }] }
    ],
    bullet_to_requirements: [{ bullet_id: "role_1_b1", req_ids: ["req_1"], match_type: "direct" }]
  },
  changes: {
    experience: [
      {
        role_id: "role_1",
        updated_bullets: [
          { bullet_id: "role_1_b1", before_text: "Built systems with Python", after_text: "Built systems with Python and automation focus" }
        ]
      }
    ],
    projects: [],
    keyword_insertions: [{ bullet_id: "role_1_b1", keywords: ["Python"] }]
  },
  final_resume: finalResume,
  diagnostics: { match_score_before: 0.2, match_score_after: 0.8, weak_bullets: [], missing_skills_list: [] },
  guardrail_report: { unsupported_claims: [], new_entities: [], hallucinations: [], safety_warnings: [] }
};

const normalized = normalizeTailoredOutput(baseTailored, jobPayload, masterResume, "latest_v3");
const result = validateTailored(normalized, "latest_v3");
assert.ok(result.valid, `v3 schema should validate: ${result.errors?.join(", ")}`);

const guardrail = normalizeTailoredOutput(
  {
    ...baseTailored,
    guardrail_report: { ...baseTailored.guardrail_report, new_entities: ["new entity"] }
  },
  jobPayload,
  masterResume,
  "latest_v3"
);
const guardrailResult = validateTailored(guardrail, "latest_v3");
assert.ok(!guardrailResult.valid, "Guardrail violations should fail validation");

console.log("Schema v3 validation smoke tests passed.");
