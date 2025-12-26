// convex/jdRubrics.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a JD rubric
 */
export const createJdRubric = mutation({
  args: {
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
    requirements: v.array(
      v.object({
        reqId: v.string(),
        type: v.union(v.literal("must"), v.literal("nice")),
        weight: v.number(),
        requirement: v.string(),
        jdEvidence: v.array(v.string()),
        category: v.string(),
      })
    ),
    keywords: v.array(
      v.object({
        term: v.string(),
        importance: v.number(),
        type: v.string(),
        jdEvidence: v.array(v.string()),
      })
    ),
    constraints: v.optional(
      v.object({
        yearsExperienceMin: v.optional(v.number()),
        education: v.optional(v.array(v.string())),
        certifications: v.optional(v.array(v.string())),
        workAuthorization: v.optional(v.array(v.string())),
      })
    ),
    notes: v.optional(
      v.object({
        summary: v.optional(v.string()),
        ambiguities: v.optional(v.array(v.string())),
      })
    ),
    rubricHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("jdRubrics", {
      runId: args.runId,
      version: args.version,
      jobMeta: args.jobMeta,
      requirements: args.requirements,
      keywords: args.keywords,
      constraints: args.constraints,
      notes: args.notes,
      rubricHash: args.rubricHash,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get JD rubric for a run
 */
export const getJdRubric = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jdRubrics")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
  },
});

