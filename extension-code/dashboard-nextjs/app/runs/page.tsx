"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import RunsTable from "@/components/RunsTable";
import RunFilters from "@/components/RunFilters";
import { defaultFilters, applyFilters } from "@/utils/runFilters";
import type { Filters, RunRecord } from "@/types";
import UserOnboarding from "@/components/UserOnboarding";
import { useUser } from "@clerk/nextjs";

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
  
  // Map Convex data to RunRecord format
  const runs: RunRecord[] = useMemo(() => {
    if (!runsData) return [];
    return runsData.map((run) => ({
      runId: run.runId,
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
    }));
  }, [runsData]);
  
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const filteredRuns = useMemo(() => applyFilters(runs, filters), [runs, filters]);

  const handleSelect = (runId: string) => {
    // Use Next.js router for better navigation
    window.location.href = `/run/${runId}`;
  };

  // Handle viewing run details
  const handleViewRun = (runId: string) => {
    window.location.href = `/run/${runId}`;
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
      />
    </div>
  );
}
