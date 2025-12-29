import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { loadPrompt } from "./promptLoader.js";
import { loadEvidenceRules, scoreMasterResume } from "./scoring/evidenceScorer.js";
import {
  computeMasterResumeHash,
  getCachePath,
  readCachedEvidenceScores,
  writeCachedEvidenceScores
} from "./scoring/evidenceCache.js";
import { runEmbeddingStage } from "./embeddings/engine.js";
import { runSelectionStage } from "./selection/selector.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  port: Number(process.env.PORT || 3001),
  runsRoot: process.env.RUNS_ROOT || path.join(__dirname, "runs"),
  resumesDir: process.env.RESUMES_DIR || path.join(__dirname, "resumes"),
  evidenceRulesPath: process.env.EVIDENCE_RULES_PATH || path.join(__dirname, "scoring", "evidence_rules_v1.json"),
  promptsVersion: process.env.PROMPT_VERSION || "latest_v3",
  rubricPromptVersion: process.env.RUBRIC_PROMPT_VERSION || "latest_v1",
  latexTemplate: process.env.LATEX_TEMPLATE || path.join(__dirname, "templates", "resume_template.tex"),
  latexEngine: process.env.LATEX_ENGINE || "pdflatex",
  tailorModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  chatModel: process.env.OPENAI_MODEL_CHAT || process.env.OPENAI_MODEL || "gpt-4o-mini",
  editModel: process.env.OPENAI_MODEL_EDIT || process.env.OPENAI_MODEL_CHAT || process.env.OPENAI_MODEL || "gpt-4o-mini",
  rubricModel: process.env.OPENAI_MODEL_RUBRIC || process.env.OPENAI_MODEL || "gpt-4o-mini",
  latexModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
  rubricTemperature: Number(process.env.RUBRIC_TEMPERATURE || 0.15),
  chatTemperature: Number(process.env.CHAT_TEMPERATURE || 0.2),
  chatMaxMessages: Number(process.env.CHAT_MAX_MESSAGES || 20),
  chatMaxContextChars: Number(process.env.CHAT_MAX_CONTEXT_CHARS || 80000),
  editPromptVersion: process.env.EDIT_PROMPT_VERSION || "latest_v1",
  stageTimeoutMs: Number(process.env.STAGE_TIMEOUT_MS || 300000),
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
  embeddingDims:
    Number.isFinite(Number(process.env.OPENAI_EMBEDDING_DIMS)) && Number(process.env.OPENAI_EMBEDDING_DIMS) > 0
      ? Number(process.env.OPENAI_EMBEDDING_DIMS)
      : null,
  embedCacheRoot: process.env.EMBED_CACHE_DIR || path.join(__dirname, "cache", "embeddings"),
  embedPreprocessVersion: process.env.EMBED_PREPROCESS_VERSION || "embed_text_v1",
  selectionConfigPath: process.env.SELECTION_CONFIG_PATH || path.join(__dirname, "selection", "selection_config_v1.json"),
  mockMode: process.env.MOCK_MODE === "1" || process.env.MOCK_PIPELINE === "1",
  evidenceCacheRoot: process.env.EVIDENCE_CACHE_DIR || path.join(__dirname, "cache", "evidence_scores"),
  tailorPromptVersion: process.env.TAILOR_PROMPT_VERSION || process.env.PROMPT_VERSION || "latest_v4_selection"
};

const IS_TEST = process.env.NODE_ENV === "test";

const openai = CONFIG.mockMode || IS_TEST ? null : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = CONFIG.mockMode || IS_TEST ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

ensureDir(CONFIG.runsRoot);
ensureDir(CONFIG.resumesDir);
ensureDir(path.dirname(CONFIG.latexTemplate));
ensureDir(CONFIG.evidenceCacheRoot);
ensureDir(CONFIG.embedCacheRoot);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const RUNS_ROOT_RESOLVED = path.resolve(CONFIG.runsRoot);
function getSafeRunDir(runId) {
  const runDir = path.resolve(RUNS_ROOT_RESOLVED, String(runId || ""));
  if (!runDir.startsWith(RUNS_ROOT_RESOLVED + path.sep)) return null;
  return runDir;
}

const PROMPT_CACHE = {};
const LATEX_TEMPLATE = fs.existsSync(CONFIG.latexTemplate)
  ? fs.readFileSync(CONFIG.latexTemplate, "utf8")
  : "";
const LOCK_MARKERS = {
  header: {
    start: "%===LOCK_HEADER_START===",
    end: "%===LOCK_HEADER_END==="
  },
  education: {
    start: "%===LOCK_EDUCATION_START===",
    end: "%===LOCK_EDUCATION_END==="
  }
};
const TEMPLATE_LOCKS = extractLockedBlocks(LATEX_TEMPLATE, LOCK_MARKERS);
const JD_RUBRIC_SCHEMA_V1 = {
  version: "jd_rubric_v1",
  job_meta: {
    job_title: "",
    company: "",
    location: "",
    employment_type: "",
    seniority: "",
    job_url: "",
    platform: ""
  },
  requirements: [
    {
      req_id: "R1",
      type: "must",
      weight: 5,
      requirement: "",
      jd_evidence: [""],
      category: "ml"
    }
  ],
  keywords: [
    {
      term: "",
      importance: 5,
      type: "tool",
      jd_evidence: [""]
    }
  ],
  constraints: {
    years_experience_min: null,
    education: [],
    certifications: [],
    work_authorization: []
  },
  notes: {
    summary: "",
    ambiguities: []
  }
};
const RUBRIC_ALLOWED_CATEGORIES = new Set(["ml", "mlops", "data", "genai", "backend", "cloud", "product", "leadership", "domain", "security", "other"]);


app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mock: CONFIG.mockMode,
    latexEngine: CONFIG.latexEngine
  });
});

app.post("/analyze", async (req, res) => {
  try {
    const { job_payload, resume_id = "default", master_resume_json, options = {} } = req.body || {};
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:150',message:'Analyze endpoint called',data:{resume_id,has_master_resume_json:!!master_resume_json,work_exp_count:master_resume_json?.work_experience?.length,project_count:master_resume_json?.projects?.length,options},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!job_payload || !job_payload.job) {
      res.status(400).json({ status: "error", message: "job_payload is required" });
      return;
    }

    // If master_resume_json is provided, save it to the file system
    if (master_resume_json) {
      const resumeFilePath = path.join(CONFIG.resumesDir, `${resume_id}.json`);
      ensureDir(CONFIG.resumesDir);
      await writeJson(resumeFilePath, master_resume_json);
      console.log(`Saved master resume JSON to ${resumeFilePath}`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:162',message:'Master resume JSON saved',data:{resumeFilePath,first_work_exp_id:master_resume_json?.work_experience?.[0]?.id,first_work_exp_company:master_resume_json?.work_experience?.[0]?.company,first_bullet_text:master_resume_json?.work_experience?.[0]?.bullets?.[0]?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }

    const runId = uuidv4();
    const runDir = path.join(CONFIG.runsRoot, runId);
    ensureDir(runDir);

    const status = {
      run_id: runId,
      stage: "ANALYZING",
      status: "running",
      message: "Tailoring resume...",
      files: {}
    };
    await writeStatus(runDir, status);
    await writeJson(path.join(runDir, "job.json"), job_payload);

    kickOffPipeline({
      runId,
      runDir,
      jobPayload: job_payload,
      resumeId: resume_id,
      options
    }).catch((err) => {
      // Errors are written inside kickOffPipeline, but this is a safeguard.
      console.error("Pipeline failed to launch", err);
    });

    res.json({
      run_id: runId,
      status: "running",
      stage: "ANALYZING",
      files: {},
      message: "Pipeline started"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      stage: "bootstrap",
      message: error.message || "Unknown error"
    });
  }
});

app.get("/status/:runId", async (req, res) => {
  const runId = req.params.runId;
  const runDir = path.join(CONFIG.runsRoot, runId);
  const status = await readStatus(runDir);
  if (!status) {
    res.status(404).json({ status: "error", message: "Run not found" });
    return;
  }
  res.json(status);
});

app.get("/download/:runId/:file", (req, res) => {
  const { runId, file } = req.params;
  const runDir = path.join(CONFIG.runsRoot, runId);
  const filePath = path.join(runDir, file);
  if (!filePath.startsWith(runDir)) {
    res.status(400).send("Invalid path");
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.status(404).send("File not found");
    return;
  }
  res.download(filePath);
});

app.post("/runs/:runId/latex", async (req, res) => {
  const runId = req.params.runId;
  const runDir = getSafeRunDir(runId);
  if (!runDir) {
    res.status(400).json({ ok: false, message: "Invalid run ID" });
    return;
  }
  if (!fs.existsSync(runDir)) {
    res.status(404).json({ ok: false, message: "Run not found" });
    return;
  }
  const latex = req.body?.latex;
  if (typeof latex !== "string") {
    res.status(400).json({ ok: false, message: "latex must be a string" });
    return;
  }
  if (latex.length > 2_000_000) {
    res.status(413).json({ ok: false, message: "latex too large" });
    return;
  }
  try {
    await fs.promises.writeFile(path.join(runDir, "resume.tex"), latex, "utf8");
    const status = await readStatus(runDir);
    if (status) {
      await writeStatus(runDir, { ...status, files: buildFileMap(runId, runDir) });
    }
    res.json({ ok: true, run_id: runId, files: buildFileMap(runId, runDir) });
  } catch (error) {
    res.status(500).json({ ok: false, message: error?.message || "Failed to save LaTeX" });
  }
});

app.post("/runs/:runId/compile-pdf", async (req, res) => {
  const runId = req.params.runId;
  const runDir = getSafeRunDir(runId);
  if (!runDir) {
    res.status(400).json({ ok: false, message: "Invalid run ID" });
    return;
  }
  if (!fs.existsSync(runDir)) {
    res.status(404).json({ ok: false, message: "Run not found" });
    return;
  }

  const latex = req.body?.latex;
  if (latex !== undefined && typeof latex !== "string") {
    res.status(400).json({ ok: false, message: "latex must be a string" });
    return;
  }
  if (typeof latex === "string" && latex.length > 2_000_000) {
    res.status(413).json({ ok: false, message: "latex too large" });
    return;
  }

  try {
    if (typeof latex === "string") {
      await fs.promises.writeFile(path.join(runDir, "resume.tex"), latex, "utf8");
    }

    const compileResult = await compileLatex(runDir, CONFIG.latexEngine);
    if (compileResult?.log) {
      await fs.promises.writeFile(path.join(runDir, "latex_compile.log"), compileResult.log, "utf8");
    }

    const status = await readStatus(runDir);
    if (status) {
      await writeStatus(runDir, { ...status, files: buildFileMap(runId, runDir) });
    }

    const pdfBuffer = await fs.promises.readFile(compileResult.pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="resume.pdf"');
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(pdfBuffer);
  } catch (error) {
    const message = error?.message || "Compile failed";
    res.status(400).json({ ok: false, message });
  }
});

app.post("/runs/:runId/chat", async (req, res) => {
  const runId = req.params.runId;
  const runDir = getSafeRunDir(runId);
  if (!runDir) {
    res.status(400).json({ ok: false, message: "Invalid run ID" });
    return;
  }
  if (!fs.existsSync(runDir)) {
    res.status(404).json({ ok: false, message: "Run not found" });
    return;
  }

  const body = req.body || {};
  const messages = body?.messages;
  const focus = body?.focus || null;
  if (!Array.isArray(messages)) {
    res.status(400).json({ ok: false, message: "messages must be an array" });
    return;
  }
  const normalizedMessages = normalizeChatMessages(messages, CONFIG.chatMaxMessages);
  if (!normalizedMessages.length) {
    res.status(400).json({ ok: false, message: "messages must contain at least one user message" });
    return;
  }

  try {
    const context = await buildRunChatContext(runId, runDir, CONFIG.chatMaxContextChars);
    const latestUser = getLatestUserMessage(normalizedMessages);
    const prevAssistant = getPreviousAssistantMessage(normalizedMessages.slice(0, -1));
    const wantsSelectionEdit = Boolean(focus && latestUser && isEditIntent(latestUser, focus));
    const wantsFullLatexEdit = Boolean(latestUser && !wantsSelectionEdit && isLatexFullEditIntent(latestUser));
    const wantsResumeContentEdit = Boolean(
      latestUser &&
        !wantsSelectionEdit &&
        !wantsFullLatexEdit &&
        (isResumeContentEditIntent(latestUser) ||
          (isAffirmativeMessage(latestUser) && assistantLooksLikeProposedResumeEdit(prevAssistant)))
    );

    const effectiveInstruction =
      wantsResumeContentEdit && isAffirmativeMessage(latestUser) && prevAssistant
        ? `Apply the proposed change described in the previous assistant message.\n\nPREVIOUS_ASSISTANT_MESSAGE:\n${prevAssistant}`
        : latestUser;
    const result = wantsSelectionEdit
      ? await runRunEditExec({
          runId,
          runDir,
          context,
          focus,
          instruction: effectiveInstruction
        })
      : wantsFullLatexEdit || wantsResumeContentEdit
      ? await runRunLatexFullEdit({
          runId,
          runDir,
          context,
          instruction: effectiveInstruction
        })
      : await runRunChat({
          runId,
          runDir,
          messages: normalizedMessages,
          context,
          focus
        });

    // Auto-save full-file LaTeX edits when provided.
    // If saving fails, keep the action so the UI can offer “Apply & Save” as a fallback.
    let action = result.action || null;
    let assistantText = result.answer || "";
    if (action?.type === "latex_replace_full" && typeof action.latex === "string") {
      try {
        const latexWithComment = insertChatEditComment(action.latex, effectiveInstruction || latestUser || "updated via chat");
        await fs.promises.writeFile(path.join(runDir, "resume.tex"), latexWithComment, "utf8");
        const status = await readStatus(runDir);
        if (status) {
          await writeStatus(runDir, { ...status, files: buildFileMap(runId, runDir) });
        }
        assistantText =
          (assistantText ? `${assistantText}\n\n` : "") +
          "Saved the updated `resume.tex` for this run. Open “LaTeX Editor” → “Reload generated” to verify, then “Compile PDF”.";
        action = null;
      } catch (e) {
        assistantText =
          (assistantText ? `${assistantText}\n\n` : "") +
          "I generated the updated LaTeX but couldn’t save it automatically. Click “Apply & Save” in chat to persist it.";
        // keep action as-is
      }
    }
    res.json({
      ok: true,
      run_id: runId,
      assistant: { role: "assistant", content: assistantText },
      citations: result.citations || [],
      action,
      debug: result.debug || null
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error?.message || "Chat failed" });
  }
});

app.get("/runs/:runId/evidence_scores", (req, res) => {
  const { runId } = req.params;
  const filePath = path.join(CONFIG.runsRoot, runId, "evidence_scores.json");
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ status: "error", message: "Evidence scores not found" });
    return;
  }
  try {
    const contents = fs.readFileSync(filePath, "utf8");
    res.json(JSON.parse(contents));
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message || "Failed to read evidence scores" });
  }
});

if (process.env.NODE_ENV !== "test") {
  app.listen(CONFIG.port, () => {
    console.log(`[resume-intel] Listening on http://localhost:${CONFIG.port} (mock=${CONFIG.mockMode})`);
  });
}

async function kickOffPipeline({ runId, runDir, jobPayload, resumeId, options }) {
  const logLines = [];
  const appendLog = (line) => {
    const stamp = new Date().toISOString();
    logLines.push(`[${stamp}] ${line}`);
  };

  const tailorPrompt = getPrompt("tailor", CONFIG.tailorPromptVersion);
  const latexPrompt = getPrompt("latex", CONFIG.promptsVersion);
  const promptVersionUsed = tailorPrompt.version || CONFIG.tailorPromptVersion || CONFIG.promptsVersion;
  const schemaVersion = getTailoredSchemaExample(promptVersionUsed).version;
  const meta = {
    run_id: runId,
    created_at: new Date().toISOString(),
    resume_id: resumeId,
    prompt_version: promptVersionUsed,
    prompt_version_tailor: tailorPrompt.version,
    schema_version: schemaVersion,
    prompt_versions: { tailor: tailorPrompt.version, latex: latexPrompt.version },
    prompt_files: { tailor: tailorPrompt.path, latex: latexPrompt.path },
    prompt_hashes: { tailor: hashString(tailorPrompt.content), latex: hashString(latexPrompt.content) },
    tailor_prompt_hash: hashString(tailorPrompt.content),
    mock_mode: CONFIG.mockMode,
    tailored_hash: null,
    rubric_version: null,
    rubric_prompt_version: null,
    rubric_prompt_hash: null,
    rubric_schema_hash: null,
    job_extracted_hash: null,
    rubric_compute_ms: null,
    evidence_rules_version: null,
    evidence_rules_hash: null,
    master_resume_hash: null,
    evidence_scores_cache_hit: null,
    evidence_scores_cache_path: null,
    evidence_scores_compute_ms: null,
    embedding_model: null,
    embedding_dims: null,
    embed_preprocess_version: null,
    resume_bullet_embeddings_cache_hit: null,
    resume_bullet_embeddings_cache_path: null,
    resume_bullet_embeddings_compute_ms: null,
    jd_requirement_embeddings_compute_ms: null,
    relevance_compute_ms: null,
    rubric_hash: null,
    selection_plan_version: null,
    selection_plan_hash: null,
    selection_config_hash: null,
    selection_compute_ms: null,
    selection_must_covered: null,
    selection_must_total: null,
    selection_bullets_experience: null,
    selection_bullets_projects: null,
    selection_enforcement: null,
    tailor_ms: null,
    tailor_enforce_ms: null,
    resume_word_count_estimate: null
  };
  await writeJson(path.join(runDir, "meta.json"), meta);

  const updateStatus = async (payload) => {
    const status = {
      run_id: runId,
      status: payload.status,
      stage: payload.stage,
      message: payload.message,
      files: payload.files || buildFileMap(runId, runDir)
    };
    await writeStatus(runDir, status);
    return status;
  };

  const withStage = async (stage, message, fn) => {
    appendLog(`${stage} - ${message}`);
    await updateStatus({ stage, status: "running", message });
    return withTimeout(fn(), CONFIG.stageTimeoutMs, stage);
  };

  try {
    const masterResume = await loadMasterResume(resumeId, appendLog);
    await writeJson(path.join(runDir, "baseline_resume.json"), masterResume);
    const jobText = jobPayload?.job?.description_text || "";
    const jobTextHash = hashString(jobText);
    await fs.promises.writeFile(path.join(runDir, "job_extracted.txt"), jobText, "utf8");
    await mergeIntoMeta(runDir, { job_extracted_hash: jobTextHash });

    await withStage("SCORING_EVIDENCE", "Scoring master resume evidence", () =>
      scoreEvidenceForRun(masterResume, runId, runDir, appendLog)
    );

    const rubric = await withStage("RUBRIC", "Extracting JD rubric", () =>
      runRubricExtraction({
        jobPayload,
        jobText,
        runDir,
        appendLog
      })
    );

    await withStage("EMBEDDINGS", "Embedding resume bullets and JD requirements", async () => {
      const embeddingResult = await runEmbeddingStage({
        runId,
        runDir,
        masterResume,
        rubric,
        jobExtractedHash: jobTextHash ? `sha256:${jobTextHash}` : null,
        masterResumeHash: computeMasterResumeHash(masterResume),
        openaiClient: openai,
        mockMode: CONFIG.mockMode,
        config: {
          cacheRoot: CONFIG.embedCacheRoot,
          embeddingModel: CONFIG.embeddingModel,
          embeddingDims: CONFIG.embeddingDims,
          preprocessVersion: CONFIG.embedPreprocessVersion
        },
        logger: appendLog
      });
      await mergeIntoMeta(runDir, embeddingResult.meta);
      return embeddingResult;
    });

    await withStage("SELECT", "Selecting bullets under budgets", async () => {
      const selectionResult = await runSelectionStage({
        runId,
        runDir,
        configPath: CONFIG.selectionConfigPath,
        embedConfigOverride: {
          cacheRoot: CONFIG.embedCacheRoot,
          embeddingModel: CONFIG.embeddingModel,
          embeddingDims: CONFIG.embeddingDims,
          preprocessVersion: CONFIG.embedPreprocessVersion
        },
        logger: appendLog
      });
      await mergeIntoMeta(runDir, selectionResult.meta);
      return selectionResult;
    });

    const tailored = await withStage("ANALYZING", "Tailoring resume with GPT", () =>
      tailorResume(jobPayload, masterResume, options, tailorPrompt, appendLog, runDir)
    );
    await writeJson(path.join(runDir, "tailored.json"), tailored);
    await writeJson(path.join(runDir, "tailored_resume.json"), tailored); // compatibility alias
    if (tailored?.final_resume) {
      await writeJson(path.join(runDir, "final_resume.json"), tailored.final_resume);
    }
    await mergeIntoMeta(runDir, {
      tailored_hash: hashString(JSON.stringify(tailored || {})),
      schema_version: schemaVersion,
      prompt_version: promptVersionUsed,
      prompt_version_tailor: tailorPrompt.version
    });

    const latex = await withStage("GENERATING_LATEX", "Generating LaTeX with Claude", () =>
      generateLatex(tailored, options, latexPrompt, appendLog, runDir)
    );
    await fs.promises.writeFile(path.join(runDir, "resume.tex"), latex, "utf8");

    const compileResult = await withStage("COMPILING_PDF", "Compiling PDF with LaTeX", () =>
      compileLatex(runDir, CONFIG.latexEngine)
    );

    if (compileResult.log) {
      appendLog(`LaTeX output:\n${compileResult.log.slice(0, 4000)}`);
    }
    appendLog(`PDF compiled at ${compileResult.pdfPath}`);
    await fs.promises.writeFile(path.join(runDir, "logs.txt"), logLines.join("\n"), "utf8");

    await updateStatus({
      stage: "DONE",
      status: "success",
      message: "Pipeline finished",
      files: buildFileMap(runId, runDir)
    });
  } catch (error) {
    const stage = error.stage || "ERROR";
    appendLog(`Error during ${stage}: ${error.message || error}`);
    await fs.promises.writeFile(path.join(runDir, "logs.txt"), logLines.join("\n"), "utf8");
    await updateStatus({
      stage,
      status: "error",
      message: error.message || "Unknown error",
      files: buildFileMap(runId, runDir)
    });
  }
}

async function loadMasterResume(resumeId, appendLog) {
  const filePath = path.join(CONFIG.resumesDir, `${resumeId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new StageError(`Master resume not found: ${resumeId}. Please ensure the resume JSON file exists at ${filePath} or provide master_resume_json in the /analyze request body.`, "bootstrap");
  }
  const contents = await fs.promises.readFile(filePath, "utf8");
  const parsed = JSON.parse(contents);
  if (appendLog) appendLog(`Loaded master resume ${resumeId} from ${filePath}`);
  return parsed;
}

async function scoreEvidenceForRun(masterResume, runId, runDir, appendLog) {
  try {
    const resumeHash = computeMasterResumeHash(masterResume);
    const rulesInfo = loadEvidenceRules(CONFIG.evidenceRulesPath);
    const cachePaths = getCachePath(resumeHash, rulesInfo.hash, CONFIG.evidenceCacheRoot);
    const cacheLookup = await readCachedEvidenceScores({
      resumeHash,
      rulesHash: rulesInfo.hash,
      cacheRoot: CONFIG.evidenceCacheRoot
    });
    if (cacheLookup?.data) {
      const artifact = { ...cacheLookup.data, run_id: runId };
      await writeJson(path.join(runDir, "evidence_scores.json"), artifact);
      await mergeIntoMeta(runDir, {
        evidence_rules_version: artifact.rules_version || rulesInfo.rules?.version || "v1",
        evidence_rules_hash: rulesInfo.hash,
        master_resume_hash: resumeHash,
        evidence_scores_cache_hit: true,
        evidence_scores_cache_path: cachePaths?.filePath || null,
        evidence_scores_compute_ms: 0
      });
      appendLog?.(
        `Evidence cache HIT for resume_hash=${resumeHash} rules_hash=${rulesInfo.hash} (source=${cacheLookup.cachePath})`
      );
      return artifact;
    }

    const reason = cacheLookup?.reason ? ` (${cacheLookup.reason})` : "";
    appendLog?.(
      `Evidence cache MISS${reason} for resume_hash=${resumeHash} rules_hash=${rulesInfo.hash}`
    );

    const started = Date.now();
    const scored = scoreMasterResume(masterResume, rulesInfo.rules);
    const computeMs = Date.now() - started;
    const artifact = {
      run_id: runId,
      generated_at: new Date().toISOString(),
      rules_version: rulesInfo.rules?.version || "v1",
      rules_hash: rulesInfo.hash,
      rules_path: rulesInfo.path,
      resume_hash: resumeHash,
      tool_lexicon_size: scored.tool_lexicon_size,
      summary: scored.summary,
      bullets: scored.bullets
    };
    await writeJson(path.join(runDir, "evidence_scores.json"), artifact);
    await writeCachedEvidenceScores({
      resumeHash,
      rulesHash: rulesInfo.hash,
      cacheRoot: CONFIG.evidenceCacheRoot,
      data: artifact
    });
    await mergeIntoMeta(runDir, {
      evidence_rules_version: artifact.rules_version,
      evidence_rules_hash: artifact.rules_hash,
      master_resume_hash: resumeHash,
      evidence_scores_cache_hit: false,
      evidence_scores_cache_path: cachePaths?.filePath || null,
      evidence_scores_compute_ms: computeMs
    });
    appendLog?.(
      `Evidence scoring completed (MISS) using rules ${artifact.rules_version} in ${computeMs}ms`
    );
    return artifact;
  } catch (error) {
    throw new StageError(error.message || "Evidence scoring failed", "evidence_scoring");
  }
}

async function tailorResume(jobPayload, masterResume, options, prompt, appendLog, runDir) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:tailorResume:entry',message:'tailorResume called',data:{masterResume_work_exp_count:masterResume?.work_experience?.length,masterResume_first_exp_id:masterResume?.work_experience?.[0]?.id,masterResume_first_bullet:masterResume?.work_experience?.[0]?.bullets?.[0]?.substring(0,80),prompt_version:prompt?.version},timestamp:Date.now(),sessionId:'debug-session',runId:'tailor-debug',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  if (CONFIG.mockMode) {
    return buildMockTailored(jobPayload, masterResume);
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new StageError("OPENAI_API_KEY is not set", "gpt_tailoring");
  }
  const selectionPlanPath = path.join(runDir, "selection_plan.json");
  const baselinePath = path.join(runDir, "baseline_resume.json");
  const rubricPath = path.join(runDir, "jd_rubric.json");
  let selectionPlan = null;
  let baselineResume = masterResume;
  let jdRubric = null;
  try {
    selectionPlan = JSON.parse(await fs.promises.readFile(selectionPlanPath, "utf8"));
    // #region agent log
    const selectedExpBullets = selectionPlan?.selected?.work_experience?.flatMap(r => r.bullets?.map(b => b.bullet_id) || []) || [];
    const selectedProjBullets = selectionPlan?.selected?.projects?.flatMap(p => p.bullets?.map(b => b.bullet_id) || []) || [];
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:tailorResume:selectionPlan',message:'Selection plan loaded',data:{version:selectionPlan?.version,selected_exp_bullets:selectedExpBullets,selected_proj_bullets:selectedProjBullets,rewrite_intents:selectionPlan?.selected?.work_experience?.[0]?.bullets?.slice(0,3).map(b=>({id:b.bullet_id,intent:b.rewrite_intent}))},timestamp:Date.now(),sessionId:'debug-session',runId:'tailor-debug',hypothesisId:'B,C,E'})}).catch(()=>{});
    // #endregion
  } catch (error) {
    throw new StageError("selection_plan.json missing for tailoring stage", "selection_enforcement");
  }
  try {
    baselineResume = JSON.parse(await fs.promises.readFile(baselinePath, "utf8"));
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:tailorResume:baseline',message:'Baseline resume loaded',data:{baseline_first_exp_id:baselineResume?.work_experience?.[0]?.id,baseline_first_bullet:baselineResume?.work_experience?.[0]?.bullets?.[0]?.substring(0,80)},timestamp:Date.now(),sessionId:'debug-session',runId:'tailor-debug',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  } catch (error) {
    baselineResume = masterResume;
  }
  try {
    jdRubric = JSON.parse(await fs.promises.readFile(rubricPath, "utf8"));
  } catch (error) {
    throw new StageError("jd_rubric.json missing for tailoring stage", "gpt_tailoring");
  }

  const builder = buildTailorPrompt(jobPayload, masterResume, options, prompt, runDir, {
    selectionPlan,
    baselineResume,
    jdRubric
  });
  const messages = [
    { role: "system", content: builder.system },
    { role: "user", content: builder.user }
  ];
  const modelStarted = Date.now();
  const response = await openai.chat.completions.create({
    model: CONFIG.tailorModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages
  });
  const tailorMs = Date.now() - modelStarted;
  let text = response.choices[0].message.content || "";
  const promptVersionUsed = builder.schemaVersion || prompt.version || CONFIG.promptsVersion;
  let parsed = parseJsonSafe(text);
  parsed = normalizeTailoredOutput(parsed, jobPayload, masterResume, promptVersionUsed);
  // #region agent log
  const llmExpBullets = parsed?.changes?.experience?.flatMap(r => r.updated_bullets?.map(b => ({id:b.bullet_id,before:b.before_text?.substring(0,50),after:b.after_text?.substring(0,50)})) || []) || [];
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:tailorResume:llmResponse',message:'LLM tailor response received',data:{promptVersionUsed,has_changes:!!parsed?.changes,llm_exp_bullets_sample:llmExpBullets.slice(0,5),llm_final_resume_first_bullet:parsed?.final_resume?.work_experience?.[0]?.bullets?.[0]?.substring(0,80)},timestamp:Date.now(),sessionId:'debug-session',runId:'tailor-debug',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  let validation = validateTailored(parsed, promptVersionUsed);
  if (!validation.valid) {
    appendLog?.(`Tailor JSON invalid (${validation.errors.join("; ")}). Attempting repair.`);
    const repaired = await repairTailoredJson(text, builder, validation.errors);
    parsed = parseJsonSafe(repaired);
    validation = validateTailored(parsed, promptVersionUsed);
  }
  if (!validation.valid) {
    throw new StageError(`Tailoring JSON invalid: ${validation.errors.join("; ")}`, "gpt_tailoring");
  }
  const enforceStarted = Date.now();
  const enforcement = enforceSelectionPlanCompliance(parsed, selectionPlan, masterResume, baselineResume, {
    jdRubric,
    selectionPlanHash: `sha256:${hashString(JSON.stringify(selectionPlan || {}))}`
  });
  parsed = enforcement.output;
  // #region agent log
  const enforcedExpBullets = parsed?.changes?.experience?.flatMap(r => r.updated_bullets?.map(b => ({id:b.bullet_id,before:b.before_text?.substring(0,50),after:b.after_text?.substring(0,50)})) || []) || [];
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:tailorResume:afterEnforcement',message:'After enforcement step',data:{enforced_exp_bullets_sample:enforcedExpBullets.slice(0,5),enforced_final_resume_first_bullet:parsed?.final_resume?.work_experience?.[0]?.bullets?.[0]?.substring(0,80),enforcement_meta:enforcement?.meta},timestamp:Date.now(),sessionId:'debug-session',runId:'tailor-debug',hypothesisId:'C,E'})}).catch(()=>{});
  // #endregion
  const postEnforceValidation = validateTailored(parsed, promptVersionUsed);
  if (!postEnforceValidation.valid) {
    throw new StageError(
      `Tailoring JSON invalid after enforcement: ${postEnforceValidation.errors.join("; ")}`,
      "selection_enforcement"
    );
  }
  const enforceMs = Date.now() - enforceStarted;
  appendLog?.("Tailoring JSON validated against schema.");
  if (builder.promptText && builder.runDir) {
    await fs.promises.writeFile(path.join(builder.runDir, "prompt_used_tailor.txt"), builder.promptText, "utf8");
  }
  if (enforcement.meta) {
    await mergeIntoMeta(runDir, {
      selection_plan_hash: enforcement.selection_plan_hash,
      selection_enforcement: enforcement.meta,
      tailor_ms: tailorMs,
      tailor_enforce_ms: enforceMs,
      resume_word_count_estimate: enforcement.word_count_estimate
    });
  }
  return parsed;
}

async function runRubricExtraction({
  jobPayload,
  jobText,
  runDir,
  appendLog,
  forceMock = false,
  mockModelResponse,
  mockRepairResponse,
  forceRealModel = false
}) {
  const shouldUseMock = forceMock || CONFIG.mockMode || (IS_TEST && !forceRealModel);
  if (shouldUseMock) {
    const prompt = getPrompt("rubric", CONFIG.rubricPromptVersion, CONFIG.rubricPromptVersion);
    const userPayload = buildRubricPayload(jobPayload, jobText, prompt.version);
    const promptText = `SYSTEM:\n${prompt.content.trim()}\n\nUSER:\n${JSON.stringify(userPayload, null, 2)}`;
    const normalized = normalizeRubricOutput(buildMockRubric(jobPayload, jobText), jobPayload);
    await writeJson(path.join(runDir, "jd_rubric.json"), normalized);
    await fs.promises.writeFile(path.join(runDir, "prompt_used_rubric.txt"), promptText, "utf8");
    await mergeIntoMeta(runDir, {
      rubric_version: normalized.version,
      rubric_prompt_version: prompt.version,
      rubric_prompt_hash: hashString(prompt.content),
      rubric_schema_hash: hashString(JSON.stringify(JD_RUBRIC_SCHEMA_V1)),
      rubric_compute_ms: 0
    });
    appendLog?.("Rubric mock artifact generated.");
    return normalized;
  }

  if (!process.env.OPENAI_API_KEY && !mockModelResponse) {
    throw new StageError("OPENAI_API_KEY is not set", "rubric");
  }
  if (!jobText || !jobText.trim().length) {
    throw new StageError("Job description is empty; cannot build rubric", "rubric");
  }

  const prompt = getPrompt("rubric", CONFIG.rubricPromptVersion, CONFIG.rubricPromptVersion);
  const userPayload = buildRubricPayload(jobPayload, jobText, prompt.version);
  const promptText = `SYSTEM:\n${prompt.content.trim()}\n\nUSER:\n${JSON.stringify(userPayload, null, 2)}`;
  const started = Date.now();
  const messages = [
    { role: "system", content: prompt.content },
    { role: "user", content: JSON.stringify(userPayload, null, 2) }
  ];
  let text = mockModelResponse || (await callRubricModel(messages));
  let parsed = parseJsonSafe(text);
  let validation = validateRubric(parsed);
  if (!validation.valid) {
    appendLog?.(`Rubric JSON invalid (${validation.errors.join("; ")}). Attempting repair.`);
    const repaired = mockRepairResponse || (await repairRubricJson(text, prompt, validation.errors, userPayload));
    parsed = parseJsonSafe(repaired);
    validation = validateRubric(parsed);
  }
  if (!validation.valid) {
    throw new StageError(`Rubric JSON invalid: ${validation.errors.join("; ")}`, "rubric_validation");
  }
  const normalized = normalizeRubricOutput(parsed, jobPayload);
  const computeMs = Date.now() - started;
  await writeJson(path.join(runDir, "jd_rubric.json"), normalized);
  await fs.promises.writeFile(path.join(runDir, "prompt_used_rubric.txt"), promptText, "utf8");
  await mergeIntoMeta(runDir, {
    rubric_version: normalized.version,
    rubric_prompt_version: prompt.version,
    rubric_prompt_hash: hashString(prompt.content),
    rubric_schema_hash: hashString(JSON.stringify(JD_RUBRIC_SCHEMA_V1)),
    rubric_compute_ms: computeMs
  });
  appendLog?.(`Rubric extraction complete with ${normalized.requirements.length} requirements and ${normalized.keywords.length} keywords.`);
  return normalized;
}

async function callRubricModel(messages) {
  const response = await openai.chat.completions.create({
    model: CONFIG.rubricModel,
    temperature: CONFIG.rubricTemperature,
    response_format: { type: "json_object" },
    messages
  });
  return response.choices[0].message.content || "";
}

function normalizeJobLocation(value) {
  const text = (value || "").toString().trim();
  if (!text) return "";
  const lowered = text.toLowerCase();
  if (["n/a", "na", "unknown", "not specified", "tbd", "tba"].includes(lowered)) return "";
  return text;
}

function extractJobLocation(tailoredResume) {
  const candidates = [
    tailoredResume?.job?.location,
    tailoredResume?.job?.location_hint,
    tailoredResume?.job?.job_location,
    tailoredResume?.job?.jobLocation,
    tailoredResume?.jd_rubric?.job_meta?.location
  ];
  for (const candidate of candidates) {
    const normalized = normalizeJobLocation(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function updateHeaderLocationBlock(headerBlock, jobLocation) {
  const normalized = normalizeJobLocation(jobLocation);
  if (!normalized) return headerBlock;
  const lines = (headerBlock || "").split("\n");
  let updated = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !line.includes("---")) continue;
    const parts = line.split("---");
    if (parts.length < 2) continue;
    const prefix = parts[0];
    const indentMatch = prefix.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const trailingSpace = /\s$/.test(prefix) ? " " : "";
    parts[0] = `${indent}${normalized}${trailingSpace}`;
    lines[i] = parts.join("---");
    updated = true;
    break;
  }
  return updated ? lines.join("\n") : headerBlock;
}

function buildTemplateWithJobLocation(template, markers, baseLocks, tailoredResume) {
  const jobLocation = extractJobLocation(tailoredResume);
  if (!jobLocation) return { template, locks: baseLocks };
  const locks = extractLockedBlocks(template, markers);
  const updatedHeader = updateHeaderLocationBlock(locks.header.blockText, jobLocation);
  if (updatedHeader === locks.header.blockText) return { template, locks: baseLocks };
  const updatedTemplate = template.replace(locks.header.blockText, updatedHeader);
  const updatedLocks = extractLockedBlocks(updatedTemplate, markers);
  return { template: updatedTemplate, locks: updatedLocks };
}

async function generateLatex(tailoredResume, options, prompt, appendLog, runDir) {
  const { template, locks } = buildTemplateWithJobLocation(
    LATEX_TEMPLATE,
    LOCK_MARKERS,
    TEMPLATE_LOCKS,
    tailoredResume
  );
  if (CONFIG.mockMode) {
    return renderMockLatex(tailoredResume, template, locks);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new StageError("ANTHROPIC_API_KEY is not set", "latex");
  }
  const builder = buildLatexPrompt(tailoredResume, options, prompt, template, locks, runDir);
  const response = await anthropic.messages.create({
    model: CONFIG.latexModel,
    max_tokens: 4000,
    temperature: 0.2,
    system: builder.system,
    messages: [{ role: "user", content: builder.user }]
  });
  let content =
    response.content && response.content[0] && response.content[0].text
      ? response.content[0].text
      : "";
  content = stripMarkdownFences(content);
  if (!content.trim().length) {
    throw new StageError("Empty LaTeX response", "latex");
  }
  if (!content.includes("\\begin{document}")) {
    throw new StageError("Invalid LaTeX: missing \\begin{document}", "latex");
  }
  content = enforceImmutableBlocks(content, locks, appendLog);
  // Post-process: convert any remaining markdown bold markers to LaTeX \textbf{}
  content = convertMarkdownBoldToLatex(content);
  ensureLatexSafe(content);
  if (builder.promptText && builder.runDir) {
    await fs.promises.writeFile(path.join(builder.runDir, "prompt_used_latex.txt"), builder.promptText, "utf8");
  }
  return content;
}

async function compileLatex(runDir, engine) {
  const latexFile = path.join(runDir, "resume.tex");
  if (!fs.existsSync(latexFile)) {
    throw new StageError("resume.tex missing", "compile");
  }
  const args = ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", runDir, latexFile];
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(engine, args, { cwd: runDir, timeout: CONFIG.stageTimeoutMs });
    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (error) {
    const detail = (error.stderr || error.stdout || error.message || "").toString().slice(0, 4000);
    throw new StageError(`LaTeX compile failed: ${detail}`, "compile");
  }
  const pdfPath = path.join(runDir, "resume.pdf");
  if (!fs.existsSync(pdfPath)) {
    throw new StageError("PDF not produced", "compile");
  }
  return { pdfPath, log: [stdout, stderr].join("\n").trim() };
}

function buildFileMap(runId, runDir) {
  const files = {};
  const pdfPath = path.join(runDir, "resume.pdf");
  const jsonPath = path.join(runDir, "tailored.json");
  const legacyJsonPath = path.join(runDir, "tailored_resume.json");
  const texPath = path.join(runDir, "resume.tex");
  if (fs.existsSync(pdfPath)) files.pdf = `/download/${runId}/resume.pdf`;
  if (fs.existsSync(jsonPath)) {
    files.json = `/download/${runId}/tailored.json`;
  } else if (fs.existsSync(legacyJsonPath)) {
    files.json = `/download/${runId}/tailored_resume.json`;
  }
  const rubricPath = path.join(runDir, "jd_rubric.json");
  if (fs.existsSync(rubricPath)) files.jd_rubric = `/download/${runId}/jd_rubric.json`;
  const rubricPromptPath = path.join(runDir, "prompt_used_rubric.txt");
  if (fs.existsSync(rubricPromptPath)) files.prompt_used_rubric = `/download/${runId}/prompt_used_rubric.txt`;
  const baselinePath = path.join(runDir, "baseline_resume.json");
  if (fs.existsSync(baselinePath)) files.baseline = `/download/${runId}/baseline_resume.json`;
  const finalPath = path.join(runDir, "final_resume.json");
  if (fs.existsSync(finalPath)) files.final_resume = `/download/${runId}/final_resume.json`;
  const jobTextPath = path.join(runDir, "job_extracted.txt");
  if (fs.existsSync(jobTextPath)) files.job_text = `/download/${runId}/job_extracted.txt`;
  const evidencePath = path.join(runDir, "evidence_scores.json");
  if (fs.existsSync(evidencePath)) files.evidence_scores = `/download/${runId}/evidence_scores.json`;
  const jdReqEmbedPath = path.join(runDir, "jd_requirement_embeddings.json");
  if (fs.existsSync(jdReqEmbedPath)) files.jd_requirement_embeddings = `/download/${runId}/jd_requirement_embeddings.json`;
  const relevanceMatrixPath = path.join(runDir, "relevance_matrix.json");
  if (fs.existsSync(relevanceMatrixPath)) files.relevance_matrix = `/download/${runId}/relevance_matrix.json`;
  const relevanceSummaryPath = path.join(runDir, "relevance_summary.json");
  if (fs.existsSync(relevanceSummaryPath)) files.relevance_summary = `/download/${runId}/relevance_summary.json`;
  const selectionPlanPath = path.join(runDir, "selection_plan.json");
  if (fs.existsSync(selectionPlanPath)) files.selection_plan = `/download/${runId}/selection_plan.json`;
  const selectionDebugPath = path.join(runDir, "selection_debug.json");
  if (fs.existsSync(selectionDebugPath)) files.selection_debug = `/download/${runId}/selection_debug.json`;
  if (fs.existsSync(texPath)) files.tex = `/download/${runId}/resume.tex`;
  const metaPath = path.join(runDir, "meta.json");
  if (fs.existsSync(metaPath)) files.meta = `/download/${runId}/meta.json`;
  return files;
}

const TAILORED_SCHEMA_EXAMPLE_V2 = {
  version: "latest_v2",
  job: {
    title: "",
    company: "",
    location: "",
    source_platform: "",
    confidence: 0,
    raw_text_hash: "",
    extracted_preview: ""
  },
  analysis: {
    top_keywords: [],
    must_have_requirements: [],
    nice_to_have_requirements: [],
    role_focus: "",
    gap_notes: []
  },
  resume_plan: {
    summary: "",
    core_skills: [],
    experience_updates: [],
    projects_updates: []
  },
  final_resume: {
    summary: "",
    skills: {
      programming_languages: [],
      data_analysis_statistics: [],
      machine_learning: [],
      data_viz_engineering: [],
      big_data_software: []
    },
    work_experience: [
      {
        id: "",
        company: "",
        role: "",
        dates: "",
        location: "",
        bullets: []
      }
    ],
    projects: [
      {
        id: "",
        name: "",
        date: "",
        keywords: [],
        links: { github: "", webapp: "" },
        bullets: []
      }
    ],
    awards: [
      {
        name: "",
        issuer: "",
        year: "",
        details: ""
      }
    ]
  },
  quality: {
    ats_notes: [],
    risk_flags: []
  },
  explainability: {
    baseline_resume: {
      resume_id: "",
      stored_at: "baseline_resume.json"
    },
    job_preview: {
      extracted_preview: "",
      raw_text_hash: "",
      warnings: []
    },
    changes: {
      experience: [
        {
          role_id: "",
          before_bullets: [],
          after_bullets: [],
          bullet_ids: []
        }
      ],
      projects: [
        {
          project_id: "",
          before_bullets: [],
          after_bullets: [],
          bullet_ids: []
        }
      ]
    },
    requirements: {
      must_have: [{ req_id: "", text: "" }],
      nice_to_have: [{ req_id: "", text: "" }]
    },
    mappings: {
      bullet_to_requirements: [{ bullet_id: "", req_ids: [""], match_type: "direct" }],
      keyword_inserts: [{ bullet_id: "", keywords: [""] }]
    }
  }
};

const TAILORED_SCHEMA_EXAMPLE_V3 = {
  version: "latest_v3",
  job: {
    title: "",
    company: "",
    location: "",
    location_hint: "",
    job_url: "",
    source_platform: "",
    confidence: 0,
    raw_job_text_hash: "",
    extracted_preview: ""
  },
  jd_rubric: {
    top_keywords: [],
    requirements: [
      {
        req_id: "",
        type: "must",
        weight: 1,
        text: "",
        jd_snippet: ""
      }
    ]
  },
  evidence_index: [
    {
      bullet_id: "",
      parent_type: "experience",
      parent_id: "",
      original_text: "",
      detected_skills_tools: [],
      has_metric: false
    }
  ],
  mapping: {
    requirement_to_evidence: [
      {
        req_id: "",
        missing_in_resume: false,
        evidence: [{ bullet_id: "", match_type: "direct" }]
      }
    ],
    bullet_to_requirements: [{ bullet_id: "", req_ids: [""], match_type: "direct" }]
  },
  changes: {
    experience: [
      {
        role_id: "",
        updated_bullets: [{ bullet_id: "", before_text: "", after_text: "" }]
      }
    ],
    projects: [
      {
        project_id: "",
        updated_bullets: [{ bullet_id: "", before_text: "", after_text: "" }]
      }
    ],
    keyword_insertions: [{ bullet_id: "", keywords: [""] }]
  },
  final_resume: {
    summary: "",
    skills: {
      programming_languages: [],
      data_analysis_statistics: [],
      machine_learning: [],
      data_viz_engineering: [],
      big_data_software: []
    },
    work_experience: [
      {
        id: "",
        company: "",
        role: "",
        dates: "",
        location: "",
        bullets: []
      }
    ],
    projects: [
      {
        id: "",
        name: "",
        date: "",
        keywords: [],
        links: { github: "", webapp: "" },
        bullets: []
      }
    ],
    awards: [
      {
        name: "",
        issuer: "",
        year: "",
        details: ""
      }
    ]
  },
  diagnostics: {
    match_score_before: 0,
    match_score_after: 0,
    weak_bullets: [],
    missing_skills_list: []
  },
  guardrail_report: {
    unsupported_claims: [],
    new_entities: [],
    hallucinations: [],
    safety_warnings: []
  }
};

const TAILORED_SCHEMA_EXAMPLE_V4 = {
  ...TAILORED_SCHEMA_EXAMPLE_V3,
  version: "latest_v4_selection",
  explainability: {
    selection_plan_ref: {
      file: "selection_plan.json",
      hash: "sha256:..."
    },
    included_bullets: [
      {
        bullet_id: "role_1_b1",
        parent_type: "experience",
        parent_id: "role_1",
        original_text: "",
        rewritten_text: ""
      }
    ],
    dropped_bullets: [{ bullet_id: "role_2_b3", reason: "budget_drop" }],
    rewrite_summary: [{ bullet_id: "role_1_b1", rewrite_type: "light", keywords_inserted: ["Python"] }]
  }
};

function isV3Version(version) {
  return (version || "").toLowerCase().includes("v3");
}

function isV4Version(version) {
  return (version || "").toLowerCase().includes("v4");
}

function getTailoredSchemaExample(version) {
  if (isV4Version(version)) {
    return {
      ...TAILORED_SCHEMA_EXAMPLE_V4,
      version: version || TAILORED_SCHEMA_EXAMPLE_V4.version
    };
  }
  if (isV3Version(version)) {
    return {
      ...TAILORED_SCHEMA_EXAMPLE_V3,
      version: version || TAILORED_SCHEMA_EXAMPLE_V3.version
    };
  }
  return {
    ...TAILORED_SCHEMA_EXAMPLE_V2,
    version: version || TAILORED_SCHEMA_EXAMPLE_V2.version
  };
}

function buildTailorPrompt(jobPayload, masterResume, options, prompt, runDir, extras = {}) {
  const schemaExample = getTailoredSchemaExample(prompt.version || CONFIG.promptsVersion);
  const isV4 = isV4Version(schemaExample.version);
  const isV3 = isV3Version(schemaExample.version);
  const rawJobText = jobPayload?.job?.description_text || "";
  const rawTextHashHex = hashString(rawJobText);
  const rawTextHash = rawTextHashHex.startsWith("sha256:") ? rawTextHashHex : `sha256:${rawTextHashHex}`;
  const extractedPreview = rawJobText.slice(0, 500);
  const schemaText = JSON.stringify(schemaExample, null, 2);
  const jobBlock = jobPayload?.job || {};
  const meta = jobPayload?.meta || {};
  const jobForPrompt = isV3 || isV4
    ? {
        ...jobBlock,
        job_url: jobBlock.job_url || meta.url || "",
        source_platform: jobBlock.source_platform || meta.platform || "",
        confidence: jobBlock.confidence ?? meta.confidence ?? 0,
        raw_job_text_hash: rawTextHash,
        extracted_preview: extractedPreview,
        location_hint: jobBlock.location_hint || jobBlock.location || "",
        role_hint: jobBlock.role || jobBlock.title || ""
      }
    : jobPayload?.job
      ? { job: jobPayload.job }
      : {};

  if (isV4) {
    const userPayload = {
      prompt_version: prompt.version,
      strict_schema: schemaExample,
      job_payload: { job: jobForPrompt, meta },
      jd_rubric: extras.jdRubric || {},
      selection_plan: extras.selectionPlan || {},
      baseline_resume: extras.baselineResume || masterResume,
      master_resume: masterResume,
      raw_job_text_hash: rawTextHash
    };
    const system = `${prompt.content.trim()}\n- Set output.version to "${schemaExample.version}".\n- Output JSON only; must validate the schema with no extra keys.\n- Follow selection_plan strictly: include only selected bullet_ids and roles.\n- Do not request more input; single-turn completion.`;
    const user = JSON.stringify(userPayload, null, 2);
    const promptText = `SYSTEM:\n${system}\n\nUSER:\n${user}`;
    return {
      system,
      user,
      promptText,
      runDir,
      schemaVersion: schemaExample.version
    };
  }

  const system = `${prompt.content.trim()}\n- Set output.version to "${schemaExample.version}".\n- Output JSON only; must validate the schema with no extra keys.\n- Single-turn only; do not request more input.\n- Guardrail: respond with empty guardrail_report arrays; self-repair if you detect violations.\n- Populate final_resume as a fully written resume ready for rendering (summary, skills, work experience, projects, awards). Use master resume facts only; never invent companies, titles, dates, tools, or metrics.`;
  const userLines = [
    `Prompt version: ${prompt.version}`,
    "Strict schema (no extra keys):",
    schemaText,
    isV3 ? "Job payload (structured with preview/hash):" : "Job payload (only job key passed through):",
    JSON.stringify(jobForPrompt, null, 2),
    "Master resume JSON:",
    JSON.stringify(masterResume, null, 2),
    `Raw job text hash (sha256): ${rawTextHash}`
  ];
  const promptText = `SYSTEM:\n${system}\n\nUSER:\n${userLines.join("\n")}`;
  return {
    system,
    user: userLines.join("\n\n"),
    promptText,
    runDir,
    schemaVersion: schemaExample.version
  };
}

function buildLatexPrompt(tailoredResume, options, prompt, template, locks, runDir) {
  const pageLimit = options?.page_limit || 1;
  const finalResume = tailoredResume.final_resume || tailoredResume;
  const system = `${prompt.content.trim()}\n- Maintain lock markers exactly.\n- Do not alter content between lock markers; keep them byte-for-byte identical.\n- page_limit=${pageLimit}.`;
  const userParts = [
    `Prompt version: ${prompt.version}`,
    `Page limit: ${pageLimit}`,
    "Final resume JSON (only payload sent):",
    JSON.stringify(finalResume, null, 2),
    "Base LaTeX template (immutable header/education):",
    template
  ];
  const promptText = `SYSTEM:\n${system}\n\nUSER:\n${userParts.join("\n")}`;
  return {
    system,
    user: userParts.join("\n\n"),
    promptText,
    runDir
  };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function truncateText(text, maxChars) {
  const value = (text || "").toString();
  if (!maxChars || maxChars <= 0) return value;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 80))}\n\n[TRUNCATED: ${value.length} chars total]`;
}

async function readTextIfExists(filePath, maxChars) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = await fs.promises.readFile(filePath, "utf8");
    return truncateText(text, maxChars);
  } catch (error) {
    return null;
  }
}

async function readJsonIfExists(filePath, maxChars) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = await fs.promises.readFile(filePath, "utf8");
    const parsed = parseJsonSafe(text);
    if (parsed === null) return null;
    const serialized = JSON.stringify(parsed, null, 2);
    return truncateText(serialized, maxChars);
  } catch (error) {
    return null;
  }
}

function normalizeChatMessages(rawMessages, maxMessages) {
  const cleaned = [];
  for (const msg of rawMessages || []) {
    if (!msg || typeof msg !== "object") continue;
    const role = (msg.role || "").toString();
    const content = (msg.content || "").toString();
    if (role !== "user" && role !== "assistant") continue;
    if (!content.trim()) continue;
    cleaned.push({ role, content });
  }
  const sliced = cleaned.slice(-Math.max(1, Number(maxMessages) || 20));
  // Require at least one user message to anchor the turn.
  if (!sliced.some((m) => m.role === "user")) return [];
  return sliced;
}

function getLatestUserMessage(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && typeof messages[i]?.content === "string") {
      return messages[i].content;
    }
  }
  return null;
}

function isEditIntent(userText, focus) {
  const text = (userText || "").toString().toLowerCase();
  // Only treat as edit intent when we have a concrete selection focus.
  if (!focus || typeof focus !== "object") return false;
  if (focus.type !== "latex_selection") return false;
  return (
    /\b(rewrite|rephrase|edit|fix|improve|shorten|expand|tighten|remove|delete|drop|replace)\b/.test(text) ||
    /\b(save|apply|update)\b/.test(text)
  );
}

function isLatexFullEditIntent(userText) {
  const text = (userText || "").toString().toLowerCase();
  // If the user is asking to modify LaTeX but didn't provide a selection focus, treat it as a full-doc edit.
  const mentionsLatex =
    /\b(latex|la-tex|resume\.tex|\.tex)\b/.test(text) ||
    text.includes("\\begin{document}") ||
    text.includes("\\resume") ||
    text.includes("tex file");
  const isEditVerb = /\b(rewrite|rephrase|edit|fix|improve|shorten|expand|tighten|remove|delete|drop|replace|update)\b/.test(
    text
  );
  const wantsPersistence = /\b(save|apply|persist|overwrite)\b/.test(text);
  return mentionsLatex && (isEditVerb || wantsPersistence);
}

function isResumeContentEditIntent(userText) {
  const text = (userText || "").toString().toLowerCase();
  const mentionsSection = /\b(summary|skills|work experience|experience|education|projects|certifications|publications)\b/.test(
    text
  );
  const isEditVerb = /\b(change|update|add|insert|remove|delete|drop|rewrite|rephrase|edit|fix|improve)\b/.test(text);
  const wantsPersistence = /\b(save|apply|commit|persist|do this change|make this change)\b/.test(text);
  return (mentionsSection && isEditVerb) || wantsPersistence;
}

function isAffirmativeMessage(userText) {
  const text = (userText || "").toString().trim().toLowerCase();
  return (
    /^(ok(ay)?|yes|yep|yeah|sure|do it|go ahead|sounds good|please do|let'?s do it|proceed)\b/.test(text) ||
    /\b(do this change|make this change|apply it)\b/.test(text)
  );
}

function getPreviousAssistantMessage(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.role === "assistant" && typeof list[i]?.content === "string" && list[i].content.trim()) {
      return list[i].content;
    }
  }
  return null;
}

function assistantLooksLikeProposedResumeEdit(text) {
  const t = (text || "").toString().toLowerCase();
  return (
    t.includes("revised summary") ||
    t.includes("here is the revised summary") ||
    t.includes("the summary has been updated") ||
    t.includes("update the latex") ||
    t.includes("update the la\\,tex") ||
    t.includes("modify the latex")
  );
}

function truncateOneLine(text, maxLen = 140) {
  const value = (text || "").toString().replace(/\s+/g, " ").trim();
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 1))}…`;
}

function insertChatEditComment(latexText, note) {
  const latex = (latexText || "").toString();
  const stamp = new Date().toISOString();
  const comment = `% [CHAT_EDIT ${stamp}] ${truncateOneLine(note || "updated via chat", 160)}\n`;

  // Try to place the comment near SUMMARY edits (common case).
  const sectionIdx = latex.indexOf("\\section{SUMMARY}");
  if (sectionIdx >= 0) {
    const afterSectionLine = latex.indexOf("\n", sectionIdx);
    if (afterSectionLine >= 0) {
      return `${latex.slice(0, afterSectionLine + 1)}${comment}${latex.slice(afterSectionLine + 1)}`;
    }
  }

  // Fallback: add comment near top of document (after \begin{document}).
  const beginIdx = latex.indexOf("\\begin{document}");
  if (beginIdx >= 0) {
    const afterBeginLine = latex.indexOf("\n", beginIdx);
    if (afterBeginLine >= 0) {
      return `${latex.slice(0, afterBeginLine + 1)}${comment}${latex.slice(afterBeginLine + 1)}`;
    }
  }

  // Last resort: prepend.
  return `${comment}${latex}`;
}

async function buildRunChatContext(runId, runDir, maxTotalChars) {
  // Keep this stable: later we can swap in retrieval/citations without changing the API.
  const perDoc = {
    baseline_resume: 22000,
    job_description: 22000,
    jd_rubric: 18000,
    selection_plan: 14000,
    selection_debug: 14000,
    evidence_scores: 14000,
    tailored: 18000,
    final_resume: 18000,
    resume_latex: 26000,
    meta: 10000
  };
  const docs = [];
  const pushDoc = (doc) => {
    if (!doc?.content) return;
    docs.push(doc);
  };

  pushDoc({
    id: "baseline_resume",
    title: "Master resume (baseline_resume.json)",
    content: await readJsonIfExists(path.join(runDir, "baseline_resume.json"), perDoc.baseline_resume)
  });
  pushDoc({
    id: "job_description",
    title: "Job description (job_extracted.txt)",
    content: await readTextIfExists(path.join(runDir, "job_extracted.txt"), perDoc.job_description)
  });
  pushDoc({
    id: "jd_rubric",
    title: "JD rubric (jd_rubric.json)",
    content: await readJsonIfExists(path.join(runDir, "jd_rubric.json"), perDoc.jd_rubric)
  });
  pushDoc({
    id: "selection_plan",
    title: "Selection plan (selection_plan.json)",
    content: await readJsonIfExists(path.join(runDir, "selection_plan.json"), perDoc.selection_plan)
  });
  pushDoc({
    id: "selection_debug",
    title: "Selection debug (selection_debug.json)",
    content: await readJsonIfExists(path.join(runDir, "selection_debug.json"), perDoc.selection_debug)
  });
  pushDoc({
    id: "evidence_scores",
    title: "Evidence scores (evidence_scores.json)",
    content: await readJsonIfExists(path.join(runDir, "evidence_scores.json"), perDoc.evidence_scores)
  });
  pushDoc({
    id: "tailored",
    title: "Tailored output (tailored.json)",
    content: await readJsonIfExists(path.join(runDir, "tailored.json"), perDoc.tailored)
  });
  pushDoc({
    id: "final_resume",
    title: "Final resume JSON (final_resume.json)",
    content: await readJsonIfExists(path.join(runDir, "final_resume.json"), perDoc.final_resume)
  });
  pushDoc({
    id: "resume_latex",
    title: "Generated LaTeX (resume.tex)",
    content: await readTextIfExists(path.join(runDir, "resume.tex"), perDoc.resume_latex)
  });
  pushDoc({
    id: "meta",
    title: "Run metadata (meta.json)",
    content: await readJsonIfExists(path.join(runDir, "meta.json"), perDoc.meta)
  });

  // Enforce a max total size (approx) to avoid runaway prompts.
  let budget = Number(maxTotalChars) || 80000;
  const clipped = [];
  for (const doc of docs) {
    if (budget <= 0) break;
    const content = (doc.content || "").toString();
    if (!content) continue;
    if (content.length <= budget) {
      clipped.push(doc);
      budget -= content.length;
      continue;
    }
    clipped.push({ ...doc, content: truncateText(content, budget) });
    budget = 0;
  }

  return {
    run_id: runId,
    docs: clipped.map((d) => ({ id: d.id, title: d.title, content: d.content }))
  };
}

function buildRunChatSystemPrompt() {
  return [
    "You are ResumeRunChat, a helpful assistant for understanding and improving a tailored resume run.",
    "You will be given a set of run documents (master resume, job description, rubric/selection/evidence artifacts, final outputs).",
    "",
    "Rules:",
    "- Be faithful to the provided documents; if something isn't in them, say you don't know.",
    "- When explaining 'why', ground your answer in the selection/rubric/evidence artifacts if present.",
    "- If the user asks to rewrite/restructure, propose alternatives but do not invent achievements not supported by the baseline resume.",
    "- You CAN propose concrete edits (including removals) to the resume. If asked to change LaTeX, describe what to change and how.",
    "- Do not claim you are unable to help with editing; instead explain the safest edit to apply.",
    "",
    "Output JSON ONLY with this schema:",
    `{ "answer": string, "citations": [{ "doc_id": string, "quote": string, "reason": string }] }`,
    "- citations is optional; include it when you can point to exact supporting text."
  ].join("\n");
}

function parseRunChatModelResponse(text) {
  const parsed = parseJsonSafe(text);
  if (parsed && typeof parsed === "object") {
    const answer = typeof parsed.answer === "string" ? parsed.answer : "";
    const citations = Array.isArray(parsed.citations) ? parsed.citations : [];
    const action = parsed.action && typeof parsed.action === "object" ? parsed.action : null;
    return { answer, citations, action };
  }
  return { answer: (text || "").toString(), citations: [], action: null };
}

async function runRunChat({ runId, runDir, messages, context, focus }) {
  if (CONFIG.mockMode) {
    return {
      answer:
        "Mock mode: I can help explain why changes were made and suggest rewrites. Ask about a specific bullet/section and I’ll ground it in the run artifacts.",
      citations: [],
      debug: { mock: true, docs: context?.docs?.map((d) => d.id) || [] }
    };
  }
  if (!openai) {
    throw new StageError("OpenAI client is unavailable (check OPENAI_API_KEY / MOCK_MODE)", "chat");
  }

  const system = buildRunChatSystemPrompt();
  const contextMsg = {
    role: "system",
    content: `RUN_CONTEXT_JSON:\n${JSON.stringify(
      {
        run_id: runId,
        focus: focus || null,
        documents: (context?.docs || []).map((d) => ({ id: d.id, title: d.title, content: d.content }))
      },
      null,
      2
    )}`
  };

  const modelStarted = Date.now();
  const response = await openai.chat.completions.create({
    model: CONFIG.chatModel,
    temperature: CONFIG.chatTemperature,
    messages: [{ role: "system", content: system }, contextMsg, ...messages]
  });
  const chatMs = Date.now() - modelStarted;
  const text = response?.choices?.[0]?.message?.content || "";
  const parsed = parseRunChatModelResponse(text);
  return {
    ...parsed,
    debug: { chat_ms: chatMs, model: CONFIG.chatModel, docs: context?.docs?.map((d) => d.id) || [] }
  };
}

function isTruncatedFocusSnippet(snippet) {
  const text = (snippet || "").toString();
  return text.includes("[TRUNCATED]");
}

function normalizePatchOps(action) {
  if (!action || typeof action !== "object") return null;
  if (action.type === "latex_patch_v2" && Array.isArray(action.ops)) {
    return action.ops;
  }
  // Backward compatibility: accept v1 single-op shape.
  if (action.type === "latex_patch_v1" && typeof action.op === "string") {
    return [
      {
        op: action.op,
        start: action.start,
        end: action.end,
        replacement: action.replacement
      }
    ];
  }
  return null;
}

function validateLatexPatchAction(action, expectedStart, expectedEnd) {
  const ops = normalizePatchOps(action);
  if (!ops) return { ok: false, reason: "missing/invalid action" };
  if (!Number.isFinite(expectedStart) || !Number.isFinite(expectedEnd) || expectedEnd <= expectedStart) {
    return { ok: false, reason: "expected selection invalid" };
  }
  if (ops.length < 1 || ops.length > 12) return { ok: false, reason: "ops length invalid" };

  for (const [idx, raw] of ops.entries()) {
    const op = (raw?.op || "").toString();
    const start = Number(raw?.start);
    const end = Number(raw?.end);
    const replacement = raw?.replacement;

    const isInsert = op === "insert_before" || op === "insert_after";
    const isDelete = op === "delete_range" || op === "delete_selection";
    const isReplace = op === "replace_range" || op === "replace_selection";
    if (!isInsert && !isDelete && !isReplace) return { ok: false, reason: `op[${idx}] invalid` };
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, reason: `op[${idx}] start/end invalid` };

    if (isInsert) {
      if (start !== end) return { ok: false, reason: `op[${idx}] insert must have start=end` };
      if (op === "insert_before" && start !== expectedStart)
        return { ok: false, reason: `op[${idx}] insert_before must be at selection start` };
      if (op === "insert_after" && start !== expectedEnd)
        return { ok: false, reason: `op[${idx}] insert_after must be at selection end` };
      if (typeof replacement !== "string") return { ok: false, reason: `op[${idx}] replacement required for insert` };
      continue;
    }

    // delete/replace must stay within selection
    if (end <= start) return { ok: false, reason: `op[${idx}] range invalid` };
    if (start < expectedStart || end > expectedEnd) {
      return { ok: false, reason: `op[${idx}] must be within selection` };
    }
    if (isReplace && typeof replacement !== "string") {
      return { ok: false, reason: `op[${idx}] replacement required for replace` };
    }
  }

  return { ok: true };
}

async function runRunEditExec({ runId, runDir, context, focus, instruction }) {
  if (CONFIG.mockMode) {
    return {
      answer: "Mock mode: I would apply a minimal patch to the selected LaTeX region.",
      citations: [],
      action: null,
      debug: { mock: true, docs: context?.docs?.map((d) => d.id) || [] }
    };
  }
  if (!openai) {
    throw new StageError("OpenAI client is unavailable (check OPENAI_API_KEY / MOCK_MODE)", "chat_edit");
  }

  const start = Number(focus?.selection?.start);
  const end = Number(focus?.selection?.end);
  const snippet = (focus?.snippet || "").toString();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new StageError("Invalid focus selection", "chat_edit");
  }
  if (!snippet.trim()) {
    throw new StageError("Missing focus snippet", "chat_edit");
  }
  if (isTruncatedFocusSnippet(snippet)) {
    return {
      answer:
        "That selection is too large to safely edit automatically. Please select a smaller LaTeX region (a single bullet/paragraph) and try again.",
      citations: [],
      action: null,
      debug: { model: CONFIG.editModel, too_large: true }
    };
  }
  if (snippet.includes("LOCK_") || snippet.includes("===LOCK")) {
    return {
      answer:
        "That selection appears to include locked LaTeX markers/content. Please select a region outside the locked blocks and try again.",
      citations: [],
      action: null,
      debug: { model: CONFIG.editModel, locked: true }
    };
  }

  const editPrompt = getPrompt("edit", CONFIG.editPromptVersion);
  const system = editPrompt.content.trim();
  const payload = {
    run_id: runId,
    instruction: instruction || "",
    focus: {
      type: focus.type,
      artifact: focus.artifact,
      selection: { start, end },
      snippet
    },
    context_docs: (context?.docs || []).map((d) => ({ id: d.id, title: d.title, content: d.content }))
  };

  const modelStarted = Date.now();
  const response = await openai.chat.completions.create({
    model: CONFIG.editModel,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `INPUT_JSON:\n${JSON.stringify(payload, null, 2)}` }
    ]
  });
  const ms = Date.now() - modelStarted;
  const text = response?.choices?.[0]?.message?.content || "";
  const parsed = parseRunChatModelResponse(text);
  const action = parsed.action;
  const validation = validateLatexPatchAction(action, start, end);
  if (!validation.ok) {
    return {
      answer:
        "I couldn't produce a safe, structured patch for that request. Try rephrasing or selecting a smaller region.",
      citations: parsed.citations || [],
      action: null,
      debug: { edit_ms: ms, model: CONFIG.editModel, validation_error: validation.reason, raw: truncateText(text, 2000) }
    };
  }

  return {
    answer: parsed.answer || "Prepared an edit you can apply.",
    citations: parsed.citations || [],
    action,
    debug: { edit_ms: ms, model: CONFIG.editModel, prompt: editPrompt.path }
  };
}

async function runRunLatexFullEdit({ runId, runDir, context, instruction }) {
  if (CONFIG.mockMode) {
    return {
      answer: "Mock mode: I would prepare a full updated resume.tex you can apply & save.",
      citations: [],
      action: null,
      debug: { mock: true, docs: context?.docs?.map((d) => d.id) || [] }
    };
  }
  if (!openai) {
    throw new StageError("OpenAI client is unavailable (check OPENAI_API_KEY / MOCK_MODE)", "chat_edit_full");
  }

  const texPath = path.join(runDir, "resume.tex");
  if (!fs.existsSync(texPath)) {
    return {
      answer:
        "I couldn’t find resume.tex for this run yet. Finish the run (generate LaTeX), then either edit it in “LaTeX Editor” or select a snippet and ask for a patch.",
      citations: [],
      action: null,
      debug: { model: CONFIG.editModel, missing_resume_tex: true }
    };
  }

  const currentLatex = await fs.promises.readFile(texPath, "utf8");
  if (currentLatex.length > 180_000) {
    return {
      answer:
        "Your resume.tex is too large to safely edit as a whole via chat. Please select a smaller LaTeX region (a single bullet/paragraph) in “LaTeX Editor” and use “Ask about selection” instead.",
      citations: [],
      action: null,
      debug: { model: CONFIG.editModel, too_large_full_edit: true, chars: currentLatex.length }
    };
  }

  const system = [
    "You are ResumeLatexEditor, an assistant that edits a LaTeX resume file for a single run.",
    "",
    "You will be given INPUT_JSON containing:",
    "- instruction: what the user wants changed",
    "- current_latex: the full current contents of resume.tex",
    "- context_docs: supporting run artifacts (baseline/job/rubric/selection/evidence)",
    "",
    "Rules:",
    "- Return JSON ONLY.",
    "- Produce a full updated LaTeX document in action.latex (not a snippet, not a diff).",
    "- Do NOT wrap LaTeX in code fences.",
    "- Preserve the overall structure and required commands; keep it compiling.",
    "- Be faithful to baseline achievements: do not invent facts not supported by context_docs.",
    "- If you cannot safely produce a full updated file, set action to null and explain what to do instead.",
    "",
    "Output JSON schema:",
    `{ "answer": string, "action": { "type": "latex_replace_full", "latex": string } | null, "citations"?: [{ "doc_id": string, "quote": string, "reason": string }] }`
  ].join("\n");

  const payload = {
    run_id: runId,
    instruction: (instruction || "").toString(),
    current_latex: currentLatex,
    context_docs: (context?.docs || []).map((d) => ({ id: d.id, title: d.title, content: d.content }))
  };

  const modelStarted = Date.now();
  const response = await openai.chat.completions.create({
    model: CONFIG.editModel,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `INPUT_JSON:\n${JSON.stringify(payload, null, 2)}` }
    ]
  });
  const ms = Date.now() - modelStarted;
  const text = response?.choices?.[0]?.message?.content || "";
  const parsed = parseRunChatModelResponse(text);

  const action = parsed.action;
  const latex = action && action.type === "latex_replace_full" ? action.latex : null;
  const latexStr = typeof latex === "string" ? latex : null;
  const looksLikeDoc =
    typeof latexStr === "string" &&
    latexStr.length >= 200 &&
    latexStr.includes("\\begin{document}") &&
    latexStr.includes("\\end{document}");
  if (!looksLikeDoc) {
    return {
      answer:
        parsed.answer ||
        "I couldn't safely produce a full updated resume.tex. Please select a smaller region and request an edit patch.",
      citations: parsed.citations || [],
      action: null,
      debug: { edit_ms: ms, model: CONFIG.editModel, validation_error: "missing/invalid latex_replace_full", raw: truncateText(text, 2000) }
    };
  }
  if (latexStr.length > 2_000_000) {
    return {
      answer:
        "The edited LaTeX output is too large to save. Please request a smaller, more targeted change (or select a region and patch).",
      citations: parsed.citations || [],
      action: null,
      debug: { edit_ms: ms, model: CONFIG.editModel, validation_error: "latex too large", chars: latexStr.length }
    };
  }

  return {
    answer: parsed.answer || "Prepared a full updated resume.tex you can apply & save.",
    citations: parsed.citations || [],
    action: { type: "latex_replace_full", latex: latexStr },
    debug: { edit_ms: ms, model: CONFIG.editModel, mode: "latex_replace_full" }
  };
}

function buildRubricPayload(jobPayload = {}, jobText = "", promptVersion = "latest_v1") {
  const jobMeta = buildJobMetaFromPayload(jobPayload, {});
  return {
    prompt_version: promptVersion,
    job_payload: jobMeta,
    raw_text_hash: `sha256:${hashString(jobText)}`,
    job_description_text: jobText || ""
  };
}

function validateRubric(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Not a JSON object"] };
  }
  const allowedTop = ["version", "job_meta", "requirements", "keywords", "constraints", "notes"];
  Object.keys(data || {}).forEach((key) => {
    if (!allowedTop.includes(key)) errors.push(`Unexpected top-level key: ${key}`);
  });
  allowedTop.forEach((key) => {
    if (!(key in data)) errors.push(`Missing top-level key: ${key}`);
  });
  if (data.version !== JD_RUBRIC_SCHEMA_V1.version) errors.push(`version must be ${JD_RUBRIC_SCHEMA_V1.version}`);

  const jobMeta = data.job_meta || {};
  const jobMetaKeys = Object.keys(JD_RUBRIC_SCHEMA_V1.job_meta);
  Object.keys(jobMeta || {}).forEach((k) => {
    if (!jobMetaKeys.includes(k)) errors.push(`Unexpected job_meta key: ${k}`);
  });
  jobMetaKeys.forEach((k) => {
    if (typeof jobMeta[k] !== "string") errors.push(`job_meta.${k} must be string`);
  });

  if (!Array.isArray(data.requirements)) {
    errors.push("requirements must be array");
  } else {
    if (data.requirements.length < 12 || data.requirements.length > 20) {
      errors.push(`requirements count must be between 12 and 20 (found ${data.requirements.length})`);
    }
    data.requirements.forEach((req, idx) => {
      if (!req || typeof req !== "object") {
        errors.push(`requirements[${idx}] must be object`);
        return;
      }
      const allowedReqKeys = ["req_id", "type", "weight", "requirement", "jd_evidence", "category"];
      Object.keys(req || {}).forEach((k) => {
        if (!allowedReqKeys.includes(k)) errors.push(`Unexpected requirements[${idx}] key: ${k}`);
      });
      if (typeof req.req_id !== "string") errors.push(`requirements[${idx}].req_id must be string`);
      if (req.type !== "must" && req.type !== "nice") errors.push(`requirements[${idx}].type must be must|nice`);
      if (!Number.isInteger(req.weight) || req.weight < 1 || req.weight > 5)
        errors.push(`requirements[${idx}].weight must be integer 1-5`);
      if (typeof req.requirement !== "string") errors.push(`requirements[${idx}].requirement must be string`);
      if (!Array.isArray(req.jd_evidence)) errors.push(`requirements[${idx}].jd_evidence must be array`);
      if (!RUBRIC_ALLOWED_CATEGORIES.has(req.category)) errors.push(`requirements[${idx}].category invalid`);
    });
  }

  if (!Array.isArray(data.keywords)) {
    errors.push("keywords must be array");
  } else {
    if (data.keywords.length < 10 || data.keywords.length > 20) {
      errors.push(`keywords count must be between 10 and 20 (found ${data.keywords.length})`);
    }
    data.keywords.forEach((kw, idx) => {
      if (!kw || typeof kw !== "object") {
        errors.push(`keywords[${idx}] must be object`);
        return;
      }
      const allowedKwKeys = ["term", "importance", "type", "jd_evidence"];
      Object.keys(kw || {}).forEach((k) => {
        if (!allowedKwKeys.includes(k)) errors.push(`Unexpected keywords[${idx}] key: ${k}`);
      });
      if (typeof kw.term !== "string") errors.push(`keywords[${idx}].term must be string`);
      if (!Number.isInteger(kw.importance) || kw.importance < 1 || kw.importance > 5)
        errors.push(`keywords[${idx}].importance must be integer 1-5`);
      if (typeof kw.type !== "string") errors.push(`keywords[${idx}].type must be string`);
      if (!Array.isArray(kw.jd_evidence)) errors.push(`keywords[${idx}].jd_evidence must be array`);
    });
  }

  const constraints = data.constraints || {};
  const allowedConstraintKeys = ["years_experience_min", "education", "certifications", "work_authorization"];
  Object.keys(constraints || {}).forEach((k) => {
    if (!allowedConstraintKeys.includes(k)) errors.push(`Unexpected constraints key: ${k}`);
  });
  allowedConstraintKeys.forEach((k) => {
    if (!(k in constraints)) errors.push(`Missing constraints key: ${k}`);
  });
  if (
    constraints.years_experience_min !== null &&
    constraints.years_experience_min !== undefined &&
    !Number.isFinite(constraints.years_experience_min)
  ) {
    errors.push("constraints.years_experience_min must be number or null");
  }
  ["education", "certifications", "work_authorization"].forEach((k) => {
    if (!Array.isArray(constraints[k])) errors.push(`constraints.${k} must be array`);
  });

  const notes = data.notes || {};
  const allowedNoteKeys = ["summary", "ambiguities"];
  Object.keys(notes || {}).forEach((k) => {
    if (!allowedNoteKeys.includes(k)) errors.push(`Unexpected notes key: ${k}`);
  });
  allowedNoteKeys.forEach((k) => {
    if (!(k in notes)) errors.push(`Missing notes key: ${k}`);
  });
  if (typeof notes.summary !== "string") errors.push("notes.summary must be string");
  if (!Array.isArray(notes.ambiguities)) errors.push("notes.ambiguities must be array");

  return { valid: errors.length === 0, errors };
}

function normalizeRubricOutput(rubric = {}, jobPayload = {}) {
  if (!rubric || typeof rubric !== "object") {
    throw new StageError("Rubric payload missing", "rubric_validation");
  }
  const requirements = normalizeRubricRequirements(rubric.requirements);
  const keywords = normalizeRubricKeywords(rubric.keywords);
  const constraints = normalizeRubricConstraints(rubric.constraints);
  const notes = normalizeRubricNotes(rubric.notes, jobPayload, rubric);
  if (requirements.length < 12 || requirements.length > 20) {
    throw new StageError(`Rubric requirements count out of range: ${requirements.length}`, "rubric_validation");
  }
  if (keywords.length < 10 || keywords.length > 20) {
    throw new StageError(`Rubric keywords count out of range: ${keywords.length}`, "rubric_validation");
  }
  return {
    version: JD_RUBRIC_SCHEMA_V1.version,
    job_meta: buildJobMetaFromPayload(jobPayload, rubric.job_meta),
    requirements,
    keywords,
    constraints,
    notes
  };
}

function normalizeRubricRequirements(list = []) {
  const map = new Map();
  const provided = Array.isArray(list) ? list : [];
  provided.forEach((req, idx) => {
    if (!req || typeof req !== "object") return;
    const text = (req.requirement || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    const normalized = {
      req_id: req.req_id || `R${idx + 1}`,
      type: req.type === "nice" ? "nice" : "must",
      weight: coerceIntegerInRange(req.weight, 1, 5, 1),
      requirement: text,
      jd_evidence: normalizeEvidenceList(req.jd_evidence, 20),
      category: RUBRIC_ALLOWED_CATEGORIES.has(req.category) ? req.category : "other"
    };
    const existing = map.get(key);
    if (!existing || normalized.weight > existing.weight || (normalized.weight === existing.weight && normalized.type === "must" && existing.type !== "must")) {
      map.set(key, normalized);
    }
  });
  const sorted = Array.from(map.values()).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.type !== b.type) return a.type === "must" ? -1 : 1;
    return a.requirement.localeCompare(b.requirement);
  });
  const limited = sorted.slice(0, 20).map((req, idx) => ({
    ...req,
    req_id: `R${idx + 1}`,
    jd_evidence: normalizeEvidenceList(req.jd_evidence, 20)
  }));
  return limited;
}

function normalizeRubricKeywords(list = []) {
  const map = new Map();
  const provided = Array.isArray(list) ? list : [];
  provided.forEach((kw, idx) => {
    if (!kw || typeof kw !== "object") return;
    const term = (kw.term || "").trim();
    if (!term) return;
    const key = term.toLowerCase();
    const normalized = {
      term,
      importance: coerceIntegerInRange(kw.importance, 1, 5, 1),
      type: kw.type || "keyword",
      jd_evidence: normalizeEvidenceList(kw.jd_evidence, 12)
    };
    const existing = map.get(key);
    if (!existing || normalized.importance > existing.importance) {
      map.set(key, normalized);
    }
  });
  const sorted = Array.from(map.values()).sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return a.term.localeCompare(b.term);
  });
  return sorted.slice(0, 20);
}

function normalizeRubricConstraints(constraints = {}) {
  const yearsRaw = constraints?.years_experience_min;
  const yearsNum = Number(yearsRaw);
  const yearsVal = Number.isFinite(yearsNum) ? yearsNum : null;
  return {
    years_experience_min: yearsVal,
    education: dedupeStrings(constraints?.education),
    certifications: dedupeStrings(constraints?.certifications),
    work_authorization: dedupeStrings(constraints?.work_authorization)
  };
}

function normalizeRubricNotes(notes = {}, jobPayload = {}, rubric = {}) {
  const baseSummary = deriveJobSummary(jobPayload, rubric);
  const summary = typeof notes?.summary === "string" && notes.summary.trim().length ? notes.summary.trim() : baseSummary;
  return {
    summary,
    ambiguities: dedupeStrings(notes?.ambiguities)
  };
}

function buildJobMetaFromPayload(jobPayload = {}, provided = {}) {
  const job = jobPayload.job || {};
  const meta = jobPayload.meta || {};
  return {
    job_title: job.title || provided.job_title || "",
    company: job.company || provided.company || "",
    location: job.location || job.location_hint || provided.location || "",
    employment_type: job.employment_type || provided.employment_type || "",
    seniority: job.seniority || provided.seniority || "",
    job_url: job.job_url || meta.url || provided.job_url || "",
    platform: job.source_platform || job.platform || meta.platform || provided.platform || ""
  };
}

function normalizeEvidenceList(list = [], wordLimit = 20) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((text) => truncateWords(text, wordLimit));
}

function truncateWords(text, maxWords) {
  const words = (text || "").trim().split(/\s+/);
  if (words.length <= maxWords) return words.join(" ").trim();
  return words.slice(0, maxWords).join(" ").trim();
}

function enforceBulletWordLimit(finalResume = {}, maxWords = 25, returnErrors = false) {
  const errors = [];
  const checkList = (entries, pathPrefix) => {
    (entries || []).forEach((entry, idx) => {
      (entry?.bullets || []).forEach((bullet, bIdx) => {
        const wordCount = (bullet || "").trim().split(/\s+/).filter(Boolean).length;
        if (wordCount > maxWords) {
          errors.push(`${pathPrefix}[${idx}].bullets[${bIdx}] exceeds ${maxWords} words (${wordCount})`);
        }
      });
    });
  };
  checkList(finalResume?.work_experience, "final_resume.work_experience");
  checkList(finalResume?.projects, "final_resume.projects");
  return returnErrors ? errors : errors.length === 0;
}

function coerceIntegerInRange(value, min, max, fallback) {
  const num = Number(value);
  if (Number.isInteger(num)) {
    return Math.min(max, Math.max(min, num));
  }
  return fallback;
}

function dedupeStrings(list = []) {
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();
  const result = [];
  arr.forEach((item) => {
    if (typeof item !== "string") return;
    const val = item.trim();
    if (!val) return;
    const key = val.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(val);
    }
  });
  return result;
}

function deriveJobSummary(jobPayload = {}, rubric = {}) {
  const job = jobPayload.job || {};
  const title = job.title || rubric?.job_meta?.job_title || "the role";
  const company = job.company || rubric?.job_meta?.company || "the company";
  return `Summary for ${title} at ${company}.`;
}

function detectSchemaVersion(parsed, promptVersion) {
  if (parsed?.version) return parsed.version;
  if (promptVersion) return promptVersion;
  return CONFIG.promptsVersion;
}

function validateTailored(data, targetVersion) {
  const version = detectSchemaVersion(data, targetVersion);
  if (isV4Version(version)) {
    return validateTailoredV4(data);
  }
  if (isV3Version(version)) {
    return validateTailoredV3(data);
  }
  return validateTailoredV2(data);
}

function validateTailoredV3(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Not a JSON object"] };
  }
  const requiredTop = ["version", "job", "jd_rubric", "evidence_index", "mapping", "changes", "final_resume", "diagnostics", "guardrail_report"];
  const allowedExtraTop = ["explainability"];
  requiredTop.forEach((key) => {
    if (!(key in data)) errors.push(`Missing top-level key: ${key}`);
  });
  Object.keys(data || {}).forEach((key) => {
    if (!requiredTop.includes(key) && !allowedExtraTop.includes(key)) errors.push(`Unexpected top-level key: ${key}`);
  });

  const job = data.job || {};
  const allowedJobKeys = [
    "title",
    "company",
    "location",
    "location_hint",
    "job_url",
    "source_platform",
    "confidence",
    "raw_job_text_hash",
    "raw_text_hash",
    "extracted_preview",
    "role_hint",
    "employment_type",
    "seniority"
  ];
  Object.keys(job || {}).forEach((k) => {
    if (!allowedJobKeys.includes(k)) errors.push(`Unexpected job key: ${k}`);
  });
  ["title", "company", "location", "location_hint", "job_url", "source_platform", "raw_job_text_hash", "extracted_preview"].forEach((k) => {
    if (typeof job[k] !== "string") errors.push(`job.${k} must be string`);
  });
  if (job.raw_text_hash && typeof job.raw_text_hash !== "string") errors.push("job.raw_text_hash must be string when provided");
  if (job.confidence !== undefined && typeof job.confidence !== "number") errors.push("job.confidence must be number when provided");

  const rubric = data.jd_rubric || {};
  if (!rubric || typeof rubric !== "object") {
    errors.push("jd_rubric must be object");
  } else {
    ensureArrayOfStrings(rubric.top_keywords, "jd_rubric.top_keywords", errors);
    if (!Array.isArray(rubric.requirements)) {
      errors.push("jd_rubric.requirements must be array");
    } else {
      rubric.requirements.forEach((req, idx) => {
        if (!req || typeof req !== "object") {
          errors.push(`jd_rubric.requirements[${idx}] must be object`);
          return;
        }
        if (typeof req.req_id !== "string") errors.push(`jd_rubric.requirements[${idx}].req_id must be string`);
        if (typeof req.text !== "string") errors.push(`jd_rubric.requirements[${idx}].text must be string`);
        if (req.type !== "must" && req.type !== "nice") errors.push(`jd_rubric.requirements[${idx}].type must be "must" or "nice"`);
        if (req.weight !== undefined && typeof req.weight !== "number") errors.push(`jd_rubric.requirements[${idx}].weight must be number`);
        if (req.jd_snippet !== undefined && typeof req.jd_snippet !== "string") errors.push(`jd_rubric.requirements[${idx}].jd_snippet must be string when provided`);
      });
    }
  }

  if (!Array.isArray(data.evidence_index)) {
    errors.push("evidence_index must be array");
  } else {
    data.evidence_index.forEach((ev, idx) => {
      if (!ev || typeof ev !== "object") {
        errors.push(`evidence_index[${idx}] must be object`);
        return;
      }
      if (typeof ev.bullet_id !== "string") errors.push(`evidence_index[${idx}].bullet_id must be string`);
      if (typeof ev.parent_type !== "string") errors.push(`evidence_index[${idx}].parent_type must be string`);
      if (typeof ev.parent_id !== "string") errors.push(`evidence_index[${idx}].parent_id must be string`);
      if (typeof ev.original_text !== "string") errors.push(`evidence_index[${idx}].original_text must be string`);
      ensureArrayOfStrings(ev.detected_skills_tools, `evidence_index[${idx}].detected_skills_tools`, errors, true);
      if (ev.has_metric !== undefined && typeof ev.has_metric !== "boolean") errors.push(`evidence_index[${idx}].has_metric must be boolean when provided`);
    });
  }

  const mapping = data.mapping || {};
  if (!mapping || typeof mapping !== "object") {
    errors.push("mapping must be object");
  } else {
    if (!Array.isArray(mapping.requirement_to_evidence)) {
      errors.push("mapping.requirement_to_evidence must be array");
    } else {
      mapping.requirement_to_evidence.forEach((entry, idx) => {
        if (!entry || typeof entry !== "object") {
          errors.push(`mapping.requirement_to_evidence[${idx}] must be object`);
          return;
        }
        if (typeof entry.req_id !== "string") errors.push(`mapping.requirement_to_evidence[${idx}].req_id must be string`);
        if (typeof entry.missing_in_resume !== "boolean")
          errors.push(`mapping.requirement_to_evidence[${idx}].missing_in_resume must be boolean`);
        if (!Array.isArray(entry.evidence)) {
          errors.push(`mapping.requirement_to_evidence[${idx}].evidence must be array`);
        } else {
          entry.evidence.forEach((ev, evIdx) => {
            if (!ev || typeof ev !== "object") {
              errors.push(`mapping.requirement_to_evidence[${idx}].evidence[${evIdx}] must be object`);
              return;
            }
            if (typeof ev.bullet_id !== "string") errors.push(`mapping.requirement_to_evidence[${idx}].evidence[${evIdx}].bullet_id must be string`);
            if (ev.match_type !== undefined && typeof ev.match_type !== "string") {
              errors.push(`mapping.requirement_to_evidence[${idx}].evidence[${evIdx}].match_type must be string when provided`);
            }
          });
        }
      });
    }
    validateBulletMappings(mapping.bullet_to_requirements, "mapping.bullet_to_requirements", errors);
  }

  const changes = data.changes || {};
  if (!changes || typeof changes !== "object") {
    errors.push("changes must be object");
  } else {
    validateChangeDiffs(changes.experience, "changes.experience", "role_id", errors);
    validateChangeDiffs(changes.projects, "changes.projects", "project_id", errors);
    validateKeywordInserts(changes.keyword_insertions, "changes.keyword_insertions", errors, true);
  }

  if ("final_resume" in data) {
    validateFinalResume(data.final_resume, errors);
  } else {
    errors.push("Missing final_resume");
  }

  const diagnostics = data.diagnostics || {};
  if (!diagnostics || typeof diagnostics !== "object") {
    errors.push("diagnostics must be object");
  } else {
    if (
      diagnostics.match_score_before !== undefined &&
      diagnostics.match_score_before !== null &&
      typeof diagnostics.match_score_before !== "number"
    ) {
      errors.push("diagnostics.match_score_before must be number when provided");
    }
    if (
      diagnostics.match_score_after !== undefined &&
      diagnostics.match_score_after !== null &&
      typeof diagnostics.match_score_after !== "number"
    ) {
      errors.push("diagnostics.match_score_after must be number when provided");
    }
    ensureArrayOfStrings(diagnostics.weak_bullets, "diagnostics.weak_bullets", errors, true);
    ensureArrayOfStrings(diagnostics.missing_skills_list, "diagnostics.missing_skills_list", errors, true);
  }

  const guardrail = data.guardrail_report || {};
  const guardrailKeys = ["unsupported_claims", "new_entities", "hallucinations", "safety_warnings"];
  if (!guardrail || typeof guardrail !== "object") {
    errors.push("guardrail_report must be object");
  } else {
    guardrailKeys.forEach((key) => {
      if (!Array.isArray(guardrail[key])) {
        errors.push(`guardrail_report.${key} must be array`);
      } else if (guardrail[key].length) {
        errors.push(`guardrail_report.${key} must be empty (found ${guardrail[key].length})`);
      }
    });
    Object.keys(guardrail || {}).forEach((k) => {
      if (!guardrailKeys.includes(k)) errors.push(`Unexpected guardrail_report key: ${k}`);
    });
  }

  return { valid: errors.length === 0, errors };
}

function validateTailoredV4(data) {
  const base = validateTailoredV3(data);
  const errors = [...(base.errors || [])];
  if ((data?.version || "").toLowerCase().includes("v4") === false) {
    errors.push("version must be v4");
  }
  const explain = data.explainability;
  if (!explain || typeof explain !== "object") {
    errors.push("Missing explainability block");
  } else {
    const allowedExplainKeys = ["selection_plan_ref", "included_bullets", "dropped_bullets", "rewrite_summary"];
    Object.keys(explain || {}).forEach((key) => {
      if (!allowedExplainKeys.includes(key)) errors.push(`Unexpected explainability key: ${key}`);
    });
    if (typeof explain.selection_plan_ref !== "object") {
      errors.push("explainability.selection_plan_ref must be object");
    } else {
      if (typeof explain.selection_plan_ref.file !== "string") errors.push("explainability.selection_plan_ref.file must be string");
      if (typeof explain.selection_plan_ref.hash !== "string") errors.push("explainability.selection_plan_ref.hash must be string");
    }
    if (!Array.isArray(explain.included_bullets)) {
      errors.push("explainability.included_bullets must be array");
    } else {
      explain.included_bullets.forEach((entry, idx) => {
        if (typeof entry?.bullet_id !== "string" || !entry.bullet_id) errors.push(`explainability.included_bullets[${idx}].bullet_id must be string`);
        if (entry.parent_type !== undefined && typeof entry.parent_type !== "string")
          errors.push(`explainability.included_bullets[${idx}].parent_type must be string when provided`);
        if (entry.parent_id !== undefined && typeof entry.parent_id !== "string")
          errors.push(`explainability.included_bullets[${idx}].parent_id must be string when provided`);
        if (entry.original_text !== undefined && typeof entry.original_text !== "string")
          errors.push(`explainability.included_bullets[${idx}].original_text must be string when provided`);
        if (entry.rewritten_text !== undefined && typeof entry.rewritten_text !== "string")
          errors.push(`explainability.included_bullets[${idx}].rewritten_text must be string when provided`);
      });
    }
    if (!Array.isArray(explain.dropped_bullets)) {
      errors.push("explainability.dropped_bullets must be array");
    } else {
      explain.dropped_bullets.forEach((entry, idx) => {
        if (typeof entry?.bullet_id !== "string" || !entry.bullet_id) errors.push(`explainability.dropped_bullets[${idx}].bullet_id must be string`);
        if (entry.reason !== undefined && typeof entry.reason !== "string")
          errors.push(`explainability.dropped_bullets[${idx}].reason must be string when provided`);
      });
    }
    if (!Array.isArray(explain.rewrite_summary)) {
      errors.push("explainability.rewrite_summary must be array");
    } else {
      explain.rewrite_summary.forEach((entry, idx) => {
        if (typeof entry?.bullet_id !== "string" || !entry.bullet_id) errors.push(`explainability.rewrite_summary[${idx}].bullet_id must be string`);
        if (entry.rewrite_type !== undefined && typeof entry.rewrite_type !== "string")
          errors.push(`explainability.rewrite_summary[${idx}].rewrite_type must be string when provided`);
        if (entry.keywords_inserted !== undefined) {
          ensureArrayOfStrings(entry.keywords_inserted, `explainability.rewrite_summary[${idx}].keywords_inserted`, errors, true);
        }
      });
    }
  }

  const bulletWordErrors = enforceBulletWordLimit(data?.final_resume, 25, true);
  errors.push(...bulletWordErrors);

  return { valid: errors.length === 0, errors };
}

function validateTailoredV2(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Not a JSON object"] };
  }
  const requiredTop = ["version", "job", "analysis", "resume_plan", "quality", "explainability"];
  requiredTop.forEach((key) => {
    if (!(key in data)) errors.push(`Missing top-level key: ${key}`);
  });
  Object.keys(data || {}).forEach((key) => {
    if (!requiredTop.includes(key) && key !== "final_resume") errors.push(`Unexpected top-level key: ${key}`);
  });
  if (typeof data.version !== "string") errors.push("version must be string");

  const job = data.job || {};
  const jobKeys = ["title", "company", "location", "source_platform", "confidence", "raw_text_hash", "extracted_preview"];
  Object.keys(job || {}).forEach((k) => {
    if (!jobKeys.includes(k)) errors.push(`Unexpected job key: ${k}`);
  });
  ["title", "company", "location", "source_platform", "raw_text_hash"].forEach((k) => {
    if (typeof job[k] !== "string") errors.push(`job.${k} must be string`);
  });
  if (typeof job.confidence !== "number") errors.push("job.confidence must be number");
  if (job.extracted_preview !== undefined && typeof job.extracted_preview !== "string") {
    errors.push("job.extracted_preview must be string");
  }

  const analysis = data.analysis || {};
  const analysisKeys = ["top_keywords", "must_have_requirements", "nice_to_have_requirements", "role_focus", "gap_notes"];
  Object.keys(analysis || {}).forEach((k) => {
    if (!analysisKeys.includes(k)) errors.push(`Unexpected analysis key: ${k}`);
  });
  ensureArrayOfStrings(analysis.top_keywords, "analysis.top_keywords", errors);
  ensureArrayOfStrings(analysis.must_have_requirements, "analysis.must_have_requirements", errors);
  ensureArrayOfStrings(analysis.nice_to_have_requirements, "analysis.nice_to_have_requirements", errors);
  if (typeof analysis.role_focus !== "string") errors.push("analysis.role_focus must be string");
  ensureArrayOfStrings(analysis.gap_notes, "analysis.gap_notes", errors);

  const plan = data.resume_plan || {};
  const planKeys = ["summary", "core_skills", "experience_updates", "projects_updates"];
  Object.keys(plan || {}).forEach((k) => {
    if (!planKeys.includes(k)) errors.push(`Unexpected resume_plan key: ${k}`);
  });
  if (typeof plan.summary !== "string") errors.push("resume_plan.summary must be string");
  ensureArrayOfStrings(plan.core_skills, "resume_plan.core_skills", errors);
  ensureUpdates(plan.experience_updates, "resume_plan.experience_updates", "role_id", errors);
  ensureUpdates(plan.projects_updates, "resume_plan.projects_updates", "project_id", errors);

  if ("final_resume" in data) {
    validateFinalResume(data.final_resume, errors);
  }

  const quality = data.quality || {};
  const qualityKeys = ["ats_notes", "risk_flags"];
  Object.keys(quality || {}).forEach((k) => {
    if (!qualityKeys.includes(k)) errors.push(`Unexpected quality key: ${k}`);
  });
  ensureArrayOfStrings(quality.ats_notes, "quality.ats_notes", errors);
  ensureArrayOfStrings(quality.risk_flags, "quality.risk_flags", errors);

  const explain = data.explainability || {};
  if (!explain || typeof explain !== "object") {
    errors.push("explainability must be object");
  } else {
    const baseline = explain.baseline_resume || {};
    if (typeof baseline.resume_id !== "string") errors.push("explainability.baseline_resume.resume_id must be string");
    if (baseline.stored_at !== undefined && typeof baseline.stored_at !== "string") {
      errors.push("explainability.baseline_resume.stored_at must be string when provided");
    }
    const jobPreview = explain.job_preview || {};
    if (jobPreview.extracted_preview !== undefined && typeof jobPreview.extracted_preview !== "string") {
      errors.push("explainability.job_preview.extracted_preview must be string when provided");
    }
    if (jobPreview.raw_text_hash !== undefined && typeof jobPreview.raw_text_hash !== "string") {
      errors.push("explainability.job_preview.raw_text_hash must be string when provided");
    }
    ensureArrayOfStrings(jobPreview.warnings, "explainability.job_preview.warnings", errors, true);

    const changes = explain.changes || {};
    validateChangeEntries(changes.experience, "explainability.changes.experience", "role_id", errors);
    validateChangeEntries(changes.projects, "explainability.changes.projects", "project_id", errors);

    const reqs = explain.requirements || {};
    validateRequirements(reqs.must_have, "explainability.requirements.must_have", errors);
    validateRequirements(reqs.nice_to_have, "explainability.requirements.nice_to_have", errors);

    const mappings = explain.mappings || {};
    validateBulletMappings(mappings.bullet_to_requirements, "explainability.mappings.bullet_to_requirements", errors);
  validateKeywordInserts(mappings.keyword_inserts, "explainability.mappings.keyword_inserts", errors);
  }

  return { valid: errors.length === 0, errors };
}

function normalizeTailoredOutput(parsed, jobPayload, masterResume, promptVersion) {
  const targetVersion = detectSchemaVersion(parsed, promptVersion);
  if (isV4Version(targetVersion)) {
    const upgraded = isV4Version(parsed?.version) ? parsed : upgradeV3ToV4(parsed, jobPayload, masterResume, targetVersion);
    return normalizeTailoredV4(upgraded || {}, jobPayload, masterResume, targetVersion);
  }
  if (isV3Version(targetVersion)) {
    const upgraded = isV3Version(parsed?.version) ? parsed : upgradeV2ToV3(parsed, jobPayload, masterResume, targetVersion);
    return normalizeTailoredV3(upgraded || {}, jobPayload, masterResume, targetVersion);
  }
  const upgraded = (promptVersion || "").startsWith("legacy")
    ? upgradeLegacyTailored(parsed, jobPayload, masterResume, promptVersion)
    : parsed;
  const withFinal = ensureFinalResume(upgraded, masterResume);
  return applyExplainabilityDefaults(withFinal, jobPayload, masterResume);
}

function normalizeTailoredV3(parsed = {}, jobPayload, masterResume, version) {
  const normalizedJob = normalizeJobV3(parsed.job, jobPayload);
  const jd_rubric = normalizeJdRubric(parsed.jd_rubric, parsed.analysis, parsed.explainability);
  const finalResume = attachStableIds(
    sanitizeFinalResume(parsed.final_resume || buildFinalResumeFromPlan(parsed, masterResume), masterResume),
    masterResume
  );
  const evidence_index = normalizeEvidenceIndex(parsed.evidence_index, finalResume);
  const changes = normalizeChangesV3(parsed.changes, finalResume, masterResume, jd_rubric.top_keywords);
  const mapping = normalizeMappingV3(parsed.mapping, jd_rubric, evidence_index, changes);
  const diagnostics = normalizeDiagnosticsV3(parsed.diagnostics, mapping, jd_rubric);
  const guardrail_report = ensureGuardrailReportEmpty(parsed.guardrail_report);
  return {
    version: version || parsed.version || TAILORED_SCHEMA_EXAMPLE_V3.version,
    job: normalizedJob,
    jd_rubric,
    evidence_index,
    mapping,
    changes,
    final_resume: finalResume,
    diagnostics,
    guardrail_report
  };
}

function normalizeTailoredV4(parsed = {}, jobPayload, masterResume, version) {
  const base = normalizeTailoredV3(parsed, jobPayload, masterResume, version);
  const explainability = normalizeSelectionExplainability(parsed.explainability);
  const final_resume = applyWordLimitToFinalResume(base.final_resume, 25);
  return {
    ...base,
    version: version || parsed.version || TAILORED_SCHEMA_EXAMPLE_V4.version,
    explainability,
    final_resume
  };
}

function upgradeV2ToV3(parsed = {}, jobPayload, masterResume, version) {
  if (!parsed || typeof parsed !== "object") return parsed;
  const explain = parsed.explainability || {};
  const finalResume = attachStableIds(
    sanitizeFinalResume(parsed.final_resume || buildFinalResumeFromPlan(parsed, masterResume), masterResume),
    masterResume
  );
  const requirements = normalizeRequirements(explain.requirements, parsed.analysis);
  const jd_rubric = normalizeJdRubric(
    {
      top_keywords: parsed.analysis?.top_keywords || [],
      requirements: buildRubricFromV2Requirements(requirements)
    },
    parsed.analysis,
    explain
  );
  const changes = {
    experience: (explain.changes?.experience || []).map((entry, idx) => ({
      role_id: entry.role_id || `role_${idx + 1}`,
      updated_bullets: buildUpdatedBullets(entry.before_bullets || [], entry.after_bullets || [], entry.role_id || `role_${idx + 1}`)
    })),
    projects: (explain.changes?.projects || []).map((entry, idx) => ({
      project_id: entry.project_id || `project_${idx + 1}`,
      updated_bullets: buildUpdatedBullets(entry.before_bullets || [], entry.after_bullets || [], entry.project_id || `project_${idx + 1}`)
    })),
    keyword_insertions: (explain.mappings?.keyword_inserts || []).map((m) => ({
      bullet_id: m?.bullet_id || "",
      keywords: m?.keywords || []
    }))
  };
  const evidence_index = normalizeEvidenceIndex(parsed.evidence_index, finalResume);
  const mapping = normalizeMappingV3(
    { requirement_to_evidence: parsed.mapping?.requirement_to_evidence || [], bullet_to_requirements: explain.mappings?.bullet_to_requirements || [] },
    jd_rubric,
    evidence_index,
    changes
  );
  const diagnostics = normalizeDiagnosticsV3(
    parsed.diagnostics || {
      weak_bullets: [],
      missing_skills_list: parsed.analysis?.gap_notes || []
    },
    mapping,
    jd_rubric
  );
  const job = normalizeJobV3(parsed.job, jobPayload);
  return {
    version: version || "latest_v3",
    job,
    jd_rubric,
    evidence_index,
    mapping,
    changes,
    final_resume: finalResume,
    diagnostics,
    guardrail_report: ensureGuardrailReportEmpty(parsed.guardrail_report)
  };
}

function upgradeV3ToV4(parsed = {}, jobPayload, masterResume, version) {
  if (!parsed || typeof parsed !== "object") return parsed;
  return {
    ...parsed,
    version: version || parsed.version || TAILORED_SCHEMA_EXAMPLE_V4.version
  };
}

function normalizeJobV3(job = {}, jobPayload = {}) {
  const jobBlock = jobPayload.job || {};
  const meta = jobPayload.meta || {};
  const rawJobText = jobBlock.description_text || "";
  const rawTextHash = hashString(rawJobText);
  const extractedPreview = job.extracted_preview || jobBlock.extracted_preview || rawJobText.slice(0, 500);
  return {
    title: job.title || jobBlock.title || "",
    company: job.company || jobBlock.company || "",
    location: job.location || jobBlock.location || jobBlock.location_hint || "",
    location_hint: job.location_hint || jobBlock.location_hint || jobBlock.location || "",
    job_url: job.job_url || jobBlock.job_url || meta.url || "",
    source_platform: job.source_platform || jobBlock.source_platform || meta.platform || "",
    confidence: job.confidence ?? jobBlock.confidence ?? meta.confidence ?? 0,
    raw_job_text_hash: job.raw_job_text_hash || job.raw_text_hash || rawTextHash,
    raw_text_hash: job.raw_text_hash || jobBlock.raw_text_hash || rawTextHash,
    extracted_preview: extractedPreview,
    role_hint: job.role_hint || jobBlock.role || jobBlock.title || "",
    employment_type: job.employment_type || jobBlock.employment_type || "",
    seniority: job.seniority || jobBlock.seniority || ""
  };
}

function normalizeJdRubric(rubric = {}, analysis = {}, explainability = {}) {
  const normalizedRequirements = Array.isArray(rubric?.requirements) && rubric.requirements.length
    ? normalizeRequirementList(rubric.requirements)
    : buildRubricFromV2Requirements(normalizeRequirements(explainability?.requirements, analysis));
  const top_keywords = Array.isArray(rubric?.top_keywords) && rubric.top_keywords.length ? rubric.top_keywords : analysis?.top_keywords || [];
  return {
    top_keywords: (top_keywords || []).filter(Boolean),
    requirements: normalizedRequirements
  };
}

function normalizeSelectionExplainability(explainability = {}) {
  const selectionPlanRef = explainability.selection_plan_ref || {};
  const selection_plan_ref = {
    file: selectionPlanRef.file || "selection_plan.json",
    hash: selectionPlanRef.hash || selectionPlanRef.selection_plan_hash || ""
  };
  const included_bullets = Array.isArray(explainability.included_bullets)
    ? explainability.included_bullets
        .map((entry) => ({
          bullet_id: entry?.bullet_id || "",
          parent_type: entry?.parent_type || "",
          parent_id: entry?.parent_id || "",
          original_text: entry?.original_text || "",
          rewritten_text: entry?.rewritten_text || entry?.after_text || ""
        }))
        .filter((b) => b.bullet_id)
    : [];
  const dropped_bullets = Array.isArray(explainability.dropped_bullets)
    ? explainability.dropped_bullets
        .map((entry) => ({
          bullet_id: entry?.bullet_id || "",
          parent_type: entry?.parent_type || "",
          parent_id: entry?.parent_id || "",
          reason: entry?.reason || entry?.drop_reason || ""
        }))
        .filter((b) => b.bullet_id)
    : [];
  const rewrite_summary = Array.isArray(explainability.rewrite_summary)
    ? explainability.rewrite_summary
        .map((entry) => ({
          bullet_id: entry?.bullet_id || "",
          rewrite_type: entry?.rewrite_type || entry?.rewrite || "light",
          keywords_inserted: Array.isArray(entry?.keywords_inserted) ? entry.keywords_inserted : []
        }))
        .filter((r) => r.bullet_id)
    : [];
  return { selection_plan_ref, included_bullets, dropped_bullets, rewrite_summary };
}

function normalizeRequirementList(requirements = []) {
  return (requirements || [])
    .map((req, idx) => {
      if (!req) return null;
      const text = req.text || req.requirement || "";
      if (!text) return null;
      return {
        req_id: req.req_id || `req_${idx + 1}`,
        text,
        type: req.type === "nice" ? "nice" : "must",
        weight: typeof req.weight === "number" ? req.weight : 1,
        jd_snippet: req.jd_snippet || ""
      };
    })
    .filter(Boolean);
}

function buildRubricFromV2Requirements(requirements = {}) {
  const list = [];
  (requirements.must_have || []).forEach((req, idx) => {
    list.push({
      req_id: req.req_id || `req_m_${idx + 1}`,
      text: req.text || req.requirement || "",
      type: "must",
      weight: 1,
      jd_snippet: req.jd_snippet || ""
    });
  });
  (requirements.nice_to_have || []).forEach((req, idx) => {
    list.push({
      req_id: req.req_id || `req_n_${idx + 1}`,
      text: req.text || req.requirement || "",
      type: "nice",
      weight: 1,
      jd_snippet: req.jd_snippet || ""
    });
  });
  return list.filter((r) => r.text);
}

function normalizeEvidenceIndex(evidenceIndex, finalResume) {
  if (Array.isArray(evidenceIndex) && evidenceIndex.length) {
    return evidenceIndex.map((ev, idx) => ({
      bullet_id: ev?.bullet_id || `evidence_${idx + 1}`,
      parent_type: ev?.parent_type || "experience",
      parent_id: ev?.parent_id || "",
      original_text: ev?.original_text || "",
      detected_skills_tools: ev?.detected_skills_tools || [],
      has_metric: typeof ev?.has_metric === "boolean" ? ev.has_metric : /\d/.test(ev?.original_text || "")
    }));
  }
  return deriveEvidenceIndex(finalResume);
}

function deriveEvidenceIndex(finalResume = {}) {
  const evidence = [];
  const work = finalResume.work_experience || [];
  const projects = finalResume.projects || [];
  work.forEach((entry, idx) => {
    const bullets = entry?.bullets || [];
    const ids = buildBulletIds(entry.id || `role_${idx + 1}`, entry.bullet_ids, bullets);
    bullets.forEach((text, bIdx) => {
      evidence.push({
        bullet_id: ids[bIdx],
        parent_type: "experience",
        parent_id: entry.id || `role_${idx + 1}`,
        original_text: text,
        detected_skills_tools: [],
        has_metric: /\d/.test(text || "")
      });
    });
  });
  projects.forEach((entry, idx) => {
    const bullets = entry?.bullets || [];
    const ids = buildBulletIds(entry.id || `project_${idx + 1}`, entry.bullet_ids, bullets);
    bullets.forEach((text, bIdx) => {
      evidence.push({
        bullet_id: ids[bIdx],
        parent_type: "project",
        parent_id: entry.id || `project_${idx + 1}`,
        original_text: text,
        detected_skills_tools: [],
        has_metric: /\d/.test(text || "")
      });
    });
  });
  return evidence;
}

function normalizeChangesV3(changes = {}, finalResume, masterResume, fallbackKeywords = []) {
  const baselineWork = masterResume?.work_experience || masterResume?.experience || [];
  const baselineProjects = masterResume?.projects || [];
  const experience = normalizeChangeDiffList(changes.experience, finalResume?.work_experience, baselineWork, "role_id");
  const projects = normalizeChangeDiffList(changes.projects, finalResume?.projects, baselineProjects, "project_id");
  const keyword_insertions =
    Array.isArray(changes.keyword_insertions) && changes.keyword_insertions.length
      ? changes.keyword_insertions.map((entry) => ({ bullet_id: entry.bullet_id || "", keywords: entry.keywords || [] }))
      : deriveKeywordInsertionsFromUpdatedBullets({ experience, projects }, fallbackKeywords);
  return { experience, projects, keyword_insertions };
}

function normalizeChangeDiffList(entries, finalList, baselineList, idKey) {
  const provided = Array.isArray(entries) ? entries : [];
  if (provided.length) {
    return provided.map((entry, idx) => normalizeChangeDiffEntry(entry, finalList, baselineList, idKey, idx));
  }
  return buildFallbackChangeDiffs(finalList, baselineList, idKey);
}

function normalizeChangeDiffEntry(entry, finalList, baselineList, idKey, idx) {
  const ownerId = entry?.[idKey] || entry?.id || `${idKey}_${idx + 1}`;
  const baseline = findBaseline(baselineList, ownerId, idx);
  const final = findBaseline(finalList, ownerId, idx);
  const updated_bullets = Array.isArray(entry?.updated_bullets) && entry.updated_bullets.length
    ? entry.updated_bullets.map((b, bIdx) => ({
        bullet_id: b?.bullet_id || `${ownerId}_b${bIdx + 1}`,
        before_text: b?.before_text ?? ((baseline?.bullets || baseline?.target_bullets || [])[bIdx] || ""),
        after_text: b?.after_text ?? ((final?.bullets || [])[bIdx] || "")
      }))
    : buildUpdatedBullets(baseline?.bullets || baseline?.target_bullets || [], final?.bullets || [], ownerId);
  return {
    [idKey]: ownerId,
    updated_bullets
  };
}

function buildFallbackChangeDiffs(finalList = [], baselineList = [], idKey) {
  return (finalList || []).map((entry, idx) => {
    const ownerId = entry?.id || `${idKey}_${idx + 1}`;
    const baseline = findBaseline(baselineList, ownerId, idx);
    return {
      [idKey]: ownerId,
      updated_bullets: buildUpdatedBullets(baseline?.bullets || baseline?.target_bullets || [], entry?.bullets || [], ownerId)
    };
  });
}

function buildUpdatedBullets(beforeBullets = [], afterBullets = [], ownerId = "item") {
  const max = Math.max(beforeBullets.length, afterBullets.length);
  const updates = [];
  for (let i = 0; i < max; i += 1) {
    updates.push({
      bullet_id: `${ownerId}_b${i + 1}`,
      before_text: beforeBullets[i] || "",
      after_text: afterBullets[i] || ""
    });
  }
  return updates;
}

function deriveKeywordInsertionsFromUpdatedBullets(changes = {}, fallbackKeywords = []) {
  const map = {};
  const collect = (entries = []) => {
    entries.forEach((entry) => {
      (entry.updated_bullets || []).forEach((b) => {
        if (!b?.bullet_id) return;
        map[b.bullet_id] = b.after_text || b.before_text || "";
      });
    });
  };
  collect(changes.experience);
  collect(changes.projects);
  const keywords = fallbackKeywords || [];
  return deriveKeywordInserts(map, keywords);
}

function normalizeMappingV3(mapping = {}, jd_rubric = {}, evidence_index = [], changes = {}) {
  const bullet_to_requirements = Array.isArray(mapping?.bullet_to_requirements)
    ? mapping.bullet_to_requirements.map((m) => ({
        bullet_id: m?.bullet_id || "",
        req_ids: m?.req_ids || [],
        match_type: m?.match_type || "direct"
      }))
    : [];
  const requirements = jd_rubric?.requirements || [];
  const requirement_to_evidence = Array.isArray(mapping?.requirement_to_evidence) && mapping.requirement_to_evidence.length
    ? mapping.requirement_to_evidence.map((entry) => ({
        req_id: entry?.req_id || "",
        missing_in_resume: Boolean(entry?.missing_in_resume),
        evidence: Array.isArray(entry?.evidence)
          ? entry.evidence.map((ev) => ({ bullet_id: ev?.bullet_id || "", match_type: ev?.match_type || "direct" }))
          : []
      }))
    : buildRequirementEvidence(requirements, bullet_to_requirements);
  const ensuredRequirementEvidence = requirement_to_evidence.map((entry) => {
    const missing = entry.evidence && entry.evidence.length > 0 ? false : true;
    return { ...entry, missing_in_resume: entry.missing_in_resume ?? missing };
  });
  return {
    requirement_to_evidence: ensuredRequirementEvidence,
    bullet_to_requirements
  };
}

function buildRequirementEvidence(requirements = [], bulletMappings = []) {
  const lookup = {};
  requirements.forEach((req) => {
    lookup[req.req_id] = { req_id: req.req_id, missing_in_resume: true, evidence: [] };
  });
  bulletMappings.forEach((map) => {
    (map.req_ids || []).forEach((reqId) => {
      if (!lookup[reqId]) {
        lookup[reqId] = { req_id: reqId, missing_in_resume: true, evidence: [] };
      }
      lookup[reqId].evidence.push({ bullet_id: map.bullet_id, match_type: map.match_type || "direct" });
      lookup[reqId].missing_in_resume = false;
    });
  });
  return Object.values(lookup);
}

function normalizeDiagnosticsV3(diagnostics = {}, mapping = {}, jd_rubric = {}) {
  const missingFromRequirements = (mapping?.requirement_to_evidence || [])
    .filter((entry) => entry?.missing_in_resume)
    .map((entry) => {
      const req = (jd_rubric.requirements || []).find((r) => r.req_id === entry.req_id);
      return req?.text || entry.req_id;
    });
  return {
    match_score_before: typeof diagnostics.match_score_before === "number" ? diagnostics.match_score_before : null,
    match_score_after: typeof diagnostics.match_score_after === "number" ? diagnostics.match_score_after : null,
    weak_bullets: Array.isArray(diagnostics.weak_bullets) ? diagnostics.weak_bullets : [],
    missing_skills_list: Array.isArray(diagnostics.missing_skills_list) ? diagnostics.missing_skills_list : missingFromRequirements
  };
}

function ensureGuardrailReportEmpty(report = {}) {
  const keys = ["unsupported_claims", "new_entities", "hallucinations", "safety_warnings"];
  const normalized = {};
  keys.forEach((key) => {
    normalized[key] = Array.isArray(report?.[key]) ? report[key] : [];
  });
  return normalized;
}

function upgradeLegacyTailored(parsed, jobPayload, masterResume, version) {
  const job = jobPayload?.job || {};
  const meta = jobPayload?.meta || {};
  const rawTextHash = hashString(job.description_text || "");
  const resume = parsed?.resume || {};
  const legacyExperience = resume.experience || [];
  const masterRoles = masterResume.work_experience || masterResume.experience || [];
  const masterProjects = masterResume.projects || [];

  const mapRoleId = (roleEntry = {}) => {
    const found = masterRoles.find(
      (r) =>
        r.role?.toLowerCase() === (roleEntry.role || "").toLowerCase() ||
        r.company?.toLowerCase() === (roleEntry.company || "").toLowerCase()
    );
    return found?.id || `legacy_role_${roleEntry.role || roleEntry.company || ""}` || "legacy_role";
  };

  const experience_updates = legacyExperience.map((exp, idx) => ({
    role_id: mapRoleId(exp) || `legacy_role_${idx + 1}`,
    target_bullets: Array.isArray(exp.bullets) ? exp.bullets : []
  }));

  const projects_updates = (resume.projects || []).map((proj, idx) => ({
    project_id: proj.id || `legacy_project_${idx + 1}`,
    target_bullets: Array.isArray(proj.bullets) ? proj.bullets : []
  }));

  return {
    version: version || CONFIG.promptsVersion,
    job: {
      title: job.title || "",
      company: job.company || "",
      location: job.location || "",
      source_platform: meta.platform || "",
      confidence: meta.confidence || 0,
      raw_text_hash: rawTextHash
    },
    analysis: {
      top_keywords: parsed?.changes?.keywords_added || [],
      must_have_requirements: [],
      nice_to_have_requirements: [],
      role_focus: job.title || "",
      gap_notes: parsed?.changes?.bullets_modified || []
    },
    resume_plan: {
      summary: resume.summary || "",
      core_skills: resume.skills?.core || [],
      experience_updates,
      projects_updates: projects_updates.length ? projects_updates : masterProjects.slice(0, 2).map((proj, idx) => ({
        project_id: proj.id || `legacy_project_${idx + 1}`,
        target_bullets: proj.bullets || []
      }))
    },
    quality: {
      ats_notes: [],
      risk_flags: []
    }
  };
}

function ensureFinalResume(parsed, masterResume) {
  if (parsed && !parsed.final_resume) {
    parsed.final_resume = sanitizeFinalResume(buildFinalResumeFromPlan(parsed, masterResume), masterResume);
  }
  if (parsed && parsed.final_resume) {
    parsed.final_resume = attachStableIds(sanitizeFinalResume(parsed.final_resume, masterResume), masterResume);
  }
  return parsed;
}

function buildFinalResumeFromPlan(parsed, masterResume) {
  const plan = parsed?.resume_plan || {};
  const summary = plan.summary || masterResume.summary || "";
  const skills = {
    programming_languages: masterResume.skills?.programming_languages || [],
    data_analysis_statistics: masterResume.skills?.data_science_analytics || [],
    machine_learning: masterResume.skills?.machine_learning_ai || [],
    data_viz_engineering: masterResume.skills?.frameworks_libraries || [],
    big_data_software: masterResume.skills?.tools_cloud_technologies || []
  };
  const work = (masterResume.work_experience || []).map((r, idx) => ({
    company: r.company || "",
    role: r.role || "",
    dates: r.dates || "",
    location: r.location || "",
    bullets: (plan.experience_updates?.find((u) => u.role_id === r.id)?.target_bullets || r.bullets || []).slice(0, 6),
    id: r.id || `role_${idx + 1}`
  }));
  const projects = (masterResume.projects || []).map((p, idx) => ({
    name: p.name || "",
    date: p.dates || "",
    keywords: p.tags || [],
    links: { github: (p.links || [])[0] || "", webapp: (p.links || [])[1] || "" },
    bullets: (plan.projects_updates?.find((u) => u.project_id === p.id)?.target_bullets || p.bullets || []).slice(0, 4),
    id: p.id || `project_${idx + 1}`
  }));
  const awards = (masterResume.awards || []).map((a) => ({
    name: a.name || "",
    issuer: a.issuer || "",
    year: a.year || "",
    details: a.details || ""
  }));
  return { summary, skills, work_experience: work, projects, awards };
}

function attachStableIds(finalResume, masterResume) {
  const baselineWork = masterResume?.work_experience || masterResume?.experience || [];
  const baselineProjects = masterResume?.projects || [];
  const work = (finalResume.work_experience || []).map((entry, idx) => {
    const matched = baselineWork.find((b) => matchesRole(entry, b));
    const id = entry.id || matched?.id || `role_${idx + 1}`;
    return { ...entry, id };
  });
  const projects = (finalResume.projects || []).map((entry, idx) => {
    const matched = baselineProjects.find((b) => matchesProject(entry, b));
    const id = entry.id || matched?.id || `project_${idx + 1}`;
    return { ...entry, id };
  });
  return { ...finalResume, work_experience: work, projects };
}

function sanitizeFinalResume(finalResume = {}, masterResume = {}) {
  const safeSkills = finalResume.skills || {};
  const skills = {
    programming_languages: safeSkills.programming_languages || masterResume.skills?.programming_languages || [],
    data_analysis_statistics: safeSkills.data_analysis_statistics || masterResume.skills?.data_science_analytics || [],
    machine_learning: safeSkills.machine_learning || masterResume.skills?.machine_learning_ai || [],
    data_viz_engineering: safeSkills.data_viz_engineering || masterResume.skills?.frameworks_libraries || [],
    big_data_software: safeSkills.big_data_software || masterResume.skills?.tools_cloud_technologies || []
  };
  Object.keys(skills).forEach((k) => {
    if (!Array.isArray(skills[k])) skills[k] = [];
  });

  const normalizeBullets = (list) => (Array.isArray(list) ? list : []).map((b) => (typeof b === "string" ? b : ""));

  const work = (finalResume.work_experience || []).map((entry, idx) => ({
    id: entry.id || `role_${idx + 1}`,
    company: entry.company || "",
    role: entry.role || "",
    dates: entry.dates || "",
    location: entry.location || "",
    bullets: normalizeBullets(entry.bullets)
  }));

  const projects = (finalResume.projects || []).map((entry, idx) => ({
    id: entry.id || `project_${idx + 1}`,
    name: entry.name || "",
    date: entry.date || entry.dates || "",
    keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
    links: {
      github: entry.links?.github || "",
      webapp: entry.links?.webapp || ""
    },
    bullets: normalizeBullets(entry.bullets)
  }));

  const awards = (finalResume.awards || []).map((a) => ({
    name: a?.name || "",
    issuer: a?.issuer || "",
    year: a?.year || "",
    details: a?.details || ""
  }));

  return {
    summary: finalResume.summary || masterResume.summary || "",
    skills,
    work_experience: work,
    projects,
    awards
  };
}

function matchesRole(candidate, baseline) {
  if (!candidate || !baseline) return false;
  return (
    (candidate.id && baseline.id && candidate.id === baseline.id) ||
    (candidate.role && baseline.role && candidate.role.toLowerCase() === baseline.role.toLowerCase()) ||
    (candidate.company && baseline.company && candidate.company.toLowerCase() === baseline.company.toLowerCase())
  );
}

function matchesProject(candidate, baseline) {
  if (!candidate || !baseline) return false;
  return (
    (candidate.id && baseline.id && candidate.id === baseline.id) ||
    (candidate.name && baseline.name && candidate.name.toLowerCase() === baseline.name.toLowerCase())
  );
}

function applyExplainabilityDefaults(parsed, jobPayload, masterResume) {
  if (!parsed) return parsed;
  const job = jobPayload?.job || {};
  const rawText = job.description_text || "";
  const preview = rawText.slice(0, 500);
  parsed.job = {
    ...(parsed.job || {}),
    extracted_preview: parsed.job?.extracted_preview || preview
  };

  const explain = parsed.explainability || {};
  const finalResume = parsed.final_resume || {};
  const baselineRef = explain.baseline_resume || {
    resume_id: masterResume?.id || "default",
    stored_at: "baseline_resume.json"
  };
  const requirements = normalizeRequirements(explain.requirements, parsed.analysis);
  const changes = normalizeChanges(explain.changes, finalResume, masterResume);
  const mappings = normalizeMappings(explain.mappings, changes, requirements, parsed.analysis);
  const jobPreview = explain.job_preview || {};
  const previewBlock = {
    extracted_preview: jobPreview.extracted_preview || preview,
    raw_text_hash: jobPreview.raw_text_hash || parsed.job?.raw_text_hash || hashString(rawText),
    warnings: jobPreview.warnings || []
  };

  parsed.explainability = {
    baseline_resume: baselineRef,
    job_preview: previewBlock,
    changes,
    requirements,
    mappings
  };
  return parsed;
}

function normalizeChanges(changes = {}, finalResume, masterResume) {
  const baselineWork = masterResume?.work_experience || masterResume?.experience || [];
  const baselineProjects = masterResume?.projects || [];
  const finalWork = finalResume?.work_experience || [];
  const finalProjects = finalResume?.projects || [];
  return {
    experience: normalizeChangeList(changes.experience, finalWork, baselineWork, "role_id", "exp"),
    projects: normalizeChangeList(changes.projects, finalProjects, baselineProjects, "project_id", "proj")
  };
}

function normalizeChangeList(existing, finalList, baselineList, idKey, fallbackPrefix) {
  const fromExisting = Array.isArray(existing) ? existing : [];
  if (fromExisting.length) {
    return fromExisting.map((entry, idx) => {
      const identifier = entry[idKey] || entry.id || `${fallbackPrefix}_${idx + 1}`;
      const baseline = findBaseline(baselineList, identifier, idx);
      const afterBullets = Array.isArray(entry.after_bullets) ? entry.after_bullets : findBullets(finalList, identifier, idx);
      const beforeBullets = Array.isArray(entry.before_bullets) ? entry.before_bullets : findBullets(baselineList, identifier, idx);
      const bulletIds = buildBulletIds(identifier, entry.bullet_ids, afterBullets);
      return {
        ...entry,
        [idKey]: identifier,
        before_bullets: beforeBullets,
        after_bullets: afterBullets,
        bullet_ids: bulletIds
      };
    });
  }
  return (finalList || []).map((entry, idx) => {
    const identifier = entry.id || entry[idKey] || `${fallbackPrefix}_${idx + 1}`;
    const baseline = findBaseline(baselineList, identifier, idx);
    const afterBullets = entry.bullets || [];
    const beforeBullets = baseline?.bullets || baseline?.target_bullets || [];
    return {
      [idKey]: identifier,
      before_bullets: beforeBullets,
      after_bullets: afterBullets,
      bullet_ids: buildBulletIds(identifier, null, afterBullets)
    };
  });
}

function normalizeRequirements(requirements = {}, analysis = {}) {
  const mapReqs = (list, prefix, fallbackList = []) => {
    const base = Array.isArray(list) && list.length ? list : fallbackList;
    return (base || [])
      .map((entry, idx) => {
        if (!entry) return null;
        if (typeof entry === "string") return { req_id: `${prefix}_${idx + 1}`, text: entry };
        if (typeof entry === "object") {
          const text = entry.text || entry.requirement || "";
          if (!text) return null;
          return { req_id: entry.req_id || `${prefix}_${idx + 1}`, text, match_type: entry.match_type };
        }
        return null;
      })
      .filter(Boolean);
  };
  return {
    must_have: mapReqs(requirements.must_have, "req_m", analysis.must_have_requirements),
    nice_to_have: mapReqs(requirements.nice_to_have, "req_n", analysis.nice_to_have_requirements)
  };
}

function normalizeMappings(mappings = {}, changes, requirements, analysis = {}) {
  const bulletToReq = Array.isArray(mappings.bullet_to_requirements) ? mappings.bullet_to_requirements : [];
  const keywordInserts = Array.isArray(mappings.keyword_inserts) ? mappings.keyword_inserts : [];
  const keywordSource = analysis?.top_keywords || [];
  const bulletTextMap = buildBulletTextMap(changes);

  const ensuredKeywordInserts =
    keywordInserts.length > 0 ? keywordInserts.map((m) => ({ ...m, keywords: m.keywords || [] })) : deriveKeywordInserts(bulletTextMap, keywordSource);

  const ensuredBulletToReq = bulletToReq.map((m) => ({
    bullet_id: m.bullet_id,
    req_ids: m.req_ids || [],
    match_type: m.match_type || "direct"
  }));

  return {
    bullet_to_requirements: ensuredBulletToReq,
    keyword_inserts: ensuredKeywordInserts
  };
}

function buildBulletTextMap(changes = {}) {
  const map = {};
  const addEntries = (entries = []) => {
    entries.forEach((entry) => {
      const bullets = entry.after_bullets || [];
      const ids = buildBulletIds(entry.role_id || entry.project_id, entry.bullet_ids, bullets);
      ids.forEach((id, idx) => {
        map[id] = bullets[idx] || "";
      });
    });
  };
  addEntries(changes.experience);
  addEntries(changes.projects);
  return map;
}

function deriveKeywordInserts(bulletMap, keywords = []) {
  if (!keywords || !keywords.length) return [];
  const inserts = [];
  Object.entries(bulletMap || {}).forEach(([bulletId, text]) => {
    const matched = keywords.filter((kw) => kw && text.toLowerCase().includes(kw.toLowerCase()));
    if (matched.length) {
      inserts.push({ bullet_id: bulletId, keywords: Array.from(new Set(matched)) });
    }
  });
  return inserts;
}

function findBaseline(baselineList, identifier, idx) {
  if (!Array.isArray(baselineList)) return null;
  const direct = baselineList.find((entry) => entry.id === identifier);
  if (direct) return direct;
  return baselineList[idx] || null;
}

function findBullets(list, identifier, idx) {
  const fallback = Array.isArray(list) ? list[idx] : null;
  if (!Array.isArray(list)) return [];
  const entry = list.find((item) => item.id === identifier || item.role_id === identifier || item.project_id === identifier) || fallback;
  return entry?.bullets || entry?.target_bullets || [];
}

function buildBulletIds(ownerId, providedIds, bullets = []) {
  if (Array.isArray(providedIds) && providedIds.length === bullets.length) {
    return providedIds;
  }
  return bullets.map((_, idx) => `${ownerId || "item"}_b${idx + 1}`);
}

function ensureArrayOfStrings(value, pathLabel, errors, allowUndefined = false) {
  if (value === undefined) {
    if (allowUndefined) return;
    errors.push(`Missing array: ${pathLabel}`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be array`);
    return;
  }
  const invalid = value.filter((v) => typeof v !== "string");
  if (invalid.length) errors.push(`${pathLabel} must contain only strings`);
}

function ensureUpdates(value, pathLabel, idKey, errors) {
  if (value === undefined) {
    errors.push(`Missing array: ${pathLabel}`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be array`);
    return;
  }
  value.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${pathLabel}[${idx}] must be object`);
      return;
    }
    if (typeof entry[idKey] !== "string") errors.push(`${pathLabel}[${idx}].${idKey} must be string`);
    ensureArrayOfStrings(entry.target_bullets, `${pathLabel}[${idx}].target_bullets`, errors);
  });
}

function validateChangeEntries(value, pathLabel, idKey, errors) {
  if (value === undefined) {
    errors.push(`Missing array: ${pathLabel}`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be array`);
    return;
  }
  value.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${pathLabel}[${idx}] must be object`);
      return;
    }
    if (typeof entry[idKey] !== "string") errors.push(`${pathLabel}[${idx}].${idKey} must be string`);
    ensureArrayOfStrings(entry.before_bullets, `${pathLabel}[${idx}].before_bullets`, errors);
    ensureArrayOfStrings(entry.after_bullets, `${pathLabel}[${idx}].after_bullets`, errors);
    ensureArrayOfStrings(entry.bullet_ids, `${pathLabel}[${idx}].bullet_ids`, errors);
  });
}

function validateChangeDiffs(value, pathLabel, idKey, errors) {
  if (value === undefined) {
    errors.push(`Missing array: ${pathLabel}`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be array`);
    return;
  }
  value.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${pathLabel}[${idx}] must be object`);
      return;
    }
    if (typeof entry[idKey] !== "string") errors.push(`${pathLabel}[${idx}].${idKey} must be string`);
    const bullets = entry.updated_bullets;
    if (!Array.isArray(bullets)) {
      errors.push(`${pathLabel}[${idx}].updated_bullets must be array`);
      return;
    }
    bullets.forEach((b, bIdx) => {
      if (!b || typeof b !== "object") {
        errors.push(`${pathLabel}[${idx}].updated_bullets[${bIdx}] must be object`);
        return;
      }
      if (typeof b.bullet_id !== "string") errors.push(`${pathLabel}[${idx}].updated_bullets[${bIdx}].bullet_id must be string`);
      if (typeof b.before_text !== "string") errors.push(`${pathLabel}[${idx}].updated_bullets[${bIdx}].before_text must be string`);
      if (typeof b.after_text !== "string") errors.push(`${pathLabel}[${idx}].updated_bullets[${bIdx}].after_text must be string`);
    });
  });
}

function validateRequirements(value, pathLabel, errors) {
  if (value === undefined) {
    errors.push(`Missing array: ${pathLabel}`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be array`);
    return;
  }
  value.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${pathLabel}[${idx}] must be object`);
      return;
    }
    if (typeof entry.req_id !== "string") errors.push(`${pathLabel}[${idx}].req_id must be string`);
    if (typeof entry.text !== "string") errors.push(`${pathLabel}[${idx}].text must be string`);
    if (entry.match_type !== undefined && typeof entry.match_type !== "string") {
      errors.push(`${pathLabel}[${idx}].match_type must be string when provided`);
    }
  });
}

function validateBulletMappings(value, pathLabel, errors) {
  if (value === undefined) {
    errors.push(`Missing array: ${pathLabel}`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be array`);
    return;
  }
  value.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${pathLabel}[${idx}] must be object`);
      return;
    }
    if (typeof entry.bullet_id !== "string") errors.push(`${pathLabel}[${idx}].bullet_id must be string`);
    ensureArrayOfStrings(entry.req_ids, `${pathLabel}[${idx}].req_ids`, errors);
    if (entry.match_type !== undefined && typeof entry.match_type !== "string") {
      errors.push(`${pathLabel}[${idx}].match_type must be string when provided`);
    }
  });
}

function validateKeywordInserts(value, pathLabel, errors, allowUndefined = false) {
  if (value === undefined) {
    if (allowUndefined) return;
    errors.push(`Missing array: ${pathLabel}`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${pathLabel} must be array`);
    return;
  }
  value.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      errors.push(`${pathLabel}[${idx}] must be object`);
      return;
    }
    if (typeof entry.bullet_id !== "string") errors.push(`${pathLabel}[${idx}].bullet_id must be string`);
    ensureArrayOfStrings(entry.keywords, `${pathLabel}[${idx}].keywords`, errors);
  });
}

function validateFinalResume(finalResume, errors) {
  if (!finalResume || typeof finalResume !== "object") {
    errors.push("final_resume must be object");
    return;
  }
  if (typeof finalResume.summary !== "string") errors.push("final_resume.summary must be string");
  const skills = finalResume.skills || {};
  const skillKeys = [
    "programming_languages",
    "data_analysis_statistics",
    "machine_learning",
    "data_viz_engineering",
    "big_data_software"
  ];
  skillKeys.forEach((k) => ensureArrayOfStrings(skills[k], `final_resume.skills.${k}`, errors));

  const work = finalResume.work_experience || [];
  if (!Array.isArray(work)) {
    errors.push("final_resume.work_experience must be array");
  } else {
    work.forEach((w, idx) => {
      if (!w || typeof w !== "object") {
        errors.push(`final_resume.work_experience[${idx}] must be object`);
        return;
      }
      ["company", "role", "dates", "location"].forEach((k) => {
        if (typeof w[k] !== "string") errors.push(`final_resume.work_experience[${idx}].${k} must be string`);
      });
      ensureArrayOfStrings(w.bullets, `final_resume.work_experience[${idx}].bullets`, errors);
    });
  }

  const projects = finalResume.projects || [];
  if (!Array.isArray(projects)) {
    errors.push("final_resume.projects must be array");
  } else {
    projects.forEach((p, idx) => {
      if (!p || typeof p !== "object") {
        errors.push(`final_resume.projects[${idx}] must be object`);
        return;
      }
      ["name", "date"].forEach((k) => {
        if (typeof p[k] !== "string") errors.push(`final_resume.projects[${idx}].${k} must be string`);
      });
      ensureArrayOfStrings(p.keywords, `final_resume.projects[${idx}].keywords`, errors);
      ensureArrayOfStrings(p.bullets, `final_resume.projects[${idx}].bullets`, errors);
    });
  }

  const awards = finalResume.awards || [];
  if (!Array.isArray(awards)) {
    errors.push("final_resume.awards must be array");
  } else {
    awards.forEach((a, idx) => {
      if (!a || typeof a !== "object") {
        errors.push(`final_resume.awards[${idx}] must be object`);
        return;
      }
      ["name", "issuer", "year", "details"].forEach((k) => {
        if (typeof a[k] !== "string") errors.push(`final_resume.awards[${idx}].${k} must be string`);
      });
    });
  }
}

async function repairRubricJson(originalText, prompt, errors, userPayload) {
  const repairUser = [
    "Prior response was invalid JSON for the required schema.",
    "Return corrected JSON only; no commentary.",
    "Schema:",
    JSON.stringify(JD_RUBRIC_SCHEMA_V1, null, 2),
    "Errors:",
    (errors || []).join("; "),
    "Original output:",
    originalText,
    "User payload:",
    JSON.stringify(userPayload || {}, null, 2)
  ].join("\n");
  const messages = [
    { role: "system", content: `${prompt.content}\nReturn valid JSON only.` },
    { role: "user", content: repairUser }
  ];
  const response = await openai.chat.completions.create({
    model: CONFIG.rubricModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages
  });
  return response.choices[0].message.content || "";
}

async function repairTailoredJson(originalText, builder, errors) {
  const repairUser = [
    "Prior response was invalid JSON for the required schema.",
    "Return corrected JSON only; do not add new claims, employers, titles, dates, or tools beyond what was already provided.",
    "Schema:",
    JSON.stringify(getTailoredSchemaExample(builder?.schemaVersion), null, 2),
    "Errors:",
    (errors || []).join("; "),
    "Original output:",
    originalText
  ].join("\n");
  const messages = [
    { role: "system", content: `${builder.system}\nReturn valid JSON only. Guardrail arrays must be empty.` },
    { role: "user", content: repairUser }
  ];
  const response = await openai.chat.completions.create({
    model: CONFIG.tailorModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages
  });
  return response.choices[0].message.content || "";
}

function collectPlanBullets(selectionPlan = {}) {
  const bulletMap = {};
  const allowedIds = new Set();
  const roles = selectionPlan?.selected?.work_experience || [];
  const projects = selectionPlan?.selected?.projects || [];
  roles.forEach((role) => {
    (role?.bullets || []).forEach((b) => {
      if (!b?.bullet_id) return;
      allowedIds.add(b.bullet_id);
      bulletMap[b.bullet_id] = {
        ...b,
        parent_type: "experience",
        parent_id: role.role_id,
        company: role.company,
        title: role.title,
        date_range: role.date_range
      };
    });
  });
  projects.forEach((project) => {
    (project?.bullets || []).forEach((b) => {
      if (!b?.bullet_id) return;
      allowedIds.add(b.bullet_id);
      bulletMap[b.bullet_id] = {
        ...b,
        parent_type: "project",
        parent_id: project.project_id,
        project_name: project.name,
        date: project.date
      };
    });
  });
  return {
    bulletMap,
    allowedIds,
    roles,
    projects,
    awards: selectionPlan?.selected?.awards || [],
    budgets: selectionPlan?.config?.budgets || {}
  };
}

function buildRewriteLookup(tailored = {}) {
  const map = new Map();
  const add = (entries) => {
    (entries || []).forEach((entry) => {
      (entry?.updated_bullets || []).forEach((b) => {
        if (b?.bullet_id) {
          const afterText = typeof b.after_text === "string" ? b.after_text : "";
          map.set(b.bullet_id, afterText.trim());
        }
      });
    });
  };
  add(tailored?.changes?.experience);
  add(tailored?.changes?.projects);
  return map;
}

function buildKeywordLookup(tailored = {}) {
  const map = new Map();
  (tailored?.changes?.keyword_insertions || []).forEach((entry) => {
    if (entry?.bullet_id) {
      map.set(entry.bullet_id, (entry.keywords || []).filter(Boolean));
    }
  });
  return map;
}

function findRoleById(resume = {}, roleId) {
  return (resume.work_experience || resume.experience || []).find((role) => role.id === roleId) || null;
}

function findProjectById(resume = {}, projectId) {
  return (resume.projects || []).find((proj) => proj.id === projectId) || null;
}

function applyBulletLengthLimit(text = "", maxWords = 25, counters) {
  const trimmed = (text || "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return trimmed;

  const endWithPeriod = (textToClose) => {
    const candidate = textToClose.trim();
    if (!candidate.length) return candidate;
    return /[.!?]$/.test(candidate) ? candidate : `${candidate}.`;
  };

  // First try to keep the first sentence if it fits.
  const sentenceBreak = trimmed.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
  if (sentenceBreak.length) {
    const firstSentenceWords = sentenceBreak[0].split(/\s+/).filter(Boolean);
    if (firstSentenceWords.length > 0 && firstSentenceWords.length <= maxWords) {
      if (counters) counters.truncated = (counters.truncated || 0) + 1;
      return endWithPeriod(firstSentenceWords.join(" "));
    }
  }

  // Next try to keep clauses before the last comma within limit.
  const clauses = trimmed.split(/[,;](?![^()]*\))/).map((c) => c.trim()).filter(Boolean);
  if (clauses.length > 1) {
    const kept = [];
    let total = 0;
    for (const clause of clauses) {
      const clauseWords = clause.split(/\s+/).filter(Boolean);
      if (total + clauseWords.length > maxWords) break;
      kept.push(clause);
      total += clauseWords.length;
    }
    if (kept.length) {
      if (counters) counters.truncated = (counters.truncated || 0) + 1;
      return endWithPeriod(kept.join(", "));
    }
  }

  // Fallback: hard trim to maxWords but drop trailing connectors.
  if (counters) counters.truncated = (counters.truncated || 0) + 1;
  const stopTrailing = new Set([
    "and",
    "or",
    "that",
    "with",
    "to",
    "by",
    "for",
    "of",
    "in",
    "on",
    "at",
    "from",
    "using",
    "through",
    "while",
    "which",
    "who",
    "where",
    "when",
    "via",
    "leveraging"
  ]);
  let slice = words.slice(0, maxWords);
  while (slice.length && stopTrailing.has(slice[slice.length - 1].toLowerCase())) {
    slice.pop();
  }
  if (!slice.length) slice = words.slice(0, Math.min(5, words.length));
  return endWithPeriod(slice.join(" "));
}

function applyWordLimitToFinalResume(finalResume = {}, maxWords = 25) {
  const clampList = (entries) =>
    (entries || []).map((entry) => ({
      ...entry,
      bullets: (entry?.bullets || []).map((b) => applyBulletLengthLimit(b || "", maxWords))
    }));
  return {
    ...finalResume,
    work_experience: clampList(finalResume?.work_experience),
    projects: clampList(finalResume?.projects)
  };
}

function classifyRewriteStrength(originalText = "", rewrittenText = "") {
  if (!originalText) return "light";
  if (!rewrittenText || rewrittenText.trim() === originalText.trim()) return "light";
  const origWords = originalText.trim().split(/\s+/).length;
  const rewrittenWords = rewrittenText.trim().split(/\s+/).length;
  const delta = Math.abs(rewrittenWords - origWords);
  return delta > 6 ? "heavy" : "light";
}

function clampSkillsToMaster(finalSkills = {}, masterResume = {}) {
  const allowed = {
    programming_languages: masterResume.skills?.programming_languages || [],
    data_analysis_statistics: masterResume.skills?.data_analysis_statistics || masterResume.skills?.data_science_analytics || [],
    machine_learning: masterResume.skills?.machine_learning || masterResume.skills?.machine_learning_ai || [],
    data_viz_engineering: masterResume.skills?.data_viz_engineering || masterResume.skills?.frameworks_libraries || [],
    big_data_software: masterResume.skills?.big_data_software || masterResume.skills?.tools_cloud_technologies || []
  };
  const intersect = (list, allowedList) => {
    if (!Array.isArray(allowedList) || !allowedList.length) return Array.isArray(list) ? list : [];
    return (Array.isArray(list) ? list : []).filter((item) => allowedList.includes(item));
  };
  return {
    programming_languages: intersect(finalSkills.programming_languages, allowed.programming_languages),
    data_analysis_statistics: intersect(finalSkills.data_analysis_statistics, allowed.data_analysis_statistics),
    machine_learning: intersect(finalSkills.machine_learning, allowed.machine_learning),
    data_viz_engineering: intersect(finalSkills.data_viz_engineering, allowed.data_viz_engineering),
    big_data_software: intersect(finalSkills.big_data_software, allowed.big_data_software)
  };
}

function buildAwardsFromPlan(planAwards = [], masterAwards = []) {
  const allowed = new Set(planAwards.filter((a) => a && a.include !== false).map((a) => a.award_id || a.id || a.name || a.title));
  if (!allowed.size) return [];
  return (masterAwards || []).filter((award) => {
    const key = award?.id || award?.name || award?.title;
    return key && allowed.has(key);
  });
}

function estimateResumeWordCount(finalResume = {}) {
  const countWords = (text) => (text || "").trim().split(/\s+/).filter(Boolean).length;
  let total = countWords(finalResume.summary);
  Object.values(finalResume.skills || {}).forEach((list) => {
    (list || []).forEach((item) => {
      total += countWords(item);
    });
  });
  (finalResume.work_experience || []).forEach((role) => {
    (role?.bullets || []).forEach((b) => {
      total += countWords(b);
    });
  });
  (finalResume.projects || []).forEach((proj) => {
    (proj?.bullets || []).forEach((b) => {
      total += countWords(b);
    });
  });
  (finalResume.awards || []).forEach((award) => {
    total += countWords(award?.details || "");
  });
  return total;
}

function gatherOutputBulletIds(tailored = {}) {
  const ids = new Set();
  const addFromChanges = (entries) => {
    (entries || []).forEach((entry) => {
      (entry?.updated_bullets || []).forEach((b) => {
        if (b?.bullet_id) ids.add(b.bullet_id);
      });
    });
  };
  addFromChanges(tailored?.changes?.experience);
  addFromChanges(tailored?.changes?.projects);
  (tailored?.changes?.keyword_insertions || []).forEach((entry) => entry?.bullet_id && ids.add(entry.bullet_id));
  (tailored?.mapping?.bullet_to_requirements || []).forEach((entry) => entry?.bullet_id && ids.add(entry.bullet_id));
  (tailored?.mapping?.requirement_to_evidence || []).forEach((entry) => {
    (entry?.evidence || []).forEach((ev) => ev?.bullet_id && ids.add(ev.bullet_id));
  });
  return ids;
}

function enforceSelectionPlanCompliance(tailored, selectionPlan, masterResume, baselineResume = masterResume, options = {}) {
  if (!selectionPlan || typeof selectionPlan !== "object") {
    throw new StageError("Selection plan missing for enforcement", "selection_enforcement");
  }
  const selectionIndex = collectPlanBullets(selectionPlan);
  if (!selectionIndex.allowedIds.size) {
    throw new StageError("Selection plan has no selected bullets to render", "selection_enforcement");
  }
  const selectionPlanHash =
    options.selectionPlanHash || `sha256:${hashString(JSON.stringify(selectionPlan || {}))}`;
  const rewriteLookup = buildRewriteLookup(tailored);
  const keywordLookup = buildKeywordLookup(tailored);
  const validReqIds = new Set(
    ((options.jdRubric?.requirements || tailored?.jd_rubric?.requirements || []) || [])
      .map((r) => r?.req_id)
      .filter(Boolean)
  );
  const enforcementCounters = { truncated: 0 };
  const includedBullets = [];
  const rewriteSummary = [];
  const rewrittenById = new Map();

  const buildBulletText = (bullet) => {
    const candidate = rewriteLookup.get(bullet.bullet_id) || "";
    const base = candidate.trim() || (bullet.original_text || "");
    const finalText = applyBulletLengthLimit(base, 25, enforcementCounters);
    rewrittenById.set(bullet.bullet_id, finalText);
    includedBullets.push({
      bullet_id: bullet.bullet_id,
      parent_type: bullet.parent_type,
      parent_id: bullet.parent_id,
      original_text: bullet.original_text || "",
      rewritten_text: finalText
    });
    rewriteSummary.push({
      bullet_id: bullet.bullet_id,
      rewrite_type: classifyRewriteStrength(bullet.original_text, finalText),
      keywords_inserted: keywordLookup.get(bullet.bullet_id) || []
    });
    return finalText;
  };

  const workExperience = (selectionIndex.roles || []).map((role) => {
    const baselineRole = findRoleById(baselineResume, role.role_id) || findRoleById(masterResume, role.role_id) || {};
    const bullets = (role?.bullets || []).map((b) => {
      const withParent = selectionIndex.bulletMap[b.bullet_id] || { ...b, parent_type: "experience", parent_id: role.role_id };
      return buildBulletText(withParent);
    });
    return {
      id: role.role_id,
      company: baselineRole.company || role.company || "",
      role: baselineRole.role || role.title || "",
      dates: baselineRole.dates || role.date_range || "",
      location: baselineRole.location || "",
      bullets
    };
  });

  const projects = (selectionIndex.projects || []).map((project) => {
    const baselineProject = findProjectById(baselineResume, project.project_id) || findProjectById(masterResume, project.project_id) || {};
    const bullets = (project?.bullets || []).map((b) => {
      const withParent = selectionIndex.bulletMap[b.bullet_id] || { ...b, parent_type: "project", parent_id: project.project_id };
      return buildBulletText(withParent);
    });
    return {
      id: project.project_id,
      name: baselineProject.name || project.name || "",
      date: baselineProject.date || baselineProject.dates || project.date || "",
      keywords: Array.isArray(baselineProject.keywords) ? baselineProject.keywords : [],
      links: {
        github: baselineProject.links?.github || "",
        webapp: baselineProject.links?.webapp || ""
      },
      bullets
    };
  });

  const awardList = buildAwardsFromPlan(selectionIndex.awards, baselineResume?.awards || masterResume?.awards);
  const skills = clampSkillsToMaster(tailored?.final_resume?.skills || {}, baselineResume || masterResume);
  const finalResume = attachStableIds(
    sanitizeFinalResume(
      {
        ...(tailored.final_resume || {}),
        summary: (tailored?.final_resume?.summary || masterResume.summary || "").trim(),
        skills,
        work_experience: workExperience,
        projects,
        awards: awardList
      },
      baselineResume || masterResume
    ),
    baselineResume || masterResume
  );

  const changes = {
    experience: (selectionIndex.roles || []).map((role) => ({
      role_id: role.role_id,
      updated_bullets: (role?.bullets || []).map((b, idx) => ({
        bullet_id: b.bullet_id,
        before_text: b.original_text || selectionIndex.bulletMap[b.bullet_id]?.original_text || "",
        after_text: rewrittenById.get(b.bullet_id) || b.original_text || "",
        order: idx
      }))
    })),
    projects: (selectionIndex.projects || []).map((project) => ({
      project_id: project.project_id,
      updated_bullets: (project?.bullets || []).map((b, idx) => ({
        bullet_id: b.bullet_id,
        before_text: b.original_text || selectionIndex.bulletMap[b.bullet_id]?.original_text || "",
        after_text: rewrittenById.get(b.bullet_id) || b.original_text || "",
        order: idx
      }))
    })),
    keyword_insertions: Array.from(keywordLookup.entries())
      .filter(([bulletId]) => selectionIndex.allowedIds.has(bulletId))
      .map(([bulletId, keywords]) => ({ bullet_id: bulletId, keywords }))
  };

  const mapping = {
    requirement_to_evidence: (tailored?.mapping?.requirement_to_evidence || [])
      .map((entry) => ({
        req_id: entry?.req_id || "",
        missing_in_resume: !!entry?.missing_in_resume,
        evidence: (entry?.evidence || [])
          .filter((ev) => selectionIndex.allowedIds.has(ev?.bullet_id))
          .map((ev) => ({
            bullet_id: ev?.bullet_id || "",
            match_type: ev?.match_type || "direct"
          }))
      }))
      .filter((entry) => entry.req_id && validReqIds.has(entry.req_id)),
    bullet_to_requirements: (tailored?.mapping?.bullet_to_requirements || [])
      .filter((entry) => selectionIndex.allowedIds.has(entry?.bullet_id))
      .map((entry) => ({
        bullet_id: entry?.bullet_id || "",
        req_ids: (entry?.req_ids || []).filter((req) => validReqIds.has(req)),
        match_type: entry?.match_type || "direct"
      }))
  };

  const evidence_index = Array.from(selectionIndex.allowedIds).map((bulletId) => {
    const b = selectionIndex.bulletMap[bulletId] || {};
    return {
      bullet_id: bulletId,
      parent_type: b.parent_type || "",
      parent_id: b.parent_id || "",
      original_text: b.original_text || "",
      detected_skills_tools: [],
      has_metric: /\d/.test(b.original_text || "")
    };
  });

  const dropped_bullets = [];
  const addDrop = (id, reason) => {
    if (!id || selectionIndex.allowedIds.has(id)) return;
    dropped_bullets.push({ bullet_id: id, reason });
  };
  (selectionPlan?.selection_notes?.dropped_due_to_redundancy || []).forEach((id) => addDrop(id, "redundancy_drop"));
  (selectionPlan?.selection_notes?.dropped_due_to_budget || []).forEach((id) => addDrop(id, "budget_drop"));

  const explainability = {
    selection_plan_ref: { file: "selection_plan.json", hash: selectionPlanHash },
    included_bullets: includedBullets,
    dropped_bullets,
    rewrite_summary: rewriteSummary
  };

  const unselectedInOutput = Array.from(gatherOutputBulletIds(tailored)).filter(
    (id) => !selectionIndex.allowedIds.has(id)
  );
  const includedIds = new Set(includedBullets.map((b) => b.bullet_id));
  const compliant = selectionIndex.allowedIds.size === includedIds.size && unselectedInOutput.length === 0;
  const wordCountEstimate = estimateResumeWordCount(finalResume);
  const proxyLimit = selectionIndex.budgets?.target_resume_words_max;
  const meta = {
    stripped_unselected: unselectedInOutput.length,
    truncated_bullets: enforcementCounters.truncated,
    repair_applied: true,
    compliant,
    proxy_word_count_exceeded: !!(proxyLimit && wordCountEstimate > proxyLimit)
  };

  return {
    output: {
      ...tailored,
      version: isV4Version(tailored?.version) ? tailored.version : TAILORED_SCHEMA_EXAMPLE_V4.version,
      final_resume: finalResume,
      changes,
      mapping,
      evidence_index,
      guardrail_report: ensureGuardrailReportEmpty(tailored?.guardrail_report),
      explainability
    },
    meta,
    selection_plan_hash: selectionPlanHash,
    word_count_estimate: wordCountEstimate
  };
}

function stripMarkdownFences(text) {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/m, "");
  cleaned = cleaned.replace(/```$/m, "");
  cleaned = cleaned.trim();
  return cleaned;
}

/**
 * Convert markdown bold markers (**text**) to LaTeX \textbf{text}.
 * This is a safety net for any ** markers that slip through Claude's LaTeX generation.
 * 
 * Handles:
 * - Multiple bold spans per line
 * - Bold with punctuation, slashes, hyphens
 * - Nested content (non-greedy matching)
 * 
 * Examples:
 *   "Built **RAG** pipeline for **200k+** reviews"
 *   → "Built \textbf{RAG} pipeline for \textbf{200k+} reviews"
 */
function convertMarkdownBoldToLatex(latex) {
  if (!latex) return latex;
  // Match **text** where text is non-greedy (any chars except **)
  // This regex handles most cases including punctuation and special chars
  return latex.replace(/\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/g, (match, content) => {
    // Don't wrap if already appears to be inside a LaTeX command
    // (edge case: if someone wrote **\textbf{x}** which is unlikely)
    return `\\textbf{${content}}`;
  });
}

function enforceImmutableBlocks(latex, locks, appendLog) {
  let updated = replaceBlock(latex, locks.header, appendLog);
  updated = replaceBlock(updated, locks.education, appendLog);
  return updated;
}

function replaceBlock(latex, block, appendLog) {
  const { start, end, blockText } = block;
  const startIdx = latex.indexOf(start);
  const endIdx = latex.indexOf(end);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    if (appendLog) appendLog(`Lock enforced for block ${start}`);
    return latex.slice(0, startIdx) + blockText + latex.slice(endIdx + end.length);
  }
  if (appendLog) appendLog(`Lock markers missing for ${start}; injecting template block.`);
  const docIdx = latex.indexOf("\\begin{document}");
  if (docIdx !== -1) {
    const insertPos = docIdx + "\\begin{document}".length;
    return latex.slice(0, insertPos) + "\n" + blockText + "\n" + latex.slice(insertPos);
  }
  return blockText + "\n" + latex;
}

function ensureLatexSafe(latex) {
  if (!latex.includes("\\begin{document}") || !latex.includes("\\end{document}")) {
    throw new StageError("LaTeX missing document boundaries", "latex");
  }
  if (containsDangerousLatex(latex)) {
    throw new StageError("Unsafe LaTeX commands detected", "latex");
  }
}

function containsDangerousLatex(text) {
  const badPatterns = [/\\write18/i, /\\input\s*{[^}]*}/i, /\\include\s*{[^}]*}/i, /\\openout/i, /\\read/i, /\\usepackage\s*{shellesc}/i];
  return badPatterns.some((regex) => regex.test(text || ""));
}

function renderMockLatex(plan, template, locks) {
  const finalResume = plan?.final_resume || {};
  const { preamble, closing } = extractPreambleAndClosing(template);
  const summary = finalResume.summary || plan?.resume_plan?.summary || "Summary not provided.";
  const skills =
    finalResume.skills?.programming_languages ||
    plan?.resume_plan?.core_skills ||
    [];
  const expUpdates =
    finalResume.work_experience ||
    (plan?.resume_plan?.experience_updates || []).map((u) => ({
      role_id: u.role_id,
      bullets: u.target_bullets || []
    }));
  const projUpdates =
    finalResume.projects ||
    (plan?.resume_plan?.projects_updates || []).map((u) => ({
      project_id: u.project_id,
      bullets: u.target_bullets || []
    }));

  const parts = [
    preamble.trimEnd(),
    "",
    locks.header.blockText,
    "",
    "\\vspace{-3 pt}",
    "\\section{SUMMARY}",
    "\\vspace{3 pt}",
    `\\noindent ${escapeLatex(summary)}`,
    "",
    "\\vspace{3 pt}",
    "\\section{SKILLS}",
    "\\vspace{3 pt}",
    `\\noindent\\textbf{Core Skills:} ${escapeLatex(skills.join(", ") || "N/A")}`,
    "",
    locks.education.blockText,
    "",
    "\\vspace{3 pt}",
    "\\section{WORK EXPERIENCE}",
    "\\vspace{3 pt}",
    renderUpdates(expUpdates, "role_id"),
    "",
    "\\vspace{3 pt}",
    "\\section{PROJECTS}",
    "\\vspace{3 pt}",
    renderUpdates(projUpdates, "project_id"),
    "",
    "\\vspace{3 pt}",
    "\\section{AWARDS \\& MENTORSHIP}",
    "\\vspace{3 pt}",
    "\\begin{itemize}",
    "    \\item Placeholder achievement \\hfill \\textbf{2025}",
    "\\end{itemize}",
    "",
    closing.trimStart()
  ];

  return parts.join("\n");
}

function renderUpdates(updates, idKey) {
  if (!updates || !updates.length) {
    return "\\noindent No updates provided.";
  }
  const blocks = updates.map((u) => {
    const bulletsList = u.target_bullets || u.bullets || [];
    const bullets = bulletsList.map((b) => `    \\item ${escapeLatex(b)}`).join("\n");
    const title =
      u[idKey] ||
      u.role ||
      u.name ||
      u.company ||
      u.project_id ||
      "";
    return [
      `\\noindent\\textbf{${escapeLatex(title)}}`,
      "\\begin{itemize}",
      bullets || "    \\item ",
      "\\end{itemize}"
    ].join("\n");
  });
  return blocks.join("\n\n");
}

/**
 * Escape LaTeX special characters in plain text
 */
function escapeLatexChars(text) {
  if (!text) return "";
  return (text || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\^/g, "\\^{}")
    .replace(/~/g, "\\~{}");
}

/**
 * Escape special LaTeX characters and convert markdown bold to \textbf{}
 */
function escapeLatex(str) {
  if (!str) return "";
  
  // Convert markdown bold **text** to LaTeX \textbf{text} FIRST
  let result = (str || "").replace(/\*\*([^*]+(?:\*(?!\*)[^*]*)*)\*\*/g, (_, content) => {
    // Escape special chars inside the bold content
    const escapedContent = escapeLatexChars(content);
    return `\\textbf{${escapedContent}}`;
  });
  
  // Escape remaining special chars in non-bold text
  // Split by \textbf{...} to avoid escaping inside commands
  const parts = result.split(/(\\textbf\{[^}]*\})/g);
  result = parts.map((part, i) => {
    // Odd indices are the \textbf{...} matches - don't escape those
    if (i % 2 === 1) return part;
    // Even indices are regular text - escape them
    return escapeLatexChars(part);
  }).join('');
  
  return result;
}

function extractLockedBlocks(template, markers) {
  const missing = [];
  const headerStart = template.indexOf(markers.header.start);
  const headerEnd = template.indexOf(markers.header.end);
  const eduStart = template.indexOf(markers.education.start);
  const eduEnd = template.indexOf(markers.education.end);
  if (headerStart === -1 || headerEnd === -1) missing.push("header lock markers");
  if (eduStart === -1 || eduEnd === -1) missing.push("education lock markers");
  if (missing.length) {
    throw new Error(`Template missing ${missing.join(", ")}`);
  }
  const headerBlock = template.slice(headerStart, headerEnd + markers.header.end.length);
  const eduBlock = template.slice(eduStart, eduEnd + markers.education.end.length);
  return {
    header: { start: markers.header.start, end: markers.header.end, blockText: headerBlock },
    education: { start: markers.education.start, end: markers.education.end, blockText: eduBlock },
    template
  };
}

function extractPreambleAndClosing(template) {
  const docStart = template.indexOf("\\begin{document}");
  const docEnd = template.lastIndexOf("\\end{document}");
  const preamble = docStart !== -1 ? template.slice(0, docStart) + "\\begin{document}" : template;
  const closing = docEnd !== -1 ? template.slice(docEnd) : "\\end{document}";
  return { preamble, closing };
}

function buildMockRubric(jobPayload, jobText = "") {
  const job_meta = buildJobMetaFromPayload(jobPayload, {});
  const tokens = (jobText || "").split(/\W+/).filter(Boolean);
  const uniqueTerms = Array.from(new Set(tokens.map((t) => t.toLowerCase()))).filter(Boolean);
  while (uniqueTerms.length < 15) {
    uniqueTerms.push(`skill_${uniqueTerms.length + 1}`);
  }
  const requirements = uniqueTerms.slice(0, 15).map((term, idx) => ({
    req_id: `R${idx + 1}`,
    type: idx < 8 ? "must" : "nice",
    weight: Math.max(1, 5 - Math.floor(idx / 4)),
    requirement: `Ability to work with ${term}`,
    jd_evidence: [`mentions ${term}`],
    category: "other"
  }));
  const keywords = uniqueTerms.slice(0, 18).map((term, idx) => ({
    term,
    importance: Math.max(1, 5 - Math.floor(idx / 4)),
    type: "keyword",
    jd_evidence: [term]
  }));
  return {
    version: JD_RUBRIC_SCHEMA_V1.version,
    job_meta,
    requirements,
    keywords,
    constraints: { years_experience_min: null, education: [], certifications: [], work_authorization: [] },
    notes: { summary: `Mock rubric for ${job_meta.job_title || "role"} at ${job_meta.company || "company"}.`, ambiguities: [] }
  };
}

function buildMockTailored(jobPayload, masterResume) {
  const job = jobPayload.job || {};
  const roles = masterResume.work_experience || masterResume.experience || [];
  const projects = masterResume.projects || [];
  const hash = hashString(job.description_text || "");
  const experience_updates = roles.slice(0, 2).map((role, idx) => ({
    role_id: role.id || `role_${idx + 1}`,
    target_bullets: [(job.title ? `Aligned role for ${job.title}` : "Aligned role update"), `Impact bullet drawn from ${role.company || "experience"}`]
  }));
  const projects_updates = projects.slice(0, 2).map((proj, idx) => ({
    project_id: proj.id || `project_${idx + 1}`,
    target_bullets: [(job.company ? `Project relevance for ${job.company}` : "Project relevance"), `Key result: ${proj.name || "project"}`]
  }));
  const mock = {
    version: CONFIG.promptsVersion,
    job: {
      title: job.title || "",
      company: job.company || "",
      location: job.location || "",
      source_platform: jobPayload?.meta?.platform || "",
      confidence: jobPayload?.meta?.confidence || 0,
      raw_text_hash: hash,
      extracted_preview: (job.description_text || "").slice(0, 500)
    },
    analysis: {
      top_keywords: (job.description_text || "").split(/\W+/).filter(Boolean).slice(0, 6),
      must_have_requirements: [],
      nice_to_have_requirements: [],
      role_focus: job.title || "",
      gap_notes: []
    },
    resume_plan: {
      summary: `Mock plan for ${job.title || "role"} at ${job.company || "company"}.`,
      core_skills: (masterResume.skills?.programming_languages || []).slice(0, 5),
      experience_updates,
      projects_updates
    },
    final_resume: {
      summary: masterResume.summary || "",
      skills: {
        programming_languages: masterResume.skills?.programming_languages || [],
        data_analysis_statistics: masterResume.skills?.data_science_analytics || [],
        machine_learning: masterResume.skills?.machine_learning_ai || [],
        data_viz_engineering: masterResume.skills?.frameworks_libraries || [],
        big_data_software: masterResume.skills?.tools_cloud_technologies || []
      },
      work_experience: roles.slice(0, 3).map((r) => ({
        company: r.company || "",
        role: r.role || "",
        dates: r.dates || "",
        location: r.location || "",
        bullets: (r.bullets || []).slice(0, 3)
      })),
      projects: projects.slice(0, 3).map((p) => ({
        name: p.name || "",
        date: p.dates || "",
        keywords: p.tags || [],
        links: {
          github: (p.links && p.links[0]) || "",
          webapp: (p.links && p.links[1]) || ""
        },
        bullets: (p.bullets || []).slice(0, 2)
      })),
      awards: (masterResume.awards || []).slice(0, 3).map((a) => ({
        name: a.name || "",
        issuer: a.issuer || "",
        year: a.year || "",
        details: a.details || ""
      }))
    },
    quality: {
      ats_notes: ["Mock mode: deterministic output"],
      risk_flags: []
    }
  };
  const withExplainability = applyExplainabilityDefaults(mock, jobPayload, masterResume);
  if (isV3Version(CONFIG.promptsVersion)) {
    const upgraded = upgradeV2ToV3(withExplainability, jobPayload, masterResume, CONFIG.promptsVersion);
    return normalizeTailoredV3(upgraded, jobPayload, masterResume, CONFIG.promptsVersion);
  }
  return withExplainability;
}

async function writeJson(filePath, data) {
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function mergeIntoMeta(runDir, updates) {
  const metaPath = path.join(runDir, "meta.json");
  let existing = {};
  try {
    const current = await fs.promises.readFile(metaPath, "utf8");
    existing = JSON.parse(current);
  } catch (error) {
    existing = {};
  }
  const next = { ...existing, ...(updates || {}) };
  await writeJson(metaPath, next);
  return next;
}

async function writeStatus(runDir, status) {
  await writeJson(path.join(runDir, "status.json"), status);
}

async function readStatus(runDir) {
  try {
    const contents = await fs.promises.readFile(path.join(runDir, "status.json"), "utf8");
    return JSON.parse(contents);
  } catch (error) {
    return null;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function withTimeout(promise, timeoutMs, stage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StageError("Stage timeout", stage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

class StageError extends Error {
  constructor(message, stage) {
    super(message);
    this.stage = stage;
  }
}

function hashString(str) {
  return createHash("sha256").update(str || "", "utf8").digest("hex");
}

function getPrompt(stage, versionOverride, fallbackOverride) {
  const version = versionOverride || CONFIG.promptsVersion;
  const cacheKey = `${stage}:${version}`;
  if (PROMPT_CACHE[cacheKey]) return PROMPT_CACHE[cacheKey];
  const loaded = loadPrompt(stage, version, fallbackOverride || "legacy");
  PROMPT_CACHE[cacheKey] = loaded;
  return loaded;
}

export {
  getTailoredSchemaExample,
  normalizeTailoredOutput,
  validateTailored,
  validateRubric,
  normalizeRubricOutput,
  buildRubricPayload,
  runRubricExtraction,
  enforceSelectionPlanCompliance
};
