"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { renderRichText } from "@/utils/renderRichText";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { generateResumeLatex } from "@/lib/latexGenerator";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdvancedAccordion,
  DensityToggle,
  DiffCard,
  DiffExplorerToolbar,
  SectionCard,
} from "@/components/RunDetailsComponents";

interface TailoredResume {
  _id: Id<"tailoredResumes">;
  runId: Id<"runs">;
  modelKey: string;
  modelName: string;
  summary: string;
  coverLetter?: string;
  diagnostics?: string;
  reasoningSummary?: string;
  workExperience: Array<{
    roleId: string;
    company: string;
    title: string;
    dateRange: string;
    location?: string;
    bullets: Array<{
      bulletId: string;
      originalText: string;
      tailoredText: string;
      wasRewritten: boolean;
    }>;
  }>;
  projects: Array<{
    projectId: string;
    name: string;
    date?: string;
    links?: string[];
    bullets: Array<{
      bulletId: string;
      originalText: string;
      tailoredText: string;
      wasRewritten: boolean;
    }>;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    dates: string;
    location?: string;
    gpa?: string;
  }>;
  skills: Record<string, string[]>;
  awards?: Array<{
    name: string;
    issuer: string;
    year: string;
    details?: string;
  }>;
  wordCountEstimate: number;
  selectionEnforcement: {
    strippedUnselected: number;
    truncatedBullets: number;
    repairApplied: boolean;
    compliant: boolean;
    proxyWordCountExceeded: boolean;
  };
  createdAt: number;
}

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
  artifacts: Artifact[];
  onArtifactCreated?: () => void;
  registerGeneratePdf?: (context: { trigger: () => Promise<void>; loading: boolean } | null) => void;
  activeTab?: "preview" | "bullets" | "latex" | "extras";
  onActiveTabChange?: (tab: "preview" | "bullets" | "latex" | "extras") => void;
}

type DensityMode = "comfortable" | "compact";

function formatSkillLabel(key: string): string {
  if (key === "other_skills") return "Other Skills";
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function extractKeywordChips(text: string, count = 3) {
  const words = text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 20);
  const unique = Array.from(new Set(words.map((word) => word.toLowerCase())));
  return unique.slice(0, count);
}

function estimateImpact(original: string, tailored: string, wasRewritten: boolean) {
  if (!wasRewritten) return "Low";
  const delta = Math.abs(tailored.length - original.length);
  if (delta > 60) return "High";
  if (delta > 20) return "Medium";
  return "Low";
}

function tokenDiff(base: string, compare: string, mode: "add" | "remove") {
  const baseTokens = base.split(/(\s+)/);
  const compareTokens = compare.split(/(\s+)/);
  return baseTokens.map((token, index) => {
    if (!token.trim()) return token;
    const compareToken = compareTokens[index] || "";
    const isDiff = compareToken.trim() && compareToken !== token;
    return (
      <span key={`${token}-${index}`} className={isDiff ? `diff-${mode}` : undefined}>
        {token}
      </span>
    );
  });
}

export default function TailoredResumeView({
  tailoredResume,
  masterResume,
  job,
  runId,
  artifacts,
  onArtifactCreated,
  registerGeneratePdf,
  activeTab: controlledActiveTab,
  onActiveTabChange,
}: TailoredResumeViewProps) {
  const [internalTab, setInternalTab] =
    useState<"preview" | "bullets" | "latex" | "extras">("preview");
  const activeTab = controlledActiveTab ?? internalTab;
  const setActiveTab = useCallback(
    (tab: "preview" | "bullets" | "latex" | "extras") => {
      onActiveTabChange?.(tab);
      if (!controlledActiveTab) {
        setInternalTab(tab);
      }
    },
    [controlledActiveTab, onActiveTabChange]
  );
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showDifferences, setShowDifferences] = useState(true);
  const [onlyModified, setOnlyModified] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All sections");
  const [companyFilter, setCompanyFilter] = useState("All companies");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [latex, setLatex] = useState("");
  const [loadingLatex, setLoadingLatex] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingLatex, setSavingLatex] = useState(false);
  const [saveOkAt, setSaveOkAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [compilingLatex, setCompilingLatex] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const latexTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasExtras =
    Boolean(tailoredResume.coverLetter?.trim()) ||
    Boolean(tailoredResume.diagnostics?.trim()) ||
    Boolean(tailoredResume.reasoningSummary?.trim());

  const generateUploadUrl = useMutation(api.runDetails.generateUploadUrl);
  const storeArtifact = useMutation(api.runDetails.storeArtifact);

  // Generate LaTeX from tailored resume
  const latexContent = useMemo(() => {
    const resumeLinks = Array.isArray(masterResume?.links)
      ? { headerLinks: {}, projectLinks: [], allLinks: masterResume?.links }
      : masterResume?.links;

    const resume = {
      header: masterResume?.header,
      summary: tailoredResume.summary,
      skills: tailoredResume.skills,
      education: tailoredResume.education,
      awards: tailoredResume.awards,
      links: resumeLinks,
    };

    const projectLinks = new Map<string, string[]>();
    (resumeLinks?.projectLinks || []).forEach((entry) => {
      if (entry.projectName && entry.links.length > 0) {
        projectLinks.set(entry.projectName.toLowerCase(), entry.links);
      }
    });

    const workExperiences = tailoredResume.workExperience.map((exp) => ({
      company: exp.company,
      role: exp.title,
      dates: exp.dateRange,
      location: exp.location,
      bullets: exp.bullets.map((b) => ({ text: b.tailoredText })),
    }));

    const projects = tailoredResume.projects.map((proj) => {
      const normalizedProjectName = (proj.name || "").toLowerCase();
      const fallbackLinks = projectLinks.get(normalizedProjectName);
      const resolvedLinks =
        Array.isArray(proj.links) && proj.links.length > 0 ? proj.links : fallbackLinks;
      return {
        name: proj.name,
        dates: proj.date || proj.dates,
        links: resolvedLinks,
        bullets: proj.bullets.map((b) => ({ text: b.tailoredText })),
      };
    });

    return generateResumeLatex(resume, workExperiences, projects);
  }, [tailoredResume, masterResume]);

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

  const bulletItems = useMemo(() => {
    type BulletItem = {
      id: string;
      section: "Work Experience" | "Projects";
      company: string;
      role: string;
      wasRewritten: boolean;
      originalText: string;
      tailoredText: string;
    };

    const items: BulletItem[] = [];
    tailoredResume.workExperience.forEach((exp, expIndex) => {
      exp.bullets.forEach((bullet, bulletIndex) => {
        items.push({
          id: `${exp.roleId || expIndex}-${bullet.bulletId || bulletIndex}`,
          section: "Work Experience",
          company: exp.company,
          role: exp.title,
          wasRewritten: bullet.wasRewritten,
          originalText: bullet.originalText,
          tailoredText: bullet.tailoredText,
        });
      });
    });

    tailoredResume.projects.forEach((proj, projIndex) => {
      proj.bullets.forEach((bullet, bulletIndex) => {
        items.push({
          id: `${proj.projectId || projIndex}-${bullet.bulletId || bulletIndex}`,
          section: "Projects",
          company: proj.name,
          role: "Project",
          wasRewritten: bullet.wasRewritten,
          originalText: bullet.originalText,
          tailoredText: bullet.tailoredText,
        });
      });
    });

    return items;
  }, [tailoredResume]);

  const sectionOptions = useMemo(() => {
    const sections = new Set(bulletItems.map((item) => item.section));
    return ["All sections", ...Array.from(sections)];
  }, [bulletItems]);

  const companyOptions = useMemo(() => {
    const companies = new Set(bulletItems.map((item) => item.company).filter(Boolean));
    return ["All companies", ...Array.from(companies)];
  }, [bulletItems]);

  const filteredBullets = useMemo(() => {
    return bulletItems.filter((bullet) => {
      if (onlyModified && !bullet.wasRewritten) return false;
      if (sectionFilter !== "All sections" && bullet.section !== sectionFilter) return false;
      if (companyFilter !== "All companies" && bullet.company !== companyFilter) return false;
      if (searchValue.trim()) {
        const haystack = `${bullet.originalText} ${bullet.tailoredText}`.toLowerCase();
        if (!haystack.includes(searchValue.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [bulletItems, companyFilter, onlyModified, searchValue, sectionFilter]);

  // Check if a saved LaTeX artifact already exists
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
  const lastLoadedLatex = useRef<string>("");

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

  // Handle PDF generation and download
  const handleGeneratePdf = useCallback(async (download = true, store = true) => {
    setGeneratingPdf(true);
    setPdfError(null);

    // #region agent log
    const generatedFilename = generateFilename();
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TailoredResumeView.tsx:195',message:'handleGeneratePdf entry with full name',data:{fullName:masterResume?.header?.fullName,jobTitle:job?.title,jobCompany:job?.company,generatedFilename,download,store},timestamp:Date.now(),sessionId:'debug-session',runId:'fullname-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    try {

      // Call our PDF generation API
      const response = await fetch("/api/generate-pdf", {
        method: download ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex,
          filename: generatedFilename,
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
        const downloadFilename = `${generatedFilename}.pdf`;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TailoredResumeView.tsx:226',message:'download filename with full name',data:{downloadFilename,fullName:masterResume?.header?.fullName,jobTitle:job?.title,jobCompany:job?.company},timestamp:Date.now(),sessionId:'debug-session',runId:'fullname-fix',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
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
            latex,
            filename: generatedFilename,
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
  }, [latex, job, masterResume, runId, tailoredResume.modelKey, generateUploadUrl, storeArtifact, onArtifactCreated, generateFilename]);

  // Handle LaTeX download
  const handleDownloadLatex = useCallback(async () => {
    const blob = new Blob([latex], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${job?.company || "company"}_${job?.title || "resume"}_tailored.tex`.replace(
      /[^a-zA-Z0-9_.-]/g,
      "_"
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Store to Convex
    try {
      const uploadUrl = await generateUploadUrl();
      const texBlob = new Blob([latex], { type: "application/x-tex" });

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
          fileName: `${job?.company || "company"}_${job?.title || "resume"}_tailored.tex`.replace(/[^a-zA-Z0-9_.-]/g, "_"),
          storageId,
          mimeType: "application/x-tex",
          sizeBytes: texBlob.size,
        });
        onArtifactCreated?.();
      }
    } catch (error) {
      console.error("Failed to store LaTeX:", error);
    }
  }, [latex, job, runId, tailoredResume.modelKey, generateUploadUrl, storeArtifact, onArtifactCreated]);

  // Copy LaTeX to clipboard
  const handleCopyLatex = useCallback(() => {
    navigator.clipboard.writeText(latex);
  }, [latex]);

  const isLatexDirty = latex !== lastLoadedLatex.current;

  const loadLatexSource = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force && isLatexDirty) return;
      if (latestTex && texUrl === undefined) return;
      setLoadError(null);
      if (force) {
        setSaveError(null);
        setSaveOkAt(null);
        setCompileError(null);
        if (pdfPreviewUrl) {
          URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl(null);
        }
      }
      if (!texUrl) {
        setLatex(latexContent);
        lastLoadedLatex.current = latexContent;
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
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load LaTeX");
        setLatex(latexContent);
        lastLoadedLatex.current = latexContent;
      } finally {
        setLoadingLatex(false);
      }
    },
    [isLatexDirty, latexContent, latestTex, pdfPreviewUrl, texUrl]
  );

  const handleSaveLatex = useCallback(async () => {
    setSaveError(null);
    setSaveOkAt(null);
    setCompileError(null);
    setSavingLatex(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const texBlob = new Blob([latex], { type: "application/x-tex" });
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-tex" },
        body: texBlob,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload LaTeX");
      }

      const { storageId } = await uploadResponse.json();
      const fileName = `${generateFilename()}.tex`;
      await storeArtifact({
        runId,
        modelKey: tailoredResume.modelKey,
        artifactType: "tex",
        fileName,
        storageId,
        mimeType: "application/x-tex",
        sizeBytes: texBlob.size,
      });
      lastLoadedLatex.current = latex;
      setSaveOkAt(new Date().toISOString());
      onArtifactCreated?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save LaTeX");
    } finally {
      setSavingLatex(false);
    }
  }, [generateUploadUrl, generateFilename, latex, onArtifactCreated, runId, storeArtifact, tailoredResume.modelKey]);

  const handleCompilePreview = useCallback(async () => {
    setCompileError(null);
    setCompilingLatex(true);
    try {
      const response = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latex,
          filename: generateFilename(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to compile PDF");
      }

      const blob = await response.blob();
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      const nextUrl = URL.createObjectURL(blob);
      setPdfPreviewUrl(nextUrl);
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "Failed to compile PDF");
    } finally {
      setCompilingLatex(false);
    }
  }, [generateFilename, latex, pdfPreviewUrl]);

  const handleResetLatex = useCallback(() => {
    setLatex(lastLoadedLatex.current);
    setSaveError(null);
    setSaveOkAt(null);
    setCompileError(null);
  }, []);

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
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isLatexDirty) return;
      event.preventDefault();
      event.returnValue = "You have unsaved changes. Are you sure you want to leave?";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isLatexDirty]);

  const compileState = useMemo(() => {
    if (compilingLatex) return "Compiling";
    if (compileError) return "Failed";
    if (pdfPreviewUrl) return "Success";
    return "Idle";
  }, [compileError, compilingLatex, pdfPreviewUrl]);

  const jumpToLatexSection = useCallback(
    (label: string) => {
      if (!latexTextareaRef.current) return;
      const patterns = [`\\\\section{${label}}`, `\\\\section*{${label}}`];
      const match = patterns.find((pattern) => latex.includes(pattern));
      if (!match) return;
      const index = latex.indexOf(match);
      latexTextareaRef.current.focus();
      latexTextareaRef.current.setSelectionRange(index, index + match.length);
      const lineIndex = latex.slice(0, index).split("\n").length - 1;
      latexTextareaRef.current.scrollTop = lineIndex * 18;
    },
    [latex]
  );

  const handleCopyCoverLetter = useCallback(() => {
    if (tailoredResume.coverLetter) {
      navigator.clipboard.writeText(tailoredResume.coverLetter);
    }
  }, [tailoredResume.coverLetter]);

  const handleDownloadCoverLetter = useCallback(() => {
    if (!tailoredResume.coverLetter) return;
    const blob = new Blob([tailoredResume.coverLetter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${generateFilename()}_cover-letter.txt`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generateFilename, tailoredResume.coverLetter]);

  const handleRegenerateCoverLetter = useCallback(() => {
    console.info("Regenerate cover letter clicked.");
  }, []);

  const handleBulletAction = useCallback((action: string, bulletId: string) => {
    console.info(`Bullet action: ${action}`, bulletId);
  }, []);

  return (
    <div className="tailored-resume-view">
      <div className="trv-header">
        <div className="trv-meta">
          <div className="trv-title-row">
            <h2>Tailored Resume</h2>
            <span className="badge subtle">{tailoredResume.modelName}</span>
            <span className="badge subtle">~{tailoredResume.wordCountEstimate} words</span>
            <span className={`badge ${modificationStats.rewrittenBullets > 0 ? "modified" : "subtle"}`}>
              {modificationStats.rewrittenBullets}/{modificationStats.totalBullets} rewritten
            </span>
          </div>
          <p className="trv-subtitle">
            Generated {new Date(tailoredResume.createdAt).toLocaleString()}
          </p>
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
                Exporting...
              </>
            ) : (
              "Download PDF"
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

      <div className="trv-tabs subtle-tabs">
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
        <button
          className={`trv-tab ${activeTab === "latex" ? "active" : ""}`}
          onClick={() => setActiveTab("latex")}
        >
          LaTeX Source
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

      <div className="trv-content">
        {activeTab === "preview" && (
          <div className={`trv-preview density-${density}`}>
            <div className="trv-toolbar">
              <DensityToggle value={density} onChange={setDensity} label="Preview density" />
            </div>

            <SectionCard title="Summary" collapsible defaultOpen>
              <div className="trv-summary">{renderRichText(tailoredResume.summary)}</div>
            </SectionCard>

            <SectionCard
              title="Skills"
              collapsible
              defaultOpen
              actions={
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => setSkillsExpanded((prev) => !prev)}
                >
                  {skillsExpanded ? "Show less" : "Show all"}
                </button>
              }
            >
              <div className="skills-grid">
                {Object.entries(tailoredResume.skills || {}).map(([category, items]) => {
                  if (!Array.isArray(items) || items.length === 0) return null;
                  const visibleItems = skillsExpanded ? items : items.slice(0, 6);
                  return (
                    <div className="skill-card" key={category}>
                      <span className="skill-label">{formatSkillLabel(category)}</span>
                      <div className="skill-chips">
                        {visibleItems.map((item) => (
                          <span key={item} className="skill-chip">
                            {item}
                          </span>
                        ))}
                        {!skillsExpanded && items.length > visibleItems.length && (
                          <span className="skill-chip muted">+{items.length - visibleItems.length} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Work Experience" collapsible defaultOpen>
              <div className="experience-stack">
                {tailoredResume.workExperience.map((exp, idx) => (
                  <div key={exp.roleId || idx} className="experience-card">
                    <div className="experience-head">
                      <div>
                        <strong>{exp.company}</strong>
                        <div className="experience-title">
                          {exp.title}
                          {exp.location && <span> • {exp.location}</span>}
                        </div>
                      </div>
                      <span className="experience-dates">{exp.dateRange}</span>
                    </div>
                    <ul className="experience-bullets">
                      {exp.bullets.map((bullet, bIdx) => (
                        <li key={bullet.bulletId || bIdx}>
                          {renderRichText(bullet.tailoredText)}
                          {bullet.wasRewritten && <span className="rewrite-pill">modified</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </SectionCard>

            {tailoredResume.projects.length > 0 && (
              <SectionCard title="Projects" collapsible defaultOpen>
                <div className="experience-stack">
                  {tailoredResume.projects.map((proj, idx) => (
                    <div key={proj.projectId || idx} className="experience-card">
                      <div className="experience-head">
                        <div>
                          <strong>{proj.name}</strong>
                          <div className="experience-title">Project</div>
                        </div>
                        {proj.date && <span className="experience-dates">{proj.date}</span>}
                      </div>
                      <ul className="experience-bullets">
                        {proj.bullets.map((bullet, bIdx) => (
                          <li key={bullet.bulletId || bIdx}>
                            {renderRichText(bullet.tailoredText)}
                            {bullet.wasRewritten && <span className="rewrite-pill">modified</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            <SectionCard title="Education" collapsible defaultOpen={false}>
              <div className="education-grid">
                {tailoredResume.education.map((edu, idx) => (
                  <div key={idx} className="education-card">
                    <div className="education-head">
                      <strong>{edu.institution}</strong>
                      <span className="education-dates">{edu.dates}</span>
                    </div>
                    <div className="education-degree">
                      {edu.degree}
                      {edu.gpa && <span> • GPA: {edu.gpa}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            {tailoredResume.awards && tailoredResume.awards.length > 0 && (
              <SectionCard title="Awards & Achievements" collapsible defaultOpen={false}>
                <ul className="awards-list">
                  {tailoredResume.awards.map((award, idx) => (
                    <li key={idx}>
                      <strong>{award.name}</strong> — {award.issuer} ({award.year})
                      {award.details && <span className="muted"> — {award.details}</span>}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
          </div>
        )}

        {activeTab === "bullets" && (
          <div className={`trv-bullets density-${density}`}>
            <DiffExplorerToolbar
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              sectionFilter={sectionFilter}
              onSectionFilterChange={setSectionFilter}
              companyFilter={companyFilter}
              onCompanyFilterChange={setCompanyFilter}
              onlyModified={onlyModified}
              onOnlyModifiedChange={setOnlyModified}
              showDifferences={showDifferences}
              onShowDifferencesChange={setShowDifferences}
              density={density}
              onDensityChange={setDensity}
              sectionOptions={sectionOptions}
              companyOptions={companyOptions}
            />

            <div className="diff-list">
              {filteredBullets.map((bullet) => {
                const summary = truncateText(bullet.tailoredText || bullet.originalText, 140);
                const chips = [
                  bullet.section,
                  bullet.company,
                  ...extractKeywordChips(bullet.tailoredText),
                ].filter(Boolean);
                const impact = estimateImpact(
                  bullet.originalText,
                  bullet.tailoredText,
                  bullet.wasRewritten
                );
                const originalNode = showDifferences
                  ? tokenDiff(bullet.originalText, bullet.tailoredText, "remove")
                  : renderRichText(bullet.originalText);
                const tailoredNode = showDifferences
                  ? tokenDiff(bullet.tailoredText, bullet.originalText, "add")
                  : renderRichText(bullet.tailoredText);

                return (
                  <DiffCard
                    key={bullet.id}
                    summary={summary}
                    chips={chips}
                    impact={impact}
                    wasRewritten={bullet.wasRewritten}
                    original={originalNode}
                    tailored={tailoredNode}
                    onEdit={() => handleBulletAction("edit", bullet.id)}
                    onRevert={() => handleBulletAction("revert", bullet.id)}
                    onAccept={() => handleBulletAction("accept", bullet.id)}
                  />
                );
              })}
            </div>

            {filteredBullets.length === 0 && (
              <div className="empty-state-container">
                <div className="empty-state-icon">🧭</div>
                <h3>No Bullet Changes Found</h3>
                <p className="hint">Try clearing filters or switching off “Only modified”.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "latex" && (
          <div className="trv-latex">
            <div className="latex-header">
              <div>
                <h3>LaTeX Source</h3>
                <p className="hint">
                  Edit the LaTeX source, save your changes, and compile to preview the PDF.
                </p>
              </div>
              <div className={`compile-pill ${compileState.toLowerCase()}`}>
                {compileState}
              </div>
              <div className="latex-actions">
                <button className="ghost" onClick={() => loadLatexSource({ force: true })} disabled={loadingLatex}>
                  Reload source
                </button>
                <button className="ghost" onClick={handleResetLatex} disabled={!isLatexDirty}>
                  Reset edits
                </button>
                <button className="ghost" onClick={handleCopyLatex} disabled={!latex}>
                  Copy
                </button>
                <button className="ghost" onClick={handleDownloadLatex} disabled={!latex}>
                  Download .tex
                </button>
                <button className="ghost" onClick={handleSaveLatex} disabled={savingLatex || !isLatexDirty}>
                  {savingLatex ? "Saving..." : "Save"}
                </button>
                <button
                  className="primary"
                  onClick={handleCompilePreview}
                  disabled={compilingLatex || !latex}
                >
                  {compilingLatex ? "Compiling..." : "Compile PDF"}
                </button>
              </div>
              <div className="latex-outline">
                <span className="muted">Jump to:</span>
                {["Summary", "Skills", "Experience", "Projects", "Education", "Awards"].map((label) => (
                  <button key={label} className="ghost small" type="button" onClick={() => jumpToLatexSection(label)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(loadError || saveError) && (
              <div className="warning-box" style={{ marginBottom: "12px" }}>
                {loadError && <div>Load error: {loadError}</div>}
                {saveError && <div>Save error: {saveError}</div>}
              </div>
            )}

            {compileError && (
              <details className="latex-error-panel" open>
                <summary>Compile errors</summary>
                <pre>{compileError}</pre>
              </details>
            )}

            {saveOkAt ? (
              <div className="meta" style={{ marginBottom: "12px" }}>
                Saved at {new Date(saveOkAt).toLocaleString()}
                {isLatexDirty ? " (unsaved edits present)" : ""}
              </div>
            ) : (
              <div className="meta" style={{ marginBottom: "12px" }}>
                {isLatexDirty ? "Unsaved edits present" : latestTex ? "Loaded saved LaTeX" : "Using generated LaTeX"}
              </div>
            )}

            <div className="latex-split">
              <div className="latex-pane">
                <div className="latex-pane-head">
                  <strong>resume.tex</strong>
                  <span className="hint">{loadingLatex ? "Loading..." : isLatexDirty ? "● Unsaved" : "Edit LaTeX"}</span>
                </div>
                <div className="latex-textarea-wrap">
                  <textarea
                    ref={latexTextareaRef}
                    className="latex-textarea"
                    value={latex}
                    onChange={(e) => setLatex(e.target.value)}
                    spellCheck={false}
                    placeholder={loadingLatex ? "Loading LaTeX..." : "LaTeX source will appear here."}
                    disabled={loadingLatex}
                  />
                </div>
              </div>

              <div className="latex-pane">
                <div className="latex-pane-head">
                  <strong>PDF Preview</strong>
                  <span className="hint">
                    {pdfPreviewUrl ? "✓ Compiled" : compilingLatex ? "Compiling..." : "Ready"}
                  </span>
                </div>
                <div className="latex-preview" aria-busy={compilingLatex}>
                  {pdfPreviewUrl ? (
                    <iframe title="PDF preview" src={pdfPreviewUrl} />
                  ) : (
                    <div className="pdf-empty-state">
                      <div className="pdf-empty-icon">
                        {compilingLatex ? "⏳" : "📄"}
                      </div>
                      <div className="pdf-empty-title">
                        {compilingLatex ? "Compiling PDF..." : "No Preview Yet"}
                      </div>
                      <div className="pdf-empty-hint">
                        {compilingLatex ? "This may take a few seconds" : "Click 'Compile PDF' to generate preview"}
                      </div>
                      {!compilingLatex && latex && (
                        <button className="primary" onClick={handleCompilePreview} style={{ marginTop: 16 }}>
                          Compile PDF
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isLatexDirty && (
              <div className="unsaved-banner">
                <span>⚠️ You have unsaved changes</span>
                <button className="ghost small" onClick={handleSaveLatex} disabled={savingLatex}>
                  {savingLatex ? "Saving..." : "Save Now"}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "extras" && hasExtras && (
          <div className="trv-extras">
            {tailoredResume.coverLetter?.trim() && (
              <SectionCard
                title="Cover Letter"
                actions={
                  <div className="inline-actions">
                    <button className="ghost small" type="button" onClick={handleCopyCoverLetter}>
                      Copy
                    </button>
                    <button className="ghost small" type="button" onClick={handleDownloadCoverLetter}>
                      Download
                    </button>
                    <button className="ghost small" type="button" onClick={handleRegenerateCoverLetter}>
                      Regenerate
                    </button>
                  </div>
                }
              >
                <div className="document-viewer">{renderRichText(tailoredResume.coverLetter)}</div>
              </SectionCard>
            )}

            {(tailoredResume.diagnostics?.trim() || tailoredResume.reasoningSummary?.trim()) && (
              <AdvancedAccordion title="Advanced details">
                {tailoredResume.diagnostics?.trim() && (
                  <div className="advanced-block">
                    <h4>Diagnostics</h4>
                    <pre>{tailoredResume.diagnostics}</pre>
                  </div>
                )}
                {tailoredResume.reasoningSummary?.trim() && (
                  <div className="advanced-block">
                    <h4>Reasoning Summary</h4>
                    <pre>{tailoredResume.reasoningSummary}</pre>
                  </div>
                )}
              </AdvancedAccordion>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
