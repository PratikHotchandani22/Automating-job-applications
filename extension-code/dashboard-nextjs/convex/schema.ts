// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────────
// SHARED VALIDATORS
// ─────────────────────────────────────────────────────────────────

const runStageValidator = v.union(
  v.literal("initialized"),
  v.literal("extracting"),
  v.literal("rubric_generating"),
  v.literal("rubric_generated"),
  v.literal("embedding_jd"),
  v.literal("selecting"),
  v.literal("selection_complete"),
  v.literal("tailoring"),
  v.literal("tailored"),
  v.literal("generating_latex"),
  v.literal("generating_pdf"),
  v.literal("DONE"),
  v.literal("ERROR")
);

const runStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("success"),
  v.literal("error")
);

const applicationStatusValidator = v.union(
  v.literal("not_applied"),
  v.literal("applied"),
  v.literal("viewed"),
  v.literal("screening"),
  v.literal("interviewing"),
  v.literal("offer"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("ghosted")
);

const artifactTypeValidator = v.union(
  v.literal("pdf"),
  v.literal("tex"),
  v.literal("json")
);

const evidenceTierValidator = v.union(
  v.literal("strong"),
  v.literal("medium"),
  v.literal("weak")
);

const parentTypeValidator = v.union(
  v.literal("experience"),
  v.literal("project"),
  v.literal("award")
);

const rewriteIntentValidator = v.union(
  v.literal("light"),
  v.literal("medium"),
  v.literal("heavy")
);

// SelectedBullet validator (reused in selectionPlans)
const selectedBulletValidator = v.object({
  bulletId: v.string(),
  parentType: parentTypeValidator,
  parentId: v.string(),
  originalText: v.string(),
  company: v.optional(v.string()),
  role: v.optional(v.string()),
  dateRange: v.optional(v.string()),
  evidence: v.object({
    score: v.number(),
    tier: evidenceTierValidator,
  }),
  matches: v.array(v.object({
    reqId: v.string(),
    rel: v.number(),
    edgeScore: v.number(),
  })),
  redundancy: v.object({
    maxSim: v.number(),
    blocked: v.boolean(),
    penalty: v.number(),
  }),
  rewriteIntent: rewriteIntentValidator,
  reasons: v.array(v.string()),
});

export default defineSchema({
  // ─────────────────────────────────────────────────────────────────
  // USER & AUTHENTICATION
  // ─────────────────────────────────────────────────────────────────
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    defaultMasterResumeId: v.optional(v.id("masterResumes")),
    settings: v.optional(v.object({
      preferredModels: v.optional(v.array(v.string())),
      embeddingModel: v.optional(v.string()),
      embeddingDims: v.optional(v.number()),
      latexTemplate: v.optional(v.string()),
      promptVersions: v.optional(v.object({
        tailor: v.optional(v.string()),
        latex: v.optional(v.string()),
        rubric: v.optional(v.string()),
      })),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  // ─────────────────────────────────────────────────────────────────
  // MASTER RESUME
  // ─────────────────────────────────────────────────────────────────
  masterResumes: defineTable({
    userId: v.id("users"),
    name: v.string(),
    contentHash: v.string(),
    isActive: v.boolean(),
    header: v.optional(v.object({
      fullName: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      github: v.optional(v.string()),
      portfolio: v.optional(v.string()),
      website: v.optional(v.string()),
    })),
    summary: v.optional(v.string()),
    skills: v.object({
      programming_languages: v.array(v.string()),
      frameworks_libraries: v.array(v.string()),
      tools_cloud_technologies: v.array(v.string()),
      data_science_analytics: v.array(v.string()),
      machine_learning_ai: v.array(v.string()),
      other_skills: v.array(v.string()),
    }),
    education: v.array(v.object({
      institution: v.string(),
      degree: v.string(),
      dates: v.string(),
      location: v.optional(v.string()),
      gpa: v.optional(v.string()),
      links: v.optional(v.array(v.string())),
    })),
    awards: v.optional(v.array(v.object({
      name: v.string(),
      issuer: v.string(),
      year: v.string(),
      details: v.optional(v.string()),
    }))),
    mentorship: v.optional(v.array(v.string())),
    links: v.optional(v.array(v.string())),
    customLatexTemplate: v.optional(v.string()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_content_hash", ["contentHash"]),

  // ─────────────────────────────────────────────────────────────────
  // RESUME BULLETS (extracted from master resume)
  // ─────────────────────────────────────────────────────────────────
  resumeBullets: defineTable({
    masterResumeId: v.id("masterResumes"),
    bulletId: v.string(),
    parentType: v.union(v.literal("experience"), v.literal("project")),
    parentId: v.string(),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    projectName: v.optional(v.string()),
    dates: v.optional(v.string()),
    location: v.optional(v.string()),
    text: v.string(),
    tags: v.optional(v.array(v.string())),
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_resume", ["masterResumeId"])
    .index("by_parent", ["masterResumeId", "parentType", "parentId"]),

  // ─────────────────────────────────────────────────────────────────
  // RESUME BULLET EMBEDDINGS (one doc per bullet - scalable design)
  // ─────────────────────────────────────────────────────────────────
  resumeBulletEmbeddings: defineTable({
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    masterResumeHash: v.string(),
    bulletId: v.string(),
    embedKeyHash: v.string(),
    embeddingModel: v.string(),
    dims: v.number(),
    embedding: v.array(v.number()),
    createdAt: v.number(),
  })
    .index("by_resume", ["masterResumeId"])
    .index("by_cache_key", ["masterResumeHash", "embedKeyHash"])
    .index("by_bullet", ["masterResumeId", "bulletId", "embedKeyHash"]),

  // ─────────────────────────────────────────────────────────────────
  // EVIDENCE SCORES (cached quality scores)
  // ─────────────────────────────────────────────────────────────────
  evidenceScores: defineTable({
    masterResumeId: v.id("masterResumes"),
    masterResumeHash: v.string(),
    rulesHash: v.string(),
    rulesVersion: v.string(),
    scores: v.array(v.object({
      bulletId: v.string(),
      score: v.number(),
      tier: evidenceTierValidator,
      breakdown: v.object({
        action: v.number(),
        tools: v.number(),
        outcome: v.number(),
        metric: v.number(),
        scope: v.number(),
      }),
      fluffPenalty: v.number(),
      matchedTools: v.array(v.string()),
      matchedVerbs: v.array(v.string()),
    })),
    cachedAt: v.number(),
  })
    .index("by_resume", ["masterResumeId"])
    .index("by_cache_key", ["masterResumeHash", "rulesHash"]),

  // ─────────────────────────────────────────────────────────────────
  // JOBS (scraped job postings)
  // ─────────────────────────────────────────────────────────────────
  jobs: defineTable({
    userId: v.id("users"),
    jobUrl: v.string(),
    platform: v.string(),
    title: v.string(),
    company: v.optional(v.string()),
    location: v.optional(v.string()),
    salary: v.optional(v.string()),
    employmentType: v.optional(v.string()),
    seniority: v.optional(v.string()),
    rawDescription: v.string(),
    extractedText: v.optional(v.string()),
    descriptionHash: v.string(),
    userTags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_url", ["jobUrl"])
    .index("by_user_recent", ["userId", "createdAt"])
    .index("by_user_hash", ["userId", "descriptionHash"]),

  // ─────────────────────────────────────────────────────────────────
  // RUNS (pipeline orchestration)
  // ─────────────────────────────────────────────────────────────────
  runs: defineTable({
    runId: v.string(),
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    jobId: v.id("jobs"),
    status: runStatusValidator,
    stage: runStageValidator,
    errorMessage: v.optional(v.string()),
    mockMode: v.optional(v.boolean()),
    promptVersions: v.optional(v.object({
      tailor: v.optional(v.string()),
      latex: v.optional(v.string()),
      rubric: v.optional(v.string()),
    })),
    promptHashes: v.optional(v.object({
      tailor: v.optional(v.string()),
      latex: v.optional(v.string()),
      rubric: v.optional(v.string()),
    })),
    modelVariants: v.optional(v.array(v.string())),
    primaryModelKey: v.optional(v.string()),
    timing: v.optional(v.object({
      rubricMs: v.optional(v.number()),
      embeddingMs: v.optional(v.number()),
      selectionMs: v.optional(v.number()),
      tailorMs: v.optional(v.number()),
      latexMs: v.optional(v.number()),
      pdfMs: v.optional(v.number()),
      totalMs: v.optional(v.number()),
    })),
    cacheHits: v.optional(v.object({
      embeddings: v.optional(v.boolean()),
      evidenceScores: v.optional(v.boolean()),
    })),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_job", ["jobId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_recent", ["userId", "createdAt"])
    .index("by_run_id", ["runId"]),

  // ─────────────────────────────────────────────────────────────────
  // JD RUBRICS (extracted requirements)
  // ─────────────────────────────────────────────────────────────────
  jdRubrics: defineTable({
    runId: v.id("runs"),
    version: v.string(),
    jobMeta: v.object({
      jobTitle: v.string(),
      company: v.optional(v.string()),
      location: v.optional(v.string()),
      employmentType: v.optional(v.string()),
      seniority: v.optional(v.string()),
      jobUrl: v.optional(v.string()),
      platform: v.optional(v.string()),
    }),
    requirements: v.array(v.object({
      reqId: v.string(),
      type: v.union(v.literal("must"), v.literal("nice")),
      weight: v.number(),
      requirement: v.string(),
      jdEvidence: v.array(v.string()),
      category: v.string(),
    })),
    keywords: v.array(v.object({
      term: v.string(),
      importance: v.number(),
      type: v.string(),
      jdEvidence: v.array(v.string()),
    })),
    constraints: v.optional(v.object({
      yearsExperienceMin: v.optional(v.number()),
      education: v.optional(v.array(v.string())),
      certifications: v.optional(v.array(v.string())),
      workAuthorization: v.optional(v.array(v.string())),
    })),
    notes: v.optional(v.object({
      summary: v.optional(v.string()),
      ambiguities: v.optional(v.array(v.string())),
    })),
    rubricHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"]),

  // ─────────────────────────────────────────────────────────────────
  // SELECTION PLANS (bullet selection results - strongly typed)
  // ─────────────────────────────────────────────────────────────────
  selectionPlans: defineTable({
    runId: v.id("runs"),
    version: v.string(),
    masterResumeHash: v.string(),
    jobExtractedHash: v.string(),
    rubricHash: v.string(),
    embeddingModel: v.string(),
    config: v.object({
      configVersion: v.string(),
      budgets: v.object({
        targetResumeWordsMin: v.number(),
        targetResumeWordsMax: v.number(),
        experienceBulletsMin: v.number(),
        experienceBulletsMax: v.number(),
        projectBulletsMin: v.number(),
        projectBulletsMax: v.number(),
        awardLinesMin: v.number(),
        awardLinesMax: v.number(),
        perRoleCaps: v.object({
          mostRecent: v.number(),
          next: v.number(),
          older: v.number(),
        }),
        maxBulletsPerRequirement: v.number(),
      }),
      thresholds: v.object({
        mustMinRel: v.number(),
        niceMinRel: v.number(),
        coverThreshold: v.number(),
        redundancy: v.object({
          hardBlock: v.number(),
          penaltyStart: v.number(),
        }),
        minEvidenceTierNice: evidenceTierValidator,
      }),
      weights: v.object({
        edge: v.object({
          wRel: v.number(),
          wEvd: v.number(),
          wRed: v.number(),
          wRisk: v.number(),
        }),
        fill: v.object({
          alpha: v.number(),
          beta: v.number(),
          gamma: v.number(),
        }),
      }),
    }),
    coverage: v.object({
      mustTotal: v.number(),
      niceTotal: v.number(),
      mustCovered: v.number(),
      niceCovered: v.number(),
      uncoveredRequirements: v.array(v.object({
        reqId: v.string(),
        type: v.union(v.literal("must"), v.literal("nice")),
        weight: v.number(),
        reason: v.string(),
      })),
    }),
    selected: v.object({
      workExperience: v.array(selectedBulletValidator),
      projects: v.array(selectedBulletValidator),
      awards: v.array(selectedBulletValidator),
    }),
    budgetsUsed: v.object({
      experienceBullets: v.number(),
      projectBullets: v.number(),
      awardLines: v.number(),
      perRole: v.record(v.string(), v.number()),
    }),
    selectionNotes: v.optional(v.object({
      droppedDueToRedundancy: v.optional(v.array(v.string())),
      droppedDueToBudget: v.optional(v.array(v.string())),
    })),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"]),

  // ─────────────────────────────────────────────────────────────────
  // TAILORED RESUMES (LLM rewritten content)
  // ─────────────────────────────────────────────────────────────────
  tailoredResumes: defineTable({
    runId: v.id("runs"),
    modelKey: v.string(),
    modelName: v.string(),
    tailoredHash: v.string(),
    summary: v.string(),
    workExperience: v.array(v.object({
      roleId: v.string(),
      company: v.string(),
      title: v.string(),
      dateRange: v.string(),
      location: v.optional(v.string()),
      bullets: v.array(v.object({
        bulletId: v.string(),
        originalText: v.string(),
        tailoredText: v.string(),
        wasRewritten: v.boolean(),
      })),
    })),
    projects: v.array(v.object({
      projectId: v.string(),
      name: v.string(),
      date: v.optional(v.string()),
      bullets: v.array(v.object({
        bulletId: v.string(),
        originalText: v.string(),
        tailoredText: v.string(),
        wasRewritten: v.boolean(),
      })),
    })),
    education: v.array(v.object({
      institution: v.string(),
      degree: v.string(),
      dates: v.string(),
      location: v.optional(v.string()),
      gpa: v.optional(v.string()),
    })),
    skills: v.object({
      programming_languages: v.array(v.string()),
      frameworks_libraries: v.array(v.string()),
      tools_cloud_technologies: v.array(v.string()),
      data_science_analytics: v.array(v.string()),
      machine_learning_ai: v.array(v.string()),
      other_skills: v.array(v.string()),
    }),
    awards: v.optional(v.array(v.object({
      name: v.string(),
      issuer: v.string(),
      year: v.string(),
      details: v.optional(v.string()),
    }))),
    selectionEnforcement: v.object({
      strippedUnselected: v.number(),
      truncatedBullets: v.number(),
      repairApplied: v.boolean(),
      compliant: v.boolean(),
      proxyWordCountExceeded: v.boolean(),
    }),
    wordCountEstimate: v.number(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_model", ["runId", "modelKey"]),

  // ─────────────────────────────────────────────────────────────────
  // GENERATED ARTIFACTS (PDFs, LaTeX files)
  // ─────────────────────────────────────────────────────────────────
  generatedArtifacts: defineTable({
    runId: v.id("runs"),
    modelKey: v.optional(v.string()),
    artifactType: artifactTypeValidator,
    fileName: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    sizeBytes: v.number(),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_type", ["runId", "artifactType"])
    .index("by_run_model", ["runId", "modelKey"]),

  // ─────────────────────────────────────────────────────────────────
  // APPLICATION TRACKING
  // ─────────────────────────────────────────────────────────────────
  applicationTracking: defineTable({
    userId: v.id("users"),
    runId: v.id("runs"),
    jobId: v.id("jobs"),
    applicationStatus: applicationStatusValidator,
    appliedAt: v.optional(v.number()),
    responseReceivedAt: v.optional(v.number()),
    interviewScheduledAt: v.optional(v.number()),
    offerReceivedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    nextActionDue: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_run", ["runId"])
    .index("by_user_status", ["userId", "applicationStatus"])
    .index("by_user_recent", ["userId", "updatedAt"]),
});

