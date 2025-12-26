// convex/resumePipeline.ts

import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:3001";

/**
 * Convert Convex master resume to backend JSON format
 */
async function convertResumeToBackendFormat(
  ctx: any,
  masterResumeId: string
): Promise<any> {
  // Get master resume
  const masterResume = await ctx.runQuery(api.masterResumes.getMasterResume, {
    resumeId: masterResumeId as any,
  });

  if (!masterResume) {
    throw new Error(`Master resume ${masterResumeId} not found`);
  }

  // Get all bullets
  const bullets = await ctx.runQuery(api.resumeBullets.getResumeBullets, {
    masterResumeId: masterResumeId as any,
  });

  // Group work experience bullets
  const workExpBullets = bullets.filter((b: any) => b.parentType === "experience");
  const workExpMap = new Map<string, any[]>();
  workExpBullets.forEach((bullet: any) => {
    const key = bullet.parentId;
    if (!workExpMap.has(key)) {
      workExpMap.set(key, []);
    }
    workExpMap.get(key)!.push(bullet);
  });

  // Build work experience array
  const workExperience: any[] = [];
  workExpMap.forEach((bullets, parentId) => {
    bullets.sort((a, b) => (a.order || 0) - (b.order || 0));
    const firstBullet = bullets[0];
    workExperience.push({
      id: parentId,
      company: firstBullet.company || "",
      role: firstBullet.role || "",
      dates: firstBullet.dates || "",
      location: firstBullet.location || "",
      bullets: bullets.map((b: any) => b.text),
      links: [],
    });
  });

  // Group project bullets
  const projectBullets = bullets.filter((b: any) => b.parentType === "project");
  const projectMap = new Map<string, any[]>();
  projectBullets.forEach((bullet: any) => {
    const key = bullet.parentId;
    if (!projectMap.has(key)) {
      projectMap.set(key, []);
    }
    projectMap.get(key)!.push(bullet);
  });

  // Build projects array
  const projects: any[] = [];
  projectMap.forEach((bullets, parentId) => {
    bullets.sort((a, b) => (a.order || 0) - (b.order || 0));
    const firstBullet = bullets[0];
    projects.push({
      id: parentId,
      name: firstBullet.projectName || parentId,
      dates: firstBullet.dates || "",
      tags: firstBullet.tags || [],
      bullets: bullets.map((b: any) => b.text),
      links: [],
    });
  });

  // Convert to backend format
  return {
    id: masterResume._id,
    summary: masterResume.summary || "",
    skills: masterResume.skills || {
      programming_languages: [],
      frameworks_libraries: [],
      tools_cloud_technologies: [],
      data_science_analytics: [],
      machine_learning_ai: [],
      other_skills: [],
    },
    work_experience: workExperience,
    projects: projects,
    education: (masterResume.education || []).map((edu: any) => ({
      institution: edu.institution || "",
      degree: edu.degree || "",
      dates: edu.dates || "",
      location: edu.location || "",
      gpa: edu.gpa || "",
      links: edu.links || [],
    })),
    awards: masterResume.awards || [],
    mentorship: masterResume.mentorship || [],
    links: masterResume.links || [],
  };
}

/**
 * Save master resume JSON to backend file system
 * This creates the JSON file that the backend server expects
 * NOTE: The backend needs an endpoint at POST /resumes/:resumeId to save resume JSON files
 * If the endpoint doesn't exist, the JSON will be passed in the /analyze request body
 */
export const saveResumeJsonToBackend = action({
  args: {
    masterResumeId: v.id("masterResumes"),
  },
  handler: async (ctx, args) => {
    const backendJson = await convertResumeToBackendFormat(ctx, args.masterResumeId);

    // Try to save via backend API endpoint
    // The backend should have an endpoint: POST /resumes/:resumeId
    const resumeId = args.masterResumeId;
    
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/resumes/${resumeId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(backendJson),
      });

      if (response.ok) {
        return { success: true, resumeId };
      }
      
      // If endpoint doesn't exist (404) or other error, we'll pass JSON in request
      if (response.status === 404) {
        console.warn("Backend /resumes endpoint not found, will pass JSON in /analyze request");
        return { success: false, resumeJson: backendJson, error: "Endpoint not found" };
      }
      
      const errorText = await response.text();
      throw new Error(`Failed to save resume JSON: ${response.status} - ${errorText}`);
    } catch (error: any) {
      // Network error or endpoint doesn't exist - return JSON to pass in request
      console.warn("Could not save resume to backend file system:", error.message);
      return { success: false, resumeJson: backendJson, error: error.message };
    }
  },
});

/**
 * Start tailoring pipeline by calling backend /analyze endpoint
 */
export const startTailoringPipeline = action({
  args: {
    userId: v.id("users"),
    masterResumeId: v.id("masterResumes"),
    jobId: v.id("jobs"),
    options: v.optional(
      v.object({
        page_limit: v.optional(v.number()),
        mock_mode: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Get job data
    const job = await ctx.runQuery(api.jobs.getJob, {
      jobId: args.jobId,
    });

    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    // Convert resume to backend format
    const resumeJson = await convertResumeToBackendFormat(ctx, args.masterResumeId);
    // #region agent log
    console.log('[DEBUG:resumePipeline] convertResumeToBackendFormat result:', {
      work_exp_count: resumeJson?.work_experience?.length,
      first_exp_id: resumeJson?.work_experience?.[0]?.id,
      first_exp_company: resumeJson?.work_experience?.[0]?.company,
      first_bullet: resumeJson?.work_experience?.[0]?.bullets?.[0]?.substring(0, 80),
      project_count: resumeJson?.projects?.length
    });
    // #endregion

    // Build job payload for backend
    const jobPayload = {
      job: {
        title: job.title || "",
        company: job.company || "",
        location: job.location || "",
        description_text: job.extractedText || job.rawDescription || "",
        job_url: job.jobUrl || "",
        source_platform: job.platform || "",
        confidence: 1.0,
      },
      meta: {
        url: job.jobUrl || "",
        platform: job.platform || "",
        confidence: 1.0,
      },
    };

    // Use the resume ID as the resume_id for the backend
    // The backend expects resume JSON files in backend/resumes/{resume_id}.json
    // We'll use the Convex ID, but we need to ensure the file exists
    const resumeId = args.masterResumeId;

    // Always include resume JSON in the request body
    // The backend will save it to the file system if provided
    const analyzePayload: any = {
      job_payload: jobPayload,
      resume_id: resumeId,
      master_resume_json: resumeJson, // Backend will save this to file system
      options: args.options || {},
    };

    const response = await fetch(`${BACKEND_BASE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(analyzePayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend analyze failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const backendRunId = data.run_id || data.runId;

    if (!backendRunId) {
      throw new Error("Backend did not return a run_id");
    }

    // Create run record in Convex
    const runId = await ctx.runMutation(api.runs.createRun, {
      runId: backendRunId,
      userId: args.userId,
      masterResumeId: args.masterResumeId,
      jobId: args.jobId,
      status: "running",
      stage: "initialized",
      mockMode: args.options?.mock_mode,
    });

    return {
      success: true,
      runId,
      backendRunId,
      status: data.status || "running",
      stage: data.stage || "initialized",
    };
  },
});

/**
 * Poll backend for run status and update Convex
 */
export const pollRunStatus = action({
  args: {
    runId: v.id("runs"),
  },
  handler: async (ctx, args) => {
    // Get run to get backend runId
    const run = await ctx.runQuery(api.runs.getRun, {
      runId: args.runId,
    });

    if (!run) {
      throw new Error(`Run ${args.runId} not found`);
    }

    // Poll backend
    const response = await fetch(`${BACKEND_BASE_URL}/status/${encodeURIComponent(run.runId)}`);

    if (!response.ok) {
      if (response.status === 404) {
        // Run not found on backend, mark as error
        await ctx.runMutation(api.runs.updateRunStatus, {
          runId: args.runId,
          status: "error",
          stage: "ERROR",
          errorMessage: "Run not found on backend",
        });
        return { status: "error", stage: "ERROR" };
      }
      throw new Error(`Backend status check failed: ${response.status}`);
    }

    const data = await response.json();

    // Map backend stage to Convex stage
    const stageMap: Record<string, any> = {
      EXTRACTING: "extracting",
      RUBRIC: "rubric_generating",
      SCORING_EVIDENCE: "rubric_generating", // Evidence scoring happens after rubric
      EMBEDDINGS: "embedding_jd",
      SELECT: "selecting",
      ANALYZING: "tailoring",
      GENERATING_LATEX: "generating_latex",
      COMPILING_PDF: "generating_pdf",
      DONE: "DONE",
      ERROR: "ERROR",
    };

    const convexStage = stageMap[data.stage] || "initialized";
    const status = data.status === "success" ? "success" : data.status === "error" ? "error" : "running";

    // Update run status
    await ctx.runMutation(api.runs.updateRunStatus, {
      runId: args.runId,
      status,
      stage: convexStage,
      errorMessage: data.message && status === "error" ? data.message : undefined,
    });

    return {
      status,
      stage: convexStage,
      message: data.message,
      files: data.files || {},
    };
  },
});

/**
 * Sync artifacts from backend and store in Convex
 * This downloads artifacts from the backend and stores them appropriately
 */
export const syncArtifactsFromBackend = action({
  args: {
    runId: v.id("runs"),
    artifactKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Get run to get backend runId
    const run = await ctx.runQuery(api.runs.getRun, {
      runId: args.runId,
    });

    if (!run) {
      throw new Error(`Run ${args.runId} not found`);
    }

    // Default artifact keys to sync
    const keysToSync = args.artifactKeys || [
      "jd_rubric.json",
      "evidence_scores.json",
      "selection_plan.json",
      "tailored.json",
      "final_resume.json",
      "resume.tex",
      "resume.pdf",
    ];

    const results: any[] = [];

    for (const key of keysToSync) {
      try {
        // Download artifact
        const artifactResult = await downloadAndStoreArtifact(ctx, {
          runId: args.runId,
          artifactKey: key,
        });

        if (artifactResult.success) {
          // Determine artifact type and store appropriately
          if (key.endsWith(".json")) {
            const jsonData = JSON.parse(artifactResult.data);
            
            // Store based on artifact type
            if (key === "jd_rubric.json") {
              // Store JD rubric
              await ctx.runMutation(api.jdRubrics.createJdRubric, {
                runId: args.runId,
                version: jsonData.version || "v1",
                jobMeta: {
                  jobTitle: jsonData.job_meta?.job_title || jsonData.job?.title || "",
                  company: jsonData.job_meta?.company || jsonData.job?.company,
                  location: jsonData.job_meta?.location || jsonData.job?.location,
                  employmentType: jsonData.job_meta?.employment_type,
                  seniority: jsonData.job_meta?.seniority,
                  jobUrl: jsonData.job_meta?.job_url || jsonData.job?.job_url,
                  platform: jsonData.job_meta?.platform || jsonData.job?.source_platform,
                },
                requirements: (jsonData.requirements || []).map((req: any) => ({
                  reqId: req.req_id || req.id || "",
                  type: req.type === "must" ? "must" : "nice",
                  weight: req.weight || 0.5,
                  requirement: req.text || req.requirement || "",
                  jdEvidence: req.jd_snippet ? [req.jd_snippet] : req.jd_evidence || [],
                  category: req.category || "",
                })),
                keywords: (jsonData.keywords || jsonData.top_keywords || []).map((kw: any) => ({
                  term: typeof kw === "string" ? kw : kw.term || kw.keyword || "",
                  importance: typeof kw === "string" ? 0.5 : kw.importance || kw.weight || 0.5,
                  type: typeof kw === "string" ? "skill" : kw.type || "skill",
                  jdEvidence: typeof kw === "string" ? [] : kw.jd_evidence || [],
                })),
                constraints: jsonData.constraints,
                notes: jsonData.notes,
                rubricHash: jsonData.rubric_hash || `sha256:${JSON.stringify(jsonData)}`,
              });
            } else if (key === "selection_plan.json") {
              // Store selection plan
              await ctx.runMutation(api.selectionPlans.createSelectionPlan, {
                runId: args.runId,
                version: jsonData.version || "selection_plan_v1",
                masterResumeHash: jsonData.master_resume_hash || "",
                jobExtractedHash: jsonData.job_extracted_hash || "",
                rubricHash: jsonData.rubric_hash || "",
                embeddingModel: jsonData.embedding_model || "",
                config: {
                  configVersion: jsonData.config?.config_version || "selection_config_v1",
                  budgets: {
                    targetResumeWordsMin: jsonData.config?.budgets?.target_resume_words_min || 0,
                    targetResumeWordsMax: jsonData.config?.budgets?.target_resume_words_max || 1000,
                    experienceBulletsMin: jsonData.config?.budgets?.experience_bullets_min || 0,
                    experienceBulletsMax: jsonData.config?.budgets?.experience_bullets_max || 20,
                    projectBulletsMin: jsonData.config?.budgets?.project_bullets_min || 0,
                    projectBulletsMax: jsonData.config?.budgets?.project_bullets_max || 10,
                    awardLinesMin: jsonData.config?.budgets?.award_lines_min || 0,
                    awardLinesMax: jsonData.config?.budgets?.award_lines_max || 5,
                    perRoleCaps: {
                      mostRecent: jsonData.config?.budgets?.per_role_caps?.most_recent || 5,
                      next: jsonData.config?.budgets?.per_role_caps?.next || 3,
                      older: jsonData.config?.budgets?.per_role_caps?.older || 2,
                    },
                    maxBulletsPerRequirement: jsonData.config?.budgets?.max_bullets_per_requirement || 3,
                  },
                  thresholds: {
                    mustMinRel: jsonData.config?.thresholds?.must_min_rel || 0.5,
                    niceMinRel: jsonData.config?.thresholds?.nice_min_rel || 0.3,
                    coverThreshold: jsonData.config?.thresholds?.cover_threshold || 0.6,
                    redundancy: {
                      hardBlock: jsonData.config?.thresholds?.redundancy?.hard_block || 0.92,
                      penaltyStart: jsonData.config?.thresholds?.redundancy?.penalty_start || 0.85,
                    },
                    minEvidenceTierNice: jsonData.config?.thresholds?.min_evidence_tier_nice || "medium",
                  },
                  weights: {
                    edge: {
                      wRel: jsonData.config?.weights?.edge?.w_rel || 0.6,
                      wEvd: jsonData.config?.weights?.edge?.w_evd || 0.35,
                      wRed: jsonData.config?.weights?.edge?.w_red || 0.2,
                      wRisk: jsonData.config?.weights?.edge?.w_risk || 0.15,
                    },
                    fill: {
                      alpha: jsonData.config?.weights?.fill?.alpha || 0.5,
                      beta: jsonData.config?.weights?.fill?.beta || 0.3,
                      gamma: jsonData.config?.weights?.fill?.gamma || 0.2,
                    },
                  },
                },
                coverage: {
                  mustTotal: jsonData.coverage?.must_total || 0,
                  niceTotal: jsonData.coverage?.nice_total || 0,
                  mustCovered: jsonData.coverage?.must_covered || 0,
                  niceCovered: jsonData.coverage?.nice_covered || 0,
                  uncoveredRequirements: (jsonData.coverage?.uncovered_requirements || []).map((req: any) => ({
                    reqId: req.req_id || "",
                    type: req.type === "must" ? "must" : "nice",
                    weight: req.weight || 0.5,
                    reason: req.reason || "",
                  })),
                },
                selected: {
                  workExperience: (jsonData.selected?.work_experience || []).flatMap((role: any) =>
                    (role.bullets || []).map((bullet: any) => ({
                      bulletId: bullet.bullet_id || "",
                      parentType: "experience" as const,
                      parentId: role.role_id || "",
                      originalText: bullet.original_text || "",
                      company: role.company,
                      role: role.title || role.role,
                      dateRange: role.date_range || "",
                      evidence: {
                        score: bullet.evidence?.score || 0,
                        tier: bullet.evidence?.tier || "medium",
                      },
                      matches: (bullet.matches || []).map((m: any) => ({
                        reqId: m.req_id || "",
                        rel: m.rel || 0,
                        edgeScore: m.edge_score || 0,
                      })),
                      redundancy: {
                        maxSim: bullet.redundancy?.maxSim || 0,
                        blocked: bullet.redundancy?.blocked || false,
                        penalty: bullet.redundancy?.penalty || 0,
                      },
                      rewriteIntent: bullet.rewrite_intent || "medium",
                      reasons: bullet.reasons || [],
                    }))
                  ),
                  projects: (jsonData.selected?.projects || []).flatMap((project: any) =>
                    (project.bullets || []).map((bullet: any) => ({
                      bulletId: bullet.bullet_id || "",
                      parentType: "project" as const,
                      parentId: project.project_id || "",
                      originalText: bullet.original_text || "",
                      evidence: {
                        score: bullet.evidence?.score || 0,
                        tier: bullet.evidence?.tier || "medium",
                      },
                      matches: (bullet.matches || []).map((m: any) => ({
                        reqId: m.req_id || "",
                        rel: m.rel || 0,
                        edgeScore: m.edge_score || 0,
                      })),
                      redundancy: {
                        maxSim: bullet.redundancy?.maxSim || 0,
                        blocked: bullet.redundancy?.blocked || false,
                        penalty: bullet.redundancy?.penalty || 0,
                      },
                      rewriteIntent: bullet.rewrite_intent || "medium",
                      reasons: bullet.reasons || [],
                    }))
                  ),
                  awards: (jsonData.selected?.awards || []).map((award: any) => ({
                    bulletId: award.award_id || "",
                    parentType: "award" as const,
                    parentId: award.award_id || "",
                    originalText: award.name || "",
                    evidence: {
                      score: 1.0,
                      tier: "strong" as const,
                    },
                    matches: [],
                    redundancy: {
                      maxSim: 0,
                      blocked: false,
                      penalty: 0,
                    },
                    rewriteIntent: "light" as const,
                    reasons: [award.reason || "budget_available"],
                  })),
                },
                budgetsUsed: {
                  experienceBullets: jsonData.budgets_used?.experience_bullets || 0,
                  projectBullets: jsonData.budgets_used?.project_bullets || 0,
                  awardLines: jsonData.budgets_used?.award_lines || 0,
                  perRole: jsonData.budgets_used?.per_role || {},
                },
                selectionNotes: jsonData.selection_notes,
              });
            } else if (key === "tailored.json") {
              // Store tailored resume
              const finalResume = jsonData.final_resume || {};
              await ctx.runMutation(api.tailoredResumes.createTailoredResume, {
                runId: args.runId,
                modelName: "gpt-4o-mini", // Default model, should be extracted from meta
                tailoredHash: jsonData.tailored_hash || "",
                summary: finalResume.summary || "",
                workExperience: (finalResume.work_experience || []).map((role: any) => ({
                  roleId: role.id || role.role_id || "",
                  company: role.company || "",
                  title: role.role || role.title || "",
                  dateRange: role.dates || role.date_range || "",
                  location: role.location,
                  bullets: (role.bullets || []).map((bullet: any, idx: number) => {
                    const bulletId = `${role.id || role.role_id}_b${idx + 1}`;
                    const change = jsonData.changes?.experience
                      ?.find((c: any) => c.role_id === (role.id || role.role_id))
                      ?.updated_bullets?.find((b: any) => b.bullet_id === bulletId);
                    return {
                      bulletId,
                      originalText: change?.before_text || bullet || "",
                      tailoredText: change?.after_text || bullet || "",
                      wasRewritten: !!change && change.before_text !== change.after_text,
                    };
                  }),
                })),
                projects: (finalResume.projects || []).map((project: any) => ({
                  projectId: project.id || project.project_id || "",
                  name: project.name || "",
                  date: project.date || project.dates,
                  bullets: (project.bullets || []).map((bullet: any, idx: number) => {
                    const bulletId = `${project.id || project.project_id}_b${idx + 1}`;
                    const change = jsonData.changes?.projects
                      ?.find((c: any) => c.project_id === (project.id || project.project_id))
                      ?.updated_bullets?.find((b: any) => b.bullet_id === bulletId);
                    return {
                      bulletId,
                      originalText: change?.before_text || bullet || "",
                      tailoredText: change?.after_text || bullet || "",
                      wasRewritten: !!change && change.before_text !== change.after_text,
                    };
                  }),
                })),
                education: finalResume.education || [],
                skills: finalResume.skills || {
                  programming_languages: [],
                  frameworks_libraries: [],
                  tools_cloud_technologies: [],
                  data_science_analytics: [],
                  machine_learning_ai: [],
                  other_skills: [],
                },
                awards: finalResume.awards,
                selectionEnforcement: {
                  strippedUnselected: jsonData.explainability?.selection_enforcement?.stripped_unselected || 0,
                  truncatedBullets: jsonData.explainability?.selection_enforcement?.truncated_bullets || 0,
                  repairApplied: jsonData.explainability?.selection_enforcement?.repair_applied || false,
                  compliant: jsonData.explainability?.selection_enforcement?.compliant || false,
                  proxyWordCountExceeded: jsonData.explainability?.selection_enforcement?.proxy_word_count_exceeded || false,
                },
                wordCountEstimate: jsonData.explainability?.word_count_estimate || 0,
              });
            }

            results.push({ key, success: true, stored: true });
          } else if (key.endsWith(".tex") || key.endsWith(".pdf")) {
            // Store binary/text artifacts in Convex storage
            let blob: Blob;
            if (artifactResult.isText) {
              blob = new Blob([artifactResult.data], { type: artifactResult.contentType });
            } else {
              blob = new Blob([artifactResult.data], { type: artifactResult.contentType });
            }
            
            const storageId = await ctx.storage.store(blob);
            
            await ctx.runMutation(api.generatedArtifacts.createGeneratedArtifact, {
              runId: args.runId,
              artifactType: key.endsWith(".pdf") ? "pdf" : "tex",
              fileName: key,
              storageId,
              mimeType: artifactResult.contentType,
              sizeBytes: blob.size,
            });

            results.push({ key, success: true, stored: true });
          }
        }
      } catch (error: any) {
        results.push({ key, success: false, error: error.message });
      }
    }

    return { success: true, results };
  },
});

/**
 * Download artifact from backend and store in Convex
 */
export const downloadAndStoreArtifact = action({
  args: {
    runId: v.id("runs"),
    artifactKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Get run to get backend runId
    const run = await ctx.runQuery(api.runs.getRun, {
      runId: args.runId,
    });

    if (!run) {
      throw new Error(`Run ${args.runId} not found`);
    }

    // Download from backend
    const response = await fetch(
      `${BACKEND_BASE_URL}/download/${encodeURIComponent(run.runId)}/${encodeURIComponent(args.artifactKey)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to download artifact: ${response.status}`);
    }

    // Determine content type
    const contentType = response.headers.get("content-type") || "application/json";
    let artifactData: any;
    let isText = false;

    if (contentType.includes("application/json")) {
      artifactData = await response.json();
    } else if (contentType.includes("text/") || args.artifactKey.endsWith(".tex")) {
      artifactData = await response.text();
      isText = true;
    } else {
      // Binary data - get as array buffer
      const buffer = await response.arrayBuffer();
      artifactData = buffer;
    }

    // Return the data for processing
    return {
      success: true,
      artifactKey: args.artifactKey,
      data: artifactData,
      contentType,
      isText,
    };
  },
});

