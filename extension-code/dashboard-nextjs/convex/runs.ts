// convex/runs.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkRunExists, deriveModelKey, filterNotDeleted } from "./helpers";

/**
 * Create a new run
 * Enforces uniqueness of runId
 */
export const createRun = mutation({
  args: {
    runId: v.string(),
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    jobId: v.id("jobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("success"),
      v.literal("error")
    ),
    stage: v.union(
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
    ),
    mockMode: v.optional(v.boolean()),
    promptVersions: v.optional(
      v.object({
        tailor: v.optional(v.string()),
        latex: v.optional(v.string()),
        rubric: v.optional(v.string()),
      })
    ),
    modelVariants: v.optional(v.array(v.string())),
    primaryModelKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for existing run with same runId
    const existing = await checkRunExists(ctx, args.runId);

    if (existing) {
      throw new Error(`Run with runId ${args.runId} already exists`);
    }

    const now = Date.now();
    const runId = await ctx.db.insert("runs", {
      runId: args.runId,
      userId: args.userId,
      masterResumeId: args.masterResumeId,
      jobId: args.jobId,
      status: args.status,
      stage: args.stage,
      mockMode: args.mockMode,
      promptVersions: args.promptVersions,
      modelVariants: args.modelVariants,
      primaryModelKey: args.primaryModelKey,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return runId;
  },
});

/**
 * Update run status and stage
 */
export const updateRunStatus = mutation({
  args: {
    runId: v.id("runs"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("success"),
        v.literal("error")
      )
    ),
    stage: v.optional(
      v.union(
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
      )
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: any = {
      updatedAt: Date.now(),
    };

    if (args.status !== undefined) update.status = args.status;
    if (args.stage !== undefined) update.stage = args.stage;
    if (args.errorMessage !== undefined) update.errorMessage = args.errorMessage;

    // Set completedAt if status is success or error
    if (args.status === "success" || args.status === "error") {
      update.completedAt = Date.now();
    }

    await ctx.db.patch(args.runId, update);
  },
});

/**
 * Update run timing metrics
 */
export const updateRunTiming = mutation({
  args: {
    runId: v.id("runs"),
    timing: v.object({
      rubricMs: v.optional(v.number()),
      embeddingMs: v.optional(v.number()),
      selectionMs: v.optional(v.number()),
      tailorMs: v.optional(v.number()),
      latexMs: v.optional(v.number()),
      pdfMs: v.optional(v.number()),
      totalMs: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      timing: args.timing,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update run cache hits
 */
export const updateRunCacheHits = mutation({
  args: {
    runId: v.id("runs"),
    cacheHits: v.object({
      embeddings: v.optional(v.boolean()),
      evidenceScores: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      cacheHits: args.cacheHits,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Get run by ID
 */
export const getRun = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run && !run.isDeleted) {
      return run;
    }
    return null;
  },
});

/**
 * Get run by runId string
 */
export const getRunByRunId = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
  },
});

/**
 * Get all runs for a user (basic, without job details)
 */
export const getRuns = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return filterNotDeleted(runs);
  },
});

/**
 * Get all runs for a user with job details (enriched)
 * Returns data in the format expected by RunsTable component
 */
export const getRunsWithJobDetails = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    const filteredRuns = filterNotDeleted(runs);

    // Enrich each run with job details and coverage
    const enrichedRuns = await Promise.all(
      filteredRuns.map(async (run) => {
        // Get job details
        const job = await ctx.db.get(run.jobId);
        
        // Get selection plan for coverage data
        const selectionPlan = await ctx.db
          .query("selectionPlans")
          .withIndex("by_run", (q) => q.eq("runId", run._id))
          .first();

        // Calculate coverage percentage
        let coverage = null;
        if (selectionPlan?.coverage) {
          const { mustTotal, mustCovered, niceTotal, niceCovered } = selectionPlan.coverage;
          const totalReqs = mustTotal + niceTotal;
          const totalCovered = mustCovered + niceCovered;
          coverage = totalReqs > 0 ? Math.round((totalCovered / totalReqs) * 100) : null;
        }

        // Calculate runtime in seconds
        const runtimeSec = run.timing?.totalMs 
          ? Math.round(run.timing.totalMs / 1000) 
          : run.startedAt && run.completedAt 
            ? Math.round((run.completedAt - run.startedAt) / 1000)
            : null;

        // Map status to RunRecord format
        const result = run.status === "success" 
          ? "success" 
          : run.status === "error" 
            ? "error" 
            : "pending";

        return {
          // Run identifiers
          runId: run.runId,
          _id: run._id,
          
          // Job details from joined job table
          title: job?.title || "Untitled role",
          company: job?.company || "Unknown",
          platform: job?.platform || "Other",
          
          // Run status
          status: run.stage || "UNKNOWN",
          stage: run.stage,
          result,
          
          // Metrics
          coverage,
          runtimeSec,
          
          // Timestamps
          startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
          updatedAt: run.updatedAt ? new Date(run.updatedAt).toISOString() : null,
          createdAt: run.createdAt ? new Date(run.createdAt).toISOString() : null,
          completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
          
          // Error message if any
          error: run.errorMessage || null,
          message: run.errorMessage || null,
          
          // Related IDs
          jobId: run.jobId,
          masterResumeId: run.masterResumeId,
          
          // Timing breakdown
          timing: run.timing,
          
          // Cache hits
          cacheHits: run.cacheHits,
        };
      })
    );

    return enrichedRuns;
  },
});

/**
 * Get recent runs for a user
 */
export const getRecentRuns = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user_recent", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    return filterNotDeleted(runs);
  },
});

/**
 * Get runs by status
 */
export const getRunsByStatus = query({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("success"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", args.status)
      )
      .collect();

    return filterNotDeleted(runs);
  },
});

/**
 * Get runs for a job
 */
export const getRunsByJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .collect();

    return filterNotDeleted(runs);
  },
});

/**
 * Soft-delete a run
 */
export const deleteRun = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

