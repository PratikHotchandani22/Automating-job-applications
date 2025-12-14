import fs from "fs";
import path from "path";
import { createHash } from "crypto";

function escapeRegExp(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function hashContent(content = "") {
  return createHash("sha256").update(content || "", "utf8").digest("hex");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(list = []) {
  return Array.from(new Set(list));
}

function containsPhrase(text, phrase) {
  if (!phrase || !text) return false;
  const escaped = escapeRegExp(phrase);
  const hasOnlyWords = /^[a-z0-9\s]+$/i.test(phrase);
  const pattern = hasOnlyWords ? `\\b${escaped}\\b` : escaped;
  const regex = new RegExp(pattern, "i");
  return regex.test(text);
}

function findFirstMatch(text, phrases = []) {
  const list = ensureArray(phrases);
  for (let i = 0; i < list.length; i += 1) {
    if (containsPhrase(text, list[i])) {
      return list[i];
    }
  }
  return null;
}

function collectMatches(text, phrases = []) {
  const matches = [];
  ensureArray(phrases).forEach((phrase) => {
    if (containsPhrase(text, phrase)) {
      matches.push(phrase);
    }
  });
  return matches;
}

function collectMetricMatches(text, patterns = []) {
  const matches = [];
  ensureArray(patterns).forEach((pattern) => {
    if (!pattern) return;
    const normalizedPattern = pattern.replace(/\\\\/g, "\\");
    const regex = new RegExp(normalizedPattern, "gi");
    let m = regex.exec(text);
    while (m) {
      if (m[0]) matches.push(m[0]);
      m = regex.exec(text);
    }
  });
  return matches;
}

function buildToolLexicon(rules = {}, resume = {}) {
  const base = ensureArray(rules.tool_lexicon);
  const derived = deriveToolLexiconFromResume(resume);
  const map = new Map();
  [...base, ...derived].forEach((item) => {
    if (!item || typeof item !== "string") return;
    const key = item.toLowerCase();
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
}

function deriveToolLexiconFromResume(resume = {}) {
  const skills = resume.skills || {};
  const collected = [];
  Object.values(skills || {}).forEach((entry) => {
    if (Array.isArray(entry)) {
      entry.forEach((item) => collected.push(item));
    }
  });
  (resume.projects || []).forEach((proj) => {
    if (Array.isArray(proj.keywords)) proj.keywords.forEach((k) => collected.push(k));
    if (Array.isArray(proj.tags)) proj.tags.forEach((k) => collected.push(k));
  });
  return collected.filter(Boolean);
}

function detectAction(text, rules = {}) {
  const strongVerb = findFirstMatch(text, rules.verbs?.strong);
  if (strongVerb) {
    return { verb: strongVerb, strength: "strong", score: 1 };
  }
  const mediumVerb = findFirstMatch(text, rules.verbs?.medium);
  if (mediumVerb) {
    return { verb: mediumVerb, strength: "medium", score: 0.6 };
  }
  return { verb: null, strength: "weak", score: 0.2 };
}

function detectFluff(text, rules = {}) {
  const hardMatches = collectMatches(text, rules.fluff_patterns?.hard);
  const softMatches = collectMatches(text, rules.fluff_patterns?.soft);
  const hardPenalty = Number(rules.fluff_penalties?.hard ?? -0.35);
  const softPenalty = Number(rules.fluff_penalties?.soft ?? -0.15);
  const maxPenalty = Number(rules.fluff_penalties?.max_penalty ?? -0.5);
  const combined = hardMatches.length * hardPenalty + softMatches.length * softPenalty;
  const penalty = Math.min(0, Math.max(maxPenalty, combined));
  return {
    hardMatches,
    softMatches,
    penalty: penalty > 0 ? 0 : penalty
  };
}

function computeToolScore(matches = [], rules = {}) {
  const perMatch = Number(rules.tool_scoring?.per_match ?? 0.5);
  const maxScore = Number(rules.tool_scoring?.max_score ?? 1);
  const score = matches.length * perMatch;
  return Math.min(maxScore, score);
}

function tierForScore(score, thresholds = {}) {
  const strongMin = Number(thresholds.strong_min ?? 0.72);
  const mediumMin = Number(thresholds.medium_min ?? 0.55);
  if (score >= strongMin) return "strong";
  if (score >= mediumMin) return "medium";
  return "weak";
}

function buildBulletIds(ownerId, providedIds, bullets = []) {
  if (Array.isArray(providedIds) && providedIds.length === bullets.length) {
    return providedIds;
  }
  return bullets.map((_, idx) => `${ownerId || "item"}_b${idx + 1}`);
}

function pickSummaryFields(entry) {
  return {
    bullet_id: entry.bullet_id,
    parent_type: entry.parent_type,
    parent_id: entry.parent_id,
    text: entry.text,
    evidence_score: entry.evidence_score,
    tier: entry.tier
  };
}

export function scoreBulletEvidence(bulletText = "", rules = {}, options = {}) {
  const text = (bulletText || "").trim();
  const lower = text.toLowerCase();
  const lexicon = ensureArray(options.toolLexicon || rules.tool_lexicon);

  const action = detectAction(lower, rules);
  const toolMatches = unique(collectMatches(text, lexicon));
  const outcomeMatches = collectMatches(lower, rules.outcome_cues);
  const metricMatches = unique(collectMetricMatches(text, rules.metric_regexes));
  const scopeMatches = collectMatches(lower, rules.scope_cues);
  const fluff = detectFluff(lower, rules);

  const weights = rules.weights || {};
  const actionScore = action.score;
  const toolScore = computeToolScore(toolMatches, rules);
  const outcomeScore = outcomeMatches.length ? 1 : 0;
  const metricScore = metricMatches.length ? 1 : 0;
  const scopeScore = scopeMatches.length ? 1 : 0;
  const weighted =
    actionScore * (weights.action ?? 0.2) +
    toolScore * (weights.tools ?? 0.15) +
    outcomeScore * (weights.outcome ?? 0.25) +
    metricScore * (weights.metric ?? 0.25) +
    scopeScore * (weights.scope ?? 0.15);
  const evidenceScore = clamp(weighted + (fluff.penalty || 0), 0, 1);
  const tier = tierForScore(evidenceScore, rules.tier_thresholds);

  const reasons = [];
  reasons.push({ code: `ACTION_${action.strength.toUpperCase()}`, value: action.verb });
  if (toolMatches.length) reasons.push({ code: "TOOLS_FOUND", value: toolMatches });
  if (outcomeMatches.length) reasons.push({ code: "OUTCOME_FOUND", value: outcomeMatches });
  if (metricMatches.length) reasons.push({ code: "METRIC_FOUND", value: metricMatches });
  if (scopeMatches.length) reasons.push({ code: "SCOPE_FOUND", value: scopeMatches });
  if (fluff.hardMatches.length) reasons.push({ code: "FLUFF_HARD", value: fluff.hardMatches });
  if (fluff.softMatches.length) reasons.push({ code: "FLUFF_SOFT", value: fluff.softMatches });

  return {
    evidence_score: evidenceScore,
    tier,
    features: {
      action_score: actionScore,
      tool_score: toolScore,
      outcome_score: outcomeScore,
      metric_score: metricScore,
      scope_score: scopeScore,
      fluff_penalty: fluff.penalty,
      tool_matches: toolMatches,
      metric_matches: metricMatches,
      action_verb: action.verb,
      fluff_matches: [...fluff.hardMatches, ...fluff.softMatches],
      scope_matches: scopeMatches,
      outcome_matches: outcomeMatches
    },
    reasons
  };
}

export function scoreMasterResume(resumeJson = {}, rules = {}, options = {}) {
  const lexicon = options.toolLexicon || buildToolLexicon(rules, resumeJson);
  const bullets = [];
  const work = resumeJson.work_experience || resumeJson.experience || [];
  const projects = resumeJson.projects || [];

  const collect = (list, parentType) => {
    list.forEach((entry, idx) => {
      const ownerId = entry?.id || `${parentType}_${idx + 1}`;
      const bulletIds = buildBulletIds(ownerId, entry?.bullet_ids, entry?.bullets || []);
      (entry?.bullets || []).forEach((text, bIdx) => {
        const result = scoreBulletEvidence(text, rules, { toolLexicon: lexicon });
        bullets.push({
          bullet_id: bulletIds[bIdx],
          parent_type: parentType,
          parent_id: ownerId,
          text: text || "",
          ...result
        });
      });
    });
  };

  collect(work, "experience");
  collect(projects, "project");

  const summary = summarizeScores(bullets);
  return { bullets, summary, tool_lexicon_size: lexicon.length };
}

export function summarizeScores(bullets = []) {
  const total = bullets.length;
  if (!total) {
    return {
      count: 0,
      strong: 0,
      medium: 0,
      weak: 0,
      min: 0,
      max: 0,
      mean: 0,
      top: [],
      bottom: []
    };
  }
  const strong = bullets.filter((b) => b.tier === "strong").length;
  const medium = bullets.filter((b) => b.tier === "medium").length;
  const weak = bullets.filter((b) => b.tier === "weak").length;
  const scores = bullets.map((b) => b.evidence_score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((sum, val) => sum + val, 0) / total;
  const sorted = [...bullets].sort((a, b) => b.evidence_score - a.evidence_score);
  const top = sorted.slice(0, 10).map(pickSummaryFields);
  const bottom = [...sorted].reverse().slice(0, 10).map(pickSummaryFields);
  return { count: total, strong, medium, weak, min, max, mean, top, bottom };
}

export function loadEvidenceRules(rulesPath) {
  const resolved = path.resolve(rulesPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Evidence rules file not found at ${resolved}`);
  }
  const content = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(content);
  return {
    rules: parsed,
    hash: hashContent(content),
    path: resolved
  };
}

export { deriveToolLexiconFromResume };
