/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applicationTracking from "../applicationTracking.js";
import type * as evidenceScores from "../evidenceScores.js";
import type * as generatedArtifacts from "../generatedArtifacts.js";
import type * as helpers from "../helpers.js";
import type * as jdRubrics from "../jdRubrics.js";
import type * as jobs from "../jobs.js";
import type * as latexGenerator from "../latexGenerator.js";
import type * as masterResumes from "../masterResumes.js";
import type * as resumeBulletEmbeddings from "../resumeBulletEmbeddings.js";
import type * as resumeBullets from "../resumeBullets.js";
import type * as resumeExtraction from "../resumeExtraction.js";
import type * as resumeParsing from "../resumeParsing.js";
import type * as resumePipeline from "../resumePipeline.js";
import type * as runDetails from "../runDetails.js";
import type * as runs from "../runs.js";
import type * as selectionPlans from "../selectionPlans.js";
import type * as tailoredResumes from "../tailoredResumes.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applicationTracking: typeof applicationTracking;
  evidenceScores: typeof evidenceScores;
  generatedArtifacts: typeof generatedArtifacts;
  helpers: typeof helpers;
  jdRubrics: typeof jdRubrics;
  jobs: typeof jobs;
  latexGenerator: typeof latexGenerator;
  masterResumes: typeof masterResumes;
  resumeBulletEmbeddings: typeof resumeBulletEmbeddings;
  resumeBullets: typeof resumeBullets;
  resumeExtraction: typeof resumeExtraction;
  resumeParsing: typeof resumeParsing;
  resumePipeline: typeof resumePipeline;
  runDetails: typeof runDetails;
  runs: typeof runs;
  selectionPlans: typeof selectionPlans;
  tailoredResumes: typeof tailoredResumes;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
