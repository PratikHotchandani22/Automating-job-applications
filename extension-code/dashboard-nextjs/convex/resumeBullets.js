"use strict";
// convex/resumeBullets.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteResumeBulletsByResume = exports.deleteResumeBullet = exports.updateResumeBullet = exports.getResumeBulletsByParent = exports.getResumeBullets = exports.createResumeBullets = exports.createResumeBullet = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
/**
 * Create a resume bullet
 */
exports.createResumeBullet = (0, server_1.mutation)({
    args: {
        masterResumeId: values_1.v.id("masterResumes"),
        bulletId: values_1.v.string(),
        parentType: values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project")),
        parentId: values_1.v.string(),
        company: values_1.v.optional(values_1.v.string()),
        role: values_1.v.optional(values_1.v.string()),
        projectName: values_1.v.optional(values_1.v.string()),
        dates: values_1.v.optional(values_1.v.string()),
        location: values_1.v.optional(values_1.v.string()),
        text: values_1.v.string(),
        tags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        links: values_1.v.optional(values_1.v.array(values_1.v.string())),
        order: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("resumeBullets", {
            masterResumeId: args.masterResumeId,
            bulletId: args.bulletId,
            parentType: args.parentType,
            parentId: args.parentId,
            company: args.company,
            role: args.role,
            projectName: args.projectName,
            dates: args.dates,
            location: args.location,
            text: args.text,
            tags: args.tags,
            links: args.links,
            order: args.order,
            createdAt: Date.now(),
        });
    },
});
/**
 * Bulk create resume bullets
 */
exports.createResumeBullets = (0, server_1.mutation)({
    args: {
        bullets: values_1.v.array(values_1.v.object({
            masterResumeId: values_1.v.id("masterResumes"),
            bulletId: values_1.v.string(),
            parentType: values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project")),
            parentId: values_1.v.string(),
            company: values_1.v.optional(values_1.v.string()),
            role: values_1.v.optional(values_1.v.string()),
            projectName: values_1.v.optional(values_1.v.string()),
            dates: values_1.v.optional(values_1.v.string()),
            location: values_1.v.optional(values_1.v.string()),
            text: values_1.v.string(),
            tags: values_1.v.optional(values_1.v.array(values_1.v.string())),
            links: values_1.v.optional(values_1.v.array(values_1.v.string())),
            order: values_1.v.number(),
        })),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const ids = [];
        for (const bullet of args.bullets) {
            const id = await ctx.db.insert("resumeBullets", {
                ...bullet,
                createdAt: now,
            });
            ids.push(id);
        }
        return ids;
    },
});
/**
 * Get all bullets for a master resume
 */
exports.getResumeBullets = (0, server_1.query)({
    args: { masterResumeId: values_1.v.id("masterResumes") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("resumeBullets")
            .withIndex("by_resume", (q) => q.eq("masterResumeId", args.masterResumeId))
            .collect();
    },
});
/**
 * Get bullets by parent (experience or project)
 */
exports.getResumeBulletsByParent = (0, server_1.query)({
    args: {
        masterResumeId: values_1.v.id("masterResumes"),
        parentType: values_1.v.union(values_1.v.literal("experience"), values_1.v.literal("project")),
        parentId: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("resumeBullets")
            .withIndex("by_parent", (q) => q
            .eq("masterResumeId", args.masterResumeId)
            .eq("parentType", args.parentType)
            .eq("parentId", args.parentId))
            .collect();
    },
});
/**
 * Update a resume bullet
 */
exports.updateResumeBullet = (0, server_1.mutation)({
    args: {
        bulletId: values_1.v.id("resumeBullets"),
        text: values_1.v.optional(values_1.v.string()),
        tags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        links: values_1.v.optional(values_1.v.array(values_1.v.string())),
        order: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const update = {};
        if (args.text !== undefined)
            update.text = args.text;
        if (args.tags !== undefined)
            update.tags = args.tags;
        if (args.links !== undefined)
            update.links = args.links;
        if (args.order !== undefined)
            update.order = args.order;
        await ctx.db.patch(args.bulletId, update);
    },
});
/**
 * Delete a resume bullet
 */
exports.deleteResumeBullet = (0, server_1.mutation)({
    args: { bulletId: values_1.v.id("resumeBullets") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.bulletId);
    },
});
/**
 * Delete all bullets for a master resume
 */
exports.deleteResumeBulletsByResume = (0, server_1.mutation)({
    args: { masterResumeId: values_1.v.id("masterResumes") },
    handler: async (ctx, args) => {
        const bullets = await ctx.db
            .query("resumeBullets")
            .withIndex("by_resume", (q) => q.eq("masterResumeId", args.masterResumeId))
            .collect();
        for (const bullet of bullets) {
            await ctx.db.delete(bullet._id);
        }
    },
});
