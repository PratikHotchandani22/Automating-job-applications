import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import {
  buildEmbedKeyHash,
  computeCosineSimilarity,
  getEmbedConfig,
  readCachedResumeEmbeddings
} from "../embeddings/engine.js";
import { computeMasterResumeHash } from "../scoring/evidenceCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLAN_VERSION = "selection_plan_v1";
const DEFAULT_CONFIG_PATH = path.join(__dirname, "selection_config_v1.json");

const TIER_RANK = { strong: 3, medium: 2, weak: 1 };

class StageError extends Error {
  constructor(message) {
    super(message);
    this.stage = "select";
  }
}

function hashString(str = "") {
  return createHash("sha256").update(str || "", "utf8").digest("hex");
}

function ensureConfigShape(config = {}) {
  if (!config.thresholds) config.thresholds = {};
  if (!config.budgets) config.budgets = {};
  if (!config.weights) config.weights = {};
  if (!config.weights.edge) config.weights.edge = {};
  if (!config.weights.fill) config.weights.fill = {};
  if (!config.thresholds.redundancy) config.thresholds.redundancy = {};
  if (!config.guards) config.guards = {};
  return config;
}

function loadSelectionConfig(configPath = DEFAULT_CONFIG_PATH) {
  const pathToUse = configPath || DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(pathToUse)) {
    throw new StageError(`Selection config missing at ${pathToUse}`);
  }
  const raw = fs.readFileSync(pathToUse, "utf8");
  const parsed = ensureConfigShape(JSON.parse(raw));
  return { config: parsed, hash: hashString(raw) };
}

function readJsonRequired(filePath, missingMessage) {
  if (!fs.existsSync(filePath)) {
    const err = new StageError(missingMessage || `Missing file ${filePath}`);
    throw err;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getRelScore(relevanceLookup, bulletId, reqId) {
  return relevanceLookup[`${bulletId}::${reqId}`] ?? 0;
}

function buildRelevanceLookup(matrix) {
  const lookup = {};
  Object.entries(matrix.per_requirement_top_bullets || {}).forEach(([reqId, bullets]) => {
    (bullets || []).forEach((entry) => {
      lookup[`${entry.bullet_id}::${reqId}`] = entry.score;
    });
  });
  Object.entries(matrix.per_bullet_top_requirements || {}).forEach(([bulletId, reqs]) => {
    (reqs || []).forEach((entry) => {
      const key = `${bulletId}::${entry.req_id}`;
      if (typeof lookup[key] === "undefined") {
        lookup[key] = entry.score;
      }
    });
  });
  return lookup;
}

function rankRequirements(requirements = [], candidateCounts = {}) {
  const scarcity = (req) => {
    const count = candidateCounts[req.req_id];
    if (typeof count === "number") return count;
    return Number.MAX_SAFE_INTEGER;
  };
  return [...(requirements || [])].sort((a, b) => {
    if (a.type !== b.type) return a.type === "must" ? -1 : 1;
    if (a.weight !== b.weight) return (b.weight || 0) - (a.weight || 0);
    const scarcityDelta = scarcity(a) - scarcity(b);
    if (scarcityDelta !== 0) return scarcityDelta;
    return (a.req_id || "").localeCompare(b.req_id || "");
  });
}

function evidenceTierAllowed(tier, requirementType, minNiceTier = "medium") {
  if (requirementType === "must") return true;
  return (TIER_RANK[tier] || 0) >= (TIER_RANK[minNiceTier] || 0);
}

function deriveRiskPenalty(bullet = {}) {
  const fluff = Number(bullet.features?.fluff_penalty || 0);
  const missingOutcome = bullet.features?.outcome_score === 0 ? 0.15 : 0;
  return Math.min(1, fluff + missingOutcome);
}

function computeRedundancy(vector, selectedVectors, redundancyCfg) {
  if (!vector || !Array.isArray(selectedVectors) || !selectedVectors.length) {
    return { maxSim: 0, blocked: false, penalty: 0 };
  }
  const hard = redundancyCfg?.hard_block ?? 0.92;
  const start = redundancyCfg?.penalty_start ?? 0.85;
  let maxSim = 0;
  selectedVectors.forEach((entry) => {
    const sim = computeCosineSimilarity(vector, entry.vector);
    if (sim > maxSim) maxSim = sim;
  });
  if (maxSim >= hard) return { maxSim, blocked: true, penalty: 1 };
  if (maxSim >= start) {
    const penalty = (maxSim - start) / (hard - start);
    return { maxSim, blocked: false, penalty };
  }
  return { maxSim, blocked: false, penalty: 0 };
}

function scoreEdge({ rel, evidence, redundancyPenalty, riskPenalty, weights }) {
  const wRel = weights?.w_rel ?? 0.6;
  const wEvd = weights?.w_evd ?? 0.35;
  const wRed = weights?.w_red ?? 0.2;
  const wRisk = weights?.w_risk ?? 0.15;
  return wRel * rel + wEvd * evidence - wRed * (redundancyPenalty || 0) - wRisk * (riskPenalty || 0);
}

function computeRewriteIntent(tier = "weak", evidenceScore = 0) {
  if ((TIER_RANK[tier] || 0) >= TIER_RANK.strong && evidenceScore >= 0.8) return "light";
  if ((TIER_RANK[tier] || 0) >= TIER_RANK.medium) return "medium";
  return "heavy";
}

function buildRoleCaps(baseline = {}, configCaps = {}) {
  const caps = {};
  const roles = baseline.work_experience || baseline.experience || [];
  roles.forEach((role, idx) => {
    const cap = idx === 0 ? configCaps.most_recent : idx === 1 ? configCaps.next : configCaps.older;
    caps[role.id || `experience_${idx + 1}`] = cap ?? configCaps.older ?? 2;
  });
  return caps;
}

function loadResumeEmbeddingVectors({ masterResumeHash, embedConfig, cacheRoot }) {
  const embedKeyHash = buildEmbedKeyHash(embedConfig);
  const cached = readCachedResumeEmbeddings({
    masterResumeHash,
    embedKeyHash,
    config: { ...embedConfig, cacheRoot }
  });
  if (!cached?.data) {
    throw new StageError("Cached resume embeddings missing for redundancy checks");
  }
  const vectorLookup = {};
  (cached.data.bullets || []).forEach((b) => {
    vectorLookup[b.bullet_id] = b.vector;
  });
  return { vectorLookup, cachePath: cached.cachePath, embedKeyHash };
}

function gatherBaselineMeta(baseline = {}) {
  const roleMeta = {};
  const projectMeta = {};
  (baseline.work_experience || baseline.experience || []).forEach((role, idx) => {
    roleMeta[role.id || `experience_${idx + 1}`] = {
      company: role.company || "",
      title: role.role || role.title || "",
      date_range: role.dates || role.date_range || "",
      order: idx
    };
  });
  (baseline.projects || []).forEach((proj, idx) => {
    projectMeta[proj.id || `project_${idx + 1}`] = {
      project_id: proj.id || `project_${idx + 1}`,
      name: proj.name || "",
      date: proj.dates || proj.date || "",
      order: idx
    };
  });
  const awards = Array.isArray(baseline.awards) ? baseline.awards : [];
  return { roleMeta, projectMeta, awards };
}

function addMatchToBullet(selection, bulletId, match) {
  const entry = selection[bulletId];
  if (!entry) return;
  const exists = (entry.matches || []).some((m) => m.req_id === match.req_id);
  if (!exists) entry.matches.push(match);
}

function updateCoverageForMatch(coverageState, reqId, edgeScore, coverThreshold) {
  const entry = coverageState[reqId] || { covered: false, assignments: 0, reason: null };
  entry.assignments += 1;
  if (edgeScore >= coverThreshold) {
    entry.covered = true;
    entry.reason = null;
  }
  coverageState[reqId] = entry;
}

function buildSelectionOutputs(selected, baselineMeta, budgets) {
  const work = {};
  const projects = {};
  const roleBullets = {};
  Object.values(selected).forEach((bullet) => {
    if (bullet.parent_type === "experience") {
      const roleId = bullet.parent_id;
      if (!roleBullets[roleId]) roleBullets[roleId] = [];
      roleBullets[roleId].push(bullet);
    } else if (bullet.parent_type === "project") {
      const projectId = bullet.parent_id;
      if (!projects[projectId]) projects[projectId] = [];
      projects[projectId].push(bullet);
    }
  });

  const workSelections = Object.keys(roleBullets)
    .sort((a, b) => (baselineMeta.roleMeta[a]?.order ?? 0) - (baselineMeta.roleMeta[b]?.order ?? 0))
    .map((roleId) => {
      const meta = baselineMeta.roleMeta[roleId] || {};
      const bullets = roleBullets[roleId].sort((a, b) => a.bullet_id.localeCompare(b.bullet_id));
      return {
        role_id: roleId,
        company: meta.company || "",
        title: meta.title || "",
        date_range: meta.date_range || "",
        bullets
      };
    });

  const projectSelections = Object.keys(projects)
    .sort((a, b) => (baselineMeta.projectMeta[a]?.order ?? 0) - (baselineMeta.projectMeta[b]?.order ?? 0))
    .map((projectId) => ({
      project_id: projectId,
      name: baselineMeta.projectMeta[projectId]?.name || "",
      date: baselineMeta.projectMeta[projectId]?.date || "",
      bullets: projects[projectId].sort((a, b) => a.bullet_id.localeCompare(b.bullet_id))
    }));

  const awards = (baselineMeta.awards || []).slice(0, budgets.award_lines_max || 0).map((award) => ({
    award_id: award.id || award.name || award.title || "award",
    include: true,
    reason: "budget_available"
  }));

  return { workSelections, projectSelections, awards };
}

function applyBudgetCheck({ bullet, counters, budgets, roleCaps }) {
  if (bullet.parent_type === "experience") {
    if (counters.experience >= budgets.experience_bullets_max) return false;
    const cap = roleCaps[bullet.parent_id];
    if (typeof cap === "number" && (counters.perRole[bullet.parent_id] || 0) >= cap) return false;
    return true;
  }
  if (bullet.parent_type === "project") {
    if (counters.projects >= budgets.project_bullets_max) return false;
    return true;
  }
  return false;
}

function incrementCounters({ bullet, counters }) {
  if (bullet.parent_type === "experience") {
    counters.experience += 1;
    counters.perRole[bullet.parent_id] = (counters.perRole[bullet.parent_id] || 0) + 1;
  } else if (bullet.parent_type === "project") {
    counters.projects += 1;
  }
}

function runSelectionCore({
  requirements,
  evidenceMap,
  relevanceLookup,
  vectorLookup,
  config,
  baselineMeta
}) {
  const thresholds = config.thresholds || {};
  const budgets = config.budgets || {};
  const weights = config.weights || {};
  const guards = config.guards || {};
  const guardPerRole = guards.top_per_role || 0;
  const guardGlobal = guards.top_global || 0;
  const roleCaps = buildRoleCaps(baselineMeta, budgets.per_role_caps || {});
  const counters = { experience: 0, projects: 0, perRole: {} };
  const coverageState = {};
  const reqSelectionCounts = {};
  const selected = {};
  const selectedVectors = [];
  const redundancyDrops = new Set();
  const budgetDrops = new Set();

  const candidateCounts = {};
  (requirements || []).forEach((req) => {
    const minRel = req.type === "must" ? thresholds.must_min_rel : thresholds.nice_min_rel;
    const count = Object.keys(relevanceLookup)
      .filter((key) => key.endsWith(`::${req.req_id}`))
      .filter((key) => relevanceLookup[key] >= minRel)
      .filter((key) => {
        const [bulletId] = key.split("::");
        const bullet = evidenceMap[bulletId];
        if (!bullet) return false;
        if (!evidenceTierAllowed(bullet.tier, req.type, thresholds.min_evidence_tier_nice)) return false;
        return true;
      }).length;
    candidateCounts[req.req_id] = count;
  });
  const orderedReqs = rankRequirements(requirements, candidateCounts);

  const selectBullet = (bulletId, req, relScore, redundancyInfo) => {
    const bullet = evidenceMap[bulletId];
    if (!selected[bulletId]) {
      selected[bulletId] = {
        bullet_id: bullet.bullet_id,
        parent_type: bullet.parent_type,
        parent_id: bullet.parent_id,
        original_text: bullet.text,
        evidence: { score: bullet.evidence_score, tier: bullet.tier },
        matches: [],
        redundancy: redundancyInfo,
        rewrite_intent: computeRewriteIntent(bullet.tier, bullet.evidence_score),
        reasons: []
      };
      incrementCounters({ bullet, counters });
      if (vectorLookup[bulletId]) {
        selectedVectors.push({ bullet_id: bulletId, vector: vectorLookup[bulletId] });
      }
    }
    const edgeScore = scoreEdge({
      rel: relScore,
      evidence: bullet.evidence_score,
      redundancyPenalty: redundancyInfo.penalty,
      riskPenalty: deriveRiskPenalty(bullet),
      weights: weights.edge
    });
    selected[bulletId].redundancy = redundancyInfo;
    addMatchToBullet(selected, bulletId, { req_id: req.req_id, rel: relScore, edge_score: edgeScore });
    selected[bulletId].reasons.push(
      `${req.type === "must" ? "covers_must" : "covers_nice"}:${req.req_id}`,
      `high_relevance:${relScore.toFixed(2)}`,
      `${bullet.tier}_evidence:${bullet.evidence_score.toFixed(2)}`
    );
    if (redundancyInfo.penalty > 0) {
      selected[bulletId].reasons.push(`redundancy_penalty:${redundancyInfo.penalty.toFixed(2)}`);
    }
    reqSelectionCounts[req.req_id] = (reqSelectionCounts[req.req_id] || 0) + 1;
    updateCoverageForMatch(coverageState, req.req_id, edgeScore, thresholds.cover_threshold);
  };

  const isReqCapExceeded = (reqId) =>
    (reqSelectionCounts[reqId] || 0) >= (budgets.max_bullets_per_requirement || Infinity);

  // Guard selection: lock top bullets before the main loops.
  const bestPerParent = {};
  const bestEntriesAll = [];

  Object.values(evidenceMap).forEach((bullet) => {
    if (bullet.parent_type !== "experience" && bullet.parent_type !== "project") return;
    let best = null;
    (requirements || []).forEach((req) => {
      const rel = getRelScore(relevanceLookup, bullet.bullet_id, req.req_id);
      const minRel = req.type === "must" ? thresholds.must_min_rel : thresholds.nice_min_rel;
      if (rel < minRel) return;
      if (!evidenceTierAllowed(bullet.tier, req.type, thresholds.min_evidence_tier_nice)) return;
      const riskPenalty = deriveRiskPenalty(bullet);
      const edgeScore = scoreEdge({
        rel,
        evidence: bullet.evidence_score,
        redundancyPenalty: 0,
        riskPenalty,
        weights: weights.edge
      });
      if (!best || edgeScore > best.edgeScore) {
        best = {
          bulletId: bullet.bullet_id,
          parent_id: bullet.parent_id,
          parent_type: bullet.parent_type,
          req,
          rel,
          edgeScore
        };
      }
    });
    if (best) {
      bestEntriesAll.push(best);
      const key = best.parent_id || "_unknown_parent";
      if (!bestPerParent[key]) bestPerParent[key] = [];
      bestPerParent[key].push(best);
    }
  });

  const trySelectGuardEntry = (entry) => {
    if (!entry || selected[entry.bulletId]) return false;
    if (isReqCapExceeded(entry.req.req_id)) return false;
    const redundancyInfo = computeRedundancy(vectorLookup[entry.bulletId], selectedVectors, thresholds.redundancy);
    if (redundancyInfo.blocked) {
      redundancyDrops.add(entry.bulletId);
      return false;
    }
    const bullet = evidenceMap[entry.bulletId];
    if (!applyBudgetCheck({ bullet, counters, budgets, roleCaps })) {
      budgetDrops.add(entry.bulletId);
      return false;
    }
    selectBullet(entry.bulletId, entry.req, entry.rel, redundancyInfo);
    return true;
  };

  if (guardPerRole > 0) {
    Object.values(bestPerParent).forEach((entries) => {
      const sorted = [...entries].sort((a, b) => {
        if (b.edgeScore !== a.edgeScore) return b.edgeScore - a.edgeScore;
        return a.bulletId.localeCompare(b.bulletId);
      });
      let placed = 0;
      for (const entry of sorted) {
        if (placed >= guardPerRole) break;
        if (trySelectGuardEntry(entry)) {
          placed += 1;
        }
      }
    });
  }

  if (guardGlobal > 0) {
    const sortedGlobal = bestEntriesAll
      .filter((entry) => !selected[entry.bulletId])
      .sort((a, b) => {
        if (b.edgeScore !== a.edgeScore) return b.edgeScore - a.edgeScore;
        return a.bulletId.localeCompare(b.bulletId);
      });
    let placed = 0;
    for (const entry of sortedGlobal) {
      if (placed >= guardGlobal) break;
      if (trySelectGuardEntry(entry)) {
        placed += 1;
      }
    }
  }

  orderedReqs.forEach((req) => {
    const minRel = req.type === "must" ? thresholds.must_min_rel : thresholds.nice_min_rel;
    const alreadyCovered = Object.values(selected).find((s) =>
      (s.matches || []).some((m) => m.req_id === req.req_id && m.edge_score >= thresholds.cover_threshold)
    );
    if (alreadyCovered) {
      return;
    }
    const candidateEntries = Object.keys(relevanceLookup)
      .filter((key) => key.endsWith(`::${req.req_id}`))
      .map((key) => {
        const [bulletId] = key.split("::");
        return { bulletId, rel: relevanceLookup[key] };
      })
      .filter((entry) => entry.rel >= minRel)
      .filter((entry) => evidenceMap[entry.bulletId]);
    const prefPool = candidateEntries.filter(
      (entry) => (TIER_RANK[evidenceMap[entry.bulletId].tier] || 0) >= TIER_RANK.medium
    );
    const pool = prefPool.length ? prefPool : candidateEntries;
    const poolCount = pool.length;
    const scored = pool
      .filter((entry) => !isReqCapExceeded(req.req_id))
      .map((entry) => {
        const bullet = evidenceMap[entry.bulletId];
        const redundancyInfo = computeRedundancy(vectorLookup[entry.bulletId], selectedVectors, thresholds.redundancy);
        if (redundancyInfo.blocked) {
          redundancyDrops.add(entry.bulletId);
          return null;
        }
        if (!applyBudgetCheck({ bullet, counters, budgets, roleCaps })) {
          budgetDrops.add(entry.bulletId);
          return null;
        }
        const riskPenalty = deriveRiskPenalty(bullet);
        const edgeScore = scoreEdge({
          rel: entry.rel,
          evidence: bullet.evidence_score,
          redundancyPenalty: redundancyInfo.penalty,
          riskPenalty,
          weights: weights.edge
        });
        return { ...entry, edgeScore, redundancyInfo };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.edgeScore !== a.edgeScore) return b.edgeScore - a.edgeScore;
        return a.bulletId.localeCompare(b.bulletId);
      });
    if (!scored.length) {
      coverageState[req.req_id] = coverageState[req.req_id] || { covered: false, assignments: 0, reason: null };
      coverageState[req.req_id].reason = poolCount ? "blocked_by_budget_or_redundancy" : "no_supporting_bullet_found";
      return;
    }
    const best = scored[0];
    selectBullet(best.bulletId, req, best.rel, best.redundancyInfo);
  });

  const allBulletIds = Object.keys(evidenceMap);
  const remaining = allBulletIds.filter((id) => !selected[id]);

  while (
    counters.experience < budgets.experience_bullets_max ||
    counters.projects < budgets.project_bullets_max
  ) {
    const candidates = remaining
      .map((bulletId) => {
        const bullet = evidenceMap[bulletId];
        const redundancyInfo = computeRedundancy(vectorLookup[bulletId], selectedVectors, thresholds.redundancy);
        if (redundancyInfo.blocked) {
          redundancyDrops.add(bulletId);
          return null;
        }
        if (!applyBudgetCheck({ bullet, counters, budgets, roleCaps })) {
          budgetDrops.add(bulletId);
          return null;
        }
        const eligibleReqs = (requirements || [])
          .filter((req) => !isReqCapExceeded(req.req_id))
          .map((req) => {
            const rel = getRelScore(relevanceLookup, bulletId, req.req_id);
            const minRel = req.type === "must" ? thresholds.must_min_rel : thresholds.nice_min_rel;
            if (rel < minRel) return null;
            if (!evidenceTierAllowed(bullet.tier, req.type, thresholds.min_evidence_tier_nice)) return null;
            return { req, rel };
          })
          .filter(Boolean);
        if (!eligibleReqs.length) return null;
        const newlyCovering = eligibleReqs.filter((entry) => !(coverageState[entry.req.req_id]?.covered));
        const marginalCoverage = newlyCovering.length;
        const relValues = (newlyCovering.length ? newlyCovering : eligibleReqs).map((e) => e.rel);
        const avgRel = relValues.reduce((sum, v) => sum + v, 0) / relValues.length;
        const riskPenalty = deriveRiskPenalty(bullet);
        const gainScore =
          (weights.fill.alpha || 0.5) * marginalCoverage +
          (weights.fill.beta || 0.3) * avgRel +
          (weights.fill.gamma || 0.2) * bullet.evidence_score -
          (weights.edge.w_red || 0.2) * (redundancyInfo.penalty || 0) -
          (weights.edge.w_risk || 0.15) * riskPenalty;
        return { bulletId, gainScore, redundancyInfo, eligibleReqs, avgRel };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.gainScore !== a.gainScore) return b.gainScore - a.gainScore;
        return a.bulletId.localeCompare(b.bulletId);
      });
    if (!candidates.length) break;
    const chosen = candidates[0];
    const bullet = evidenceMap[chosen.bulletId];
    selectBullet(chosen.bulletId, chosen.eligibleReqs[0].req, chosen.eligibleReqs[0].rel, chosen.redundancyInfo);
    chosen.eligibleReqs
      .sort((a, b) => b.rel - a.rel)
      .forEach((entry) => {
        if (isReqCapExceeded(entry.req.req_id)) return;
        reqSelectionCounts[entry.req.req_id] = (reqSelectionCounts[entry.req.req_id] || 0) + 1;
        const edgeScore = scoreEdge({
          rel: entry.rel,
          evidence: bullet.evidence_score,
          redundancyPenalty: chosen.redundancyInfo.penalty,
          riskPenalty: deriveRiskPenalty(bullet),
          weights: weights.edge
        });
        addMatchToBullet(selected, chosen.bulletId, {
          req_id: entry.req.req_id,
          rel: entry.rel,
          edge_score: edgeScore
        });
        updateCoverageForMatch(coverageState, entry.req.req_id, edgeScore, thresholds.cover_threshold);
      });
    remaining.splice(remaining.indexOf(chosen.bulletId), 1);
  }

  (requirements || []).forEach((req) => {
    if (!coverageState[req.req_id]) {
      coverageState[req.req_id] = { covered: false, assignments: 0, reason: "no_supporting_bullet_found" };
    }
  });

  return {
    selected,
    counters,
    coverageState,
    redundancyDrops: Array.from(redundancyDrops),
    budgetDrops: Array.from(budgetDrops),
    orderedReqs,
    candidateCounts
  };
}

async function runSelectionStage({
  runId,
  runDir,
  configPath = DEFAULT_CONFIG_PATH,
  embedConfigOverride = {},
  baselineResumeOverride = null,
  resumeEmbeddingsOverride = null,
  logger
}) {
  const started = Date.now();
  const { config, hash: configHash } = loadSelectionConfig(configPath);

  const rubricPath = path.join(runDir, "jd_rubric.json");
  const evidencePath = path.join(runDir, "evidence_scores.json");
  const relevancePath = path.join(runDir, "relevance_matrix.json");
  const baselinePath = path.join(runDir, "baseline_resume.json");

  const rubric = readJsonRequired(rubricPath, "missing jd_rubric.json");
  const evidence = readJsonRequired(evidencePath, "missing evidence_scores.json");
  const relevanceMatrix = readJsonRequired(relevancePath, "missing relevance_matrix.json");
  const baseline = baselineResumeOverride || readJsonRequired(baselinePath, "missing baseline_resume.json");

  const evidenceMap = {};
  (evidence.bullets || []).forEach((b) => {
    evidenceMap[b.bullet_id] = b;
  });

  const masterResumeHash = evidence.resume_hash || computeMasterResumeHash(baseline);
  const embedConfig = getEmbedConfig({
    cacheRoot: embedConfigOverride.cacheRoot || embedConfigOverride.cache_root,
    embeddingModel: embedConfigOverride.embeddingModel,
    embeddingDims: embedConfigOverride.embeddingDims,
    preprocessVersion: embedConfigOverride.preprocessVersion
  });
  const resumeEmbeddings =
    resumeEmbeddingsOverride ||
    loadResumeEmbeddingVectors({
      masterResumeHash,
      embedConfig,
      cacheRoot: embedConfigOverride.cacheRoot || embedConfigOverride.cache_root
    });

  const relevanceLookup = buildRelevanceLookup(relevanceMatrix);
  const baselineMeta = gatherBaselineMeta(baseline);
  const coreResult = runSelectionCore({
    requirements: rubric.requirements || [],
    evidenceMap,
    relevanceLookup,
    vectorLookup: resumeEmbeddings.vectorLookup || {},
    config,
    baselineMeta
  });

  const { workSelections, projectSelections, awards } = buildSelectionOutputs(
    coreResult.selected,
    baselineMeta,
    config.budgets || {}
  );

  const coverage = {
    must_total: (rubric.requirements || []).filter((r) => r.type === "must").length,
    nice_total: (rubric.requirements || []).filter((r) => r.type === "nice").length,
    must_covered: (rubric.requirements || []).filter(
      (r) => r.type === "must" && (coreResult.coverageState[r.req_id]?.covered)
    ).length,
    nice_covered: (rubric.requirements || []).filter(
      (r) => r.type === "nice" && (coreResult.coverageState[r.req_id]?.covered)
    ).length,
    uncovered_requirements: (rubric.requirements || [])
      .filter((req) => !coreResult.coverageState[req.req_id]?.covered)
      .map((req) => ({
        req_id: req.req_id,
        type: req.type,
        weight: req.weight,
        reason: coreResult.coverageState[req.req_id]?.reason || "not_covered"
      }))
  };

  let jobHash = rubric.job_meta?.raw_job_text_hash || rubric.job_meta?.raw_text_hash || null;
  const jobTextPath = path.join(runDir, "job_extracted.txt");
  if (!jobHash && fs.existsSync(jobTextPath)) {
    const jobText = fs.readFileSync(jobTextPath, "utf8");
    jobHash = `sha256:${hashString(jobText)}`;
  }
  const rubricHash = rubric.rubric_hash || `sha256:${hashString(JSON.stringify(rubric || {}))}`;

  const plan = {
    version: PLAN_VERSION,
    run_id: runId,
    master_resume_hash: masterResumeHash.startsWith("sha256:") ? masterResumeHash : `sha256:${masterResumeHash}`,
    job_extracted_hash: jobHash,
    rubric_hash: rubricHash,
    embedding_model: embedConfig.embeddingModel,
    config: {
      config_version: config.config_version || "selection_config_v1",
      budgets: config.budgets,
      thresholds: config.thresholds,
      weights: config.weights
    },
    coverage,
    selected: {
      work_experience: workSelections,
      projects: projectSelections,
      awards
    },
    budgets_used: {
      experience_bullets: coreResult.counters.experience,
      project_bullets: coreResult.counters.projects,
      award_lines: awards.length,
      per_role: coreResult.counters.perRole
    },
    selection_notes: {
      dropped_due_to_redundancy: coreResult.redundancyDrops,
      dropped_due_to_budget: coreResult.budgetDrops
    }
  };

  const debug = {
    ordered_requirements: coreResult.orderedReqs.map((r) => r.req_id),
    candidate_counts: coreResult.candidateCounts,
    selection_duration_ms: Date.now() - started,
    config_hash: configHash,
    resume_embeddings_cache: resumeEmbeddings.cachePath || null
  };

  const planPath = path.join(runDir, "selection_plan.json");
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf8");
  const debugPath = path.join(runDir, "selection_debug.json");
  fs.writeFileSync(debugPath, JSON.stringify(debug, null, 2), "utf8");
  const computeMs = Date.now() - started;

  logger?.(`Selection plan written to ${planPath} in ${computeMs}ms`);

  return {
    planPath,
    debugPath,
    plan,
    debug,
    meta: {
      selection_plan_version: PLAN_VERSION,
      selection_plan_hash: `sha256:${hashString(JSON.stringify(plan || {}))}`,
      selection_config_hash: configHash,
      selection_compute_ms: computeMs,
      selection_must_covered: coverage.must_covered,
      selection_must_total: coverage.must_total,
      selection_bullets_experience: coreResult.counters.experience,
      selection_bullets_projects: coreResult.counters.projects
    }
  };
}

export {
  runSelectionStage,
  loadSelectionConfig,
  computeRedundancy,
  rankRequirements,
  evidenceTierAllowed,
  computeRewriteIntent
};
