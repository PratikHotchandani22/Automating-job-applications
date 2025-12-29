// convex/masterResumes.ts

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { filterNotDeleted } from "./helpers";

/**
 * Create a new master resume
 */
export const createMasterResume = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    contentHash: v.string(),
    isActive: v.boolean(),
    header: v.optional(
      v.object({
        fullName: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        address: v.optional(v.string()),
        linkedin: v.optional(v.string()),
        github: v.optional(v.string()),
        portfolio: v.optional(v.string()),
        website: v.optional(v.string()),
      })
    ),
    summary: v.optional(v.string()),
    skills: v.record(v.string(), v.array(v.string())),
    education: v.array(
      v.object({
        institution: v.string(),
        degree: v.string(),
        dates: v.string(),
        location: v.optional(v.string()),
        gpa: v.optional(v.string()),
        links: v.optional(v.array(v.string())),
      })
    ),
    awards: v.optional(
      v.array(
        v.object({
          name: v.string(),
          issuer: v.string(),
          year: v.string(),
          details: v.optional(v.string()),
        })
      )
    ),
    mentorship: v.optional(v.array(v.string())),
    links: v.optional(
      v.union(
        v.array(v.string()),
        v.object({
          headerLinks: v.object({
            linkedin: v.optional(v.string()),
            github: v.optional(v.string()),
            portfolio: v.optional(v.string()),
            other: v.optional(v.array(v.string())),
          }),
          projectLinks: v.array(
            v.object({
              projectName: v.string(),
              links: v.array(v.string()),
            })
          ),
          allLinks: v.array(v.string()),
        })
      )
    ),
    customLatexTemplate: v.optional(v.string()),
    processingStatus: v.optional(v.string()),
    processingError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // If this is set as active, deactivate other resumes for this user
    if (args.isActive) {
      const existingResumes = await ctx.db
        .query("masterResumes")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      for (const resume of existingResumes) {
        if (resume.isActive && !resume.isDeleted) {
          await ctx.db.patch(resume._id, {
            isActive: false,
            updatedAt: Date.now(),
          });
        }
      }
    }

    const now = Date.now();
    return await ctx.db.insert("masterResumes", {
      userId: args.userId,
      name: args.name,
      contentHash: args.contentHash,
      isActive: args.isActive,
      header: args.header,
      summary: args.summary,
      skills: args.skills,
      education: args.education,
      awards: args.awards,
      mentorship: args.mentorship,
      links: args.links,
      customLatexTemplate: args.customLatexTemplate,
      processingStatus: args.processingStatus,
      processingError: args.processingError,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Get all master resumes for a user (excluding deleted)
 */
export const getMasterResumes = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const resumes = await ctx.db
      .query("masterResumes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return filterNotDeleted(resumes);
  },
});

/**
 * Get master resume by content hash for a user
 */
export const getMasterResumeByContentHash = query({
  args: { userId: v.id("users"), contentHash: v.string() },
  handler: async (ctx, args) => {
    const resumes = await ctx.db
      .query("masterResumes")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", args.contentHash))
      .collect();
    return resumes.find(
      (resume) => resume.userId === args.userId && !resume.isDeleted
    );
  },
});

/**
 * Get active master resume for a user
 */
export const getActiveMasterResume = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const resume = await ctx.db
      .query("masterResumes")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .first();

    if (resume && !resume.isDeleted) {
      return resume;
    }
    return null;
  },
});

/**
 * Get master resume by ID
 */
export const getMasterResume = query({
  args: { resumeId: v.id("masterResumes") },
  handler: async (ctx, args) => {
    const resume = await ctx.db.get(args.resumeId);
    if (resume && !resume.isDeleted) {
      return resume;
    }
    return null;
  },
});

/**
 * Update master resume
 */
export const updateMasterResume = mutation({
  args: {
    resumeId: v.id("masterResumes"),
    name: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    header: v.optional(
      v.object({
        fullName: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        address: v.optional(v.string()),
        linkedin: v.optional(v.string()),
        github: v.optional(v.string()),
        portfolio: v.optional(v.string()),
        website: v.optional(v.string()),
      })
    ),
    summary: v.optional(v.string()),
    skills: v.optional(
      v.record(v.string(), v.array(v.string()))
    ),
    education: v.optional(
      v.array(
        v.object({
          institution: v.string(),
          degree: v.string(),
          dates: v.string(),
          location: v.optional(v.string()),
          gpa: v.optional(v.string()),
          links: v.optional(v.array(v.string())),
        })
      )
    ),
    awards: v.optional(
      v.array(
        v.object({
          name: v.string(),
          issuer: v.string(),
          year: v.string(),
          details: v.optional(v.string()),
        })
      )
    ),
    mentorship: v.optional(v.array(v.string())),
    links: v.optional(
      v.union(
        v.array(v.string()),
        v.object({
          headerLinks: v.object({
            linkedin: v.optional(v.string()),
            github: v.optional(v.string()),
            portfolio: v.optional(v.string()),
            other: v.optional(v.array(v.string())),
          }),
          projectLinks: v.array(
            v.object({
              projectName: v.string(),
              links: v.array(v.string()),
            })
          ),
          allLinks: v.array(v.string()),
        })
      )
    ),
    customLatexTemplate: v.optional(v.string()),
    processingStatus: v.optional(v.string()),
    processingError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: any = {
      updatedAt: Date.now(),
    };

    // Only include fields that are provided
    if (args.name !== undefined) update.name = args.name;
    if (args.contentHash !== undefined) update.contentHash = args.contentHash;
    if (args.isActive !== undefined) update.isActive = args.isActive;
    if (args.header !== undefined) update.header = args.header;
    if (args.summary !== undefined) update.summary = args.summary;
    if (args.skills !== undefined) update.skills = args.skills;
    if (args.education !== undefined) update.education = args.education;
    if (args.awards !== undefined) update.awards = args.awards;
    if (args.mentorship !== undefined) update.mentorship = args.mentorship;
    if (args.links !== undefined) update.links = args.links;
    if (args.customLatexTemplate !== undefined)
      update.customLatexTemplate = args.customLatexTemplate;
    if (args.processingStatus !== undefined)
      update.processingStatus = args.processingStatus;
    if (args.processingError !== undefined)
      update.processingError = args.processingError;

    await ctx.db.patch(args.resumeId, update);
  },
});

/**
 * Create a processing resume placeholder
 */
export const createProcessingResume = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("masterResumes", {
      userId: args.userId,
      name: args.name,
      contentHash: `processing:${now}`,
      isActive: args.isActive,
      skills: {},
      education: [],
      processingStatus: "extracting_structured_resume",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Set a resume as active (deactivates others)
 */
export const setActiveMasterResume = mutation({
  args: {
    userId: v.id("users"),
    resumeId: v.id("masterResumes"),
  },
  handler: async (ctx, args) => {
    // Deactivate all other resumes for this user
    const existingResumes = await ctx.db
      .query("masterResumes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const resume of existingResumes) {
      if (resume._id !== args.resumeId && resume.isActive) {
        await ctx.db.patch(resume._id, {
          isActive: false,
          updatedAt: Date.now(),
        });
      }
    }

    // Activate the specified resume
    await ctx.db.patch(args.resumeId, {
      isActive: true,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Soft-delete a master resume
 */
export const deleteMasterResume = mutation({
  args: { resumeId: v.id("masterResumes") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.resumeId, {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
