import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { createHash } from "crypto";
import OpenAI from "openai";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function hashString(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

function generateRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectPlatform(url?: string): string {
  if (!url) return "other";
  const urlLower = url.toLowerCase();
  if (urlLower.includes("linkedin.com")) return "linkedin";
  if (urlLower.includes("greenhouse.io")) return "greenhouse";
  if (urlLower.includes("workday.com") || urlLower.includes("myworkday")) return "workday";
  if (urlLower.includes("lever.co")) return "lever";
  if (urlLower.includes("indeed.com")) return "indeed";
  if (urlLower.includes("glassdoor.com")) return "glassdoor";
  return "other";
}

// Rubric extraction prompt
const RUBRIC_SYSTEM_PROMPT = `You are an expert at analyzing job descriptions and extracting structured requirements.

Given a job description, extract:
1. Must-have requirements (hard requirements that are essential)
2. Nice-to-have requirements (preferred but not essential)
3. Top keywords/skills mentioned
4. Job metadata (title, company, location, etc.)

Return a JSON object with this structure:
{
  "job_meta": {
    "title": "string",
    "company": "string",
    "location": "string",
    "seniority": "string"
  },
  "requirements": [
    {
      "req_id": "R1",
      "type": "must" | "nice",
      "text": "requirement description",
      "category": "technical" | "soft_skill" | "experience" | "education"
    }
  ],
  "keywords": ["keyword1", "keyword2", ...]
}`;

// Tailoring prompt - Matching backend's latest_v4_selection.md strict rules
const TAILOR_SYSTEM_PROMPT = `You are Tailor v4 (Truthful Resume Rewriter).

You will receive:
* A master resume JSON (this is your ONLY truth source)
* JD requirements and keywords extracted from the job description

Your job is to produce a tailored resume that:
1. Rewrites bullets to better align with JD requirements (keyword alignment + clarity)
2. Does NOT invent experience, employers, titles, dates, tools, or metrics not present in the master resume
3. Preserves the resume structure and keeps content concise
4. Selects the most relevant bullets from the master resume for the job

HARD RULES (must follow)
* Output ONLY valid JSON conforming to the provided schema. No markdown.
* Truthfulness is paramount:
    * Every claim MUST be supported by master resume content
    * If a metric is missing in master resume, do NOT create one
    * You may ONLY rephrase, reorder words, and tighten language
    * Do NOT invent new accomplishments, tools, technologies, or numbers
    * Do NOT change company names, job titles, or dates
* Length discipline:
    * Keep bullets ≤ 25 words
    * Prefer strong verb + tool + outcome format
    * Remove redundancy and filler words
* Keyword usage:
    * Use JD keywords naturally where they fit existing content
    * Do NOT keyword-stuff or add keywords for tools/skills not in the master resume
* Selection rules:
    * Select the most relevant bullets that address the job requirements
    * You may include fewer bullets than the original if they are more focused
    * Do NOT add new bullets that weren't in the master resume

What NOT to do:
* Do NOT introduce new jobs, titles, dates, locations, tools, metrics, or projects
* Do NOT fabricate accomplishments or inflate numbers
* Do NOT copy full JD text into bullets
* Do NOT add skills the candidate doesn't have

Return a JSON object with this structure:
{
  "summary": "tailored professional summary (2-3 sentences, based on master resume summary)",
  "experience": [
    {
      "role_id": "string (from master resume)",
      "company": "string (EXACT from master resume)", 
      "title": "string (EXACT from master resume)",
      "dates": "string (EXACT from master resume)",
      "location": "string (from master resume)",
      "bullets": ["rewritten bullet1", "rewritten bullet2", ...]
    }
  ],
  "projects": [
    {
      "project_id": "string (from master resume)",
      "name": "string (EXACT from master resume)",
      "description": "string",
      "bullets": ["rewritten bullet1", "rewritten bullet2", ...]
    }
  ],
  "skills_highlighted": ["skill1", "skill2", ...],
  "requirements_addressed": {
    "R1": "how this resume addresses requirement R1",
    "R2": "how this resume addresses requirement R2"
  }
}`;

interface JobPayload {
  job: {
    title?: string;
    company?: string;
    location?: string;
    description_text?: string;
  };
  meta?: {
    url?: string;
    platform?: string;
  };
}

interface MasterResume {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  experience?: Array<{
    role_id?: string;
    company?: string;
    title?: string;
    dates?: string;
    location?: string;
    bullets?: string[];
  }>;
  projects?: Array<{
    project_id?: string;
    name?: string;
    description?: string;
    bullets?: string[];
    technologies?: string[];
  }>;
  skills?: {
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
    databases?: string[];
    cloud?: string[];
    other?: string[];
  };
  education?: Array<{
    school?: string;
    degree?: string;
    field?: string;
    dates?: string;
    gpa?: string;
  }>;
  certifications?: string[];
}

export async function POST(request: NextRequest) {
  // Check authentication
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if OpenAI is configured
  if (!openai) {
    return NextResponse.json(
      { error: "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { job_payload, master_resume, job_id, master_resume_id } = body as {
      job_payload: JobPayload;
      master_resume: MasterResume;
      job_id?: string;
      master_resume_id?: string;
    };

    if (!job_payload?.job?.description_text) {
      return NextResponse.json(
        { error: "job_payload with job.description_text is required" },
        { status: 400 }
      );
    }

    if (!master_resume) {
      return NextResponse.json(
        { error: "master_resume is required" },
        { status: 400 }
      );
    }

    // Get Convex user
    const convexUser = await convex.query(api.users.getUserByClerkId, { clerkId });
    if (!convexUser) {
      return NextResponse.json({ error: "User not found in Convex" }, { status: 404 });
    }

    const runId = generateRunId();
    const jobText = job_payload.job.description_text;
    const jobTextHash = hashString(jobText);

    // Create or get the job in Convex
    let convexJobId: Id<"jobs"> | null = null;
    try {
      const platform = detectPlatform(job_payload.meta?.url);
      convexJobId = await convex.mutation(api.jobs.createJob, {
        userId: convexUser._id,
        jobUrl: job_payload.meta?.url || "",
        platform,
        title: job_payload.job.title || "Untitled Position",
        company: job_payload.job.company,
        location: job_payload.job.location,
        rawDescription: jobText,
        extractedText: jobText,
        descriptionHash: jobTextHash,
      });
      console.log(`Created/found job in Convex: ${convexJobId}`);
    } catch (e) {
      console.error("Failed to create job in Convex:", e);
      // Continue - we can still analyze without Convex tracking
    }

    // Get the user's active master resume if not provided
    let masterResumeIdToUse: Id<"masterResumes"> | null = master_resume_id as Id<"masterResumes"> | null;
    if (!masterResumeIdToUse) {
      try {
        const resumes = await convex.query(api.masterResumes.getMasterResumes, { userId: convexUser._id });
        const activeResume = resumes?.find((r: any) => r.isActive) || resumes?.[0];
        if (activeResume) {
          masterResumeIdToUse = activeResume._id;
        }
      } catch (e) {
        console.error("Failed to get master resume:", e);
      }
    }

    // Create initial run record in Convex
    let convexRunId: Id<"runs"> | null = null;
    if (convexJobId && masterResumeIdToUse) {
      try {
        convexRunId = await convex.mutation(api.runs.createRun, {
          runId,
          userId: convexUser._id,
          masterResumeId: masterResumeIdToUse,
          jobId: convexJobId,
          status: "running",
          stage: "extracting",
        });
        console.log(`Created run in Convex: ${convexRunId}`);
      } catch (e) {
        console.error("Failed to create run in Convex:", e);
        // Continue without Convex tracking
      }
    } else {
      console.warn("Skipping run creation in Convex - missing jobId or masterResumeId");
    }

    // Helper to update run status
    const updateStatus = async (stage: string, status: "running" | "success" | "error" = "running", errorMessage?: string) => {
      if (convexRunId) {
        try {
          await convex.mutation(api.runs.updateRunStatus, {
            runId: convexRunId as any,
            stage: stage as any,
            status,
            errorMessage,
          });
        } catch (e) {
          console.error("Failed to update run status:", e);
        }
      }
    };

    // Stage 1: Extract rubric from job description
    await updateStatus("rubric_generating");
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:rubric_start',message:'Starting rubric extraction',data:{jobTitle:job_payload.job.title,jobCompany:job_payload.job.company,descLength:jobText?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    
    let rubric: any;
    try {
      const rubricResponse = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: RUBRIC_SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Extract requirements from this job description:\n\n${jobText}\n\nJob Title: ${job_payload.job.title || "Unknown"}\nCompany: ${job_payload.job.company || "Unknown"}\nLocation: ${job_payload.job.location || "Unknown"}` 
          }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const rubricContent = rubricResponse.choices[0]?.message?.content;
      if (!rubricContent) {
        throw new Error("Empty response from rubric extraction");
      }
      rubric = JSON.parse(rubricContent);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:rubric_done',message:'Rubric extracted',data:{extractedTitle:rubric?.job_meta?.title,extractedCompany:rubric?.job_meta?.company,requirementsCount:rubric?.requirements?.length,keywordsCount:rubric?.keywords?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
    } catch (e: any) {
      await updateStatus("ERROR", "error", `Rubric extraction failed: ${e.message}`);
      return NextResponse.json(
        { error: `Rubric extraction failed: ${e.message}` },
        { status: 500 }
      );
    }

    await updateStatus("rubric_generated");

    // Stage 2: Tailor resume
    await updateStatus("tailoring");

    let tailored: any;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:before_tailor',message:'Before tailoring - master_resume passed to LLM',data:{master_resume_exp_count:master_resume?.experience?.length,master_resume_first_exp_company:master_resume?.experience?.[0]?.company,master_resume_first_bullet:master_resume?.experience?.[0]?.bullets?.[0]?.substring(0,100),master_resume_proj_count:master_resume?.projects?.length,prompt_used:'TAILOR_SYSTEM_PROMPT_simple'},timestamp:Date.now(),sessionId:'debug-session',runId:'tailor-debug',hypothesisId:'NEW_A'})}).catch(()=>{});
      // #endregion
      const tailorResponse = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: TAILOR_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Tailor this resume for the job. IMPORTANT: The master resume is your ONLY source of truth. Do NOT invent any new information.

## Job Requirements (for keyword alignment only):
${JSON.stringify(rubric.requirements || [], null, 2)}

## Keywords to incorporate (ONLY if the skill exists in master resume):
${(rubric.keywords || []).join(", ")}

## Master Resume (TRUTH SOURCE - do not invent anything not in here):
${JSON.stringify(master_resume, null, 2)}

CRITICAL REMINDERS:
- Keep all company names, job titles, and dates EXACTLY as in master resume
- Do NOT create metrics or numbers that don't exist in master resume
- Do NOT add tools/technologies the candidate hasn't used
- Only rephrase existing bullets to better highlight relevant keywords
- Select the most relevant bullets, but do not fabricate new ones`
          }
        ],
        temperature: 0.2, // Lower temperature for more consistent output
        response_format: { type: "json_object" },
      });

      const tailoredContent = tailorResponse.choices[0]?.message?.content;
      if (!tailoredContent) {
        throw new Error("Empty response from tailoring");
      }
      tailored = JSON.parse(tailoredContent);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:tailored_done',message:'Tailored resume generated',data:{hasSummary:!!tailored?.summary,experienceCount:tailored?.experience?.length,projectsCount:tailored?.projects?.length,skillsHighlighted:tailored?.skills_highlighted?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H1-tailored'})}).catch(()=>{});
      // #endregion
      // #region agent log
      const originalFirstBullet = master_resume?.experience?.[0]?.bullets?.[0];
      const tailoredFirstBullet = tailored?.experience?.[0]?.bullets?.[0];
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:bullet_comparison',message:'Comparing original vs tailored bullet',data:{original_first_bullet:originalFirstBullet?.substring(0,150),tailored_first_bullet:tailoredFirstBullet?.substring(0,150),bullets_are_different:originalFirstBullet !== tailoredFirstBullet,original_company:master_resume?.experience?.[0]?.company,tailored_company:tailored?.experience?.[0]?.company},timestamp:Date.now(),sessionId:'debug-session',runId:'tailor-debug',hypothesisId:'NEW_B'})}).catch(()=>{});
      // #endregion
    } catch (e: any) {
      await updateStatus("ERROR", "error", `Tailoring failed: ${e.message}`);
      return NextResponse.json(
        { error: `Tailoring failed: ${e.message}` },
        { status: 500 }
      );
    }

    await updateStatus("tailored");
    
    // Store tailored resume in Convex
    if (convexRunId && tailored) {
      try {
        // Transform LLM output to match Convex schema
        const workExperience = (tailored.experience || []).map((exp: any, idx: number) => ({
          roleId: exp.role_id || `role_${idx}`,
          company: exp.company || "Unknown",
          title: exp.title || "Unknown",
          dateRange: exp.dates || "",
          location: exp.location,
          bullets: (exp.bullets || []).map((bullet: string, bIdx: number) => ({
            bulletId: `${exp.role_id || `role_${idx}`}_b${bIdx}`,
            originalText: bullet, // In this simplified flow, original = tailored
            tailoredText: bullet,
            wasRewritten: true,
          })),
        }));
        
        const projects = (tailored.projects || []).map((proj: any, idx: number) => ({
          projectId: proj.project_id || `proj_${idx}`,
          name: proj.name || "Unknown Project",
          date: proj.date,
          bullets: (proj.bullets || []).map((bullet: string, bIdx: number) => ({
            bulletId: `${proj.project_id || `proj_${idx}`}_b${bIdx}`,
            originalText: bullet,
            tailoredText: bullet,
            wasRewritten: true,
          })),
        }));
        
        const education = (master_resume.education || []).map((edu: any) => ({
          institution: edu.school || edu.institution || "Unknown",
          degree: edu.degree || "Unknown",
          dates: edu.dates || "",
          location: edu.location,
          gpa: edu.gpa,
        }));
        
        const skills = {
          programming_languages: master_resume.skills?.languages || [],
          frameworks_libraries: master_resume.skills?.frameworks || [],
          tools_cloud_technologies: master_resume.skills?.tools || [],
          data_science_analytics: master_resume.skills?.databases || [],
          machine_learning_ai: master_resume.skills?.cloud || [],
          other_skills: master_resume.skills?.other || [],
        };
        
        await convex.mutation(api.tailoredResumes.createTailoredResume, {
          runId: convexRunId,
          modelName: process.env.OPENAI_MODEL || "gpt-4o-mini",
          tailoredHash: hashString(JSON.stringify(tailored)),
          summary: tailored.summary || "",
          workExperience,
          projects,
          education,
          skills,
          selectionEnforcement: {
            strippedUnselected: 0,
            truncatedBullets: 0,
            repairApplied: false,
            compliant: true,
            proxyWordCountExceeded: false,
          },
          wordCountEstimate: JSON.stringify(tailored).split(/\s+/).length,
        });
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:tailored_stored',message:'Tailored resume stored in Convex',data:{runId:convexRunId?.toString(),workExpCount:workExperience.length,projectsCount:projects.length},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H1-tailored'})}).catch(()=>{});
        // #endregion
      } catch (e: any) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:tailored_error',message:'Failed to store tailored resume',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H1-tailored'})}).catch(()=>{});
        // #endregion
        console.error("Failed to store tailored resume:", e);
      }
    }

    // Stage 3: Generate simple LaTeX (without PDF compilation for now)
    await updateStatus("generating_latex");

    let latex: string;
    try {
      latex = generateSimpleLatex(master_resume, tailored, rubric);
    } catch (e: any) {
      await updateStatus("ERROR", "error", `LaTeX generation failed: ${e.message}`);
      return NextResponse.json(
        { error: `LaTeX generation failed: ${e.message}` },
        { status: 500 }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:before_done',message:'Before marking done - checking jdRubric storage',data:{convexRunId,convexJobId:convexJobId?.toString(),rubricJobMeta:rubric?.job_meta,hasRequirements:!!rubric?.requirements?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    // Store jdRubric in Convex if we have a run ID
    if (convexRunId && rubric) {
      try {
        await convex.mutation(api.jdRubrics.createJdRubric, {
          runId: convexRunId,
          version: "v1",
          jobMeta: {
            jobTitle: rubric.job_meta?.title || job_payload.job.title || "Unknown",
            company: rubric.job_meta?.company || job_payload.job.company,
            location: rubric.job_meta?.location || job_payload.job.location,
            employmentType: rubric.job_meta?.employment_type,
            seniority: rubric.job_meta?.seniority,
            jobUrl: job_payload.meta?.url,
            platform: detectPlatform(job_payload.meta?.url),
          },
          requirements: (rubric.requirements || []).map((req: any, idx: number) => ({
            reqId: req.req_id || `R${idx + 1}`,
            type: req.type === "must" ? "must" : "nice",
            weight: req.weight || (req.type === "must" ? 3 : 1),
            requirement: req.text || req.requirement || "",
            jdEvidence: req.evidence || [],
            category: req.category || "technical",
          })),
          keywords: (rubric.keywords || []).map((kw: any) => ({
            term: typeof kw === "string" ? kw : kw.term || kw,
            importance: typeof kw === "string" ? 3 : (kw.importance || 3),
            type: typeof kw === "string" ? "skill" : (kw.type || "skill"),
            jdEvidence: [],
          })),
          rubricHash: hashString(JSON.stringify(rubric)),
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:jdRubric_stored',message:'JD Rubric stored in Convex',data:{runId:convexRunId?.toString()},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
      } catch (e: any) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:jdRubric_error',message:'Failed to store jdRubric',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        console.error("Failed to store jdRubric:", e);
      }
    }

    // Update job with better metadata from rubric extraction
    if (convexJobId && rubric?.job_meta) {
      try {
        const extractedTitle = rubric.job_meta.title;
        const extractedCompany = rubric.job_meta.company;
        if (extractedTitle || extractedCompany) {
          await convex.mutation(api.jobs.updateJob, {
            jobId: convexJobId,
            title: extractedTitle || undefined,
            company: extractedCompany || undefined,
            location: rubric.job_meta.location || undefined,
            seniority: rubric.job_meta.seniority || undefined,
          });
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/analyze/route.ts:job_updated',message:'Job updated with rubric metadata',data:{jobId:convexJobId?.toString(),newTitle:extractedTitle,newCompany:extractedCompany},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
        }
      } catch (e: any) {
        console.error("Failed to update job with rubric metadata:", e);
      }
    }

    // Mark as done
    await updateStatus("DONE", "success");

    // Return results
    return NextResponse.json({
      success: true,
      run_id: runId,
      status: "success",
      stage: "DONE",
      message: "Resume tailored successfully",
      artifacts: {
        rubric,
        tailored,
        latex,
        job_text_hash: jobTextHash,
      },
      convex_run_id: convexRunId,
    });

  } catch (error: any) {
    console.error("Analyze API error:", error);
    return NextResponse.json(
      { error: "Analysis failed: " + (error.message || "Unknown error") },
      { status: 500 }
    );
  }
}

// Simple LaTeX generator (without Claude, just string templates)
function generateSimpleLatex(
  masterResume: MasterResume,
  tailored: any,
  rubric: any
): string {
  const contact = masterResume.contact || {};
  const name = contact.name || "Your Name";
  const email = contact.email || "";
  const phone = contact.phone || "";
  const linkedin = contact.linkedin || "";
  const github = contact.github || "";

  const summary = tailored.summary || masterResume.summary || "";
  
  const experienceLatex = (tailored.experience || [])
    .map((exp: any) => {
      const bullets = (exp.bullets || [])
        .map((b: string) => `    \\item ${escapeLatex(b)}`)
        .join("\n");
      return `\\resumeSubheading
    {${escapeLatex(exp.title || "")}}{${escapeLatex(exp.dates || "")}}
    {${escapeLatex(exp.company || "")}}{${escapeLatex(exp.location || "")}}
  \\resumeItemListStart
${bullets}
  \\resumeItemListEnd`;
    })
    .join("\n\n");

  const projectsLatex = (tailored.projects || [])
    .map((proj: any) => {
      const bullets = (proj.bullets || [])
        .map((b: string) => `    \\item ${escapeLatex(b)}`)
        .join("\n");
      return `\\resumeProjectHeading
    {\\textbf{${escapeLatex(proj.name || "")}} $|$ \\emph{${escapeLatex(proj.description || "")}}}{}
  \\resumeItemListStart
${bullets}
  \\resumeItemListEnd`;
    })
    .join("\n\n");

  const skills = masterResume.skills || {};
  const skillsLatex = Object.entries(skills)
    .filter(([_, values]) => Array.isArray(values) && values.length > 0)
    .map(([category, values]) => 
      `\\textbf{${escapeLatex(category)}:} ${(values as string[]).map(escapeLatex).join(", ")}`
    )
    .join(" \\\\\n     ");

  const educationLatex = (masterResume.education || [])
    .map((edu) => `\\resumeSubheading
    {${escapeLatex(edu.school || "")}}{${escapeLatex(edu.location || "")}}
    {${escapeLatex(edu.degree || "")}${edu.field ? ` in ${escapeLatex(edu.field)}` : ""}}{${escapeLatex(edu.dates || "")}}`)
    .join("\n\n");

  return `%-------------------------
% Resume in LaTeX
% Generated by ResumeGen Tracker
%-------------------------

\\documentclass[letterpaper,11pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & #2 \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=0.15in]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}

\\begin{document}

%----------HEADING----------
\\begin{center}
    \\textbf{\\Huge \\scshape ${escapeLatex(name)}} \\\\ \\vspace{1pt}
    \\small ${phone ? escapeLatex(phone) + " $|$ " : ""}${email ? "\\href{mailto:" + email + "}{" + escapeLatex(email) + "}" : ""}${linkedin ? " $|$ \\href{" + linkedin + "}{LinkedIn}" : ""}${github ? " $|$ \\href{" + github + "}{GitHub}" : ""}
\\end{center}

${summary ? `
%-----------SUMMARY-----------
\\section{Summary}
${escapeLatex(summary)}
` : ""}

%-----------EXPERIENCE-----------
\\section{Experience}
\\resumeSubHeadingListStart
${experienceLatex}
\\resumeSubHeadingListEnd

%-----------PROJECTS-----------
\\section{Projects}
\\resumeSubHeadingListStart
${projectsLatex}
\\resumeSubHeadingListEnd

%-----------SKILLS-----------
\\section{Technical Skills}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     ${skillsLatex}
    }}
 \\end{itemize}

%-----------EDUCATION-----------
\\section{Education}
\\resumeSubHeadingListStart
${educationLatex}
\\resumeSubHeadingListEnd

\\end{document}
`;
}

function escapeLatex(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "analyze",
    openai_configured: !!openai,
    convex_configured: !!process.env.NEXT_PUBLIC_CONVEX_URL,
  });
}

