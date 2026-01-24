"use strict";
// convex/users.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserProfile = exports.updateUserSettings = exports.getUser = exports.getUserByEmail = exports.getUserByClerkId = exports.createUser = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
/**
 * Create or get a user by Clerk ID
 * Enforces uniqueness of clerkId
 */
exports.createUser = (0, server_1.mutation)({
    args: {
        clerkId: values_1.v.string(),
        email: values_1.v.string(),
        fullName: values_1.v.optional(values_1.v.string()),
        avatarUrl: values_1.v.optional(values_1.v.string()),
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
exports.getUserByClerkId = (0, server_1.query)({
    args: { clerkId: values_1.v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
            .first();
    },
});
/**
 * Get user by email
 */
exports.getUserByEmail = (0, server_1.query)({
    args: { email: values_1.v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();
    },
});
/**
 * Get user by ID
 */
exports.getUser = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.userId);
    },
});
/**
 * Update user settings
 */
exports.updateUserSettings = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        settings: values_1.v.optional(values_1.v.object({
            preferredModels: values_1.v.optional(values_1.v.array(values_1.v.string())),
            embeddingModel: values_1.v.optional(values_1.v.string()),
            embeddingDims: values_1.v.optional(values_1.v.number()),
            latexTemplate: values_1.v.optional(values_1.v.string()),
            promptVersions: values_1.v.optional(values_1.v.object({
                tailor: values_1.v.optional(values_1.v.string()),
                latex: values_1.v.optional(values_1.v.string()),
                rubric: values_1.v.optional(values_1.v.string()),
            })),
        })),
        defaultMasterResumeId: values_1.v.optional(values_1.v.id("masterResumes")),
    },
    handler: async (ctx, args) => {
        const update = {
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
exports.updateUserProfile = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        fullName: values_1.v.optional(values_1.v.string()),
        avatarUrl: values_1.v.optional(values_1.v.string()),
        email: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const update = {
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
