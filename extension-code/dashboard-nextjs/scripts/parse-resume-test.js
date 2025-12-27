const fs = require("fs");
const path = require("path");

const fixturePath = path.join(__dirname, "..", "testdata", "sample-resume.txt");
const text = fs.readFileSync(fixturePath, "utf8");

const URL_REGEX = /((https?:\/\/|www\.)[^\s<>()\[\]{}"']+)/gi;
const TRAILING_PUNCT_REGEX = /[)\].,;:!?]+$/;

function normalizeUrl(raw) {
  const trimmed = raw.replace(TRAILING_PUNCT_REGEX, "");
  if (trimmed.startsWith("www.")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function extractAllLinks(input) {
  const matches = input.match(URL_REGEX) || [];
  const seen = new Set();
  const ordered = [];
  matches.forEach((match) => {
    const normalized = normalizeUrl(match);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    ordered.push(normalized);
  });
  return ordered;
}

function extractProjectNamesFromText(input) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerRegex = /^(projects?|selected projects?|project experience)$/i;
  const sectionStopRegex = /^(experience|education|skills?|awards?|certifications?|publications?|summary|profile)$/i;
  let inProjects = false;
  const names = [];
  const seen = new Set();

  lines.forEach((line) => {
    if (!inProjects) {
      if (headerRegex.test(line)) {
        inProjects = true;
      }
      return;
    }
    if (sectionStopRegex.test(line)) {
      inProjects = false;
      return;
    }
    if (line.startsWith("-") || line.startsWith("•")) return;
    URL_REGEX.lastIndex = 0;
    const normalizedLine = line.replace(URL_REGEX, "").trim();
    const candidate = normalizedLine.includes(":")
      ? normalizedLine.split(":")[0].trim()
      : normalizedLine.split("|")[0].split(" - ")[0].trim();
    if (!candidate || candidate.length < 2) return;
    const lowerCandidate = candidate.toLowerCase();
    if (
      lowerCandidate === "github" ||
      lowerCandidate === "demo" ||
      lowerCandidate === "paper" ||
      lowerCandidate === "app" ||
      lowerCandidate.endsWith(":")
    ) {
      return;
    }
    const wordCount = candidate.split(/\s+/).filter(Boolean).length;
    if (wordCount < 2) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(candidate);
  });

  return names;
}

const projectNames = extractProjectNamesFromText(text);
const allLinks = extractAllLinks(text);

if (projectNames.length < 2) {
  console.error("[FAIL] Expected 2+ projects, got:", projectNames);
  process.exit(1);
}

if (allLinks.length < 4) {
  console.error("[FAIL] Expected 4+ links, got:", allLinks);
  process.exit(1);
}

console.log("[PASS] Parsed projects and links from fixture:", {
  projectCount: projectNames.length,
  projectNames,
  linkCount: allLinks.length,
});
