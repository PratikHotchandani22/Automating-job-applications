// convex/users.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkUserExists } from "./helpers";

/**
 * Create or get a user by Clerk ID
 * Enforces uniqueness of clerkId
 */
export const createUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for existing user with same clerkId
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existing) {
      // Return existing user (idempotent)
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      fullName: args.fullName,
      avatarUrl: args.avatarUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Get user by Clerk ID
 */
export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

/**
 * Get user by ID
 */
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Update user settings
 */
export const updateUserSettings = mutation({
  args: {
    userId: v.id("users"),
    settings: v.optional(
      v.object({
        preferredModels: v.optional(v.array(v.string())),
        embeddingModel: v.optional(v.string()),
        embeddingDims: v.optional(v.number()),
        latexTemplate: v.optional(v.string()),
        promptVersions: v.optional(
          v.object({
            tailor: v.optional(v.string()),
            latex: v.optional(v.string()),
            rubric: v.optional(v.string()),
          })
        ),
      })
    ),
    defaultMasterResumeId: v.optional(v.id("masterResumes")),
  },
  handler: async (ctx, args) => {
    const update: any = {
      updatedAt: Date.now(),
    };

    if (args.settings !== undefined) {
      update.settings = args.settings;
    }

    if (args.defaultMasterResumeId !== undefined) {
      update.defaultMasterResumeId = args.defaultMasterResumeId;
    }

    await ctx.db.patch(args.userId, update);
  },
});

/**
 * Update user profile
 */
export const updateUserProfile = mutation({
  args: {
    userId: v.id("users"),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: any = {
      updatedAt: Date.now(),
    };

    if (args.fullName !== undefined) {
      update.fullName = args.fullName;
    }

    if (args.avatarUrl !== undefined) {
      update.avatarUrl = args.avatarUrl;
    }

    if (args.email !== undefined) {
      update.email = args.email;
    }

    await ctx.db.patch(args.userId, update);
  },
});

