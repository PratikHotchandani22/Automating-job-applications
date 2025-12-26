// convex/applicationTracking.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create or update application tracking
 */
export const upsertApplicationTracking = mutation({
  args: {
    userId: v.id("users"),
    runId: v.id("runs"),
    jobId: v.id("jobs"),
    applicationStatus: v.union(
      v.literal("not_applied"),
      v.literal("applied"),
      v.literal("viewed"),
      v.literal("screening"),
      v.literal("interviewing"),
      v.literal("offer"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("ghosted")
    ),
    appliedAt: v.optional(v.number()),
    responseReceivedAt: v.optional(v.number()),
    interviewScheduledAt: v.optional(v.number()),
    offerReceivedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    nextActionDue: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if tracking already exists for this run
    const existing = await ctx.db
      .query("applicationTracking")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();

    const now = Date.now();
    const data = {
      userId: args.userId,
      runId: args.runId,
      jobId: args.jobId,
      applicationStatus: args.applicationStatus,
      appliedAt: args.appliedAt,
      responseReceivedAt: args.responseReceivedAt,
      interviewScheduledAt: args.interviewScheduledAt,
      offerReceivedAt: args.offerReceivedAt,
      rejectedAt: args.rejectedAt,
      notes: args.notes,
      nextAction: args.nextAction,
      nextActionDue: args.nextActionDue,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("applicationTracking", {
        ...data,
        createdAt: now,
      });
    }
  },
});

/**
 * Get application tracking for a run
 */
export const getApplicationTracking = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("applicationTracking")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
  },
});

/**
 * Get all application tracking for a user
 */
export const getApplicationTrackingByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("applicationTracking")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Get application tracking by status
 */
export const getApplicationTrackingByStatus = query({
  args: {
    userId: v.id("users"),
    applicationStatus: v.union(
      v.literal("not_applied"),
      v.literal("applied"),
      v.literal("viewed"),
      v.literal("screening"),
      v.literal("interviewing"),
      v.literal("offer"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("ghosted")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("applicationTracking")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("applicationStatus", args.applicationStatus)
      )
      .collect();
  },
});

/**
 * Get recent application tracking for a user
 */
export const getRecentApplicationTracking = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("applicationTracking")
      .withIndex("by_user_recent", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Update application status
 */
export const updateApplicationStatus = mutation({
  args: {
    trackingId: v.id("applicationTracking"),
    applicationStatus: v.union(
      v.literal("not_applied"),
      v.literal("applied"),
      v.literal("viewed"),
      v.literal("screening"),
      v.literal("interviewing"),
      v.literal("offer"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("ghosted")
    ),
    appliedAt: v.optional(v.number()),
    responseReceivedAt: v.optional(v.number()),
    interviewScheduledAt: v.optional(v.number()),
    offerReceivedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const update: any = {
      applicationStatus: args.applicationStatus,
      updatedAt: Date.now(),
    };

    if (args.appliedAt !== undefined) update.appliedAt = args.appliedAt;
    if (args.responseReceivedAt !== undefined)
      update.responseReceivedAt = args.responseReceivedAt;
    if (args.interviewScheduledAt !== undefined)
      update.interviewScheduledAt = args.interviewScheduledAt;
    if (args.offerReceivedAt !== undefined) update.offerReceivedAt = args.offerReceivedAt;
    if (args.rejectedAt !== undefined) update.rejectedAt = args.rejectedAt;

    await ctx.db.patch(args.trackingId, update);
  },
});

