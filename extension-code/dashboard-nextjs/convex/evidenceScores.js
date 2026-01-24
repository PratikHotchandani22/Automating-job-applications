"use strict";
// convex/evidenceScores.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEvidenceScoresByCacheKey = exports.checkEvidenceScoresExist = exports.getEvidenceScores = exports.upsertEvidenceScores = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
/**
 * Create or update evidence scores for a master resume
 */
exports.upsertEvidenceScores = (0, server_1.mutation)({
    args: {
        masterResumeId: values_1.v.id("masterResumes"),
        masterResumeHash: values_1.v.string(),
        rulesHash: values_1.v.string(),
        rulesVersion: values_1.v.string(),
        scores: values_1.v.array(values_1.v.object({
            bulletId: values_1.v.string(),
            score: values_1.v.number(),
            tier: values_1.v.union(values_1.v.literal("strong"), values_1.v.literal("medium"), values_1.v.literal("weak")),
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
    },
    handler: async (ctx, args) => {
        // Check if evidence scores already exist for this cache key
        const existing = await ctx.db
            .query("evidenceScores")
            .withIndex("by_cache_key", (q) => q.eq("masterResumeHash", args.masterResumeHash).eq("rulesHash", args.rulesHash))
            .first();
        if (existing) {
            // Update existing
            await ctx.db.patch(existing._id, {
                scores: args.scores,
                cachedAt: Date.now(),
            });
            return existing._id;
        }
        else {
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
exports.getEvidenceScores = (0, server_1.query)({
    args: { masterResumeId: values_1.v.id("masterResumes") },
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
exports.checkEvidenceScoresExist = (0, server_1.query)({
    args: {
        masterResumeHash: values_1.v.string(),
        rulesHash: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const scores = await ctx.db
            .query("evidenceScores")
            .withIndex("by_cache_key", (q) => q.eq("masterResumeHash", args.masterResumeHash).eq("rulesHash", args.rulesHash))
            .first();
        return scores !== null;
    },
});
/**
 * Get evidence scores by cache key
 */
exports.getEvidenceScoresByCacheKey = (0, server_1.query)({
    args: {
        masterResumeHash: values_1.v.string(),
        rulesHash: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("evidenceScores")
            .withIndex("by_cache_key", (q) => q.eq("masterResumeHash", args.masterResumeHash).eq("rulesHash", args.rulesHash))
            .first();
    },
});
