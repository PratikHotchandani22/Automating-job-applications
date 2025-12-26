// convex/evidenceScores.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create or update evidence scores for a master resume
 */
export const upsertEvidenceScores = mutation({
  args: {
    masterResumeId: v.id("masterResumes"),
    masterResumeHash: v.string(),
    rulesHash: v.string(),
    rulesVersion: v.string(),
    scores: v.array(
      v.object({
        bulletId: v.string(),
        score: v.number(),
        tier: v.union(v.literal("strong"), v.literal("medium"), v.literal("weak")),
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
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check if evidence scores already exist for this cache key
    const existing = await ctx.db
      .query("evidenceScores")
      .withIndex("by_cache_key", (q) =>
        q.eq("masterResumeHash", args.masterResumeHash).eq("rulesHash", args.rulesHash)
      )
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        scores: args.scores,
        cachedAt: Date.now(),
      });
      return existing._id;
    } else {
      // Create new
      return await ctx.db.insert("evidenceScores", {
        masterResumeId: args.masterResumeId,
        masterResumeHash: args.masterResumeHash,
        rulesHash: args.rulesHash,
        rulesVersion: args.rulesVersion,
        scores: args.scores,
        cachedAt: Date.now(),
      });
    }
  },
});

/**
 * Get evidence scores for a master resume
 */
export const getEvidenceScores = query({
  args: { masterResumeId: v.id("masterResumes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("evidenceScores")
      .withIndex("by_resume", (q) => q.eq("masterResumeId", args.masterResumeId))
      .collect();
  },
});

/**
 * Check if evidence scores exist for a cache key
 */
export const checkEvidenceScoresExist = query({
  args: {
    masterResumeHash: v.string(),
    rulesHash: v.string(),
  },
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("evidenceScores")
      .withIndex("by_cache_key", (q) =>
        q.eq("masterResumeHash", args.masterResumeHash).eq("rulesHash", args.rulesHash)
      )
      .first();

    return scores !== null;
  },
});

/**
 * Get evidence scores by cache key
 */
export const getEvidenceScoresByCacheKey = query({
  args: {
    masterResumeHash: v.string(),
    rulesHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("evidenceScores")
      .withIndex("by_cache_key", (q) =>
        q.eq("masterResumeHash", args.masterResumeHash).eq("rulesHash", args.rulesHash)
      )
      .first();
  },
});

