// convex/resumeBulletEmbeddings.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { generateEmbedKeyHash } from "./helpers";

/**
 * Create a resume bullet embedding
 */
export const createResumeBulletEmbedding = mutation({
  args: {
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    masterResumeHash: v.string(),
    bulletId: v.string(),
    embeddingModel: v.string(),
    dims: v.number(),
    embedding: v.array(v.number()),
    preprocessVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const embedKeyHash = generateEmbedKeyHash(
      args.embeddingModel,
      args.dims,
      args.preprocessVersion ?? "v1"
    );

    return await ctx.db.insert("resumeBulletEmbeddings", {
      userId: args.userId,
      masterResumeId: args.masterResumeId,
      masterResumeHash: args.masterResumeHash,
      bulletId: args.bulletId,
      embedKeyHash,
      embeddingModel: args.embeddingModel,
      dims: args.dims,
      embedding: args.embedding,
      createdAt: Date.now(),
    });
  },
});

/**
 * Bulk create resume bullet embeddings
 */
export const createResumeBulletEmbeddings = mutation({
  args: {
    embeddings: v.array(
      v.object({
        userId: v.id("users"),
        masterResumeId: v.id("masterResumes"),
        masterResumeHash: v.string(),
        bulletId: v.string(),
        embeddingModel: v.string(),
        dims: v.number(),
        embedding: v.array(v.number()),
        preprocessVersion: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const emb of args.embeddings) {
      const embedKeyHash = generateEmbedKeyHash(
        emb.embeddingModel,
        emb.dims,
        emb.preprocessVersion ?? "v1"
      );
      const id = await ctx.db.insert("resumeBulletEmbeddings", {
        userId: emb.userId,
        masterResumeId: emb.masterResumeId,
        masterResumeHash: emb.masterResumeHash,
        bulletId: emb.bulletId,
        embedKeyHash,
        embeddingModel: emb.embeddingModel,
        dims: emb.dims,
        embedding: emb.embedding,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

/**
 * Get all embeddings for a master resume
 */
export const getResumeBulletEmbeddings = query({
  args: { masterResumeId: v.id("masterResumes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("resumeBulletEmbeddings")
      .withIndex("by_resume", (q) => q.eq("masterResumeId", args.masterResumeId))
      .collect();
  },
});

/**
 * Check if embeddings exist for a resume hash and embedding config
 */
export const checkEmbeddingsExist = query({
  args: {
    masterResumeHash: v.string(),
    embedKeyHash: v.string(),
  },
  handler: async (ctx, args) => {
    const embedding = await ctx.db
      .query("resumeBulletEmbeddings")
      .withIndex("by_cache_key", (q) =>
        q.eq("masterResumeHash", args.masterResumeHash).eq("embedKeyHash", args.embedKeyHash)
      )
      .first();

    return embedding !== null;
  },
});

/**
 * Get embedding for a specific bullet
 */
export const getBulletEmbedding = query({
  args: {
    masterResumeId: v.id("masterResumes"),
    bulletId: v.string(),
    embedKeyHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("resumeBulletEmbeddings")
      .withIndex("by_bullet", (q) =>
        q
          .eq("masterResumeId", args.masterResumeId)
          .eq("bulletId", args.bulletId)
          .eq("embedKeyHash", args.embedKeyHash)
      )
      .first();
  },
});

/**
 * Delete embeddings for a master resume
 */
export const deleteResumeBulletEmbeddings = mutation({
  args: { masterResumeId: v.id("masterResumes") },
  handler: async (ctx, args) => {
    const embeddings = await ctx.db
      .query("resumeBulletEmbeddings")
      .withIndex("by_resume", (q) => q.eq("masterResumeId", args.masterResumeId))
      .collect();

    for (const embedding of embeddings) {
      await ctx.db.delete(embedding._id);
    }
  },
});

