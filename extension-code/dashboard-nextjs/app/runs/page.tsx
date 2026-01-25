"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import RunsTable, { ApplicationStatus } from "@/components/RunsTable";
import RunFilters from "@/components/RunFilters";
import { defaultFilters, applyFilters } from "@/utils/runFilters";
import type { Filters, RunRecord } from "@/types";
import UserOnboarding from "@/components/UserOnboarding";
import { useUser } from "@clerk/nextjs";
import type { Id } from "@/convex/_generated/dataModel";

// Extended run type that includes Convex IDs
interface ExtendedRun extends RunRecord {
  _id: Id<"runs">;
  jobId: Id<"jobs">;
  applicationTrackingId: Id<"applicationTracking"> | null;
}

export default function RunsPage() {
  const { user: clerkUser } = useUser();
  
  // Get user from Convex
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );
  
  // Get user's runs from Convex with job details
  const runsData = useQuery(
    api.runs.getRunsWithJobDetails,
    convexUser ? { userId: convexUser._id } : "skip"
  );

  // Mutation to update application status
  const upsertApplicationTracking = useMutation(api.applicationTracking.upsertApplicationTracking);
  
  // Map Convex data to RunRecord format with proper typing
  const runs: ExtendedRun[] = useMemo(() => {
    if (!runsData) return [];
    return runsData.map((run) => ({
      runId: run.runId,
      _id: run._id,
      title: run.title,
      company: run.company,
      platform: run.platform,
      status: run.status as any,
      result: run.result as any,
      coverage: run.coverage,
      runtimeSec: run.runtimeSec,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      createdAt: run.createdAt,
      error: run.error,
      message: run.message,
      applicationStatus: run.applicationStatus as ApplicationStatus,
      applicationTrackingId: run.applicationTrackingId as Id<"applicationTracking"> | null,
      jobId: run.jobId,
    }));
  }, [runsData]);
  
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const filteredRuns = useMemo(() => applyFilters(runs as RunRecord[], filters), [runs, filters]);

  const handleSelect = (runId: string) => {
    // Use Next.js router for better navigation
    window.location.href = `/run/${runId}`;
  };

  // Handle application status change
  const handleApplicationStatusChange = async (runId: string, status: ApplicationStatus) => {
    if (!convexUser) {
      console.error("No convex user found");
      return;
    }
    
    // Find the run from the original data (not filtered) to get its _id and jobId
    const run = runs.find((r) => r.runId === runId);
    if (!run) {
      console.error("Run not found:", runId);
      return;
    }

    if (!run._id || !run.jobId) {
      console.error("Missing run._id or run.jobId:", run);
      return;
    }

    console.log("Updating application status:", { runId, status, convexRunId: run._id, jobId: run.jobId });

    // Map our simplified status to the full Convex applicationStatus type
    const convexStatus = status as "not_applied" | "applied" | "viewed" | "screening" | "interviewing" | "offer" | "accepted" | "rejected" | "withdrawn" | "ghosted";

    try {
      const result = await upsertApplicationTracking({
        userId: convexUser._id,
        runId: run._id,
        jobId: run.jobId,
        applicationStatus: convexStatus,
        ...(status === "applied" && { appliedAt: Date.now() }),
        ...(status === "rejected" && { rejectedAt: Date.now() }),
        ...(status === "interviewing" && { interviewScheduledAt: Date.now() }),
      });
      console.log("Application status updated successfully:", result);
    } catch (error) {
      console.error("Failed to update application status:", error);
      // Log the full error details
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
    }
  };

  // Show onboarding if user not set up
  if (!convexUser) {
    return <UserOnboarding />;
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Runs history</h2>
          <p className="hint">Search, filter, and open the run detail page</p>
        </div>
        <div className="actions-inline">
          <button className="ghost small" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </div>

      <RunFilters filters={filters} onChange={(update) => setFilters((prev) => ({ ...prev, ...update }))} />

      <RunsTable
        runs={filteredRuns as any[]}
        onSelect={handleSelect}
        backendOnline={true}
        onApplicationStatusChange={handleApplicationStatusChange}
      />
    </div>
  );
}
