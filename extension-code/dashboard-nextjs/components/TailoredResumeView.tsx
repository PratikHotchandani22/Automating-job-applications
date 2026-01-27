"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { renderRichText } from "@/utils/renderRichText";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import SummaryEditor from "@/components/resume-editors/SummaryEditor";
import SkillsEditor from "@/components/resume-editors/SkillsEditor";
import ExperienceEditor from "@/components/resume-editors/ExperienceEditor";
import ProjectsEditor from "@/components/resume-editors/ProjectsEditor";
import EducationEditor from "@/components/resume-editors/EducationEditor";
import InlineInput from "@/components/resume-editors/InlineInput";
import type { TailoredResumeDraft } from "@/components/resume-editors/types";
import { cloneResume, ensureBulletPeriod, estimateWordCount, normalizeDateRange } from "@/utils/resumeDraft";

type TailoredResume = TailoredResumeDraft;

interface MasterResume {
  header?: {
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    website?: string;
  };
  links?: any;
}

interface Job {
  title: string;
  company?: string;
  location?: string;
}

interface Artifact {
  _id: Id<"generatedArtifacts">;
  artifactType: "pdf" | "tex" | "json";
  fileName: string;
  storageId: Id<"_storage">;
  sizeBytes: number;
  createdAt: number;
}

interface TailoredResumeViewProps {
  tailoredResume: TailoredResume;
  masterResume: MasterResume | null;
  job: Job | null;
  runId: Id<"runs">;
  runSlug: string;
  artifacts: Artifact[];
  onArtifactCreated?: () => void;
  registerGeneratePdf?: (context: { trigger: () => Promise<void>; loading: boolean } | null) => void;
}

export default function TailoredResumeView({
  tailoredResume,
  masterResume,
  job,
  runId,
  runSlug,
  artifacts,
  onArtifactCreated,
  registerGeneratePdf,
}: TailoredResumeViewProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "bullets" | "latex" | "extras">("preview");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [latex, setLatex] = useState("");
  const [loadingLatex, setLoadingLatex] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [latexGenerated, setLatexGenerated] = useState(false);
  const [draftResume, setDraftResume] = useState<TailoredResume>(() => cloneResume(tailoredResume));
  const [baselineResume, setBaselineResume] = useState<TailoredResume>(() => cloneResume(tailoredResume));
  const [initialPdfLoading, setInitialPdfLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [savingResume, setSavingResume] = useState(false);
  const [saveResumeOkAt, setSaveResumeOkAt] = useState<string | null>(null);
  const hasExtras =
    Boolean(tailoredResume.coverLetter?.trim()) ||
    Boolean(tailoredResume.diagnostics?.trim()) ||
    Boolean(tailoredResume.reasoningSummary?.trim());

  const generateUploadUrl = useMutation(api.runDetails.generateUploadUrl);
  const storeArtifact = useMutation(api.runDetails.storeArtifact);
  const saveTailoredResumeEdit = useMutation(api.tailoredResumes.createTailoredResumeEdit);


  // Count modifications
  const modificationStats = useMemo(() => {
    let totalBullets = 0;
    let rewrittenBullets = 0;

    tailoredResume.workExperience.forEach((exp) => {
      exp.bullets.forEach((b) => {
        totalBullets++;
        if (b.wasRewritten) rewrittenBullets++;
      });
    });

    tailoredResume.projects.forEach((proj) => {
      proj.bullets.forEach((b) => {
        totalBullets++;
        if (b.wasRewritten) rewrittenBullets++;
      });
    });

    return { totalBullets, rewrittenBullets };
  }, [tailoredResume]);

  const isDraftDirty = useMemo(() => {
    return JSON.stringify(draftResume) !== JSON.stringify(baselineResume);
  }, [draftResume, baselineResume]);

  useEffect(() => {
    const next = cloneResume(tailoredResume);
    setDraftResume(next);
    setBaselineResume(next);
    setResumeError(null);
    setSaveResumeOkAt(null);
  }, [tailoredResume]);

  // Check if artifacts already exist
  const existingPdf = artifacts.find((a) => a.artifactType === "pdf");
  const latestPdf = useMemo(() => {
    const pdfArtifacts = artifacts.filter((a) => a.artifactType === "pdf");
    if (pdfArtifacts.length === 0) return null;
    return pdfArtifacts.reduce((latest, current) =>
      current.createdAt > latest.createdAt ? current : latest
    );
  }, [artifacts]);
  const latestTex = useMemo(() => {
    const texArtifacts = artifacts.filter((a) => a.artifactType === "tex");
    if (texArtifacts.length === 0) return null;
    return texArtifacts.reduce((latest, current) =>
      current.createdAt > latest.createdAt ? current : latest
    );
  }, [artifacts]);
  const texUrl = useQuery(
    api.runDetails.getArtifactUrl,
    latestTex ? { storageId: latestTex.storageId } : "skip"
  );
  const pdfUrl = useQuery(
    api.runDetails.getArtifactUrl,
    latestPdf ? { storageId: latestPdf.storageId } : "skip"
  );
  const lastLoadedLatex = useRef<string>("");
  const initialPdfRequested = useRef(false);
  const hasLatexSource = latexGenerated || Boolean(latestTex);

  // Helper function to generate filename in format: fullname_jobtitle_companyname
  const generateFilename = useCallback(() => {
    // Get full name (e.g., "Pratik Hotchandani")
    const fullName = masterResume?.header?.fullName || "resume";
    
    // Get job title and company
    const jobTitle = job?.title || "resume";
    const jobCompany = job?.company || "company";
    
    // Build filename: fullname_jobtitle_companyname
    const filename = `${fullName}_${jobTitle}_${jobCompany}`;
    
    // Sanitize for filesystem (replace invalid chars with underscore)
    return filename.replace(/[^a-zA-Z0-9_-]/g, "_");
  }, [masterResume, job]);

  const fetchLatexFromServer = useCallback(async () => {
    const response = await fetch("/api/render-latex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: runSlug }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || "Failed to generate LaTeX");
    }
    const data = await response.json();
    if (!data?.latex) {
      throw new Error("LaTeX output was empty");
    }
    setLatex(data.latex);
    lastLoadedLatex.current = data.latex;
    setLatexGenerated(true);
    return data as { latex: string; filename?: string };
  }, [runSlug]);

  const fetchLatexForExport = useCallback(async () => {
    const response = await fetch("/api/export-latex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: runSlug }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || "Failed to export LaTeX");
    }
    const data = await response.json();
    if (!data?.latex) {
      throw new Error("LaTeX output was empty");
    }
    setLatex(data.latex);
    lastLoadedLatex.current = data.latex;
    setLatexGenerated(true);
    return data as { latex: string; filename?: string };
  }, [runSlug]);

  const ensureLatexSource = useCallback(
    async (force = false) => {
      if (!force && latex?.trim()) {
        return { latex, filename: generateFilename() };
      }
      return await fetchLatexFromServer();
    },
    [latex, fetchLatexFromServer, generateFilename]
  );

  // Handle PDF generation and download
  const handleGeneratePdf = useCallback(async (download = true, store = true) => {
    setGeneratingPdf(true);
    setPdfError(null);

    const generatedFilename = generateFilename();

    try {
      const latexResponse = await ensureLatexSource(true);
      const latexSource = latexResponse.latex;
      const filename = latexResponse.filename || generatedFilename;

      // Call our PDF generation API
      const response = await fetch("/api/generate-pdf", {
        method: download ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex: latexSource,
          filename,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate PDF");
      }

      if (download) {
        // Direct download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const downloadFilename = `${filename}.pdf`;
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      if (store) {
        // Also store to Convex
        const storeResponse = await fetch("/api/generate-pdf", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex: latexSource,
          filename,
        }),
      });

      if (storeResponse.ok) {
        const storeData = await storeResponse.json();
        if (storeData.success && storeData.pdf) {
          // Get upload URL
          const uploadUrl = await generateUploadUrl();

          // Convert base64 to blob
          const pdfBlob = new Blob(
            [Uint8Array.from(atob(storeData.pdf), (c) => c.charCodeAt(0))],
            { type: "application/pdf" }
          );

          if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl(URL.createObjectURL(pdfBlob));

          // Upload to Convex storage
          const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
            body: pdfBlob,
          });

          if (uploadResponse.ok) {
            const { storageId } = await uploadResponse.json();

            // Store artifact reference
            await storeArtifact({
              runId,
              modelKey: tailoredResume.modelKey,
              artifactType: "pdf",
              fileName: storeData.filename,
              storageId,
              mimeType: "application/pdf",
              sizeBytes: storeData.size,
            });

            onArtifactCreated?.();
          }
        }
      }
      }
    } catch (error: any) {
      console.error("PDF generation error:", error);
      setPdfError(error.message || "Failed to generate PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }, [
    ensureLatexSource,
    job,
    masterResume,
    runId,
    tailoredResume.modelKey,
    generateUploadUrl,
    storeArtifact,
    onArtifactCreated,
    generateFilename,
    pdfPreviewUrl,
  ]);

  // Handle LaTeX download
  const handleDownloadLatex = useCallback(async () => {
    const { latex: latexSource, filename } = await fetchLatexForExport();
    const blob = new Blob([latexSource], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename || generateFilename()}.tex`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Store to Convex
    try {
      const uploadUrl = await generateUploadUrl();
      const texBlob = new Blob([latexSource], { type: "application/x-tex" });

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-tex" },
        body: texBlob,
      });

      if (uploadResponse.ok) {
        const { storageId } = await uploadResponse.json();
        await storeArtifact({
          runId,
          modelKey: tailoredResume.modelKey,
          artifactType: "tex",
          fileName: `${filename || generateFilename()}.tex`,
          storageId,
          mimeType: "application/x-tex",
          sizeBytes: texBlob.size,
        });
        onArtifactCreated?.();
      }
    } catch (error) {
      console.error("Failed to store LaTeX:", error);
    }
  }, [
    fetchLatexForExport,
    generateFilename,
    runId,
    tailoredResume.modelKey,
    generateUploadUrl,
    storeArtifact,
    onArtifactCreated,
  ]);

  // Copy LaTeX to clipboard
  const handleCopyLatex = useCallback(() => {
    navigator.clipboard.writeText(latex);
  }, [latex]);

  const validateDraft = useCallback((draft: TailoredResume) => {
    const errors: string[] = [];
    if (!draft.summary?.trim()) {
      errors.push("Summary is required.");
    }

    draft.workExperience.forEach((exp, idx) => {
      if (!exp.company?.trim()) errors.push(`Experience ${idx + 1}: company is required.`);
      if (!exp.title?.trim()) errors.push(`Experience ${idx + 1}: title is required.`);
      if (!exp.dateRange?.trim()) errors.push(`Experience ${idx + 1}: date range is required.`);
      if (!exp.bullets.length) errors.push(`Experience ${idx + 1}: at least one bullet is required.`);
      exp.bullets.forEach((bullet, bIdx) => {
        if (!bullet.tailoredText?.trim()) {
          errors.push(`Experience ${idx + 1}: bullet ${bIdx + 1} cannot be empty.`);
        }
      });
    });

    draft.projects.forEach((proj, idx) => {
      if (!proj.name?.trim()) errors.push(`Project ${idx + 1}: name is required.`);
      if (!proj.bullets.length) errors.push(`Project ${idx + 1}: at least one bullet is required.`);
      proj.bullets.forEach((bullet, bIdx) => {
        if (!bullet.tailoredText?.trim()) {
          errors.push(`Project ${idx + 1}: bullet ${bIdx + 1} cannot be empty.`);
        }
      });
    });

    draft.education.forEach((edu, idx) => {
      if (!edu.institution?.trim()) errors.push(`Education ${idx + 1}: institution is required.`);
      if (!edu.degree?.trim()) errors.push(`Education ${idx + 1}: degree is required.`);
      if (!edu.dates?.trim()) errors.push(`Education ${idx + 1}: dates are required.`);
    });

    return errors;
  }, []);

  const normalizeDraft = useCallback((draft: TailoredResume) => {
    const next = cloneResume(draft);
    next.summary = next.summary?.trim() || "";
    next.workExperience = next.workExperience.map((exp) => ({
      ...exp,
      company: exp.company?.trim() || "",
      title: exp.title?.trim() || "",
      dateRange: normalizeDateRange(exp.dateRange || ""),
      location: exp.location?.trim() || "",
      bullets: exp.bullets.map((bullet) => {
        const normalizedText = ensureBulletPeriod(bullet.tailoredText || "");
        return {
          ...bullet,
          tailoredText: normalizedText,
          wasRewritten: bullet.originalText !== normalizedText,
        };
      }),
    }));
    next.projects = next.projects.map((proj) => ({
      ...proj,
      name: proj.name?.trim() || "",
      date: proj.date ? normalizeDateRange(proj.date) : proj.date,
      bullets: proj.bullets.map((bullet) => {
        const normalizedText = ensureBulletPeriod(bullet.tailoredText || "");
        return {
          ...bullet,
          tailoredText: normalizedText,
          wasRewritten: bullet.originalText !== normalizedText,
        };
      }),
    }));
    next.education = next.education.map((edu) => ({
      ...edu,
      institution: edu.institution?.trim() || "",
      degree: edu.degree?.trim() || "",
      dates: normalizeDateRange(edu.dates || ""),
      location: edu.location?.trim() || "",
      gpa: edu.gpa?.trim() || edu.gpa,
    }));
    next.skills = Object.fromEntries(
      Object.entries(next.skills || {}).map(([key, values]) => [
        key,
        (values || []).map((skill) => skill.trim()).filter(Boolean),
      ])
    );
    if (next.awards) {
      next.awards = next.awards.map((award) => ({
        ...award,
        name: award.name?.trim() || "",
        issuer: award.issuer?.trim() || "",
        year: award.year?.trim() || "",
        details: award.details?.trim() || award.details,
      }));
    }
    return next;
  }, []);

  const handleResetDraft = useCallback(() => {
    setDraftResume(cloneResume(baselineResume));
    setResumeError(null);
    setSaveResumeOkAt(null);
  }, [baselineResume]);

  const handleSaveEdits = useCallback(async () => {
    setResumeError(null);
    setSaveResumeOkAt(null);
    const errors = validateDraft(draftResume);
    if (errors.length > 0) {
      setResumeError(errors[0]);
      return;
    }

    const normalized = normalizeDraft(draftResume);
    setDraftResume(normalized);
    setSavingResume(true);
    try {
      const saveResult = await saveTailoredResumeEdit({
        runId,
        modelName: tailoredResume.modelName,
        tailoredHash: `user_edit_${Date.now()}`,
        summary: normalized.summary,
        coverLetter: normalized.coverLetter,
        diagnostics: normalized.diagnostics,
        reasoningSummary: normalized.reasoningSummary,
        workExperience: normalized.workExperience,
        projects: normalized.projects,
        education: normalized.education,
        skills: normalized.skills,
        skills_highlighted: normalized.skills_highlighted,
        awards: normalized.awards,
        selectionEnforcement: normalized.selectionEnforcement,
        wordCountEstimate: estimateWordCount(normalized as any),
        parentVersionId: tailoredResume._id,
      });
      if (saveResult?.versionId) {
        // Hook for future UI state updates if needed.
      }

      setBaselineResume(normalized);

      const latexResponse = await fetchLatexFromServer();
      const latexContentNext = latexResponse.latex;
      const filename = latexResponse.filename || generateFilename();

      const uploadUrl = await generateUploadUrl();
      const texBlob = new Blob([latexContentNext], { type: "application/x-tex" });
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-tex" },
        body: texBlob,
      });
      if (uploadResponse.ok) {
        const { storageId } = await uploadResponse.json();
        await storeArtifact({
          runId,
          modelKey: tailoredResume.modelKey,
          artifactType: "tex",
          fileName: `${filename}.tex`,
          storageId,
          mimeType: "application/x-tex",
          sizeBytes: texBlob.size,
        });
      }

      const pdfResponse = await fetch("/api/generate-pdf", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex: latexContentNext,
          filename,
        }),
      });
      if (!pdfResponse.ok) {
        const errorData = await pdfResponse.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to compile PDF");
      }
      const pdfData = await pdfResponse.json();
      if (pdfData.success && pdfData.pdf) {
        const pdfBlob = new Blob(
          [Uint8Array.from(atob(pdfData.pdf), (c) => c.charCodeAt(0))],
          { type: "application/pdf" }
        );
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl(URL.createObjectURL(pdfBlob));

        const pdfUploadUrl = await generateUploadUrl();
        const uploadPdfResponse = await fetch(pdfUploadUrl, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: pdfBlob,
        });
        if (uploadPdfResponse.ok) {
          const { storageId } = await uploadPdfResponse.json();
          await storeArtifact({
            runId,
            modelKey: tailoredResume.modelKey,
            artifactType: "pdf",
            fileName: pdfData.filename || `${filename}.pdf`,
            storageId,
            mimeType: "application/pdf",
            sizeBytes: pdfData.size,
          });
        }
      }

      onArtifactCreated?.();
      setSaveResumeOkAt(new Date().toISOString());
    } catch (error: any) {
      setResumeError(error?.message || "Failed to save edits");
    } finally {
      setSavingResume(false);
    }
  }, [
    draftResume,
    validateDraft,
    normalizeDraft,
    saveTailoredResumeEdit,
    runId,
    tailoredResume.modelName,
    tailoredResume._id,
    tailoredResume.modelKey,
    fetchLatexFromServer,
    generateUploadUrl,
    storeArtifact,
    generateFilename,
    pdfPreviewUrl,
    onArtifactCreated,
  ]);

  const loadLatexSource = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (latestTex && texUrl === undefined) return;
      setLoadError(null);
      if (force) {
        if (pdfPreviewUrl) {
          URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl(null);
        }
      }
      if (!texUrl) {
        if (latexGenerated || latex?.trim()) return;
        setLatex("");
        lastLoadedLatex.current = "";
        setLatexGenerated(false);
        return;
      }
      setLoadingLatex(true);
      try {
        const res = await fetch(texUrl);
        if (!res.ok) {
          throw new Error(`Failed to load LaTeX (HTTP ${res.status})`);
        }
        const text = await res.text();
        setLatex(text);
        lastLoadedLatex.current = text;
        setLatexGenerated(true);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load LaTeX");
        setLatex(latex || "");
        lastLoadedLatex.current = latex || "";
        setLatexGenerated(false);
      } finally {
        setLoadingLatex(false);
      }
    },
    [latestTex, pdfPreviewUrl, texUrl, latexGenerated, latex]
  );

  const pdfContext = useMemo(() => {
    return {
      trigger: () => handleGeneratePdf(true, true),
      loading: generatingPdf,
    };
  }, [handleGeneratePdf, generatingPdf]);

  useEffect(() => {
    if (!registerGeneratePdf) return undefined;
    registerGeneratePdf(pdfContext);
    return () => registerGeneratePdf(null);
  }, [registerGeneratePdf, pdfContext]);

  useEffect(() => {
    loadLatexSource().catch(() => undefined);
  }, [loadLatexSource]);

  useEffect(() => {
    if (initialPdfRequested.current) return;
    if (latestPdf || pdfPreviewUrl || generatingPdf) return;
    if (pdfUrl === undefined) return;
    initialPdfRequested.current = true;
    setInitialPdfLoading(true);
    handleGeneratePdf(false, true)
      .catch(() => undefined)
      .finally(() => setInitialPdfLoading(false));
  }, [latestPdf, pdfPreviewUrl, generatingPdf, pdfUrl, handleGeneratePdf]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDraftDirty) return;
      event.preventDefault();
      event.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDraftDirty]);

  return (
    <div className="tailored-resume-view">
      {/* Header */}
      <div className="trv-header">
        <div className="trv-meta">
          <h3>Tailored Resume</h3>
          <div className="trv-badges">
            <span className="badge subtle">
              {tailoredResume.modelName}
            </span>
            <span className="badge subtle">
              ~{tailoredResume.wordCountEstimate} words
            </span>
            <span className={`badge ${modificationStats.rewrittenBullets > 0 ? "modified" : "subtle"}`}>
              {modificationStats.rewrittenBullets}/{modificationStats.totalBullets} bullets rewritten
            </span>
          </div>
        </div>
        <div className="trv-actions">
          <button
            className="primary"
            onClick={() => handleGeneratePdf(true, true)}
            disabled={generatingPdf}
          >
            {generatingPdf ? (
              <>
                <span className="btn-spinner" />
                Generating...
              </>
            ) : existingPdf ? (
              "Regenerate PDF"
            ) : (
              "Generate PDF"
            )}
          </button>
          <button className="ghost" onClick={handleDownloadLatex}>
            Download LaTeX
          </button>
        </div>
      </div>

      {pdfError && (
        <div className="warning-box" style={{ marginBottom: "1rem" }}>
          <strong>PDF Generation Error:</strong> {pdfError}
        </div>
      )}

      {/* Tabs */}
      <div className="trv-tabs">
        <button
          className={`trv-tab ${activeTab === "preview" ? "active" : ""}`}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
        <button
          className={`trv-tab ${activeTab === "bullets" ? "active" : ""}`}
          onClick={() => setActiveTab("bullets")}
        >
          Bullet Changes ({modificationStats.rewrittenBullets})
        </button>
        {hasExtras && (
          <button
            className={`trv-tab ${activeTab === "extras" ? "active" : ""}`}
            onClick={() => setActiveTab("extras")}
          >
            Extras
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="trv-content">
        {activeTab === "preview" && (
          <div className="trv-preview-grid">
            <div className="trv-preview-editor trv-scroll-pane">
              <div className="preview-header">
                <div className="preview-actions">
                  <button
                    className="primary"
                    onClick={handleSaveEdits}
                    disabled={savingResume || !isDraftDirty}
                  >
                    {savingResume ? "Saving..." : "Save edits"}
                  </button>
                  <button className="ghost" onClick={handleResetDraft} disabled={!isDraftDirty}>
                    Reset edits
                  </button>
                  {isDraftDirty && <span className="unsaved-indicator">Unsaved changes</span>}
                </div>
                {saveResumeOkAt && (
                  <div className="meta">Saved at {new Date(saveResumeOkAt).toLocaleString()}</div>
                )}
              </div>

              {resumeError && (
                <div className="warning-box" style={{ marginBottom: "1rem" }}>
                  <strong>Save Error:</strong> {resumeError}
                </div>
              )}

              <SummaryEditor
                summary={draftResume.summary}
                onChange={(summary) => setDraftResume((prev) => ({ ...prev, summary }))}
              />

              <SkillsEditor
                skills={draftResume.skills}
                onChange={(skills) => setDraftResume((prev) => ({ ...prev, skills }))}
                highlightedSkills={draftResume.skills_highlighted || []}
                onHighlightedChange={(skills_highlighted) =>
                  setDraftResume((prev) => ({ ...prev, skills_highlighted }))
                }
              />

              <ExperienceEditor
                experiences={draftResume.workExperience}
                onChange={(workExperience) => setDraftResume((prev) => ({ ...prev, workExperience }))}
              />

              <ProjectsEditor
                projects={draftResume.projects}
                onChange={(projects) => setDraftResume((prev) => ({ ...prev, projects }))}
              />

              <EducationEditor
                education={draftResume.education}
                onChange={(education) => setDraftResume((prev) => ({ ...prev, education }))}
              />

              {draftResume.awards && draftResume.awards.length > 0 && (
                <div className="trv-section">
                  <h4>Awards & Achievements</h4>
                  <ul className="trv-awards">
                    {draftResume.awards.map((award, idx) => (
                      <li key={idx}>
                        <InlineInput
                          value={award.name}
                          onChange={(value) =>
                            setDraftResume((prev) => ({
                              ...prev,
                              awards: prev.awards?.map((entry, aIdx) =>
                                aIdx === idx ? { ...entry, name: value } : entry
                              ),
                            }))
                          }
                          placeholder="Award name"
                          className="award-name"
                        />
                        {" - "}
                        <InlineInput
                          value={award.issuer}
                          onChange={(value) =>
                            setDraftResume((prev) => ({
                              ...prev,
                              awards: prev.awards?.map((entry, aIdx) =>
                                aIdx === idx ? { ...entry, issuer: value } : entry
                              ),
                            }))
                          }
                          placeholder="Issuer"
                          className="award-issuer"
                        />
                        {" ("}
                        <InlineInput
                          value={award.year}
                          onChange={(value) =>
                            setDraftResume((prev) => ({
                              ...prev,
                              awards: prev.awards?.map((entry, aIdx) =>
                                aIdx === idx ? { ...entry, year: value } : entry
                              ),
                            }))
                          }
                          placeholder="Year"
                          className="award-year"
                        />
                        {")"}
                        <InlineInput
                          value={award.details || ""}
                          onChange={(value) =>
                            setDraftResume((prev) => ({
                              ...prev,
                              awards: prev.awards?.map((entry, aIdx) =>
                                aIdx === idx ? { ...entry, details: value } : entry
                              ),
                            }))
                          }
                          placeholder="Details"
                          className="award-details"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="trv-preview-pdf">
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h4>PDF Preview</h4>
                    <p className="hint">Updates after you save edits.</p>
                  </div>
                </div>
                <div className="latex-preview">
                  {pdfPreviewUrl || pdfUrl ? (
                    <iframe title="PDF preview" src={pdfPreviewUrl || pdfUrl || undefined} />
                  ) : (
                    <div className="pdf-empty-state">
                      <div className="pdf-empty-icon">📄</div>
                      <div className="pdf-empty-title">
                        {generatingPdf || initialPdfLoading ? "Rendering preview..." : "No Preview Yet"}
                      </div>
                      <div className="pdf-empty-hint">
                        {generatingPdf || initialPdfLoading
                          ? "Hang tight while we compile your PDF."
                          : "Generate a PDF to see it here."}
                      </div>
                      {!generatingPdf && !initialPdfLoading && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => handleGeneratePdf(false, true)}
                          disabled={generatingPdf}
                        >
                          Generate PDF
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "bullets" && (
          <div className="trv-bullets">
            <div className="bullets-header">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showDiff}
                  onChange={(e) => setShowDiff(e.target.checked)}
                />
                <span>Show differences</span>
              </label>
            </div>

            {/* Work Experience Bullets */}
            {tailoredResume.workExperience.map((exp) =>
              exp.bullets
                .filter((b) => showDiff ? b.wasRewritten : true)
                .map((bullet, idx) => (
                  <div key={`${exp.roleId}-${bullet.bulletId || idx}`} className="bullet-change-card">
                    <div className="bullet-change-header">
                      <div className="bullet-role-info">
                        <strong>{exp.company}</strong> <span>- {exp.title}</span>
                      </div>
                      <span className={`change-badge ${bullet.wasRewritten ? "modified" : "unchanged"}`}>
                        {bullet.wasRewritten ? "Modified" : "Unchanged"}
                      </span>
                    </div>

                    {bullet.wasRewritten ? (
                      <div className="bullet-comparison">
                        <div className="bullet-version before">
                          <label>Original</label>
                          <div className="bullet-text">{renderRichText(bullet.originalText)}</div>
                        </div>
                        <div className="change-arrow">→</div>
                        <div className="bullet-version after">
                          <label>Tailored</label>
                          <div className="bullet-text">{renderRichText(bullet.tailoredText)}</div>
                        </div>
                      </div>
                    ) : (
                        <div className="bullet-unchanged">
                          <div className="bullet-text">{renderRichText(bullet.tailoredText)}</div>
                        </div>
                    )}
                  </div>
                ))
            )}

            {/* Project Bullets */}
            {tailoredResume.projects.map((proj) =>
              proj.bullets
                .filter((b) => showDiff ? b.wasRewritten : true)
                .map((bullet, idx) => (
                  <div key={`${proj.projectId}-${bullet.bulletId || idx}`} className="bullet-change-card">
                    <div className="bullet-change-header">
                      <div className="bullet-role-info">
                        <strong>{proj.name}</strong> <span>- Project</span>
                      </div>
                      <span className={`change-badge ${bullet.wasRewritten ? "modified" : "unchanged"}`}>
                        {bullet.wasRewritten ? "Modified" : "Unchanged"}
                      </span>
                    </div>

                    {bullet.wasRewritten ? (
                      <div className="bullet-comparison">
                        <div className="bullet-version before">
                          <label>Original</label>
                          <div className="bullet-text">{renderRichText(bullet.originalText)}</div>
                        </div>
                        <div className="change-arrow">→</div>
                        <div className="bullet-version after">
                          <label>Tailored</label>
                          <div className="bullet-text">{renderRichText(bullet.tailoredText)}</div>
                        </div>
                      </div>
                    ) : (
                        <div className="bullet-unchanged">
                          <div className="bullet-text">{renderRichText(bullet.tailoredText)}</div>
                        </div>
                    )}
                  </div>
                ))
            )}

            {modificationStats.rewrittenBullets === 0 && showDiff && (
              <div className="empty-state-container">
                <div className="empty-state-icon">📝</div>
                <h3>No Modified Bullets</h3>
                <p className="hint">No bullets were rewritten for this job. Uncheck &quot;Show differences&quot; to see all bullets.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "extras" && hasExtras && (
          <div className="trv-extras">
            {tailoredResume.coverLetter?.trim() && (
              <div className="trv-section">
                <h4>Cover Letter</h4>
                <pre className="trv-extra-block">{tailoredResume.coverLetter}</pre>
              </div>
            )}
            {tailoredResume.diagnostics?.trim() && (
              <div className="trv-section">
                <h4>Diagnostics</h4>
                <pre className="trv-extra-block">{tailoredResume.diagnostics}</pre>
              </div>
            )}
            {tailoredResume.reasoningSummary?.trim() && (
              <div className="trv-section">
                <h4>Reasoning Summary</h4>
                <pre className="trv-extra-block">{tailoredResume.reasoningSummary}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .tailored-resume-view {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .trv-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .trv-meta h3 {
          margin: 0 0 0.5rem 0;
        }

        .trv-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .trv-extra-block {
          white-space: pre-wrap;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.75rem;
          font-family: "SF Mono", SFMono-Regular, ui-monospace, monospace;
          font-size: 0.85rem;
          line-height: 1.4;
        }

        .badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .badge.subtle {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border);
          color: var(--muted);
        }

        .badge.modified {
          background: rgba(96, 165, 250, 0.2);
          color: var(--primary);
        }

        .trv-actions {
          display: flex;
          gap: 0.5rem;
        }

        .trv-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border);
        }

        .trv-tab {
          padding: 10px 16px;
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          border-radius: 6px 6px 0 0;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .trv-tab:hover {
          background: rgba(96, 165, 250, 0.1);
          color: #e2e8f0;
        }

        .trv-tab.active {
          background: var(--bg);
          color: var(--primary);
          border-bottom: 2px solid var(--primary);
          margin-bottom: -1px;
        }

        .trv-content {
          min-height: 400px;
        }

        .trv-preview-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
          gap: 1.5rem;
          align-items: stretch;
          min-height: 70vh;
        }

        .trv-preview-editor {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .trv-preview-pdf {
          display: flex;
          min-height: 70vh;
        }

        .trv-preview-pdf .panel {
          height: 100%;
          width: 100%;
          display: flex;
          flex-direction: column;
          min-height: 70vh;
        }

        .trv-preview-pdf .latex-preview {
          flex: 1;
          min-height: 0;
          border-radius: 10px;
          overflow: hidden;
        }

        .trv-preview-pdf .latex-preview iframe {
          width: 100%;
          height: 100%;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .preview-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .unsaved-indicator {
          font-size: 12px;
          color: var(--primary);
        }

        .inline-input,
        .inline-textarea {
          width: 100%;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 4px 6px;
          color: inherit;
          font-size: 13px;
          font-family: inherit;
          line-height: 1.5;
          outline: none;
          resize: none;
          caret-color: var(--primary);
          transition: box-shadow 0.2s ease;
        }

        .inline-input::placeholder,
        .inline-textarea::placeholder {
          color: var(--muted);
        }

        .inline-input:focus,
        .inline-textarea:focus {
          box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.18);
        }

        .inline-input:disabled,
        .inline-textarea:disabled {
          opacity: 1;
          color: #e2e8f0;
        }

        .inline-textarea {
          min-height: 72px;
        }

        .summary-textarea {
          font-size: 14px;
          line-height: 1.6;
          padding: 6px 4px;
        }

        .bullet-editor {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .bullet-row {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.5rem;
          align-items: start;
        }

        .bullet-line-editor {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 0.5rem;
          align-items: start;
          width: 100%;
        }

        .bullet-prefix {
          color: var(--muted);
          line-height: 1.7;
        }

        .bullet-line-input {
          min-height: 0;
          padding: 2px 4px;
        }

        .inline-row {
          align-items: center;
        }

        .row-actions {
          display: inline-flex;
          gap: 4px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }

        .inline-row:hover .row-actions,
        .inline-row:focus-within .row-actions,
        .skill-category-header:hover .row-actions,
        .skill-category-header:focus-within .row-actions,
        .sortable-header:hover .row-actions,
        .sortable-header:focus-within .row-actions {
          opacity: 1;
          pointer-events: auto;
        }

        .icon-button {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted);
          cursor: pointer;
          font-size: 12px;
          transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        .icon-button:hover {
          color: #e2e8f0;
          background: rgba(96, 165, 250, 0.12);
        }

        .icon-button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.35);
        }

        .skill-category {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.9rem;
          margin-bottom: 0.75rem;
          background: rgba(255, 255, 255, 0.02);
        }

        .skill-category-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.65rem;
        }

        .collapse-toggle {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.04);
          color: #e2e8f0;
          font-size: 12px;
          cursor: pointer;
        }

        .skill-category-title {
          font-weight: 600;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #e2e8f0;
          width: 100%;
        }

        .skill-item {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .sortable-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .sortable-label {
          margin-top: 1px;
        }

        .drag-handle {
          cursor: grab;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.04);
          color: #e2e8f0;
          font-size: 14px;
          transition: background 0.2s ease, border 0.2s ease, transform 0.2s ease;
          opacity: 0.4;
        }

        .drag-handle.small {
          width: 22px;
          height: 22px;
          font-size: 12px;
        }

        .inline-row:hover .drag-handle,
        .inline-row:focus-within .drag-handle,
        .sortable-header:hover .drag-handle,
        .sortable-header:focus-within .drag-handle {
          opacity: 1;
        }

        .drag-handle:focus-visible {
          outline: 2px solid rgba(96, 165, 250, 0.7);
          outline-offset: 2px;
        }

        .drag-handle:active {
          cursor: grabbing;
          transform: scale(0.96);
        }

        @media (max-width: 1100px) {
          .trv-preview-grid {
            grid-template-columns: 1fr;
          }
        }

        .trv-section {
          padding: 1rem;
          background: var(--bg);
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .trv-section h4 {
          margin: 0 0 1rem 0;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--primary);
        }

        .trv-summary {
          line-height: 1.6;
          color: #e2e8f0;
          margin: 0;
        }

        .trv-skills {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .skill-row {
          display: flex;
          gap: 0.5rem;
          font-size: 13px;
        }

        .trv-experience,
        .trv-project,
        .trv-education {
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .trv-experience:last-child,
        .trv-project:last-child,
        .trv-education:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .exp-header,
        .proj-header,
        .edu-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
          gap: 1rem;
        }

        .exp-company,
        .proj-name,
        .edu-school {
          font-weight: 600;
          color: #e2e8f0;
          flex: 1;
        }

        .exp-title-text,
        .edu-degree-text {
          font-weight: 500;
          color: #e2e8f0;
          flex: 1;
        }

        .exp-dates,
        .proj-date,
        .edu-dates {
          color: var(--muted);
          font-size: 13px;
          text-align: right;
          max-width: 160px;
          flex: 0 0 160px;
        }

        .exp-title,
        .edu-degree {
          color: #e2e8f0;
          font-size: 14px;
          margin-bottom: 0.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .exp-location,
        .edu-gpa {
          color: var(--muted);
          text-align: right;
          max-width: 160px;
          flex: 0 0 160px;
        }

        .skill-text {
          font-size: 13px;
        }

        .exp-bullets,
        .proj-bullets {
          margin: 0.5rem 0 0 1rem;
          padding: 0;
          list-style: disc;
        }

        .exp-bullets li,
        .proj-bullets li {
          margin-bottom: 0.5rem;
          line-height: 1.5;
          color: #e2e8f0;
          font-size: 13px;
        }

        .exp-bullets li.rewritten,
        .proj-bullets li.rewritten {
          position: relative;
        }

        .rewrite-badge {
          display: inline-block;
          margin-left: 0.5rem;
          padding: 2px 6px;
          background: rgba(96, 165, 250, 0.2);
          color: var(--primary);
          border-radius: 4px;
          font-size: 10px;
          text-transform: uppercase;
        }

        .trv-awards {
          margin: 0;
          padding: 0 0 0 1rem;
          list-style: disc;
        }

        .trv-awards li {
          margin-bottom: 0.5rem;
          color: #e2e8f0;
          font-size: 13px;
        }

        .award-details {
          color: var(--muted);
        }

        .trv-bullets {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .bullets-header {
          padding: 0.5rem;
          border-bottom: 1px solid var(--border);
          margin-bottom: 0.5rem;
        }

        .bullet-unchanged {
          padding: 1rem;
          background: var(--bg);
          border-radius: 8px;
        }

        .trv-latex {
          display: flex;
          flex-direction: column;
        }

        .latex-code {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 1rem;
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
          color: #e2e8f0;
          max-height: 500px;
          overflow-y: auto;
        }

      `}</style>
    </div>
  );
}
