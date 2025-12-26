import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { computeMasterResumeHash } from "../scoring/evidenceCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
const DEFAULT_DIMS =
  Number.isFinite(Number(process.env.OPENAI_EMBEDDING_DIMS)) && Number(process.env.OPENAI_EMBEDDING_DIMS) > 0
    ? Number(process.env.OPENAI_EMBEDDING_DIMS)
    : 3072;
const DEFAULT_PREPROCESS_VERSION = process.env.EMBED_PREPROCESS_VERSION || "embed_text_v1";
const DEFAULT_CACHE_ROOT = process.env.EMBED_CACHE_DIR || path.join(__dirname, "..", "cache", "embeddings");
const RESUME_EMBED_VERSION = "resume_bullet_embeddings_v1";
const JD_EMBED_VERSION = "jd_requirement_embeddings_v1";
const RELEVANCE_VERSION = "relevance_matrix_v1";
const RELEVANCE_SUMMARY_VERSION = "relevance_summary_v1";
const MAX_EMBED_TEXT_LENGTH = 2000;
const DEFAULT_TOP_K_PER_REQ = 12;
const DEFAULT_TOP_K_PER_BULLET = 8;
const DEFAULT_MIN_SCORE = 0.25;

function hashString(str = "") {
  return createHash("sha256").update(str || "", "utf8").digest("hex");
}

function prefixedHash(str = "") {
  return `sha256:${hashString(str)}`;
}

function embedTextV1(text = "") {
  let normalized = (text || "").trim();
  normalized = normalized.replace(/\s+/g, " ");
  normalized = normalized.replace(/\*\*(.*?)\*\*/g, "$1");
  normalized = normalized.replace(/__(.*?)__/g, "$1");
  normalized = normalized.replace(/\*(.*?)\*/g, "$1");
  normalized = normalized.replace(/_(.*?)_/g, "$1");
  normalized = normalized.replace(/^[-•]\s*/, "");
  if (normalized.length > MAX_EMBED_TEXT_LENGTH) {
    normalized = normalized.slice(0, MAX_EMBED_TEXT_LENGTH);
  }
  return normalized;
}

function preprocessText(text = "", version = DEFAULT_PREPROCESS_VERSION) {
  if (version === "embed_text_v1") return embedTextV1(text);
  return embedTextV1(text);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getEmbedConfig(overrides = {}) {
  const model = overrides.embeddingModel || DEFAULT_MODEL;
  const dims =
    Number.isFinite(Number(overrides.embeddingDims)) && Number(overrides.embeddingDims) > 0
      ? Number(overrides.embeddingDims)
      : DEFAULT_DIMS;
  const preprocessVersion = overrides.preprocessVersion || DEFAULT_PREPROCESS_VERSION;
  const cacheRoot = overrides.cacheRoot || DEFAULT_CACHE_ROOT;
  const chunkSize =
    Number.isFinite(Number(overrides.chunkSize)) && Number(overrides.chunkSize) > 0 ? Number(overrides.chunkSize) : 128;
  return { embeddingModel: model, embeddingDims: dims, preprocessVersion, cacheRoot, chunkSize };
}

function buildEmbedKeyHash({ embeddingModel, preprocessVersion, embeddingDims }) {
  return hashString(`${embeddingModel}|${preprocessVersion}|dims=${embeddingDims}`);
}

function getResumeCachePaths(masterResumeHash, embedKeyHash, cacheRoot = DEFAULT_CACHE_ROOT) {
  if (!masterResumeHash || !embedKeyHash) return null;
  const dir = path.join(cacheRoot, "resume_bullets", masterResumeHash, embedKeyHash);
  return {
    dir,
    filePath: path.join(dir, "resume_bullet_embeddings.json"),
    manifestPath: path.join(dir, "manifest.json")
  };
}

function gatherResumeBullets(resume = {}) {
  const bullets = [];
  const add = (list, parentType) => {
    (list || []).forEach((entry, idx) => {
      const ownerId = entry?.id || `${parentType}_${idx + 1}`;
      const providedIds = Array.isArray(entry?.bullet_ids) ? entry.bullet_ids : [];
      const bulletIds =
        providedIds.length === (entry?.bullets || []).length
          ? providedIds
          : (entry?.bullets || []).map((_, bIdx) => `${ownerId}_b${bIdx + 1}`);
      (entry?.bullets || []).forEach((text, bIdx) => {
        bullets.push({
          bullet_id: bulletIds[bIdx],
          parent_type: parentType,
          parent_id: ownerId,
          text: text || ""
        });
      });
    });
  };
  add(resume.work_experience || resume.experience, "experience");
  add(resume.projects, "project");
  return bullets;
}

function validateVectorLength(vector, dims) {
  return Array.isArray(vector) && vector.length === dims && vector.every((v) => typeof v === "number");
}

function validateResumeEmbeddingArtifact(artifact, expected) {
  const errors = [];
  if (!artifact || typeof artifact !== "object") {
    errors.push("Root must be object");
    return { valid: false, errors };
  }
  if (artifact.version !== RESUME_EMBED_VERSION) errors.push("version mismatch");
  if (artifact.master_resume_hash !== expected.masterResumeHash) errors.push("master_resume_hash mismatch");
  if (artifact.embedding_model !== expected.embeddingModel) errors.push("embedding_model mismatch");
  if (artifact.dims !== expected.embeddingDims) errors.push("dims mismatch");
  if (artifact.preprocess_version !== expected.preprocessVersion) errors.push("preprocess_version mismatch");
  if (!Array.isArray(artifact.bullets)) errors.push("bullets missing");
  (artifact.bullets || []).forEach((b, idx) => {
    if (!b || typeof b !== "object") errors.push(`bullet ${idx} not object`);
    if (!b.bullet_id) errors.push(`bullet ${idx} missing bullet_id`);
    if (!b.text_hash) errors.push(`bullet ${idx} missing text_hash`);
    if (!validateVectorLength(b.vector, expected.embeddingDims)) errors.push(`bullet ${idx} invalid vector`);
  });
  return { valid: errors.length === 0, errors };
}

function readCachedResumeEmbeddings({ masterResumeHash, embedKeyHash, config }) {
  const paths = getResumeCachePaths(masterResumeHash, embedKeyHash, config.cacheRoot);
  if (!paths || !fs.existsSync(paths.filePath)) {
    return { data: null, cachePath: paths?.filePath || null, reason: "missing" };
  }
  try {
    const raw = fs.readFileSync(paths.filePath, "utf8");
    const parsed = JSON.parse(raw);
    const validation = validateResumeEmbeddingArtifact(parsed, {
      masterResumeHash,
      embeddingModel: config.embeddingModel,
      embeddingDims: config.embeddingDims,
      preprocessVersion: config.preprocessVersion
    });
    if (!validation.valid) {
      return { data: null, cachePath: paths.filePath, reason: "invalid", errors: validation.errors };
    }
    return { data: parsed, cachePath: paths.filePath, manifestPath: paths.manifestPath };
  } catch (error) {
    return { data: null, cachePath: paths.filePath, reason: "corrupt", errors: [error.message] };
  }
}

function writeResumeEmbeddingCache({ artifact, masterResumeHash, embedKeyHash, config }) {
  const paths = getResumeCachePaths(masterResumeHash, embedKeyHash, config.cacheRoot);
  if (!paths) return null;
  ensureDir(paths.dir);
  const now = new Date().toISOString();
  fs.writeFileSync(paths.filePath, JSON.stringify(artifact, null, 2), "utf8");
  const manifest = {
    version: "resume_bullet_embeddings_manifest_v1",
    cached_at: now,
    master_resume_hash: masterResumeHash,
    embed_key_hash: embedKeyHash,
    embedding_model: config.embeddingModel,
    dims: config.embeddingDims,
    preprocess_version: config.preprocessVersion,
    source_run_id: artifact.run_id || null
  };
  fs.writeFileSync(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return paths.filePath;
}

function seededVector(text, dims) {
  const seedHex = hashString(text).slice(0, 16);
  let seed = parseInt(seedHex, 16) || 1;
  const next = () => {
    seed = (seed ^ 61) ^ (seed >> 16);
    seed += seed << 3;
    seed ^= seed >> 4;
    seed *= 0x27d4eb2d;
    seed ^= seed >> 15;
    return (seed >>> 0) / 4294967295;
  };
  const vector = [];
  for (let i = 0; i < dims; i += 1) {
    const val = next() * 2 - 1; // [-1, 1]
    vector.push(Number(val.toFixed(6)));
  }
  return vector;
}

async function embedTexts({ entries, config, openaiClient, mockMode = false }) {
  const vectors = [];
  if (mockMode || !openaiClient) {
    entries.forEach((entry) => {
      vectors.push(seededVector(entry.preprocessed, config.embeddingDims));
    });
    return vectors;
  }
  for (let i = 0; i < entries.length; i += config.chunkSize) {
    const batch = entries.slice(i, i + config.chunkSize);
    const response = await openaiClient.embeddings.create({
      model: config.embeddingModel,
      input: batch.map((item) => item.preprocessed)
    });
    const data = response.data || [];
    data.forEach((item) => {
      const vector = item.embedding || item.vector || [];
      if (!validateVectorLength(vector, config.embeddingDims)) {
        const err = new Error("Embedding dimension mismatch");
        err.stage = "embeddings";
        throw err;
      }
      vectors.push(vector);
    });
  }
  return vectors;
}

async function computeResumeEmbeddings({ masterResume, masterResumeHash, config, openaiClient, mockMode, logger }) {
  const embedKeyHash = buildEmbedKeyHash(config);
  const cacheLookup = readCachedResumeEmbeddings({ masterResumeHash, embedKeyHash, config });
  if (cacheLookup?.data) {
    logger?.(`Resume embeddings cache HIT at ${cacheLookup.cachePath}`);
    return {
      artifact: cacheLookup.data,
      cacheHit: true,
      cachePath: cacheLookup.cachePath,
      computeMs: 0,
      embedKeyHash
    };
  }
  const reason = cacheLookup?.reason ? ` (${cacheLookup.reason})` : "";
  logger?.(`Resume embeddings cache MISS${reason} for ${masterResumeHash}`);
  const bullets = gatherResumeBullets(masterResume);
  const entries = bullets.map((bullet) => {
    const preprocessed = preprocessText(bullet.text, config.preprocessVersion);
    return { ...bullet, preprocessed, text_hash: prefixedHash(preprocessed) };
  });
  const started = Date.now();
  const vectors = await embedTexts({ entries, config, openaiClient, mockMode });
  const computeMs = Date.now() - started;
  const artifact = {
    version: RESUME_EMBED_VERSION,
    master_resume_hash: masterResumeHash,
    embedding_model: config.embeddingModel,
    dims: config.embeddingDims,
    preprocess_version: config.preprocessVersion,
    created_at: new Date().toISOString(),
    bullets: entries.map((entry, idx) => ({
      bullet_id: entry.bullet_id,
      text_hash: entry.text_hash,
      text_preview: entry.preprocessed.slice(0, 180),
      vector: vectors[idx]
    }))
  };
  const cachePath = writeResumeEmbeddingCache({
    artifact,
    masterResumeHash,
    embedKeyHash,
    config
  });
  return { artifact, cacheHit: false, cachePath, computeMs, embedKeyHash };
}

async function computeRequirementEmbeddings({
  runId,
  rubric,
  jobExtractedHash,
  config,
  openaiClient,
  mockMode,
  runDir
}) {
  const requirements = Array.isArray(rubric?.requirements) ? rubric.requirements : [];
  const entries = requirements.map((req) => {
    const preprocessed = preprocessText(req.requirement || req.text || "", config.preprocessVersion);
    return { req_id: req.req_id, type: req.type, weight: req.weight, text: req.requirement || req.text || "", preprocessed };
  });
  const vectors = await embedTexts({ entries, config, openaiClient, mockMode });
  const artifact = {
    version: JD_EMBED_VERSION,
    run_id: runId,
    job_extracted_hash: jobExtractedHash
      ? jobExtractedHash.startsWith("sha256:")
        ? jobExtractedHash
        : `sha256:${jobExtractedHash}`
      : null,
    rubric_hash: prefixedHash(JSON.stringify(rubric || {})),
    embedding_model: config.embeddingModel,
    dims: config.embeddingDims,
    preprocess_version: config.preprocessVersion,
    requirements: entries.map((entry, idx) => ({
      req_id: entry.req_id,
      weight: entry.weight,
      type: entry.type,
      text_hash: prefixedHash(entry.preprocessed),
      text: entry.text,
      vector: vectors[idx]
    }))
  };
  if (runDir) {
    ensureDir(runDir);
    fs.writeFileSync(path.join(runDir, "jd_requirement_embeddings.json"), JSON.stringify(artifact, null, 2), "utf8");
  }
  return artifact;
}

function computeCosineSimilarity(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildRelevanceMatrix({ runId, resumeEmbeddings, requirementEmbeddings, config, thresholds = {} }) {
  const minScore = thresholds.min_score ?? DEFAULT_MIN_SCORE;
  const topKReq = thresholds.top_k_per_requirement ?? DEFAULT_TOP_K_PER_REQ;
  const topKBullet = thresholds.top_k_per_bullet ?? DEFAULT_TOP_K_PER_BULLET;
  const perRequirementTop = {};
  const perBulletTop = {};

  requirementEmbeddings.requirements.forEach((req) => {
    const scores = resumeEmbeddings.bullets
      .map((b) => ({ bullet_id: b.bullet_id, score: computeCosineSimilarity(req.vector, b.vector) }))
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topKReq);
    perRequirementTop[req.req_id] = scores;
  });

  resumeEmbeddings.bullets.forEach((b) => {
    const scores = requirementEmbeddings.requirements
      .map((req) => ({ req_id: req.req_id, score: computeCosineSimilarity(req.vector, b.vector) }))
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topKBullet);
    perBulletTop[b.bullet_id] = scores;
  });

  return {
    version: RELEVANCE_VERSION,
    run_id: runId,
    embedding_model: config.embeddingModel,
    dims: config.embeddingDims,
    cosine: true,
    thresholds: {
      min_score: minScore,
      top_k_per_requirement: topKReq,
      top_k_per_bullet: topKBullet
    },
    per_requirement_top_bullets: perRequirementTop,
    per_bullet_top_requirements: perBulletTop
  };
}

function buildRelevanceSummary({ runId, resumeEmbeddings, requirementEmbeddings, matrix }) {
  const sampleReq = requirementEmbeddings.requirements[0];
  return {
    version: RELEVANCE_SUMMARY_VERSION,
    run_id: runId,
    bullets_count: resumeEmbeddings.bullets.length,
    requirements_count: requirementEmbeddings.requirements.length,
    sample: sampleReq
      ? {
          req_id: sampleReq.req_id,
          top_bullets: matrix.per_requirement_top_bullets[sampleReq.req_id] || []
        }
      : null,
    thresholds: matrix.thresholds
  };
}

async function runEmbeddingStage({
  runId,
  runDir,
  masterResume,
  rubric,
  jobExtractedHash,
  masterResumeHash,
  openaiClient,
  mockMode = false,
  config: overrideConfig = {},
  logger
}) {
  const config = getEmbedConfig(overrideConfig);
  if (!mockMode && !openaiClient) {
    const err = new Error("OPENAI_API_KEY is not set for embeddings");
    err.stage = "embeddings";
    throw err;
  }
  const resumeHash = masterResumeHash || computeMasterResumeHash(masterResume);
  const resumeResult = await computeResumeEmbeddings({
    masterResume,
    masterResumeHash: resumeHash,
    config,
    openaiClient,
    mockMode,
    logger
  });

  const startedReq = Date.now();
  const requirementEmbeddings = await computeRequirementEmbeddings({
    runId,
    rubric,
    jobExtractedHash,
    config,
    openaiClient,
    mockMode,
    runDir
  });
  const reqComputeMs = Date.now() - startedReq;

  const startedRel = Date.now();
  const relevanceMatrix = buildRelevanceMatrix({
    runId,
    resumeEmbeddings: resumeResult.artifact,
    requirementEmbeddings,
    config
  });
  const relevanceSummary = buildRelevanceSummary({
    runId,
    resumeEmbeddings: resumeResult.artifact,
    requirementEmbeddings,
    matrix: relevanceMatrix
  });
  const relevanceMs = Date.now() - startedRel;

  ensureDir(runDir);
  fs.writeFileSync(path.join(runDir, "relevance_matrix.json"), JSON.stringify(relevanceMatrix, null, 2), "utf8");
  fs.writeFileSync(path.join(runDir, "relevance_summary.json"), JSON.stringify(relevanceSummary, null, 2), "utf8");

  return {
    meta: {
      embedding_model: config.embeddingModel,
      embedding_dims: config.embeddingDims,
      embed_preprocess_version: config.preprocessVersion,
      resume_bullet_embeddings_cache_hit: resumeResult.cacheHit,
      resume_bullet_embeddings_cache_path: resumeResult.cachePath,
      resume_bullet_embeddings_compute_ms: resumeResult.computeMs,
      jd_requirement_embeddings_compute_ms: reqComputeMs,
      relevance_compute_ms: relevanceMs,
      rubric_hash: prefixedHash(JSON.stringify(rubric || {})),
      master_resume_hash: resumeHash
    },
    artifacts: {
      resume_embeddings: resumeResult.artifact,
      jd_requirement_embeddings: requirementEmbeddings,
      relevance_matrix: relevanceMatrix,
      relevance_summary: relevanceSummary
    }
  };
}

export {
  embedTextV1,
  preprocessText,
  computeCosineSimilarity,
  buildEmbedKeyHash,
  runEmbeddingStage,
  getEmbedConfig,
  readCachedResumeEmbeddings
};
