import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RunExplainView from "../components/RunExplainView";
import { useDashboardStore } from "../store/dashboardStore";
import type { RunRecord, RunStage } from "../types";
import { formatDateTime, formatDuration } from "../utils/runFilters";

const stepOrder: { key: RunStage | "RUBRIC" | "EVIDENCE" | "EMBEDDINGS" | "SELECTION" | "ANALYZING" | "DONE"; label: string }[] =
  [
    { key: "EXTRACTING", label: "Extract" },
    { key: "RUBRIC", label: "Rubric" },
    { key: "EVIDENCE", label: "Evidence" },
    { key: "EMBEDDINGS", label: "Embeddings" },
    { key: "SELECTION", label: "Selection" },
    { key: "ANALYZING", label: "Tailor" },
    { key: "GENERATING_LATEX", label: "LaTeX" },
    { key: "DONE", label: "Done" }
  ];

const resolveStepStatus = (run: RunRecord, stepKey: RunStage | string) => {
  const idx = stepOrder.findIndex((step) => step.key === run.status);
  const currentIdx = idx >= 0 ? idx : 0;
  const stepIdx = stepOrder.findIndex((step) => step.key === stepKey);
  if (run.result === "error" && stepIdx >= currentIdx) return "error";
  if (stepIdx < currentIdx) return "complete";
  if (stepIdx === currentIdx) return run.result === "pending" ? "active" : "complete";
  return "pending";
};

const Stepper = ({ run }: { run: RunRecord }) => (
  <div className="stepper">
    {stepOrder.map((step, idx) => (
      <div key={step.key} className={`step ${resolveStepStatus(run, step.key)}`}>
        <span className="index">{idx + 1}</span>
        <span>{step.label}</span>
      </div>
    ))}
  </div>
);

const RunDetailPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { runs, download, retryRun, backendStatus, selectRun } = useDashboardStore();
  const run = useMemo(() => runs.find((r) => r.runId === runId) || null, [runs, runId]);

  if (!run) {
    return (
      <div className="run-detail-page">
        <div className="panel">
          <h3>Run not found</h3>
          <p className="hint">We could not find this run. It may be older history or was removed.</p>
          <div className="actions-inline" style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => navigate("/runs")}>
              Back to Runs
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Keep store selection in sync (but never update state during render)
  useEffect(() => {
    if (run) selectRun(run.runId);
  }, [run, selectRun]);

  const handleRetry = () => retryRun(run.runId).catch(() => undefined);

  return (
    <div className="run-detail-page">
      <div className="panel">
        <div className="run-detail-head">
          <div>
            <div className="pill subtle">Run ID {run.runId}</div>
            <h2>{run.title || "Untitled role"}</h2>
            <div className="hint">{run.company || "Unknown company"}</div>
            <div className="meta">
              {run.platform || "Unknown"} · {formatDateTime(run.startedAt || run.updatedAt)} · {formatDuration(run.runtimeSec)}
            </div>
          </div>
          <div className="actions-inline">
            <button className="ghost" onClick={() => navigate("/runs")}>
              Back
            </button>
            <button
              className="primary"
              onClick={() => download(run.runId, "pdf")}
              disabled={!run.artifacts?.pdf || backendStatus !== "online"}
            >
              Download PDF
            </button>
            {run.result === "error" ? (
              <button className="ghost" onClick={handleRetry} disabled={backendStatus !== "online"}>
                Retry run
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Stepper run={run} />
        </div>
      </div>

      <div className="panel">
        <RunExplainView run={run} />
      </div>
    </div>
  );
};

export default RunDetailPage;
