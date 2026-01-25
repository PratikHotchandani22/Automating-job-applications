"use client";

import { useState } from "react";
import Link from "next/link";
import type { RunRecord } from "@/types";
import { formatDateTime, formatDuration } from "@/utils/runFilters";

// Application status type
export type ApplicationStatus = "not_applied" | "applied" | "interviewing" | "rejected";

// Utility to detect corrupted job titles (like LinkedIn notification badges)
function isCorruptedTitle(title: string | undefined | null): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  // Detect patterns like "0 notifications total", "1 notification total", etc.
  if (/^\d+\s*notifications?\s*total$/i.test(lower)) return true;
  // Detect very short titles that are just numbers
  if (/^\d+$/.test(lower)) return true;
  // Detect other LinkedIn UI text that might get captured
  if (lower === "loading..." || lower === "linkedin" || lower.length < 3) return true;
  return false;
}

// Get a display-safe title with company fallback
function getSafeTitle(
  title: string | undefined | null,
  company?: string | null,
  fallback: string = "Untitled role"
): string {
  // First, try the provided title if it's not corrupted
  if (!isCorruptedTitle(title)) return title!;
  
  // If we have a company, create a generic title
  if (company && company.toLowerCase() !== "unknown" && company.toLowerCase() !== "unknown company") {
    return `Job at ${company}`;
  }
  
  return fallback;
}

interface Props {
  runs: RunRecord[];
  onSelect: (runId: string) => void;
  onDownload?: (run: RunRecord) => void;
  backendOnline: boolean;
  showHeader?: boolean;
  onStop?: (run: RunRecord) => void;
  onApplicationStatusChange?: (runId: string, status: ApplicationStatus) => void;
}

const statusClass = (run: RunRecord) => {
  if (run.result === "error" || run.status === "ERROR") return "error";
  if (run.result === "success" || run.status === "DONE") return "done";
  return "pending";
};

const coverageLabel = (value?: number | null) => {
  if (!value && value !== 0) return "—";
  return `${value}%`;
};

const displayStatusLabel = (run: RunRecord) => {
  if (run.queueSize && run.queueSize > 1 && run.queuePosition && run.queuePosition > 1 && run.result === "pending") {
    return "PENDING";
  }
  return run.status;
};

// Application status display configuration
const applicationStatusConfig: Record<ApplicationStatus, { label: string; className: string }> = {
  not_applied: { label: "Not Applied", className: "app-status-not-applied" },
  applied: { label: "Applied", className: "app-status-applied" },
  interviewing: { label: "Interviewing", className: "app-status-interviewing" },
  rejected: { label: "Rejected", className: "app-status-rejected" },
};

export default function RunsTable({ runs, onSelect, onDownload, backendOnline, showHeader = true, onStop, onApplicationStatusChange }: Props) {
  // Optimistic UI state for application status
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [savingStatuses, setSavingStatuses] = useState<Record<string, boolean>>({});

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>, runId: string) => {
    e.stopPropagation();
    const newStatus = e.target.value as ApplicationStatus;
    console.log("Status change triggered:", { runId, newStatus, hasCallback: !!onApplicationStatusChange });
    
    // Optimistic update - immediately show the new status
    setOptimisticStatuses(prev => ({ ...prev, [runId]: newStatus }));
    setSavingStatuses(prev => ({ ...prev, [runId]: true }));
    
    if (onApplicationStatusChange) {
      try {
        await onApplicationStatusChange(runId, newStatus);
        console.log("Status saved successfully");
      } catch (error) {
        console.error("Failed to save status, reverting:", error);
        // Revert optimistic update on error
        setOptimisticStatuses(prev => {
          const updated = { ...prev };
          delete updated[runId];
          return updated;
        });
      } finally {
        setSavingStatuses(prev => ({ ...prev, [runId]: false }));
      }
    }
  };

  // Get the effective status (optimistic or from data)
  const getEffectiveStatus = (run: RunRecord): ApplicationStatus => {
    if (optimisticStatuses[run.runId]) {
      return optimisticStatuses[run.runId];
    }
    return ((run as any).applicationStatus as ApplicationStatus) || "not_applied";
  };

  return (
    <div className="table-wrapper">
      <table className="runs-table">
        {showHeader ? (
          <thead>
            <tr>
              <th>Job Title</th>
              <th>Application Status</th>
              <th>Company</th>
              <th>Platform</th>
              <th>Status</th>
              <th>Queue</th>
              <th>Runtime</th>
              <th>Coverage</th>
              <th>Date/Time</th>
              <th>Actions</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {runs.map((run) => {
            const appStatus = getEffectiveStatus(run);
            const statusConfig = applicationStatusConfig[appStatus];
            const isSaving = savingStatuses[run.runId];
            
            return (
              <tr key={run.runId} onClick={() => onSelect(run.runId)} className="clickable">
                <td>
                  <div className="cell-title">{getSafeTitle(run.title, run.company)}</div>
                </td>
                <td>
                  <select
                    className={`app-status-select ${statusConfig.className} ${isSaving ? 'saving' : ''}`}
                    value={appStatus}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleStatusChange(e, run.runId)}
                    disabled={isSaving}
                  >
                    <option value="not_applied">Not Applied</option>
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </td>
                <td>{run.company || "—"}</td>
                <td>{run.platform || "Other"}</td>
                <td>
                  <span className={`status-pill tiny ${statusClass(run)}`}>{displayStatusLabel(run)}</span>
                </td>
                <td>
                  {run.queueId ? (
                    <span className="badge subtle">
                      {run.queueSize && run.queueSize > 1
                        ? `Queue ${run.queuePosition || 1}/${run.queueSize}`
                        : "Queue 1/1"}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{formatDuration(run.runtimeSec)}</td>
                <td>
                  <div className="coverage-cell">
                    <div className="coverage-bar">
                      <span style={{ width: `${Math.min(100, Math.max(0, run.coverage || 0))}%` }} />
                    </div>
                    <span className="coverage-label">{coverageLabel(run.coverage)}</span>
                  </div>
                </td>
                <td>{formatDateTime(run.startedAt || run.updatedAt)}</td>
                <td>
                  <div className="actions-inline">
                    <Link
                      href={`/run/${run.runId}`}
                      className="ghost small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(run.runId);
                      }}
                    >
                      View
                    </Link>
                    {onDownload && (
                      <button
                        className="ghost small"
                        disabled={!run.artifacts?.pdf || !backendOnline}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(run);
                        }}
                      >
                        Download
                      </button>
                    )}
                    {onStop && (run.result === "pending" || (run.status as string) === "running" || (run.status as string) === "analyzing" || (run.status as string) === "RUNNING") ? (
                      <button
                        className="ghost small warn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to cancel this run?")) {
                            onStop(run);
                          }
                        }}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button className="ghost icon small" onClick={(e) => e.stopPropagation()} title="More actions coming soon">
                      ⋯
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!runs.length ? <div className="empty-state">No runs match the filters.</div> : null}
    </div>
  );
}

