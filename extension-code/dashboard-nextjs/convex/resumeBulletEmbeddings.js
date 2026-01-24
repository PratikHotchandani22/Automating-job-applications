"use strict";
// convex/resumeBulletEmbeddings.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteResumeBulletEmbeddings = exports.getBulletEmbedding = exports.checkEmbeddingsExist = exports.getResumeBulletEmbeddings = exports.createResumeBulletEmbeddings = exports.createResumeBulletEmbedding = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
const helpers_1 = require("./helpers");
/**
 * Create a resume bullet embedding
 */
exports.createResumeBulletEmbedding = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        masterResumeId: values_1.v.id("masterResumes"),
        masterResumeHash: values_1.v.string(),
        bulletId: values_1.v.string(),
        embeddingModel: values_1.v.string(),
        dims: values_1.v.number(),
        embedding: values_1.v.array(values_1.v.number()),
        preprocessVersion: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const embedKeyHash = (0, helpers_1.generateEmbedKeyHash)(args.embeddingModel, args.dims, args.preprocessVersion ?? "v1");
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
exports.createResumeBulletEmbeddings = (0, server_1.mutation)({
    args: {
        embeddings: values_1.v.array(values_1.v.object({
            userId: values_1.v.id("users"),
            masterResumeId: values_1.v.id("masterResumes"),
            masterResumeHash: values_1.v.string(),
            bulletId: values_1.v.string(),
            embeddingModel: values_1.v.string(),
            dims: values_1.v.number(),
            embedding: values_1.v.array(values_1.v.number()),
            preprocessVersion: values_1.v.optional(values_1.v.string()),
        })),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const ids = [];
        for (const emb of args.embeddings) {
            const embedKeyHash = (0, helpers_1.generateEmbedKeyHash)(emb.embeddingModel, emb.dims, emb.preprocessVersion ?? "v1");
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
exports.getResumeBulletEmbeddings = (0, server_1.query)({
    args: { masterResumeId: values_1.v.id("masterResumes") },
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
exports.checkEmbeddingsExist = (0, server_1.query)({
    args: {
        masterResumeHash: values_1.v.string(),
        embedKeyHash: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const embedding = await ctx.db
            .query("resumeBulletEmbeddings")
            .withIndex("by_cache_key", (q) => q.eq("masterResumeHash", args.masterResumeHash).eq("embedKeyHash", args.embedKeyHash))
            .first();
        return embedding !== null;
    },
});
/**
 * Get embedding for a specific bullet
 */
exports.getBulletEmbedding = (0, server_1.query)({
    args: {
        masterResumeId: values_1.v.id("masterResumes"),
        bulletId: values_1.v.string(),
        embedKeyHash: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("resumeBulletEmbeddings")
            .withIndex("by_bullet", (q) => q
            .eq("masterResumeId", args.masterResumeId)
            .eq("bulletId", args.bulletId)
            .eq("embedKeyHash", args.embedKeyHash))
            .first();
    },
});
/**
 * Delete embeddings for a master resume
 */
exports.deleteResumeBulletEmbeddings = (0, server_1.mutation)({
    args: { masterResumeId: values_1.v.id("masterResumes") },
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
