// convex/selectionPlans.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a selection plan
 */
export const createSelectionPlan = mutation({
  args: {
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
        minEvidenceTierNice: v.union(v.literal("strong"), v.literal("medium"), v.literal("weak")),
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
      uncoveredRequirements: v.array(
        v.object({
          reqId: v.string(),
          type: v.union(v.literal("must"), v.literal("nice")),
          weight: v.number(),
          reason: v.string(),
        })
      ),
    }),
    selected: v.object({
      workExperience: v.array(
        v.object({
          bulletId: v.string(),
          parentType: v.union(v.literal("experience"), v.literal("project"), v.literal("award")),
          parentId: v.string(),
          originalText: v.string(),
          company: v.optional(v.string()),
          role: v.optional(v.string()),
          dateRange: v.optional(v.string()),
          evidence: v.object({
            score: v.number(),
            tier: v.union(v.literal("strong"), v.literal("medium"), v.literal("weak")),
          }),
          matches: v.array(
            v.object({
              reqId: v.string(),
              rel: v.number(),
              edgeScore: v.number(),
            })
          ),
          redundancy: v.object({
            maxSim: v.number(),
            blocked: v.boolean(),
            penalty: v.number(),
          }),
          rewriteIntent: v.union(v.literal("light"), v.literal("medium"), v.literal("heavy")),
          reasons: v.array(v.string()),
        })
      ),
      projects: v.array(
        v.object({
          bulletId: v.string(),
          parentType: v.union(v.literal("experience"), v.literal("project"), v.literal("award")),
          parentId: v.string(),
          originalText: v.string(),
          company: v.optional(v.string()),
          role: v.optional(v.string()),
          dateRange: v.optional(v.string()),
          evidence: v.object({
            score: v.number(),
            tier: v.union(v.literal("strong"), v.literal("medium"), v.literal("weak")),
          }),
          matches: v.array(
            v.object({
              reqId: v.string(),
              rel: v.number(),
              edgeScore: v.number(),
            })
          ),
          redundancy: v.object({
            maxSim: v.number(),
            blocked: v.boolean(),
            penalty: v.number(),
          }),
          rewriteIntent: v.union(v.literal("light"), v.literal("medium"), v.literal("heavy")),
          reasons: v.array(v.string()),
        })
      ),
      awards: v.array(
        v.object({
          bulletId: v.string(),
          parentType: v.union(v.literal("experience"), v.literal("project"), v.literal("award")),
          parentId: v.string(),
          originalText: v.string(),
          company: v.optional(v.string()),
          role: v.optional(v.string()),
          dateRange: v.optional(v.string()),
          evidence: v.object({
            score: v.number(),
            tier: v.union(v.literal("strong"), v.literal("medium"), v.literal("weak")),
          }),
          matches: v.array(
            v.object({
              reqId: v.string(),
              rel: v.number(),
              edgeScore: v.number(),
            })
          ),
          redundancy: v.object({
            maxSim: v.number(),
            blocked: v.boolean(),
            penalty: v.number(),
          }),
          rewriteIntent: v.union(v.literal("light"), v.literal("medium"), v.literal("heavy")),
          reasons: v.array(v.string()),
        })
      ),
    }),
    budgetsUsed: v.object({
      experienceBullets: v.number(),
      projectBullets: v.number(),
      awardLines: v.number(),
      perRole: v.record(v.string(), v.number()),
    }),
    selectionNotes: v.optional(
      v.object({
        droppedDueToRedundancy: v.optional(v.array(v.string())),
        droppedDueToBudget: v.optional(v.array(v.string())),
      })
    ),
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
export const getSelectionPlan = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("selectionPlans")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
  },
});

