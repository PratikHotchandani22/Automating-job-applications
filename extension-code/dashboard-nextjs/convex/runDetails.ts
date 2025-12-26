// convex/runDetails.ts

import { query, action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Get full run details including all related data
 */
export const getFullRunDetails = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.isDeleted) {
      return null;
    }

    // Get the job
    const job = await ctx.db.get(run.jobId);

    // Get the master resume
    const masterResume = await ctx.db.get(run.masterResumeId);

    // Get the JD rubric
    const jdRubric = await ctx.db
      .query("jdRubrics")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();

    // Get the selection plan
    const selectionPlan = await ctx.db
      .query("selectionPlans")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();

    // Get all tailored resumes for this run
    const tailoredResumes = await ctx.db
      .query("tailoredResumes")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    // Get all generated artifacts
    const artifacts = await ctx.db
      .query("generatedArtifacts")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    // Filter out deleted artifacts
    const activeArtifacts = artifacts.filter((a) => !a.isDeleted);

    return {
      run,
      job,
      masterResume,
      jdRubric,
      selectionPlan,
      tailoredResumes,
      artifacts: activeArtifacts,
    };
  },
});

/**
 * Get run by runId string with full details
 */
export const getFullRunDetailsByRunId = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();

    if (!run || run.isDeleted) {
      return null;
    }

    // Get the job
    const job = await ctx.db.get(run.jobId);

    // Get the master resume
    const masterResume = await ctx.db.get(run.masterResumeId);

    // Get the JD rubric
    const jdRubric = await ctx.db
      .query("jdRubrics")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .first();

    // Get the selection plan
    const selectionPlan = await ctx.db
      .query("selectionPlans")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .first();

    // Get all tailored resumes for this run
    const tailoredResumes = await ctx.db
      .query("tailoredResumes")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();

    // Get all generated artifacts
    const artifacts = await ctx.db
      .query("generatedArtifacts")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();

    // Filter out deleted artifacts
    const activeArtifacts = artifacts.filter((a) => !a.isDeleted);

    return {
      run,
      job,
      masterResume,
      jdRubric,
      selectionPlan,
      tailoredResumes,
      artifacts: activeArtifacts,
    };
  },
});

/**
 * Get artifact download URL
 */
export const getArtifactUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Store a generated artifact (PDF, TEX, JSON)
 */
export const storeArtifact = mutation({
  args: {
    runId: v.id("runs"),
    modelKey: v.optional(v.string()),
    artifactType: v.union(v.literal("pdf"), v.literal("tex"), v.literal("json")),
    fileName: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("generatedArtifacts", {
      runId: args.runId,
      modelKey: args.modelKey,
      artifactType: args.artifactType,
      fileName: args.fileName,
      storageId: args.storageId,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      createdAt: Date.now(),
    });
  },
});

/**
 * Generate upload URL for artifacts
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

