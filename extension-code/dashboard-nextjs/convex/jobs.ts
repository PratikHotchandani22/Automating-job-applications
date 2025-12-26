// convex/jobs.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkJobExists, filterNotDeleted } from "./helpers";

/**
 * Create a new job posting
 * Enforces uniqueness of (userId, descriptionHash) to prevent duplicates
 */
export const createJob = mutation({
  args: {
    userId: v.id("users"),
    jobUrl: v.string(),
    platform: v.string(),
    title: v.string(),
    company: v.optional(v.string()),
    location: v.optional(v.string()),
    salary: v.optional(v.string()),
    employmentType: v.optional(v.string()),
    seniority: v.optional(v.string()),
    rawDescription: v.string(),
    extractedText: v.optional(v.string()),
    structuredDescription: v.optional(
      v.array(
        v.object({
          title: v.string(),
          content: v.string(),
        })
      )
    ),
    descriptionHash: v.string(),
    userTags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check for existing job with same descriptionHash for this user
    const existing = await checkJobExists(ctx, args.userId, args.descriptionHash);

    if (existing) {
      // Return existing job (idempotent upsert)
      const existingJob = await ctx.db
        .query("jobs")
        .withIndex("by_user_hash", (q) =>
          q.eq("userId", args.userId).eq("descriptionHash", args.descriptionHash)
        )
        .first();
      return existingJob!._id;
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
export const getJobs = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return filterNotDeleted(jobs);
  },
});

/**
 * Get recent jobs for a user
 */
export const getRecentJobs = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user_recent", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);

    return filterNotDeleted(jobs);
  },
});

/**
 * Get job by ID
 */
export const getJob = query({
  args: { jobId: v.id("jobs") },
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
export const updateJob = mutation({
  args: {
    jobId: v.id("jobs"),
    title: v.optional(v.string()),
    company: v.optional(v.string()),
    location: v.optional(v.string()),
    salary: v.optional(v.string()),
    employmentType: v.optional(v.string()),
    seniority: v.optional(v.string()),
    userTags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const update: any = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) update.title = args.title;
    if (args.company !== undefined) update.company = args.company;
    if (args.location !== undefined) update.location = args.location;
    if (args.salary !== undefined) update.salary = args.salary;
    if (args.employmentType !== undefined)
      update.employmentType = args.employmentType;
    if (args.seniority !== undefined) update.seniority = args.seniority;
    if (args.userTags !== undefined) update.userTags = args.userTags;
    if (args.notes !== undefined) update.notes = args.notes;
    if (args.isFavorite !== undefined) update.isFavorite = args.isFavorite;
    if (args.structuredDescription !== undefined)
      update.structuredDescription = args.structuredDescription;

    await ctx.db.patch(args.jobId, update);
  },
});

/**
 * Soft-delete a job
 */
export const deleteJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
