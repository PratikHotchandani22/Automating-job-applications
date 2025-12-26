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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
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
  const setActiveResume = useMutation(api.masterResumes.setActiveMasterResume);
  const extractResumeData = useAction(api.resumeExtraction.extractResumeData);

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
        skills: {
          programming_languages: [],
          frameworks_libraries: [],
          tools_cloud_technologies: [],
          data_science_analytics: [],
          machine_learning_ai: [],
          other_skills: [],
        },
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

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      // Step 1: Parse the file using API route
      const formData = new FormData();
      formData.append("file", file);

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

      // Step 2: Extract structured data and save to database
      const resumeName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      const isActive = resumes && resumes.length === 0; // Make first resume active

      const result = await extractResumeData({
        userId: user._id,
        resumeText: extractedText,
        resumeName: resumeName,
        isActive: isActive,
      });

      // Open editor with newly created resume
      if (result.resumeId) {
        setNewlyCreatedResumeId(result.resumeId);
        setEditingResumeId(result.resumeId);
      }

      setUploadSuccess(true);
      // Reset file input
      event.target.value = "";
      
      // Clear success message after 3 seconds
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error uploading resume:", error);
      setUploadError(error.message || "Failed to upload resume. Please try again.");
    } finally {
      setIsUploading(false);
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
                  cursor: isUploading ? "not-allowed" : "pointer",
                  opacity: isUploading ? 0.6 : 1,
                  display: "inline-block",
                }}
              >
                {isUploading ? "Uploading..." : "📄 Upload Resume"}
                <input
                  type="file"
                  accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading || !user}
                  style={{ display: "none" }}
                />
              </label>
              <button
                className="primary small"
                onClick={() => setShowCreateResume(!showCreateResume)}
              >
                {showCreateResume ? "Cancel" : "+ New Resume"}
              </button>
            </div>
          </div>

          {/* Upload Status Messages */}
          {uploadError && (
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
              {uploadError}
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

          {resumes && resumes.length > 0 ? (
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
                        <div className="cell-title">{resume.name}</div>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state-container small">
              <p className="hint">No master resumes yet. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
