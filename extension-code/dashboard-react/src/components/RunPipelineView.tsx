import { useEffect, useMemo, useState } from "react";
import { BACKEND_BASE_URL } from "../api/bridge";
import type { RunRecord, RunStage } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type StageStatus = "pending" | "active" | "complete" | "error";

type ArtifactLoadStatus = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

type ArtifactContent = {
  jd_rubric?: any;
  selection_plan?: any;
  tailored?: any;
  baseline_resume?: any;
  final_resume?: any;
  job_text?: string;
  evidence_scores?: any;
  relevance_summary?: any;
  relevance_matrix?: any;
  jd_requirement_embeddings?: any;
  selection_debug?: any;
  meta?: any;
  tex?: string;
};

const resolveArtifactUrl = (url: string) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${BACKEND_BASE_URL}${url}`;
  return `${BACKEND_BASE_URL}/${url}`;
};

const stageOrder: { key: RunStage; label: string; title: string; icon: string }[] = [
  { key: "EXTRACTING", label: "Extract", title: "Job extraction", icon: "📄" },
  { key: "RUBRIC", label: "Rubric", title: "Rubric generation", icon: "📋" },
  { key: "EVIDENCE", label: "Evidence", title: "Evidence scoring", icon: "⭐" },
  { key: "EMBEDDINGS", label: "Match", title: "Relevance matching", icon: "🔗" },
  { key: "SELECTION", label: "Select", title: "Selection", icon: "🎯" },
  { key: "ANALYZING", label: "Tailor", title: "Tailoring", icon: "✏️" },
  { key: "GENERATING_LATEX", label: "LaTeX", title: "LaTeX generation", icon: "🧾" },
  { key: "COMPILING_PDF", label: "PDF", title: "PDF compilation", icon: "📑" },
  { key: "DONE", label: "Done", title: "Done", icon: "✅" }
];

const currentStageIndex = (run: RunRecord) => {
  const idx = stageOrder.findIndex((s) => s.key === run.status);
  if (idx >= 0) return idx;
  if (run.status === "ERROR") return stageOrder.findIndex((s) => s.key === "DONE");
  return 0;
};

const resolveStageStatus = (run: RunRecord, stepKey: RunStage): StageStatus => {
  if (run.result === "error") {
    const idx = currentStageIndex(run);
    const stepIdx = stageOrder.findIndex((s) => s.key === stepKey);
    if (stepIdx >= idx) return "error";
    return "complete";
  }

  const idx = currentStageIndex(run);
  const stepIdx = stageOrder.findIndex((s) => s.key === stepKey);
  if (stepIdx < idx) return "complete";
  if (stepIdx === idx) return run.result === "pending" ? "active" : "complete";
  return "pending";
};

const humanStage = (stage: RunStage) => {
  const found = stageOrder.find((s) => s.key === stage);
  if (found) return found.title;
  if (stage === "ERROR") return "Run failed";
  if (stage === "RUNNING") return "Running";
  return "Working";
};

const jsonPretty = (obj: any) => {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
};

const clampText = (text: string, maxChars = 2200) => {
  if (!text) return text;
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n… (truncated)`;
};

const clampOneLine = (text: string, maxChars = 140) => {
  const t = (text || "").toString().replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…`;
};

const safeString = (value: any) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const extractRubricSummary = (rubric: any) => {
  const reqs = Array.isArray(rubric?.requirements) ? rubric.requirements : [];
  const must = reqs.filter((r: any) => (r?.type || "").toLowerCase().includes("must")).length;
  const nice = reqs.filter((r: any) => (r?.type || "").toLowerCase().includes("nice")).length;
  const keywords = Array.isArray(rubric?.keywords) ? rubric.keywords : [];
  return { total: reqs.length, must, nice, keywordsCount: keywords.length };
};

type RubricPreviewItem = { id: string; type: string; text: string };
type EvidencePreviewItem = { id: string; tier: string; score: number | null; text: string };
type RelevancePreviewItem = { id: string; text: string; score: number | null };

const getRubricPreview = (rubric: any): RubricPreviewItem[] => {
  const reqs = Array.isArray(rubric?.requirements) ? rubric.requirements : [];
  return reqs
    .map((r: any, idx: number) => ({
      id: safeString(r?.req_id) || `req_${idx + 1}`,
      type: safeString(r?.type) || "req",
      text: safeString(r?.requirement) || safeString(r?.text) || ""
    }))
    .filter((r: RubricPreviewItem) => Boolean(r.text));
};

const flattenSelectionPlanBullets = (plan: any): any[] => {
  // Supports both newer selection_plan_v1 (`selected.work_experience[].bullets[]`) and older
  // `selected_bullets[]` shapes used by the original Explain view.
  if (Array.isArray(plan?.selected_bullets)) return plan.selected_bullets;

  const out: any[] = [];
  const sel = plan?.selected;
  if (sel?.work_experience && Array.isArray(sel.work_experience)) {
    sel.work_experience.forEach((role: any) => {
      (role?.bullets || []).forEach((b: any) => out.push(b));
    });
  }
  if (sel?.projects && Array.isArray(sel.projects)) {
    sel.projects.forEach((proj: any) => {
      (proj?.bullets || []).forEach((b: any) => out.push(b));
    });
  }
  return out;
};

const getEvidencePreview = (evidence: any): EvidencePreviewItem[] => {
  const list = Array.isArray(evidence?.bullets) ? evidence.bullets : Array.isArray(evidence) ? evidence : [];
  const sorted = [...list].sort((a: any, b: any) => (b?.evidence_score ?? 0) - (a?.evidence_score ?? 0));
  return sorted.slice(0, 6).map((it: any, idx: number) => ({
    id: safeString(it?.bullet_id) || `e_${idx + 1}`,
    tier: safeString(it?.tier) || safeString(it?.evidence_tier) || "",
    score: typeof it?.evidence_score === "number" ? it.evidence_score : typeof it?.score === "number" ? it.score : null,
    text: safeString(it?.text) || safeString(it?.original_text) || ""
  }));
};

const getRelevancePreview = (summary: any): RelevancePreviewItem[] => {
  // Best-effort: handle { top_matches: [...] } or { matches: [...] } or array.
  const list = Array.isArray(summary) ? summary : Array.isArray(summary?.top_matches) ? summary.top_matches : Array.isArray(summary?.matches) ? summary.matches : [];
  return list.slice(0, 5).map((it: any, idx: number) => ({
    id: safeString(it?.req_id) || safeString(it?.requirement_id) || `m_${idx + 1}`,
    text: safeString(it?.requirement) || safeString(it?.req_text) || "",
    score: typeof it?.score === "number" ? it.score : typeof it?.relevance === "number" ? it.relevance : null
  }));
};

type RelevanceByRequirementRow = {
  reqId: string;
  requirement: string;
  top: { bulletId: string; score: number; bulletText?: string }[];
};

const buildRequirementMap = (rubric: any) => {
  const map = new Map<string, any>();
  const reqs = Array.isArray(rubric?.requirements) ? rubric.requirements : [];
  reqs.forEach((r: any) => {
    const id = safeString(r?.req_id);
    if (id) map.set(id, r);
  });
  return map;
};

const buildEvidenceMap = (evidence: any) => {
  const map = new Map<string, any>();
  const bullets = Array.isArray(evidence?.bullets) ? evidence.bullets : [];
  bullets.forEach((b: any) => {
    const id = safeString(b?.bullet_id);
    if (id) map.set(id, b);
  });
  return map;
};

const formatPct = (v: any) => {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${Math.round(v * 100)}%`;
};

const coverageReasonLabel = (reason: string) => {
  const r = (reason || "").toString();
  if (r === "not_covered") return "No matching experience found";
  if (r === "no_supporting_bullet_found") return "No strong supporting bullet";
  if (r === "blocked_by_budget_or_redundancy") return "Blocked by budget/redundancy";
  return r || "Unknown";
};

type SelectedBulletCard = {
  id: string;
  text: string;
  parentType?: string;
  parentId?: string;
  evidenceTier?: string;
  evidenceScore?: number | null;
  rewriteIntent?: string;
  matches: { reqId: string; rel?: number | null; edge?: number | null; requirement?: string }[];
  reasons: string[];
};

const buildSelectedBulletCards = (plan: any, rubric: any): SelectedBulletCard[] => {
  const bullets = flattenSelectionPlanBullets(plan);
  const reqMap = buildRequirementMap(rubric);

  const cards: SelectedBulletCard[] = bullets.map((b: any, idx: number) => {
    const id = safeString(b?.bullet_id) || `bullet_${idx + 1}`;
    const text =
      safeString(b?.original_text) ||
      safeString(b?.baseline) ||
      safeString(b?.text) ||
      safeString(b?.bullet) ||
      id;
    const evidenceTier = safeString(b?.evidence?.tier) || safeString(b?.evidence_tier) || safeString(b?.tier) || "";
    const evidenceScore =
      typeof b?.evidence?.score === "number"
        ? b.evidence.score
        : typeof b?.evidence_score === "number"
        ? b.evidence_score
        : null;
    const rewriteIntent = safeString(b?.rewrite_intent) || "";
    const matchesRaw = Array.isArray(b?.matches) ? b.matches : Array.isArray(b?.matched_requirements) ? b.matched_requirements.map((reqId: any) => ({ req_id: reqId })) : [];
    const matches = matchesRaw
      .map((m: any) => {
        const reqId = safeString(m?.req_id) || safeString(m);
        const req = reqMap.get(reqId);
        return {
          reqId,
          rel: typeof m?.rel === "number" ? m.rel : typeof m?.score === "number" ? m.score : null,
          edge: typeof m?.edge_score === "number" ? m.edge_score : null,
          requirement: safeString(req?.requirement) || safeString(req?.text) || ""
        };
      })
      .filter((m: any) => Boolean(m.reqId));
    const reasons = Array.isArray(b?.reasons) ? b.reasons.map((r: any) => safeString(r)).filter(Boolean) : [];
    return {
      id,
      text,
      parentType: safeString(b?.parent_type) || undefined,
      parentId: safeString(b?.parent_id) || undefined,
      evidenceTier: evidenceTier || undefined,
      evidenceScore,
      rewriteIntent: rewriteIntent || undefined,
      matches,
      reasons
    };
  });

  return cards;
};

const getRelevanceByRequirement = (matrix: any, rubric: any, evidence: any): RelevanceByRequirementRow[] => {
  const perReq = matrix?.per_requirement_top_bullets;
  if (!perReq || typeof perReq !== "object") return [];
  const reqMap = buildRequirementMap(rubric);
  const evMap = buildEvidenceMap(evidence);

  const rows: RelevanceByRequirementRow[] = Object.entries(perReq).map(([reqIdRaw, entries]) => {
    const reqId = safeString(reqIdRaw);
    const req = reqMap.get(reqId);
    const requirement = safeString(req?.requirement) || safeString(req?.text) || reqId;
    const top = (Array.isArray(entries) ? entries : [])
      .slice(0, 3)
      .map((e: any) => {
        const bulletId = safeString(e?.bullet_id);
        const score = typeof e?.score === "number" ? e.score : 0;
        const bulletText = safeString(evMap.get(bulletId)?.text);
        return { bulletId, score, bulletText };
      })
      .filter((t: { bulletId: string }) => Boolean(t.bulletId));
    return { reqId, requirement, top };
  });

  return rows
    .sort((a, b) => (b.top[0]?.score ?? 0) - (a.top[0]?.score ?? 0))
    .slice(0, 8);
};

const RawBlock = ({ title, data }: { title: string; data: any }) => {
  return (
    <details className="pipeline-raw">
      <summary className="pipeline-raw-summary">{title}</summary>
      <pre className="codeblock">{jsonPretty(data)}</pre>
    </details>
  );
};

const StageCard = ({
  title,
  icon,
  status,
  children,
  defaultOpen
}: {
  title: string;
  icon: string;
  status: StageStatus;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  return (
    <details className={`pipeline-card ${status}`} open={defaultOpen}>
      <summary className="pipeline-card-summary">
        <div className="pipeline-card-left">
          <span className="pipeline-card-icon">{icon}</span>
          <span className="pipeline-card-title">{title}</span>
        </div>
        <span className={`pipeline-card-badge ${status}`}>
          {status === "active" ? "Running" : status === "complete" ? "Complete" : status === "error" ? "Error" : "Pending"}
        </span>
      </summary>
      <div className="pipeline-card-body">{children}</div>
    </details>
  );
};

const RunPipelineView = ({ run }: { run: RunRecord }) => {
  const [content, setContent] = useState<ArtifactContent>({});
  const [artifactStatus, setArtifactStatus] = useState<Record<string, ArtifactLoadStatus>>({});
  const [loading, setLoading] = useState(false);
  const [rubricTab, setRubricTab] = useState<"all" | "must" | "nice" | "keywords">("all");
  const [selectionTab, setSelectionTab] = useState<"selected" | "uncovered">("selected");
  const [matchTab, setMatchTab] = useState<"byRequirement" | "raw">("byRequirement");

  const artifactMapping = useMemo(
    () =>
      ({
        job_text: { type: "text", key: "job_text" as const },
        jd_rubric: { type: "json", key: "jd_rubric" as const },
        evidence_scores: { type: "json", key: "evidence_scores" as const },
        jd_requirement_embeddings: { type: "json", key: "jd_requirement_embeddings" as const },
        relevance_matrix: { type: "json", key: "relevance_matrix" as const },
        relevance_summary: { type: "json", key: "relevance_summary" as const },
        selection_plan: { type: "json", key: "selection_plan" as const },
        selection_debug: { type: "json", key: "selection_debug" as const },
        baseline: { type: "json", key: "baseline_resume" as const },
        final_resume: { type: "json", key: "final_resume" as const },
        json: { type: "json", key: "tailored" as const },
        tailored: { type: "json", key: "tailored" as const },
        meta: { type: "json", key: "meta" as const },
        tex: { type: "text", key: "tex" as const }
      }) as const,
    []
  );

  // Progressive artifact loader: only fetch artifacts that exist and are not loaded yet.
  useEffect(() => {
    let cancelled = false;

    const fetchMissing = async () => {
      const artifacts = run.artifacts || {};

      const toFetch: { artifactKey: string; url: string; type: "json" | "text"; dataKey: keyof ArtifactContent }[] = [];

      Object.entries(artifactMapping).forEach(([artifactKey, mapping]) => {
        const raw = artifacts[artifactKey];
        const url = raw ? resolveArtifactUrl(raw) : null;
        const dataKey = mapping.key;
        const alreadyLoaded = content[dataKey] !== undefined;
        if (url && !alreadyLoaded) {
          toFetch.push({ artifactKey, url, type: mapping.type, dataKey });
        }
      });

      if (!toFetch.length) return;

      setLoading(true);
      try {
        const nextContent: ArtifactContent = {};
        const nextStatuses: Record<string, ArtifactLoadStatus> = {};

        await Promise.all(
          toFetch.map(async (item) => {
            try {
              const res = await fetch(item.url);
              if (!res.ok) {
                nextStatuses[item.artifactKey] = { url: item.url, ok: false, status: res.status };
                return;
              }
              const data = item.type === "text" ? await res.text() : await res.json();
              (nextContent as any)[item.dataKey] = data;
              nextStatuses[item.artifactKey] = { url: item.url, ok: true, status: res.status };
            } catch (err) {
              nextStatuses[item.artifactKey] = {
                url: item.url,
                ok: false,
                error: err instanceof Error ? err.message : "fetch_failed"
              };
            }
          })
        );

        if (cancelled) return;
        setContent((prev) => ({ ...prev, ...nextContent }));
        setArtifactStatus((prev) => ({ ...prev, ...nextStatuses }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMissing().catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // Intentionally depends on run.artifacts (changes as backend progresses) and run.runId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId, run.artifacts]);

  const rubricSummary = useMemo(() => extractRubricSummary(content.jd_rubric), [content.jd_rubric]);

  const selectionSummary = useMemo(() => {
    const sp = content.selection_plan;
    const selected = flattenSelectionPlanBullets(sp).length;
    const uncovered = Array.isArray(sp?.coverage?.uncovered_requirements) ? sp.coverage.uncovered_requirements.length : 0;
    const mustTotal = typeof sp?.coverage?.must_total === "number" ? sp.coverage.must_total : null;
    const niceTotal = typeof sp?.coverage?.nice_total === "number" ? sp.coverage.nice_total : null;
    const mustCovered = typeof sp?.coverage?.must_covered === "number" ? sp.coverage.must_covered : null;
    const niceCovered = typeof sp?.coverage?.nice_covered === "number" ? sp.coverage.nice_covered : null;
    const coveragePct =
      mustTotal !== null && niceTotal !== null && mustCovered !== null && niceCovered !== null && mustTotal + niceTotal > 0
        ? Math.round(((mustCovered + niceCovered) / (mustTotal + niceTotal)) * 100)
        : null;
    return { selected, uncovered, coveragePct, mustTotal, niceTotal, mustCovered, niceCovered };
  }, [content.selection_plan]);

  const totalStages = stageOrder.length;
  const completedCount = useMemo(() => stageOrder.filter((s) => resolveStageStatus(run, s.key) === "complete").length, [run]);
  const progressPct = useMemo(() => {
    if (run.result === "success" && run.status === "DONE") return 100;
    // Treat "active" as half-step for smoothness.
    const active = stageOrder.find((s) => resolveStageStatus(run, s.key) === "active") ? 0.5 : 0;
    const pct = ((completedCount + active) / Math.max(1, totalStages)) * 100;
    return Math.max(2, Math.min(100, Math.round(pct)));
  }, [completedCount, run.result, run.status, totalStages, run]);

  // BUG-022: Only show stages up to current stage for running jobs
  // Don't show DONE stage for running/error jobs
  const visibleStages = useMemo(() => {
    const idx = currentStageIndex(run);
    const stages = stageOrder.filter((_, i) => i <= idx);
    
    // Don't show DONE stage if run is still pending or errored
    if (run.result !== "success") {
      return stages.filter(s => s.key !== "DONE");
    }
    
    return stages;
  }, [run]);

  return (
    <div className="pipeline-view">
      <div className="pipeline-header">
        <div className="pipeline-header-top">
          <div>
            <div className="pipeline-now">
              <span className="pipeline-now-label">Now</span>
              <span className="pipeline-now-stage">{humanStage(run.status)}</span>
            </div>
            <div className="meta" style={{ marginTop: 4 }}>
              {run.result === "pending" ? "In progress" : run.result === "success" ? "Completed" : "Failed"} · {completedCount}/{totalStages} stages
            </div>
          </div>
          <div className={`pipeline-state-pill ${run.result}`}>
            {run.result === "pending" ? "Running" : run.result === "success" ? "Done" : "Error"}
          </div>
        </div>

        <div className={`pipeline-progress ${run.result === "error" ? "error" : ""}`}>
          <div className="pipeline-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {loading && <div className="meta" style={{ marginTop: 8 }}>Loading stage artifacts…</div>}
      
      {/* BUG-024: Show retry button if some artifacts failed to load */}
      {!loading && Object.values(artifactStatus).some(s => !s.ok) && (
        <div className="artifact-retry-banner">
          <span className="meta">⚠️ Some artifacts failed to load</span>
          <button 
            className="ghost small" 
            onClick={() => {
              // Reset content to trigger re-fetch
              setContent({});
              setArtifactStatus({});
            }}
          >
            Retry Loading
          </button>
        </div>
      )}

      <div className="pipeline-cards">
        {visibleStages.map((s) => {
          const status = resolveStageStatus(run, s.key);
          const isCurrent = run.status === s.key;

          if (s.key === "EXTRACTING") {
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {content.job_text ? (
                  <>
                    <div className="pipeline-highlights">
                      <div className="pipeline-highlight-title">Extracted job text</div>
                      <div className="pipeline-highlight-body">{clampText(content.job_text, 900)}</div>
                    </div>
                    <details className="pipeline-raw">
                      <summary className="pipeline-raw-summary">Show full text</summary>
                      <pre className="codeblock">{clampText(content.job_text, 8000)}</pre>
                    </details>
                  </>
                ) : (
                  <div className="empty-state">Working… the extracted job text will appear here.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "RUBRIC") {
            const reqsAll = getRubricPreview(content.jd_rubric);
            const reqsMust = reqsAll.filter((r) => r.type.toLowerCase().includes("must"));
            const reqsNice = reqsAll.filter((r) => r.type.toLowerCase().includes("nice"));
            const keywords = Array.isArray(content.jd_rubric?.keywords) ? content.jd_rubric.keywords : [];
            const keywordTerms = keywords.map((k: any) => safeString(k?.term)).filter(Boolean);
            const shownReqs = rubricTab === "must" ? reqsMust : rubricTab === "nice" ? reqsNice : reqsAll;

            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {content.jd_rubric ? (
                  <>
                    <div className="chip-row" style={{ marginBottom: 10 }}>
                      <button className={`pill subtle ${rubricTab === "all" ? "active" : ""}`} onClick={() => setRubricTab("all")}>
                        Requirements ({rubricSummary.total})
                      </button>
                      <button className={`pill subtle ${rubricTab === "must" ? "active" : ""}`} onClick={() => setRubricTab("must")}>
                        Must ({rubricSummary.must})
                      </button>
                      <button className={`pill subtle ${rubricTab === "nice" ? "active" : ""}`} onClick={() => setRubricTab("nice")}>
                        Nice ({rubricSummary.nice})
                      </button>
                      <button
                        className={`pill subtle ${rubricTab === "keywords" ? "active" : ""}`}
                        onClick={() => setRubricTab("keywords")}
                      >
                        Keywords ({rubricSummary.keywordsCount})
                      </button>
                    </div>

                    {rubricTab === "keywords" ? (
                      keywordTerms.length ? (
                        <div className="keyword-chip-grid">
                          {keywords
                            .slice(0, 30)
                            .map((k: any, idx: number) => ({ term: safeString(k?.term), importance: Number(k?.importance || 1), idx }))
                            .filter((k: { term: string }) => Boolean(k.term))
                            .map((k: { term: string; importance: number; idx: number }) => (
                              <span key={`${k.term}-${k.idx}`} className={`keyword-chip imp-${Math.max(1, Math.min(5, k.importance || 1))}`}>
                                {k.term}
                              </span>
                            ))}
                        </div>
                      ) : (
                        <div className="empty-state">No keywords found.</div>
                      )
                    ) : shownReqs.length ? (
                      <div className="pipeline-list">
                        {shownReqs.slice(0, 12).map((r) => (
                          <div key={r.id} className="pipeline-list-row">
                            <span className="pipeline-tag">{r.type}</span>
                            <span className="pipeline-list-text">{r.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">No requirements found.</div>
                    )}
                    {rubricTab !== "keywords" && shownReqs.length > 12 ? (
                      <div className="meta">Showing 12 of {shownReqs.length} requirements.</div>
                    ) : null}
                    <RawBlock title="Show raw rubric" data={content.jd_rubric} />
                  </>
                ) : (
                  <div className="empty-state">Working… the generated rubric will appear here.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "EVIDENCE") {
            const preview = getEvidencePreview(content.evidence_scores);
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {content.evidence_scores ? (
                  <>
                    {preview.length ? (
                      <div className="pipeline-list">
                        {preview.map((e) => (
                          <div key={e.id} className="pipeline-list-row">
                            <span className="pipeline-tag">{e.tier || "tier"}</span>
                            <span className="pipeline-list-text">
                              <strong style={{ marginRight: 8 }}>{e.score !== null ? Number(e.score).toFixed(2) : "—"}</strong>
                              {e.text ? clampOneLine(e.text, 160) : e.id}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">Evidence scoring is complete.</div>
                    )}
                    <RawBlock title="Show raw evidence scores" data={content.evidence_scores} />
                  </>
                ) : (
                  <div className="empty-state">Working… evidence scores will appear here.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "EMBEDDINGS") {
            const basis = content.relevance_summary || content.relevance_matrix || content.jd_requirement_embeddings;
            const byReq = content.relevance_matrix ? getRelevanceByRequirement(content.relevance_matrix, content.jd_rubric, content.evidence_scores) : [];
            const preview = getRelevancePreview(content.relevance_summary);
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {basis ? (
                  <>
                    <div className="chip-row" style={{ marginBottom: 10 }}>
                      <button className={`pill subtle ${matchTab === "byRequirement" ? "active" : ""}`} onClick={() => setMatchTab("byRequirement")}>
                        By requirement
                      </button>
                      <button className={`pill subtle ${matchTab === "raw" ? "active" : ""}`} onClick={() => setMatchTab("raw")}>
                        Raw
                      </button>
                    </div>

                    {matchTab === "byRequirement" ? (
                      <div className="meta" style={{ marginBottom: 10 }}>
                        Percent is <strong>semantic similarity</strong> (embeddings). Higher means the requirement is closer to the bullet’s meaning.
                      </div>
                    ) : null}

                    {matchTab === "byRequirement" && byReq.length ? (
                      <div className="pipeline-list">
                        {byReq.map((row) => {
                          const top = row.top[0];
                          const topScore = top ? Math.round(top.score * 100) : null;
                          const topBullet = top?.bulletId || "";
                          const topBulletText = top?.bulletText ? clampOneLine(top.bulletText, 110) : "";
                          return (
                            <div key={row.reqId} className="pipeline-list-row">
                              <span className="pipeline-tag">{topScore !== null ? `${topScore}% sim` : "match"}</span>
                              <span className="pipeline-list-text">
                                <strong style={{ marginRight: 8 }}>{row.reqId}</strong>
                                {clampOneLine(row.requirement, 160)}
                                {topBullet ? (
                                  <div className="meta" style={{ marginTop: 6 }}>
                                    Top bullet: {topBullet}
                                    {topBulletText ? ` — ${topBulletText}` : ""}
                                  </div>
                                ) : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : matchTab === "byRequirement" && preview.length ? (
                      <div className="pipeline-list">
                        {preview.map((m) => (
                          <div key={m.id} className="pipeline-list-row">
                            <span className="pipeline-tag">{m.score !== null ? `${Math.round(m.score * 100)}% sim` : "match"}</span>
                            <span className="pipeline-list-text">{m.text || m.id}</span>
                          </div>
                        ))}
                      </div>
                    ) : matchTab === "byRequirement" ? (
                      <div className="empty-state">Matching is complete.</div>
                    ) : null}

                    {matchTab === "raw" ? <RawBlock title="Show raw matching data" data={basis} /> : null}
                  </>
                ) : (
                  <div className="empty-state">Working… matching results will appear here.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "SELECTION") {
            const uncovered = Array.isArray(content.selection_plan?.coverage?.uncovered_requirements)
              ? content.selection_plan.coverage.uncovered_requirements
              : [];
            const reqMap = buildRequirementMap(content.jd_rubric);
            const selectedCards = buildSelectedBulletCards(content.selection_plan, content.jd_rubric);
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {content.selection_plan ? (
                  <>
                    <div className="chip-row" style={{ marginBottom: 10 }}>
                      <button
                        className={`pill subtle ${selectionTab === "selected" ? "active" : ""}`}
                        onClick={() => setSelectionTab("selected")}
                      >
                        Selected ({selectionSummary.selected})
                      </button>
                      <button
                        className={`pill subtle ${selectionTab === "uncovered" ? "active" : ""}`}
                        onClick={() => setSelectionTab("uncovered")}
                      >
                        Uncovered ({selectionSummary.uncovered})
                      </button>
                      {selectionSummary.coveragePct !== null ? <span className="pill subtle">{selectionSummary.coveragePct}% coverage</span> : null}
                      {typeof selectionSummary.mustCovered === "number" && typeof selectionSummary.mustTotal === "number" ? (
                        <span className="pill subtle">Must {selectionSummary.mustCovered}/{selectionSummary.mustTotal}</span>
                      ) : null}
                      {typeof selectionSummary.niceCovered === "number" && typeof selectionSummary.niceTotal === "number" ? (
                        <span className="pill subtle">Nice {selectionSummary.niceCovered}/{selectionSummary.niceTotal}</span>
                      ) : null}
                    </div>
                    {selectionSummary.coveragePct !== null ? (
                      <div className="meta" style={{ marginBottom: 10 }}>
                        Coverage is <strong>covered requirements / total requirements</strong>. The remaining{" "}
                        <strong>{Math.max(0, 100 - selectionSummary.coveragePct)}%</strong> are the uncovered requirements (with reasons) under the Uncovered tab.
                      </div>
                    ) : null}

                    {selectionTab === "uncovered" ? (
                      uncovered.length ? (
                        <div className="pipeline-list">
                          {uncovered.slice(0, 10).map((u: any) => {
                            const rid = safeString(u?.req_id);
                            const req = reqMap.get(rid);
                            const text = safeString(req?.requirement) || safeString(req?.text) || rid;
                            const reason = safeString(u?.reason) || "not_covered";
                            const weight = typeof u?.weight === "number" ? u.weight : typeof req?.weight === "number" ? req.weight : null;
                            return (
                              <div key={rid || JSON.stringify(u)} className="pipeline-list-row">
                                <span className="pipeline-tag">{safeString(u?.type) || "req"}</span>
                                <span className="pipeline-list-text">
                                  <strong style={{ marginRight: 8 }}>{rid}</strong>
                                  {clampOneLine(text, 160)}
                                  <div className="meta" style={{ marginTop: 6 }}>
                                    {weight !== null ? `Weight: ${weight} · ` : ""}
                                    Reason: {coverageReasonLabel(reason)}
                                  </div>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state">No uncovered requirements.</div>
                      )
                    ) : selectedCards.length ? (
                      <div className="pipeline-bullets">
                        {selectedCards.slice(0, 12).map((b) => {
                          const topReqs = b.matches.slice(0, 3);
                          return (
                            <details key={b.id} className="pipeline-bullet">
                              <summary className="pipeline-bullet-summary">
                                <div className="pipeline-bullet-left">
                                  <div className="pipeline-bullet-text">{clampOneLine(b.text, 220)}</div>
                                  <div className="pipeline-bullet-sub">
                                    {b.rewriteIntent ? <span className="pipeline-mini-tag">rewrite: {b.rewriteIntent}</span> : null}
                                    {b.parentType && b.parentId ? <span className="pipeline-mini-tag">{b.parentType}:{b.parentId}</span> : null}
                                  </div>
                                </div>
                                <div className="pipeline-bullet-right">
                                  {b.evidenceTier ? <span className="pipeline-evidence-pill">{b.evidenceTier}</span> : null}
                                  <span className="pipeline-evidence-pill">
                                    {typeof b.evidenceScore === "number" ? b.evidenceScore.toFixed(2) : "—"}
                                  </span>
                                </div>
                              </summary>

                              {topReqs.length ? (
                                <div className="pipeline-bullet-body">
                                  <div className="pipeline-bullet-section-title">Covers</div>
                                  <div className="pipeline-match-grid">
                                    {topReqs.map((m) => (
                                      <div key={`${b.id}:${m.reqId}`} className="pipeline-match-row">
                                        <span className="pipeline-tag">{m.reqId}</span>
                                        <span className="pipeline-list-text">
                                          {m.requirement ? clampOneLine(m.requirement, 140) : ""}
                                          <span className="meta" style={{ marginLeft: 8 }}>
                                            rel {formatPct(m.rel)}{typeof m.edge === "number" ? ` · edge ${m.edge.toFixed(2)}` : ""}
                                          </span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>

                                  {b.matches.length > topReqs.length ? (
                                    <details className="pipeline-raw" style={{ marginTop: 10 }}>
                                      <summary className="pipeline-raw-summary">
                                        Show all matched requirements ({b.matches.length})
                                      </summary>
                                      <div className="pipeline-match-grid" style={{ marginTop: 10 }}>
                                        {b.matches.map((m) => (
                                          <div key={`${b.id}:all:${m.reqId}`} className="pipeline-match-row">
                                            <span className="pipeline-tag">{m.reqId}</span>
                                            <span className="pipeline-list-text">
                                              {m.requirement ? clampOneLine(m.requirement, 160) : ""}
                                              <span className="meta" style={{ marginLeft: 8 }}>
                                                rel {formatPct(m.rel)}{typeof m.edge === "number" ? ` · edge ${m.edge.toFixed(2)}` : ""}
                                              </span>
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </details>
                                  ) : null}

                                  {b.reasons.length ? (
                                    <details className="pipeline-raw" style={{ marginTop: 10 }}>
                                      <summary className="pipeline-raw-summary">Show selection reasons</summary>
                                      <pre className="codeblock">{b.reasons.join("\n")}</pre>
                                    </details>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="pipeline-bullet-body">
                                  <div className="empty-state">No match details recorded for this bullet.</div>
                                </div>
                              )}
                            </details>
                          );
                        })}
                        {selectedCards.length > 12 ? (
                          <div className="meta">Showing 12 of {selectedCards.length} selected bullets.</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="empty-state">Selection plan is ready.</div>
                    )}
                    <RawBlock title="Show raw selection plan" data={content.selection_plan} />
                  </>
                ) : (
                  <div className="empty-state">Working… selected bullets will appear here.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "ANALYZING") {
            const finalName = safeString(content.final_resume?.name) || "";
            const baselineName = safeString(content.baseline_resume?.name) || "";
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {content.final_resume || content.tailored ? (
                  <>
                    <div className="pipeline-list">
                      {baselineName ? (
                        <div className="pipeline-list-row">
                          <span className="pipeline-tag">baseline</span>
                          <span className="pipeline-list-text">{baselineName}</span>
                        </div>
                      ) : null}
                      {finalName ? (
                        <div className="pipeline-list-row">
                          <span className="pipeline-tag">final</span>
                          <span className="pipeline-list-text">{finalName}</span>
                        </div>
                      ) : (
                        <div className="pipeline-list-row">
                          <span className="pipeline-tag">result</span>
                          <span className="pipeline-list-text">Tailored resume ready</span>
                        </div>
                      )}
                    </div>
                    {content.baseline_resume ? <RawBlock title="Show raw baseline resume" data={content.baseline_resume} /> : null}
                    {content.final_resume ? <RawBlock title="Show raw final resume" data={content.final_resume} /> : null}
                    {content.tailored && !content.final_resume ? <RawBlock title="Show raw tailored output" data={content.tailored} /> : null}
                  </>
                ) : (
                  <div className="empty-state">Working… tailored content will appear here.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "GENERATING_LATEX") {
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {content.tex ? (
                  <>
                    <div className="pipeline-highlights">
                      <div className="pipeline-highlight-title">Generated LaTeX</div>
                      <div className="pipeline-highlight-body">{clampText(content.tex, 700)}</div>
                    </div>
                    <details className="pipeline-raw">
                      <summary className="pipeline-raw-summary">Show full LaTeX</summary>
                      <pre className="codeblock">{clampText(content.tex, 9000)}</pre>
                    </details>
                  </>
                ) : (
                  <div className="empty-state">Working… LaTeX will appear here.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "COMPILING_PDF") {
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={isCurrent}>
                {run.artifacts?.pdf ? (
                  <div className="empty-state">PDF is ready. Use “Download PDF” above.</div>
                ) : (
                  <div className="empty-state">Working… PDF will be ready soon.</div>
                )}
              </StageCard>
            );
          }

          if (s.key === "DONE") {
            return (
              <StageCard key={s.key} title={s.title} icon={s.icon} status={status} defaultOpen={false}>
                <div className="empty-state">All set. Artifacts are available in Downloads.</div>
              </StageCard>
            );
          }

          return null;
        })}

        {run.result === "error" ? (
          <div className="warning-box" style={{ marginTop: 10 }}>
            <strong>Run failed</strong>
            <div className="meta" style={{ marginTop: 6 }}>Stage: {run.status}</div>
            {run.error ? <div style={{ marginTop: 8 }}>{run.error}</div> : null}
          </div>
        ) : null}

        {run.result === "pending" && Object.keys(run.artifacts || {}).length === 0 ? (
          <div className="empty-state" style={{ marginTop: 8 }}>Artifacts will appear here as the pipeline progresses.</div>
        ) : null}

        {Object.keys(artifactStatus).length ? (
          <details className="pipeline-debug" style={{ marginTop: 10 }}>
            <summary className="meta">Artifact load status (debug)</summary>
            <pre className="codeblock">{jsonPretty(artifactStatus)}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
};

export default RunPipelineView;
