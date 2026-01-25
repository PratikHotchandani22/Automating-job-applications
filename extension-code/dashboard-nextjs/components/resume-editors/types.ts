import type { Id } from "@/convex/_generated/dataModel";

export interface EditableBullet {
  bulletId: string;
  originalText: string;
  tailoredText: string;
  wasRewritten: boolean;
}

export interface EditableExperience {
  roleId: string;
  company: string;
  title: string;
  dateRange: string;
  location?: string;
  bullets: EditableBullet[];
}

export interface EditableProject {
  projectId: string;
  name: string;
  date?: string;
  links?: string[];
  bullets: EditableBullet[];
}

export interface EditableEducation {
  institution: string;
  degree: string;
  dates: string;
  location?: string;
  gpa?: string;
}

export interface EditableAward {
  name: string;
  issuer: string;
  year: string;
  details?: string;
}

export interface TailoredResumeDraft {
  _id: Id<"tailoredResumes">;
  runId: Id<"runs">;
  modelKey: string;
  modelName: string;
  summary: string;
  coverLetter?: string;
  diagnostics?: string;
  reasoningSummary?: string;
  workExperience: EditableExperience[];
  projects: EditableProject[];
  education: EditableEducation[];
  skills: Record<string, string[]>;
  skills_highlighted?: string[];
  awards?: EditableAward[];
  wordCountEstimate: number;
  selectionEnforcement: {
    strippedUnselected: number;
    truncatedBullets: number;
    repairApplied: boolean;
    compliant: boolean;
    proxyWordCountExceeded: boolean;
  };
  createdAt: number;
  source?: "llm" | "user_edit";
  parentVersionId?: Id<"tailoredResumes">;
}
