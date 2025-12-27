// convex/resumeBullets.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Create a resume bullet
 */
export const createResumeBullet = mutation({
  args: {
    masterResumeId: v.id("masterResumes"),
    bulletId: v.string(),
    parentType: v.union(v.literal("experience"), v.literal("project")),
    parentId: v.string(),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    projectName: v.optional(v.string()),
    dates: v.optional(v.string()),
    location: v.optional(v.string()),
    text: v.string(),
    tags: v.optional(v.array(v.string())),
    links: v.optional(v.array(v.string())),
    order: v.number(),
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
export const createResumeBullets = mutation({
  args: {
    bullets: v.array(
      v.object({
        masterResumeId: v.id("masterResumes"),
        bulletId: v.string(),
        parentType: v.union(v.literal("experience"), v.literal("project")),
        parentId: v.string(),
        company: v.optional(v.string()),
        role: v.optional(v.string()),
        projectName: v.optional(v.string()),
        dates: v.optional(v.string()),
        location: v.optional(v.string()),
        text: v.string(),
        tags: v.optional(v.array(v.string())),
        links: v.optional(v.array(v.string())),
        order: v.number(),
      })
    ),
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
export const getResumeBullets = query({
  args: { masterResumeId: v.id("masterResumes") },
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
export const getResumeBulletsByParent = query({
  args: {
    masterResumeId: v.id("masterResumes"),
    parentType: v.union(v.literal("experience"), v.literal("project")),
    parentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("resumeBullets")
      .withIndex("by_parent", (q) =>
        q
          .eq("masterResumeId", args.masterResumeId)
          .eq("parentType", args.parentType)
          .eq("parentId", args.parentId)
      )
      .collect();
  },
});

/**
 * Update a resume bullet
 */
export const updateResumeBullet = mutation({
  args: {
    bulletId: v.id("resumeBullets"),
    text: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    links: v.optional(v.array(v.string())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const update: any = {};
    if (args.text !== undefined) update.text = args.text;
    if (args.tags !== undefined) update.tags = args.tags;
    if (args.links !== undefined) update.links = args.links;
    if (args.order !== undefined) update.order = args.order;

    await ctx.db.patch(args.bulletId, update);
  },
});

/**
 * Delete a resume bullet
 */
export const deleteResumeBullet = mutation({
  args: { bulletId: v.id("resumeBullets") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.bulletId);
  },
});

/**
 * Delete all bullets for a master resume
 */
export const deleteResumeBulletsByResume = mutation({
  args: { masterResumeId: v.id("masterResumes") },
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
