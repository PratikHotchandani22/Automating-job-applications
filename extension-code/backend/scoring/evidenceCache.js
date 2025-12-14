import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CACHE_ROOT =
  process.env.EVIDENCE_CACHE_DIR || path.join(__dirname, "..", "cache", "evidence_scores");

const EPHEMERAL_FIELDS = new Set([
  "created_at",
  "updated_at",
  "generated_at",
  "run_id",
  "timestamp",
  "hash"
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isPlainObject(val) {
  return val && typeof val === "object" && !Array.isArray(val);
}

function stripEphemeral(value) {
  if (Array.isArray(value)) {
    return value.map(stripEphemeral);
  }
  if (isPlainObject(value)) {
    const result = {};
    Object.keys(value)
      .filter((key) => !EPHEMERAL_FIELDS.has(key))
      .sort()
      .forEach((key) => {
        const cleaned = stripEphemeral(value[key]);
        if (typeof cleaned !== "undefined") {
          result[key] = cleaned;
        }
      });
    return result;
  }
  return value;
}

export function canonicalJsonStringify(value) {
  const cleaned = stripEphemeral(value);
  return JSON.stringify(cleaned);
}

export function sha256String(str = "") {
  return createHash("sha256").update(str || "", "utf8").digest("hex");
}

export function sha256File(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return sha256String(content);
}

export function computeMasterResumeHash(resumeJson = {}) {
  return sha256String(canonicalJsonStringify(resumeJson));
}

export function getCacheRoot(overrideRoot) {
  return overrideRoot || DEFAULT_CACHE_ROOT;
}

export function getCachePath(resumeHash, rulesHash, cacheRoot = getCacheRoot()) {
  if (!resumeHash || !rulesHash) return null;
  const dir = path.join(cacheRoot, resumeHash, rulesHash);
  return {
    dir,
    filePath: path.join(dir, "evidence_scores.json"),
    manifestPath: path.join(dir, "manifest.json")
  };
}

export function validateEvidenceScoresJson(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    errors.push("Root must be an object");
  }
  if (!data.summary || typeof data.summary !== "object") {
    errors.push("Missing summary");
  }
  if (!Array.isArray(data.bullets)) {
    errors.push("Missing bullets array");
  }

  if (Array.isArray(data.bullets)) {
    data.bullets.slice(0, 5).forEach((bullet, idx) => {
      if (!bullet || typeof bullet !== "object") {
        errors.push(`Bullet ${idx} not an object`);
        return;
      }
      if (!bullet.bullet_id) errors.push(`Bullet ${idx} missing bullet_id`);
      if (typeof bullet.evidence_score !== "number") {
        errors.push(`Bullet ${idx} missing evidence_score`);
      }
      if (!bullet.tier) errors.push(`Bullet ${idx} missing tier`);
      if (typeof bullet.text !== "string") errors.push(`Bullet ${idx} missing text`);
    });
  }

  return { valid: errors.length === 0, errors };
}

export async function readCachedEvidenceScores({
  resumeHash,
  rulesHash,
  cacheRoot,
  validate = true
}) {
  const paths = getCachePath(resumeHash, rulesHash, getCacheRoot(cacheRoot));
  if (!paths || !fs.existsSync(paths.filePath)) {
    return { data: null, cachePath: paths?.filePath || null, reason: "missing" };
  }

  try {
    const raw = await fs.promises.readFile(paths.filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (validate) {
      const validation = validateEvidenceScoresJson(parsed);
      if (!validation.valid) {
        return {
          data: null,
          cachePath: paths.filePath,
          reason: "invalid",
          errors: validation.errors
        };
      }
    }
    return { data: parsed, cachePath: paths.filePath, manifestPath: paths.manifestPath };
  } catch (error) {
    return { data: null, cachePath: paths.filePath, reason: "corrupt", errors: [error.message] };
  }
}

export async function writeCachedEvidenceScores({
  resumeHash,
  rulesHash,
  cacheRoot,
  data
}) {
  const paths = getCachePath(resumeHash, rulesHash, getCacheRoot(cacheRoot));
  if (!paths) return null;
  ensureDir(paths.dir);
  const now = new Date().toISOString();
  await fs.promises.writeFile(paths.filePath, JSON.stringify(data, null, 2), "utf8");
  const manifest = {
    resume_hash: resumeHash,
    rules_hash: rulesHash,
    cached_at: now,
    source_run_id: data.run_id || null,
    source_generated_at: data.generated_at || null
  };
  await fs.promises.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return paths.filePath;
}
