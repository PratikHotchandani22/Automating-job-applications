// convex/latexGenerator.ts

/**
 * Generate LaTeX resume from master resume data
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
    skills: {
      programming_languages: string[];
      frameworks_libraries: string[];
      tools_cloud_technologies: string[];
      data_science_analytics: string[];
      machine_learning_ai: string[];
      other_skills: string[];
    };
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
    links?: string[];
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
  if (resume.header?.linkedin) contactParts.push(`\\href{${resume.header.linkedin}}{LinkedIn}`);
  if (resume.header?.github) contactParts.push(`\\href{${resume.header.github}}{GitHub}`);
  if (resume.header?.portfolio) contactParts.push(`\\href{${resume.header.portfolio}}{Portfolio}`);
  if (resume.header?.website) contactParts.push(`\\href{${resume.header.website}}{Website}`);

  latex += `    ${contactParts.join(" --- ")}\n`;
  latex += `\\end{center}\n%===LOCK_HEADER_END===\n\n`;

  // Summary section
  if (resume.summary) {
    latex += `\\vspace{-3 pt}\n\\section{SUMMARY}\n\\vspace{3 pt}\n\\noindent ${escapeLaTeX(resume.summary)}\n\n`;
  }

  // Skills section
  latex += `\\vspace{3 pt}\n\\section{SKILLS}\n\\vspace{3 pt}\n\\noindent`;
  const skillParts: string[] = [];
  
  if (resume.skills.programming_languages.length > 0) {
    skillParts.push(`\\textbf{Programming Languages:} ${resume.skills.programming_languages.map(s => escapeLaTeX(s)).join(", ")}`);
  }
  if (resume.skills.data_science_analytics.length > 0) {
    skillParts.push(`\\textbf{Data Analysis \\& Statistics:} ${resume.skills.data_science_analytics.map(s => escapeLaTeX(s)).join(", ")}`);
  }
  if (resume.skills.machine_learning_ai.length > 0 || resume.skills.frameworks_libraries.length > 0) {
    const mlSkills = [...resume.skills.machine_learning_ai, ...resume.skills.frameworks_libraries];
    if (mlSkills.length > 0) {
      skillParts.push(`\\textbf{Machine Learning:} ${mlSkills.map(s => escapeLaTeX(s)).join(", ")}`);
    }
  }
  if (resume.skills.tools_cloud_technologies.length > 0) {
    skillParts.push(`\\textbf{Tools \\& Cloud Technologies:} ${resume.skills.tools_cloud_technologies.map(s => escapeLaTeX(s)).join(", ")}`);
  }
  if (resume.skills.other_skills.length > 0) {
    skillParts.push(`\\textbf{Other Skills:} ${resume.skills.other_skills.map(s => escapeLaTeX(s)).join(", ")}`);
  }

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
        proj.links.forEach((link, idx) => {
          const linkText = idx === 0 ? "GitHub" : idx === 1 ? "WebApp" : `Link${idx + 1}`;
          links.push(`\\href{${link}}{\\textbf{${linkText}}}`);
        });
      }
      
      latex += `\\noindent\\textbf{${escapeLaTeX(name)}${tags}}${links.length > 0 ? ", " + links.join(", ") : ""}${dates}\n`;
      
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
function escapeLaTeX(text: string): string {
  if (!text) return "";
  
  return text
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
}

