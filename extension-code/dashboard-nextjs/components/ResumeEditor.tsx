"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface ResumeEditorProps {
  resume: any;
  onClose: () => void;
  onSave?: () => void;
}

export default function ResumeEditor({ resume, onClose, onSave }: ResumeEditorProps) {
  const updateResume = useMutation(api.masterResumes.updateMasterResume);
  const createBullet = useMutation(api.resumeBullets.createResumeBullet);
  const updateBullet = useMutation(api.resumeBullets.updateResumeBullet);
  const deleteBullet = useMutation(api.resumeBullets.deleteResumeBullet);
  
  // Query work experience bullets
  const allBullets = useQuery(
    api.resumeBullets.getResumeBullets,
    resume ? { masterResumeId: resume._id } : "skip"
  );

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Don't render if resume is not loaded yet
  if (!resume) {
    return null;
  }

  // Local state for all resume sections
  const [header, setHeader] = useState(resume?.header || {});
  const [summary, setSummary] = useState(resume?.summary || "");
  const [skills, setSkills] = useState(resume?.skills || {
    programming_languages: [],
    frameworks_libraries: [],
    tools_cloud_technologies: [],
    data_science_analytics: [],
    machine_learning_ai: [],
    other_skills: [],
  });
  const [education, setEducation] = useState(resume?.education || []);
  const [awards, setAwards] = useState(resume?.awards || []);
  const [mentorship, setMentorship] = useState(resume?.mentorship || []);
  const [links, setLinks] = useState(resume?.links || []);

  // Group work experience bullets by parentId (company/role)
  const [workExpGroups, setWorkExpGroups] = useState<Record<string, any[]>>({});
  const [projectGroups, setProjectGroups] = useState<Record<string, any[]>>({});
  const [workExpPendingChanges, setWorkExpPendingChanges] = useState(false);

  // Group bullets when they're loaded
  useEffect(() => {
    if (allBullets) {
      const experienceBullets = allBullets.filter(b => b.parentType === "experience");
      const expGrouped: Record<string, any[]> = {};
      experienceBullets.forEach(bullet => {
        const key = bullet.parentId;
        if (!expGrouped[key]) {
          expGrouped[key] = [];
        }
        expGrouped[key].push(bullet);
      });
      Object.keys(expGrouped).forEach(key => {
        expGrouped[key].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
      setWorkExpGroups(expGrouped);

      const projectBullets = allBullets.filter(b => b.parentType === "project");
      const projGrouped: Record<string, any[]> = {};
      projectBullets.forEach(bullet => {
        const key = bullet.parentId;
        if (!projGrouped[key]) {
          projGrouped[key] = [];
        }
        projGrouped[key].push(bullet);
      });
      Object.keys(projGrouped).forEach(key => {
        projGrouped[key].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
      setProjectGroups(projGrouped);
    } else {
      setWorkExpGroups({});
      setProjectGroups({});
    }
  }, [allBullets]);

  // Sync state when resume prop changes
  useEffect(() => {
    if (resume) {
      setHeader(resume.header || {});
      setSummary(resume.summary || "");
      setSkills(resume.skills || {
        programming_languages: [],
        frameworks_libraries: [],
        tools_cloud_technologies: [],
        data_science_analytics: [],
        machine_learning_ai: [],
        other_skills: [],
      });
      setEducation(resume.education || []);
      setAwards(resume.awards || []);
      setMentorship(resume.mentorship || []);
      setLinks(resume.links || []);
    }
  }, [resume]);

  // Track changes
  useEffect(() => {
    const hasHeaderChanges = JSON.stringify(header) !== JSON.stringify(resume?.header || {});
    const hasSummaryChanges = summary !== (resume?.summary || "");
    const hasSkillsChanges = JSON.stringify(skills) !== JSON.stringify(resume?.skills || {});
    const hasEducationChanges = JSON.stringify(education) !== JSON.stringify(resume?.education || []);
    const hasAwardsChanges = JSON.stringify(awards) !== JSON.stringify(resume?.awards || []);
    const hasMentorshipChanges = JSON.stringify(mentorship) !== JSON.stringify(resume?.mentorship || []);
    const hasLinksChanges = JSON.stringify(links) !== JSON.stringify(resume?.links || []);

    setHasChanges(
      hasHeaderChanges ||
      hasSummaryChanges ||
      hasSkillsChanges ||
      hasEducationChanges ||
      hasAwardsChanges ||
      hasMentorshipChanges ||
      hasLinksChanges ||
      workExpPendingChanges
    );
  }, [header, summary, skills, education, awards, mentorship, links, workExpPendingChanges, resume]);

  const handleSave = async () => {
    if (!resume || (!hasChanges && !workExpPendingChanges)) return;

    setIsSaving(true);
    try {
      // Save resume sections
      await updateResume({
        resumeId: resume._id,
        header: Object.keys(header).length > 0 ? header : undefined,
        summary: summary || undefined,
        skills,
        education,
        awards: awards.length > 0 ? awards : undefined,
        mentorship: mentorship.length > 0 ? mentorship : undefined,
        links: links.length > 0 ? links : undefined,
      });

      // Note: Work experience bullets are saved in real-time as they're edited
      // No bulk save needed here

      if (onSave) {
        onSave();
      }
      setHasChanges(false);
      setWorkExpPendingChanges(false);
    } catch (error) {
      console.error("Error saving resume:", error);
      alert("Failed to save resume. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle work experience bullet updates
  const handleBulletUpdate = async (bulletId: Id<"resumeBullets">, text: string) => {
    try {
      await updateBullet({ bulletId, text });
      setWorkExpPendingChanges(true);
    } catch (error) {
      console.error("Error updating bullet:", error);
      alert("Failed to update bullet. Please try again.");
    }
  };

  // Handle work experience bullet deletion
  const handleBulletDelete = async (bulletId: Id<"resumeBullets">) => {
    if (!confirm("Are you sure you want to delete this bullet?")) return;
    
    try {
      await deleteBullet({ bulletId });
      setWorkExpPendingChanges(true);
    } catch (error) {
      console.error("Error deleting bullet:", error);
      alert("Failed to delete bullet. Please try again.");
    }
  };

  // Handle adding new bullet to work experience
  const handleAddBullet = async (parentId: string, company: string, role: string) => {
    if (!resume) return;

    try {
      const existingBullets = workExpGroups[parentId] || [];
      const nextOrder = existingBullets.length > 0 
        ? Math.max(...existingBullets.map(b => b.order || 0)) + 1 
        : 0;

      await createBullet({
        masterResumeId: resume._id,
        bulletId: `${parentId}_b${nextOrder + 1}`,
        parentType: "experience",
        parentId,
        company: company || undefined,
        role: role || undefined,
        text: "",
        order: nextOrder,
      });
      setWorkExpPendingChanges(true);
    } catch (error) {
      console.error("Error adding bullet:", error);
      alert("Failed to add bullet. Please try again.");
    }
  };

  const handleAddProjectBullet = async (parentId: string, projectName: string) => {
    if (!resume) return;

    try {
      const existingBullets = projectGroups[parentId] || [];
      const nextOrder = existingBullets.length > 0
        ? Math.max(...existingBullets.map(b => b.order || 0)) + 1
        : 0;

      await createBullet({
        masterResumeId: resume._id,
        bulletId: `${parentId}_p${nextOrder + 1}`,
        parentType: "project",
        parentId,
        projectName: projectName || undefined,
        text: "",
        order: nextOrder,
      });
      setWorkExpPendingChanges(true);
    } catch (error) {
      console.error("Error adding project bullet:", error);
      alert("Failed to add bullet. Please try again.");
    }
  };

  // Helper function to update array field in skills
  const updateSkillArray = (category: string, value: string[]) => {
    setSkills({ ...skills, [category]: value });
  };

  // Helper function to add item to array
  const addArrayItem = (
    array: any[],
    setter: (val: any[]) => void,
    defaultItem: any = ""
  ) => {
    setter([...array, defaultItem]);
  };

  // Helper function to update item in array
  const updateArrayItem = (
    array: any[],
    setter: (val: any[]) => void,
    index: number,
    value: any
  ) => {
    const newArray = [...array];
    newArray[index] = value;
    setter(newArray);
  };

  // Helper function to remove item from array
  const removeArrayItem = (
    array: any[],
    setter: (val: any[]) => void,
    index: number
  ) => {
    setter(array.filter((_, i) => i !== index));
  };

  // Helper function to update header field
  const updateHeader = (field: string, value: string) => {
    setHeader({ ...header, [field]: value || undefined });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        overflow: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (hasChanges) {
            if (!confirm("You have unsaved changes. Are you sure you want to close?")) {
              return;
            }
          }
          onClose();
        }
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: "900px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <div>
            <h2>Edit Resume: {resume?.name}</h2>
            <p className="hint">Edit the sections below and click Save when done</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {hasChanges && (
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--warning)",
                  alignSelf: "center",
                  marginRight: "1rem",
                }}
              >
                Unsaved changes
              </span>
            )}
            <button className="ghost small" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary small"
              onClick={handleSave}
              disabled={(!hasChanges && !workExpPendingChanges) || isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        <div style={{ padding: "1.5rem" }}>
          {/* Header Section */}
          <Section title="Header Information">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <InputField
                label="Full Name"
                value={header?.fullName || ""}
                onChange={(e) => updateHeader("fullName", e.target.value)}
              />
              <InputField
                label="Email"
                value={header?.email || ""}
                onChange={(e) => updateHeader("email", e.target.value)}
                type="email"
              />
              <InputField
                label="Phone"
                value={header?.phone || ""}
                onChange={(e) => updateHeader("phone", e.target.value)}
              />
              <InputField
                label="Address"
                value={header?.address || ""}
                onChange={(e) => updateHeader("address", e.target.value)}
              />
              <InputField
                label="LinkedIn"
                value={header?.linkedin || ""}
                onChange={(e) => updateHeader("linkedin", e.target.value)}
                type="url"
              />
              <InputField
                label="GitHub"
                value={header?.github || ""}
                onChange={(e) => updateHeader("github", e.target.value)}
                type="url"
              />
              <InputField
                label="Portfolio"
                value={header?.portfolio || ""}
                onChange={(e) => updateHeader("portfolio", e.target.value)}
                type="url"
              />
              <InputField
                label="Website"
                value={header?.website || ""}
                onChange={(e) => updateHeader("website", e.target.value)}
                type="url"
              />
            </div>
          </Section>

          {/* Summary Section */}
          <Section title="Professional Summary">
            <textarea
              className="input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Enter your professional summary..."
              rows={5}
              style={{ width: "100%", resize: "vertical" }}
            />
          </Section>

          {/* Skills Section */}
          <Section title="Skills">
            {Object.entries(skills).map(([category, items]: [string, any]) => (
              <div key={category} style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontSize: "13px",
                    color: "var(--muted)",
                    textTransform: "capitalize",
                  }}
                >
                  {category.replace(/_/g, " ")}
                </label>
                <ArrayEditor
                  items={items || []}
                  onAdd={() => addArrayItem(items, (val) => updateSkillArray(category, val))}
                  onUpdate={(index, value) =>
                    updateArrayItem(items, (val) => updateSkillArray(category, val), index, value)
                  }
                  onRemove={(index) =>
                    removeArrayItem(items, (val) => updateSkillArray(category, val), index)
                  }
                  placeholder={`Add ${category.replace(/_/g, " ")}`}
                />
              </div>
            ))}
          </Section>

          {/* Work Experience Section */}
          <Section title="Work Experience">
            {Object.keys(workExpGroups).length === 0 && (
              <p className="hint" style={{ fontSize: "12px", marginBottom: "1rem" }}>
                No work experience found. Work experience will appear here after uploading a resume with experience sections.
              </p>
            )}
            {Object.entries(workExpGroups).map(([parentId, bullets]) => {
              // Get company and role from first bullet (they should be the same for all bullets in a group)
              const firstBullet = bullets[0];
              const company = firstBullet.company || "";
              const role = firstBullet.role || "";
              const dates = firstBullet.dates || "";
              const location = firstBullet.location || "";

              return (
                <div
                  key={parentId}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1rem",
                    marginBottom: "1.5rem",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                  }}
                >
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "13px",
                            color: "var(--muted)",
                          }}
                        >
                          Company
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={company}
                          onChange={(e) => {
                            // Update all bullets in this group with new company
                            bullets.forEach(bullet => {
                              handleBulletUpdate(bullet._id, bullet.text);
                              // Note: Company/role updates would need a new mutation
                              // For now, this is read-only in the UI
                            });
                          }}
                          disabled={true}
                          style={{ width: "100%", opacity: 0.7 }}
                          placeholder="Company name"
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "13px",
                            color: "var(--muted)",
                          }}
                        >
                          Role
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={role}
                          disabled={true}
                          style={{ width: "100%", opacity: 0.7 }}
                          placeholder="Job title"
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "13px",
                            color: "var(--muted)",
                          }}
                        >
                          Dates
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={dates}
                          disabled={true}
                          style={{ width: "100%", opacity: 0.7 }}
                          placeholder="Start - End dates"
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "13px",
                            color: "var(--muted)",
                          }}
                        >
                          Location
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={location}
                          disabled={true}
                          style={{ width: "100%", opacity: 0.7 }}
                          placeholder="Location"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: "0.5rem",
                          fontSize: "13px",
                          color: "var(--muted)",
                        }}
                      >
                        Responsibilities & Achievements
                      </label>
                      {bullets.map((bullet, idx) => (
                        <div
                          key={bullet._id}
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            marginBottom: "0.5rem",
                            alignItems: "flex-start",
                          }}
                        >
                          <textarea
                            className="input"
                            value={bullet.text}
                            onChange={(e) => handleBulletUpdate(bullet._id, e.target.value)}
                            placeholder="Enter bullet point..."
                            rows={2}
                            style={{ flex: 1, resize: "vertical" }}
                          />
                          <button
                            className="ghost tiny"
                            onClick={() => handleBulletDelete(bullet._id)}
                            style={{ marginTop: "0.25rem" }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        className="ghost small"
                        onClick={() => handleAddBullet(parentId, company, role)}
                        style={{ marginTop: "0.5rem" }}
                      >
                        + Add Bullet Point
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </Section>

          {/* Projects Section */}
          <Section title="Projects">
            {Object.keys(projectGroups).length === 0 && (
              <p className="hint" style={{ fontSize: "12px", marginBottom: "1rem" }}>
                No projects found. Project sections will appear here after uploading a resume with project content.
              </p>
            )}
            {Object.entries(projectGroups).map(([parentId, bullets]) => {
              const firstBullet = bullets[0];
              const projectName = firstBullet?.projectName || "";
              const dates = firstBullet?.dates || "";
              const tags = firstBullet?.tags || [];

              return (
                <div
                  key={parentId}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1rem",
                    marginBottom: "1.5rem",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                  }}
                >
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "13px",
                            color: "var(--muted)",
                          }}
                        >
                          Project Name
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={projectName}
                          disabled={true}
                          style={{ width: "100%", opacity: 0.7 }}
                          placeholder="Project name"
                        />
                      </div>
                      <div>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "13px",
                            color: "var(--muted)",
                          }}
                        >
                          Dates
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={dates}
                          disabled={true}
                          style={{ width: "100%", opacity: 0.7 }}
                          placeholder="Project dates"
                        />
                      </div>
                    </div>
                    {tags.length > 0 && (
                      <div style={{ marginBottom: "1rem" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            fontSize: "13px",
                            color: "var(--muted)",
                          }}
                        >
                          Technologies
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                          {tags.map((tag: string) => (
                            <span
                              key={`${parentId}-tag-${tag}`}
                              style={{
                                fontSize: "12px",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "999px",
                                border: "1px solid var(--border)",
                                backgroundColor: "rgba(255, 255, 255, 0.03)",
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        fontSize: "13px",
                        color: "var(--muted)",
                      }}
                    >
                      Project Details
                    </label>
                    {bullets.map((bullet, idx) => (
                      <div
                        key={bullet._id}
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          marginBottom: "0.5rem",
                          alignItems: "flex-start",
                        }}
                      >
                        <textarea
                          className="input"
                          value={bullet.text}
                          onChange={(e) => handleBulletUpdate(bullet._id, e.target.value)}
                          placeholder="Enter bullet point..."
                          rows={2}
                          style={{ flex: 1, resize: "vertical" }}
                        />
                        <button
                          className="ghost tiny"
                          onClick={() => handleBulletDelete(bullet._id)}
                          style={{ marginTop: "0.25rem" }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      className="ghost small"
                      onClick={() => handleAddProjectBullet(parentId, projectName)}
                      style={{ marginTop: "0.5rem" }}
                    >
                      + Add Bullet Point
                    </button>
                  </div>
                </div>
              );
            })}
          </Section>

          {/* Education Section */}
          <Section title="Education">
            {education.map((edu: any, index: number) => (
              <div
                key={index}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong>Education #{index + 1}</strong>
                  <button
                    className="ghost tiny"
                    onClick={() => removeArrayItem(education, setEducation, index)}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <InputField
                    label="Institution"
                    value={edu.institution || ""}
                    onChange={(e) =>
                      updateArrayItem(
                        education,
                        setEducation,
                        index,
                        { ...edu, institution: e.target.value }
                      )
                    }
                  />
                  <InputField
                    label="Degree"
                    value={edu.degree || ""}
                    onChange={(e) =>
                      updateArrayItem(education, setEducation, index, { ...edu, degree: e.target.value })
                    }
                  />
                  <InputField
                    label="Dates"
                    value={edu.dates || ""}
                    onChange={(e) =>
                      updateArrayItem(education, setEducation, index, { ...edu, dates: e.target.value })
                    }
                  />
                  <InputField
                    label="Location"
                    value={edu.location || ""}
                    onChange={(e) =>
                      updateArrayItem(education, setEducation, index, { ...edu, location: e.target.value })
                    }
                  />
                  <InputField
                    label="GPA"
                    value={edu.gpa || ""}
                    onChange={(e) =>
                      updateArrayItem(education, setEducation, index, { ...edu, gpa: e.target.value })
                    }
                  />
                </div>
              </div>
            ))}
            <button
              className="ghost small"
              onClick={() =>
                addArrayItem(education, setEducation, {
                  institution: "",
                  degree: "",
                  dates: "",
                  location: "",
                  gpa: "",
                  links: [],
                })
              }
            >
              + Add Education
            </button>
          </Section>

          {/* Awards Section */}
          <Section title="Awards">
            {awards.map((award: any, index: number) => (
              <div
                key={index}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong>Award #{index + 1}</strong>
                  <button
                    className="ghost tiny"
                    onClick={() => removeArrayItem(awards, setAwards, index)}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <InputField
                    label="Award Name"
                    value={award.name || ""}
                    onChange={(e) =>
                      updateArrayItem(awards, setAwards, index, { ...award, name: e.target.value })
                    }
                  />
                  <InputField
                    label="Issuer"
                    value={award.issuer || ""}
                    onChange={(e) =>
                      updateArrayItem(awards, setAwards, index, { ...award, issuer: e.target.value })
                    }
                  />
                  <InputField
                    label="Year"
                    value={award.year || ""}
                    onChange={(e) =>
                      updateArrayItem(awards, setAwards, index, { ...award, year: e.target.value })
                    }
                  />
                  <InputField
                    label="Details"
                    value={award.details || ""}
                    onChange={(e) =>
                      updateArrayItem(awards, setAwards, index, { ...award, details: e.target.value })
                    }
                  />
                </div>
              </div>
            ))}
            <button
              className="ghost small"
              onClick={() =>
                addArrayItem(awards, setAwards, {
                  name: "",
                  issuer: "",
                  year: "",
                  details: "",
                })
              }
            >
              + Add Award
            </button>
          </Section>

          {/* Mentorship Section */}
          <Section title="Mentorship">
            <ArrayEditor
              items={mentorship}
              onAdd={() => addArrayItem(mentorship, setMentorship)}
              onUpdate={(index, value) =>
                updateArrayItem(mentorship, setMentorship, index, value)
              }
              onRemove={(index) => removeArrayItem(mentorship, setMentorship, index)}
              placeholder="Add mentorship experience"
            />
          </Section>

          {/* Links Section */}
          <Section title="Additional Links">
            <ArrayEditor
              items={links}
              onAdd={() => addArrayItem(links, setLinks)}
              onUpdate={(index, value) => updateArrayItem(links, setLinks, index, value)}
              onRemove={(index) => removeArrayItem(links, setLinks, index)}
              placeholder="Add link URL"
              type="url"
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem", fontWeight: "600" }}>{title}</h3>
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: "0.5rem",
          fontSize: "13px",
          color: "var(--muted)",
        }}
      >
        {label}
      </label>
      <input
        type={type}
        className="input"
        value={value}
        onChange={onChange}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function ArrayEditor({
  items,
  onAdd,
  onUpdate,
  onRemove,
  placeholder,
  type = "text",
}: {
  items: string[];
  onAdd: () => void;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
  type?: string;
}) {
  const itemsArray = items || [];
  return (
    <div>
      {itemsArray.map((item, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "0.5rem",
            alignItems: "center",
          }}
        >
          <input
            type={type}
            className="input"
            value={item}
            onChange={(e) => onUpdate(index, e.target.value)}
            placeholder={placeholder}
            style={{ flex: 1 }}
          />
          <button className="ghost tiny" onClick={() => onRemove(index)}>
            Remove
          </button>
        </div>
      ))}
          <button className="ghost small" onClick={onAdd}>
        + Add Item
      </button>
      {itemsArray.length === 0 && (
        <p className="hint" style={{ fontSize: "12px", marginTop: "0.5rem" }}>
          No items yet. Click "Add Item" to add one.
        </p>
      )}
    </div>
  );
}
