import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { createHash } from "crypto";
import OpenAI from "openai";
import { Id } from "@/convex/_generated/dataModel";
import { getFeatureAccessForUser } from "@/lib/featureAccess";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function hashString(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

function deriveModelKey(modelName: string): string {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
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

const JOB_DESCRIPTION_FILTER_SYSTEM_PROMPT = `You are a job description cleaning assistant.
The input contains a scraped job listing that mixes the actual job description content with platform UI, stats, social highlights, and marketing copy.
Return only the real job description text: the title/company/location block, summary, sections such as About the job, responsibilities, qualifications, benefits, compensation, logistics, and any other hiring details.
Remove noise such as "Set alert for similar jobs", candidate-count widgets, promotional footers, social links, and any content that is not part of the job description itself.
Preserve the original paragraphs and bullet lists, keep the order of sections, and do not invent any new information or comments. Return plain text only.`;
const JOB_DESCRIPTION_FILTER_TEMPERATURE = 0.1;
const JOB_DESCRIPTION_FILTER_MAX_TOKENS = 1500;

async function cleanJobDescription(rawText: string): Promise<string> {
  const text = (rawText || "").trim();
  if (!text || !openai) return rawText;
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: JOB_DESCRIPTION_FILTER_TEMPERATURE,
      max_tokens: JOB_DESCRIPTION_FILTER_MAX_TOKENS,
      messages: [
        { role: "system", content: JOB_DESCRIPTION_FILTER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Clean the following scraped job listing and return only the job description text (title, summary, responsibilities, qualifications, benefits, compensation, logistics, etc.). Remove platform UI noise, widgets, recommended jobs, and marketing copy. Do not invent new content.\n\nOriginal text:\n${text}`
        }
      ]
    });
    const cleaned = response.choices?.[0]?.message?.content;
    if (cleaned) {
      const stripped = stripMarkdownFences(cleaned.trim());
      if (stripped) return stripped;
    }
  } catch (error) {
    console.warn("Job description cleaning failed:", error);
  }
  return rawText;
}

function stripMarkdownFences(text: string): string {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/^```[\w\s]*\s*/im, "");
  cleaned = cleaned.replace(/\s*```$/im, "");
  return cleaned.trim();
}

const STRUCTURED_JOB_SYSTEM_PROMPT = `You are a hiring analyst who reads job descriptions and returns a structured outline of the sections that are present.
Respond with a JSON array only. Each entry in the array should be an object with two keys: "title" and "content".
* "title" should be the section heading (e.g., "About the Job", "Responsibilities", "Required Qualifications", "Preferred Qualifications", "Compensation", "Benefits", "Logistics", "Equal Opportunity Statement"). If a section appears multiple times, keep the original order but only output one entry per heading.
* "content" should contain the paragraphs or bullet list that belong to that section, preserving spacing and bullet markers.
Retain the order of sections as they appear. If no explicit heading exists, return a single object with title "About the Job" and the entire description as content.
Do not include any markdown fences, explanations, or commentary—only valid JSON.`;
const STRUCTURED_JOB_TEMPERATURE = 0.2;
const STRUCTURED_JOB_MAX_TOKENS = 1200;

interface StructuredSection {
  title: string;
  content: string;
}

async function structureJobDescription(text: string): Promise<StructuredSection[]> {
  if (!text || !openai) return [];
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: STRUCTURED_JOB_TEMPERATURE,
      max_tokens: STRUCTURED_JOB_MAX_TOKENS,
      messages: [
        { role: "system", content: STRUCTURED_JOB_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the structured sections from the following cleaned job description. Return a JSON array and nothing else.\n\nJob Description:\n${text}`,
        },
      ],
    });
    const candidate = response.choices?.[0]?.message?.content;
    if (!candidate) return [];
    const parsed = JSON.parse(stripMarkdownFences(candidate)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (
          typeof item !== "object" ||
          item === null ||
          typeof (item as any).title !== "string" ||
          typeof (item as any).content !== "string"
        ) {
          return null;
        }
        return {
          title: (item as any).title.trim(),
          content: (item as any).content.trim(),
        };
      })
      .filter(
        (section): section is StructuredSection =>
          Boolean(section && section.title && section.content)
      )
      .slice(0, 12);
  } catch (error) {
    console.warn("Job structure extraction failed:", error);
    return [];
  }
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
const TAILOR_SHARED_SYSTEM_PROMPT = `You are Tailor v4 (Truthful Resume Rewriter).

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

const FREE_TIER_USER_PROMPT = `ATS-Pro Resume Optimizer v2025.2-R3 (Tailoring-Only Prompt).

You are “ATS-Pro Resume Optimizer v2025.2-R3,” an advanced AI model designed to tailor a resume to a provided job description rubric/requirements. Your job is to rewrite and reorganize ONLY what already exists in the original resume (100% faithful; no invented facts) to maximize ATS match and recruiter readability.

Inputs
<original_resume>
{{MASTER_RESUME}}
</original_resume>

<job_description>
{{JD_RUBRICS}}
</job_description>

Global Settings (Hard Constraints)
- Temperature target: 0.3 (prioritize accuracy and faithfulness).
- Output length: One-page resume (≈650–750 words).
- Word-count limit: ≤ 800 words total inside "optimized_resume".
- Experience caps: Max 4 Work Experience entries; Max 3 Projects entries.
- Bullet cap: Max 25 bullets total across Experience + Projects.
- Truthfulness: 100% faithful to original resume. Do NOT invent metrics, employers, dates, titles, tools, certifications, degrees, publications, awards, or responsibilities.
- Do not add coursework.
- Formatting: Plain text or basic Markdown only inside JSON strings. Single-column. No tables, text boxes, graphics, multi-column layouts, or underlining.
- Dates: MM/YYYY only (normalize if needed using information present in the resume).
- Bullets: End every bullet with a full stop. Keep bullets ≤ 25 words. Professional, concise, metric-driven, achievement-oriented.
- Emphasis: Bold key keywords ONLY inside Work Experience bullets (not in summary, projects, skills, or requirements).
- Output must be ONLY valid JSON. No markdown. No extra text.

Important Interpretation Rule
- Treat {{JD_RUBRICS}} as the authoritative “requirements + keywords” rubric already extracted upstream.
- Do NOT re-extract keywords/requirements. Do NOT output any keyword lists or analysis.
- Use the requirement IDs (e.g., R1, R2, …) and any priority signals present in {{JD_RUBRICS}} as your optimization target.

Tailoring Workflow (Do this internally; DO NOT output these steps)
1) Resume Flaw Detection
- Identify weak bullets (vague, buzzwordy, missing outcomes, unclear scope).
- Flag any work entries < 3 months as “brief-gig” (only if duration is inferable from resume dates).

2) Relevance Scoring & Selection (Using the Rubric)
- For every role/project in the resume, compute a Relevance Score based on overlap with rubric keywords/requirements in {{JD_RUBRICS}}.
- Select top 4 work entries (keep fewer if resume has fewer).
- Select top 3 projects.

3) Bullet Filtering (Using the Rubric)
- Within chosen roles/projects: rank bullets by relevance + impact.
- If > 25 bullets total, drop or compress lowest-relevance bullets first.
- Prefer bullets that evidence rubric requirements (R#) and contain measurable outcomes.

4) Summary Enhancement (Tailored to Rubric)
- Write a 3-line summary:
  (a) Years of experience ONLY if explicitly stated or unambiguously derivable from resume; otherwise omit years.
  (b) Standout result using an existing metric/result from resume.
  (c) Value proposition aligned to the rubric with 2–3 top rubric keywords woven naturally (no bold here).

5) Experience Rewrite (Impact + ATS)
- Rewrite bullets using:
  [Action verb] + [Specific task] + [Tools/Methods] + [Outcome/Impact].
- Add 1–2 rubric keywords per bullet ONLY when truthful and supported by the original resume.
- Expand acronyms on first mention in each role if needed (e.g., “Retrieval-Augmented Generation (RAG)”).
- Use bold ONLY for 1–3 high-signal rubric keywords per bullet in Work Experience.

6) Projects Rewrite
- Keep project description concise and faithful.
- Bullets follow the same formula; no bold in projects.

7) Skills Highlighting
- "skills_highlighted" must be a flat list of the most rubric-relevant skills/tools.
- Include ONLY skills present in the original resume.
- Prefer exact rubric wording when the resume supports it.

8) Final Trimming & Compliance
- If "optimized_resume" exceeds 800 words or bullets exceed 25:
  - Trim lowest-relevance bullets first (those least connected to rubric requirements).
  - Keep the most impactful, rubric-aligned achievements.

Requirements Mapping + Diagnostics
- "requirements_addressed":
  - Use the requirement IDs exactly as provided in {{JD_RUBRICS}} (e.g., R1, R2, ...).
  - For each Rx, write 1–2 sentences explaining how the resume supports it (reference specific roles/projects/tools).
  - If not supported by resume: "Not evidenced in resume."

- "diagnostics" (short, recruiter-facing; not internal reasoning):
  - Include: estimated word count, bullet count, which roles/projects were selected, and 3–6 key gaps/risks (if any).
  - Mention any “brief-gig” flagged entries (if applicable).

- "reasoning_summary" (very short; 3–6 bullets max):
  - High-level summary of what was prioritized/dropped and why (no step-by-step reasoning or scoring math).

Cover Letter
- 200–300 words unless the rubric explicitly requires otherwise.
- Must be faithful to the resume; do not add new claims.
- Tone: confident, human, energetic, professional.
- Avoid em dashes. Use normal punctuation.

Final Output JSON (Output ONLY this; valid JSON)
{
  "optimized_resume": {
    "summary": "string",
    "experience": [
      {
        "role_id": "string",
        "company": "string",
        "title": "string",
        "dates": "string",
        "location": "string",
        "bullets": ["string"]
      }
    ],
    "projects": [
      {
        "project_id": "string",
        "name": "string",
        "description": "string",
        "bullets": ["string"]
      }
    ],
    "skills_highlighted": ["string"],
    "requirements_addressed": {
      "R1": "string"
    }
  },
  "cover_letter": "string",
  "diagnostics": "string",
  "reasoning_summary": "string"
}

Hard Output Rule:
- Output ONLY valid JSON. No markdown. No explanations. No extra keys.
`;

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
    links?: string[];
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

type TailoringStrategy = "free" | "premium";

async function buildMasterResumePayload(
  masterResumeId: Id<"masterResumes">
): Promise<MasterResume | null> {
  const masterResume = await convex.query(api.masterResumes.getMasterResume, {
    resumeId: masterResumeId,
  });

  if (!masterResume) return null;

  const resumeBullets = await convex.query(api.resumeBullets.getResumeBullets, {
    masterResumeId,
  });

  const experienceBullets = (resumeBullets || []).filter(
    (bullet: any) => bullet.parentType === "experience"
  );
  const projectBullets = (resumeBullets || []).filter(
    (bullet: any) => bullet.parentType === "project"
  );

  const experienceMap = new Map<string, any>();
  experienceBullets.forEach((bullet: any) => {
    const key = bullet.parentId;
    if (!experienceMap.has(key)) {
      experienceMap.set(key, {
        role_id: key,
        company: bullet.company || "",
        title: bullet.role || "",
        dates: bullet.dates || "",
        location: bullet.location || "",
        bullets: [],
      });
    }
    experienceMap.get(key)!.bullets.push(bullet.text);
  });

  const projectsMap = new Map<string, any>();
  projectBullets.forEach((bullet: any) => {
    const key = bullet.parentId;
    if (!projectsMap.has(key)) {
      projectsMap.set(key, {
        project_id: key,
        name: bullet.projectName || key,
        dates: bullet.dates || "",
        description: "",
        bullets: [],
        technologies: bullet.tags || [],
      });
    }
    projectsMap.get(key)!.bullets.push(bullet.text);
  });

  return {
    contact: {
      name: masterResume.header?.fullName,
      email: masterResume.header?.email,
      phone: masterResume.header?.phone,
      location: masterResume.header?.address,
    },
    summary: masterResume.summary || "",
    experience: Array.from(experienceMap.values()),
    projects: Array.from(projectsMap.values()),
    skills: {
      languages: masterResume.skills?.programming_languages || [],
      frameworks: masterResume.skills?.frameworks_libraries || [],
      tools: masterResume.skills?.tools_cloud_technologies || [],
      databases: [],
      cloud: [],
      other: [
        ...(masterResume.skills?.data_science_analytics || []),
        ...(masterResume.skills?.machine_learning_ai || []),
        ...(masterResume.skills?.other_skills || []),
      ],
    },
    education: (masterResume.education || []).map((edu: any) => ({
      school: edu.institution,
      degree: edu.degree,
      dates: edu.dates,
      location: edu.location,
      gpa: edu.gpa,
    })),
    certifications: [],
  };
}

function stripLinksFromMasterResume(masterResume: MasterResume): MasterResume {
  return {
    ...masterResume,
    contact: masterResume.contact
      ? {
          ...masterResume.contact,
          linkedin: undefined,
          github: undefined,
        }
      : undefined,
    projects: (masterResume.projects || []).map((proj) => ({
      ...proj,
      links: undefined,
    })),
  };
}

async function resolveTailoringStrategy(
  clerkId: string
): Promise<TailoringStrategy> {
  const featureAccess = await getFeatureAccessForUser(clerkId);
  if (featureAccess.has("ml_based_resume_tailoring")) return "premium";
  if (featureAccess.has("resume_refactoring_with_llm")) return "free";
  return "free";
}

async function handleStartPhase(body: any, clerkId: string) {
  const { job_payload, master_resume_id } = body as {
    job_payload: JobPayload;
    master_resume_id?: string;
  };

  if (!job_payload?.job?.description_text) {
    return NextResponse.json(
      { error: "job_payload with job.description_text is required" },
      { status: 400 }
    );
  }

  const convexUser = await convex.query(api.users.getUserByClerkId, { clerkId });
  if (!convexUser) {
    return NextResponse.json({ error: "User not found in Convex" }, { status: 404 });
  }

  const runId = generateRunId();
  const rawJobText = job_payload.job.description_text || "";
  const jobTextHash = hashString(rawJobText);

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
      rawDescription: rawJobText,
      extractedText: rawJobText,
      descriptionHash: jobTextHash,
    });
  } catch (e) {
    console.error("Failed to create job in Convex:", e);
  }

  if (!convexJobId) {
    return NextResponse.json(
      { error: "Failed to create job record" },
      { status: 500 }
    );
  }

  let masterResumeIdToUse: Id<"masterResumes"> | null =
    (master_resume_id as Id<"masterResumes">) || null;
  if (!masterResumeIdToUse) {
    const activeResume = await convex.query(api.masterResumes.getActiveMasterResume, {
      userId: convexUser._id,
    });
    if (activeResume) {
      masterResumeIdToUse = activeResume._id;
    }
  }

  if (!masterResumeIdToUse) {
    return NextResponse.json(
      { error: "Master resume not found" },
      { status: 400 }
    );
  }

  let convexRunId: Id<"runs"> | null = null;
  try {
    convexRunId = await convex.mutation(api.runs.createRun, {
      runId,
      userId: convexUser._id,
      masterResumeId: masterResumeIdToUse,
      jobId: convexJobId,
      status: "pending",
      stage: "queued",
    });
  } catch (e) {
    console.error("Failed to create run in Convex:", e);
    return NextResponse.json(
      { error: "Failed to create run record" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    run_id: runId,
    convex_run_id: convexRunId,
    job_id: convexJobId,
    master_resume_id: masterResumeIdToUse,
  });
}

async function handleExecutePhase(body: any, clerkId: string) {
  const runId = body.run_id || body.runId;
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const convexUser = await convex.query(api.users.getUserByClerkId, { clerkId });
  if (!convexUser) {
    return NextResponse.json({ error: "User not found in Convex" }, { status: 404 });
  }

  const run = await convex.query(api.runs.getRunByRunId, { runId });
  if (!run || run.isDeleted) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.userId !== convexUser._id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const job = await convex.query(api.jobs.getJob, { jobId: run.jobId });
  if (!job?.rawDescription) {
    return NextResponse.json({ error: "Job description missing" }, { status: 400 });
  }

  let masterResume = body.master_resume as MasterResume | undefined;
  if (!masterResume) {
    masterResume = await buildMasterResumePayload(run.masterResumeId);
  }
  if (!masterResume) {
    return NextResponse.json({ error: "Master resume not available" }, { status: 400 });
  }
  masterResume = stripLinksFromMasterResume(masterResume);

  await convex.mutation(api.runs.updateRunStatus, {
    runId: run._id,
    status: "running",
    stage: "analyzing",
  });

  const strategy = await resolveTailoringStrategy(clerkId);
  const freeModel = process.env.OPENAI_CHEAP_MODEL || "gpt-4o-mini";
  const premiumModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const modelName = strategy === "free" ? freeModel : premiumModel;

  await convex.mutation(api.runs.updateRunStatus, {
    runId: run._id,
    runStrategy: strategy,
    primaryModelKey: deriveModelKey(modelName),
    modelVariants: [modelName],
  });

  const rawJobText = job.rawDescription || "";
  const filteredJobText = await cleanJobDescription(rawJobText);
  const structuredJobSections = await structureJobDescription(filteredJobText);
  const jobTextHash = hashString(filteredJobText);

  if (structuredJobSections.length || filteredJobText !== job.extractedText) {
    try {
      await convex.mutation(api.jobs.updateJob, {
        jobId: job._id,
        extractedText: filteredJobText,
        structuredDescription: structuredJobSections.length
          ? structuredJobSections
          : undefined,
      });
    } catch (error) {
      console.error("Failed to patch structured description:", error);
    }
  }

  const updateStatus = async (
    stage: string,
    status: "running" | "success" | "error" = "running",
    errorMessage?: string
  ) => {
    await convex.mutation(api.runs.updateRunStatus, {
      runId: run._id,
      stage: stage as any,
      status,
      errorMessage,
    });
  };

  await updateStatus("rubric_generating");

  let rubric: any;
  try {
    const rubricResponse = await openai.chat.completions.create({
      model: premiumModel,
      messages: [
        { role: "system", content: RUBRIC_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract requirements from this job description:\n\n${filteredJobText}\n\nJob Title: ${job.title || "Unknown"}\nCompany: ${job.company || "Unknown"}\nLocation: ${job.location || "Unknown"}`,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const rubricContent = rubricResponse.choices[0]?.message?.content;
    if (!rubricContent) {
      throw new Error("Empty response from rubric extraction");
    }
    rubric = JSON.parse(rubricContent);
  } catch (e: any) {
    await updateStatus("ERROR", "error", `Rubric extraction failed: ${e.message}`);
    return NextResponse.json(
      { error: `Rubric extraction failed: ${e.message}` },
      { status: 500 }
    );
  }

  await updateStatus("rubric_generated");
  await updateStatus("tailoring");

  let tailored: any;
  let coverLetter = "";
  let diagnostics = "";
  let reasoningSummary = "";
  try {
    const userPrompt =
      strategy === "free"
        ? FREE_TIER_USER_PROMPT.replace(
            "{{MASTER_RESUME}}",
            JSON.stringify(masterResume, null, 2)
          ).replace("{{JD_RUBRICS}}", JSON.stringify(rubric, null, 2))
        : `Tailor this resume for the job. IMPORTANT: The master resume is your ONLY source of truth. Do NOT invent any new information.

## Job Requirements (for keyword alignment only):
${JSON.stringify(rubric.requirements || [], null, 2)}

## Keywords to incorporate (ONLY if the skill exists in master resume):
${(rubric.keywords || []).join(", ")}

## Master Resume (TRUTH SOURCE - do not invent anything not in here):
${JSON.stringify(masterResume, null, 2)}

CRITICAL REMINDERS:
- Keep all company names, job titles, and dates EXACTLY as in master resume
- Do NOT create metrics or numbers that don't exist in master resume
- Do NOT add tools/technologies the candidate hasn't used
- Only rephrase existing bullets to better highlight relevant keywords
- Select the most relevant bullets, but do not fabricate new ones`;

    const tailorResponse = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: TAILOR_SHARED_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const tailoredContent = tailorResponse.choices[0]?.message?.content;
    if (!tailoredContent) {
      throw new Error("Empty response from tailoring");
    }

    const parsed = JSON.parse(stripMarkdownFences(tailoredContent));
    if (strategy === "free") {
      tailored = parsed.optimized_resume || parsed.optimizedResume || parsed.tailored_resume || parsed;
      coverLetter = parsed.cover_letter || "";
      diagnostics = parsed.diagnostics || "";
      reasoningSummary = parsed.reasoning_summary || "";
    } else {
      tailored = parsed;
      coverLetter = parsed.cover_letter || "";
      diagnostics = parsed.diagnostics || "";
      reasoningSummary = parsed.reasoning_summary || "";
    }
  } catch (e: any) {
    await updateStatus("ERROR", "error", `Tailoring failed: ${e.message}`);
    return NextResponse.json(
      { error: `Tailoring failed: ${e.message}` },
      { status: 500 }
    );
  }

  await updateStatus("tailored");

  if (tailored) {
    try {
      const buildMasterBulletsMap = (
        entries: any[] = [],
        idFields: string[],
        fallbackPrefix: string
      ) => {
        const map = new Map<string, string[]>();
        entries.forEach((entry, idx) => {
          const key =
            idFields
              .map((field) => entry?.[field])
              .find((value) => typeof value === "string" && value.length > 0) ??
            `${fallbackPrefix}_${idx}`;
          map.set(key, entry?.bullets || []);
        });
        return map;
      };

      const masterExperienceBullets = buildMasterBulletsMap(
        masterResume?.experience,
        ["role_id", "roleId"],
        "role"
      );
      const masterProjectBullets = buildMasterBulletsMap(
        masterResume?.projects,
        ["project_id", "projectId"],
        "proj"
      );
      const workExperience = (tailored.experience || []).map((exp: any, idx: number) => {
        const roleKey = exp.role_id || exp.roleId || `role_${idx}`;
        const masterBullets = masterExperienceBullets.get(roleKey) || [];
        return {
          roleId: roleKey,
          company: exp.company || "Unknown",
          title: exp.title || "Unknown",
          dateRange: exp.dates || "",
          location: exp.location,
          bullets: (exp.bullets || []).map((bullet: string, bIdx: number) => {
            const originalText = masterBullets[bIdx] || bullet;
            return {
              bulletId: `${roleKey}_b${bIdx}`,
              originalText,
              tailoredText: bullet,
              wasRewritten: originalText !== bullet,
            };
          }),
        };
      });

      const projects = (tailored.projects || []).map((proj: any, idx: number) => {
        const projectKey = proj.project_id || proj.projectId || `proj_${idx}`;
        const masterBullets = masterProjectBullets.get(projectKey) || [];
        return {
          projectId: projectKey,
          name: proj.name || "Unknown Project",
          date: proj.date,
          bullets: (proj.bullets || []).map((bullet: string, bIdx: number) => {
            const originalText = masterBullets[bIdx] || bullet;
            return {
              bulletId: `${projectKey}_b${bIdx}`,
              originalText,
              tailoredText: bullet,
              wasRewritten: originalText !== bullet,
            };
          }),
        };
      });

      const education = (masterResume.education || []).map((edu: any) => ({
        institution: edu.school || edu.institution || "Unknown",
        degree: edu.degree || "Unknown",
        dates: edu.dates || "",
        location: edu.location,
        gpa: edu.gpa,
      }));

      const skills = {
        programming_languages: masterResume.skills?.languages || [],
        frameworks_libraries: masterResume.skills?.frameworks || [],
        tools_cloud_technologies: masterResume.skills?.tools || [],
        data_science_analytics: masterResume.skills?.databases || [],
        machine_learning_ai: masterResume.skills?.cloud || [],
        other_skills: masterResume.skills?.other || [],
      };

      await convex.mutation(api.tailoredResumes.createTailoredResume, {
        runId: run._id,
        modelName,
        tailoredHash: hashString(JSON.stringify(tailored)),
        summary: tailored.summary || "",
        coverLetter,
        diagnostics,
        reasoningSummary,
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
    } catch (e: any) {
      console.error("Failed to store tailored resume:", e);
    }
  }

  await updateStatus("generating_latex");

  let latex: string;
  try {
    const masterResumeRecord = await convex.query(api.masterResumes.getMasterResume, {
      resumeId: run.masterResumeId,
    });
    const linkData = Array.isArray(masterResumeRecord?.links)
      ? { headerLinks: {}, projectLinks: [], allLinks: masterResumeRecord.links }
      : masterResumeRecord?.links;
    latex = generateSimpleLatex(masterResume, tailored, rubric, linkData);
  } catch (e: any) {
    await updateStatus("ERROR", "error", `LaTeX generation failed: ${e.message}`);
    return NextResponse.json(
      { error: `LaTeX generation failed: ${e.message}` },
      { status: 500 }
    );
  }

  if (rubric) {
    try {
      await convex.mutation(api.jdRubrics.createJdRubric, {
        runId: run._id,
        version: "v1",
        jobMeta: {
          jobTitle: rubric.job_meta?.title || job.title || "Unknown",
          company: rubric.job_meta?.company || job.company,
          location: rubric.job_meta?.location || job.location,
          employmentType: rubric.job_meta?.employment_type,
          seniority: rubric.job_meta?.seniority,
          jobUrl: job.jobUrl || "",
          platform: job.platform || detectPlatform(job.jobUrl),
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
    } catch (e: any) {
      console.error("Failed to store jdRubric:", e);
    }
  }

  if (rubric?.job_meta) {
    try {
      const extractedTitle = rubric.job_meta.title;
      const extractedCompany = rubric.job_meta.company;
      if (extractedTitle || extractedCompany) {
        await convex.mutation(api.jobs.updateJob, {
          jobId: job._id,
          title: extractedTitle || undefined,
          company: extractedCompany || undefined,
          location: rubric.job_meta.location || undefined,
          seniority: rubric.job_meta.seniority || undefined,
        });
      }
    } catch (e: any) {
      console.error("Failed to update job with rubric metadata:", e);
    }
  }

  await updateStatus("DONE", "success");

  return NextResponse.json({
    success: true,
    run_id: runId,
    status: "success",
    stage: "DONE",
    artifacts: {
      rubric,
      tailored,
      latex,
      job_text_hash: jobTextHash,
    },
  });
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!openai) {
    return NextResponse.json(
      { error: "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    if (body?.phase === "execute") {
      return await handleExecutePhase(body, clerkId);
    }

    return await handleStartPhase(body, clerkId);
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
  rubric: any,
  linkData?: {
    headerLinks: {
      linkedin?: string;
      github?: string;
      portfolio?: string;
      other?: string[];
    };
    projectLinks: Array<{
      projectName: string;
      links: string[];
    }>;
    allLinks: string[];
  }
): string {
  const contact = masterResume.contact || {};
  const name = contact.name || "Your Name";
  const email = contact.email || "";
  const phone = contact.phone || "";
  const linkedin = linkData?.headerLinks?.linkedin || "";
  const github = linkData?.headerLinks?.github || "";
  const portfolio = linkData?.headerLinks?.portfolio || "";

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

  const projectLinkMap = new Map<string, string[]>();
  (linkData?.projectLinks || []).forEach((entry) => {
    if (entry.projectName && entry.links.length > 0) {
      projectLinkMap.set(entry.projectName.toLowerCase(), entry.links);
    }
  });

  const projectsLatex = (tailored.projects || [])
    .map((proj: any) => {
      const bullets = (proj.bullets || [])
        .map((b: string) => `    \\item ${escapeLatex(b)}`)
        .join("\n");
      const links =
        projectLinkMap.get((proj.name || "").toLowerCase()) || [];
      const linkText =
        links.length > 0
          ? ` $|$ ${links
              .map((link: string) => `${labelProjectLink(link)}: ${escapeLatex(link)}`)
              .join(" $|$ ")}`
          : "";
      return `\\resumeProjectHeading
    {\\textbf{${escapeLatex(proj.name || "")}} $|$ \\emph{${escapeLatex(proj.description || "")}}${linkText}}{}
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
    \\small ${phone ? escapeLatex(phone) + " $|$ " : ""}${email ? "\\href{mailto:" + email + "}{" + escapeLatex(email) + "}" : ""}${linkedin ? " $|$ \\href{" + linkedin + "}{LinkedIn}" : ""}${github ? " $|$ \\href{" + github + "}{GitHub}" : ""}${portfolio ? " $|$ \\href{" + portfolio + "}{Portfolio}" : ""}
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

function labelProjectLink(link: string): string {
  const lower = link.toLowerCase();
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("arxiv.org") || lower.includes("doi.org")) return "Paper";
  if (lower.includes("demo") || lower.includes("app")) return "Demo";
  return "Link";
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
