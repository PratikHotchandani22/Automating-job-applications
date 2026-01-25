// lib/latexGenerator.ts

/**
 * Generate LaTeX resume from master resume data
 * This is a client-side version for use in React components
 */
export function generateResumeLatex(
  resume: {
    header?: {
      fullName?: string;
      email?: string;
      phone?: string;
      address?: string;
      linkedin?: string;
      github?: string;
      portfolio?: string;
      website?: string;
    };
    summary?: string;
    skills: Record<string, string[]>;
    education: Array<{
      institution: string;
      degree: string;
      dates: string;
      location?: string;
      gpa?: string;
      links?: string[];
    }>;
    awards?: Array<{
      name: string;
      issuer: string;
      year: string;
      details?: string;
    }>;
    mentorship?: string[];
    links?:
      | {
          headerLinks?: {
            linkedin?: string;
            github?: string;
            portfolio?: string;
            other?: string[];
          };
          projectLinks?: Array<{
            projectName?: string;
            links: string[];
          }>;
          allLinks?: string[];
        }
      | string[];
  },
  workExperiences: Array<{
    company?: string;
    role?: string;
    dates?: string;
    location?: string;
    bullets: Array<{ text: string }>;
  }>,
  projects: Array<{
    name?: string;
    dates?: string;
    tags?: string[];
    bullets: Array<{ text: string }>;
    links?: string[];
  }>
): string {
  let latex = `\\documentclass[letterpaper,10pt]{article}

% Packages
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage{hyperref}

% Add sleeker font packages (pdfLaTeX compatible)
\\usepackage[T1]{fontenc}

% Choose one of these font options:

% Option 1: Helvetica - clean, modern sans-serif (default)
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}

% Set margins
\\usepackage[left=0.3in, right=0.3in, top=0.2in, bottom=0.3in]{geometry}

% Line spacing
\\renewcommand{\\baselinestretch}{0.95}

% Section format - reduce spacing by half
\\titleformat{\\section}{\\scshape\\raggedright\\bfseries\\normalsize}{}{0em}{}[\\titlerule]
\\titlespacing{\\section}{0pt}{2.5pt}{1pt}

% Bullet points
\\renewcommand{\\labelitemi}{$\\bullet$}

% Hyperlinks
\\hypersetup{
    colorlinks=true,
    urlcolor=blue
}

% List settings
\\setlist[itemize]{leftmargin=*,itemsep=0pt,parsep=0pt,topsep=1pt,partopsep=0pt}

\\begin{document}

%===LOCK_HEADER_START===
\\vspace{3 pt}
\\begin{center}
    {\\LARGE \\textbf{${escapeLaTeX(resume.header?.fullName || "Name")}}} \\\\[3pt]
`;

  // Build header contact info
  const contactParts: string[] = [];
  if (resume.header?.address) contactParts.push(escapeLaTeX(resume.header.address));
  if (resume.header?.phone) contactParts.push(escapeLaTeX(resume.header.phone));
  if (resume.header?.email) contactParts.push(`\\href{mailto:${resume.header.email}}{${escapeLaTeX(resume.header.email)}}`);
  const headerLinks = Array.isArray(resume.links) ? undefined : resume.links?.headerLinks;
  const linkedin = resume.header?.linkedin || headerLinks?.linkedin;
  const github = resume.header?.github || headerLinks?.github;
  const portfolio = resume.header?.portfolio || headerLinks?.portfolio;
  const website = resume.header?.website;
  if (linkedin) contactParts.push(`\\href{${linkedin}}{LinkedIn}`);
  if (github) contactParts.push(`\\href{${github}}{GitHub}`);
  if (portfolio) contactParts.push(`\\href{${portfolio}}{Portfolio}`);
  if (website) contactParts.push(`\\href{${website}}{Website}`);

  latex += `    ${contactParts.join(" --- ")}\n`;
  latex += `\\end{center}\n%===LOCK_HEADER_END===\n\n`;

  // Summary section
  if (resume.summary) {
    latex += `\\vspace{-3 pt}\n\\section{SUMMARY}\n\\vspace{3 pt}\n\\noindent ${escapeLaTeX(resume.summary)}\n\n`;
  }

  // Skills section
  latex += `\\vspace{3 pt}\n\\section{SKILLS}\n\\vspace{3 pt}\n\\noindent`;
  const skillParts = Object.entries(resume.skills || {})
    .filter(([_, values]) => Array.isArray(values) && values.length > 0)
    .map(([category, values]) => {
      const label = formatSkillLabel(category);
      return `\\textbf{${escapeLaTeX(label)}:} ${values.map(s => escapeLaTeX(s)).join(", ")}`;
    });

  latex += skillParts.join(" \\\\\n");
  latex += "\n\n";

  // Education section
  if (resume.education.length > 0) {
    latex += `%===LOCK_EDUCATION_START===\n\\vspace{3 pt}\n\\section{EDUCATION}\n\\vspace{3 pt}\n`;
    
    resume.education.forEach((edu) => {
      const locationPart = edu.location ? ` \\hfill \\textbf{${escapeLaTeX(edu.location)}}` : "";
      latex += `\\noindent\\textbf{${escapeLaTeX(edu.institution)}}${locationPart} \\\\\n`;
      latex += `${escapeLaTeX(edu.degree)}`;
      if (edu.gpa) {
        latex += ` (GPA: ${escapeLaTeX(edu.gpa)})`;
      }
      if (edu.dates) {
        latex += ` \\hfill \\textbf{${escapeLaTeX(edu.dates)}}`;
      }
      latex += "\n\n";
    });
    
    latex += `%===LOCK_EDUCATION_END===\n\n`;
  }

  // Work Experience section
  if (workExperiences.length > 0) {
    latex += `\\vspace{3 pt}\n\\section{WORK EXPERIENCE}\n\\vspace{3 pt}\n`;
    
    workExperiences.forEach((exp, idx) => {
      if (idx > 0) {
        latex += `\\vspace{3pt}\n`;
      }
      
      const company = exp.company || "Company";
      const dates = exp.dates || "";
      const role = exp.role || "";
      const location = exp.location ? ` ${exp.location}` : "";
      
      latex += `\\noindent\\textbf{${escapeLaTeX(company)}}`;
      if (dates) {
        latex += ` \\hfill \\textbf{${escapeLaTeX(dates)}}`;
      }
      latex += ` \\\\\n`;
      
      if (role) {
        latex += `\\textbf{\\textit{${escapeLaTeX(role)}}}`;
        if (location) {
          latex += ` \\hfill ${escapeLaTeX(location)}`;
        }
        latex += `\n`;
      }
      
      if (exp.bullets.length > 0) {
        latex += `\\begin{itemize}\n`;
        exp.bullets.forEach((bullet) => {
          latex += `    \\item ${escapeLaTeX(bullet.text)}\n`;
        });
        latex += `\\end{itemize}\n`;
      }
    });
    
    latex += "\n";
  }

  // Projects section
  if (projects.length > 0) {
    latex += `\\vspace{3 pt}\n\\section{PROJECTS}\n\n\\vspace{3 pt}\n`;
    
    projects.forEach((proj) => {
      const name = proj.name || "Project";
      const dates = proj.dates ? ` \\hfill \\textbf{${escapeLaTeX(proj.dates)}}` : "";
      const tags = proj.tags && proj.tags.length > 0 ? `: ${proj.tags.map(t => escapeLaTeX(t)).join(", ")}` : "";
      const links: string[] = [];

      if (proj.links && proj.links.length > 0) {
        proj.links.forEach((link) => {
          const label = labelProjectLink(link);
          links.push(`\\href{${link}}{${escapeLaTeX(label)}}`);
        });
      }
      
      latex += `\\noindent\\textbf{${escapeLaTeX(name)}${tags}}${links.length > 0 ? " --- " + links.join(" --- ") : ""}${dates}\n`;
      
      if (proj.bullets.length > 0) {
        latex += `\\begin{itemize}\n`;
        proj.bullets.forEach((bullet) => {
          latex += `    \\item ${escapeLaTeX(bullet.text)}\n`;
        });
        latex += `\\end{itemize}\n`;
      }
      
      latex += "\n";
    });
  }

  // Awards & Mentorship section
  const hasAwards = resume.awards && resume.awards.length > 0;
  const hasMentorship = resume.mentorship && resume.mentorship.length > 0;
  
  if (hasAwards || hasMentorship) {
    latex += `\\vspace{3 pt}\n\\section{AWARDS \\& MENTORSHIP}\n\\vspace{3 pt}\n\\begin{itemize}\n`;
    
    if (hasAwards) {
      resume.awards!.forEach((award) => {
        let awardText = `"${escapeLaTeX(award.name)}," ${escapeLaTeX(award.issuer)}`;
        if (award.details) {
          awardText += ` - ${escapeLaTeX(award.details)}`;
        }
        if (award.year) {
          awardText += ` \\hfill \\textbf{${escapeLaTeX(award.year)}}`;
        }
        latex += `    \\item ${awardText}\n`;
      });
    }
    
    if (hasMentorship) {
      resume.mentorship!.forEach((mentor) => {
        latex += `    \\item ${escapeLaTeX(mentor)}\n`;
      });
    }
    
    latex += `\\end{itemize}\n\n`;
  }

  latex += `\\end{document}\n`;

  return latex;
}

/**
 * Escape special LaTeX characters
 */
const MARKDOWN_BOLD_START = "__MARKDOWN_BOLD_START__";
const MARKDOWN_BOLD_END = "__MARKDOWN_BOLD_END__";
const BOLD_START_TOKEN = "CODEXBOLDSTARTTOKEN";
const BOLD_END_TOKEN = "CODEXBOLDENDTOKEN";

function formatSkillLabel(key: string): string {
  if (key === "other_skills") return "Other Skills";
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function encodeMarkdownBold(text: string): string {
  const normalized = text
    .replace(/\\_\\_MARKDOWN\\_BOLD\\_START\\_\\_/g, "**")
    .replace(/\\_\\_MARKDOWN\\_BOLD\\_END\\_\\_/g, "**")
    .replace(new RegExp(MARKDOWN_BOLD_START, "g"), "**")
    .replace(new RegExp(MARKDOWN_BOLD_END, "g"), "**");
  return normalized.replace(/\*\*([\s\S]+?)\*\*/g, `${BOLD_START_TOKEN}$1${BOLD_END_TOKEN}`);
}

function decodeMarkdownBold(text: string): string {
  return text
    .replace(new RegExp(BOLD_START_TOKEN, "g"), "\\textbf{")
    .replace(new RegExp(BOLD_END_TOKEN, "g"), "}");
}

function escapeLaTeX(text: string): string {
  if (!text) return "";
  const withBoldMarkers = encodeMarkdownBold(text);
  const escaped = withBoldMarkers
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\$/g, "\\$")
    .replace(/\&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\n/g, " ");
  return decodeMarkdownBold(escaped);
}

function labelProjectLink(link: string): string {
  const lower = link.toLowerCase();
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("arxiv.org") || lower.includes("doi.org")) return "Paper";
  if (lower.includes("demo") || lower.includes("app")) return "Demo";
  return "Link";
}
