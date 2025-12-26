"use client";

import Link from "next/link";
import type { RunRecord } from "@/types";
import { formatDateTime, formatDuration } from "@/utils/runFilters";

interface Props {
  runs: RunRecord[];
  onSelect: (runId: string) => void;
  onDownload?: (run: RunRecord) => void;
  backendOnline: boolean;
  showHeader?: boolean;
  onStop?: (run: RunRecord) => void;
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

export default function RunsTable({ runs, onSelect, onDownload, backendOnline, showHeader = true, onStop }: Props) {
  return (
    <div className="table-wrapper">
      <table className="runs-table">
        {showHeader ? (
          <thead>
            <tr>
              <th>Job Title</th>
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
          {runs.map((run) => (
            <tr key={run.runId} onClick={() => onSelect(run.runId)} className="clickable">
              <td>
                <div className="cell-title">{run.title || "Untitled role"}</div>
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
                  {onStop && run.result === "pending" ? (
                    <button
                      className="ghost small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStop(run);
                      }}
                    >
                      Stop
                    </button>
                  ) : null}
                  <button className="ghost icon small" onClick={(e) => e.stopPropagation()} title="More actions coming soon">
                    ⋯
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!runs.length ? <div className="empty-state">No runs match the filters.</div> : null}
    </div>
  );
}

