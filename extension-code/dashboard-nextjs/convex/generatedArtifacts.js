"use strict";
// convex/generatedArtifacts.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGeneratedArtifact = exports.getGeneratedArtifact = exports.getGeneratedArtifactsByModel = exports.getGeneratedArtifactByType = exports.getGeneratedArtifacts = exports.createGeneratedArtifact = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
const helpers_1 = require("./helpers");
const helpers_2 = require("./helpers");
/**
 * Create a generated artifact
 */
exports.createGeneratedArtifact = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        modelName: values_1.v.optional(values_1.v.string()),
        artifactType: values_1.v.union(values_1.v.literal("pdf"), values_1.v.literal("tex"), values_1.v.literal("json")),
        fileName: values_1.v.string(),
        storageId: values_1.v.id("_storage"),
        mimeType: values_1.v.string(),
        sizeBytes: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        const modelKey = args.modelName ? (0, helpers_1.deriveModelKey)(args.modelName) : undefined;
        return await ctx.db.insert("generatedArtifacts", {
            runId: args.runId,
            modelKey,
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
 * Get all artifacts for a run
 */
exports.getGeneratedArtifacts = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
    handler: async (ctx, args) => {
        const artifacts = await ctx.db
            .query("generatedArtifacts")
            .withIndex("by_run", (q) => q.eq("runId", args.runId))
            .collect();
        return (0, helpers_2.filterNotDeleted)(artifacts);
    },
});
/**
 * Get artifact by type
 */
exports.getGeneratedArtifactByType = (0, server_1.query)({
    args: {
        runId: values_1.v.id("runs"),
        artifactType: values_1.v.union(values_1.v.literal("pdf"), values_1.v.literal("tex"), values_1.v.literal("json")),
    },
    handler: async (ctx, args) => {
        const artifact = await ctx.db
            .query("generatedArtifacts")
            .withIndex("by_run_type", (q) => q.eq("runId", args.runId).eq("artifactType", args.artifactType))
            .first();
        if (artifact && !artifact.isDeleted) {
            return artifact;
        }
        return null;
    },
});
/**
 * Get artifact by model
 */
exports.getGeneratedArtifactsByModel = (0, server_1.query)({
    args: {
        runId: values_1.v.id("runs"),
        modelKey: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const artifacts = await ctx.db
            .query("generatedArtifacts")
            .withIndex("by_run_model", (q) => q.eq("runId", args.runId).eq("modelKey", args.modelKey))
            .collect();
        return (0, helpers_2.filterNotDeleted)(artifacts);
    },
});
/**
 * Get artifact by ID
 */
exports.getGeneratedArtifact = (0, server_1.query)({
    args: { artifactId: values_1.v.id("generatedArtifacts") },
    handler: async (ctx, args) => {
        const artifact = await ctx.db.get(args.artifactId);
        if (artifact && !artifact.isDeleted) {
            return artifact;
        }
        return null;
    },
});
/**
 * Soft-delete a generated artifact
 * Note: Also delete from storage in production
 */
exports.deleteGeneratedArtifact = (0, server_1.mutation)({
    args: { artifactId: values_1.v.id("generatedArtifacts") },
    handler: async (ctx, args) => {
        const artifact = await ctx.db.get(args.artifactId);
        if (artifact) {
            // Delete from storage
            await ctx.storage.delete(artifact.storageId);
            // Soft-delete the record
            await ctx.db.patch(args.artifactId, {
                isDeleted: true,
                deletedAt: Date.now(),
            });
        }
    },
});
