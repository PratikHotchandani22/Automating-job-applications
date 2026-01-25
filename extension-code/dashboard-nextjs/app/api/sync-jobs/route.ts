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
  
  // Check authentication
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tabs, jobs } = body;
    const jobsToSync = jobs || tabs || [];


    if (!Array.isArray(jobsToSync)) {
      return NextResponse.json({ error: "jobs/tabs must be an array" }, { status: 400 });
    }

    // Get Convex user
    const convexUser = await convex.query(api.users.getUserByClerkId, { clerkId });
    if (!convexUser) {
      return NextResponse.json({ error: "User not found in Convex" }, { status: 404 });
    }

    const createdJobs: Array<{ tabId: any; jobId: any }> = [];
    const errors: Array<{ jobData: any; error: string }> = [];

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
      } catch (error: any) {
        errors.push({ jobData, error: error.message });
      }
    }


    return NextResponse.json({
      success: true,
      created: createdJobs.length,
      errorCount: errors.length,
      jobs: createdJobs,
      errors: errors,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to sync jobs: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}

