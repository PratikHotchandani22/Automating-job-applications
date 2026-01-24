"use strict";
// convex/helpers.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveModelKey = deriveModelKey;
exports.generateContentHash = generateContentHash;
exports.generateEmbedKeyHash = generateEmbedKeyHash;
exports.checkUserExists = checkUserExists;
exports.checkJobExists = checkJobExists;
exports.checkRunExists = checkRunExists;
exports.softDelete = softDelete;
exports.filterNotDeleted = filterNotDeleted;
/**
 * Derives a stable model key from a model name
 * Used consistently across runs, tailoredResumes, and generatedArtifacts
 */
function deriveModelKey(modelName) {
    return modelName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");
}
/**
 * Generates a SHA-256 hash for content deduplication
 * Note: In production, use crypto.createHash("sha256") on the server
 * This is a placeholder - implement actual hashing in your mutations
 */
async function generateContentHash(content) {
    // In Convex, you can use the Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
/**
 * Generates a hash for embedding configuration
 * Used as cache key for resume bullet embeddings
 */
function generateEmbedKeyHash(model, dims, preprocessVersion = "v1") {
    return `${model}-${dims}-${preprocessVersion}`;
}
/**
 * Checks if a user exists by clerkId
 * Used for uniqueness guard before insert
 */
async function checkUserExists(ctx, clerkId) {
    const existing = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
        .first();
    return existing !== null;
}
/**
 * Checks if a job with the same descriptionHash exists for a user
 * Used for deduplication
 */
async function checkJobExists(ctx, userId, descriptionHash) {
    const existing = await ctx.db
        .query("jobs")
        .withIndex("by_user_hash", (q) => q.eq("userId", userId).eq("descriptionHash", descriptionHash))
        .first();
    return existing !== null;
}
/**
 * Checks if a run with the same runId exists
 * Used for uniqueness guard
 */
async function checkRunExists(ctx, runId) {
    const existing = await ctx.db
        .query("runs")
        .withIndex("by_run_id", (q) => q.eq("runId", runId))
        .first();
    return existing !== null;
}
/**
 * Soft-deletes a document by setting isDeleted flag
 */
async function softDelete(ctx, tableName, id) {
    await ctx.db.patch(id, {
        isDeleted: true,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
    });
}
/**
 * Filters out soft-deleted documents from a query
 */
function filterNotDeleted(items) {
    return items.filter((item) => !item.isDeleted);
}
