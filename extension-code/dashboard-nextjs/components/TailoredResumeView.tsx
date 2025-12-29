"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { renderRichText } from "@/utils/renderRichText";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { generateResumeLatex } from "@/lib/latexGenerator";
import type { Id } from "@/convex/_generated/dataModel";

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
}

function formatSkillLabel(key: string): string {
  if (key === "other_skills") return "Other Skills";
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function TailoredResumeView({
  tailoredResume,
  masterResume,
  job,
  runId,
  artifacts,
  onArtifactCreated,
  registerGeneratePdf,
}: TailoredResumeViewProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "bullets" | "latex" | "extras">("preview");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(true);
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

  // Check if artifacts already exist
  const existingPdf = artifacts.find((a) => a.artifactType === "pdf");
  const existingTex = artifacts.find((a) => a.artifactType === "tex");

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
          latex: latexContent,
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
            latex: latexContent,
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
  }, [latexContent, job, masterResume, runId, tailoredResume.modelKey, generateUploadUrl, storeArtifact, onArtifactCreated, generateFilename]);

  // Handle LaTeX download
  const handleDownloadLatex = useCallback(async () => {
    const blob = new Blob([latexContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${job?.company || "company"}_${job?.title || "resume"}_tailored.tex`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Store to Convex
    try {
      const uploadUrl = await generateUploadUrl();
      const texBlob = new Blob([latexContent], { type: "application/x-tex" });

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
          sizeBytes: latexContent.length,
        });
        onArtifactCreated?.();
      }
    } catch (error) {
      console.error("Failed to store LaTeX:", error);
    }
  }, [latexContent, job, runId, tailoredResume.modelKey, generateUploadUrl, storeArtifact, onArtifactCreated]);

  // Copy LaTeX to clipboard
  const handleCopyLatex = useCallback(() => {
    navigator.clipboard.writeText(latexContent);
  }, [latexContent]);

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

      {/* Tab Content */}
      <div className="trv-content">
        {activeTab === "preview" && (
          <div className="trv-preview">
            {/* Summary */}
            <div className="trv-section">
              <h4>Summary</h4>
              <p className="trv-summary">{renderRichText(tailoredResume.summary)}</p>
            </div>

            {/* Skills */}
            <div className="trv-section">
              <h4>Skills</h4>
              <div className="trv-skills">
                {Object.entries(tailoredResume.skills || {}).map(([category, items]) => {
                  if (!Array.isArray(items) || items.length === 0) return null;
                  return (
                    <div className="skill-row" key={category}>
                      <span className="skill-label">{formatSkillLabel(category)}:</span>
                      <span className="skill-list">{items.join(", ")}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Work Experience */}
            <div className="trv-section">
              <h4>Work Experience</h4>
              {tailoredResume.workExperience.map((exp, idx) => (
                <div key={exp.roleId || idx} className="trv-experience">
                  <div className="exp-header">
                    <strong>{exp.company}</strong>
                    <span className="exp-dates">{exp.dateRange}</span>
                  </div>
                  <div className="exp-title">
                    {exp.title}
                    {exp.location && <span className="exp-location"> • {exp.location}</span>}
                  </div>
                      <ul className="exp-bullets">
                        {exp.bullets.map((bullet, bIdx) => (
                          <li key={bullet.bulletId || bIdx} className={bullet.wasRewritten ? "rewritten" : ""}>
                            {renderRichText(bullet.tailoredText)}
                            {bullet.wasRewritten && <span className="rewrite-badge">modified</span>}
                          </li>
                        ))}
                      </ul>
                </div>
              ))}
            </div>

            {/* Projects */}
            {tailoredResume.projects.length > 0 && (
              <div className="trv-section">
                <h4>Projects</h4>
                {tailoredResume.projects.map((proj, idx) => (
                  <div key={proj.projectId || idx} className="trv-project">
                    <div className="proj-header">
                      <strong>{proj.name}</strong>
                      {proj.date && <span className="proj-date">{proj.date}</span>}
                    </div>
                    <ul className="proj-bullets">
                      {proj.bullets.map((bullet, bIdx) => (
                        <li key={bullet.bulletId || bIdx} className={bullet.wasRewritten ? "rewritten" : ""}>
                          {renderRichText(bullet.tailoredText)}
                          {bullet.wasRewritten && <span className="rewrite-badge">modified</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* Education */}
            <div className="trv-section">
              <h4>Education</h4>
              {tailoredResume.education.map((edu, idx) => (
                <div key={idx} className="trv-education">
                  <div className="edu-header">
                    <strong>{edu.institution}</strong>
                    <span className="edu-dates">{edu.dates}</span>
                  </div>
                  <div className="edu-degree">
                    {edu.degree}
                    {edu.gpa && <span className="edu-gpa"> • GPA: {edu.gpa}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Awards */}
            {tailoredResume.awards && tailoredResume.awards.length > 0 && (
              <div className="trv-section">
                <h4>Awards & Achievements</h4>
                <ul className="trv-awards">
                  {tailoredResume.awards.map((award, idx) => (
                    <li key={idx}>
                      <strong>{award.name}</strong> - {award.issuer} ({award.year})
                      {award.details && <span className="award-details"> - {award.details}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                <p className="hint">No bullets were rewritten for this job. Uncheck "Show differences" to see all bullets.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "latex" && (
          <div className="trv-latex">
            <div className="latex-actions" style={{ marginBottom: "1rem" }}>
              <button className="ghost small" onClick={handleCopyLatex}>
                Copy to Clipboard
              </button>
              <button className="ghost small" onClick={handleDownloadLatex}>
                Download .tex
              </button>
            </div>
            <pre className="latex-code">{latexContent}</pre>
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

      {/* Existing Artifacts */}
      {artifacts.length > 0 && (
        <div className="trv-artifacts">
          <h4>Generated Artifacts</h4>
          <div className="downloads-grid">
            {artifacts.map((artifact) => (
              <div key={artifact._id} className="download-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    {artifact.artifactType.toUpperCase()} - {artifact.fileName}
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

        .trv-preview {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
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

        .skill-label {
          color: var(--muted);
          min-width: 100px;
          flex-shrink: 0;
        }

        .skill-list {
          color: #e2e8f0;
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
        }

        .exp-dates,
        .proj-date,
        .edu-dates {
          color: var(--muted);
          font-size: 13px;
        }

        .exp-title,
        .edu-degree {
          color: #e2e8f0;
          font-size: 14px;
          margin-bottom: 0.5rem;
        }

        .exp-location,
        .edu-gpa {
          color: var(--muted);
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

        .trv-artifacts {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--bg);
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .trv-artifacts h4 {
          margin: 0 0 0.5rem 0;
          font-size: 14px;
          color: var(--muted);
        }
      `}</style>
    </div>
  );
}
