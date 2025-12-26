# Convex Backend Setup

This directory contains the Convex backend schema and functions for the Resume Intelligence Platform.

## Structure

- `schema.ts` - Database schema definition with all tables and indexes
- `helpers.ts` - Utility functions for hashing, uniqueness checks, etc.
- `users.ts` - User management mutations and queries
- `masterResumes.ts` - Master resume CRUD operations
- `resumeBullets.ts` - Resume bullet management
- `resumeBulletEmbeddings.ts` - Embedding storage and retrieval
- `evidenceScores.ts` - Evidence score caching
- `jobs.ts` - Job posting management
- `runs.ts` - Pipeline run orchestration
- `jdRubrics.ts` - Job description rubric storage
- `selectionPlans.ts` - Bullet selection plan storage
- `tailoredResumes.ts` - Tailored resume content storage
- `generatedArtifacts.ts` - Generated file artifacts (PDFs, LaTeX)
- `applicationTracking.ts` - Application status tracking

## Setup

1. Install Convex CLI (if not already installed):
   ```bash
   npm install -g convex
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Initialize Convex project:
   ```bash
   npx convex dev
   ```
   This will:
   - Create a Convex project (if you don't have one)
   - Push the schema to Convex
   - Start the development server

4. Get your Convex deployment URL and add it to your environment variables:
   ```bash
   # In your .env.local or .env
   NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
   ```

## Key Features

### Uniqueness Guards
- `users.clerkId` - Enforced via `checkUserExists` helper
- `jobs(userId, descriptionHash)` - Enforced via `checkJobExists` helper
- `runs.runId` - Enforced via `checkRunExists` helper

### Soft Deletes
The following tables support soft-delete:
- `masterResumes`
- `jobs`
- `runs`
- `generatedArtifacts`

Use the `filterNotDeleted` helper when querying these tables.

### Caching Strategy
- **Resume Bullet Embeddings**: Cached per bullet using `(masterResumeHash, embedKeyHash)`
- **Evidence Scores**: Cached per resume using `(masterResumeHash, rulesHash)`
- **JD Embeddings**: Not cached (computed per-run since each JD is unique)

### File Storage
Generated artifacts (PDFs, LaTeX files) are stored in Convex file storage (`_storage` table). The `generatedArtifacts` table references these via `storageId`.

## Usage Examples

### Creating a User
```typescript
import { useMutation } from "convex/react";
import { api } from "./convex/_generated/api";

const createUser = useMutation(api.users.createUser);
await createUser({
  clerkId: "user_123",
  email: "user@example.com",
  fullName: "John Doe"
});
```

### Creating a Master Resume
```typescript
const createResume = useMutation(api.masterResumes.createMasterResume);
const resumeId = await createResume({
  userId: user._id,
  name: "Data Science Resume",
  contentHash: await generateContentHash(resumeContent),
  isActive: true,
  skills: { /* ... */ },
  education: [ /* ... */ ],
  // ...
});
```

### Creating a Run
```typescript
const createRun = useMutation(api.runs.createRun);
const runId = await createRun({
  runId: crypto.randomUUID(),
  userId: user._id,
  masterResumeId: resume._id,
  jobId: job._id,
  status: "pending",
  stage: "initialized"
});
```

## Migration Notes

When migrating from the file-based system:

1. **User Onboarding**: Import existing resume JSON files as `masterResumes`
2. **Bullets**: Extract bullets into `resumeBullets` table
3. **Embeddings**: Split cached embeddings into per-bullet `resumeBulletEmbeddings` documents
4. **Historical Runs**: Import existing runs and create corresponding records in all related tables
5. **Artifacts**: Upload PDFs to Convex file storage and create `generatedArtifacts` records

## Type Safety

All functions use Convex's type-safe validators (`v.*`). The generated types in `_generated/` provide full TypeScript support for:
- Function arguments
- Return types
- Database document types
- Query results

## Next Steps

1. Set up authentication (Clerk integration)
2. Create API routes in Next.js that call Convex functions
3. Implement the pipeline actions (rubric generation, selection, tailoring)
4. Set up scheduled cleanup jobs for soft-deleted records
5. Implement file upload/download for generated artifacts

