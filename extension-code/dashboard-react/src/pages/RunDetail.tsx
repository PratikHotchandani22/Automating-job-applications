import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RunExplainView from "../components/RunExplainView";
import RunLatexEditorView, { type LatexChatFocus } from "../components/RunLatexEditorView";
import RunChatView from "../components/RunChatView";
import { useDashboardStore } from "../store/dashboardStore";
import type { RunStage, RunRecord } from "../types";

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

// Stage order for determining when tabs should be enabled
const STAGE_ORDER: RunStage[] = [
  "EXTRACTING",
  "RUBRIC",
  "EVIDENCE",
  "EMBEDDINGS",
  "SELECTION",
  "ANALYZING",
  "GENERATING_LATEX",
  "COMPILING_PDF",
  "DONE"
];

const getStageIndex = (stage: RunStage): number => {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= 0 ? idx : -1;
};

const hasReachedStage = (currentStage: RunStage, targetStage: RunStage): boolean => {
  const currentIdx = getStageIndex(currentStage);
  const targetIdx = getStageIndex(targetStage);
  if (currentIdx < 0 || targetIdx < 0) return false;
  return currentIdx >= targetIdx;
};

type TabId = "summary" | "chat" | "explain" | "latex" | "downloads";

interface TabConfig {
  id: TabId;
  label: string;
  isEnabled: boolean;
  disabledReason?: string;
  icon?: string;
  badge?: string | number | null;
}

// BUG-002, BUG-003, BUG-004, BUG-023: Compute tab enablement based on run state
const computeTabConfigs = (run: RunRecord): TabConfig[] => {
  const hasArtifacts = Boolean(run.artifacts && Object.keys(run.artifacts).length > 0);
  const hasLatex = Boolean(run.artifacts?.tex);
  const isRunning = run.result === "pending";
  const isComplete = run.result === "success";
  const isError = run.result === "error";
  const hasReachedRubric = hasReachedStage(run.status, "RUBRIC");
  const artifactCount = run.artifacts ? Object.keys(run.artifacts).length : 0;

  return [
    {
      id: "summary",
      label: "Overview",
      icon: "📌",
      isEnabled: true,
      badge: null
    },
    {
      id: "chat",
      label: "Ask AI",
      icon: "💬",
      isEnabled: hasReachedRubric || isComplete || isError,
      disabledReason: !hasReachedRubric 
        ? "Ask AI is available after the job analysis starts"
        : undefined,
      badge: null
    },
    {
      id: "explain",
      label: "Insights",
      icon: "🔍",
      isEnabled: isComplete, // Only for completed runs
      disabledReason: isRunning 
        ? "Detailed explanation available after run completes" 
        : isError 
          ? "Explanation not available for failed runs"
          : undefined,
      badge: null
    },
    {
      id: "latex",
      label: "Resume editor",
      icon: "✍️",
      isEnabled: hasLatex,
      disabledReason: !hasLatex
        ? isRunning
          ? "Editor is available after generation completes"
          : "Editor is not available for this run"
        : undefined,
      badge: null
    },
    {
      id: "downloads",
      label: "Files",
      icon: "📥",
      isEnabled: hasArtifacts,
      disabledReason: !hasArtifacts
        ? isRunning
          ? "Files will appear as they are generated"
          : "No files available for this run"
        : undefined,
      badge: hasArtifacts ? artifactCount : null
    }
  ];
};

// BUG-021: Format relative time
const formatRelativeTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "Unknown time";
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  
  return date.toLocaleDateString(undefined, { 
    month: "short", 
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined
  });
};

// BUG-019: Status with icon
const getStatusDisplay = (run: RunRecord): { icon: string; label: string; className: string } => {
  if (run.result === "error") {
    return { icon: "✕", label: "Failed", className: "error" };
  }
  if (run.result === "success") {
    return { icon: "✓", label: "Completed", className: "success" };
  }
  // Running
  return { icon: "●", label: "Running", className: "running" };
};

const RunDetailPage = () => {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { runs, download, retryRun, backendStatus, ensureActiveChatSession, setChatFocusOnce, refreshRunStatus, setResponseReceived } =
    useDashboardStore();
  const run = useMemo(() => runs.find((r) => r.runId === runId) || null, [runs, runId]);
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [chatDraftSeed, setChatDraftSeed] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // BUG-002: Compute tab configs based on run state
  const tabConfigs = useMemo(() => run ? computeTabConfigs(run) : [], [run]);

  // BUG-002: Auto-select first enabled tab if current tab becomes disabled
  useEffect(() => {
    if (!run) return;
    const currentTabConfig = tabConfigs.find(t => t.id === activeTab);
    if (currentTabConfig && !currentTabConfig.isEnabled) {
      const firstEnabled = tabConfigs.find(t => t.isEnabled);
      if (firstEnabled) {
        setActiveTab(firstEnabled.id);
      }
    }
  }, [tabConfigs, activeTab, run]);

  useEffect(() => {
    if (!run) return;
    ensureActiveChatSession(run);
  }, [run?.runId, ensureActiveChatSession]);

  // BUG-017: Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to go back
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey) {
        navigate("/runs");
        return;
      }
      // Cmd/Ctrl + number to switch tabs
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        const targetTab = tabConfigs[tabIndex];
        if (targetTab && targetTab.isEnabled) {
          setActiveTab(targetTab.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, tabConfigs]);

  // BUG-024: Retry mechanism
  const handleRetry = useCallback(async () => {
    if (!run) return;
    setRetrying(true);
    try {
      await retryRun(run.runId);
    } catch {
      // Error handled by store
    } finally {
      setRetrying(false);
    }
  }, [run, retryRun]);

  // BUG-024: Refresh run status
  const handleRefreshStatus = useCallback(async () => {
    if (!run) return;
    try {
      await refreshRunStatus(run.runId);
    } catch {
      // Ignore refresh errors
    }
  }, [run, refreshRunStatus]);

  if (!run) {
    return (
      <div className="run-detail-page">
        <div className="panel">
          {/* BUG-013: Breadcrumb */}
          <div className="breadcrumb">
        <button className="breadcrumb-link" onClick={() => navigate("/runs")}>Applications</button>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Not Found</span>
          </div>
          <div className="empty-state-container">
            <div className="empty-state-icon">🔍</div>
            <h3>Application not found</h3>
            <p className="hint">This item may have been removed from your history.</p>
            <div className="actions-inline" style={{ marginTop: 16 }}>
              <button className="primary" onClick={() => navigate("/runs")}>
                ← Back to Applications
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const coverage = run.coverage;
  const hasDownloads = Boolean(run.artifacts && Object.keys(run.artifacts).length);
  const hasPdf = Boolean(run.artifacts?.pdf);
  const statusDisplay = getStatusDisplay(run);
  const isRunning = run.result === "pending";
  const primaryCta =
    run.result === "error"
      ? { label: retrying ? "Retrying…" : "Retry analysis", onClick: handleRetry, disabled: backendStatus !== "online" || retrying }
      : hasPdf
        ? { label: "Download PDF", onClick: () => download(run.runId, "pdf"), disabled: backendStatus !== "online" }
        : isRunning
          ? { label: "PDF pending…", onClick: () => undefined, disabled: true }
          : { label: "No PDF generated", onClick: () => undefined, disabled: true };

  return (
    <div className="run-detail-page">
      {/* BUG-013: Breadcrumb Navigation */}
      <div className="breadcrumb">
        <button className="breadcrumb-link" onClick={() => navigate("/runs")}>Applications</button>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{run.title || "Untitled"} @ {run.company || "Unknown"}</span>
      </div>

      <div className="panel">
        <div className="run-detail-head">
          <div>
            <h2>{run.title || "Untitled role"}</h2>
            <div className="hint">{run.company || "Unknown company"}</div>
            {/* BUG-021: Relative timestamps with full date on hover */}
            <div className="meta" title={run.startedAt ? new Date(run.startedAt).toLocaleString() : undefined}>
              {run.platform || "Unknown"} · {formatRelativeTime(run.startedAt || run.updatedAt)}
              {typeof coverage === "number" ? ` · Match: ${coverage}%` : ""}
            </div>
            {/* BUG-019: Enhanced status display */}
            <div className="run-status-row">
              <span className={`status-indicator ${statusDisplay.className}`}>
                <span className="status-icon">{statusDisplay.icon}</span>
                <span className="status-label">{statusDisplay.label}</span>
              </span>
              {isRunning && (
                <button className="ghost small refresh-btn" onClick={handleRefreshStatus} title="Refresh status">
                  🔄
                </button>
              )}
            </div>
          </div>
          <div className="actions-inline">
            <button className="ghost" onClick={() => navigate("/runs")}>
              ← Back
            </button>
            {run.tab?.url ? (
              <a className="ghost" href={run.tab.url || ""} target="_blank" rel="noreferrer">
                View job posting
              </a>
            ) : null}
            <button
              className="ghost"
              onClick={() => setResponseReceived(run.runId, !run.responseReceivedAt).catch(() => undefined)}
              title="Mark whether you received a response"
            >
              {run.responseReceivedAt ? "Unmark response" : "Mark response"}
            </button>
            {/* Workspace primary CTA */}
            <div className="tooltip-wrapper">
              <button className="primary" onClick={primaryCta.onClick} disabled={primaryCta.disabled}>
                {primaryCta.label}
              </button>
              {(!hasPdf || run.result === "error") && (
                <span className="tooltip">
                  {run.result === "error"
                    ? "Retry the run from its capture."
                    : isRunning
                      ? "PDF will be available after compilation completes."
                      : "No PDF was generated for this run."}
                </span>
              )}
            </div>
            {/* Secondary CTAs */}
            {hasDownloads ? (
              <button className="ghost" onClick={() => setActiveTab("downloads")}>
                Downloads
              </button>
            ) : null}
            {run.artifacts?.tex ? (
              <button className="ghost" onClick={() => setActiveTab("latex")}>
                Open editor
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="panel">
        {/* BUG-002: Tabs with enablement logic and tooltips */}
        <div className="tabs" style={{ marginBottom: 10 }}>
          {tabConfigs.map((tab, idx) => (
            <div key={tab.id} className="tab-wrapper">
              <button
                className={`tab ${activeTab === tab.id ? "active" : ""} ${!tab.isEnabled ? "disabled" : ""}`}
                onClick={() => tab.isEnabled && setActiveTab(tab.id)}
                disabled={!tab.isEnabled}
                title={tab.disabledReason || `${tab.label} (⌘${idx + 1})`}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
                {tab.badge !== null && tab.badge !== undefined && (
                  <span className={`tab-badge ${tab.badge === "!" ? "alert" : ""}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
              {!tab.isEnabled && tab.disabledReason && (
                <span className="tab-tooltip">{tab.disabledReason}</span>
              )}
            </div>
          ))}
        </div>

        {activeTab === "summary" && (
          <div className="drawer-content">
            {/* BUG-008: Coverage with loading state */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h4>Match strength</h4>
                  <p className="hint">How closely your resume matches this job’s requirements</p>
                </div>
                {coverage !== null && coverage !== undefined ? (
                  <div className="pill coverage-pill">{coverage}%</div>
                ) : (
                  <div className="pill subtle">
                    {isRunning ? "Calculating..." : "N/A"}
                  </div>
                )}
              </div>
              <div className="coverage-large">
                {coverage !== null && coverage !== undefined ? (
                  <div className="coverage-bar lg">
                    <span style={{ width: `${Math.min(100, Math.max(0, coverage))}%` }} />
                  </div>
                ) : (
                  <div className="coverage-bar lg skeleton">
                    <span className="skeleton-fill" />
                  </div>
                )}
              </div>
              {run.uncovered && run.uncovered.length > 0 && (
                <div className="warning-box">
                  <strong>Missing from your resume ({run.uncovered.length})</strong>
                  <ul>
                    {run.uncovered.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {run.keywords && run.keywords.length > 0 && (
                <>
                  <div className="section-label">What employers want ({run.keywords.length})</div>
                  <div className="chip-row">
                    {run.keywords.slice(0, 16).map((kw) => (
                      <span className="pill subtle" key={kw}>
                        {kw}
                      </span>
                    ))}
                    {run.keywords.length > 16 && (
                      <span className="pill subtle">+{run.keywords.length - 16} more</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "chat" && (
          <div className="drawer-content drawer-content-chat">
            <RunChatView run={run} draftSeed={chatDraftSeed} />
          </div>
        )}

        {activeTab === "explain" && (
          <div className="drawer-content">
            {/* BUG-006: Better empty state for explain */}
            {run.result !== "success" ? (
              <div className="empty-state-container">
                <div className="empty-state-icon">📊</div>
                <h3>Explanation Not Available</h3>
                <p className="hint">
                  {run.result === "pending" 
                    ? "Insights will be available once your analysis finishes successfully."
                    : "Insights are not available for failed runs. You can retry the analysis from the top right."}
                </p>
              </div>
            ) : (
              <RunExplainView run={run} />
            )}
          </div>
        )}

        {activeTab === "latex" && (
          <div className="drawer-content">
            {/* BUG-005: Better empty state for LaTeX */}
            {!run.artifacts?.tex ? (
              <div className="empty-state-container">
                <div className="empty-state-icon">📝</div>
                <h3>LaTeX Not Generated Yet</h3>
                <p className="hint">
                  {isRunning 
                    ? "The resume editor will be available after generation completes."
                    : "No LaTeX was generated for this run."}
                </p>
              </div>
            ) : (
              <RunLatexEditorView
                run={run}
                onAskChat={(focus) => {
                  const sessionId = ensureActiveChatSession(run);
                  setChatFocusOnce(run.runId, sessionId, focus as LatexChatFocus);
                  setChatDraftSeed(
                    "Why does this selection look like this (what evidence/selection led to it), and can you propose a cleaner rewrite without inventing facts?"
                  );
                  setActiveTab("chat");
                }}
              />
            )}
          </div>
        )}

        {activeTab === "downloads" && (
          <div className="drawer-content">
            {hasDownloads ? (
              <div className="downloads-list">
                {Object.entries(run.artifacts || {}).map(([key]) => (
                  <div className="download-row" key={key}>
                    <div>
                      <div className="cell-title">{artifactLabels[key] || key}</div>
                      <p className="hint">Click to download</p>
                    </div>
                    <button className="ghost" onClick={() => download(run.runId, key)}>
                      Download
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state-container">
                <div className="empty-state-icon">📥</div>
                <h3>No Downloads Available</h3>
                <p className="hint">
                  {isRunning 
                    ? "Artifacts will appear here as the pipeline progresses."
                    : "No artifacts were generated for this run."}
                </p>
                {/* BUG-024: Retry button */}
                {!isRunning && (
                  <button className="ghost" onClick={handleRefreshStatus} style={{ marginTop: 12 }}>
                    🔄 Refresh Status
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* BUG-017: Keyboard shortcuts hint */}
      <div className="keyboard-hints">
        <span className="hint">Keyboard: Esc = Back · ⌘1-5 = Switch tabs</span>
      </div>
    </div>
  );
};

export default RunDetailPage;
