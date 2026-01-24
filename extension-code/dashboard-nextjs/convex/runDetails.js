"use strict";
// convex/runDetails.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUploadUrl = exports.storeArtifact = exports.getArtifactUrl = exports.getFullRunDetailsByRunId = exports.getFullRunDetails = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
/**
 * Get full run details including all related data
 */
exports.getFullRunDetails = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
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
exports.getFullRunDetailsByRunId = (0, server_1.query)({
    args: { runId: values_1.v.string() },
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
exports.getArtifactUrl = (0, server_1.query)({
    args: { storageId: values_1.v.id("_storage") },
    handler: async (ctx, args) => {
        return await ctx.storage.getUrl(args.storageId);
    },
});
/**
 * Store a generated artifact (PDF, TEX, JSON)
 */
exports.storeArtifact = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        modelKey: values_1.v.optional(values_1.v.string()),
        artifactType: values_1.v.union(values_1.v.literal("pdf"), values_1.v.literal("tex"), values_1.v.literal("json")),
        fileName: values_1.v.string(),
        storageId: values_1.v.id("_storage"),
        mimeType: values_1.v.string(),
        sizeBytes: values_1.v.number(),
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
exports.generateUploadUrl = (0, server_1.mutation)({
    args: {},
    handler: async (ctx) => {
        return await ctx.storage.generateUploadUrl();
    },
});
