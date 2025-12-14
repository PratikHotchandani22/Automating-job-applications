import { useMemo } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import type { RunRecord, RunStage } from "../types";
import { formatDateTime, formatDuration } from "../utils/runFilters";
import RunExplainView from "./RunExplainView";

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

const Stepper = ({ run }: { run: RunRecord }) => {
  return (
    <div className="stepper">
      {stepOrder.map((step, idx) => (
        <div key={step.key} className={`step ${resolveStepStatus(run, step.key)}`}>
          <span className="index">{idx + 1}</span>
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
};

const artifactLabels: Record<string, string> = {
  pdf: "PDF",
  tex: "LaTeX",
  json: "tailored.json",
  tailored: "tailored.json",
  selection_plan: "selection_plan.json",
  jd_rubric: "jd_rubric.json",
  baseline: "baseline_resume.json",
  final_resume: "final_resume.json",
  job_text: "job_extracted.txt",
  evidence_scores: "evidence_scores.json",
  jd_requirement_embeddings: "jd_requirement_embeddings.json",
  relevance_matrix: "relevance_matrix.json",
  relevance_summary: "relevance_summary.json",
  selection_debug: "selection_debug.json",
  meta: "meta.json",
  prompt_used_rubric: "prompt_used_rubric.txt"
};

const RunDetailDrawer = () => {
  const { runs, selectedRunId, selectRun, detailTab, setDetailTab, download, retryRun, backendStatus } = useDashboardStore();
  const run = useMemo(() => runs.find((r) => r.runId === selectedRunId) || null, [runs, selectedRunId]);

  if (!run) return null;

  const coverage = run.coverage || 0;
  const hasDownloads = Boolean(run.artifacts && Object.keys(run.artifacts).length);
  const handleRetry = () => retryRun(run.runId).catch(() => undefined);

  return (
    <aside className={`drawer ${run ? "open" : ""}`}>
      <div className="drawer-header">
        <div>
          <div className="pill subtle">Run ID {run.runId}</div>
          <h3>
            {run.title || "Untitled role"} {run.company ? `· ${run.company}` : ""}
          </h3>
          <div className="meta">
            {run.platform || "Unknown"} · {formatDateTime(run.startedAt || run.updatedAt)} · {formatDuration(run.runtimeSec)}
          </div>
        </div>
        <div className="drawer-actions">
          <button className="ghost" onClick={() => selectRun(null)}>
            Close
          </button>
          <button
            className="primary"
            onClick={() => download(run.runId, "pdf")}
            disabled={!run.artifacts?.pdf || backendStatus !== "online"}
          >
            Download PDF
          </button>
        </div>
      </div>

      <Stepper run={run} />

      <div className="tabs">
        {["summary", "explain", "downloads", "debug"].map((tab) => (
          <button
            key={tab}
            className={`tab ${detailTab === tab ? "active" : ""}`}
            onClick={() => setDetailTab(tab as "summary" | "explain" | "downloads" | "debug")}
          >
            {tab === "summary" ? "Summary" : tab === "explain" ? "Explain" : tab === "downloads" ? "Downloads" : "Debug"}
          </button>
        ))}
      </div>

      {detailTab === "summary" ? (
        <div className="drawer-content">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h4>Coverage</h4>
                <p className="hint">Matches against job requirements</p>
              </div>
              <div className="pill">{coverage}%</div>
            </div>
            <div className="coverage-large">
              <div className="coverage-bar lg">
                <span style={{ width: `${Math.min(100, Math.max(0, coverage))}%` }} />
              </div>
            </div>
            {run.uncovered && run.uncovered.length ? (
              <div className="warning-box">
                <strong>Uncovered requirements</strong>
                <ul>
                  {run.uncovered.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {run.keywords && run.keywords.length ? (
              <div className="chip-row">
                {run.keywords.slice(0, 12).map((kw) => (
                  <span className="pill subtle" key={kw}>
                    {kw}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {detailTab === "explain" ? (
        <div className="drawer-content">
          <RunExplainView run={run} />
        </div>
      ) : null}

      {detailTab === "downloads" ? (
        <div className="drawer-content">
          {hasDownloads ? (
            <div className="downloads-list">
              {Object.entries(run.artifacts || {}).map(([key]) => (
                <div className="download-row" key={key}>
                  <div>
                    <div className="cell-title">{artifactLabels[key] || key}</div>
                    <p className="hint">Download artifact</p>
                  </div>
                  <button className="ghost" onClick={() => download(run.runId, key)}>
                    Download
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Artifacts will appear once the run is complete.</div>
          )}
        </div>
      ) : null}

      {detailTab === "debug" ? (
        <div className="drawer-content">
          <div className="panel">
            <div className="panel-head">
              <h4>Debug</h4>
              {run.result === "error" ? (
                <button className="primary ghost" onClick={handleRetry} disabled={backendStatus !== "online"}>
                  Retry run
                </button>
              ) : null}
            </div>
            <p className="hint">{run.message || "No debug notes captured."}</p>
            <div className="meta">Stage: {run.status}</div>
          </div>
        </div>
      ) : null}
    </aside>
  );
};

export default RunDetailDrawer;
