"use strict";
// convex/schema.ts
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("convex/server");
const values_1 = require("convex/values");
// ─────────────────────────────────────────────────────────────────
// SHARED VALIDATORS
// ─────────────────────────────────────────────────────────────────
const runStageValidator = values_1.v.union(values_1.v.literal("queued"), values_1.v.literal("analyzing"), values_1.v.literal("initialized"), values_1.v.literal("extracting"), values_1.v.literal("rubric_generating"), values_1.v.literal("rubric_generated"), values_1.v.literal("embedding_jd"), values_1.v.literal("selecting"), values_1.v.literal("selection_complete"), values_1.v.literal("tailoring"), values_1.v.literal("tailored"), values_1.v.literal("generating_latex"), values_1.v.literal("generating_pdf"), values_1.v.literal("DONE"), values_1.v.literal("ERROR"));
const runStatusValidator = values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("running"), values_1.v.literal("success"), values_1.v.literal("error"));
const applicationStatusValidator = values_1.v.union(values_1.v.literal("not_applied"), values_1.v.literal("applied"), values_1.v.literal("viewed"), values_1.v.literal("screening"), values_1.v.literal("interviewing"), values_1.v.literal("offer"), values_1.v.literal("accepted"), values_1.v.literal("rejected"), values_1.v.literal("withdrawn"), values_1.v.literal("ghosted"));
const artifactTypeValidator = values_1.v.union(values_1.v.literal("pdf"), values_1.v.literal("tex"), values_1.v.literal("json"));
const evidenceTierValidator = values_1.v.union(values_1.v.literal("strong"), values_1.v.literal("medium"), values_1.v.literal("weak"));
const parentTypeValidator = values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project"), values_1.v.literal("award"));
const rewriteIntentValidator = values_1.v.union(values_1.v.literal("light"), values_1.v.literal("medium"), values_1.v.literal("heavy"));
// SelectedBullet validator (reused in selectionPlans)
const selectedBulletValidator = values_1.v.object({
    bulletId: values_1.v.string(),
    parentType: parentTypeValidator,
    parentId: values_1.v.string(),
    originalText: values_1.v.string(),
    company: values_1.v.optional(values_1.v.string()),
    role: values_1.v.optional(values_1.v.string()),
    dateRange: values_1.v.optional(values_1.v.string()),
    evidence: values_1.v.object({
        score: values_1.v.number(),
        tier: evidenceTierValidator,
    }),
    matches: values_1.v.array(values_1.v.object({
        reqId: values_1.v.string(),
        rel: values_1.v.number(),
        edgeScore: values_1.v.number(),
    })),
    redundancy: values_1.v.object({
        maxSim: values_1.v.number(),
        blocked: values_1.v.boolean(),
        penalty: values_1.v.number(),
    }),
    rewriteIntent: rewriteIntentValidator,
    reasons: values_1.v.array(values_1.v.string()),
});
exports.default = (0, server_1.defineSchema)({
    // ─────────────────────────────────────────────────────────────────
    // USER & AUTHENTICATION
    // ─────────────────────────────────────────────────────────────────
    users: (0, server_1.defineTable)({
        clerkId: values_1.v.string(),
        email: values_1.v.string(),
        fullName: values_1.v.optional(values_1.v.string()),
        avatarUrl: values_1.v.optional(values_1.v.string()),
        defaultMasterResumeId: values_1.v.optional(values_1.v.id("masterResumes")),
        settings: values_1.v.optional(values_1.v.object({
            preferredModels: values_1.v.optional(values_1.v.array(values_1.v.string())),
            embeddingModel: values_1.v.optional(values_1.v.string()),
            embeddingDims: values_1.v.optional(values_1.v.number()),
            latexTemplate: values_1.v.optional(values_1.v.string()),
            promptVersions: values_1.v.optional(values_1.v.object({
                tailor: values_1.v.optional(values_1.v.string()),
                latex: values_1.v.optional(values_1.v.string()),
                rubric: values_1.v.optional(values_1.v.string()),
            })),
        })),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
    })
        .index("by_clerk_id", ["clerkId"])
        .index("by_email", ["email"]),
    // ─────────────────────────────────────────────────────────────────
    // MASTER RESUME
    // ─────────────────────────────────────────────────────────────────
    masterResumes: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        name: values_1.v.string(),
        contentHash: values_1.v.string(),
        isActive: values_1.v.boolean(),
        header: values_1.v.optional(values_1.v.object({
            fullName: values_1.v.optional(values_1.v.string()),
            email: values_1.v.optional(values_1.v.string()),
            phone: values_1.v.optional(values_1.v.string()),
            address: values_1.v.optional(values_1.v.string()),
            linkedin: values_1.v.optional(values_1.v.string()),
            github: values_1.v.optional(values_1.v.string()),
            portfolio: values_1.v.optional(values_1.v.string()),
            website: values_1.v.optional(values_1.v.string()),
        })),
        summary: values_1.v.optional(values_1.v.string()),
        skills: values_1.v.record(values_1.v.string(), values_1.v.array(values_1.v.string())),
        education: values_1.v.array(values_1.v.object({
            institution: values_1.v.string(),
            degree: values_1.v.string(),
            dates: values_1.v.string(),
            location: values_1.v.optional(values_1.v.string()),
            gpa: values_1.v.optional(values_1.v.string()),
            links: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        awards: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            issuer: values_1.v.string(),
            year: values_1.v.string(),
            details: values_1.v.optional(values_1.v.string()),
        }))),
        mentorship: values_1.v.optional(values_1.v.array(values_1.v.string())),
        links: values_1.v.optional(values_1.v.union(values_1.v.array(values_1.v.string()), values_1.v.object({
            headerLinks: values_1.v.object({
                linkedin: values_1.v.optional(values_1.v.string()),
                github: values_1.v.optional(values_1.v.string()),
                portfolio: values_1.v.optional(values_1.v.string()),
                other: values_1.v.optional(values_1.v.array(values_1.v.string())),
            }),
            projectLinks: values_1.v.array(values_1.v.object({
                projectName: values_1.v.string(),
                links: values_1.v.array(values_1.v.string()),
            })),
            allLinks: values_1.v.array(values_1.v.string()),
        }))),
        processingStatus: values_1.v.optional(values_1.v.string()),
        processingError: values_1.v.optional(values_1.v.string()),
        customLatexTemplate: values_1.v.optional(values_1.v.string()),
        isDeleted: values_1.v.optional(values_1.v.boolean()),
        deletedAt: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_user_active", ["userId", "isActive"])
        .index("by_content_hash", ["contentHash"]),
    // ─────────────────────────────────────────────────────────────────
    // RESUME BULLETS (extracted from master resume)
    // ─────────────────────────────────────────────────────────────────
    resumeBullets: (0, server_1.defineTable)({
        masterResumeId: values_1.v.id("masterResumes"),
        bulletId: values_1.v.string(),
        parentType: values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project")),
        parentId: values_1.v.string(),
        company: values_1.v.optional(values_1.v.string()),
        role: values_1.v.optional(values_1.v.string()),
        projectName: values_1.v.optional(values_1.v.string()),
        dates: values_1.v.optional(values_1.v.string()),
        location: values_1.v.optional(values_1.v.string()),
        text: values_1.v.string(),
        tags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        links: values_1.v.optional(values_1.v.array(values_1.v.string())),
        order: values_1.v.number(),
        createdAt: values_1.v.number(),
    })
        .index("by_resume", ["masterResumeId"])
        .index("by_parent", ["masterResumeId", "parentType", "parentId"]),
    // ─────────────────────────────────────────────────────────────────
    // RESUME BULLET EMBEDDINGS (one doc per bullet - scalable design)
    // ─────────────────────────────────────────────────────────────────
    resumeBulletEmbeddings: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        masterResumeId: values_1.v.id("masterResumes"),
        masterResumeHash: values_1.v.string(),
        bulletId: values_1.v.string(),
        embedKeyHash: values_1.v.string(),
        embeddingModel: values_1.v.string(),
        dims: values_1.v.number(),
        embedding: values_1.v.array(values_1.v.number()),
        createdAt: values_1.v.number(),
    })
        .index("by_resume", ["masterResumeId"])
        .index("by_cache_key", ["masterResumeHash", "embedKeyHash"])
        .index("by_bullet", ["masterResumeId", "bulletId", "embedKeyHash"]),
    // ─────────────────────────────────────────────────────────────────
    // EVIDENCE SCORES (cached quality scores)
    // ─────────────────────────────────────────────────────────────────
    evidenceScores: (0, server_1.defineTable)({
        masterResumeId: values_1.v.id("masterResumes"),
        masterResumeHash: values_1.v.string(),
        rulesHash: values_1.v.string(),
        rulesVersion: values_1.v.string(),
        scores: values_1.v.array(values_1.v.object({
            bulletId: values_1.v.string(),
            score: values_1.v.number(),
            tier: evidenceTierValidator,
            breakdown: values_1.v.object({
                action: values_1.v.number(),
                tools: values_1.v.number(),
                outcome: values_1.v.number(),
                metric: values_1.v.number(),
                scope: values_1.v.number(),
            }),
            fluffPenalty: values_1.v.number(),
            matchedTools: values_1.v.array(values_1.v.string()),
            matchedVerbs: values_1.v.array(values_1.v.string()),
        })),
        cachedAt: values_1.v.number(),
    })
        .index("by_resume", ["masterResumeId"])
        .index("by_cache_key", ["masterResumeHash", "rulesHash"]),
    // ─────────────────────────────────────────────────────────────────
    // JOBS (scraped job postings)
    // ─────────────────────────────────────────────────────────────────
    jobs: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        jobUrl: values_1.v.string(),
        platform: values_1.v.string(),
        title: values_1.v.string(),
        company: values_1.v.optional(values_1.v.string()),
        location: values_1.v.optional(values_1.v.string()),
        salary: values_1.v.optional(values_1.v.string()),
        employmentType: values_1.v.optional(values_1.v.string()),
        seniority: values_1.v.optional(values_1.v.string()),
        rawDescription: values_1.v.string(),
        extractedText: values_1.v.optional(values_1.v.string()),
        structuredDescription: values_1.v.optional(values_1.v.array(values_1.v.object({
            title: values_1.v.string(),
            content: values_1.v.string(),
        }))),
        descriptionHash: values_1.v.string(),
        userTags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        notes: values_1.v.optional(values_1.v.string()),
        isFavorite: values_1.v.optional(values_1.v.boolean()),
        isDeleted: values_1.v.optional(values_1.v.boolean()),
        deletedAt: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_url", ["jobUrl"])
        .index("by_user_recent", ["userId", "createdAt"])
        .index("by_user_hash", ["userId", "descriptionHash"]),
    // ─────────────────────────────────────────────────────────────────
    // RUNS (pipeline orchestration)
    // ─────────────────────────────────────────────────────────────────
    runs: (0, server_1.defineTable)({
        runId: values_1.v.string(),
        userId: values_1.v.id("users"),
        masterResumeId: values_1.v.id("masterResumes"),
        jobId: values_1.v.id("jobs"),
        runStrategy: values_1.v.optional(values_1.v.union(values_1.v.literal("free"), values_1.v.literal("premium"))),
        status: runStatusValidator,
        stage: runStageValidator,
        errorMessage: values_1.v.optional(values_1.v.string()),
        mockMode: values_1.v.optional(values_1.v.boolean()),
        promptVersions: values_1.v.optional(values_1.v.object({
            tailor: values_1.v.optional(values_1.v.string()),
            latex: values_1.v.optional(values_1.v.string()),
            rubric: values_1.v.optional(values_1.v.string()),
        })),
        promptHashes: values_1.v.optional(values_1.v.object({
            tailor: values_1.v.optional(values_1.v.string()),
            latex: values_1.v.optional(values_1.v.string()),
            rubric: values_1.v.optional(values_1.v.string()),
        })),
        modelVariants: values_1.v.optional(values_1.v.array(values_1.v.string())),
        primaryModelKey: values_1.v.optional(values_1.v.string()),
        timing: values_1.v.optional(values_1.v.object({
            rubricMs: values_1.v.optional(values_1.v.number()),
            embeddingMs: values_1.v.optional(values_1.v.number()),
            selectionMs: values_1.v.optional(values_1.v.number()),
            tailorMs: values_1.v.optional(values_1.v.number()),
            latexMs: values_1.v.optional(values_1.v.number()),
            pdfMs: values_1.v.optional(values_1.v.number()),
            totalMs: values_1.v.optional(values_1.v.number()),
        })),
        cacheHits: values_1.v.optional(values_1.v.object({
            embeddings: values_1.v.optional(values_1.v.boolean()),
            evidenceScores: values_1.v.optional(values_1.v.boolean()),
        })),
        startedAt: values_1.v.optional(values_1.v.number()),
        completedAt: values_1.v.optional(values_1.v.number()),
        isDeleted: values_1.v.optional(values_1.v.boolean()),
        deletedAt: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_job", ["jobId"])
        .index("by_user_status", ["userId", "status"])
        .index("by_user_recent", ["userId", "createdAt"])
        .index("by_run_id", ["runId"]),
    // ─────────────────────────────────────────────────────────────────
    // JD RUBRICS (extracted requirements)
    // ─────────────────────────────────────────────────────────────────
    jdRubrics: (0, server_1.defineTable)({
        runId: values_1.v.id("runs"),
        version: values_1.v.string(),
        jobMeta: values_1.v.object({
            jobTitle: values_1.v.string(),
            company: values_1.v.optional(values_1.v.string()),
            location: values_1.v.optional(values_1.v.string()),
            employmentType: values_1.v.optional(values_1.v.string()),
            seniority: values_1.v.optional(values_1.v.string()),
            jobUrl: values_1.v.optional(values_1.v.string()),
            platform: values_1.v.optional(values_1.v.string()),
        }),
        requirements: values_1.v.array(values_1.v.object({
            reqId: values_1.v.string(),
            type: values_1.v.union(values_1.v.literal("must"), values_1.v.literal("nice")),
            weight: values_1.v.number(),
            requirement: values_1.v.string(),
            jdEvidence: values_1.v.array(values_1.v.string()),
            category: values_1.v.string(),
        })),
        keywords: values_1.v.array(values_1.v.object({
            term: values_1.v.string(),
            importance: values_1.v.number(),
            type: values_1.v.string(),
            jdEvidence: values_1.v.array(values_1.v.string()),
        })),
        constraints: values_1.v.optional(values_1.v.object({
            yearsExperienceMin: values_1.v.optional(values_1.v.number()),
            education: values_1.v.optional(values_1.v.array(values_1.v.string())),
            certifications: values_1.v.optional(values_1.v.array(values_1.v.string())),
            workAuthorization: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        notes: values_1.v.optional(values_1.v.object({
            summary: values_1.v.optional(values_1.v.string()),
            ambiguities: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        rubricHash: values_1.v.string(),
        createdAt: values_1.v.number(),
    })
        .index("by_run", ["runId"]),
    // ─────────────────────────────────────────────────────────────────
    // SELECTION PLANS (bullet selection results - strongly typed)
    // ─────────────────────────────────────────────────────────────────
    selectionPlans: (0, server_1.defineTable)({
        runId: values_1.v.id("runs"),
        version: values_1.v.string(),
        masterResumeHash: values_1.v.string(),
        jobExtractedHash: values_1.v.string(),
        rubricHash: values_1.v.string(),
        embeddingModel: values_1.v.string(),
        config: values_1.v.object({
            configVersion: values_1.v.string(),
            budgets: values_1.v.object({
                targetResumeWordsMin: values_1.v.number(),
                targetResumeWordsMax: values_1.v.number(),
                experienceBulletsMin: values_1.v.number(),
                experienceBulletsMax: values_1.v.number(),
                projectBulletsMin: values_1.v.number(),
                projectBulletsMax: values_1.v.number(),
                awardLinesMin: values_1.v.number(),
                awardLinesMax: values_1.v.number(),
                perRoleCaps: values_1.v.object({
                    mostRecent: values_1.v.number(),
                    next: values_1.v.number(),
                    older: values_1.v.number(),
                }),
                maxBulletsPerRequirement: values_1.v.number(),
            }),
            thresholds: values_1.v.object({
                mustMinRel: values_1.v.number(),
                niceMinRel: values_1.v.number(),
                coverThreshold: values_1.v.number(),
                redundancy: values_1.v.object({
                    hardBlock: values_1.v.number(),
                    penaltyStart: values_1.v.number(),
                }),
                minEvidenceTierNice: evidenceTierValidator,
            }),
            weights: values_1.v.object({
                edge: values_1.v.object({
                    wRel: values_1.v.number(),
                    wEvd: values_1.v.number(),
                    wRed: values_1.v.number(),
                    wRisk: values_1.v.number(),
                }),
                fill: values_1.v.object({
                    alpha: values_1.v.number(),
                    beta: values_1.v.number(),
                    gamma: values_1.v.number(),
                }),
            }),
        }),
        coverage: values_1.v.object({
            mustTotal: values_1.v.number(),
            niceTotal: values_1.v.number(),
            mustCovered: values_1.v.number(),
            niceCovered: values_1.v.number(),
            uncoveredRequirements: values_1.v.array(values_1.v.object({
                reqId: values_1.v.string(),
                type: values_1.v.union(values_1.v.literal("must"), values_1.v.literal("nice")),
                weight: values_1.v.number(),
                reason: values_1.v.string(),
            })),
        }),
        selected: values_1.v.object({
            workExperience: values_1.v.array(selectedBulletValidator),
            projects: values_1.v.array(selectedBulletValidator),
            awards: values_1.v.array(selectedBulletValidator),
        }),
        budgetsUsed: values_1.v.object({
            experienceBullets: values_1.v.number(),
            projectBullets: values_1.v.number(),
            awardLines: values_1.v.number(),
            perRole: values_1.v.record(values_1.v.string(), values_1.v.number()),
        }),
        selectionNotes: values_1.v.optional(values_1.v.object({
            droppedDueToRedundancy: values_1.v.optional(values_1.v.array(values_1.v.string())),
            droppedDueToBudget: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        createdAt: values_1.v.number(),
    })
        .index("by_run", ["runId"]),
    // ─────────────────────────────────────────────────────────────────
    // TAILORED RESUMES (LLM rewritten content)
    // ─────────────────────────────────────────────────────────────────
    tailoredResumes: (0, server_1.defineTable)({
        runId: values_1.v.id("runs"),
        modelKey: values_1.v.string(),
        modelName: values_1.v.string(),
        tailoredHash: values_1.v.string(),
        summary: values_1.v.string(),
        coverLetter: values_1.v.optional(values_1.v.string()),
        diagnostics: values_1.v.optional(values_1.v.string()),
        reasoningSummary: values_1.v.optional(values_1.v.string()),
        workExperience: values_1.v.array(values_1.v.object({
            roleId: values_1.v.string(),
            company: values_1.v.string(),
            title: values_1.v.string(),
            dateRange: values_1.v.string(),
            location: values_1.v.optional(values_1.v.string()),
            bullets: values_1.v.array(values_1.v.object({
                bulletId: values_1.v.string(),
                originalText: values_1.v.string(),
                tailoredText: values_1.v.string(),
                wasRewritten: values_1.v.boolean(),
            })),
        })),
        projects: values_1.v.array(values_1.v.object({
            projectId: values_1.v.string(),
            name: values_1.v.string(),
            date: values_1.v.optional(values_1.v.string()),
            links: values_1.v.optional(values_1.v.array(values_1.v.string())),
            bullets: values_1.v.array(values_1.v.object({
                bulletId: values_1.v.string(),
                originalText: values_1.v.string(),
                tailoredText: values_1.v.string(),
                wasRewritten: values_1.v.boolean(),
            })),
        })),
        education: values_1.v.array(values_1.v.object({
            institution: values_1.v.string(),
            degree: values_1.v.string(),
            dates: values_1.v.string(),
            location: values_1.v.optional(values_1.v.string()),
            gpa: values_1.v.optional(values_1.v.string()),
        })),
        skills: values_1.v.record(values_1.v.string(), values_1.v.array(values_1.v.string())),
        awards: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            issuer: values_1.v.string(),
            year: values_1.v.string(),
            details: values_1.v.optional(values_1.v.string()),
        }))),
        selectionEnforcement: values_1.v.object({
            strippedUnselected: values_1.v.number(),
            truncatedBullets: values_1.v.number(),
            repairApplied: values_1.v.boolean(),
            compliant: values_1.v.boolean(),
            proxyWordCountExceeded: values_1.v.boolean(),
        }),
        wordCountEstimate: values_1.v.number(),
        createdAt: values_1.v.number(),
    })
        .index("by_run", ["runId"])
        .index("by_run_model", ["runId", "modelKey"]),
    // ─────────────────────────────────────────────────────────────────
    // GENERATED ARTIFACTS (PDFs, LaTeX files)
    // ─────────────────────────────────────────────────────────────────
    generatedArtifacts: (0, server_1.defineTable)({
        runId: values_1.v.id("runs"),
        modelKey: values_1.v.optional(values_1.v.string()),
        artifactType: artifactTypeValidator,
        fileName: values_1.v.string(),
        storageId: values_1.v.id("_storage"),
        mimeType: values_1.v.string(),
        sizeBytes: values_1.v.number(),
        isDeleted: values_1.v.optional(values_1.v.boolean()),
        deletedAt: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
    })
        .index("by_run", ["runId"])
        .index("by_run_type", ["runId", "artifactType"])
        .index("by_run_model", ["runId", "modelKey"]),
    // ─────────────────────────────────────────────────────────────────
    // APPLICATION TRACKING
    // ─────────────────────────────────────────────────────────────────
    applicationTracking: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        runId: values_1.v.id("runs"),
        jobId: values_1.v.id("jobs"),
        applicationStatus: applicationStatusValidator,
        appliedAt: values_1.v.optional(values_1.v.number()),
        responseReceivedAt: values_1.v.optional(values_1.v.number()),
        interviewScheduledAt: values_1.v.optional(values_1.v.number()),
        offerReceivedAt: values_1.v.optional(values_1.v.number()),
        rejectedAt: values_1.v.optional(values_1.v.number()),
        notes: values_1.v.optional(values_1.v.string()),
        nextAction: values_1.v.optional(values_1.v.string()),
        nextActionDue: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_run", ["runId"])
        .index("by_user_status", ["userId", "applicationStatus"])
        .index("by_user_recent", ["userId", "updatedAt"]),
});
