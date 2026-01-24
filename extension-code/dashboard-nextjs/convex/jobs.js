"use strict";
// convex/jobs.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteJob = exports.updateJob = exports.getJob = exports.getRecentJobs = exports.getJobs = exports.createJob = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
const helpers_1 = require("./helpers");
/**
 * Create a new job posting
 * Enforces uniqueness of (userId, descriptionHash) to prevent duplicates
 */
exports.createJob = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        jobUrl: values_1.v.string(),
        platform: values_1.v.string(),
        title: values_1.v.string(),
        company: values_1.v.optional(values_1.v.string()),
        location: values_1.v.optional(values_1.v.string()),
        salary: values_1.v.optional(values_1.v.string()),
        employmentType: values_1.v.optional(values_1.v.string()),
        seniority: values_1.v.optional(values_1.v.string()),
        rawDescription: values_1.v.string(),
        extractedText: values_1.v.optional(values_1.v.string()),
        structuredDescription: values_1.v.optional(values_1.v.array(values_1.v.object({
            title: values_1.v.string(),
            content: values_1.v.string(),
        }))),
        descriptionHash: values_1.v.string(),
        userTags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        notes: values_1.v.optional(values_1.v.string()),
        isFavorite: values_1.v.optional(values_1.v.boolean()),
    },
    handler: async (ctx, args) => {
        // Check for existing job with same descriptionHash for this user
        const existing = await (0, helpers_1.checkJobExists)(ctx, args.userId, args.descriptionHash);
        if (existing) {
            // Return existing job (idempotent upsert)
            const existingJob = await ctx.db
                .query("jobs")
                .withIndex("by_user_hash", (q) => q.eq("userId", args.userId).eq("descriptionHash", args.descriptionHash))
                .first();
            return existingJob._id;
        }
        const now = Date.now();
        return await ctx.db.insert("jobs", {
            userId: args.userId,
            jobUrl: args.jobUrl,
            platform: args.platform,
            title: args.title,
            company: args.company,
            location: args.location,
            salary: args.salary,
            employmentType: args.employmentType,
            seniority: args.seniority,
            rawDescription: args.rawDescription,
            extractedText: args.extractedText,
            structuredDescription: args.structuredDescription,
            descriptionHash: args.descriptionHash,
            userTags: args.userTags,
            notes: args.notes,
            isFavorite: args.isFavorite ?? false,
            createdAt: now,
            updatedAt: now,
        });
    },
});
/**
 * Get all jobs for a user (excluding deleted)
 */
exports.getJobs = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        const jobs = await ctx.db
            .query("jobs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
        return (0, helpers_1.filterNotDeleted)(jobs);
    },
});
/**
 * Get recent jobs for a user
 */
exports.getRecentJobs = (0, server_1.query)({
    args: {
        userId: values_1.v.id("users"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 20;
        const jobs = await ctx.db
            .query("jobs")
            .withIndex("by_user_recent", (q) => q.eq("userId", args.userId))
            .order("desc")
            .take(limit);
        return (0, helpers_1.filterNotDeleted)(jobs);
    },
});
/**
 * Get job by ID
 */
exports.getJob = (0, server_1.query)({
    args: { jobId: values_1.v.id("jobs") },
    handler: async (ctx, args) => {
        const job = await ctx.db.get(args.jobId);
        if (job && !job.isDeleted) {
            return job;
        }
        return null;
    },
});
/**
 * Update job
 */
exports.updateJob = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("jobs"),
        title: values_1.v.optional(values_1.v.string()),
        company: values_1.v.optional(values_1.v.string()),
        location: values_1.v.optional(values_1.v.string()),
        salary: values_1.v.optional(values_1.v.string()),
        employmentType: values_1.v.optional(values_1.v.string()),
        seniority: values_1.v.optional(values_1.v.string()),
        extractedText: values_1.v.optional(values_1.v.string()),
        structuredDescription: values_1.v.optional(values_1.v.array(values_1.v.object({
            title: values_1.v.string(),
            content: values_1.v.string(),
        }))),
        userTags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        notes: values_1.v.optional(values_1.v.string()),
        isFavorite: values_1.v.optional(values_1.v.boolean()),
    },
    handler: async (ctx, args) => {
        const update = {
            updatedAt: Date.now(),
        };
        if (args.title !== undefined)
            update.title = args.title;
        if (args.company !== undefined)
            update.company = args.company;
        if (args.location !== undefined)
            update.location = args.location;
        if (args.salary !== undefined)
            update.salary = args.salary;
        if (args.employmentType !== undefined)
            update.employmentType = args.employmentType;
        if (args.seniority !== undefined)
            update.seniority = args.seniority;
        if (args.extractedText !== undefined)
            update.extractedText = args.extractedText;
        if (args.userTags !== undefined)
            update.userTags = args.userTags;
        if (args.notes !== undefined)
            update.notes = args.notes;
        if (args.isFavorite !== undefined)
            update.isFavorite = args.isFavorite;
        if (args.structuredDescription !== undefined)
            update.structuredDescription = args.structuredDescription;
        await ctx.db.patch(args.jobId, update);
    },
});
/**
 * Soft-delete a job
 */
exports.deleteJob = (0, server_1.mutation)({
    args: { jobId: values_1.v.id("jobs") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            isDeleted: true,
            deletedAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});
