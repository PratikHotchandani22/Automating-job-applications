"use strict";
// convex/selectionPlans.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSelectionPlan = exports.createSelectionPlan = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
/**
 * Create a selection plan
 */
exports.createSelectionPlan = (0, server_1.mutation)({
    args: {
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
                minEvidenceTierNice: values_1.v.union(values_1.v.literal("strong"), values_1.v.literal("medium"), values_1.v.literal("weak")),
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
            workExperience: values_1.v.array(values_1.v.object({
                bulletId: values_1.v.string(),
                parentType: values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project"), values_1.v.literal("award")),
                parentId: values_1.v.string(),
                originalText: values_1.v.string(),
                company: values_1.v.optional(values_1.v.string()),
                role: values_1.v.optional(values_1.v.string()),
                dateRange: values_1.v.optional(values_1.v.string()),
                evidence: values_1.v.object({
                    score: values_1.v.number(),
                    tier: values_1.v.union(values_1.v.literal("strong"), values_1.v.literal("medium"), values_1.v.literal("weak")),
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
                rewriteIntent: values_1.v.union(values_1.v.literal("light"), values_1.v.literal("medium"), values_1.v.literal("heavy")),
                reasons: values_1.v.array(values_1.v.string()),
            })),
            projects: values_1.v.array(values_1.v.object({
                bulletId: values_1.v.string(),
                parentType: values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project"), values_1.v.literal("award")),
                parentId: values_1.v.string(),
                originalText: values_1.v.string(),
                company: values_1.v.optional(values_1.v.string()),
                role: values_1.v.optional(values_1.v.string()),
                dateRange: values_1.v.optional(values_1.v.string()),
                evidence: values_1.v.object({
                    score: values_1.v.number(),
                    tier: values_1.v.union(values_1.v.literal("strong"), values_1.v.literal("medium"), values_1.v.literal("weak")),
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
                rewriteIntent: values_1.v.union(values_1.v.literal("light"), values_1.v.literal("medium"), values_1.v.literal("heavy")),
                reasons: values_1.v.array(values_1.v.string()),
            })),
            awards: values_1.v.array(values_1.v.object({
                bulletId: values_1.v.string(),
                parentType: values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project"), values_1.v.literal("award")),
                parentId: values_1.v.string(),
                originalText: values_1.v.string(),
                company: values_1.v.optional(values_1.v.string()),
                role: values_1.v.optional(values_1.v.string()),
                dateRange: values_1.v.optional(values_1.v.string()),
                evidence: values_1.v.object({
                    score: values_1.v.number(),
                    tier: values_1.v.union(values_1.v.literal("strong"), values_1.v.literal("medium"), values_1.v.literal("weak")),
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
                rewriteIntent: values_1.v.union(values_1.v.literal("light"), values_1.v.literal("medium"), values_1.v.literal("heavy")),
                reasons: values_1.v.array(values_1.v.string()),
            })),
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
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("selectionPlans", {
            runId: args.runId,
            version: args.version,
            masterResumeHash: args.masterResumeHash,
            jobExtractedHash: args.jobExtractedHash,
            rubricHash: args.rubricHash,
            embeddingModel: args.embeddingModel,
            config: args.config,
            coverage: args.coverage,
            selected: args.selected,
            budgetsUsed: args.budgetsUsed,
            selectionNotes: args.selectionNotes,
            createdAt: Date.now(),
        });
    },
});
/**
 * Get selection plan for a run
 */
exports.getSelectionPlan = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("selectionPlans")
            .withIndex("by_run", (q) => q.eq("runId", args.runId))
            .first();
    },
});
