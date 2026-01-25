// convex/tailoredResumes.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { deriveModelKey } from "./helpers";

/**
 * Create a tailored resume
 */
export const createTailoredResume = mutation({
  args: {
    runId: v.id("runs"),
    modelName: v.string(),
    tailoredHash: v.string(),
    summary: v.string(),
    coverLetter: v.optional(v.string()),
    diagnostics: v.optional(v.string()),
    reasoningSummary: v.optional(v.string()),
    workExperience: v.array(
      v.object({
        roleId: v.string(),
        company: v.string(),
        title: v.string(),
        dateRange: v.string(),
        location: v.optional(v.string()),
        bullets: v.array(
          v.object({
            bulletId: v.string(),
            originalText: v.string(),
            tailoredText: v.string(),
            wasRewritten: v.boolean(),
          })
        ),
      })
    ),
    projects: v.array(
      v.object({
        projectId: v.string(),
        name: v.string(),
        date: v.optional(v.string()),
        links: v.optional(v.array(v.string())),
        bullets: v.array(
          v.object({
            bulletId: v.string(),
            originalText: v.string(),
            tailoredText: v.string(),
            wasRewritten: v.boolean(),
          })
        ),
      })
    ),
    education: v.array(
      v.object({
        institution: v.string(),
        degree: v.string(),
        dates: v.string(),
        location: v.optional(v.string()),
        gpa: v.optional(v.string()),
      })
    ),
    skills: v.record(v.string(), v.array(v.string())),
    skills_highlighted: v.optional(v.array(v.string())),
    awards: v.optional(
      v.array(
        v.object({
          name: v.string(),
          issuer: v.string(),
          year: v.string(),
          details: v.optional(v.string()),
        })
      )
    ),
    selectionEnforcement: v.object({
      strippedUnselected: v.number(),
      truncatedBullets: v.number(),
      repairApplied: v.boolean(),
      compliant: v.boolean(),
      proxyWordCountExceeded: v.boolean(),
    }),
    wordCountEstimate: v.number(),
    source: v.optional(v.union(v.literal("llm"), v.literal("user_edit"))),
    parentVersionId: v.optional(v.id("tailoredResumes")),
  },
  handler: async (ctx, args) => {
    const modelKey = deriveModelKey(args.modelName);

    return await ctx.db.insert("tailoredResumes", {
      runId: args.runId,
      modelKey,
      modelName: args.modelName,
      tailoredHash: args.tailoredHash,
      summary: args.summary,
      coverLetter: args.coverLetter,
      diagnostics: args.diagnostics,
      reasoningSummary: args.reasoningSummary,
      workExperience: args.workExperience,
      projects: args.projects,
      education: args.education,
      skills: args.skills,
      skills_highlighted: args.skills_highlighted,
      awards: args.awards,
      source: args.source ?? "llm",
      parentVersionId: args.parentVersionId,
      selectionEnforcement: args.selectionEnforcement,
      wordCountEstimate: args.wordCountEstimate,
      createdAt: Date.now(),
    });
  },
});

/**
 * Create a user-edited tailored resume version
 */
export const createTailoredResumeEdit = mutation({
  args: {
    runId: v.id("runs"),
    modelName: v.string(),
    tailoredHash: v.string(),
    summary: v.string(),
    coverLetter: v.optional(v.string()),
    diagnostics: v.optional(v.string()),
    reasoningSummary: v.optional(v.string()),
    workExperience: v.array(
      v.object({
        roleId: v.string(),
        company: v.string(),
        title: v.string(),
        dateRange: v.string(),
        location: v.optional(v.string()),
        bullets: v.array(
          v.object({
            bulletId: v.string(),
            originalText: v.string(),
            tailoredText: v.string(),
            wasRewritten: v.boolean(),
          })
        ),
      })
    ),
    projects: v.array(
      v.object({
        projectId: v.string(),
        name: v.string(),
        date: v.optional(v.string()),
        links: v.optional(v.array(v.string())),
        bullets: v.array(
          v.object({
            bulletId: v.string(),
            originalText: v.string(),
            tailoredText: v.string(),
            wasRewritten: v.boolean(),
          })
        ),
      })
    ),
    education: v.array(
      v.object({
        institution: v.string(),
        degree: v.string(),
        dates: v.string(),
        location: v.optional(v.string()),
        gpa: v.optional(v.string()),
      })
    ),
    skills: v.record(v.string(), v.array(v.string())),
    skills_highlighted: v.optional(v.array(v.string())),
    awards: v.optional(
      v.array(
        v.object({
          name: v.string(),
          issuer: v.string(),
          year: v.string(),
          details: v.optional(v.string()),
        })
      )
    ),
    selectionEnforcement: v.object({
      strippedUnselected: v.number(),
      truncatedBullets: v.number(),
      repairApplied: v.boolean(),
      compliant: v.boolean(),
      proxyWordCountExceeded: v.boolean(),
    }),
    wordCountEstimate: v.number(),
    parentVersionId: v.optional(v.id("tailoredResumes")),
  },
  handler: async (ctx, args) => {
    const modelKey = deriveModelKey(args.modelName);
    const createdAt = Date.now();
    const versionId = await ctx.db.insert("tailoredResumes", {
      runId: args.runId,
      modelKey,
      modelName: args.modelName,
      tailoredHash: args.tailoredHash,
      summary: args.summary,
      coverLetter: args.coverLetter,
      diagnostics: args.diagnostics,
      reasoningSummary: args.reasoningSummary,
      workExperience: args.workExperience,
      projects: args.projects,
      education: args.education,
      skills: args.skills,
      skills_highlighted: args.skills_highlighted,
      awards: args.awards,
      source: "user_edit",
      parentVersionId: args.parentVersionId,
      selectionEnforcement: args.selectionEnforcement,
      wordCountEstimate: args.wordCountEstimate,
      createdAt,
    });
    return { versionId, updatedAt: createdAt };
  },
});

/**
 * Get tailored resume for a run
 */
export const getTailoredResume = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tailoredResumes")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
  },
});

/**
 * Get tailored resume by run and model
 */
export const getTailoredResumeByModel = query({
  args: {
    runId: v.id("runs"),
    modelKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tailoredResumes")
      .withIndex("by_run_model", (q) =>
        q.eq("runId", args.runId).eq("modelKey", args.modelKey)
      )
      .first();
  },
});

/**
 * Get all tailored resumes for a run
 */
export const getTailoredResumes = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tailoredResumes")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
  },
});
