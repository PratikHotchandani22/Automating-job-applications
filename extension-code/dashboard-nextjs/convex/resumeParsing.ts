// convex/resumeParsing.ts

const URL_REGEX = /((https?:\/\/|www\.)[^\s<>()\[\]{}"']+)/gi;
const TRAILING_PUNCT_REGEX = /[)\].,;:!?]+$/;

export type HeaderLinks = {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  other?: string[];
};

export type ProjectLinkEntry = {
  projectName: string;
  links: string[];
};

export type ResumeLinkData = {
  headerLinks: HeaderLinks;
  projectLinks: ProjectLinkEntry[];
  allLinks: string[];
};

function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(TRAILING_PUNCT_REGEX, "");
  if (trimmed.startsWith("www.")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeProjectName(name: string): string {
  return normalizeWhitespace(name).toLowerCase();
}

export function extractAllLinks(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of matches) {
    const normalized = normalizeUrl(match);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

export function extractProjectNamesFromText(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerRegex = /^(projects?|selected projects?|project experience)$/i;
  const sectionStopRegex = /^(experience|education|skills?|awards?|certifications?|publications?|summary|profile)$/i;
  let inProjects = false;
  const names: string[] = [];
  const seen = new Set<string>();
  const dateRegex = /\b(0?[1-9]|1[0-2])[\/\-]\d{4}\b|\b20\d{2}\b/;

  for (const line of lines) {
    if (!inProjects) {
      if (headerRegex.test(line)) {
        inProjects = true;
      }
      continue;
    }

    if (sectionStopRegex.test(line)) break;
    if (line.startsWith("-") || line.startsWith("•")) continue;

    URL_REGEX.lastIndex = 0;
    let normalizedLine = line.replace(URL_REGEX, "").trim();
    normalizedLine = normalizedLine.replace(/\b(GitHub|WebApp|Demo|Paper)\b/gi, "").trim();
    if (!normalizedLine) continue;
    if (normalizedLine.length > 180) continue;

    const candidate =
      normalizedLine.includes(":")
        ? normalizedLine.split(":")[0].trim()
        : normalizedLine.split("|")[0].split(" - ")[0].trim();
    if (!candidate || candidate.length < 2) continue;
    const lowerCandidate = candidate.toLowerCase();
    if (
      lowerCandidate === "github" ||
      lowerCandidate === "demo" ||
      lowerCandidate === "paper" ||
      lowerCandidate === "app" ||
      lowerCandidate.endsWith(":")
    ) {
      continue;
    }
    if (sectionStopRegex.test(candidate)) continue;
    const wordCount = candidate.split(/\s+/).filter(Boolean).length;
    if (wordCount < 2) continue;
    if (!normalizedLine.includes(":") && !normalizedLine.includes("|") && !dateRegex.test(normalizedLine)) {
      continue;
    }
    const key = normalizeProjectName(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(candidate);
  }

  return names;
}

export function buildHeaderLinks(
  text: string,
  allLinks: string[]
): HeaderLinks {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerWindow = lines.slice(0, 8);
  const headerLinks: HeaderLinks = {};
  const other: string[] = [];

  const setIfEmpty = (key: keyof HeaderLinks, value: string) => {
    if (!headerLinks[key]) {
      headerLinks[key] = value;
    }
  };

  for (const line of headerWindow) {
    const lineLinks = extractAllLinks(line);
    for (const link of lineLinks) {
      const lower = link.toLowerCase();
      if (lower.includes("linkedin.com")) {
        setIfEmpty("linkedin", link);
        continue;
      }
      if (lower.includes("github.com")) {
        setIfEmpty("github", link);
        continue;
      }
      if (
        line.toLowerCase().includes("portfolio") ||
        line.toLowerCase().includes("website") ||
        line.toLowerCase().includes("site")
      ) {
        setIfEmpty("portfolio", link);
        continue;
      }
      other.push(link);
    }
  }

  const byDomain = (domain: string) =>
    allLinks.find((link) => link.toLowerCase().includes(domain));
  if (!headerLinks.linkedin) {
    const linkedInUrl = byDomain("linkedin.com");
    if (linkedInUrl) headerLinks.linkedin = linkedInUrl;
  }
  if (!headerLinks.github) {
    const githubUrl = byDomain("github.com");
    if (githubUrl) headerLinks.github = githubUrl;
  }

  if (!headerLinks.portfolio) {
    const candidate = allLinks.find((link) => {
      const lower = link.toLowerCase();
      if (lower.includes("linkedin.com") || lower.includes("github.com")) return false;
      return (
        lower.includes("portfolio") ||
        lower.includes("github.io") ||
        lower.includes("site")
      );
    });
    if (candidate) {
      headerLinks.portfolio = candidate;
    } else {
      const fallback = allLinks.find((link) => {
        const lower = link.toLowerCase();
        return !lower.includes("linkedin.com") && !lower.includes("github.com");
      });
      if (fallback) headerLinks.portfolio = fallback;
    }
  }

  if (other.length > 0) {
    headerLinks.other = Array.from(new Set(other));
  }

  return headerLinks;
}

export function buildProjectLinks(
  projectNames: string[],
  text: string,
  allLinks: string[]
): ProjectLinkEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const linkSet = new Set(allLinks);
  const usedLinks = new Set<string>();
  const normalizedNames = projectNames
    .map((name) => ({ name, key: normalizeProjectName(name) }))
    .filter((entry) => entry.key);
  const entries: ProjectLinkEntry[] = [];

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const tokenize = (value: string) =>
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4);

  for (const project of normalizedNames) {
    let startIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].toLowerCase().includes(project.name.toLowerCase())) {
        startIndex = i;
        break;
      }
    }
    if (startIndex === -1) continue;

    const links: string[] = [];
    const endIndex = Math.min(lines.length, startIndex + 5);
    for (let i = startIndex; i < endIndex; i += 1) {
      const lineLinks = extractAllLinks(lines[i]).filter((link) => linkSet.has(link));
      links.push(...lineLinks);
    }

    let deduped = Array.from(new Set(links));
    if (deduped.length === 0) {
      const slug = slugify(project.name);
      const tokens = tokenize(project.name);
      deduped = allLinks.filter((link) => {
        if (usedLinks.has(link)) return false;
        const lower = link.toLowerCase();
        if (slug && lower.includes(slug)) return true;
        return tokens.some((token) => lower.includes(token));
      });
    }
    deduped.forEach((link) => usedLinks.add(link));
    if (deduped.length > 0) {
      entries.push({ projectName: project.name, links: deduped });
    }
  }

  return entries;
}

export function mergeProjectsWithFallback(
  extractedProjects: any[],
  fallbackNames: string[]
): any[] {
  const normalized = new Map<string, any>();
  const unnamed: any[] = [];
  (extractedProjects || []).forEach((proj) => {
    if (!proj || typeof proj !== "object") return;
    const name = typeof proj.name === "string" ? proj.name.trim() : "";
    if (!name) {
      unnamed.push(proj);
      return;
    }
    const key = normalizeProjectName(name);
    if (!key) return;
    normalized.set(key, proj);
  });

  fallbackNames.forEach((name, idx) => {
    const key = normalizeProjectName(name);
    if (!key || normalized.has(key)) return;
    normalized.set(key, {
      id: `proj_${normalized.size + idx}`,
      name,
      dates: "",
      tags: [],
      bullets: [],
      links: [],
    });
  });

  return [...Array.from(normalized.values()), ...unnamed];
}
