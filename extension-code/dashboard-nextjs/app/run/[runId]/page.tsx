"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { renderRichText } from "@/utils/renderRichText";
import TailoredResumeView from "@/components/TailoredResumeView";
import UserOnboarding from "@/components/UserOnboarding";
import {
  PageHeader,
  SectionCard,
  StickySummaryRail,
} from "@/components/RunDetailsComponents";

const STAGE_ORDER = [
  "queued",
  "analyzing",
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
  queued: "Queued",
  analyzing: "Analyzing",
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

const JOB_SECTION_TITLES = [
  "About the Job",
  "About the Role",
  "About the Position",
  "About the Company",
  "Summary",
  "Responsibilities",
  "Key Responsibilities",
  "Primary Responsibilities",
  "Required Qualifications",
  "Preferred Qualifications",
  "Compensation",
  "Benefits",
  "Logistics",
  "Equal Opportunity Statement",
] as const;

function parseJobDescriptionSections(description?: string) {
  if (!description) return [];
  const normalized = description.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lowerText = normalized.toLowerCase();
  const matches = JOB_SECTION_TITLES.map((title) => {
    const idx = lowerText.indexOf(title.toLowerCase());
    if (idx === -1) return null;
    return { title, idx };
  })
    .filter((match): match is { title: string; idx: number } => Boolean(match))
    .sort((a, b) => a.idx - b.idx);

  const sections: { title: string; content: string }[] = [];
  if (matches.length === 0) {
    return [{ title: "About the Job", content: normalized }];
  }

  if (matches[0].idx > 0) {
    const leadingText = normalized.slice(0, matches[0].idx).trim();
    if (leadingText) {
      sections.push({ title: "About the Job", content: leadingText });
    }
  }

  for (let i = 0; i < matches.length; i += 1) {
    const { title, idx } = matches[i];
    const start = idx + title.length;
    const nextMatch = matches[i + 1];
    const end = nextMatch ? nextMatch.idx : normalized.length;
    let content = normalized.slice(start, end).trim();
    while (content.startsWith(":")) {
      content = content.slice(1).trim();
    }
    if (!content) {
      content = normalized.slice(start, end).trim();
    }
    if (content) {
      sections.push({ title, content });
    }
  }

  if (sections.length === 0 && normalized) {
    sections.push({ title: "About the Job", content: normalized });
  }

  return sections;
}

export default function RunResultsPage() {
  const params = useParams();
  const runIdParam = params.runId as string;
  const { user: clerkUser } = useUser();
  const executeTriggeredRef = useRef(false);
  
  const [activeTab, setActiveTab] = useState<"overview" | "tailored" | "rubric" | "selection">("overview");
  const [tailoredSubTab, setTailoredSubTab] =
    useState<"preview" | "bullets" | "latex" | "extras">("preview");
  const [copyToast, setCopyToast] = useState<string | null>(null);
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

  useEffect(() => {
    if (!runDetails?.run || executeTriggeredRef.current) return;
    if (runDetails.run.status !== "pending" || runDetails.run.stage !== "queued") return;

    executeTriggeredRef.current = true;
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "execute", run_id: runDetails.run.runId }),
      keepalive: true,
    }).catch(() => {
      executeTriggeredRef.current = false;
    });
  }, [runDetails?.run]);

  const [generatePdfContext, setGeneratePdfContext] = useState<{
    trigger: () => Promise<void>;
    loading: boolean;
  } | null>(null);
  const registerGeneratePdf = useCallback(
    (context: { trigger: () => Promise<void>; loading: boolean } | null) => {
      setGeneratePdfContext(context);
    },
    []
  );

  const jobDescriptionText = runDetails?.job?.extractedText || runDetails?.job?.rawDescription;
  const jobSections = useMemo(() => {
    if (runDetails?.job?.structuredDescription?.length) {
      return runDetails.job.structuredDescription;
    }
    return parseJobDescriptionSections(jobDescriptionText);
  }, [runDetails?.job?.structuredDescription, jobDescriptionText]);
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

  const readyScore = useMemo(() => {
    if (!runDetails?.run) return 0;
    let score = 0;
    if (runDetails.run.status === "success") score += 45;
    if (primaryTailoredResume) score += 25;
    if (runDetails?.selectionPlan?.coverage) {
      const total =
        runDetails.selectionPlan.coverage.mustTotal + runDetails.selectionPlan.coverage.niceTotal;
      if (total > 0) {
        const covered =
          runDetails.selectionPlan.coverage.mustCovered +
          runDetails.selectionPlan.coverage.niceCovered;
        score += Math.round((covered / total) * 30);
      }
    }
    return Math.min(score, 100);
  }, [primaryTailoredResume, runDetails?.run, runDetails?.selectionPlan?.coverage]);

  const nextActions = useMemo(() => {
    const actions: { label: string; onClick?: () => void; done?: boolean }[] = [];
    if (runDetails?.run.status !== "success") {
      actions.push({ label: "Tailoring in progress", done: false });
    } else {
      actions.push({
        label: "Review bullet changes",
        onClick: () => {
          setActiveTab("tailored");
          setTailoredSubTab("bullets");
        },
        done: false,
      });
      actions.push({
        label: "Scan JD rubric coverage",
        onClick: () => setActiveTab("rubric"),
        done: Boolean(runDetails?.selectionPlan?.coverage),
      });
      actions.push({
        label: "Export final PDF",
        onClick: () => generatePdfContext?.trigger(),
        done: Boolean(
          runDetails?.artifacts?.some((artifact: any) => artifact.artifactType === "pdf")
        ),
      });
    }
    return actions;
  }, [generatePdfContext, runDetails?.artifacts, runDetails?.run.status, runDetails?.selectionPlan?.coverage]);

  const handleCopyRunId = useCallback(() => {
    navigator.clipboard.writeText(runIdParam);
    setCopyToast("Run ID copied");
    setTimeout(() => setCopyToast(null), 2000);
  }, [runIdParam]);

  const handleCopyRawJson = useCallback(() => {
    if (!runDetails) return;
    navigator.clipboard.writeText(JSON.stringify(runDetails, null, 2));
    setCopyToast("Run data copied");
    setTimeout(() => setCopyToast(null), 2000);
  }, [runDetails]);

  const handleCopyShareLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopyToast("Share link copied");
    setTimeout(() => setCopyToast(null), 2000);
  }, []);

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
  const generatePdfLoading = Boolean(generatePdfContext?.loading);
  const generatePdfDisabled =
    !generatePdfContext || generatePdfLoading || run.status !== "success";
  const readyLabel = run.status === "success" && readyScore >= 85 ? "Ready to submit" : "Needs review";
  const stageLabel = STAGE_LABELS[run.stage] || run.stage;

  // Reusable summary rail body shared between sticky rail and mobile drawer.
  const SummaryRailContent = () => (
    <div className="rail-stack">
      <div className="rail-card">
        <div className="rail-card-head">
          <h3>Run Health</h3>
          <span className={`status-pill ${run.status}`}>{run.status.toUpperCase()}</span>
        </div>
        <div className="rail-metrics">
          <div className="rail-metric">
            <span className="label">Stage</span>
            <span>{stageLabel}</span>
          </div>
          <div className="rail-metric">
            <span className="label">Started</span>
            <span>{formatDate(run.createdAt)}</span>
          </div>
          {run.completedAt && (
            <div className="rail-metric">
              <span className="label">Completed</span>
              <span>{formatDate(run.completedAt)}</span>
            </div>
          )}
        </div>
        {run.status === "running" && (
          <div className="pipeline-progress">
            <div className="pipeline-progress-fill" style={{ width: `${runProgress}%` }} />
          </div>
        )}
      </div>

      <div className="rail-card">
        <div className="rail-card-head">
          <h3>Ready to Submit</h3>
          <span className="score-pill">{readyScore}%</span>
        </div>
        <p className="rail-summary">{readyLabel}</p>
        <div className="score-bar">
          <div className="score-fill" style={{ width: `${readyScore}%` }} />
        </div>
        {selectionPlan?.coverage && (
          <div className="rail-metrics">
            <div className="rail-metric">
              <span className="label">Must-have</span>
              <span>
                {selectionPlan.coverage.mustCovered}/{selectionPlan.coverage.mustTotal}
              </span>
            </div>
            <div className="rail-metric">
              <span className="label">Nice-to-have</span>
              <span>
                {selectionPlan.coverage.niceCovered}/{selectionPlan.coverage.niceTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rail-card">
        <div className="rail-card-head">
          <h3>Next Best Actions</h3>
        </div>
        <div className="next-actions">
          {nextActions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              className={`next-action ${action.done ? "done" : ""}`}
              onClick={action.onClick}
              disabled={!action.onClick}
            >
              <span className="next-action-icon">{action.done ? "✓" : "•"}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rail-card">
        <div className="rail-card-head">
          <h3>Export & Share</h3>
        </div>
        <div className="rail-actions">
          <button
            className="primary"
            type="button"
            disabled={generatePdfDisabled}
            onClick={() => generatePdfContext?.trigger()}
          >
            {generatePdfLoading ? "Exporting..." : "Download PDF"}
          </button>
          <button className="ghost" type="button" onClick={handleCopyShareLink}>
            Copy share link
          </button>
          <button className="ghost" type="button" onClick={() => setActiveTab("tailored")}>
            View tailored resume
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="run-detail-page">
      <div className="breadcrumb">
        <Link href="/runs" className="breadcrumb-link">
          Runs
        </Link>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-current">{job?.title || run.runId}</span>
      </div>

      <div className="panel run-header-panel">
        <PageHeader
          title={job?.title || "Untitled Job"}
          subtitle={`${job?.company || "Unknown Company"}${job?.location ? ` • ${job.location}` : ""}`}
          statusBadge={
            <span className={`status-pill ${run.status}`}>{run.status.toUpperCase()}</span>
          }
          timestamps={
            <span className="hint">
              Started {formatDate(run.createdAt)}
              {run.completedAt && ` • Completed ${formatDate(run.completedAt)}`}
              {` • ${stageLabel}`}
            </span>
          }
          actions={
            <div className="header-cta-group">
              <button
                className="primary"
                type="button"
                disabled={generatePdfDisabled}
                onClick={() => generatePdfContext?.trigger()}
              >
                {generatePdfLoading ? "Exporting..." : "Download PDF"}
              </button>
              <button className="ghost" type="button" onClick={handleRefresh}>
                Regenerate
              </button>
              <button className="ghost" type="button" onClick={() => setActiveTab("rubric")}>
                View JD
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setActiveTab("tailored");
                  setTailoredSubTab("bullets");
                }}
              >
                Compare
              </button>
            </div>
          }
          overflow={
            <details className="overflow-menu">
              <summary className="ghost small" aria-label="More actions">
                ⋯
              </summary>
              <div className="overflow-menu-panel">
                <button type="button" className="overflow-menu-item" onClick={handleCopyRunId}>
                  Copy run ID
                </button>
                <button type="button" className="overflow-menu-item" onClick={handleCopyRawJson}>
                  Copy raw JSON
                </button>
                <Link href="/runs" className="overflow-menu-item">
                  Back to runs
                </Link>
              </div>
            </details>
          }
        />
        {copyToast && <div className="copy-toast">{copyToast}</div>}
      </div>

      {run.status === "error" && run.errorMessage && (
        <div className="warning-box">
          <strong>Error:</strong> {run.errorMessage}
        </div>
      )}

      <div className="summary-drawer">
        <details>
          <summary>Run summary</summary>
          <SummaryRailContent />
        </details>
      </div>

      <div className="run-command-center">
        <StickySummaryRail>
          <SummaryRailContent />
        </StickySummaryRail>

        <div className="run-main">
          <div className="tabs subtle-tabs">
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

          <div className="panel">
            {activeTab === "overview" && (
              <div className="tab-pane">
                {job && (
                  <SectionCard title="Job Description" subtitle="Tailoring input" collapsible defaultOpen>
                    {jobDescriptionText ? (
                      <div className="job-description-accordion">
                        {jobSections.map((section, idx) => (
                          <details key={`${section.title}-${idx}`} open={idx === 0}>
                            <summary>
                              <span className="job-section-title">{section.title}</span>
                              <span className="job-section-toggle" aria-hidden="true" />
                            </summary>
                            <div className="section-content">{renderRichText(section.content)}</div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <p className="hint">No job description was captured for this posting.</p>
                    )}
                  </SectionCard>
                )}

                {selectionPlan?.coverage && (
                  <SectionCard title="Requirement Coverage">
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
                  </SectionCard>
                )}
              </div>
            )}

            {primaryTailoredResume && (
              <div
                className="tab-pane"
                aria-hidden={activeTab !== "tailored"}
                style={{ display: activeTab === "tailored" ? undefined : "none" }}
              >
                <TailoredResumeView
                  tailoredResume={primaryTailoredResume}
                  masterResume={masterResume}
                  job={job}
                  runId={run._id}
                  artifacts={artifacts || []}
                  onArtifactCreated={handleRefresh}
                  registerGeneratePdf={registerGeneratePdf}
                  activeTab={tailoredSubTab}
                  onActiveTabChange={setTailoredSubTab}
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
                {job && (
                  <SectionCard title="Job Description" subtitle="Tailoring input" collapsible defaultOpen={false}>
                    {jobDescriptionText ? (
                      <div className="job-description-accordion">
                        {jobSections.map((section, idx) => (
                          <details key={`${section.title}-${idx}`} open={idx === 0}>
                            <summary>
                              <span className="job-section-title">{section.title}</span>
                              <span className="job-section-toggle" aria-hidden="true" />
                            </summary>
                            <div className="section-content">{renderRichText(section.content)}</div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <p className="hint">No job description was captured for this posting.</p>
                    )}
                  </SectionCard>
                )}
                <SectionCard title={`Job Requirements (${jdRubric.requirements.length})`}>
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
                        <div className="requirement-text">{renderRichText(req.requirement)}</div>
                        {req.jdEvidence?.length > 0 && (
                          <div className="requirement-evidence">
                            <strong>Evidence from JD:</strong>
                            <div className="evidence-chips">
                              {req.jdEvidence.map((ev: string, idx: number) => (
                                <span key={idx} className="evidence-chip">
                                  "{renderRichText(ev)}"
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {jdRubric.keywords?.length > 0 && (
                  <SectionCard title={`Keywords (${jdRubric.keywords.length})`} collapsible defaultOpen={false}>
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
                  </SectionCard>
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
                <SectionCard title="Selection Summary">
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
                </SectionCard>

                <SectionCard
                  title={`Selected Work Experience Bullets (${selectionPlan.selected.workExperience.length})`}
                  collapsible
                  defaultOpen={false}
                >
                  <div className="pipeline-bullets">
                    {selectionPlan.selected.workExperience.map((bullet: any) => (
                      <div key={bullet.bulletId} className="pipeline-bullet">
                        <details>
                          <summary className="pipeline-bullet-summary">
                            <div className="pipeline-bullet-left">
                              <div className="pipeline-bullet-text">{renderRichText(bullet.originalText)}</div>
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
                </SectionCard>

                {selectionPlan.selected.projects.length > 0 && (
                  <SectionCard
                    title={`Selected Project Bullets (${selectionPlan.selected.projects.length})`}
                    collapsible
                    defaultOpen={false}
                  >
                    <div className="pipeline-bullets">
                      {selectionPlan.selected.projects.map((bullet: any) => (
                        <div key={bullet.bulletId} className="pipeline-bullet">
                          <div className="pipeline-bullet-summary">
                            <div className="pipeline-bullet-left">
                              <div className="pipeline-bullet-text">{renderRichText(bullet.originalText)}</div>
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
                  </SectionCard>
                )}

                {selectionPlan.coverage.uncoveredRequirements.length > 0 && (
                  <SectionCard
                    title={`Uncovered Requirements (${selectionPlan.coverage.uncoveredRequirements.length})`}
                    collapsible
                    defaultOpen={false}
                  >
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
                  </SectionCard>
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
      </div>
    </div>
  );
}
