import type { RunRecord } from "../types";
import { formatDateTime } from "../utils/runFilters";

interface Props {
  runs: RunRecord[];
  onSelect: (runId: string) => void;
  onDownload: (run: RunRecord) => void;
  backendOnline: boolean;
  onToggleResponse: (run: RunRecord) => void;
  onDelete: (run: RunRecord) => void;
  onRerun?: (run: RunRecord) => void;
  onStop?: (run: RunRecord) => void; // cancel in-progress run
  density?: "comfortable" | "compact";
}

const statusClass = (run: RunRecord) => {
  if (run.result === "error" || run.status === "ERROR") return "error";
  if (run.result === "success" || run.status === "DONE") return "done";
  return "pending";
};

const statusLabel = (run: RunRecord) => {
  if (run.result === "success") return "Completed";
  if (run.result === "error") return "Needs attention";
  return "In progress";
};

const RunsTable = ({
  runs,
  onSelect,
  onDownload,
  backendOnline,
  onToggleResponse,
  onDelete,
  onRerun,
  onStop,
  density = "comfortable"
}: Props) => {
  return (
    <div className="table-wrapper">
      <table className={`runs-table ${density === "compact" ? "compact" : ""}`}>
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Company</th>
            <th>Source</th>
            <th>Match</th>
            <th>Date</th>
            <th>Status</th>
            <th>Response</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId} onClick={() => onSelect(run.runId)} className="clickable">
              <td>
                <div className="cell-title">{run.title || "Untitled role"}</div>
              </td>
              <td>{run.company || "—"}</td>
              <td>{run.platform || "Other"}</td>
              <td>
                {typeof run.coverage === "number" ? (
                  <div className="coverage-cell">
                    <div className="coverage-bar">
                      <span style={{ width: `${Math.min(100, Math.max(0, run.coverage || 0))}%` }} />
                    </div>
                    <span className="coverage-label">{`${run.coverage}%`}</span>
                  </div>
                ) : (
                  "—"
                )}
              </td>
              <td>{formatDateTime(run.startedAt || run.updatedAt)}</td>
              <td>
                <span className={`status-pill tiny ${statusClass(run)}`}>{statusLabel(run)}</span>
              </td>
              <td>{run.responseReceivedAt ? "Marked" : "—"}</td>
              <td>
                <div className="actions-inline">
                  {run.tab?.url ? (
                    <a
                      className="ghost small"
                      href={run.tab.url || ""}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View job posting
                    </a>
                  ) : null}
                  <button
                    className="ghost small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(run.runId);
                    }}
                  >
                    View details
                  </button>
                  <button
                    className="ghost small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleResponse(run);
                    }}
                    title="Mark whether you received a response"
                  >
                    {run.responseReceivedAt ? "Unmark response" : "Mark response"}
                  </button>
                  {onRerun && run.captureId ? (
                    <button
                      className="ghost small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRerun(run);
                      }}
                      disabled={!backendOnline}
                      title={!backendOnline ? "Backend required" : "Re-run analysis from the captured job posting"}
                    >
                      Re-run
                    </button>
                  ) : null}
                  <button
                    className="ghost small"
                    disabled={!run.artifacts?.pdf || !backendOnline}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(run);
                    }}
                  >
                    Download PDF
                  </button>
                  {onStop && run.result === "pending" ? (
                    <button
                      className="ghost small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStop(run);
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button
                    className="ghost small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(run);
                    }}
                    title="Remove this run from history"
                  >
                    Delete
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
};

export default RunsTable;
