"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import TailoredResumeView from "@/components/TailoredResumeView";
import UserOnboarding from "@/components/UserOnboarding";

const STAGE_ORDER = [
  "initialized",
  "extracting",
  "rubric_generating",
  "rubric_generated",
  "embedding_jd",
  "selecting",
  "selection_complete",
  "tailoring",
  "tailored",
  "generating_latex",
  "generating_pdf",
  "DONE",
];

const STAGE_LABELS: Record<string, string> = {
  initialized: "Initialized",
  extracting: "Extracting",
  rubric_generating: "Generating Rubric",
  rubric_generated: "Rubric Ready",
  embedding_jd: "Embedding JD",
  selecting: "Selecting Bullets",
  selection_complete: "Selection Done",
  tailoring: "Tailoring Resume",
  tailored: "Tailored",
  generating_latex: "Generating LaTeX",
  generating_pdf: "Generating PDF",
  DONE: "Complete",
  ERROR: "Error",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function RunResultsPage() {
  const params = useParams();
  const router = useRouter();
  const runIdParam = params.runId as string;
  const { user: clerkUser } = useUser();
  
  const [activeTab, setActiveTab] = useState<"overview" | "tailored" | "rubric" | "selection">("overview");
  const [copyToast, setCopyToast] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Get user from Convex
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );

  // Get full run details
  const runDetails = useQuery(
    api.runDetails.getFullRunDetailsByRunId,
    runIdParam ? { runId: runIdParam } : "skip"
  );

  // Compute run progress
  const runProgress = useMemo(() => {
    if (!runDetails?.run) return 0;
    const stage = runDetails.run.stage;
    if (stage === "ERROR") return 0;
    if (stage === "DONE") return 100;
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx === -1) return 0;
    return Math.round((idx / (STAGE_ORDER.length - 1)) * 100);
  }, [runDetails?.run]);

  // Primary tailored resume (first one or by modelKey)
  const primaryTailoredResume = useMemo(() => {
    if (!runDetails?.tailoredResumes?.length) return null;
    return runDetails.tailoredResumes[0];
  }, [runDetails?.tailoredResumes]);

  const handleCopyRunId = useCallback(() => {
    navigator.clipboard.writeText(runIdParam);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  }, [runIdParam]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Show onboarding if user not set up
  if (!convexUser) {
    return <UserOnboarding />;
  }

  // Loading state
  if (runDetails === undefined) {
    return (
      <div className="run-detail-page">
        <div className="panel">
          <div className="loading-state">
            <div className="spinner" />
            <span>Loading run details...</span>
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (runDetails === null) {
    return (
      <div className="run-detail-page">
        <div className="panel">
          <div className="empty-state-container">
            <div className="empty-state-icon">🔍</div>
            <h3>Run Not Found</h3>
            <p className="hint">The run with ID "{runIdParam}" was not found or has been deleted.</p>
            <Link href="/runs" className="primary" style={{ marginTop: "1rem" }}>
              Back to Runs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { run, job, masterResume, jdRubric, selectionPlan, tailoredResumes, artifacts } = runDetails;

  return (
    <div className="run-detail-page">
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href="/runs" className="breadcrumb-link">
          Runs
        </Link>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-current">{job?.title || run.runId}</span>
      </div>

      {/* Header Panel */}
      <div className="panel">
        <div className="run-detail-head">
          <div>
            <div className="run-id-row">
              <button className="run-id-pill status-pill subtle" onClick={handleCopyRunId}>
                <code>{run.runId.slice(0, 12)}...</code>
                <span className="copy-icon">📋</span>
              </button>
              {copyToast && <span className="copy-toast">Copied!</span>}
            </div>
            <h2>{job?.title || "Untitled Job"}</h2>
            <p className="hint">
              {job?.company || "Unknown Company"}
              {job?.location && ` • ${job.location}`}
            </p>
          </div>
          <div className="actions-inline">
            <button className="ghost small refresh-btn" onClick={handleRefresh} title="Refresh">
              🔄
            </button>
            {job?.jobUrl && (
              <a href={job.jobUrl} target="_blank" rel="noopener noreferrer" className="ghost small">
                View Job ↗
              </a>
            )}
            <Link href="/runs" className="ghost small">
              ← All Runs
            </Link>
          </div>
        </div>

        {/* Status Row */}
        <div className="run-status-row">
          <div className={`status-indicator ${run.status}`}>
            <span className="status-icon">
              {run.status === "success" ? "✓" : run.status === "error" ? "✕" : "●"}
            </span>
            {run.status.toUpperCase()}
          </div>
          <span className="stage-badge">
            {STAGE_LABELS[run.stage] || run.stage}
          </span>
          <span className="hint">
            Started {formatDate(run.createdAt)}
            {run.completedAt && ` • Completed ${formatDate(run.completedAt)}`}
          </span>
        </div>

        {/* Progress Bar (for running runs) */}
        {run.status === "running" && (
          <div className="pipeline-progress" style={{ marginTop: "1rem" }}>
            <div
              className="pipeline-progress-fill"
              style={{ width: `${runProgress}%` }}
            />
          </div>
        )}

        {/* Error Message */}
        {run.status === "error" && run.errorMessage && (
          <div className="warning-box" style={{ marginTop: "1rem" }}>
            <strong>Error:</strong> {run.errorMessage}
          </div>
        )}

        {/* Timing Stats */}
        {run.timing && (
          <div className="metrics-grid" style={{ marginTop: "1rem" }}>
            {run.timing.rubricMs && (
              <div className="metric-item">
                <label>Rubric</label>
                <div>{formatDuration(run.timing.rubricMs)}</div>
              </div>
            )}
            {run.timing.embeddingMs && (
              <div className="metric-item">
                <label>Embedding</label>
                <div>{formatDuration(run.timing.embeddingMs)}</div>
              </div>
            )}
            {run.timing.selectionMs && (
              <div className="metric-item">
                <label>Selection</label>
                <div>{formatDuration(run.timing.selectionMs)}</div>
              </div>
            )}
            {run.timing.tailorMs && (
              <div className="metric-item">
                <label>Tailoring</label>
                <div>{formatDuration(run.timing.tailorMs)}</div>
              </div>
            )}
            {run.timing.totalMs && (
              <div className="metric-item">
                <label>Total</label>
                <div>{formatDuration(run.timing.totalMs)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === "tailored" ? "active" : ""}`}
          onClick={() => setActiveTab("tailored")}
          disabled={!tailoredResumes?.length}
        >
          Tailored Resume
          {tailoredResumes?.length ? ` (${tailoredResumes.length})` : ""}
        </button>
        <button
          className={`tab ${activeTab === "rubric" ? "active" : ""}`}
          onClick={() => setActiveTab("rubric")}
          disabled={!jdRubric}
        >
          JD Rubric
        </button>
        <button
          className={`tab ${activeTab === "selection" ? "active" : ""}`}
          onClick={() => setActiveTab("selection")}
          disabled={!selectionPlan}
        >
          Selection Plan
        </button>
      </div>

      {/* Tab Content */}
      <div className="panel">
        {activeTab === "overview" && (
          <div className="tab-pane">
            {/* Job Summary */}
            {job && (
              <div className="explain-section">
                <h3>Job Details</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Title</label>
                    <div>{job.title}</div>
                  </div>
                  {job.company && (
                    <div className="info-item">
                      <label>Company</label>
                      <div>{job.company}</div>
                    </div>
                  )}
                  {job.location && (
                    <div className="info-item">
                      <label>Location</label>
                      <div>{job.location}</div>
                    </div>
                  )}
                  <div className="info-item">
                    <label>Platform</label>
                    <div>{job.platform || "Unknown"}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Coverage Stats */}
            {selectionPlan?.coverage && (
              <div className="explain-section">
                <h3>Requirement Coverage</h3>
                <div className="coverage-visual">
                  <div className="coverage-circle">
                    <svg viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="8"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="var(--success)"
                        strokeWidth="8"
                        strokeDasharray={`${((selectionPlan.coverage.mustCovered + selectionPlan.coverage.niceCovered) / (selectionPlan.coverage.mustTotal + selectionPlan.coverage.niceTotal)) * 339} 339`}
                        strokeLinecap="round"
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <span className="coverage-percent">
                      {Math.round(
                        ((selectionPlan.coverage.mustCovered + selectionPlan.coverage.niceCovered) /
                          (selectionPlan.coverage.mustTotal + selectionPlan.coverage.niceTotal)) *
                          100
                      )}%
                    </span>
                  </div>
                  <div className="coverage-breakdown">
                    <div className="coverage-row">
                      <span className="coverage-label">Must-have requirements</span>
                      <span className="coverage-value">
                        {selectionPlan.coverage.mustCovered}/{selectionPlan.coverage.mustTotal}
                      </span>
                    </div>
                    <div className="coverage-row">
                      <span className="coverage-label">Nice-to-have requirements</span>
                      <span className="coverage-value">
                        {selectionPlan.coverage.niceCovered}/{selectionPlan.coverage.niceTotal}
                      </span>
                    </div>
                    <div className="coverage-row total">
                      <span className="coverage-label">Total covered</span>
                      <span className="coverage-value">
                        {selectionPlan.coverage.mustCovered + selectionPlan.coverage.niceCovered}/
                        {selectionPlan.coverage.mustTotal + selectionPlan.coverage.niceTotal}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="explain-section">
              <h3>Quick Actions</h3>
              <div className="actions-inline" style={{ marginTop: "1rem" }}>
                {primaryTailoredResume && (
                  <button className="primary" onClick={() => setActiveTab("tailored")}>
                    View Tailored Resume
                  </button>
                )}
                {!primaryTailoredResume && run.status === "running" && (
                  <button className="primary" disabled>
                    Resume in progress...
                  </button>
                )}
                {jdRubric && (
                  <button className="ghost" onClick={() => setActiveTab("rubric")}>
                    View Rubric
                  </button>
                )}
              </div>
            </div>

            {/* Generated Artifacts */}
            {artifacts?.length > 0 && (
              <div className="explain-section">
                <h3>Generated Artifacts</h3>
                <div className="downloads-grid">
                  {artifacts.map((artifact: any) => (
                    <div key={artifact._id} className="download-item">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>
                          <strong>{artifact.artifactType.toUpperCase()}</strong> - {artifact.fileName}
                        </span>
                        <span className="hint">
                          {(artifact.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tailored" && primaryTailoredResume && (
          <div className="tab-pane">
            <TailoredResumeView
              tailoredResume={primaryTailoredResume}
              masterResume={masterResume}
              job={job}
              runId={run._id}
              artifacts={artifacts || []}
              onArtifactCreated={handleRefresh}
            />
          </div>
        )}

        {activeTab === "tailored" && !primaryTailoredResume && (
          <div className="tab-pane">
            <div className="empty-state-container">
              <div className="empty-state-icon">📄</div>
              <h3>No Tailored Resume Yet</h3>
              <p className="hint">
                {run.status === "running"
                  ? "The tailored resume is being generated..."
                  : run.status === "error"
                    ? "An error occurred before the resume could be generated."
                    : "No tailored resume was generated for this run."}
              </p>
            </div>
          </div>
        )}

        {activeTab === "rubric" && jdRubric && (
          <div className="tab-pane">
            <div className="explain-section">
              <h3>Job Requirements ({jdRubric.requirements.length})</h3>
              <p className="section-hint">
                These are the requirements extracted from the job description.
              </p>
              <div className="requirements-list">
                {jdRubric.requirements.map((req: any) => (
                  <div
                    key={req.reqId}
                    className={`requirement-card ${
                      selectionPlan?.coverage.uncoveredRequirements.some(
                        (u: any) => u.reqId === req.reqId
                      )
                        ? "uncovered"
                        : "covered"
                    }`}
                  >
                    <div className="requirement-header">
                      <div className="requirement-badge">
                        <span className={`badge ${req.type}`}>{req.type}</span>
                        <span className="weight">Weight: {req.weight}</span>
                      </div>
                      <span className="status-badge">
                        {selectionPlan?.coverage.uncoveredRequirements.some(
                          (u: any) => u.reqId === req.reqId
                        )
                          ? "❌ Uncovered"
                          : "✓ Covered"}
                      </span>
                    </div>
                    <div className="requirement-text">{req.requirement}</div>
                    {req.jdEvidence?.length > 0 && (
                      <div className="requirement-evidence">
                        <strong>Evidence from JD:</strong>
                        <div className="evidence-chips">
                          {req.jdEvidence.map((ev: string, idx: number) => (
                            <span key={idx} className="evidence-chip">
                              "{ev}"
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Keywords */}
            {jdRubric.keywords?.length > 0 && (
              <div className="explain-section" style={{ marginTop: "1.5rem" }}>
                <h3>Keywords ({jdRubric.keywords.length})</h3>
                <div className="keywords-grid">
                  {jdRubric.keywords.slice(0, 20).map((kw: any, idx: number) => (
                    <div key={idx} className={`keyword-card importance-${kw.importance}`}>
                      <div className="keyword-header">
                        <span className="keyword-term">{kw.term}</span>
                        <span className="keyword-type">{kw.type}</span>
                      </div>
                      <div className="keyword-importance">
                        <div className="importance-bar">
                          <div
                            className="importance-fill"
                            style={{ width: `${kw.importance * 20}%` }}
                          />
                        </div>
                        <span className="importance-value">{kw.importance}/5</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "rubric" && !jdRubric && (
          <div className="tab-pane">
            <div className="empty-state-container">
              <div className="empty-state-icon">📋</div>
              <h3>No Rubric Generated</h3>
              <p className="hint">
                {run.status === "running"
                  ? "The rubric is being generated..."
                  : "No rubric was generated for this run."}
              </p>
            </div>
          </div>
        )}

        {activeTab === "selection" && selectionPlan && (
          <div className="tab-pane">
            <div className="explain-section">
              <h3>Selection Summary</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Experience Bullets</label>
                  <div>{selectionPlan.budgetsUsed.experienceBullets}</div>
                </div>
                <div className="info-item">
                  <label>Project Bullets</label>
                  <div>{selectionPlan.budgetsUsed.projectBullets}</div>
                </div>
                <div className="info-item">
                  <label>Award Lines</label>
                  <div>{selectionPlan.budgetsUsed.awardLines}</div>
                </div>
                <div className="info-item">
                  <label>Embedding Model</label>
                  <div>{selectionPlan.embeddingModel}</div>
                </div>
              </div>
            </div>

            {/* Selected Bullets by Category */}
            <div className="explain-section" style={{ marginTop: "1.5rem" }}>
              <h3>Selected Work Experience Bullets ({selectionPlan.selected.workExperience.length})</h3>
              <div className="pipeline-bullets">
                {selectionPlan.selected.workExperience.map((bullet: any) => (
                  <div key={bullet.bulletId} className="pipeline-bullet">
                    <details>
                      <summary className="pipeline-bullet-summary">
                        <div className="pipeline-bullet-left">
                          <div className="pipeline-bullet-text">{bullet.originalText}</div>
                          <div className="pipeline-bullet-sub">
                            <span className="pipeline-mini-tag">{bullet.company}</span>
                            <span className="pipeline-mini-tag">{bullet.role}</span>
                          </div>
                        </div>
                        <div className="pipeline-bullet-right">
                          <span className="pipeline-evidence-pill">
                            Evidence: {bullet.evidence.score.toFixed(2)} ({bullet.evidence.tier})
                          </span>
                        </div>
                      </summary>
                      <div className="pipeline-bullet-body">
                        <div className="pipeline-bullet-section-title">Matching Requirements</div>
                        <div className="pipeline-match-grid">
                          {bullet.matches.slice(0, 3).map((match: any) => (
                            <div key={match.reqId} className="pipeline-match-row">
                              <span className="pipeline-tag">{match.reqId}</span>
                              <span>Relevance: {match.rel.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pipeline-bullet-section-title" style={{ marginTop: "1rem" }}>
                          Rewrite Intent
                        </div>
                        <span className={`badge ${bullet.rewriteIntent}`}>{bullet.rewriteIntent}</span>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>

            {selectionPlan.selected.projects.length > 0 && (
              <div className="explain-section" style={{ marginTop: "1.5rem" }}>
                <h3>Selected Project Bullets ({selectionPlan.selected.projects.length})</h3>
                <div className="pipeline-bullets">
                  {selectionPlan.selected.projects.map((bullet: any) => (
                    <div key={bullet.bulletId} className="pipeline-bullet">
                      <div className="pipeline-bullet-summary">
                        <div className="pipeline-bullet-left">
                          <div className="pipeline-bullet-text">{bullet.originalText}</div>
                        </div>
                        <div className="pipeline-bullet-right">
                          <span className="pipeline-evidence-pill">
                            Evidence: {bullet.evidence.score.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uncovered Requirements */}
            {selectionPlan.coverage.uncoveredRequirements.length > 0 && (
              <div className="explain-section" style={{ marginTop: "1.5rem" }}>
                <h3>Uncovered Requirements ({selectionPlan.coverage.uncoveredRequirements.length})</h3>
                <p className="section-hint">
                  These requirements could not be covered with your resume bullets.
                </p>
                <div className="requirements-list">
                  {selectionPlan.coverage.uncoveredRequirements.map((ur: any) => (
                    <div key={ur.reqId} className="requirement-card uncovered">
                      <div className="requirement-header">
                        <div className="requirement-badge">
                          <span className={`badge ${ur.type}`}>{ur.type}</span>
                          <span className="weight">Weight: {ur.weight}</span>
                        </div>
                      </div>
                      <div className="uncovered-reason">
                        <strong>Reason:</strong> {ur.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "selection" && !selectionPlan && (
          <div className="tab-pane">
            <div className="empty-state-container">
              <div className="empty-state-icon">📊</div>
              <h3>No Selection Plan</h3>
              <p className="hint">
                {run.status === "running"
                  ? "The selection plan is being generated..."
                  : "No selection plan was generated for this run."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

