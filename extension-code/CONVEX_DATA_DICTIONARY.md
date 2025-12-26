# Convex Data Dictionary

## Project: Resume Intelligence Platform
### Backend: Convex

---

## Table of Contents
1. [Overview](#overview)
2. [User Lifecycle](#user-lifecycle)
3. [Data Model Diagram](#data-model-diagram)
4. [Shared Type Definitions](#shared-type-definitions)
5. [Tables](#tables)
   - [users](#1-users)
   - [masterResumes](#2-masterresumes)
   - [resumeBullets](#3-resumebullets)
   - [resumeBulletEmbeddings](#4-resumebulletembeddings)
   - [evidenceScores](#5-evidencescores)
   - [jobs](#6-jobs)
   - [runs](#7-runs)
   - [jdRubrics](#8-jdrubrics)
   - [selectionPlans](#9-selectionplans)
   - [tailoredResumes](#10-tailoredresumes)
   - [generatedArtifacts](#11-generatedartifacts)
   - [applicationTracking](#12-applicationtracking)
6. [Indexes](#indexes)
7. [Uniqueness & Deduplication](#uniqueness--deduplication)
8. [Data Lifecycle & Retention](#data-lifecycle--retention)
9. [Convex Schema Definition](#convex-schema-definition)

---

## Overview

This data dictionary defines the backend schema for a resume intelligence platform that:
1. **Onboards users** and manages their master resumes
2. **Pre-computes embeddings and evidence scores** for resume bullets (one-time per resume)
3. **Scrapes job descriptions** and generates structured rubrics
4. **Matches and selects** optimal bullets for each job
5. **Tailors resumes** using LLM and generates PDF artifacts
6. **Tracks application status** and outcomes

---

## User Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER ONBOARDING (ONE-TIME)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User signs up / authenticates                                            │
│     └─► CREATE: users                                                        │
│                                                                              │
│  2. User uploads or creates master resume                                    │
│     └─► CREATE: masterResumes                                                │
│     └─► CREATE: resumeBullets (extracted from resume)                        │
│                                                                              │
│  3. System pre-computes (background job, cached)                             │
│     └─► CREATE: resumeBulletEmbeddings (one doc per bullet embedding)        │
│     └─► CREATE: evidenceScores (quality scores per bullet)                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        JOB APPLICATION FLOW (PER JOB)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  4. User scrapes a job posting                                               │
│     └─► CREATE: jobs                                                         │
│     └─► CREATE: runs (links user, resume, job)                               │
│                                                                              │
│  5. System generates rubric from JD                                          │
│     └─► CREATE: jdRubrics (requirements, keywords, constraints)              │
│     └─► UPDATE: runs.stage = "rubric_generated"                              │
│                                                                              │
│  6. System computes JD embeddings + selects bullets                          │
│     └─► CREATE: selectionPlans (matched bullets, coverage)                   │
│     └─► UPDATE: runs.stage = "selection_complete"                            │
│                                                                              │
│  7. LLM tailors resume content                                               │
│     └─► CREATE: tailoredResumes (rewritten bullets, summary)                 │
│     └─► UPDATE: runs.stage = "tailored"                                      │
│                                                                              │
│  8. Generate LaTeX + PDF                                                     │
│     └─► CREATE: generatedArtifacts (PDF, TEX, etc.)                          │
│     └─► UPDATE: runs.status = "success"                                      │
│                                                                              │
│  9. User tracks application                                                  │
│     └─► CREATE/UPDATE: applicationTracking                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Diagram

```
┌──────────────┐          ┌──────────────────┐
│    users     │──────────│  masterResumes   │
│              │  1:N     │                  │
└──────────────┘          └────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
            ┌─────────────┐ ┌────────────────────┐ ┌──────────────┐
            │resumeBullets│ │resumeBulletEmbeddings│ │evidenceScores│
            └─────────────┘ └────────────────────┘ └──────────────┘
                                   
┌──────────────┐          ┌──────────────────┐
│    users     │──────────│      jobs        │
│              │  1:N     │                  │
└──────────────┘          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │      runs        │ ◄─── Central orchestration table
                          └────────┬─────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
   ┌─────────────┐         ┌──────────────┐        ┌─────────────────┐
   │  jdRubrics  │         │selectionPlans│        │ tailoredResumes │
   └─────────────┘         └──────────────┘        └─────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │generatedArtifacts│
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │applicationTracking│
                          └──────────────────┘
```

---

## Shared Type Definitions

These reusable types are referenced across multiple tables for consistency and type safety.

### `RunStage` (Enum)

Used by `runs.stage` to enforce valid pipeline stages. Using a strict union prevents typos and improves analytics/filtering.

```typescript
type RunStage =
  | "initialized"        // Run created
  | "extracting"         // Extracting job text
  | "rubric_generating"  // Generating JD rubric
  | "rubric_generated"   // Rubric complete
  | "embedding_jd"       // Computing JD embeddings
  | "selecting"          // Running selection algorithm
  | "selection_complete" // Bullets selected
  | "tailoring"          // LLM rewriting bullets
  | "tailored"           // Tailoring complete
  | "generating_latex"   // Creating LaTeX
  | "generating_pdf"     // Compiling PDF
  | "DONE"               // Pipeline complete
  | "ERROR";             // Pipeline failed
```

### `SelectedBullet`

Represents a bullet selected for inclusion in a tailored resume. Used in `selectionPlans.selected`.

```typescript
interface SelectedBullet {
  bulletId: string;                    // Unique ID (e.g., "exp_bose_ds_intern_b1")
  parentType: "experience" | "project" | "award";
  parentId: string;                    // Role or project ID
  originalText: string;                // Original bullet text
  
  // Context fields (populated based on parentType)
  company?: string;                    // For experience bullets
  role?: string;                       // For experience bullets
  dateRange?: string;                  // Date range if available
  
  // Selection metadata
  evidence: {
    score: number;                     // 0.0 - 1.0
    tier: "strong" | "medium" | "weak";
  };
  matches: Array<{
    reqId: string;                     // Requirement ID matched
    rel: number;                       // Relevance score
    edgeScore: number;                 // Combined edge score
  }>;
  redundancy: {
    maxSim: number;                    // Max similarity to other selected bullets
    blocked: boolean;                  // Was this blocked by redundancy?
    penalty: number;                   // Redundancy penalty applied
  };
  rewriteIntent: "light" | "medium" | "heavy";
  reasons: string[];                   // Why this bullet was selected
}
```

> **Why typed?** Strongly typing `SelectedBullet` enables:
> - **UI rendering**: Components can safely access nested fields
> - **Diffing**: Compare selection plans across runs
> - **Validation**: Catch malformed data at insert time

### `ModelKey`

A stable identifier for model variants, used consistently across `runs`, `tailoredResumes`, and `generatedArtifacts` for easy joins.

```typescript
// Derived from: modelName (sanitized, lowercase, hyphens for spaces)
// Examples: "gpt-5", "gpt-4o-mini", "gpt-5-nano"
type ModelKey = string;

// Generation logic (for documentation):
function deriveModelKey(modelName: string): ModelKey {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
}
```

> **Usage**: When joining `tailoredResumes` or `generatedArtifacts` with `runs.modelVariants`, use `modelKey` for consistent lookups.

---

## Tables

### 1. `users`

**Purpose:** Store user identity and preferences.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"users">` | Auto | Convex document ID |
| `clerkId` | `string` | Yes | External auth provider ID (Clerk/Auth0) |
| `email` | `string` | Yes | User's email address |
| `fullName` | `string` | No | User's display name |
| `avatarUrl` | `string` | No | Profile picture URL |
| `defaultMasterResumeId` | `Id<"masterResumes">` | No | Currently active resume |
| `settings` | `object` | No | User preferences (see below) |
| `createdAt` | `number` | Yes | Unix timestamp |
| `updatedAt` | `number` | Yes | Unix timestamp |

**Settings Object:**
```typescript
{
  preferredModels?: string[];        // ["gpt-5", "gpt-4o-mini"]
  embeddingModel?: string;           // "text-embedding-3-large"
  embeddingDims?: number;            // 3072
  latexTemplate?: string;            // "default" | "custom"
  promptVersions?: {
    tailor?: string;                 // "latest_v4_selection"
    latex?: string;                  // "legacy"
    rubric?: string;                 // "latest_v1"
  };
}
```

**Uniqueness / Dedupe:**
- `clerkId` must be unique per user. See [Uniqueness & Deduplication](#uniqueness--deduplication).

---

### 2. `masterResumes`

**Purpose:** Store user's master resume data (the source of truth).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"masterResumes">` | Auto | Convex document ID |
| `userId` | `Id<"users">` | Yes | Owner of this resume |
| `name` | `string` | Yes | Resume name/label (e.g., "Data Science Focus") |
| `contentHash` | `string` | Yes | SHA-256 hash of content for cache invalidation |
| `isActive` | `boolean` | Yes | Is this the default resume? |
| `summary` | `string` | No | Professional summary |
| `skills` | `object` | Yes | Categorized skills (see below) |
| `education` | `array` | Yes | Education entries |
| `awards` | `array` | No | Awards and recognitions |
| `mentorship` | `array` | No | Mentorship activities |
| `links` | `array` | No | Portfolio/GitHub/LinkedIn |
| `customLatexTemplate` | `string` | No | User's custom LaTeX template |
| `isDeleted` | `boolean` | No | Soft-delete flag (default: false) |
| `deletedAt` | `number` | No | Unix timestamp of deletion |
| `createdAt` | `number` | Yes | Unix timestamp |
| `updatedAt` | `number` | Yes | Unix timestamp |

**Skills Object:**
```typescript
{
  programming_languages: string[];
  frameworks_libraries: string[];
  tools_cloud_technologies: string[];
  data_science_analytics: string[];
  machine_learning_ai: string[];
  other_skills: string[];
}
```

**Education Entry:**
```typescript
{
  institution: string;
  degree: string;
  dates: string;
  location?: string;
  gpa?: string;
  links?: string[];
}
```

---

### 3. `resumeBullets`

**Purpose:** Individual bullet points extracted from work experience and projects.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"resumeBullets">` | Auto | Convex document ID |
| `masterResumeId` | `Id<"masterResumes">` | Yes | Parent resume |
| `bulletId` | `string` | Yes | Unique ID within resume (e.g., "exp_bose_ds_intern_b1") |
| `parentType` | `"experience" \| "project"` | Yes | Source section |
| `parentId` | `string` | Yes | Role or project ID |
| `company` | `string` | No | Company name (for experience) |
| `role` | `string` | No | Job title (for experience) |
| `projectName` | `string` | No | Project name (for projects) |
| `dates` | `string` | No | Date range |
| `location` | `string` | No | Work location |
| `text` | `string` | Yes | The actual bullet point text |
| `tags` | `array` | No | Skill/technology tags |
| `order` | `number` | Yes | Display order within parent |
| `createdAt` | `number` | Yes | Unix timestamp |

---

### 4. `resumeBulletEmbeddings`

**Purpose:** Vector embeddings for individual resume bullets. One document per bullet per embedding configuration (model + config hash). This design avoids storing large arrays in a single document, improving query performance and enabling incremental updates.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"resumeBulletEmbeddings">` | Auto | Convex document ID |
| `userId` | `Id<"users">` | Yes | Owner (for query filtering) |
| `masterResumeId` | `Id<"masterResumes">` | Yes | Parent resume |
| `masterResumeHash` | `string` | Yes | Resume content hash (cache key) |
| `bulletId` | `string` | Yes | Unique bullet ID within resume |
| `embedKeyHash` | `string` | Yes | Hash of embedding config (model + dims + preprocess version) |
| `embeddingModel` | `string` | Yes | Model used (e.g., "text-embedding-3-large") |
| `dims` | `number` | Yes | Vector dimensions (e.g., 3072) |
| `embedding` | `number[]` | Yes | The embedding vector |
| `createdAt` | `number` | Yes | Unix timestamp |

**Why per-bullet documents?**
- Avoids Convex document size limits for resumes with many bullets
- Enables incremental recomputation when a single bullet changes
- Allows efficient queries for specific bullets without loading all embeddings
- Better parallelization for bulk embedding operations

**Indexes:**
- `by_resume`: `["masterResumeId"]` — Get all embeddings for a resume
- `by_cache_key`: `["masterResumeHash", "embedKeyHash"]` — Check if embeddings exist for this resume version + config
- `by_bullet`: `["masterResumeId", "bulletId", "embedKeyHash"]` — Lookup specific bullet embedding

---

### 5. `evidenceScores`

**Purpose:** Quality/evidence scores for resume bullets (cached).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"evidenceScores">` | Auto | Convex document ID |
| `masterResumeId` | `Id<"masterResumes">` | Yes | Parent resume |
| `masterResumeHash` | `string` | Yes | Resume content hash |
| `rulesHash` | `string` | Yes | Evidence rules version hash |
| `rulesVersion` | `string` | Yes | Evidence rules version (e.g., "v1") |
| `scores` | `array` | Yes | Array of bullet scores (see below) |
| `cachedAt` | `number` | Yes | Unix timestamp |

**Score Entry:**
```typescript
{
  bulletId: string;
  score: number;                  // 0.0 - 1.0
  tier: "strong" | "medium" | "weak";
  breakdown: {
    action: number;               // Strong action verb score
    tools: number;                // Technology mentions
    outcome: number;              // Quantified outcomes
    metric: number;               // Specific metrics
    scope: number;                // Scale/scope indicators
  };
  fluffPenalty: number;           // Penalty for vague language
  matchedTools: string[];         // Technologies found
  matchedVerbs: string[];         // Action verbs found
}
```

---

### 6. `jobs`

**Purpose:** Scraped job postings.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"jobs">` | Auto | Convex document ID |
| `userId` | `Id<"users">` | Yes | User who scraped this job |
| `jobUrl` | `string` | Yes | Original job posting URL |
| `platform` | `string` | Yes | Source platform (linkedin, greenhouse, etc.) |
| `title` | `string` | Yes | Job title |
| `company` | `string` | No | Company name |
| `location` | `string` | No | Job location |
| `salary` | `string` | No | Salary range if available |
| `employmentType` | `string` | No | Full-time, Contract, etc. |
| `seniority` | `string` | No | Entry, Mid, Senior, etc. |
| `rawDescription` | `string` | Yes | Raw scraped job description |
| `extractedText` | `string` | No | Cleaned/extracted text |
| `descriptionHash` | `string` | Yes | Hash for deduplication |
| `userTags` | `array` | No | User-applied tags |
| `notes` | `string` | No | User notes |
| `isFavorite` | `boolean` | No | User bookmarked |
| `isDeleted` | `boolean` | No | Soft-delete flag (default: false) |
| `deletedAt` | `number` | No | Unix timestamp of deletion |
| `createdAt` | `number` | Yes | Unix timestamp |
| `updatedAt` | `number` | Yes | Unix timestamp |

**Uniqueness / Dedupe:**
- `(userId, descriptionHash)` should be unique to prevent duplicate job imports. See [Uniqueness & Deduplication](#uniqueness--deduplication).

---

### 7. `runs`

**Purpose:** Central orchestration table tracking each resume tailoring run.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"runs">` | Auto | Convex document ID |
| `runId` | `string` | Yes | Human-readable run ID (UUID) |
| `userId` | `Id<"users">` | Yes | Owner |
| `masterResumeId` | `Id<"masterResumes">` | Yes | Resume used |
| `jobId` | `Id<"jobs">` | Yes | Job being applied to |
| `status` | `RunStatus` | Yes | See status union below |
| `stage` | `RunStage` | Yes | Current pipeline stage (strict enum) |
| `errorMessage` | `string` | No | Error details if failed |
| `mockMode` | `boolean` | No | Test run without LLM calls |
| `promptVersions` | `object` | No | Versions of prompts used |
| `promptHashes` | `object` | No | Hashes of prompts for reproducibility |
| `modelVariants` | `ModelKey[]` | No | Model keys used for this run |
| `primaryModelKey` | `ModelKey` | No | Primary model for this run |
| `timing` | `object` | No | Performance metrics |
| `cacheHits` | `object` | No | Which caches were used |
| `startedAt` | `number` | No | Pipeline start time |
| `completedAt` | `number` | No | Pipeline completion time |
| `isDeleted` | `boolean` | No | Soft-delete flag (default: false) |
| `deletedAt` | `number` | No | Unix timestamp of deletion |
| `createdAt` | `number` | Yes | Unix timestamp |
| `updatedAt` | `number` | Yes | Unix timestamp |

**Status (Union Type):**
```typescript
type RunStatus = "pending" | "running" | "success" | "error";
```

**Stage (Strict Enum):**
See [`RunStage`](#runstage-enum) in Shared Type Definitions. Using a strict union:
- Prevents typos in stage names
- Enables exhaustive switch statements in TypeScript
- Improves analytics queries (no string normalization needed)

**Timing Object:**
```typescript
{
  rubricMs?: number;
  embeddingMs?: number;
  selectionMs?: number;
  tailorMs?: number;
  latexMs?: number;
  pdfMs?: number;
  totalMs?: number;
}
```

**Uniqueness / Dedupe:**
- `runId` must be unique. See [Uniqueness & Deduplication](#uniqueness--deduplication).

---

### 8. `jdRubrics`

**Purpose:** Structured requirements extracted from job descriptions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"jdRubrics">` | Auto | Convex document ID |
| `runId` | `Id<"runs">` | Yes | Parent run |
| `version` | `string` | Yes | Rubric schema version |
| `jobMeta` | `object` | Yes | Job metadata |
| `requirements` | `array` | Yes | Array of requirements |
| `keywords` | `array` | Yes | Important keywords/skills |
| `constraints` | `object` | No | Experience, education, certs |
| `notes` | `object` | No | Summary, ambiguities |
| `rubricHash` | `string` | Yes | Content hash |
| `createdAt` | `number` | Yes | Unix timestamp |

**Requirement Entry:**
```typescript
{
  reqId: string;                  // "R1", "R2", etc.
  type: "must" | "nice";          // Required vs preferred
  weight: number;                 // 1-5 importance
  requirement: string;            // Human-readable requirement
  jdEvidence: string[];           // Quotes from JD
  category: string;               // ml, security, other, etc.
}
```

**Keyword Entry:**
```typescript
{
  term: string;
  importance: number;             // 1-5
  type: "skill" | "tool" | "domain" | "methodology";
  jdEvidence: string[];
}
```

---

### 9. `selectionPlans`

**Purpose:** Which bullets were selected for this job and why.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"selectionPlans">` | Auto | Convex document ID |
| `runId` | `Id<"runs">` | Yes | Parent run |
| `version` | `string` | Yes | Selection algorithm version |
| `masterResumeHash` | `string` | Yes | Resume hash |
| `jobExtractedHash` | `string` | Yes | JD hash |
| `rubricHash` | `string` | Yes | Rubric hash |
| `embeddingModel` | `string` | Yes | Model used for similarity |
| `config` | `SelectionConfig` | Yes | Selection configuration (see below) |
| `coverage` | `CoverageStats` | Yes | Coverage statistics |
| `selected` | `SelectedContent` | Yes | Selected bullets by section (strongly typed) |
| `budgetsUsed` | `BudgetsUsed` | Yes | Bullets used per section |
| `selectionNotes` | `object` | No | Dropped bullets and reasons |
| `createdAt` | `number` | Yes | Unix timestamp |

**SelectionConfig Object:**
```typescript
{
  configVersion: string;
  budgets: {
    targetResumeWordsMin: number;
    targetResumeWordsMax: number;
    experienceBulletsMin: number;
    experienceBulletsMax: number;
    projectBulletsMin: number;
    projectBulletsMax: number;
    awardLinesMin: number;
    awardLinesMax: number;
    perRoleCaps: {
      mostRecent: number;
      next: number;
      older: number;
    };
    maxBulletsPerRequirement: number;
  };
  thresholds: {
    mustMinRel: number;
    niceMinRel: number;
    coverThreshold: number;
    redundancy: {
      hardBlock: number;
      penaltyStart: number;
    };
    minEvidenceTierNice: "strong" | "medium" | "weak";
  };
  weights: {
    edge: { wRel: number; wEvd: number; wRed: number; wRisk: number };
    fill: { alpha: number; beta: number; gamma: number };
  };
}
```

**CoverageStats Object:**
```typescript
{
  mustTotal: number;
  niceTotal: number;
  mustCovered: number;
  niceCovered: number;
  uncoveredRequirements: Array<{
    reqId: string;
    type: "must" | "nice";
    weight: number;
    reason: string;
  }>;
}
```

**SelectedContent Object (Strongly Typed):**
```typescript
{
  workExperience: SelectedBullet[];   // See SelectedBullet type definition
  projects: SelectedBullet[];
  awards: SelectedBullet[];
}
```

> **Why strongly typed?** See [`SelectedBullet`](#selectedbullet) in Shared Type Definitions for benefits.

**BudgetsUsed Object:**
```typescript
{
  experienceBullets: number;
  projectBullets: number;
  awardLines: number;
  perRole: Record<string, number>;  // roleId -> bullet count
}
```

**SelectionNotes Object:**
```typescript
{
  droppedDueToRedundancy?: string[];  // Bullet IDs
  droppedDueToBudget?: string[];      // Bullet IDs
}
```

---

### 10. `tailoredResumes`

**Purpose:** LLM-rewritten resume content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"tailoredResumes">` | Auto | Convex document ID |
| `runId` | `Id<"runs">` | Yes | Parent run |
| `modelKey` | `ModelKey` | Yes | Stable model identifier for joins |
| `modelName` | `string` | Yes | Human-readable model name (e.g., "GPT-5") |
| `tailoredHash` | `string` | Yes | Content hash |
| `summary` | `string` | Yes | Tailored professional summary |
| `workExperience` | `array` | Yes | Rewritten experience bullets |
| `projects` | `array` | Yes | Rewritten project bullets |
| `education` | `EducationEntry[]` | Yes | Education (usually unchanged) |
| `skills` | `SkillsObject` | Yes | Potentially reordered skills |
| `awards` | `AwardEntry[]` | No | Selected awards |
| `selectionEnforcement` | `object` | Yes | Compliance checks |
| `wordCountEstimate` | `number` | Yes | Resume word count |
| `createdAt` | `number` | Yes | Unix timestamp |

**Work Experience Entry:**
```typescript
{
  roleId: string;
  company: string;
  title: string;
  dateRange: string;
  location?: string;
  bullets: Array<{
    bulletId: string;
    originalText: string;
    tailoredText: string;
    wasRewritten: boolean;
  }>;
}
```

**Project Entry:**
```typescript
{
  projectId: string;
  name: string;
  date?: string;
  bullets: Array<{
    bulletId: string;
    originalText: string;
    tailoredText: string;
    wasRewritten: boolean;
  }>;
}
```

**EducationEntry:**
```typescript
{
  institution: string;
  degree: string;
  dates: string;
  location?: string;
  gpa?: string;
}
```

**AwardEntry:**
```typescript
{
  name: string;
  issuer: string;
  year: string;
  details?: string;
}
```

**SelectionEnforcement Object:**
```typescript
{
  strippedUnselected: number;
  truncatedBullets: number;
  repairApplied: boolean;
  compliant: boolean;
  proxyWordCountExceeded: boolean;
}
```

---

### 11. `generatedArtifacts`

**Purpose:** Final output files (PDFs, LaTeX, etc.).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"generatedArtifacts">` | Auto | Convex document ID |
| `runId` | `Id<"runs">` | Yes | Parent run |
| `modelKey` | `ModelKey` | No | Stable model identifier for joins |
| `artifactType` | `ArtifactType` | Yes | Type of artifact (see below) |
| `fileName` | `string` | Yes | Original filename |
| `storageId` | `Id<"_storage">` | Yes | Convex file storage ID |
| `mimeType` | `string` | Yes | File MIME type |
| `sizeBytes` | `number` | Yes | File size |
| `isDeleted` | `boolean` | No | Soft-delete flag (default: false) |
| `deletedAt` | `number` | No | Unix timestamp of deletion |
| `createdAt` | `number` | Yes | Unix timestamp |

**ArtifactType (Union):**
```typescript
type ArtifactType = "pdf" | "tex" | "json";
```

---

### 12. `applicationTracking`

**Purpose:** Track job application outcomes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<"applicationTracking">` | Auto | Convex document ID |
| `userId` | `Id<"users">` | Yes | Owner |
| `runId` | `Id<"runs">` | Yes | Associated run |
| `jobId` | `Id<"jobs">` | Yes | Job applied to |
| `applicationStatus` | `ApplicationStatus` | Yes | See status values below |
| `appliedAt` | `number` | No | When user applied |
| `responseReceivedAt` | `number` | No | When company responded |
| `interviewScheduledAt` | `number` | No | Interview date |
| `offerReceivedAt` | `number` | No | Offer date |
| `rejectedAt` | `number` | No | Rejection date |
| `notes` | `string` | No | User notes |
| `nextAction` | `string` | No | Reminder for next step |
| `nextActionDue` | `number` | No | Due date for next action |
| `createdAt` | `number` | Yes | Unix timestamp |
| `updatedAt` | `number` | Yes | Unix timestamp |

**ApplicationStatus (Union Type):**
```typescript
type ApplicationStatus =
  | "not_applied"   // Resume generated but not applied
  | "applied"       // Application submitted
  | "viewed"        // Application viewed by recruiter
  | "screening"     // Phone/initial screening scheduled
  | "interviewing"  // In interview process
  | "offer"         // Offer received
  | "accepted"      // Offer accepted
  | "rejected"      // Application rejected
  | "withdrawn"     // User withdrew application
  | "ghosted";      // No response after extended period
```

---

## Indexes

For optimal query performance, create these indexes:

```typescript
// users
users.by_clerk_id: ["clerkId"]           // UNIQUE enforcement via guard logic
users.by_email: ["email"]

// masterResumes
masterResumes.by_user: ["userId"]
masterResumes.by_user_active: ["userId", "isActive"]
masterResumes.by_content_hash: ["contentHash"]

// resumeBullets
resumeBullets.by_resume: ["masterResumeId"]
resumeBullets.by_parent: ["masterResumeId", "parentType", "parentId"]

// resumeBulletEmbeddings (NEW - per-bullet embeddings)
resumeBulletEmbeddings.by_resume: ["masterResumeId"]
resumeBulletEmbeddings.by_cache_key: ["masterResumeHash", "embedKeyHash"]
resumeBulletEmbeddings.by_bullet: ["masterResumeId", "bulletId", "embedKeyHash"]

// evidenceScores
evidenceScores.by_resume: ["masterResumeId"]
evidenceScores.by_cache_key: ["masterResumeHash", "rulesHash"]

// jobs
jobs.by_user: ["userId"]
jobs.by_url: ["jobUrl"]
jobs.by_user_recent: ["userId", "createdAt"]
jobs.by_user_hash: ["userId", "descriptionHash"]  // UNIQUE enforcement via guard logic

// runs
runs.by_user: ["userId"]
runs.by_job: ["jobId"]
runs.by_user_status: ["userId", "status"]
runs.by_user_recent: ["userId", "createdAt"]
runs.by_run_id: ["runId"]                         // UNIQUE enforcement via guard logic

// jdRubrics
jdRubrics.by_run: ["runId"]

// selectionPlans
selectionPlans.by_run: ["runId"]

// tailoredResumes
tailoredResumes.by_run: ["runId"]
tailoredResumes.by_run_model: ["runId", "modelKey"]

// generatedArtifacts
generatedArtifacts.by_run: ["runId"]
generatedArtifacts.by_run_type: ["runId", "artifactType"]
generatedArtifacts.by_run_model: ["runId", "modelKey"]

// applicationTracking
applicationTracking.by_user: ["userId"]
applicationTracking.by_run: ["runId"]
applicationTracking.by_user_status: ["userId", "applicationStatus"]
applicationTracking.by_user_recent: ["userId", "updatedAt"]
```

---

## Uniqueness & Deduplication

**⚠️ Important:** Convex does not enforce SQL-style `UNIQUE` constraints at the database level. Uniqueness must be enforced at the application layer using index lookups before insert.

### Recommended Pattern

```typescript
// Example: Enforce unique clerkId in users table
export const createUser = mutation({
  args: { clerkId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    // Check for existing user with same clerkId
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    
    if (existing) {
      throw new Error(`User with clerkId ${args.clerkId} already exists`);
    }
    
    return await ctx.db.insert("users", { ...args, createdAt: Date.now() });
  },
});
```

### Fields Requiring Uniqueness Guards

| Table | Field(s) | Index | Guard Logic |
|-------|----------|-------|-------------|
| `users` | `clerkId` | `by_clerk_id` | Check before insert; one user per auth provider ID |
| `jobs` | `userId` + `descriptionHash` | `by_user_hash` | Prevent duplicate job imports for same user |
| `runs` | `runId` | `by_run_id` | UUID should be unique; guard as defensive measure |

### Dedupe Best Practices

1. **Generate hashes client-side** for `descriptionHash` and `contentHash` to ensure consistency
2. **Use UUIDs** for `runId` to minimize collision risk
3. **Wrap inserts in transactions** when uniqueness is critical
4. **Return existing doc** instead of throwing if duplicate is acceptable (idempotent upsert pattern)

---

## Data Lifecycle & Retention

### Soft-Delete Strategy

Tables that support user deletion use soft-delete fields to enable recovery and maintain referential integrity:

| Table | Supports Soft-Delete | Fields |
|-------|---------------------|--------|
| `masterResumes` | ✅ | `isDeleted`, `deletedAt` |
| `jobs` | ✅ | `isDeleted`, `deletedAt` |
| `runs` | ✅ | `isDeleted`, `deletedAt` |
| `generatedArtifacts` | ✅ | `isDeleted`, `deletedAt` |

**Soft-Delete Pattern:**
```typescript
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

// Query with soft-delete filter
export const listJobs = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
  },
});
```

### Retention & Cleanup Policies

**⚠️ Warning:** Orphaned documents can accumulate if parent records are deleted. Implement cleanup logic for:

| Parent Deleted | Orphaned Children | Recommended Action |
|----------------|-------------------|-------------------|
| `masterResumes` | `resumeBullets`, `resumeBulletEmbeddings`, `evidenceScores` | Cascade soft-delete or hard-delete |
| `runs` | `jdRubrics`, `selectionPlans`, `tailoredResumes`, `generatedArtifacts`, `applicationTracking` | Cascade soft-delete |
| `jobs` | `runs` (and their children) | Soft-delete runs or block job deletion if runs exist |

**Recommended Cleanup Approaches:**

1. **Scheduled Cleanup Job** (Convex cron):
   - Periodically scan for `isDeleted: true` records older than 30 days
   - Hard-delete and cascade to children
   - Clean up orphaned file storage entries

2. **Cascade on Delete**:
   - When soft-deleting a parent, also soft-delete children
   - Use a transaction or sequential mutations

3. **Referential Integrity Check**:
   - Before hard-deleting, verify no active references exist
   - Block deletion if references found, or cascade

**File Storage Cleanup:**
```typescript
// When hard-deleting generatedArtifacts, also delete from storage
export const hardDeleteArtifact = mutation({
  args: { artifactId: v.id("generatedArtifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (artifact) {
      await ctx.storage.delete(artifact.storageId);
      await ctx.db.delete(args.artifactId);
    }
  },
});
```

---

## Convex Schema Definition

```typescript
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─────────────────────────────────────────────────────────────────
// SHARED VALIDATORS
// ─────────────────────────────────────────────────────────────────

const runStageValidator = v.union(
  v.literal("initialized"),
  v.literal("extracting"),
  v.literal("rubric_generating"),
  v.literal("rubric_generated"),
  v.literal("embedding_jd"),
  v.literal("selecting"),
  v.literal("selection_complete"),
  v.literal("tailoring"),
  v.literal("tailored"),
  v.literal("generating_latex"),
  v.literal("generating_pdf"),
  v.literal("DONE"),
  v.literal("ERROR")
);

const runStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("success"),
  v.literal("error")
);

const applicationStatusValidator = v.union(
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
);

const artifactTypeValidator = v.union(
  v.literal("pdf"),
  v.literal("tex"),
  v.literal("json")
);

const evidenceTierValidator = v.union(
  v.literal("strong"),
  v.literal("medium"),
  v.literal("weak")
);

const parentTypeValidator = v.union(
  v.literal("experience"),
  v.literal("project"),
  v.literal("award")
);

const rewriteIntentValidator = v.union(
  v.literal("light"),
  v.literal("medium"),
  v.literal("heavy")
);

// SelectedBullet validator (reused in selectionPlans)
const selectedBulletValidator = v.object({
  bulletId: v.string(),
  parentType: parentTypeValidator,
  parentId: v.string(),
  originalText: v.string(),
  company: v.optional(v.string()),
  role: v.optional(v.string()),
  dateRange: v.optional(v.string()),
  evidence: v.object({
    score: v.number(),
    tier: evidenceTierValidator,
  }),
  matches: v.array(v.object({
    reqId: v.string(),
    rel: v.number(),
    edgeScore: v.number(),
  })),
  redundancy: v.object({
    maxSim: v.number(),
    blocked: v.boolean(),
    penalty: v.number(),
  }),
  rewriteIntent: rewriteIntentValidator,
  reasons: v.array(v.string()),
});

export default defineSchema({
  // ─────────────────────────────────────────────────────────────────
  // USER & AUTHENTICATION
  // ─────────────────────────────────────────────────────────────────
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    defaultMasterResumeId: v.optional(v.id("masterResumes")),
    settings: v.optional(v.object({
      preferredModels: v.optional(v.array(v.string())),
      embeddingModel: v.optional(v.string()),
      embeddingDims: v.optional(v.number()),
      latexTemplate: v.optional(v.string()),
      promptVersions: v.optional(v.object({
        tailor: v.optional(v.string()),
        latex: v.optional(v.string()),
        rubric: v.optional(v.string()),
      })),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  // ─────────────────────────────────────────────────────────────────
  // MASTER RESUME
  // ─────────────────────────────────────────────────────────────────
  masterResumes: defineTable({
    userId: v.id("users"),
    name: v.string(),
    contentHash: v.string(),
    isActive: v.boolean(),
    summary: v.optional(v.string()),
    skills: v.object({
      programming_languages: v.array(v.string()),
      frameworks_libraries: v.array(v.string()),
      tools_cloud_technologies: v.array(v.string()),
      data_science_analytics: v.array(v.string()),
      machine_learning_ai: v.array(v.string()),
      other_skills: v.array(v.string()),
    }),
    education: v.array(v.object({
      institution: v.string(),
      degree: v.string(),
      dates: v.string(),
      location: v.optional(v.string()),
      gpa: v.optional(v.string()),
      links: v.optional(v.array(v.string())),
    })),
    awards: v.optional(v.array(v.object({
      name: v.string(),
      issuer: v.string(),
      year: v.string(),
      details: v.optional(v.string()),
    }))),
    mentorship: v.optional(v.array(v.string())),
    links: v.optional(v.array(v.string())),
    customLatexTemplate: v.optional(v.string()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_content_hash", ["contentHash"]),

  // ─────────────────────────────────────────────────────────────────
  // RESUME BULLETS (extracted from master resume)
  // ─────────────────────────────────────────────────────────────────
  resumeBullets: defineTable({
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
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_resume", ["masterResumeId"])
    .index("by_parent", ["masterResumeId", "parentType", "parentId"]),

  // ─────────────────────────────────────────────────────────────────
  // RESUME BULLET EMBEDDINGS (one doc per bullet - scalable design)
  // ─────────────────────────────────────────────────────────────────
  resumeBulletEmbeddings: defineTable({
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    masterResumeHash: v.string(),
    bulletId: v.string(),
    embedKeyHash: v.string(),
    embeddingModel: v.string(),
    dims: v.number(),
    embedding: v.array(v.number()),
    createdAt: v.number(),
  })
    .index("by_resume", ["masterResumeId"])
    .index("by_cache_key", ["masterResumeHash", "embedKeyHash"])
    .index("by_bullet", ["masterResumeId", "bulletId", "embedKeyHash"]),

  // ─────────────────────────────────────────────────────────────────
  // EVIDENCE SCORES (cached quality scores)
  // ─────────────────────────────────────────────────────────────────
  evidenceScores: defineTable({
    masterResumeId: v.id("masterResumes"),
    masterResumeHash: v.string(),
    rulesHash: v.string(),
    rulesVersion: v.string(),
    scores: v.array(v.object({
      bulletId: v.string(),
      score: v.number(),
      tier: evidenceTierValidator,
      breakdown: v.object({
        action: v.number(),
        tools: v.number(),
        outcome: v.number(),
        metric: v.number(),
        scope: v.number(),
      }),
      fluffPenalty: v.number(),
      matchedTools: v.array(v.string()),
      matchedVerbs: v.array(v.string()),
    })),
    cachedAt: v.number(),
  })
    .index("by_resume", ["masterResumeId"])
    .index("by_cache_key", ["masterResumeHash", "rulesHash"]),

  // ─────────────────────────────────────────────────────────────────
  // JOBS (scraped job postings)
  // ─────────────────────────────────────────────────────────────────
  jobs: defineTable({
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
    descriptionHash: v.string(),
    userTags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_url", ["jobUrl"])
    .index("by_user_recent", ["userId", "createdAt"])
    .index("by_user_hash", ["userId", "descriptionHash"]),

  // ─────────────────────────────────────────────────────────────────
  // RUNS (pipeline orchestration)
  // ─────────────────────────────────────────────────────────────────
  runs: defineTable({
    runId: v.string(),
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    jobId: v.id("jobs"),
    status: runStatusValidator,
    stage: runStageValidator,
    errorMessage: v.optional(v.string()),
    mockMode: v.optional(v.boolean()),
    promptVersions: v.optional(v.object({
      tailor: v.optional(v.string()),
      latex: v.optional(v.string()),
      rubric: v.optional(v.string()),
    })),
    promptHashes: v.optional(v.object({
      tailor: v.optional(v.string()),
      latex: v.optional(v.string()),
      rubric: v.optional(v.string()),
    })),
    modelVariants: v.optional(v.array(v.string())),
    primaryModelKey: v.optional(v.string()),
    timing: v.optional(v.object({
      rubricMs: v.optional(v.number()),
      embeddingMs: v.optional(v.number()),
      selectionMs: v.optional(v.number()),
      tailorMs: v.optional(v.number()),
      latexMs: v.optional(v.number()),
      pdfMs: v.optional(v.number()),
      totalMs: v.optional(v.number()),
    })),
    cacheHits: v.optional(v.object({
      embeddings: v.optional(v.boolean()),
      evidenceScores: v.optional(v.boolean()),
    })),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_job", ["jobId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_recent", ["userId", "createdAt"])
    .index("by_run_id", ["runId"]),

  // ─────────────────────────────────────────────────────────────────
  // JD RUBRICS (extracted requirements)
  // ─────────────────────────────────────────────────────────────────
  jdRubrics: defineTable({
    runId: v.id("runs"),
    version: v.string(),
    jobMeta: v.object({
      jobTitle: v.string(),
      company: v.optional(v.string()),
      location: v.optional(v.string()),
      employmentType: v.optional(v.string()),
      seniority: v.optional(v.string()),
      jobUrl: v.optional(v.string()),
      platform: v.optional(v.string()),
    }),
    requirements: v.array(v.object({
      reqId: v.string(),
      type: v.union(v.literal("must"), v.literal("nice")),
      weight: v.number(),
      requirement: v.string(),
      jdEvidence: v.array(v.string()),
      category: v.string(),
    })),
    keywords: v.array(v.object({
      term: v.string(),
      importance: v.number(),
      type: v.string(),
      jdEvidence: v.array(v.string()),
    })),
    constraints: v.optional(v.object({
      yearsExperienceMin: v.optional(v.number()),
      education: v.optional(v.array(v.string())),
      certifications: v.optional(v.array(v.string())),
      workAuthorization: v.optional(v.array(v.string())),
    })),
    notes: v.optional(v.object({
      summary: v.optional(v.string()),
      ambiguities: v.optional(v.array(v.string())),
    })),
    rubricHash: v.string(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"]),

  // ─────────────────────────────────────────────────────────────────
  // SELECTION PLANS (bullet selection results - strongly typed)
  // ─────────────────────────────────────────────────────────────────
  selectionPlans: defineTable({
    runId: v.id("runs"),
    version: v.string(),
    masterResumeHash: v.string(),
    jobExtractedHash: v.string(),
    rubricHash: v.string(),
    embeddingModel: v.string(),
    config: v.object({
      configVersion: v.string(),
      budgets: v.object({
        targetResumeWordsMin: v.number(),
        targetResumeWordsMax: v.number(),
        experienceBulletsMin: v.number(),
        experienceBulletsMax: v.number(),
        projectBulletsMin: v.number(),
        projectBulletsMax: v.number(),
        awardLinesMin: v.number(),
        awardLinesMax: v.number(),
        perRoleCaps: v.object({
          mostRecent: v.number(),
          next: v.number(),
          older: v.number(),
        }),
        maxBulletsPerRequirement: v.number(),
      }),
      thresholds: v.object({
        mustMinRel: v.number(),
        niceMinRel: v.number(),
        coverThreshold: v.number(),
        redundancy: v.object({
          hardBlock: v.number(),
          penaltyStart: v.number(),
        }),
        minEvidenceTierNice: evidenceTierValidator,
      }),
      weights: v.object({
        edge: v.object({
          wRel: v.number(),
          wEvd: v.number(),
          wRed: v.number(),
          wRisk: v.number(),
        }),
        fill: v.object({
          alpha: v.number(),
          beta: v.number(),
          gamma: v.number(),
        }),
      }),
    }),
    coverage: v.object({
      mustTotal: v.number(),
      niceTotal: v.number(),
      mustCovered: v.number(),
      niceCovered: v.number(),
      uncoveredRequirements: v.array(v.object({
        reqId: v.string(),
        type: v.union(v.literal("must"), v.literal("nice")),
        weight: v.number(),
        reason: v.string(),
      })),
    }),
    selected: v.object({
      workExperience: v.array(selectedBulletValidator),
      projects: v.array(selectedBulletValidator),
      awards: v.array(selectedBulletValidator),
    }),
    budgetsUsed: v.object({
      experienceBullets: v.number(),
      projectBullets: v.number(),
      awardLines: v.number(),
      perRole: v.record(v.string(), v.number()),
    }),
    selectionNotes: v.optional(v.object({
      droppedDueToRedundancy: v.optional(v.array(v.string())),
      droppedDueToBudget: v.optional(v.array(v.string())),
    })),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"]),

  // ─────────────────────────────────────────────────────────────────
  // TAILORED RESUMES (LLM rewritten content)
  // ─────────────────────────────────────────────────────────────────
  tailoredResumes: defineTable({
    runId: v.id("runs"),
    modelKey: v.string(),
    modelName: v.string(),
    tailoredHash: v.string(),
    summary: v.string(),
    workExperience: v.array(v.object({
      roleId: v.string(),
      company: v.string(),
      title: v.string(),
      dateRange: v.string(),
      location: v.optional(v.string()),
      bullets: v.array(v.object({
        bulletId: v.string(),
        originalText: v.string(),
        tailoredText: v.string(),
        wasRewritten: v.boolean(),
      })),
    })),
    projects: v.array(v.object({
      projectId: v.string(),
      name: v.string(),
      date: v.optional(v.string()),
      bullets: v.array(v.object({
        bulletId: v.string(),
        originalText: v.string(),
        tailoredText: v.string(),
        wasRewritten: v.boolean(),
      })),
    })),
    education: v.array(v.object({
      institution: v.string(),
      degree: v.string(),
      dates: v.string(),
      location: v.optional(v.string()),
      gpa: v.optional(v.string()),
    })),
    skills: v.object({
      programming_languages: v.array(v.string()),
      frameworks_libraries: v.array(v.string()),
      tools_cloud_technologies: v.array(v.string()),
      data_science_analytics: v.array(v.string()),
      machine_learning_ai: v.array(v.string()),
      other_skills: v.array(v.string()),
    }),
    awards: v.optional(v.array(v.object({
      name: v.string(),
      issuer: v.string(),
      year: v.string(),
      details: v.optional(v.string()),
    }))),
    selectionEnforcement: v.object({
      strippedUnselected: v.number(),
      truncatedBullets: v.number(),
      repairApplied: v.boolean(),
      compliant: v.boolean(),
      proxyWordCountExceeded: v.boolean(),
    }),
    wordCountEstimate: v.number(),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_model", ["runId", "modelKey"]),

  // ─────────────────────────────────────────────────────────────────
  // GENERATED ARTIFACTS (PDFs, LaTeX files)
  // ─────────────────────────────────────────────────────────────────
  generatedArtifacts: defineTable({
    runId: v.id("runs"),
    modelKey: v.optional(v.string()),
    artifactType: artifactTypeValidator,
    fileName: v.string(),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    sizeBytes: v.number(),
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_type", ["runId", "artifactType"])
    .index("by_run_model", ["runId", "modelKey"]),

  // ─────────────────────────────────────────────────────────────────
  // APPLICATION TRACKING
  // ─────────────────────────────────────────────────────────────────
  applicationTracking: defineTable({
    userId: v.id("users"),
    runId: v.id("runs"),
    jobId: v.id("jobs"),
    applicationStatus: applicationStatusValidator,
    appliedAt: v.optional(v.number()),
    responseReceivedAt: v.optional(v.number()),
    interviewScheduledAt: v.optional(v.number()),
    offerReceivedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    nextActionDue: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_run", ["runId"])
    .index("by_user_status", ["userId", "applicationStatus"])
    .index("by_user_recent", ["userId", "updatedAt"]),
});
```

---

## Key Design Decisions

### 1. **Per-Bullet Embedding Storage**
- `resumeBulletEmbeddings` stores one document per bullet (not an array in one doc)
- Avoids document size limits and enables incremental updates
- Cache key uses `(masterResumeHash, embedKeyHash)` for efficient lookups
- JD embeddings are computed per-run (not cached) since each JD is unique

### 2. **Strongly Typed Selection Plans**
- `SelectedBullet` type defined once, reused across the codebase
- Enables type-safe UI rendering and validation
- Removes `v.any()` for better compile-time checks

### 3. **Consistent Model Keys**
- `modelKey` field used across `runs`, `tailoredResumes`, and `generatedArtifacts`
- Derived from model name using a stable transformation
- Enables simple joins and filtering by model variant

### 4. **Strict Stage Enum**
- `runs.stage` uses a union of literal types instead of free-form string
- Prevents typos and enables exhaustive switch statements
- Improves analytics queries

### 5. **Soft-Delete Pattern**
- `isDeleted` and `deletedAt` fields on user-deletable tables
- Enables recovery and maintains referential integrity
- Cleanup via scheduled jobs or cascade logic

### 6. **Uniqueness via Guard Logic**
- Convex doesn't enforce `UNIQUE` constraints at DB level
- App logic must check indexes before insert
- Documented fields requiring guards

### 7. **File Storage**
- Convex file storage (`_storage`) used for PDFs and LaTeX files
- Artifacts reference storage via `storageId`
- Cleanup logic required when deleting artifacts

---

## Migration Notes

When migrating from the current file-based system:

1. **User onboarding:**
   - Import existing `default.json` and `shraddha_barange_reg_affairs.json` as `masterResumes`
   - Extract bullets into `resumeBullets`
   - **NEW:** Split cached embeddings from `cache/embeddings/` into per-bullet `resumeBulletEmbeddings` documents
   - Import cached evidence scores from `cache/evidence_scores/`

2. **Historical runs:**
   - Import existing runs from `runs/` directory
   - Create corresponding `jobs`, `jdRubrics`, `selectionPlans`, `tailoredResumes`
   - Upload PDFs to Convex file storage
   - Add `modelKey` field derived from existing model names

3. **Schema migration for selection plans:**
   - Transform existing `selected.workExperience/projects/awards` to match `SelectedBullet` type
   - Add missing fields with defaults where necessary

---

*Last Updated: December 2025*
