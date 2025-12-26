// convex/resumeExtraction.ts

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { generateContentHash } from "./helpers";
import { generateResumeLatex } from "./latexGenerator";

/**
 * Extract structured data from resume text using LLM
 */
export const extractResumeData = action({
  args: {
    userId: v.id("users"),
    resumeText: v.string(),
    resumeName: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Generate content hash using Web Crypto API
    const contentHash = await generateContentHash(args.resumeText);

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
Return valid JSON only. No markdown, no explanations, no comments.

Skills Classification Rules
Categorize skills conservatively:
Use programming_languages only for actual languages (e.g., Python, R, Java).
Use frameworks_libraries for libraries, frameworks, platforms, SDKs.
Use tools_cloud_technologies for software tools, cloud platforms, databases, operating systems.
Use data_science_analytics only for analytics/statistics/data methods.
Use machine_learning_ai only for ML/AI concepts, models, or subfields.
Place everything else (regulatory, writing, management, compliance, operations, soft skills) in other_skills.
If the resume is non-technical, most skills may belong in other_skills.

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
    "programming_languages": [],
    "frameworks_libraries": [],
    "tools_cloud_technologies": [],
    "data_science_analytics": [],
    "machine_learning_ai": [],
    "other_skills": []
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
${args.resumeText.substring(0, 8000)}

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
    if (extractedContent.header && typeof extractedContent.header === 'object') {
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
    const cleanedSummary = (extractedContent.summary !== null && extractedContent.summary !== undefined && typeof extractedContent.summary === 'string' && extractedContent.summary.trim() !== '')
      ? extractedContent.summary
      : undefined;

    // Clean skills: filter out null values from arrays
    let cleanedSkills: {
      programming_languages: string[];
      frameworks_libraries: string[];
      tools_cloud_technologies: string[];
      data_science_analytics: string[];
      machine_learning_ai: string[];
      other_skills: string[];
    } = {
      programming_languages: [],
      frameworks_libraries: [],
      tools_cloud_technologies: [],
      data_science_analytics: [],
      machine_learning_ai: [],
      other_skills: [],
    };
    if (extractedContent.skills && typeof extractedContent.skills === 'object') {
      const skillCategories: Array<keyof typeof cleanedSkills> = ['programming_languages', 'frameworks_libraries', 'tools_cloud_technologies', 'data_science_analytics', 'machine_learning_ai', 'other_skills'];
      for (const category of skillCategories) {
        if (Array.isArray(extractedContent.skills[category])) {
          cleanedSkills[category] = extractedContent.skills[category].filter(
            (skill: any) => skill !== null && skill !== undefined && typeof skill === 'string' && skill.trim() !== ''
          );
        }
      }
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

    // Clean links array: filter out null values
    let cleanedLinks = undefined;
    if (extractedContent.links && Array.isArray(extractedContent.links)) {
      cleanedLinks = extractedContent.links.filter(
        (link: any) => link !== null && link !== undefined && typeof link === 'string' && link.trim() !== ''
      );
      if (cleanedLinks.length === 0) {
        cleanedLinks = undefined;
      }
    }

    // Create master resume
    const resumeId: any = await ctx.runMutation(api.masterResumes.createMasterResume, {
      userId: args.userId,
      name: args.resumeName,
      contentHash: `sha256:${contentHash}`,
      isActive: args.isActive,
      header: cleanedHeader,
      summary: cleanedSummary,
      skills: cleanedSkills,
      education: cleanedEducation,
      awards: cleanedAwards,
      mentorship: cleanedMentorship,
      links: cleanedLinks,
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

    // Add project bullets
    if (extractedContent.projects) {
      extractedContent.projects.forEach((proj: any, projIdx: number) => {
        if (proj.bullets && Array.isArray(proj.bullets)) {
          proj.bullets.forEach((bullet: any, bulletIdx: number) => {
            // Skip null or invalid bullets
            if (bullet === null || bullet === undefined || typeof bullet !== 'string' || bullet.trim() === '') {
              return;
            }

            const bulletData: any = {
              masterResumeId: resumeId,
              bulletId: `${proj.id || `proj_${projIdx}`}_b${bulletIdx + 1}`,
              parentType: "project" as const,
              parentId: proj.id || `proj_${projIdx}`,
              text: bullet.trim(),
              order: bulletIdx,
            };

            // Only include optional fields if they're non-null, non-undefined strings
            if (proj.name !== null && proj.name !== undefined && typeof proj.name === 'string' && proj.name.trim() !== '') {
              bulletData.projectName = proj.name.trim();
            }
            if (proj.dates !== null && proj.dates !== undefined && typeof proj.dates === 'string' && proj.dates.trim() !== '') {
              bulletData.dates = proj.dates.trim();
            }
            // Clean tags array: filter out null values
            if (proj.tags && Array.isArray(proj.tags)) {
              const cleanedTags = proj.tags.filter(
                (tag: any) => tag !== null && tag !== undefined && typeof tag === 'string' && tag.trim() !== ''
              );
              if (cleanedTags.length > 0) {
                bulletData.tags = cleanedTags;
              }
            }

            bullets.push(bulletData);
          });
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
          const parentId = proj.id || `proj_${idx}`;
          const bullets = projectMap.get(parentId) || [];
          bullets.sort((a, b) => (a.order || 0) - (b.order || 0));
          
          projects.push({
            name: proj.name,
            dates: proj.dates,
            tags: proj.tags,
            links: proj.links,
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
      });

      // Note: The resume JSON will be automatically generated and saved to backend
      // when startTailoringPipeline is called, so we don't need to save it here
    }

    return {
      success: true,
      resumeId,
      extractedData: extractedContent,
    };
  },
});

