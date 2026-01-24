"use strict";
// convex/runs.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRun = exports.getRunsByJob = exports.getRunsByStatus = exports.getRecentRuns = exports.getRunsWithJobDetails = exports.getRuns = exports.getRunByRunId = exports.getRun = exports.updateRunCacheHits = exports.updateRunTiming = exports.updateRunStatus = exports.createRun = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
const helpers_1 = require("./helpers");
/**
 * Create a new run
 * Enforces uniqueness of runId
 */
exports.createRun = (0, server_1.mutation)({
    args: {
        runId: values_1.v.string(),
        userId: values_1.v.id("users"),
        masterResumeId: values_1.v.id("masterResumes"),
        jobId: values_1.v.id("jobs"),
        runStrategy: values_1.v.optional(values_1.v.union(values_1.v.literal("free"), values_1.v.literal("premium"))),
        status: values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("running"), values_1.v.literal("success"), values_1.v.literal("error")),
        stage: values_1.v.union(values_1.v.literal("queued"), values_1.v.literal("analyzing"), values_1.v.literal("initialized"), values_1.v.literal("extracting"), values_1.v.literal("rubric_generating"), values_1.v.literal("rubric_generated"), values_1.v.literal("embedding_jd"), values_1.v.literal("selecting"), values_1.v.literal("selection_complete"), values_1.v.literal("tailoring"), values_1.v.literal("tailored"), values_1.v.literal("generating_latex"), values_1.v.literal("generating_pdf"), values_1.v.literal("DONE"), values_1.v.literal("ERROR")),
        mockMode: values_1.v.optional(values_1.v.boolean()),
        promptVersions: values_1.v.optional(values_1.v.object({
            tailor: values_1.v.optional(values_1.v.string()),
            latex: values_1.v.optional(values_1.v.string()),
            rubric: values_1.v.optional(values_1.v.string()),
        })),
        modelVariants: values_1.v.optional(values_1.v.array(values_1.v.string())),
        primaryModelKey: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        // Check for existing run with same runId
        const existing = await (0, helpers_1.checkRunExists)(ctx, args.runId);
        if (existing) {
            throw new Error(`Run with runId ${args.runId} already exists`);
        }
        const now = Date.now();
        const runId = await ctx.db.insert("runs", {
            runId: args.runId,
            userId: args.userId,
            masterResumeId: args.masterResumeId,
            jobId: args.jobId,
            runStrategy: args.runStrategy,
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
exports.updateRunStatus = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        status: values_1.v.optional(values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("running"), values_1.v.literal("success"), values_1.v.literal("error"))),
        stage: values_1.v.optional(values_1.v.union(values_1.v.literal("queued"), values_1.v.literal("analyzing"), values_1.v.literal("initialized"), values_1.v.literal("extracting"), values_1.v.literal("rubric_generating"), values_1.v.literal("rubric_generated"), values_1.v.literal("embedding_jd"), values_1.v.literal("selecting"), values_1.v.literal("selection_complete"), values_1.v.literal("tailoring"), values_1.v.literal("tailored"), values_1.v.literal("generating_latex"), values_1.v.literal("generating_pdf"), values_1.v.literal("DONE"), values_1.v.literal("ERROR"))),
        errorMessage: values_1.v.optional(values_1.v.string()),
        runStrategy: values_1.v.optional(values_1.v.union(values_1.v.literal("free"), values_1.v.literal("premium"))),
        modelVariants: values_1.v.optional(values_1.v.array(values_1.v.string())),
        primaryModelKey: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const update = {
            updatedAt: Date.now(),
        };
        if (args.status !== undefined)
            update.status = args.status;
        if (args.stage !== undefined)
            update.stage = args.stage;
        if (args.errorMessage !== undefined)
            update.errorMessage = args.errorMessage;
        if (args.runStrategy !== undefined)
            update.runStrategy = args.runStrategy;
        if (args.modelVariants !== undefined)
            update.modelVariants = args.modelVariants;
        if (args.primaryModelKey !== undefined)
            update.primaryModelKey = args.primaryModelKey;
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
exports.updateRunTiming = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        timing: values_1.v.object({
            rubricMs: values_1.v.optional(values_1.v.number()),
            embeddingMs: values_1.v.optional(values_1.v.number()),
            selectionMs: values_1.v.optional(values_1.v.number()),
            tailorMs: values_1.v.optional(values_1.v.number()),
            latexMs: values_1.v.optional(values_1.v.number()),
            pdfMs: values_1.v.optional(values_1.v.number()),
            totalMs: values_1.v.optional(values_1.v.number()),
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
exports.updateRunCacheHits = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        cacheHits: values_1.v.object({
            embeddings: values_1.v.optional(values_1.v.boolean()),
            evidenceScores: values_1.v.optional(values_1.v.boolean()),
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
exports.getRun = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
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
exports.getRunByRunId = (0, server_1.query)({
    args: { runId: values_1.v.string() },
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
exports.getRuns = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        const runs = await ctx.db
            .query("runs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
        return (0, helpers_1.filterNotDeleted)(runs);
    },
});
/**
 * Get all runs for a user with job details (enriched)
 * Returns data in the format expected by RunsTable component
 */
exports.getRunsWithJobDetails = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        const runs = await ctx.db
            .query("runs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
        const filteredRuns = (0, helpers_1.filterNotDeleted)(runs);
        // Enrich each run with job details and coverage
        const enrichedRuns = await Promise.all(filteredRuns.map(async (run) => {
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
        }));
        return enrichedRuns;
    },
});
/**
 * Get recent runs for a user
 */
exports.getRecentRuns = (0, server_1.query)({
    args: {
        userId: values_1.v.id("users"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 20;
        const runs = await ctx.db
            .query("runs")
            .withIndex("by_user_recent", (q) => q.eq("userId", args.userId))
            .order("desc")
            .take(limit);
        return (0, helpers_1.filterNotDeleted)(runs);
    },
});
/**
 * Get runs by status
 */
exports.getRunsByStatus = (0, server_1.query)({
    args: {
        userId: values_1.v.id("users"),
        status: values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("running"), values_1.v.literal("success"), values_1.v.literal("error")),
    },
    handler: async (ctx, args) => {
        const runs = await ctx.db
            .query("runs")
            .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", args.status))
            .collect();
        return (0, helpers_1.filterNotDeleted)(runs);
    },
});
/**
 * Get runs for a job
 */
exports.getRunsByJob = (0, server_1.query)({
    args: { jobId: values_1.v.id("jobs") },
    handler: async (ctx, args) => {
        const runs = await ctx.db
            .query("runs")
            .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
            .collect();
        return (0, helpers_1.filterNotDeleted)(runs);
    },
});
/**
 * Soft-delete a run
 */
exports.deleteRun = (0, server_1.mutation)({
    args: { runId: values_1.v.id("runs") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.runId, {
            isDeleted: true,
            deletedAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});
