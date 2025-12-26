import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  BACKEND_BASE_URL,
  deleteResume,
  listResumes,
  renameResume,
  setDefaultResume,
  uploadResume,
  uploadResumeLatex
} from "../api/bridge";
import type { ResumeMeta, ResumeState } from "../types";

const sampleTemplate = {
  id: "default",
  summary: "Example professional summary for a data/ML role. Replace with your own narrative and keywords.",
  skills: {
    programming_languages: ["Python", "SQL"],
    frameworks_libraries: ["Pandas", "scikit-learn", "PyTorch"],
    tools_cloud_technologies: ["AWS", "Docker", "Git"]
  },
  work_experience: [
    {
      id: "role_1",
      company: "Example Corp",
      role: "Data Scientist",
      dates: "2022 — Present",
      location: "Remote",
      bullets: [
        "Built and deployed ML models for customer retention; lifted retention by 8%.",
        "Partnered with product to instrument experiments and analyze results.",
        "Maintained ETL jobs with Airflow and SQL for weekly reporting."
      ]
    }
  ],
  projects: [
    {
      id: "proj_1",
      name: "LLM Assistant",
      date: "2024",
      keywords: ["LLM", "Retrieval", "TypeScript"],
      links: { github: "https://github.com/example/repo", webapp: "" },
      bullets: ["Implemented RAG pipeline with embeddings and vector search.", "Built prompt evaluation harness to reduce hallucinations by 20%."]
    }
  ],
  awards: []
};

const SettingsPage = () => {
  const [resumeState, setResumeState] = useState<ResumeState>({ defaultId: null, selectedId: null, resumes: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [latexUploadError, setLatexUploadError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<{ id: string; label: string }>({ id: "", label: "" });
  const [latexUploadingId, setLatexUploadingId] = useState<string | null>(null);

  const applyState = (state: ResumeState) => {
    setResumeState(state);
    setRenameTarget(null);
    setRenameDraft({ id: "", label: "" });
    setLatexUploadError(null);
  };

  const loadResumes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await listResumes();
      applyState(state);
    } catch (err: any) {
      if (err?.resume_state) {
        applyState(err.resume_state);
      }
      setError(err.message || "Unable to load resumes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  const sortedResumes = useMemo(() => {
    const list = [...(resumeState.resumes || [])];
    list.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const aTime = a.updatedAt || a.createdAt || "";
      const bTime = b.updatedAt || b.createdAt || "";
      return bTime.localeCompare(aTime);
    });
    return list;
  }, [resumeState.resumes]);

  const actionsDisabled = Boolean(error?.toLowerCase().includes("offline"));

  const handleDownloadTemplate = async () => {
    const fallback = JSON.stringify(sampleTemplate, null, 2);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/resumes/files/default.json`);
      const blob = res.ok ? await res.blob() : new Blob([fallback], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "resume_template.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const blob = new Blob([fallback], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "resume_template.json";
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const text = await file.text();
      JSON.parse(text);
      const stem = file.name.replace(/\.json$/i, "");
      const nextState = await uploadResume(text, { id: stem || undefined, label: stem || undefined });
      applyState(nextState);
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleUpload(file);
    event.target.value = "";
  };

  const handleLatexUpload = async (resumeId: string, file: File) => {
    setLatexUploadingId(resumeId);
    setLatexUploadError(null);
    try {
      const text = await file.text();
      const nextState = await uploadResumeLatex(resumeId, text);
      applyState(nextState);
    } catch (err: any) {
      setLatexUploadError(err.message || "LaTeX upload failed");
    } finally {
      setLatexUploadingId(null);
    }
  };

  const handleLatexFileChange = (resumeId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleLatexUpload(resumeId, file);
    event.target.value = "";
  };

  const handleSetDefault = async (resume: ResumeMeta) => {
    try {
      const next = await setDefaultResume(resume.id);
      applyState(next);
    } catch (err: any) {
      setError(err.message || "Unable to set default resume");
    }
  };

  const handleDelete = async (resume: ResumeMeta) => {
    if (resume.isDefault && (resumeState.resumes?.length || 0) <= 1) {
      setError("Cannot delete the only default resume.");
      return;
    }
    if (!window.confirm(`Delete ${resume.label || resume.id}?`)) return;
    try {
      const next = await deleteResume(resume.id);
      applyState(next);
    } catch (err: any) {
      setError(err.message || "Delete failed");
    }
  };

  const startRename = (resume: ResumeMeta) => {
    setRenameTarget(resume.id);
    setRenameDraft({ id: resume.id, label: resume.label });
  };

  const handleRenameSave = async (originalId: string) => {
    try {
      const newId = renameDraft.id.trim() || originalId;
      const label = renameDraft.label.trim() || newId;
      const next = await renameResume(originalId, newId, label);
      applyState(next);
    } catch (err: any) {
      setError(err.message || "Rename failed");
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch (e) {
      return value;
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Master Resumes</h2>
          <p className="hint">Upload master resume JSON files and manage defaults.</p>
        </div>
        <div className="actions-inline">
          <button className="ghost small" type="button" onClick={handleDownloadTemplate}>
            Download template
          </button>
          <button className="ghost small" type="button" onClick={loadResumes} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="resume-upload">
        <div>
          <strong>Upload .json</strong>
          <p className="hint">Use the same schema as backend/resumes/default.json.</p>
        </div>
        <label className="upload-control">
          <input type="file" accept=".json,application/json" onChange={handleFileChange} disabled={uploading || actionsDisabled} />
          <span>{uploading ? "Uploading…" : "Choose JSON file"}</span>
        </label>
        {uploadError ? <p className="hint warn">{uploadError}</p> : null}
        {latexUploadError ? <p className="hint warn">{latexUploadError}</p> : null}
      </div>

      {error ? <div className="banner warn">{error}</div> : null}

      {loading ? (
        <div className="empty-state">Loading resumes…</div>
      ) : sortedResumes.length === 0 ? (
        <div className="empty-state">
          No resumes uploaded yet. Upload a master resume JSON to get started, or download the template above.
        </div>
      ) : (
        <div className="resume-table">
            <div className="resume-row head">
            <span>Name / ID</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          {sortedResumes.map((resume) => (
            <div key={resume.id} className="resume-row">
              <div className="resume-name">
                <div className="resume-title">
                  {resume.label || resume.id}
                  {resume.isDefault ? <span className="badge subtle">Default</span> : null}
                </div>
                <div className="hint">
                  ID: {resume.id} · LaTeX:{" "}
                  {resume.latexFile ? `Custom (${formatDate(resume.latexUpdatedAt)})` : "Default template"}
                </div>
              </div>
              <div className="resume-updated">{formatDate(resume.updatedAt || resume.createdAt)}</div>
              <div className="resume-actions">
                <input
                  type="file"
                  id={`latex-upload-${resume.id}`}
                  style={{ display: "none" }}
                  accept=".tex,application/x-tex,text/plain"
                  onChange={(e) => handleLatexFileChange(resume.id, e)}
                  disabled={actionsDisabled}
                />
                {renameTarget === resume.id ? (
                  <>
                    <input
                      type="text"
                      className="input"
                      value={renameDraft.label}
                      onChange={(e) => setRenameDraft((prev) => ({ ...prev, label: e.target.value }))}
                      placeholder="Label"
                    />
                    <input
                      type="text"
                      className="input"
                      value={renameDraft.id}
                      onChange={(e) => setRenameDraft((prev) => ({ ...prev, id: e.target.value }))}
                      placeholder="New id"
                    />
                    <button className="primary small" type="button" onClick={() => handleRenameSave(resume.id)} disabled={actionsDisabled}>
                      Save
                    </button>
                    <button className="ghost small" type="button" onClick={() => setRenameTarget(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => document.getElementById(`latex-upload-${resume.id}`)?.click()}
                      disabled={actionsDisabled || latexUploadingId === resume.id}
                    >
                      {latexUploadingId === resume.id ? "Uploading LaTeX…" : "Upload LaTeX"}
                    </button>
                    <button className="ghost small" type="button" onClick={() => startRename(resume)} disabled={actionsDisabled}>
                      Rename
                    </button>
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => handleSetDefault(resume)}
                      disabled={resume.isDefault || actionsDisabled}
                    >
                      Set default
                    </button>
                    <button
                      className="ghost small danger"
                      type="button"
                      onClick={() => handleDelete(resume)}
                      disabled={(resume.isDefault && sortedResumes.length <= 1) || actionsDisabled}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
