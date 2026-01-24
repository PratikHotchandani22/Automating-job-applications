"use strict";
// convex/resumeParsing.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAllLinks = extractAllLinks;
exports.extractProjectNamesFromText = extractProjectNamesFromText;
exports.buildHeaderLinks = buildHeaderLinks;
exports.buildProjectLinks = buildProjectLinks;
exports.extractProjectsWithRelatedArticle = extractProjectsWithRelatedArticle;
exports.mergeProjectsWithFallback = mergeProjectsWithFallback;
/**
 * URL extraction regex patterns.
 *
 * Pattern 1: Full URLs with scheme (https:// or http://)
 * Pattern 2: www. prefixed URLs
 * Pattern 3: Common domain patterns without scheme (linkedin.com, github.com, etc.)
 *
 * This handles:
 * - Full URLs: https://github.com/user/repo
 * - www URLs: www.example.com/path
 * - Bare domains: linkedin.com/in/username, github.com/user
 */
const URL_WITH_SCHEME_REGEX = /https?:\/\/[^\s<>()\[\]{}"']+/gi;
const WWW_URL_REGEX = /www\.[^\s<>()\[\]{}"']+/gi;
const BARE_DOMAIN_REGEX = /(linkedin\.com|github\.com|gitlab\.com|bitbucket\.org|medium\.com|dev\.to|stackoverflow\.com|kaggle\.com|huggingface\.co)[^\s<>()\[\]{}"']*/gi;
const GITHUB_IO_REGEX = /[a-z0-9-]+\.github\.io[^\s<>()\[\]{}"']*/gi;
const TRAILING_PUNCT_REGEX = /[)\].,;:!?]+$/;
// Matches URL fragments broken across lines (e.g., "https://github" + "\n" + ".com/user")
const BROKEN_URL_PATTERN = /(https?:\/\/[^\s]+)\s*\n\s*([^\s<>()\[\]{}"']+)/gi;
/**
 * Normalize a URL:
 * - Remove trailing punctuation
 * - Prepend https:// if missing scheme
 * - Clean up whitespace artifacts from PDF extraction
 */
function normalizeUrl(raw) {
    // Remove trailing punctuation
    let cleaned = raw.replace(TRAILING_PUNCT_REGEX, "");
    // Remove any internal whitespace (PDF extraction artifact)
    cleaned = cleaned.replace(/\s+/g, "");
    // Prepend https:// if missing scheme
    if (!cleaned.match(/^https?:\/\//i)) {
        if (cleaned.startsWith("www.")) {
            cleaned = `https://${cleaned}`;
        }
        else {
            // For bare domains like linkedin.com/in/...
            cleaned = `https://${cleaned}`;
        }
    }
    return cleaned;
}
/**
 * Attempt to rejoin URLs that were split across lines during PDF extraction.
 * Common patterns:
 * - "https://github" + ".com/user/repo"
 * - "linkedin.com/in/user" + "name"
 */
function rejoinBrokenUrls(text) {
    // Replace line breaks that appear to be in the middle of URLs
    return text.replace(BROKEN_URL_PATTERN, "$1$2");
}
function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
}
function normalizeProjectName(name) {
    return normalizeWhitespace(name).toLowerCase();
}
/**
 * Extract all URLs from text using multiple patterns to catch:
 * - Full URLs with scheme
 * - www. prefixed URLs
 * - Bare domain URLs (linkedin.com/..., github.com/..., etc.)
 * - github.io portfolio URLs
 *
 * Handles PDF extraction quirks:
 * - URLs split across lines
 * - Extra whitespace within URLs
 * - Missing schemes
 *
 * Examples:
 *   "linkedin.com/in/john-doe" → "https://linkedin.com/in/john-doe"
 *   "github . com / user" → "https://github.com/user" (whitespace cleaned)
 *   "https://github\n.com/user" → "https://github.com/user" (rejoined)
 */
function extractAllLinks(text) {
    const seen = new Set();
    const ordered = [];
    // First, try to rejoin URLs broken across lines
    const processedText = rejoinBrokenUrls(text);
    // Collect all matches from different regex patterns
    const allMatches = [];
    // Pattern 1: URLs with scheme
    const schemeMatches = processedText.match(URL_WITH_SCHEME_REGEX) || [];
    allMatches.push(...schemeMatches);
    // Pattern 2: www. prefixed URLs
    const wwwMatches = processedText.match(WWW_URL_REGEX) || [];
    allMatches.push(...wwwMatches);
    // Pattern 3: Bare domain URLs (linkedin.com, github.com, etc.)
    const bareMatches = processedText.match(BARE_DOMAIN_REGEX) || [];
    allMatches.push(...bareMatches);
    // Pattern 4: GitHub.io portfolio URLs
    const githubIoMatches = processedText.match(GITHUB_IO_REGEX) || [];
    allMatches.push(...githubIoMatches);
    // Normalize and deduplicate
    for (const match of allMatches) {
        const normalized = normalizeUrl(match);
        if (!normalized || normalized.length < 10)
            continue; // Skip too-short URLs
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        ordered.push(normalized);
    }
    return ordered;
}
function extractProjectNamesFromText(text) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const headerRegex = /^(projects?|selected projects?|project experience)$/i;
    const sectionStopRegex = /^(experience|education|skills?|awards?|certifications?|publications?|summary|profile)$/i;
    let inProjects = false;
    const names = [];
    const seen = new Set();
    const dateRegex = /\b(0?[1-9]|1[0-2])[\/\-]\d{4}\b|\b20\d{2}\b/;
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!inProjects) {
            if (headerRegex.test(line)) {
                inProjects = true;
            }
            continue;
        }
        if (sectionStopRegex.test(line))
            break;
        if (line.startsWith("-") || line.startsWith("•"))
            continue;
        // Remove URLs from the line for project name extraction
        let normalizedLine = line
            .replace(URL_WITH_SCHEME_REGEX, "")
            .replace(WWW_URL_REGEX, "")
            .replace(BARE_DOMAIN_REGEX, "")
            .replace(GITHUB_IO_REGEX, "")
            .trim();
        normalizedLine = normalizedLine.replace(/\b(GitHub|WebApp|Demo|Paper)\b/gi, "").trim();
        if (!normalizedLine)
            continue;
        if (normalizedLine.length > 180)
            continue;
        const baseCandidate = normalizedLine.split("|")[0].split(" - ")[0].trim();
        let candidate = baseCandidate;
        if (normalizedLine.includes(":")) {
            const [left, ...rest] = normalizedLine.split(":");
            const leftTrim = left.trim();
            const rightTrim = rest.join(":").trim();
            const leftWords = leftTrim.split(/\s+/).filter(Boolean).length;
            const isGenericLabel = /^(project|projects|capstone|thesis|research|case study)$/i.test(leftTrim);
            if ((isGenericLabel || leftWords <= 2) && rightTrim) {
                candidate = rightTrim;
            }
            else {
                candidate = normalizedLine;
            }
        }
        if (!candidate || candidate.length < 2)
            continue;
        const lowerCandidate = candidate.toLowerCase();
        if (lowerCandidate.includes("related article"))
            continue;
        if (lowerCandidate === "github" ||
            lowerCandidate === "demo" ||
            lowerCandidate === "paper" ||
            lowerCandidate === "app" ||
            lowerCandidate.endsWith(":")) {
            continue;
        }
        if (sectionStopRegex.test(candidate))
            continue;
        const wordCount = candidate.split(/\s+/).filter(Boolean).length;
        if (wordCount < 2)
            continue;
        if (wordCount > 12)
            continue;
        if (candidate.endsWith("."))
            continue;
        if (candidate.includes("→"))
            continue;
        const nextLine = lines[i + 1] || "";
        const hasBulletAfter = nextLine.startsWith("-") || nextLine.startsWith("•");
        if (!normalizedLine.includes(":") &&
            !normalizedLine.includes("|") &&
            !dateRegex.test(normalizedLine) &&
            !hasBulletAfter) {
            continue;
        }
        const key = normalizeProjectName(candidate);
        if (seen.has(key))
            continue;
        seen.add(key);
        names.push(candidate);
    }
    return names;
}
function buildHeaderLinks(text, allLinks) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const headerWindow = lines.slice(0, 8);
    const headerLinks = {};
    const other = [];
    const setIfEmpty = (key, value) => {
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
            if (line.toLowerCase().includes("portfolio") ||
                line.toLowerCase().includes("website") ||
                line.toLowerCase().includes("site")) {
                setIfEmpty("portfolio", link);
                continue;
            }
            other.push(link);
        }
    }
    const byDomain = (domain) => allLinks.find((link) => link.toLowerCase().includes(domain));
    if (!headerLinks.linkedin) {
        const linkedInUrl = byDomain("linkedin.com");
        if (linkedInUrl)
            headerLinks.linkedin = linkedInUrl;
    }
    if (!headerLinks.github) {
        const githubUrl = byDomain("github.com");
        if (githubUrl)
            headerLinks.github = githubUrl;
    }
    if (!headerLinks.portfolio) {
        const candidate = allLinks.find((link) => {
            const lower = link.toLowerCase();
            if (lower.includes("linkedin.com") || lower.includes("github.com"))
                return false;
            return (lower.includes("portfolio") ||
                lower.includes("github.io") ||
                lower.includes("site"));
        });
        if (candidate) {
            headerLinks.portfolio = candidate;
        }
        else {
            const fallback = allLinks.find((link) => {
                const lower = link.toLowerCase();
                return !lower.includes("linkedin.com") && !lower.includes("github.com");
            });
            if (fallback)
                headerLinks.portfolio = fallback;
        }
    }
    if (other.length > 0) {
        headerLinks.other = Array.from(new Set(other));
    }
    return headerLinks;
}
function buildProjectLinks(projectNames, text, allLinks) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const linkSet = new Set(allLinks);
    const usedLinks = new Set();
    const normalizedNames = projectNames
        .map((name) => ({ name, key: normalizeProjectName(name) }))
        .filter((entry) => entry.key);
    const entries = [];
    const slugify = (value) => value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const tokenize = (value) => value
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
        if (startIndex === -1)
            continue;
        const links = [];
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
                if (usedLinks.has(link))
                    return false;
                const lower = link.toLowerCase();
                if (slug && lower.includes(slug))
                    return true;
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
function extractProjectsWithRelatedArticle(text, projectNames) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const sectionStopRegex = /^(experience|education|skills?|awards?|certifications?|publications?|summary|profile)$/i;
    const normalizedProjects = projectNames
        .filter((name) => typeof name === "string" && name.trim().length > 0)
        .map((name) => ({ name: name.trim(), key: normalizeProjectName(name) }))
        .filter((entry) => entry.key);
    const indices = normalizedProjects
        .map((project) => {
        const idx = lines.findIndex((line) => line.toLowerCase().includes(project.name.toLowerCase()));
        return idx >= 0 ? { name: project.name, index: idx } : null;
    })
        .filter((entry) => Boolean(entry))
        .sort((a, b) => a.index - b.index);
    const relatedProjects = [];
    for (let i = 0; i < indices.length; i += 1) {
        const current = indices[i];
        const nextIndex = i + 1 < indices.length ? indices[i + 1].index : lines.length;
        let hasRelated = false;
        for (let j = current.index + 1; j < nextIndex; j += 1) {
            if (sectionStopRegex.test(lines[j]))
                break;
            if (/related article/i.test(lines[j])) {
                hasRelated = true;
                break;
            }
        }
        if (hasRelated) {
            relatedProjects.push(current.name);
        }
    }
    return relatedProjects;
}
function mergeProjectsWithFallback(extractedProjects, fallbackNames) {
    const normalized = new Map();
    const unnamed = [];
    (extractedProjects || []).forEach((proj) => {
        if (!proj || typeof proj !== "object")
            return;
        const name = typeof proj.name === "string" ? proj.name.trim() : "";
        if (!name) {
            unnamed.push(proj);
            return;
        }
        const key = normalizeProjectName(name);
        if (!key)
            return;
        normalized.set(key, proj);
    });
    fallbackNames.forEach((name, idx) => {
        const key = normalizeProjectName(name);
        if (!key || normalized.has(key))
            return;
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
