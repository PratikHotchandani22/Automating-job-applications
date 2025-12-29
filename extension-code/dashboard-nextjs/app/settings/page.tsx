"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import UserOnboarding from "@/components/UserOnboarding";
import ResumeEditor from "@/components/ResumeEditor";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
// Note: generateContentHash is async, we'll create it inline for now

export default function SettingsPage() {
  const { user: clerkUser } = useUser();
  const [showCreateResume, setShowCreateResume] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [renamingResumeId, setRenamingResumeId] = useState<Id<"masterResumes"> | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [deletingResumeId, setDeletingResumeId] = useState<Id<"masterResumes"> | null>(null);
  const [uploadStage, setUploadStage] = useState<
    | "idle"
    | "uploading_file"
    | "extracting_text"
    | "extracting_structured_resume"
    | "saving_to_database"
    | "done"
    | "failed"
  >("idle");
  const [processingResumeId, setProcessingResumeId] = useState<Id<"masterResumes"> | null>(null);
  const [editingResumeId, setEditingResumeId] = useState<Id<"masterResumes"> | null>(null);
  const [newlyCreatedResumeId, setNewlyCreatedResumeId] = useState<Id<"masterResumes"> | null>(null);
  
  // Get user from Convex using Clerk ID
  const user = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );

  // Get user's master resumes
  const resumes = useQuery(
    api.masterResumes.getMasterResumes,
    user ? { userId: user._id } : "skip"
  );

  // Get the resume being edited
  const editingResume = useQuery(
    api.masterResumes.getMasterResume,
    editingResumeId ? { resumeId: editingResumeId } : "skip"
  );

  const createResume = useMutation(api.masterResumes.createMasterResume);
  const createProcessingResume = useMutation((api as any).masterResumes.createProcessingResume);
  const setActiveResume = useMutation(api.masterResumes.setActiveMasterResume);
  const updateResume = useMutation(api.masterResumes.updateMasterResume);
  const deleteResume = useMutation(api.masterResumes.deleteMasterResume);
  const extractResumeData = useAction(api.resumeExtraction.extractResumeData);

  const processingResume = useQuery(
    api.masterResumes.getMasterResume,
    processingResumeId ? { resumeId: processingResumeId } : "skip"
  );
  const currentProcessingStatus = processingResume?.processingStatus || uploadStage;
  const isProcessing =
    currentProcessingStatus === "uploading_file" ||
    currentProcessingStatus === "extracting_text" ||
    currentProcessingStatus === "extracting_structured_resume" ||
    currentProcessingStatus === "saving_to_database";
  const hasProcessingFailed =
    uploadStage === "failed" || processingResume?.processingStatus === "failed";
  const processingFailureMessage =
    processingResume?.processingError || uploadError || "Processing failed.";
  const showUploadError = Boolean(uploadError) || hasProcessingFailed;

  const handleCreateResume = async () => {
    if (!user || !resumeName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      // Generate a simple content hash (in production, hash the actual resume content)
      // Using a simple hash for now - in production, use crypto.subtle.digest
      const contentHash = `${resumeName}-${Date.now()}`;
      
      await createResume({
        userId: user._id,
        name: resumeName,
        contentHash,
        isActive: resumes && resumes.length === 0, // Make first resume active
        skills: {},
        education: [],
      });

      setResumeName("");
      setShowCreateResume(false);
    } catch (error) {
      console.error("Error creating resume:", error);
      alert("Failed to create resume. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetActive = async (resumeId: any) => {
    if (!user) return;
    try {
      await setActiveResume({
        userId: user._id,
        resumeId,
      });
    } catch (error) {
      console.error("Error setting active resume:", error);
    }
  };

  const handleRenameStart = (resume: any) => {
    setRenamingResumeId(resume._id);
    setRenameValue(resume.name || "");
  };

  const handleRenameCancel = () => {
    setRenamingResumeId(null);
    setRenameValue("");
  };

  const handleRenameSave = async () => {
    if (!renamingResumeId || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      await updateResume({
        resumeId: renamingResumeId,
        name: renameValue.trim(),
      });
      handleRenameCancel();
    } catch (error) {
      console.error("Error renaming resume:", error);
      alert("Failed to rename resume. Please try again.");
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteResume = async (resumeId: Id<"masterResumes">) => {
    if (!confirm("Delete this resume? This action cannot be undone.")) return;
    setDeletingResumeId(resumeId);
    try {
      await deleteResume({ resumeId });
      if (editingResumeId === resumeId) {
        setEditingResumeId(null);
      }
      if (renamingResumeId === resumeId) {
        handleRenameCancel();
      }
    } catch (error) {
      console.error("Error deleting resume:", error);
      alert("Failed to delete resume. Please try again.");
    } finally {
      setDeletingResumeId(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    if (
      !(
        fileType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileType === "application/pdf" ||
        fileName.endsWith(".docx") ||
        fileName.endsWith(".pdf")
      )
    ) {
      setUploadError("Please upload a Word (.docx) or PDF file.");
      return;
    }

    setUploadError(null);
    setUploadSuccess(false);
    setUploadStage("uploading_file");

    try {
      // Step 1: Parse the file using API route
      const formData = new FormData();
      formData.append("file", file);

      setUploadStage("extracting_text");
      const parseResponse = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json();
        throw new Error(errorData.error || "Failed to parse file");
      }

      const parseResult = await parseResponse.json();
      const extractedText = parseResult.text;
      const extractedLinks = Array.isArray(parseResult.links) ? parseResult.links : [];

      // Step 2: Extract structured data and save to database
      const resumeName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      const isActive = resumes && resumes.length === 0; // Make first resume active

      const placeholderResumeId = await createProcessingResume({
        userId: user._id,
        name: resumeName,
        isActive: isActive,
      });
      setProcessingResumeId(placeholderResumeId);
      setUploadStage("extracting_structured_resume");

      const result = await extractResumeData({
        userId: user._id,
        resumeText: extractedText,
        resumeName: resumeName,
        isActive: isActive,
        resumeId: placeholderResumeId,
        resumeLinks: extractedLinks,
      });

      // Open editor with newly created resume
      if (result.resumeId) {
        setProcessingResumeId(result.resumeId);
        setNewlyCreatedResumeId(result.resumeId);
        setEditingResumeId(result.resumeId);
      }

      setUploadSuccess(true);
      setUploadStage("done");
      // Reset file input
      event.target.value = "";
      
      // Clear success message after 3 seconds
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error uploading resume:", error);
      setUploadError(error.message || "Failed to upload resume. Please try again.");
      setUploadStage("failed");
    }
  };

  // Handle editor close
  const handleEditorClose = () => {
    setEditingResumeId(null);
    setNewlyCreatedResumeId(null);
  };

  // Handle editor save (refresh resumes list)
  const handleEditorSave = () => {
    // The resumes will automatically refresh via the query
    // Just close the editor if this was a newly created resume
    if (newlyCreatedResumeId) {
      setNewlyCreatedResumeId(null);
    }
  };

  // Show onboarding if user not set up
  if (!user) {
    return <UserOnboarding />;
  }

  return (
    <>
      {editingResume && editingResumeId && (
        <ResumeEditor
          resume={editingResume}
          onClose={handleEditorClose}
          onSave={handleEditorSave}
        />
      )}
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Settings</h2>
          <p className="hint">Manage your account and master resumes</p>
        </div>
      </div>
      
      <div style={{ padding: "1rem" }}>
        {/* User Info */}
        <div style={{ marginBottom: "2rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Account Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Email</label>
              <div>{user.email}</div>
            </div>
            <div className="info-item">
              <label>Full Name</label>
              <div>{user.fullName || "Not set"}</div>
            </div>
            <div className="info-item">
              <label>User ID</label>
              <div style={{ fontFamily: "monospace", fontSize: "12px" }}>{user._id}</div>
            </div>
          </div>
        </div>

        {/* Master Resumes Section */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3>Master Resumes</h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <label
                className="primary small"
                style={{
                  cursor: isProcessing ? "not-allowed" : "pointer",
                  opacity: isProcessing ? 0.6 : 1,
                  display: "inline-block",
                }}
              >
                {isProcessing ? "Uploading..." : "📄 Upload Resume"}
                <input
                  type="file"
                  accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                  onChange={handleFileUpload}
                  disabled={isProcessing || !user}
                  style={{ display: "none" }}
                />
              </label>
              <button
                className="primary small"
                onClick={() => setShowCreateResume(!showCreateResume)}
                disabled={isProcessing}
                style={{
                  cursor: isProcessing ? "not-allowed" : "pointer",
                  opacity: isProcessing ? 0.6 : 1,
                }}
              >
                {showCreateResume ? "Cancel" : "+ New Resume"}
              </button>
            </div>
          </div>

          {/* Upload Status Messages */}
          {showUploadError && (
            <div
              style={{
                padding: "0.75rem",
                marginBottom: "1rem",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                color: "var(--error)",
                fontSize: "14px",
              }}
            >
              {hasProcessingFailed ? processingFailureMessage : uploadError}
              {hasProcessingFailed && (
                <button
                  className="ghost tiny"
                  onClick={() => {
                    setUploadStage("idle");
                    setProcessingResumeId(null);
                    setUploadError(null);
                  }}
                  style={{ marginLeft: "0.5rem" }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
          {uploadSuccess && (
            <div
              style={{
                padding: "0.75rem",
                marginBottom: "1rem",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "8px",
                color: "var(--success)",
                fontSize: "14px",
              }}
            >
              Resume uploaded and parsed successfully!
            </div>
          )}
          {isProcessing && (
            <div
              className="loading-state"
              style={{
                marginBottom: "1rem",
                backgroundColor: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "10px",
                color: "var(--text)",
              }}
            >
              <div className="spinner" />
              <div style={{ fontWeight: 600 }}>Processing your master resume</div>
              {(() => {
                const steps = [
                  { key: "uploading_file", label: "Uploading file" },
                  { key: "extracting_text", label: "Extracting text" },
                  { key: "extracting_structured_resume", label: "Extracting structured resume" },
                  { key: "saving_to_database", label: "Saving to database" },
                ];
                const currentIndex = steps.findIndex(
                  (step) => step.key === currentProcessingStatus
                );
                const currentLabel =
                  steps.find((step) => step.key === currentProcessingStatus)?.label ||
                  "Processing";
                return (
                  <>
                    <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {currentLabel}
                    </div>
                    <div style={{ display: "grid", gap: "0.35rem", width: "100%" }}>
                      {steps.map((step, idx) => {
                        const isActive = currentProcessingStatus === step.key;
                        const isComplete = currentIndex > idx;
                        return (
                          <div
                            key={step.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              opacity: isActive || isComplete ? 1 : 0.5,
                              fontSize: "12px",
                            }}
                          >
                            <span
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: isComplete
                                  ? "var(--success)"
                                  : isActive
                                    ? "var(--accent)"
                                    : "var(--border)",
                                display: "inline-block",
                              }}
                            />
                            <span>{step.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {showCreateResume && (
            <div style={{ 
              padding: "1rem", 
              border: "1px solid var(--border)", 
              borderRadius: "10px",
              marginBottom: "1rem",
              background: "rgba(255, 255, 255, 0.02)"
            }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "13px", color: "var(--muted)" }}>
                Resume Name
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Data Science Resume"
                value={resumeName}
                onChange={(e) => setResumeName(e.target.value)}
                style={{ marginBottom: "0.75rem" }}
              />
              <button
                className="primary small"
                onClick={handleCreateResume}
                disabled={!resumeName.trim() || isCreating}
              >
                {isCreating ? "Creating..." : "Create Resume"}
              </button>
              <p className="hint" style={{ marginTop: "0.5rem", fontSize: "12px" }}>
                Note: Full resume editing functionality will be available soon. For now, this creates a placeholder resume.
              </p>
            </div>
          )}

          {!isProcessing && resumes && resumes.length > 0 ? (
            <div className="table-wrapper">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((resume: any) => (
                    <tr key={resume._id}>
                      <td>
                        {renamingResumeId === resume._id ? (
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <input
                              type="text"
                              className="input"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              style={{ maxWidth: "220px" }}
                            />
                            <button
                              className="primary tiny"
                              onClick={handleRenameSave}
                              disabled={isRenaming || !renameValue.trim()}
                            >
                              {isRenaming ? "Saving..." : "Save"}
                            </button>
                            <button className="ghost tiny" onClick={handleRenameCancel}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="cell-title">{resume.name}</div>
                        )}
                      </td>
                      <td>
                        {resume.isActive ? (
                          <span className="status-pill tiny done">Active</span>
                        ) : (
                          <span className="status-pill tiny pending">Inactive</span>
                        )}
                      </td>
                      <td>
                        {new Date(resume.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="actions-inline">
                          {!resume.isActive && (
                            <button
                              className="ghost small"
                              onClick={() => handleSetActive(resume._id)}
                            >
                              Set Active
                            </button>
                          )}
                          <button
                            className="ghost small"
                            onClick={() => setEditingResumeId(resume._id)}
                          >
                            Edit
                          </button>
                          <button
                            className="ghost small"
                            onClick={() => handleRenameStart(resume)}
                          >
                            Rename
                          </button>
                          <button
                            className="ghost small"
                            onClick={() => handleDeleteResume(resume._id)}
                            disabled={deletingResumeId === resume._id}
                          >
                            {deletingResumeId === resume._id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !isProcessing ? (
            <div className="empty-state-container small">
              <p className="hint">No master resumes yet. Create one to get started.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </>
  );
}
