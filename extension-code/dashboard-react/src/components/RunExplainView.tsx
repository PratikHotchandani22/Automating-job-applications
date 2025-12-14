import { useState, useEffect, useMemo } from "react";
import type { RunRecord } from "../types";
import { BACKEND_BASE_URL } from "../api/bridge";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ExplainData {
  jd_rubric?: any;
  selection_plan?: any;
  tailored?: any;
  baseline_resume?: any;
  final_resume?: any;
  meta?: any;
  job_extracted?: string;
}

interface RunExplainViewProps {
  run: RunRecord;
}

type ArtifactLoadStatus = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

const RunExplainView = ({ run }: RunExplainViewProps) => {
  const [activeTab, setActiveTab] = useState<
    "overview" | "requirements" | "changes" | "selection" | "keywords"
  >("overview");
  const [explainData, setExplainData] = useState<ExplainData>({});
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [requirementFilter, setRequirementFilter] = useState<"all" | "covered" | "uncovered">("all");
  const [artifactStatus, setArtifactStatus] = useState<Record<string, ArtifactLoadStatus>>({});

  const resolveArtifactUrl = (url: string) => {
    if (!url) return url;
    // Absolute URLs should be used as-is.
    if (/^https?:\/\//i.test(url)) return url;
    // Backend returns paths like "/download/:runId/file". In the extension context,
    // those must be resolved against the backend host.
    if (url.startsWith("/")) return `${BACKEND_BASE_URL}${url}`;
    // Best-effort fallback.
    return `${BACKEND_BASE_URL}/${url}`;
  };

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Fetch explainability artifacts
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const artifacts = run.artifacts || {};
        const data: ExplainData = {};
        const statuses: Record<string, ArtifactLoadStatus> = {};

        // Map artifact keys to data keys
        const artifactMapping: Record<string, keyof ExplainData> = {
          jd_rubric: "jd_rubric",
          selection_plan: "selection_plan",
          json: "tailored",
          baseline: "baseline_resume",
          final_resume: "final_resume",
          meta: "meta",
          job_text: "job_extracted",
        };

        // Fetch JSON artifacts
        for (const [artifactKey, dataKey] of Object.entries(artifactMapping)) {
          const rawUrl = artifacts[artifactKey];
          const url = rawUrl ? resolveArtifactUrl(rawUrl) : null;
          if (url) {
            try {
              const response = await fetch(url);
              if (response.ok) {
                if (artifactKey === "job_text") {
                  data[dataKey] = await response.text();
                } else {
                  data[dataKey] = await response.json();
                }
                statuses[artifactKey] = { url, ok: true, status: response.status };
              } else {
                statuses[artifactKey] = { url, ok: false, status: response.status };
              }
            } catch (err) {
              console.error(`Failed to fetch ${artifactKey}:`, err);
              statuses[artifactKey] = {
                url,
                ok: false,
                error: err instanceof Error ? err.message : "fetch_failed",
              };
            }
          } else if (rawUrl) {
            // Shouldn't happen, but keep a breadcrumb for debugging.
            statuses[artifactKey] = { url: String(rawUrl), ok: false, error: "invalid_url" };
          }
        }

        setExplainData(data);
        setArtifactStatus(statuses);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [run.runId, run.artifacts]);

  // Parse coverage data
  const coverageStats = useMemo(() => {
    const sp = explainData.selection_plan;
    if (!sp?.coverage) return null;

    const { must_total, nice_total, must_covered, nice_covered } = sp.coverage;
    const totalReqs = must_total + nice_total;
    const totalCovered = must_covered + nice_covered;
    const coveragePercent =
      totalReqs > 0 ? Math.round((totalCovered / totalReqs) * 100) : 0;

    return {
      must_total,
      nice_total,
      must_covered,
      nice_covered,
      totalReqs,
      totalCovered,
      coveragePercent,
      uncovered: sp.coverage.uncovered_requirements || [],
    };
  }, [explainData.selection_plan]);

  // Parse requirements with match status
  const requirementsWithStatus = useMemo(() => {
    const rubric = explainData.jd_rubric;
    const selectionPlan = explainData.selection_plan;

    if (!rubric?.requirements) return [];

    const uncoveredIds = new Set(
      selectionPlan?.coverage?.uncovered_requirements?.map((r: any) => r.req_id) || []
    );

    const coveredMap = new Map();
    selectionPlan?.selected_bullets?.forEach((bullet: any) => {
      bullet.matched_requirements?.forEach((reqId: string) => {
        if (!coveredMap.has(reqId)) {
          coveredMap.set(reqId, []);
        }
        coveredMap.get(reqId).push(bullet);
      });
    });

    return rubric.requirements.map((req: any) => ({
      ...req,
      covered: !uncoveredIds.has(req.req_id),
      coverReason: uncoveredIds.has(req.req_id)
        ? selectionPlan?.coverage?.uncovered_requirements?.find(
            (r: any) => r.req_id === req.req_id
          )?.reason
        : "covered",
      matchingBullets: coveredMap.get(req.req_id) || [],
    }));
  }, [explainData.jd_rubric, explainData.selection_plan]);

  // Filtered requirements based on filter state
  const filteredRequirements = useMemo(() => {
    if (requirementFilter === "all") return requirementsWithStatus;
    if (requirementFilter === "covered")
      return requirementsWithStatus.filter((r: any) => r.covered);
    return requirementsWithStatus.filter((r: any) => !r.covered);
  }, [requirementsWithStatus, requirementFilter]);

  // Parse bullet changes
  const bulletChanges = useMemo(() => {
    const baseline = explainData.baseline_resume;
    const final = explainData.final_resume;
    const selectionPlan = explainData.selection_plan;

    if (!baseline || !final || !selectionPlan) return { included: [], excluded: [] };

    const selectedIds = new Set(
      selectionPlan.selected_bullets?.map((b: any) => b.bullet_id) || []
    );

    const baselineBullets = new Map();
    baseline.experience?.forEach((exp: any) => {
      exp.bullets?.forEach((bullet: string, idx: number) => {
        const bulletId = `exp_${exp.role_id}_bullet_${idx + 1}`;
        baselineBullets.set(bulletId, {
          id: bulletId,
          text: bullet,
          roleId: exp.role_id,
          roleTitle: exp.role,
          company: exp.company,
        });
      });
    });

    const finalBullets = new Map();
    final.experience?.forEach((exp: any) => {
      exp.bullets?.forEach((bullet: string, idx: number) => {
        const bulletId = `exp_${exp.role_id}_bullet_${idx + 1}`;
        finalBullets.set(bulletId, bullet);
      });
    });

    const included = selectionPlan.selected_bullets
      ?.map((sel: any) => {
        const baselineBullet = baselineBullets.get(sel.bullet_id);
        const finalText = finalBullets.get(sel.bullet_id);
        return {
          ...sel,
          baseline: baselineBullet?.text || "",
          final: finalText || "",
          changed: baselineBullet?.text !== finalText,
          roleTitle: baselineBullet?.roleTitle || "",
          company: baselineBullet?.company || "",
        };
      })
      .filter((b: any) => b.baseline);

    const excluded = Array.from(baselineBullets.values())
      .filter((b) => !selectedIds.has(b.id))
      .map((b) => {
        const dropReason = selectionPlan.dropped_bullets?.find(
          (d: any) => d.bullet_id === b.id
        );
        return {
          ...b,
          reason: dropReason?.reason || "not_selected",
        };
      });

    return { included: included || [], excluded };
  }, [
    explainData.baseline_resume,
    explainData.final_resume,
    explainData.selection_plan,
  ]);

  // Highlight keywords in text
  const highlightKeywords = (text: string, keywords: string[]) => {
    if (!keywords || keywords.length === 0) return text;

    let highlighted = text;
    const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

    sortedKeywords.forEach((kw) => {
      const regex = new RegExp(`\\b(${kw})\\b`, "gi");
      highlighted = highlighted.replace(regex, '<mark class="keyword-highlight">$1</mark>');
    });

    return highlighted;
  };

  if (loading) {
    return (
      <div className="explain-view">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading explainability data...</p>
        </div>
      </div>
    );
  }

  // Check if we have minimal data to show
  const hasMinimalData =
    explainData.jd_rubric ||
    explainData.selection_plan ||
    explainData.tailored ||
    explainData.baseline_resume ||
    explainData.final_resume ||
    explainData.meta ||
    explainData.job_extracted;

  if (!hasMinimalData) {
    const artifactKeys = Object.keys(run.artifacts || {});
    const attemptedKeys = Object.keys(artifactStatus || {});
    return (
      <div className="explain-view">
        <div className="explain-empty-state">
          <div className="empty-icon">📊</div>
          <h3>No Explainability Data Available</h3>
          <p>
            This run may not have completed successfully or was created before
            explainability features were added.
          </p>
          <p className="hint-text">
            Try starting a new run to see detailed explanations of the resume tailoring
            process.
          </p>
          <div className="hint-text" style={{ marginTop: 10 }}>
            <strong>Debug:</strong>{" "}
            {artifactKeys.length
              ? `This run has ${artifactKeys.length} artifact reference(s) (${artifactKeys.join(", ")}).`
              : "This run has no artifact references yet."}{" "}
            {attemptedKeys.length ? `Attempted to load: ${attemptedKeys.join(", ")}.` : ""}
          </div>
          {attemptedKeys.length ? (
            <div className="debug-panel" style={{ marginTop: 10 }}>
              <div className="hint-text" style={{ marginBottom: 8 }}>
                If you’re in the extension, this usually means the artifact URLs were relative and
                the dashboard couldn’t resolve them to the backend.
              </div>
              <div className="downloads-grid">
                {attemptedKeys.map((k) => (
                  <div key={k} className="download-item">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{k}</strong>
                      <span className={`status ${artifactStatus[k]?.ok ? "success" : "error"}`}>
                        {artifactStatus[k]?.ok ? "loaded" : "failed"}
                      </span>
                    </div>
                    <div className="hint-text" style={{ wordBreak: "break-all" }}>
                      {artifactStatus[k]?.url}
                    </div>
                    {!artifactStatus[k]?.ok ? (
                      <div className="hint-text">
                        {artifactStatus[k]?.status ? `HTTP ${artifactStatus[k]?.status}` : ""}
                        {artifactStatus[k]?.error ? ` ${artifactStatus[k]?.error}` : ""}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const keywords = explainData.jd_rubric?.keywords?.map((k: any) => k.term) || [];
  const topKeywords = keywords.slice(0, 15);

  return (
    <div className="explain-view">
      {/* Tab Navigation */}
      <div className="explain-tabs">
        <button
          className={`explain-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`explain-tab ${activeTab === "requirements" ? "active" : ""}`}
          onClick={() => setActiveTab("requirements")}
        >
          Requirements ({requirementsWithStatus.length})
        </button>
        <button
          className={`explain-tab ${activeTab === "changes" ? "active" : ""}`}
          onClick={() => setActiveTab("changes")}
        >
          Changes ({bulletChanges.included.length})
        </button>
        <button
          className={`explain-tab ${activeTab === "selection" ? "active" : ""}`}
          onClick={() => setActiveTab("selection")}
        >
          Selection Strategy
        </button>
        <button
          className={`explain-tab ${activeTab === "keywords" ? "active" : ""}`}
          onClick={() => setActiveTab("keywords")}
        >
          Keywords ({topKeywords.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="explain-content">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="tab-pane">
            <div className="explain-section">
              <h3>Job Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Title</label>
                  <div>{explainData.jd_rubric?.job_meta?.job_title || run.title}</div>
                </div>
                <div className="info-item">
                  <label>Company</label>
                  <div>{explainData.jd_rubric?.job_meta?.company || run.company}</div>
                </div>
                <div className="info-item">
                  <label>Platform</label>
                  <div>{explainData.jd_rubric?.job_meta?.platform || run.platform}</div>
                </div>
                {explainData.jd_rubric?.constraints?.years_experience_min && (
                  <div className="info-item">
                    <label>Experience Required</label>
                    <div>{explainData.jd_rubric.constraints.years_experience_min}+ years</div>
                  </div>
                )}
              </div>

              {explainData.jd_rubric?.notes?.summary && (
                <div className="summary-box">
                  <strong>Job Summary</strong>
                  <p>{explainData.jd_rubric.notes.summary}</p>
                </div>
              )}
            </div>

            {coverageStats && (
              <div className="explain-section">
                <h3>Coverage Analysis</h3>
                <div className="coverage-visual">
                  <div className="coverage-circle">
                    <svg viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="8"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="8"
                        strokeDasharray={`${coverageStats.coveragePercent * 2.51} 251.2`}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="coverage-percent">{coverageStats.coveragePercent}%</div>
                  </div>
                  <div className="coverage-breakdown">
                    <div className="coverage-row">
                      <span className="coverage-label">Must-Have Requirements</span>
                      <span className="coverage-value">
                        {coverageStats.must_covered} / {coverageStats.must_total}
                      </span>
                    </div>
                    <div className="coverage-row">
                      <span className="coverage-label">Nice-to-Have Requirements</span>
                      <span className="coverage-value">
                        {coverageStats.nice_covered} / {coverageStats.nice_total}
                      </span>
                    </div>
                    <div className="coverage-row total">
                      <span className="coverage-label">Total Coverage</span>
                      <span className="coverage-value">
                        {coverageStats.totalCovered} / {coverageStats.totalReqs}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="explain-section">
              <h3>Processing Stages</h3>
              <div className="stage-timeline">
                {[
                  { key: "extraction", label: "Job Extraction", icon: "📄" },
                  { key: "rubric", label: "Rubric Analysis", icon: "📋" },
                  { key: "evidence", label: "Evidence Scoring", icon: "⭐" },
                  { key: "embeddings", label: "Relevance Matching", icon: "🔗" },
                  { key: "selection", label: "Bullet Selection", icon: "🎯" },
                  { key: "tailoring", label: "Content Tailoring", icon: "✏️" },
                  { key: "generation", label: "PDF Generation", icon: "📑" },
                ].map((stage) => (
                  <div key={stage.key} className="stage-item">
                    <span className="stage-icon">{stage.icon}</span>
                    <span className="stage-label">{stage.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* REQUIREMENTS TAB */}
        {activeTab === "requirements" && (
          <div className="tab-pane">
            <div className="explain-section">
              <h3>Job Requirements</h3>
              <p className="section-hint">
                We analyzed the job description and identified the following requirements.
                Each requirement is matched against your experience.
              </p>

              {/* Filter Buttons */}
              <div className="filter-buttons">
                <button
                  className={`filter-btn ${requirementFilter === "all" ? "active" : ""}`}
                  onClick={() => setRequirementFilter("all")}
                >
                  All ({requirementsWithStatus.length})
                </button>
                <button
                  className={`filter-btn ${requirementFilter === "covered" ? "active" : ""}`}
                  onClick={() => setRequirementFilter("covered")}
                >
                  Covered ({requirementsWithStatus.filter((r: any) => r.covered).length})
                </button>
                <button
                  className={`filter-btn ${requirementFilter === "uncovered" ? "active" : ""}`}
                  onClick={() => setRequirementFilter("uncovered")}
                >
                  Not Covered ({requirementsWithStatus.filter((r: any) => !r.covered).length})
                </button>
              </div>

              <div className="requirements-list">
                {filteredRequirements.map((req: any) => (
                  <div
                    key={req.req_id}
                    className={`requirement-card ${req.covered ? "covered" : "uncovered"}`}
                  >
                    <div className="requirement-header">
                      <div className="requirement-badge">
                        <span className={`badge ${req.type}`}>{req.type}</span>
                        <span className="weight">Weight: {req.weight}</span>
                      </div>
                      <div className={`status-badge ${req.covered ? "success" : "warning"}`}>
                        {req.covered ? "✓ Covered" : "⚠ Not Covered"}
                      </div>
                    </div>

                    <div className="requirement-text">{req.requirement}</div>

                    {req.jd_evidence && req.jd_evidence.length > 0 && (
                      <div className="requirement-evidence">
                        <strong>Found in JD:</strong>
                        <div className="evidence-chips">
                          {req.jd_evidence.map((ev: string, idx: number) => (
                            <span key={idx} className="evidence-chip">
                              "{ev}"
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {req.covered && req.matchingBullets.length > 0 && (
                      <div className="matching-bullets">
                        <strong>Matched with {req.matchingBullets.length} bullet(s):</strong>
                        {req.matchingBullets.map((bullet: any, idx: number) => (
                          <div key={idx} className="matched-bullet-preview">
                            • {bullet.baseline?.substring(0, 100)}...
                          </div>
                        ))}
                      </div>
                    )}

                    {!req.covered && (
                      <div className="uncovered-reason">
                        <strong>Why not covered:</strong>{" "}
                        {req.coverReason === "not_covered"
                          ? "No matching experience found in resume"
                          : req.coverReason === "no_supporting_bullet_found"
                          ? "Experience exists but no strong supporting bullet"
                          : req.coverReason === "blocked_by_budget_or_redundancy"
                          ? "Budget limit reached or redundant with other bullets"
                          : req.coverReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CHANGES TAB */}
        {activeTab === "changes" && (
          <div className="tab-pane">
            <div className="explain-section">
              <h3>Included Bullets ({bulletChanges.included.length})</h3>
              <p className="section-hint">
                These bullets were selected and potentially modified to match the job
                requirements.
              </p>

              {bulletChanges.included.map((bullet: any) => (
                <div key={bullet.bullet_id} className="bullet-change-card">
                  <div className="bullet-change-header">
                    <div className="bullet-role-info">
                      <strong>{bullet.roleTitle}</strong>
                      {bullet.company && <span> @ {bullet.company}</span>}
                    </div>
                    {bullet.changed && (
                      <span className="change-badge modified">Modified</span>
                    )}
                    {!bullet.changed && (
                      <span className="change-badge unchanged">Unchanged</span>
                    )}
                  </div>

                  {bullet.matched_requirements && bullet.matched_requirements.length > 0 && (
                    <div className="bullet-requirements">
                      <strong>Covers requirements:</strong>{" "}
                      {bullet.matched_requirements.join(", ")}
                    </div>
                  )}

                  <div className="bullet-comparison">
                    {bullet.changed ? (
                      <>
                        <div className="bullet-version before">
                          <label>Original</label>
                          <div className="bullet-text">• {bullet.baseline}</div>
                        </div>
                        <div className="change-arrow">→</div>
                        <div className="bullet-version after">
                          <label>Tailored</label>
                          <div
                            className="bullet-text"
                            dangerouslySetInnerHTML={{
                              __html: "• " + highlightKeywords(bullet.final, topKeywords),
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="bullet-version">
                        <div
                          className="bullet-text"
                          dangerouslySetInnerHTML={{
                            __html: "• " + highlightKeywords(bullet.baseline, topKeywords),
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {bullet.rewrite_intent && (
                    <div className="rewrite-intent">
                      <strong>Modification goal:</strong> {bullet.rewrite_intent}
                    </div>
                  )}

                  {bullet.relevance_score !== undefined && (
                    <div className="bullet-metrics">
                      <span>Relevance: {(bullet.relevance_score * 100).toFixed(0)}%</span>
                      {bullet.evidence_tier && (
                        <span>Evidence: {bullet.evidence_tier}</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="explain-section">
              <h3>Excluded Bullets ({bulletChanges.excluded.length})</h3>
              <p className="section-hint">
                These bullets were not selected due to relevance, budget, or redundancy
                constraints.
              </p>

              <div className="excluded-bullets-list">
                {bulletChanges.excluded.slice(0, 10).map((bullet: any) => (
                  <div key={bullet.id} className="excluded-bullet-card">
                    <div className="bullet-text">• {bullet.text}</div>
                    <div className="exclusion-reason">
                      <strong>Reason:</strong>{" "}
                      {bullet.reason === "not_selected"
                        ? "Not relevant to this job"
                        : bullet.reason === "budget_exceeded"
                        ? "Resume budget limit reached"
                        : bullet.reason === "redundant"
                        ? "Redundant with selected bullets"
                        : bullet.reason === "low_evidence"
                        ? "Evidence quality below threshold"
                        : bullet.reason}
                    </div>
                  </div>
                ))}
                {bulletChanges.excluded.length > 10 && (
                  <div className="more-indicator">
                    + {bulletChanges.excluded.length - 10} more bullets excluded
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SELECTION STRATEGY TAB */}
        {activeTab === "selection" && explainData.selection_plan && (
          <div className="tab-pane">
            <div className="explain-section">
              <h3>Selection Algorithm</h3>
              <p className="section-hint">
                Our algorithm selects the most relevant bullets based on multiple factors
                while respecting budget constraints.
              </p>

              <div className="strategy-factors">
                <div className="factor-card">
                  <div className="factor-icon">🎯</div>
                  <div className="factor-content">
                    <strong>Relevance Score</strong>
                    <p>
                      Semantic similarity between your bullets and job requirements using
                      embeddings
                    </p>
                  </div>
                </div>
                <div className="factor-card">
                  <div className="factor-icon">⭐</div>
                  <div className="factor-content">
                    <strong>Evidence Quality</strong>
                    <p>
                      Presence of metrics, action verbs, and specific technical details
                    </p>
                  </div>
                </div>
                <div className="factor-card">
                  <div className="factor-icon">🔄</div>
                  <div className="factor-content">
                    <strong>Redundancy Check</strong>
                    <p>Avoids selecting similar bullets that cover the same ground</p>
                  </div>
                </div>
                <div className="factor-card">
                  <div className="factor-icon">📊</div>
                  <div className="factor-content">
                    <strong>Budget Management</strong>
                    <p>Maintains optimal resume length (550-700 words)</p>
                  </div>
                </div>
              </div>
            </div>

            {explainData.selection_plan.config && (
              <div className="explain-section">
                <h3>Configuration</h3>
                <div className="config-grid">
                  <div className="config-item">
                    <label>Target Resume Length</label>
                    <div>
                      {explainData.selection_plan.config.budgets.target_resume_words_min}-
                      {explainData.selection_plan.config.budgets.target_resume_words_max}{" "}
                      words
                    </div>
                  </div>
                  <div className="config-item">
                    <label>Experience Bullets</label>
                    <div>
                      {explainData.selection_plan.config.budgets.experience_bullets_min}-
                      {explainData.selection_plan.config.budgets.experience_bullets_max}
                    </div>
                  </div>
                  <div className="config-item">
                    <label>Must-Have Min Relevance</label>
                    <div>
                      {(
                        explainData.selection_plan.config.thresholds.must_min_rel * 100
                      ).toFixed(0)}
                      %
                    </div>
                  </div>
                  <div className="config-item">
                    <label>Redundancy Threshold</label>
                    <div>
                      {(
                        explainData.selection_plan.config.thresholds.redundancy
                          .hard_block * 100
                      ).toFixed(0)}
                      %
                    </div>
                  </div>
                </div>
              </div>
            )}

            {explainData.meta && (
              <div className="explain-section">
                <h3>Performance Metrics</h3>
                <div className="metrics-grid">
                  {explainData.meta.rubric_compute_ms && (
                    <div className="metric-item">
                      <label>Rubric Analysis</label>
                      <div>{(explainData.meta.rubric_compute_ms / 1000).toFixed(1)}s</div>
                    </div>
                  )}
                  {explainData.meta.evidence_scores_cache_hit !== undefined && (
                    <div className="metric-item">
                      <label>Evidence Cache</label>
                      <div>
                        {explainData.meta.evidence_scores_cache_hit ? "HIT ✓" : "MISS"}
                      </div>
                    </div>
                  )}
                  {explainData.meta.resume_bullet_embeddings_cache_hit !== undefined && (
                    <div className="metric-item">
                      <label>Embedding Cache</label>
                      <div>
                        {explainData.meta.resume_bullet_embeddings_cache_hit
                          ? "HIT ✓"
                          : "MISS"}
                      </div>
                    </div>
                  )}
                  {explainData.meta.embedding_model && (
                    <div className="metric-item">
                      <label>Embedding Model</label>
                      <div>{explainData.meta.embedding_model}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* KEYWORDS TAB */}
        {activeTab === "keywords" && (
          <div className="tab-pane">
            <div className="explain-section">
              <h3>Identified Keywords</h3>
              <p className="section-hint">
                These keywords were extracted from the job description and prioritized by
                importance. Click to copy for use in cover letters or interviews.
              </p>

              {explainData.jd_rubric?.keywords && (
                <div className="keywords-grid">
                  {explainData.jd_rubric.keywords.map((kw: any, idx: number) => (
                    <div
                      key={idx}
                      className={`keyword-card importance-${kw.importance}`}
                      onClick={() => copyToClipboard(kw.term, `keyword-${idx}`)}
                      style={{ cursor: "pointer" }}
                      title="Click to copy"
                    >
                      <div className="keyword-header">
                        <span className="keyword-term">{kw.term}</span>
                        <span className="keyword-type">{kw.type}</span>
                      </div>
                      <div className="keyword-importance">
                        <div className="importance-bar">
                          <div
                            className="importance-fill"
                            style={{ width: `${(kw.importance / 5) * 100}%` }}
                          />
                        </div>
                        <span className="importance-value">{kw.importance}/5</span>
                      </div>
                      {kw.jd_evidence && kw.jd_evidence.length > 0 && (
                        <div className="keyword-evidence">
                          {kw.jd_evidence.slice(0, 2).map((ev: string, i: number) => (
                            <div key={i} className="evidence-snippet">
                              "{ev}"
                            </div>
                          ))}
                        </div>
                      )}
                      {copiedText === `keyword-${idx}` && (
                        <div className="copy-success">✓ Copied!</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {explainData.job_extracted && (
              <div className="explain-section">
                <h3>Full Job Description</h3>
                <div className="job-text-container">
                  <div
                    className="job-text"
                    dangerouslySetInnerHTML={{
                      __html: highlightKeywords(explainData.job_extracted, topKeywords),
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RunExplainView;
