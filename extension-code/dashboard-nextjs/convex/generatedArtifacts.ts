// convex/generatedArtifacts.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { deriveModelKey } from "./helpers";
import { filterNotDeleted } from "./helpers";

/**
 * Create a generated artifact
 */
export const createGeneratedArtifact = mutation({
  args: {
    runId: v.id("runs"),
    modelName: v.optional(v.string()),
    artifactType: v.union(v.literal("pdf"), v.literal("tex"), v.literal("json")),
    fileName: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const modelKey = args.modelName ? deriveModelKey(args.modelName) : undefined;

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
export const getGeneratedArtifacts = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const artifacts = await ctx.db
      .query("generatedArtifacts")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    return filterNotDeleted(artifacts);
  },
});

/**
 * Get artifact by type
 */
export const getGeneratedArtifactByType = query({
  args: {
    runId: v.id("runs"),
    artifactType: v.union(v.literal("pdf"), v.literal("tex"), v.literal("json")),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db
      .query("generatedArtifacts")
      .withIndex("by_run_type", (q) =>
        q.eq("runId", args.runId).eq("artifactType", args.artifactType)
      )
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
export const getGeneratedArtifactsByModel = query({
  args: {
    runId: v.id("runs"),
    modelKey: v.string(),
  },
  handler: async (ctx, args) => {
    const artifacts = await ctx.db
      .query("generatedArtifacts")
      .withIndex("by_run_model", (q) =>
        q.eq("runId", args.runId).eq("modelKey", args.modelKey)
      )
      .collect();

    return filterNotDeleted(artifacts);
  },
});

/**
 * Get artifact by ID
 */
export const getGeneratedArtifact = query({
  args: { artifactId: v.id("generatedArtifacts") },
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
export const deleteGeneratedArtifact = mutation({
  args: { artifactId: v.id("generatedArtifacts") },
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

