// convex/runs.ts

import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkRunExists, filterNotDeleted } from "./helpers";
import { api } from "./_generated/api";

const filterNotDeletedNonQueue = <T extends { isDeleted?: boolean; runType?: string }>(
  runs: T[]
): T[] => filterNotDeleted(runs).filter((run) => run.runType !== "queue");

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
    runType: v.optional(v.union(v.literal("single"), v.literal("queue"))),
    queueJobIds: v.optional(v.array(v.id("jobs"))),
    queueCursorIndex: v.optional(v.number()),
    queueId: v.optional(v.id("runs")),
    queuePosition: v.optional(v.number()),
    queueState: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("done"),
        v.literal("failed")
      )
    ),
    runStrategy: v.optional(v.union(v.literal("free"), v.literal("premium"))),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("success"),
      v.literal("error")
    ),
    stage: v.union(
      v.literal("queued"),
      v.literal("analyzing"),
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
    errorMessage: v.optional(v.string()),
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
      runType: args.runType || "single",
      queueJobIds: args.queueJobIds,
      queueCursorIndex: args.queueCursorIndex,
      queueId: args.queueId,
      queuePosition: args.queuePosition,
      queueState: args.queueState,
      runStrategy: args.runStrategy,
      status: args.status,
      stage: args.stage,
      mockMode: args.mockMode,
      promptVersions: args.promptVersions,
      modelVariants: args.modelVariants,
      primaryModelKey: args.primaryModelKey,
      errorMessage: args.errorMessage,
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
        v.literal("queued"),
        v.literal("analyzing"),
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
    runStrategy: v.optional(v.union(v.literal("free"), v.literal("premium"))),
    modelVariants: v.optional(v.array(v.string())),
    primaryModelKey: v.optional(v.string()),
    queueState: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("done"),
        v.literal("failed")
      )
    ),
  },
  handler: async (ctx, args) => {
    const update: any = {
      updatedAt: Date.now(),
    };

    if (args.status !== undefined) update.status = args.status;
    if (args.stage !== undefined) update.stage = args.stage;
    if (args.errorMessage !== undefined) update.errorMessage = args.errorMessage;
    if (args.runStrategy !== undefined) update.runStrategy = args.runStrategy;
    if (args.modelVariants !== undefined) update.modelVariants = args.modelVariants;
    if (args.primaryModelKey !== undefined) update.primaryModelKey = args.primaryModelKey;
    if (args.queueState !== undefined) update.queueState = args.queueState;

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

    return filterNotDeletedNonQueue(runs);
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

    const filteredRuns = filterNotDeletedNonQueue(runs);

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

        // Get application tracking status
        const applicationTracking = await ctx.db
          .query("applicationTracking")
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
          
          // Application tracking status
          applicationStatus: applicationTracking?.applicationStatus || "not_applied",
          applicationTrackingId: applicationTracking?._id || null,
          
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

    return filterNotDeletedNonQueue(runs);
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

    return filterNotDeletedNonQueue(runs);
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

    return filterNotDeletedNonQueue(runs);
  },
});

// ─────────────────────────────────────────────────────────────────
// QUEUE RUNS (sequential execution)
// ─────────────────────────────────────────────────────────────────

const dedupeJobIds = <T extends { toString(): string }>(jobIds: T[]) => {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const jobId of jobIds) {
    const key = jobId.toString();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(jobId);
    }
  }
  return unique;
};

export const createQueueRun = mutation({
  args: {
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    queueJobIds: v.array(v.id("jobs")),
  },
  handler: async (ctx, args) => {
    const unique = dedupeJobIds(args.queueJobIds);
    if (unique.length === 0) {
      throw new Error("Queue must include at least one job.");
    }

    const now = Date.now();
    const queueRunId = await ctx.db.insert("runs", {
      runId: `queue_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId: args.userId,
      masterResumeId: args.masterResumeId,
      jobId: unique[0],
      runType: "queue",
      queueJobIds: unique,
      queueCursorIndex: 0,
      status: "pending",
      stage: "queued",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return queueRunId;
  },
});

export const updateQueueOrder = mutation({
  args: {
    queueRunId: v.id("runs"),
    queueJobIds: v.array(v.id("jobs")),
    allowWhileRunning: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const queueRun = await ctx.db.get(args.queueRunId);
    if (!queueRun || queueRun.isDeleted || queueRun.runType !== "queue") {
      throw new Error("Queue run not found.");
    }
    // Allow adding items while running if explicitly permitted
    // Only block full reordering while running
    if (queueRun.status === "running" && !args.allowWhileRunning) {
      // Check if this is adding new items (extending the array) vs reordering
      const currentIds = new Set((queueRun.queueJobIds || []).map((id: any) => id.toString()));
      const newIds = args.queueJobIds.map((id: any) => id.toString());
      const isOnlyAdding = newIds.every((id, idx) => {
        // Allow if the id exists in current position OR is a new addition at the end
        return currentIds.has(id) || idx >= currentIds.size;
      });
      if (!isOnlyAdding) {
        throw new Error("Queue is running. You can add new items but not reorder.");
      }
    }

    const unique = dedupeJobIds(args.queueJobIds);
    const updates: any = {
      queueJobIds: unique,
      updatedAt: Date.now(),
    };
    // Only reset cursor if not running
    if (queueRun.status !== "running") {
      updates.queueCursorIndex = 0;
    }
    if (unique.length > 0) {
      updates.jobId = unique[0];
    }

    await ctx.db.patch(args.queueRunId, updates);
  },
});

export const updateQueueCursor = mutation({
  args: {
    queueRunId: v.id("runs"),
    cursorIndex: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.queueRunId, {
      queueCursorIndex: args.cursorIndex,
      updatedAt: Date.now(),
    });
  },
});

export const resetQueueRun = mutation({
  args: {
    queueRunId: v.id("runs"),
    cursorIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const queueRun = await ctx.db.get(args.queueRunId);
    if (!queueRun || queueRun.isDeleted || queueRun.runType !== "queue") {
      throw new Error("Queue run not found.");
    }
    await ctx.db.patch(args.queueRunId, {
      status: "pending",
      stage: "queued",
      queueCursorIndex: args.cursorIndex,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const getActiveQueueRunWithItems = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", args.userId).eq("runType", "queue")
      )
      .order("desc")
      .collect();

    const queueRun =
      runs.find(
        (run) =>
          !run.isDeleted &&
          (run.status === "pending" || run.status === "running")
      ) || null;

    if (!queueRun) {
      return { queueRun: null, items: [] };
    }

    const queueJobIds = queueRun.queueJobIds || [];
    
    // First, get runs linked to this queue via queueId
    const queueRuns = await ctx.db
      .query("runs")
      .withIndex("by_queue", (q) => q.eq("queueId", queueRun._id))
      .collect();

    const runByJobId = new Map<string, any>();
    for (const run of queueRuns) {
      if (!run.jobId) continue;
      const key = run.jobId.toString();
      const existing = runByJobId.get(key);
      if (!existing || (run.createdAt || 0) > (existing.createdAt || 0)) {
        runByJobId.set(key, run);
      }
    }

    // Also look up runs by jobId for jobs that might have been processed
    // without a queueId link (e.g., via /api/analyze endpoint)
    for (const jobId of queueJobIds) {
      const jobIdStr = jobId.toString();
      if (runByJobId.has(jobIdStr)) continue; // Already have a run for this job
      
      // Find runs for this job
      const jobRuns = await ctx.db
        .query("runs")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .order("desc")
        .collect();
      
      // Get the most recent non-queue run for this job
      const latestRun = jobRuns.find(
        (run) => !run.isDeleted && run.runType !== "queue"
      );
      if (latestRun) {
        runByJobId.set(jobIdStr, latestRun);
      }
    }

    const items = [];
    for (let i = 0; i < queueJobIds.length; i++) {
      const jobId = queueJobIds[i];
      const job = await ctx.db.get(jobId);
      items.push({
        job,
        run: runByJobId.get(jobId.toString()) || null,
        position: i + 1,
      });
    }

    return { queueRun, items };
  },
});

export const processQueueSequentially = action({
  args: { queueRunId: v.id("runs") },
  handler: async (ctx, args) => {

    const queueRun = await ctx.runQuery(api.runs.getRun, {
      runId: args.queueRunId,
    });


    if (!queueRun || queueRun.isDeleted || queueRun.runType !== "queue") {
      throw new Error("Queue run not found.");
    }

    try {
      const queueJobIds = dedupeJobIds(queueRun.queueJobIds || []);
      if (queueJobIds.length === 0) {
        await ctx.runMutation(api.runs.updateRunStatus, {
          runId: queueRun._id,
          status: "success",
          stage: "DONE",
        });
        return { ok: true, processed: 0 };
      }

      if ((queueRun.queueCursorIndex ?? 0) > queueJobIds.length) {
        throw new Error("Queue cursor is out of bounds.");
      }

      if ((queueRun.queueJobIds || []).length !== queueJobIds.length) {
        await ctx.runMutation(api.runs.updateQueueOrder, {
          queueRunId: queueRun._id,
          queueJobIds,
        });
      }

      await ctx.runMutation(api.runs.updateRunStatus, {
        runId: queueRun._id,
        status: "running",
        stage: "analyzing",
      });

      let cursor = queueRun.queueCursorIndex ?? 0;
      let processed = 0;
      let hadError = false;
      const pollIntervalMs = 4000;
      const maxWaitMs = 1000 * 60 * 20;

      for (let i = cursor; i < queueJobIds.length; i++) {
        await ctx.runMutation(api.runs.updateQueueCursor, {
          queueRunId: queueRun._id,
          cursorIndex: i,
        });

        const jobId = queueJobIds[i];
        let runId: any = null;
        try {
          const startResult = await ctx.runAction(
            api.resumePipeline.startTailoringPipeline,
            {
              userId: queueRun.userId,
              masterResumeId: queueRun.masterResumeId,
              jobId,
              options: queueRun.mockMode ? { mock_mode: true } : undefined,
              queueId: queueRun._id,
              queuePosition: i + 1,
            }
          );
          runId = startResult.runId;
          let status = startResult.status || "running";
          const startedAt = Date.now();

          while (Date.now() - startedAt < maxWaitMs) {
            const pollResult = await ctx.runAction(
              api.resumePipeline.pollRunStatus,
              { runId }
            );
            status = pollResult.status;
            if (status === "success" || status === "error") break;
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }

          if (status !== "success") {
            hadError = true;
            if (status !== "error") {
              await ctx.runMutation(api.runs.updateRunStatus, {
                runId,
                status: "error",
                stage: "ERROR",
                errorMessage: "Queue timed out waiting for run completion.",
              });
            }
          }
        } catch (error: any) {
          hadError = true;
          if (runId) {
            await ctx.runMutation(api.runs.updateRunStatus, {
              runId,
              status: "error",
              stage: "ERROR",
              errorMessage: error?.message || "Queue item failed to start.",
            });
          } else {
            const fallbackRunId = `queue_failed_${Date.now().toString(36)}_${Math.random()
              .toString(36)
              .slice(2, 8)}`;
            await ctx.runMutation(api.runs.createRun, {
              runId: fallbackRunId,
              userId: queueRun.userId,
              masterResumeId: queueRun.masterResumeId,
              jobId,
              runType: "single",
              queueId: queueRun._id,
              queuePosition: i + 1,
              queueState: "failed",
              status: "error",
              stage: "ERROR",
              mockMode: queueRun.mockMode,
              errorMessage: error?.message || "Queue item failed to start.",
            });
          }
        }

        processed += 1;

        await ctx.runMutation(api.runs.updateQueueCursor, {
          queueRunId: queueRun._id,
          cursorIndex: i + 1,
        });
      }

      await ctx.runMutation(api.runs.updateQueueCursor, {
        queueRunId: queueRun._id,
        cursorIndex: queueJobIds.length,
      });

      await ctx.runMutation(api.runs.updateRunStatus, {
        runId: queueRun._id,
        status: hadError ? "error" : "success",
        stage: hadError ? "ERROR" : "DONE",
        errorMessage: hadError ? "One or more items failed." : undefined,
      });

      return { ok: !hadError, processed };
    } catch (error: any) {
      await ctx.runMutation(api.runs.updateRunStatus, {
        runId: queueRun._id,
        status: "error",
        stage: "ERROR",
        errorMessage: error?.message || "Queue failed unexpectedly.",
      });
      throw error;
    }
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
