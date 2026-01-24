"use strict";
// convex/tailoredResumes.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTailoredResumes = exports.getTailoredResumeByModel = exports.getTailoredResume = exports.createTailoredResume = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
const helpers_1 = require("./helpers");
/**
 * Create a tailored resume
 */
exports.createTailoredResume = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        modelName: values_1.v.string(),
        tailoredHash: values_1.v.string(),
        summary: values_1.v.string(),
        coverLetter: values_1.v.optional(values_1.v.string()),
        diagnostics: values_1.v.optional(values_1.v.string()),
        reasoningSummary: values_1.v.optional(values_1.v.string()),
        workExperience: values_1.v.array(values_1.v.object({
            roleId: values_1.v.string(),
            company: values_1.v.string(),
            title: values_1.v.string(),
            dateRange: values_1.v.string(),
            location: values_1.v.optional(values_1.v.string()),
            bullets: values_1.v.array(values_1.v.object({
                bulletId: values_1.v.string(),
                originalText: values_1.v.string(),
                tailoredText: values_1.v.string(),
                wasRewritten: values_1.v.boolean(),
            })),
        })),
        projects: values_1.v.array(values_1.v.object({
            projectId: values_1.v.string(),
            name: values_1.v.string(),
            date: values_1.v.optional(values_1.v.string()),
            links: values_1.v.optional(values_1.v.array(values_1.v.string())),
            bullets: values_1.v.array(values_1.v.object({
                bulletId: values_1.v.string(),
                originalText: values_1.v.string(),
                tailoredText: values_1.v.string(),
                wasRewritten: values_1.v.boolean(),
            })),
        })),
        education: values_1.v.array(values_1.v.object({
            institution: values_1.v.string(),
            degree: values_1.v.string(),
            dates: values_1.v.string(),
            location: values_1.v.optional(values_1.v.string()),
            gpa: values_1.v.optional(values_1.v.string()),
        })),
        skills: values_1.v.record(values_1.v.string(), values_1.v.array(values_1.v.string())),
        awards: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            issuer: values_1.v.string(),
            year: values_1.v.string(),
            details: values_1.v.optional(values_1.v.string()),
        }))),
        selectionEnforcement: values_1.v.object({
            strippedUnselected: values_1.v.number(),
            truncatedBullets: values_1.v.number(),
            repairApplied: values_1.v.boolean(),
            compliant: values_1.v.boolean(),
            proxyWordCountExceeded: values_1.v.boolean(),
        }),
        wordCountEstimate: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        const modelKey = (0, helpers_1.deriveModelKey)(args.modelName);
        return await ctx.db.insert("tailoredResumes", {
            runId: args.runId,
            modelKey,
            modelName: args.modelName,
            tailoredHash: args.tailoredHash,
            summary: args.summary,
            coverLetter: args.coverLetter,
            diagnostics: args.diagnostics,
            reasoningSummary: args.reasoningSummary,
            workExperience: args.workExperience,
            projects: args.projects,
            education: args.education,
            skills: args.skills,
            awards: args.awards,
            selectionEnforcement: args.selectionEnforcement,
            wordCountEstimate: args.wordCountEstimate,
            createdAt: Date.now(),
        });
    },
});
/**
 * Get tailored resume for a run
 */
exports.getTailoredResume = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("tailoredResumes")
            .withIndex("by_run", (q) => q.eq("runId", args.runId))
            .first();
    },
});
/**
 * Get tailored resume by run and model
 */
exports.getTailoredResumeByModel = (0, server_1.query)({
    args: {
        runId: values_1.v.id("runs"),
        modelKey: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("tailoredResumes")
            .withIndex("by_run_model", (q) => q.eq("runId", args.runId).eq("modelKey", args.modelKey))
            .first();
    },
});
/**
 * Get all tailored resumes for a run
 */
exports.getTailoredResumes = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("tailoredResumes")
            .withIndex("by_run", (q) => q.eq("runId", args.runId))
            .collect();
    },
});
