import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getAuthOrThrow } from "@/lib/featureAccess";
import { generateResumeLatex } from "@/lib/latexGenerator";

// Force Node.js runtime
export const runtime = 'nodejs';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface RenderLatexRequest {
  runId: string;
}

export async function POST(request: NextRequest) {
  try {
    let authState;
    try {
      authState = await getAuthOrThrow();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as RenderLatexRequest;
    const runId = body?.runId;
    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    const convexUser = await convex.query(api.users.getUserByClerkId, {
      clerkId: authState.userId,
    });
    if (!convexUser) {
      return NextResponse.json({ error: "User not found in Convex" }, { status: 404 });
    }

    const runDetails = await convex.query(api.runDetails.getFullRunDetailsByRunId, {
      runId,
    });
    if (!runDetails?.run || runDetails.run.userId !== convexUser._id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const tailoredResume = runDetails.tailoredResumes?.reduce((latest: any, current: any) => {
      if (!latest) return current;
      if (current.source === "user_edit" && latest.source !== "user_edit") return current;
      return current.createdAt > latest.createdAt ? current : latest;
    }, null as any);
    if (!tailoredResume) {
      return NextResponse.json({ error: "Tailored resume not found" }, { status: 404 });
    }

    const resumeLinks = Array.isArray(runDetails.masterResume?.links)
      ? { headerLinks: {}, projectLinks: [], allLinks: runDetails.masterResume?.links }
      : runDetails.masterResume?.links;

    const resume = {
      header: runDetails.masterResume?.header,
      summary: tailoredResume.summary,
      skills: tailoredResume.skills,
      education: tailoredResume.education,
      awards: tailoredResume.awards,
      links: resumeLinks,
    };

    const workExperiences = tailoredResume.workExperience.map((exp: any) => ({
      company: exp.company,
      role: exp.title,
      dates: exp.dateRange,
      location: exp.location,
      bullets: exp.bullets.map((b: any) => ({ text: b.tailoredText })),
    }));

    const projectLinks = new Map<string, string[]>();
    (resumeLinks?.projectLinks || []).forEach((entry: any) => {
      if (entry.projectName && entry.links.length > 0) {
        projectLinks.set(entry.projectName.toLowerCase(), entry.links);
      }
    });

    const projects = tailoredResume.projects.map((proj: any) => ({
      name: proj.name,
      dates: proj.date,
      links: projectLinks.get((proj.name || "").toLowerCase()),
      bullets: proj.bullets.map((b: any) => ({ text: b.tailoredText })),
    }));

    const latex = generateResumeLatex(resume, workExperiences, projects);

    const fullName = resume.header?.fullName || "resume";
    const jobTitle = runDetails.job?.title || "resume";
    const jobCompany = runDetails.job?.company || "company";
    const filename = `${fullName}_${jobTitle}_${jobCompany}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    return NextResponse.json({ latex, filename });
  } catch (error: unknown) {
    console.error("Render LaTeX error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
