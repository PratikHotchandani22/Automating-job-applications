import assert from "assert";
import { enforceSelectionPlanCompliance, validateTailored } from "../server.js";

const masterResume = {
  id: "default",
  summary: "Engineer with backend focus.",
  skills: {
    programming_languages: ["Python", "Go"],
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
      bullets: ["Built scalable systems", "Improved latency by 20%"]
    }
  ],
  projects: [],
  awards: []
};

const selectionPlan = {
  version: "selection_plan_v1",
  selected: {
    work_experience: [
      {
        role_id: "role_1",
        company: "ACME",
        title: "Software Engineer",
        date_range: "2020-2022",
        bullets: [
          { bullet_id: "role_1_b1", parent_type: "experience", parent_id: "role_1", original_text: "Built scalable systems" },
          { bullet_id: "role_1_b2", parent_type: "experience", parent_id: "role_1", original_text: "Improved latency by 20%" }
        ]
      }
    ],
    projects: [],
    awards: []
  },
  selection_notes: {
    dropped_due_to_budget: ["role_legacy_drop"],
    dropped_due_to_redundancy: []
  },
  config: {
    budgets: {
      experience_bullets_max: 2,
      project_bullets_max: 0,
      target_resume_words_max: 150
    }
  }
};

const tailorInput = {
  version: "latest_v4_selection",
  job: {
    title: "Backend Engineer",
    company: "ACME",
    location: "Remote",
    location_hint: "Remote",
    job_url: "http://example.com",
    source_platform: "test",
    confidence: 0.9,
    raw_job_text_hash: "sha256:abc",
    extracted_preview: "Build systems",
    role_hint: "Engineer",
    employment_type: "full-time",
    seniority: "mid"
  },
  jd_rubric: {
    top_keywords: ["backend"],
    requirements: [{ req_id: "R1", type: "must", weight: 5, text: "Backend systems", jd_snippet: "backend systems" }]
  },
  evidence_index: [],
  mapping: {
    requirement_to_evidence: [
      {
        req_id: "R1",
        missing_in_resume: false,
        evidence: [
          { bullet_id: "role_1_b1", match_type: "direct" },
          { bullet_id: "extra_bullet", match_type: "direct" }
        ]
      }
    ],
    bullet_to_requirements: [
      { bullet_id: "role_1_b1", req_ids: ["R1"], match_type: "direct" },
      { bullet_id: "extra_bullet", req_ids: ["R1"], match_type: "direct" }
    ]
  },
  changes: {
    experience: [
      {
        role_id: "role_1",
        updated_bullets: [
          { bullet_id: "role_1_b1", before_text: "Built scalable systems", after_text: "Built scalable backend systems in Python" },
          { bullet_id: "extra_bullet", before_text: "", after_text: "Invented new product" }
        ]
      }
    ],
    projects: [],
    keyword_insertions: [{ bullet_id: "role_1_b1", keywords: ["backend"] }]
  },
  final_resume: {
    summary: "Backend engineer",
    skills: {
      programming_languages: ["Python", "Go"],
      data_analysis_statistics: ["SQL"],
      machine_learning: ["ML"],
      data_viz_engineering: ["React"],
      big_data_software: ["AWS"]
    },
    work_experience: [
      {
        id: "role_1",
        company: "ACME",
        role: "Software Engineer",
        dates: "2020-2022",
        location: "Remote",
        bullets: ["Built scalable backend systems in Python", "Invented new product"]
      }
    ],
    projects: [],
    awards: []
  },
  diagnostics: { match_score_before: 0.1, match_score_after: 0.9, weak_bullets: [], missing_skills_list: [] },
  guardrail_report: { unsupported_claims: [], new_entities: [], hallucinations: [], safety_warnings: [] }
};

const result = enforceSelectionPlanCompliance(tailorInput, selectionPlan, masterResume, masterResume, {
  jdRubric: tailorInput.jd_rubric
});

const validation = validateTailored(result.output, "latest_v4_selection");
assert.ok(validation.valid, `Enforced output should validate v4 schema: ${validation.errors?.join(", ")}`);
const enforcedBullets = result.output.changes.experience[0].updated_bullets.map((b) => b.bullet_id);
assert.deepStrictEqual(
  new Set(enforcedBullets),
  new Set(["role_1_b1", "role_1_b2"]),
  "Enforcement should include only selection plan bullet_ids"
);
assert.ok(result.meta.stripped_unselected >= 1, "Unselected bullets should be stripped and counted");
assert.strictEqual(result.output.explainability.dropped_bullets[0].bullet_id, "role_legacy_drop");
assert.ok(result.output.explainability.selection_plan_ref.hash.startsWith("sha256:"), "Hash should be recorded");

console.log("Tailor selection enforcement tests passed.");
