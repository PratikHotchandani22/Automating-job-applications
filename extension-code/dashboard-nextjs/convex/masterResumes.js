"use strict";
// convex/masterResumes.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMasterResume = exports.setActiveMasterResume = exports.createProcessingResume = exports.updateMasterResume = exports.getMasterResume = exports.getActiveMasterResume = exports.getMasterResumeByContentHash = exports.getMasterResumes = exports.createMasterResume = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
const helpers_1 = require("./helpers");
/**
 * Create a new master resume
 */
exports.createMasterResume = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        name: values_1.v.string(),
        contentHash: values_1.v.string(),
        isActive: values_1.v.boolean(),
        header: values_1.v.optional(values_1.v.object({
            fullName: values_1.v.optional(values_1.v.string()),
            email: values_1.v.optional(values_1.v.string()),
            phone: values_1.v.optional(values_1.v.string()),
            address: values_1.v.optional(values_1.v.string()),
            linkedin: values_1.v.optional(values_1.v.string()),
            github: values_1.v.optional(values_1.v.string()),
            portfolio: values_1.v.optional(values_1.v.string()),
            website: values_1.v.optional(values_1.v.string()),
        })),
        summary: values_1.v.optional(values_1.v.string()),
        skills: values_1.v.record(values_1.v.string(), values_1.v.array(values_1.v.string())),
        education: values_1.v.array(values_1.v.object({
            institution: values_1.v.string(),
            degree: values_1.v.string(),
            dates: values_1.v.string(),
            location: values_1.v.optional(values_1.v.string()),
            gpa: values_1.v.optional(values_1.v.string()),
            links: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        awards: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            issuer: values_1.v.string(),
            year: values_1.v.string(),
            details: values_1.v.optional(values_1.v.string()),
        }))),
        mentorship: values_1.v.optional(values_1.v.array(values_1.v.string())),
        links: values_1.v.optional(values_1.v.union(values_1.v.array(values_1.v.string()), values_1.v.object({
            headerLinks: values_1.v.object({
                linkedin: values_1.v.optional(values_1.v.string()),
                github: values_1.v.optional(values_1.v.string()),
                portfolio: values_1.v.optional(values_1.v.string()),
                other: values_1.v.optional(values_1.v.array(values_1.v.string())),
            }),
            projectLinks: values_1.v.array(values_1.v.object({
                projectName: values_1.v.string(),
                links: values_1.v.array(values_1.v.string()),
            })),
            allLinks: values_1.v.array(values_1.v.string()),
        }))),
        customLatexTemplate: values_1.v.optional(values_1.v.string()),
        processingStatus: values_1.v.optional(values_1.v.string()),
        processingError: values_1.v.optional(values_1.v.string()),
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
exports.getMasterResumes = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        const resumes = await ctx.db
            .query("masterResumes")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();
        return (0, helpers_1.filterNotDeleted)(resumes);
    },
});
/**
 * Get master resume by content hash for a user
 */
exports.getMasterResumeByContentHash = (0, server_1.query)({
    args: { userId: values_1.v.id("users"), contentHash: values_1.v.string() },
    handler: async (ctx, args) => {
        const resumes = await ctx.db
            .query("masterResumes")
            .withIndex("by_content_hash", (q) => q.eq("contentHash", args.contentHash))
            .collect();
        return resumes.find((resume) => resume.userId === args.userId && !resume.isDeleted);
    },
});
/**
 * Get active master resume for a user
 */
exports.getActiveMasterResume = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        const resume = await ctx.db
            .query("masterResumes")
            .withIndex("by_user_active", (q) => q.eq("userId", args.userId).eq("isActive", true))
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
exports.getMasterResume = (0, server_1.query)({
    args: { resumeId: values_1.v.id("masterResumes") },
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
exports.updateMasterResume = (0, server_1.mutation)({
    args: {
        resumeId: values_1.v.id("masterResumes"),
        name: values_1.v.optional(values_1.v.string()),
        contentHash: values_1.v.optional(values_1.v.string()),
        isActive: values_1.v.optional(values_1.v.boolean()),
        header: values_1.v.optional(values_1.v.object({
            fullName: values_1.v.optional(values_1.v.string()),
            email: values_1.v.optional(values_1.v.string()),
            phone: values_1.v.optional(values_1.v.string()),
            address: values_1.v.optional(values_1.v.string()),
            linkedin: values_1.v.optional(values_1.v.string()),
            github: values_1.v.optional(values_1.v.string()),
            portfolio: values_1.v.optional(values_1.v.string()),
            website: values_1.v.optional(values_1.v.string()),
        })),
        summary: values_1.v.optional(values_1.v.string()),
        skills: values_1.v.optional(values_1.v.record(values_1.v.string(), values_1.v.array(values_1.v.string()))),
        education: values_1.v.optional(values_1.v.array(values_1.v.object({
            institution: values_1.v.string(),
            degree: values_1.v.string(),
            dates: values_1.v.string(),
            location: values_1.v.optional(values_1.v.string()),
            gpa: values_1.v.optional(values_1.v.string()),
            links: values_1.v.optional(values_1.v.array(values_1.v.string())),
        }))),
        awards: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            issuer: values_1.v.string(),
            year: values_1.v.string(),
            details: values_1.v.optional(values_1.v.string()),
        }))),
        mentorship: values_1.v.optional(values_1.v.array(values_1.v.string())),
        links: values_1.v.optional(values_1.v.union(values_1.v.array(values_1.v.string()), values_1.v.object({
            headerLinks: values_1.v.object({
                linkedin: values_1.v.optional(values_1.v.string()),
                github: values_1.v.optional(values_1.v.string()),
                portfolio: values_1.v.optional(values_1.v.string()),
                other: values_1.v.optional(values_1.v.array(values_1.v.string())),
            }),
            projectLinks: values_1.v.array(values_1.v.object({
                projectName: values_1.v.string(),
                links: values_1.v.array(values_1.v.string()),
            })),
            allLinks: values_1.v.array(values_1.v.string()),
        }))),
        customLatexTemplate: values_1.v.optional(values_1.v.string()),
        processingStatus: values_1.v.optional(values_1.v.string()),
        processingError: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const update = {
            updatedAt: Date.now(),
        };
        // Only include fields that are provided
        if (args.name !== undefined)
            update.name = args.name;
        if (args.contentHash !== undefined)
            update.contentHash = args.contentHash;
        if (args.isActive !== undefined)
            update.isActive = args.isActive;
        if (args.header !== undefined)
            update.header = args.header;
        if (args.summary !== undefined)
            update.summary = args.summary;
        if (args.skills !== undefined)
            update.skills = args.skills;
        if (args.education !== undefined)
            update.education = args.education;
        if (args.awards !== undefined)
            update.awards = args.awards;
        if (args.mentorship !== undefined)
            update.mentorship = args.mentorship;
        if (args.links !== undefined)
            update.links = args.links;
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
exports.createProcessingResume = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        name: values_1.v.string(),
        isActive: values_1.v.boolean(),
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
exports.setActiveMasterResume = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        resumeId: values_1.v.id("masterResumes"),
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
exports.deleteMasterResume = (0, server_1.mutation)({
    args: { resumeId: values_1.v.id("masterResumes") },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.resumeId, {
            isDeleted: true,
            deletedAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});
