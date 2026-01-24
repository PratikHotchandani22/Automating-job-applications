"use strict";
// convex/jdRubrics.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJdRubric = exports.createJdRubric = void 0;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
/**
 * Create a JD rubric
 */
exports.createJdRubric = (0, server_1.mutation)({
    args: {
        runId: values_1.v.id("runs"),
        version: values_1.v.string(),
        jobMeta: values_1.v.object({
            jobTitle: values_1.v.string(),
            company: values_1.v.optional(values_1.v.string()),
            location: values_1.v.optional(values_1.v.string()),
            employmentType: values_1.v.optional(values_1.v.string()),
            seniority: values_1.v.optional(values_1.v.string()),
            jobUrl: values_1.v.optional(values_1.v.string()),
            platform: values_1.v.optional(values_1.v.string()),
        }),
        requirements: values_1.v.array(values_1.v.object({
            reqId: values_1.v.string(),
            type: values_1.v.union(values_1.v.literal("must"), values_1.v.literal("nice")),
            weight: values_1.v.number(),
            requirement: values_1.v.string(),
            jdEvidence: values_1.v.array(values_1.v.string()),
            category: values_1.v.string(),
        })),
        keywords: values_1.v.array(values_1.v.object({
            term: values_1.v.string(),
            importance: values_1.v.number(),
            type: values_1.v.string(),
            jdEvidence: values_1.v.array(values_1.v.string()),
        })),
        constraints: values_1.v.optional(values_1.v.object({
            yearsExperienceMin: values_1.v.optional(values_1.v.number()),
            education: values_1.v.optional(values_1.v.array(values_1.v.string())),
            certifications: values_1.v.optional(values_1.v.array(values_1.v.string())),
            workAuthorization: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        notes: values_1.v.optional(values_1.v.object({
            summary: values_1.v.optional(values_1.v.string()),
            ambiguities: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        rubricHash: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("jdRubrics", {
            runId: args.runId,
            version: args.version,
            jobMeta: args.jobMeta,
            requirements: args.requirements,
            keywords: args.keywords,
            constraints: args.constraints,
            notes: args.notes,
            rubricHash: args.rubricHash,
            createdAt: Date.now(),
        });
    },
});
/**
 * Get JD rubric for a run
 */
exports.getJdRubric = (0, server_1.query)({
    args: { runId: values_1.v.id("runs") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("jdRubrics")
            .withIndex("by_run", (q) => q.eq("runId", args.runId))
            .first();
    },
});
