import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { createHash } from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function hashString(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

export async function POST(request: NextRequest) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:14',message:'Sync jobs API called',data:{hasBody:!!request.body},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Check authentication
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:20',message:'Unauthorized - no clerk user',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tabs, jobs } = body;
    const jobsToSync = jobs || tabs || [];

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:28',message:'Processing jobs',data:{jobsCount:jobsToSync.length,clerkId},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!Array.isArray(jobsToSync)) {
      return NextResponse.json({ error: "jobs/tabs must be an array" }, { status: 400 });
    }

    // Get Convex user
    const convexUser = await convex.query(api.users.getUserByClerkId, { clerkId });
    if (!convexUser) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:38',message:'Convex user not found',data:{clerkId},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: "User not found in Convex" }, { status: 404 });
    }

    const createdJobs = [];
    const errors = [];

    for (const jobData of jobsToSync) {
      try {
        if (!jobData.url && !jobData.jobUrl) {
          errors.push({ jobData, error: "Missing url" });
          continue;
        }

        // Extract job data
        const jobUrl = jobData.url || jobData.jobUrl;
        let platform: string;
        try {
          platform = new URL(jobUrl).hostname;
        } catch {
          platform = "unknown";
        }
        const title = jobData.title || "Untitled";
        const rawDescription = jobData.description || jobData.rawDescription || "";
        const descriptionHash = hashString(rawDescription || jobUrl);

        // Create job in Convex
        const jobId = await convex.mutation(api.jobs.createJob, {
          userId: convexUser._id,
          jobUrl,
          platform,
          title,
          company: jobData.company,
          location: jobData.location,
          rawDescription,
          descriptionHash,
          userTags: jobData.tags || [],
          notes: jobData.notes,
        });

        createdJobs.push({ tabId: jobData.id, jobId });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:66',message:'Job created',data:{tabId:jobData.id,jobId,title},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      } catch (error: any) {
        errors.push({ jobData, error: error.message });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:71',message:'Job creation error',data:{tabId:jobData.id,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      }
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:76',message:'Sync jobs complete',data:{created:createdJobs.length,errors:errors.length},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      success: true,
      created: createdJobs.length,
      errors: errors.length,
      jobs: createdJobs,
      errors: errors,
    });
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/sync-jobs/route.ts:87',message:'Sync jobs API error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      { error: "Failed to sync jobs: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}

