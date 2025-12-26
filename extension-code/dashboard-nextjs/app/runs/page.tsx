"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import RunsTable from "@/components/RunsTable";
import RunFilters from "@/components/RunFilters";
import { defaultFilters, applyFilters } from "@/utils/runFilters";
import type { Filters } from "@/types";
import UserOnboarding from "@/components/UserOnboarding";
import { useUser } from "@clerk/nextjs";

export default function RunsPage() {
  const { user: clerkUser } = useUser();
  
  // Get user from Convex
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );
  
  // Get user's runs from Convex
  const runs = useQuery(
    api.runs.getRuns,
    convexUser ? { userId: convexUser._id } : "skip"
  ) || [];
  
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const filteredRuns = useMemo(() => applyFilters(runs as any[], filters), [runs, filters]);

  const handleSelect = (runId: string) => {
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
