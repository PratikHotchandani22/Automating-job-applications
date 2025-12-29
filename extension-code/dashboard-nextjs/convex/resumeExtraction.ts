// convex/resumeExtraction.ts

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { generateContentHash } from "./helpers";
import { generateResumeLatex } from "./latexGenerator";
import {
  buildHeaderLinks,
  buildProjectLinks,
  extractAllLinks,
  extractProjectNamesFromText,
  mergeProjectsWithFallback,
  ResumeLinkData,
} from "./resumeParsing";

/**
 * Extract structured data from resume text using LLM
 */
export const extractResumeData = action({
  args: {
    userId: v.id("users"),
    resumeText: v.string(),
    resumeName: v.string(),
    isActive: v.boolean(),
    resumeId: v.optional(v.id("masterResumes")),
    resumeLinks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const apiAny = api as any;
    let resumeId: any = args.resumeId;
    let contentHashValue = "";
    try {
    // Generate content hash using Web Crypto API
    const contentHash = await generateContentHash(args.resumeText);
    contentHashValue = `sha256:${contentHash}`;

    const existingResume = await ctx.runQuery(apiAny.masterResumes.getMasterResumeByContentHash, {
      userId: args.userId,
      contentHash: contentHashValue,
    });

    if (existingResume && resumeId && existingResume._id !== resumeId) {
      await ctx.runMutation(api.masterResumes.deleteMasterResume, {
        resumeId,
      });
      resumeId = undefined;
    }

    if (existingResume) {
      resumeId = existingResume._id;
      await ctx.runMutation(api.resumeBullets.deleteResumeBulletsByResume, {
        masterResumeId: resumeId,
      });
    }

    if (!resumeId) {
      resumeId = await ctx.runMutation(api.masterResumes.createMasterResume, {
        userId: args.userId,
        name: args.resumeName,
        contentHash: contentHashValue,
        isActive: args.isActive,
        skills: {},
        education: [],
        processingStatus: "extracting_structured_resume",
      });
    } else {
      await ctx.runMutation(api.masterResumes.updateMasterResume, {
        resumeId,
        processingStatus: "extracting_structured_resume",
        processingError: undefined,
      });
    }

    // Create prompt for LLM extraction
    const extractionPrompt = `You are an expert resume parser and structured-data extraction system.
Your task is to analyze arbitrary resume text of any profession or industry and extract structured information into the JSON schema below. Resumes may vary widely in formatting, section names, order, length, and writing style. They may be technical or non-technical and may include missing or partial information.

Core Extraction Rules
Do not assume the resume is technical or data-science focused.
Identify sections by semantic meaning, not by exact section titles.
Examples:
"Professional Summary", "Profile", "Objective", "About Me" → summary
"Experience", "Employment History", "Work History", "Professional Experience" → work_experience
"Education", "Academic Background", "Qualifications" → education
"Projects", "Selected Work", "Research", "Case Studies" → projects
"Skills", "Core Competencies", "Expertise", "Technical & Professional Skills" → skills
If a field is not present, return null or an empty array, not guesses.
Preserve the original wording of bullets as much as possible while removing obvious formatting artifacts.
Do not infer dates, companies, or roles unless explicitly stated.
Normalize lists (skills, bullets, links) as arrays even if only one item exists.
Deduplicate skills and links if repeated across sections.
If multiple roles exist at the same company, create separate work experience entries.
Do not hallucinate URLs, emails, phone numbers, or GPAs.
Return every project entry found in the resume. Do not stop at the first project.
Return valid JSON only. No markdown, no explanations, no comments.

Skills Classification Rules
Preserve the resume's own skill categories when they are labeled (e.g., "Technical Skills", "Tools", "Certifications", "Regulatory", "Finance").
If the resume provides a plain list without subcategories, use a single "skills" category.
Normalize category keys to snake_case (e.g., "Core Competencies" -> "core_competencies").
Do not invent categories that are not present in the resume.

Output JSON Schema
Return exactly this JSON structure:
{
  "header": {
    "fullName": "Full name of the person",
    "email": "Email address if present",
    "phone": "Phone number if present",
    "address": "Address if present",
    "linkedin": "LinkedIn URL if present",
    "github": "GitHub URL if present",
    "portfolio": "Portfolio URL if present",
    "website": "Personal website URL if present"
  },
  "summary": "Professional summary or objective",
  "skills": {
    "category_key": []
  },
  "work_experience": [
    {
      "id": "exp_1",
      "company": "Company name",
      "role": "Job title",
      "dates": "Start date - End date",
      "location": "Location if present",
      "bullets": [],
      "links": []
    }
  ],
  "projects": [
    {
      "id": "proj_1",
      "name": "Project name",
      "dates": "Date range if present",
      "tags": [],
      "bullets": [],
      "links": []
    }
  ],
  "education": [
    {
      "institution": "University or institution name",
      "degree": "Degree, certification, or qualification",
      "dates": "Start - End dates",
      "location": "Location if present",
      "gpa": "GPA if present",
      "links": []
    }
  ],
  "awards": [
    {
      "name": "Award name",
      "issuer": "Issuing organization",
      "year": "Year",
      "details": "Details if present"
    }
  ],
  "mentorship": [],
  "links": []
}

Input Resume Text
${args.resumeText}

Final Instruction
Return only valid JSON that strictly conforms to the schema above.`;

    // Call OpenAI API to extract structured data
    // You'll need to set OPENAI_API_KEY in Convex environment variables
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured in Convex environment");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Using cheaper model for extraction
        messages: [
          {
            role: "system",
            content:
              "You are an expert resume parser. Extract structured data from resumes into the specified JSON schema. Return only valid JSON, no markdown formatting, no explanations, no comments.",
          },
          {
            role: "user",
            content: extractionPrompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent extraction
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const extractedContent = JSON.parse(data.choices[0].message.content);
    console.log("[resumeExtraction] extracted JSON:", {
      projectCount: Array.isArray(extractedContent.projects)
        ? extractedContent.projects.length
        : 0,
      projectSample: Array.isArray(extractedContent.projects)
        ? extractedContent.projects.slice(0, 2)
        : [],
    });

    // Clean header object: convert null values to undefined (Convex validators don't accept null)
    let cleanedHeader: {
      fullName?: string;
      email?: string;
      phone?: string;
      address?: string;
      linkedin?: string;
      github?: string;
      portfolio?: string;
      website?: string;
    } | undefined = undefined;
    if (extractedContent.header && typeof extractedContent.header === "object") {
      cleanedHeader = {};
      const headerFields: Array<'fullName' | 'email' | 'phone' | 'address' | 'linkedin' | 'github' | 'portfolio' | 'website'> = ['fullName', 'email', 'phone', 'address', 'linkedin', 'github', 'portfolio', 'website'];
      for (const field of headerFields) {
        const value = (extractedContent.header as any)[field];
        // Only include field if it's a non-null, non-undefined value (strings)
        if (value !== null && value !== undefined && typeof value === 'string' && value.trim() !== '') {
          cleanedHeader[field] = value;
        }
        // If value is null/undefined/empty, we omit it (Convex treats omitted fields as undefined)
      }
      // If header object is empty after cleaning, set to undefined
      if (Object.keys(cleanedHeader).length === 0) {
        cleanedHeader = undefined;
      }
    }

    // Clean summary: convert null to undefined
    const cleanedSummary = (extractedContent.summary !== null && extractedContent.summary !== undefined && typeof extractedContent.summary === "string" && extractedContent.summary.trim() !== "")
      ? extractedContent.summary
      : undefined;

    // Clean skills: filter out null values from arrays
    let cleanedSkills: Record<string, string[]> = {};
    if (extractedContent.skills && typeof extractedContent.skills === "object") {
      Object.entries(extractedContent.skills).forEach(([category, values]) => {
        if (Array.isArray(values)) {
          const cleaned = values.filter(
            (skill: any) => skill !== null && skill !== undefined && typeof skill === "string" && skill.trim() !== ""
          );
          cleanedSkills[category] = cleaned;
        }
      });
    }
    if (!Object.keys(cleanedSkills).length) {
      cleanedSkills = { skills: [] };
    }

    // Clean education array: convert null values to undefined
    let cleanedEducation: any[] = [];
    if (extractedContent.education && Array.isArray(extractedContent.education)) {
      cleanedEducation = extractedContent.education.map((edu: any) => {
        const cleaned: any = {
          institution: edu.institution || "",
          degree: edu.degree || "",
          dates: edu.dates || "",
        };
        // Only include optional fields if they're non-null, non-undefined strings
        if (edu.location !== null && edu.location !== undefined && typeof edu.location === 'string' && edu.location.trim() !== '') {
          cleaned.location = edu.location;
        }
        if (edu.gpa !== null && edu.gpa !== undefined && typeof edu.gpa === 'string' && edu.gpa.trim() !== '') {
          cleaned.gpa = edu.gpa;
        }
        // Clean links array within education entry
        if (edu.links && Array.isArray(edu.links)) {
          const cleanedLinks = edu.links.filter(
            (link: any) => link !== null && link !== undefined && typeof link === 'string' && link.trim() !== ''
          );
          if (cleanedLinks.length > 0) {
            cleaned.links = cleanedLinks;
          }
        }
        return cleaned;
      });
      // Filter out invalid education entries (must have at least institution, degree, or dates)
      cleanedEducation = cleanedEducation.filter((edu: any) => edu.institution || edu.degree || edu.dates);
    }

    // Clean awards array: convert null values to undefined
    let cleanedAwards = undefined;
    if (extractedContent.awards && Array.isArray(extractedContent.awards)) {
      cleanedAwards = extractedContent.awards.map((award: any) => {
        const cleaned: any = {
          name: award.name || "",
          issuer: award.issuer || "",
          year: award.year || "",
        };
        // Only include details if it's a non-null, non-undefined string
        if (award.details !== null && award.details !== undefined && typeof award.details === 'string' && award.details.trim() !== '') {
          cleaned.details = award.details;
        }
        // If details is null/undefined, we omit it (Convex treats omitted fields as undefined)
        return cleaned;
      });
      // Filter out invalid awards (must have at least name, issuer, or year)
      cleanedAwards = cleanedAwards.filter((award: any) => award.name || award.issuer || award.year);
      // If cleaned awards array is empty, set to undefined
      if (cleanedAwards.length === 0) {
        cleanedAwards = undefined;
      }
    }

    // Clean mentorship array: filter out null values
    let cleanedMentorship = undefined;
    if (extractedContent.mentorship && Array.isArray(extractedContent.mentorship)) {
      cleanedMentorship = extractedContent.mentorship.filter(
        (item: any) => item !== null && item !== undefined && typeof item === 'string' && item.trim() !== ''
      );
      if (cleanedMentorship.length === 0) {
        cleanedMentorship = undefined;
      }
    }

    const fallbackProjectNames = extractProjectNamesFromText(args.resumeText);
    const mergedProjects = mergeProjectsWithFallback(
      Array.isArray(extractedContent.projects) ? extractedContent.projects : [],
      fallbackProjectNames
    );
    const normalizedProjectNames = new Set(
      fallbackProjectNames.map((name) => name.trim().toLowerCase()).filter(Boolean)
    );
    const filteredProjects =
      normalizedProjectNames.size > 0
        ? mergedProjects.filter((proj: any) => {
            const name = typeof proj?.name === "string" ? proj.name.trim().toLowerCase() : "";
            return name && normalizedProjectNames.has(name);
          })
        : mergedProjects;
    extractedContent.projects = filteredProjects;

    const textLinks = extractAllLinks(args.resumeText);
    const resumeLinks = Array.isArray(args.resumeLinks) ? args.resumeLinks : [];
    const normalizedResumeLinks = resumeLinks.flatMap((link) => extractAllLinks(link));
    const allLinks = Array.from(new Set([...textLinks, ...normalizedResumeLinks]));
    const headerLinks = buildHeaderLinks(args.resumeText, allLinks);
    const projectLinks = buildProjectLinks(
      mergedProjects.map((proj: any) => proj?.name).filter(Boolean),
      args.resumeText,
      allLinks
    );

    const linksPayload: ResumeLinkData = {
      headerLinks,
      projectLinks,
      allLinks,
    };

    if (cleanedHeader) {
      const isUrl = (value?: string) =>
        typeof value === "string" && /https?:\/\//i.test(value);
      if ((!cleanedHeader.linkedin || !isUrl(cleanedHeader.linkedin)) && headerLinks.linkedin) {
        cleanedHeader.linkedin = headerLinks.linkedin;
      }
      if ((!cleanedHeader.github || !isUrl(cleanedHeader.github)) && headerLinks.github) {
        cleanedHeader.github = headerLinks.github;
      }
      if ((!cleanedHeader.portfolio || !isUrl(cleanedHeader.portfolio)) && headerLinks.portfolio) {
        cleanedHeader.portfolio = headerLinks.portfolio;
      }
    }

    await ctx.runMutation(api.masterResumes.updateMasterResume, {
      resumeId,
      name: args.resumeName,
      contentHash: contentHashValue,
      isActive: args.isActive,
      header: cleanedHeader,
      summary: cleanedSummary,
      skills: cleanedSkills,
      education: cleanedEducation,
      awards: cleanedAwards,
      mentorship: cleanedMentorship,
      links: linksPayload,
      processingStatus: "saving_to_database",
    });

    // Create resume bullets for work experience and projects
    const bullets: any[] = [];

    // Add work experience bullets
    if (extractedContent.work_experience) {
      extractedContent.work_experience.forEach((exp: any, expIdx: number) => {
        if (exp.bullets && Array.isArray(exp.bullets)) {
          exp.bullets.forEach((bullet: any, bulletIdx: number) => {
            // Skip null or invalid bullets
            if (bullet === null || bullet === undefined || typeof bullet !== 'string' || bullet.trim() === '') {
              return;
            }

            const bulletData: any = {
              masterResumeId: resumeId,
              bulletId: `${exp.id || `exp_${expIdx}`}_b${bulletIdx + 1}`,
              parentType: "experience" as const,
              parentId: exp.id || `exp_${expIdx}`,
              text: bullet.trim(),
              order: bulletIdx,
            };

            // Only include optional fields if they're non-null, non-undefined strings
            if (exp.company !== null && exp.company !== undefined && typeof exp.company === 'string' && exp.company.trim() !== '') {
              bulletData.company = exp.company.trim();
            }
            if (exp.role !== null && exp.role !== undefined && typeof exp.role === 'string' && exp.role.trim() !== '') {
              bulletData.role = exp.role.trim();
            }
            if (exp.dates !== null && exp.dates !== undefined && typeof exp.dates === 'string' && exp.dates.trim() !== '') {
              bulletData.dates = exp.dates.trim();
            }
            if (exp.location !== null && exp.location !== undefined && typeof exp.location === 'string' && exp.location.trim() !== '') {
              bulletData.location = exp.location.trim();
            }

            bullets.push(bulletData);
          });
        }
      });
    }

    // Add project bullets (ensure projects appear even without bullets)
    const projectLinkMap = new Map<string, string[]>();
    projectLinks.forEach((entry) => {
      if (entry.projectName) {
        projectLinkMap.set(entry.projectName.toLowerCase(), entry.links);
      }
    });

    if (extractedContent.projects) {
      extractedContent.projects.forEach((proj: any, projIdx: number) => {
        const parentId = `proj_${projIdx}`;
        let addedBullet = false;
        const projectName = typeof proj.name === "string" ? proj.name.trim() : "";
        const projectLinksForProject =
          projectName && projectLinkMap.has(projectName.toLowerCase())
            ? projectLinkMap.get(projectName.toLowerCase())
            : [];

        if (proj.bullets && Array.isArray(proj.bullets)) {
          proj.bullets.forEach((bullet: any, bulletIdx: number) => {
            if (bullet === null || bullet === undefined || typeof bullet !== "string") {
              return;
            }
            const cleanedBullet = bullet.trim();
            if (!cleanedBullet) return;

            const bulletData: any = {
              masterResumeId: resumeId,
              bulletId: `${parentId}_b${bulletIdx + 1}`,
              parentType: "project" as const,
              parentId,
              text: cleanedBullet,
              order: bulletIdx,
            };

            if (projectName) {
              bulletData.projectName = projectName;
            }
            if (proj.dates !== null && proj.dates !== undefined && typeof proj.dates === "string" && proj.dates.trim() !== "") {
              bulletData.dates = proj.dates.trim();
            }
            if (proj.tags && Array.isArray(proj.tags)) {
              const cleanedTags = proj.tags.filter(
                (tag: any) => tag !== null && tag !== undefined && typeof tag === "string" && tag.trim() !== ""
              );
              if (cleanedTags.length > 0) {
                bulletData.tags = cleanedTags;
              }
            }
            if (projectLinksForProject && projectLinksForProject.length > 0) {
              bulletData.links = projectLinksForProject;
            }

            bullets.push(bulletData);
            addedBullet = true;
          });
        }

        if (!addedBullet) {
          const bulletData: any = {
            masterResumeId: resumeId,
            bulletId: `${parentId}_b1`,
            parentType: "project" as const,
            parentId,
            text: "",
            order: 0,
          };

          if (projectName) {
            bulletData.projectName = projectName;
          }
          if (proj.dates !== null && proj.dates !== undefined && typeof proj.dates === "string" && proj.dates.trim() !== "") {
            bulletData.dates = proj.dates.trim();
          }
          if (proj.tags && Array.isArray(proj.tags)) {
            const cleanedTags = proj.tags.filter(
              (tag: any) => tag !== null && tag !== undefined && typeof tag === "string" && tag.trim() !== ""
            );
            if (cleanedTags.length > 0) {
              bulletData.tags = cleanedTags;
            }
          }
          if (projectLinksForProject && projectLinksForProject.length > 0) {
            bulletData.links = projectLinksForProject;
          }

          bullets.push(bulletData);
        }
      });
    }

    // Bulk insert bullets
    if (bullets.length > 0) {
      await ctx.runMutation(api.resumeBullets.createResumeBullets, {
        bullets: bullets,
      });
    }

    // Generate LaTeX template from the master resume data
    // Get the created resume with all data
    const createdResume = await ctx.runQuery(api.masterResumes.getMasterResume, {
      resumeId,
    });

    if (createdResume) {
      // Get all bullets for this resume
      const allBullets = await ctx.runQuery(api.resumeBullets.getResumeBullets, {
        masterResumeId: resumeId,
      });

      // Group work experience bullets
      const workExpBullets = allBullets.filter((b: any) => b.parentType === "experience");
      const workExpMap = new Map<string, any[]>();
      workExpBullets.forEach((bullet: any) => {
        const key = bullet.parentId;
        if (!workExpMap.has(key)) {
          workExpMap.set(key, []);
        }
        workExpMap.get(key)!.push(bullet);
      });

      // Group work experiences by parentId and sort by first bullet's order
      const workExperiences: any[] = [];
      workExpMap.forEach((bullets, parentId) => {
        bullets.sort((a, b) => (a.order || 0) - (b.order || 0));
        const firstBullet = bullets[0];
        workExperiences.push({
          company: firstBullet.company,
          role: firstBullet.role,
          dates: firstBullet.dates,
          location: firstBullet.location,
          bullets: bullets.map((b: any) => ({ text: b.text })),
        });
      });

      // Group project bullets
      const projectBullets = allBullets.filter((b: any) => b.parentType === "project");
      const projectMap = new Map<string, any[]>();
      projectBullets.forEach((bullet: any) => {
        const key = bullet.parentId;
        if (!projectMap.has(key)) {
          projectMap.set(key, []);
        }
        projectMap.get(key)!.push(bullet);
      });

      // Get project data from extracted content and combine with bullets
      const projects: any[] = [];
      if (extractedContent.projects && Array.isArray(extractedContent.projects)) {
        extractedContent.projects.forEach((proj: any, idx: number) => {
          const parentId = `proj_${idx}`;
          const bullets = projectMap.get(parentId) || [];
          bullets.sort((a, b) => (a.order || 0) - (b.order || 0));
          const projectName = typeof proj.name === "string" ? proj.name.trim() : "";
          const projectLinksForProject =
            projectName && projectLinkMap.has(projectName.toLowerCase())
              ? projectLinkMap.get(projectName.toLowerCase())
              : [];
          
          projects.push({
            name: proj.name,
            dates: proj.dates,
            tags: proj.tags,
            links: projectLinksForProject,
            bullets: bullets.map((b: any) => ({ text: b.text })),
          });
        });
      }

      // Generate LaTeX
      const latexTemplate = generateResumeLatex(
        {
          header: createdResume.header,
          summary: createdResume.summary,
          skills: createdResume.skills,
          education: createdResume.education,
          awards: createdResume.awards,
          mentorship: createdResume.mentorship,
          links: createdResume.links,
        },
        workExperiences,
        projects
      );

      // Update master resume with generated LaTeX
      await ctx.runMutation(api.masterResumes.updateMasterResume, {
        resumeId,
        customLatexTemplate: latexTemplate,
        processingStatus: "done",
      });

      // Note: The resume JSON will be automatically generated and saved to backend
      // when startTailoringPipeline is called, so we don't need to save it here
    }

    console.log("[resumeExtraction] stored projects:", {
      resumeId,
      count: extractedContent.projects ? extractedContent.projects.length : 0,
      names: (extractedContent.projects || []).map((proj: any) => proj?.name).filter(Boolean),
    });

    return {
      success: true,
      resumeId,
      extractedData: extractedContent,
    };
    } catch (error: any) {
      if (resumeId) {
        await ctx.runMutation(api.masterResumes.updateMasterResume, {
          resumeId,
          processingStatus: "failed",
          processingError: error.message || "Failed to extract resume",
        });
      }
      throw error;
    }
  },
});
