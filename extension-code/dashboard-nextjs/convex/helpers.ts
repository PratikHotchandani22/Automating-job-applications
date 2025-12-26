// convex/helpers.ts

import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

/**
 * Derives a stable model key from a model name
 * Used consistently across runs, tailoredResumes, and generatedArtifacts
 */
export function deriveModelKey(modelName: string): string {
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
export async function generateContentHash(content: string): Promise<string> {
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
export function generateEmbedKeyHash(
  model: string,
  dims: number,
  preprocessVersion: string = "v1"
): string {
  return `${model}-${dims}-${preprocessVersion}`;
}

/**
 * Checks if a user exists by clerkId
 * Used for uniqueness guard before insert
 */
export async function checkUserExists(
  ctx: any,
  clerkId: string
): Promise<boolean> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();
  return existing !== null;
}

/**
 * Checks if a job with the same descriptionHash exists for a user
 * Used for deduplication
 */
export async function checkJobExists(
  ctx: any,
  userId: Id<"users">,
  descriptionHash: string
): Promise<boolean> {
  const existing = await ctx.db
    .query("jobs")
    .withIndex("by_user_hash", (q: any) =>
      q.eq("userId", userId).eq("descriptionHash", descriptionHash)
    )
    .first();
  return existing !== null;
}

/**
 * Checks if a run with the same runId exists
 * Used for uniqueness guard
 */
export async function checkRunExists(
  ctx: any,
  runId: string
): Promise<boolean> {
  const existing = await ctx.db
    .query("runs")
    .withIndex("by_run_id", (q: any) => q.eq("runId", runId))
    .first();
  return existing !== null;
}

/**
 * Soft-deletes a document by setting isDeleted flag
 */
export async function softDelete(
  ctx: any,
  tableName: string,
  id: Id<any>
): Promise<void> {
  await ctx.db.patch(id, {
    isDeleted: true,
    deletedAt: Date.now(),
    updatedAt: Date.now(),
  } as any);
}

/**
 * Filters out soft-deleted documents from a query
 */
export function filterNotDeleted<T extends { isDeleted?: boolean }>(
  items: T[]
): T[] {
  return items.filter((item) => !item.isDeleted);
}

