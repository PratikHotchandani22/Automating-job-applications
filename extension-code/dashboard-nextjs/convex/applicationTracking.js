"use strict";
// convex/applicationTracking.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateApplicationStatus = exports.getRecentApplicationTracking = exports.getApplicationTrackingByStatus = exports.getApplicationTrackingByUser = exports.getApplicationTracking = exports.upsertApplicationTracking = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
/**
 * Create or update application tracking
 */
exports.upsertApplicationTracking = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        runId: values_1.v.id("runs"),
        jobId: values_1.v.id("jobs"),
        applicationStatus: values_1.v.union(values_1.v.literal("not_applied"), values_1.v.literal("applied"), values_1.v.literal("viewed"), values_1.v.literal("screening"), values_1.v.literal("interviewing"), values_1.v.literal("offer"), values_1.v.literal("accepted"), values_1.v.literal("rejected"), values_1.v.literal("withdrawn"), values_1.v.literal("ghosted")),
        appliedAt: values_1.v.optional(values_1.v.number()),
        responseReceivedAt: values_1.v.optional(values_1.v.number()),
        interviewScheduledAt: values_1.v.optional(values_1.v.number()),
        offerReceivedAt: values_1.v.optional(values_1.v.number()),
        rejectedAt: values_1.v.optional(values_1.v.number()),
        notes: values_1.v.optional(values_1.v.string()),
        nextAction: values_1.v.optional(values_1.v.string()),
        nextActionDue: values_1.v.optional(values_1.v.number()),
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
        }
        else {
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
exports.getApplicationTracking = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
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
exports.getApplicationTrackingByUser = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
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
exports.getApplicationTrackingByStatus = (0, server_1.query)({
    args: {
        userId: values_1.v.id("users"),
        applicationStatus: values_1.v.union(values_1.v.literal("not_applied"), values_1.v.literal("applied"), values_1.v.literal("viewed"), values_1.v.literal("screening"), values_1.v.literal("interviewing"), values_1.v.literal("offer"), values_1.v.literal("accepted"), values_1.v.literal("rejected"), values_1.v.literal("withdrawn"), values_1.v.literal("ghosted")),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("applicationTracking")
            .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("applicationStatus", args.applicationStatus))
            .collect();
    },
});
/**
 * Get recent application tracking for a user
 */
exports.getRecentApplicationTracking = (0, server_1.query)({
    args: {
        userId: values_1.v.id("users"),
        limit: values_1.v.optional(values_1.v.number()),
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
exports.updateApplicationStatus = (0, server_1.mutation)({
    args: {
        trackingId: values_1.v.id("applicationTracking"),
        applicationStatus: values_1.v.union(values_1.v.literal("not_applied"), values_1.v.literal("applied"), values_1.v.literal("viewed"), values_1.v.literal("screening"), values_1.v.literal("interviewing"), values_1.v.literal("offer"), values_1.v.literal("accepted"), values_1.v.literal("rejected"), values_1.v.literal("withdrawn"), values_1.v.literal("ghosted")),
        appliedAt: values_1.v.optional(values_1.v.number()),
        responseReceivedAt: values_1.v.optional(values_1.v.number()),
        interviewScheduledAt: values_1.v.optional(values_1.v.number()),
        offerReceivedAt: values_1.v.optional(values_1.v.number()),
        rejectedAt: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const update = {
            applicationStatus: args.applicationStatus,
            updatedAt: Date.now(),
        };
        if (args.appliedAt !== undefined)
            update.appliedAt = args.appliedAt;
        if (args.responseReceivedAt !== undefined)
            update.responseReceivedAt = args.responseReceivedAt;
        if (args.interviewScheduledAt !== undefined)
            update.interviewScheduledAt = args.interviewScheduledAt;
        if (args.offerReceivedAt !== undefined)
            update.offerReceivedAt = args.offerReceivedAt;
        if (args.rejectedAt !== undefined)
            update.rejectedAt = args.rejectedAt;
        await ctx.db.patch(args.trackingId, update);
    },
});
