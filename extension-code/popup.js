/* global chrome */

const analyzeBtn = document.getElementById("analyzeBtn");
const extractBtn = document.getElementById("extractBtn");
const saveJsonBtn = document.getElementById("saveJsonBtn");
const saveMdBtn = document.getElementById("saveMdBtn");
const platformSelect = document.getElementById("platformSelect");
const tagsInput = document.getElementById("tagsInput");
const notesInput = document.getElementById("notesInput");
const debugToggle = document.getElementById("debugToggle");
const historyToggle = document.getElementById("historyToggle");
const statusText = document.getElementById("statusText");
const statusChip = document.getElementById("statusChip");
const statusList = document.getElementById("statusList");
const statusDetail = document.getElementById("statusDetail");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const downloadLatexBtn = document.getElementById("downloadLatexBtn");
const warningEl = document.getElementById("warning");
const previewTitle = document.getElementById("previewTitle");
const previewCompany = document.getElementById("previewCompany");
const previewLocation = document.getElementById("previewLocation");
const previewDescription = document.getElementById("previewDescription");
const metaUrl = document.getElementById("metaUrl");
const metaMethod = document.getElementById("metaMethod");
const metaConfidence = document.getElementById("metaConfidence");
const confidenceChip = document.getElementById("confidenceChip");
const historyList = document.getElementById("historyList");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");

let currentExtraction = null;
let historyCache = [];
let pipelineState = {
  stage: "IDLE",
  runId: null,
  files: null,
  message: "",
  failureStage: null
};

const BACKEND_BASE_URL = "http://localhost:3001";

const PIPELINE_STEPS = [
  { key: "EXTRACTING", label: "Extracting job" },
  { key: "ANALYZING", label: "Tailoring resume" },
  { key: "GENERATING_LATEX", label: "Generating LaTeX" },
  { key: "COMPILING_PDF", label: "Compiling PDF" },
  { key: "DONE", label: "Done" }
];

const STAGE_ORDER = {
  IDLE: 0,
  EXTRACTING: 1,
  ANALYZING: 2,
  GENERATING_LATEX: 3,
  COMPILING_PDF: 4,
  GPT_TAILORING: 2,
  LATEX: 3,
  COMPILE: 4,
  BOOTSTRAP: 1,
  DONE: 5,
  ERROR: 6
};

const DEFAULT_STAGE_MESSAGES = {
  IDLE: "Idle",
  EXTRACTING: "Extracting job…",
  ANALYZING: "Tailoring resume…",
  GENERATING_LATEX: "Generating LaTeX…",
  COMPILING_PDF: "Compiling PDF…",
  DONE: "Ready to download",
  ERROR: "Pipeline failed"
};

const hashString = async (value) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value || "");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const sanitizePart = (value) =>
  (value || "")
    .toString()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const parseTagsInput = () =>
  tagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const syncInputsIntoState = () => {
  if (!currentExtraction) return;
  currentExtraction.meta.platform = platformSelect.value;
  currentExtraction.meta.user_tags = parseTagsInput();
  currentExtraction.meta.notes = notesInput.value.trim();
};

const isPipelineBusy = () => !["IDLE", "DONE", "ERROR"].includes(pipelineState.stage);

const updateButtons = () => {
  const hasData = Boolean(currentExtraction);
  const files = pipelineState.files || {};
  analyzeBtn.disabled = isPipelineBusy();
  extractBtn.disabled = isPipelineBusy();
  downloadPdfBtn.disabled = pipelineState.stage !== "DONE" || !files.pdf;
  downloadJsonBtn.disabled = pipelineState.stage !== "DONE" || !files.json;
  downloadLatexBtn.disabled = pipelineState.stage !== "DONE" || !files.tex;
  saveJsonBtn.disabled = !hasData;
  saveMdBtn.disabled = !hasData;
};

const sendMessage = (payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const downloadRequest = (options) =>
  new Promise((resolve, reject) => {
    chrome.downloads.download(options, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(id);
    });
  });

const storageGet = (key) =>
  new Promise((resolve) => {
    chrome.storage.local.get(key, resolve);
  });

const storageSet = (obj) =>
  new Promise((resolve) => {
    chrome.storage.local.set(obj, resolve);
  });

const setStatus = (text) => {
  statusText.textContent = text || "";
};

const mapBackendStage = (stage) => {
  if (!stage) return null;
  const normalized = stage.toString().toUpperCase();
  const table = {
    GPT_TAILORING: "ANALYZING",
    ANALYZING: "ANALYZING",
    GENERATING_LATEX: "GENERATING_LATEX",
    LATEX: "GENERATING_LATEX",
    COMPILE: "COMPILING_PDF",
    COMPILING_PDF: "COMPILING_PDF",
    DONE: "DONE",
    ERROR: "ERROR",
    EXTRACTING: "EXTRACTING",
    BOOTSTRAP: "EXTRACTING"
  };
  return table[normalized] || null;
};

const chipClassForStage = (stage) => {
  if (stage === "DONE") return "chip good";
  if (stage === "ERROR") return "chip warn";
  if (isPipelineBusy()) return "chip";
  return "chip muted";
};

const chipLabelForStage = (stage) => {
  if (stage === "DONE") return "Done";
  if (stage === "ERROR") return "Error";
  if (stage === "IDLE") return "Idle";
  return "Running";
};

const setPipelineStage = (stage, message, options = {}) => {
  const nextStage = stage || pipelineState.stage;
  pipelineState = {
    ...pipelineState,
    stage: nextStage,
    message: message || DEFAULT_STAGE_MESSAGES[nextStage] || "",
    failureStage: options.failureStage || (nextStage === "ERROR" ? pipelineState.failureStage || pipelineState.stage : null),
    files: options.files || pipelineState.files,
    runId: options.runId || pipelineState.runId
  };
  statusDetail.textContent = pipelineState.message || "";
  statusChip.textContent = chipLabelForStage(nextStage);
  statusChip.className = chipClassForStage(nextStage);
  renderStatusTracker();
  updateButtons();
};

const getStepClass = (stepKey) => {
  const activeStage = pipelineState.stage === "ERROR" ? pipelineState.failureStage || "ERROR" : pipelineState.stage;
  const currentIndex = STAGE_ORDER[activeStage] ?? -1;
  const stepIndex = STAGE_ORDER[stepKey] ?? -1;
  if (pipelineState.stage === "ERROR" && pipelineState.failureStage === stepKey) {
    return "error";
  }
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "";
};

const renderStatusTracker = () => {
  statusList.textContent = "";
  PIPELINE_STEPS.forEach((step) => {
    const row = document.createElement("div");
    row.className = `status-row ${getStepClass(step.key)}`.trim();
    const dot = document.createElement("div");
    dot.className = "dot";
    const label = document.createElement("div");
    label.textContent = step.label;
    row.appendChild(dot);
    row.appendChild(label);
    statusList.appendChild(row);
  });
};

const renderConfidence = (confidence) => {
  metaConfidence.textContent = `Confidence: ${(confidence * 100).toFixed(0)}%`;
  confidenceChip.textContent = confidence >= 0.55 ? "Pass" : "Low";
  confidenceChip.className = `chip ${confidence >= 0.75 ? "good" : confidence >= 0.55 ? "muted" : "warn"}`;
  warningEl.classList.toggle("hidden", confidence >= 0.55);
};

const renderPreview = () => {
  if (!currentExtraction) {
    previewTitle.textContent = "Title —";
    previewCompany.textContent = "Company —";
    previewLocation.textContent = "Location —";
    previewDescription.textContent = "Description preview will appear here after extraction.";
    metaUrl.textContent = "URL: —";
    metaMethod.textContent = "Method: —";
    metaConfidence.textContent = "Confidence: —";
    confidenceChip.textContent = "No data";
    confidenceChip.className = "chip muted";
    warningEl.classList.add("hidden");
    return;
  }
  const { job, meta } = currentExtraction;
  previewTitle.textContent = job.title || "Untitled role";
  previewCompany.textContent = job.company ? `Company: ${job.company}` : "Company: —";
  previewLocation.textContent = job.location ? `Location: ${job.location}` : "Location: —";
  const descriptionPreview = (job.description_text || "").slice(0, 800);
  previewDescription.textContent = descriptionPreview || "No description captured yet.";
  metaUrl.textContent = `URL: ${meta.url}`;
  metaMethod.textContent = `Method: ${meta.extraction_method}`;
  renderConfidence(meta.confidence || 0);
};

const buildFilenameBase = (data) => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("") + "_" + [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, "0")).join("");
  const platform = sanitizePart(data.meta.platform || "job");
  const company = sanitizePart(data.job.company || "company");
  const title = sanitizePart(data.job.title || "title");
  return `${platform}_${company}_${title}_${stamp}`;
};

const prepareDataForSave = () => {
  if (!currentExtraction) return null;
  syncInputsIntoState();
  const data = JSON.parse(JSON.stringify(currentExtraction));
  if (!debugToggle.checked) {
    data.debug.jsonld_raw = null;
    data.debug.top_blocks = data.debug.top_blocks.slice(0, 3);
  }
  return data;
};

const downloadBlob = async (content, filename, mime) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  await downloadRequest({
    url,
    filename,
    saveAs: true
  });
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const sanitizeHistoryPayload = async (data) => {
  const clone = JSON.parse(JSON.stringify(data));
  const rawText = (clone.job && clone.job.description_text) || "";
  const preview = rawText.slice(0, 500);
  const rawHash = await hashString(rawText);
  if (clone.job) {
    clone.job.rawTextPreview = preview;
    clone.job.rawTextHash = rawHash;
    delete clone.job.description_text;
  }
  return clone;
};

const saveHistoryEntry = async (filenameBase, data) => {
  if (!historyToggle.checked) return;
  const sanitized = await sanitizeHistoryPayload(data);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp_iso: data.meta.timestamp_iso,
    url: data.meta.url,
    title: data.job.title,
    platform: data.meta.platform,
    filenameBase,
    data: sanitized
  };
  const { history = [] } = await storageGet("history");
  const updated = [entry, ...history].slice(0, 20);
  historyCache = updated;
  await storageSet({ history: updated });
  renderHistory();
};

const handleSaveJson = async (dataOverride) => {
  const data = dataOverride || prepareDataForSave();
  if (!data) return;
  const filenameBase = buildFilenameBase(data);
  const filename = `${filenameBase}.json`;
  await downloadBlob(JSON.stringify(data, null, 2), filename, "application/json");
  if (!dataOverride) {
    await saveHistoryEntry(filenameBase, data);
  }
  setStatus(`Saved ${filename}`);
};

const markdownForData = (data) => {
  const lines = [];
  lines.push(`# ${data.job.title || "Untitled role"}`);
  lines.push(`- Company: ${data.job.company || "—"}`);
  lines.push(`- Location: ${data.job.location || "—"}`);
  lines.push(`- Platform: ${data.meta.platform}`);
  lines.push(`- URL: ${data.meta.url}`);
  lines.push(`- Extracted: ${data.meta.timestamp_iso}`);
  lines.push(`- Method: ${data.meta.extraction_method}`);
  lines.push(`- Confidence: ${(data.meta.confidence * 100).toFixed(0)}%`);
  lines.push(`- Tags: ${(data.meta.user_tags || []).join(", ") || "—"}`);
  lines.push(`- Notes: ${data.meta.notes || "—"}`);
  lines.push("");
  lines.push("## Description");
  lines.push(data.job.description_text || "—");
  lines.push("");
  if (data.job.requirements && data.job.requirements.length) {
    lines.push("## Requirements");
    data.job.requirements.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (data.job.nice_to_have && data.job.nice_to_have.length) {
    lines.push("## Nice to have");
    data.job.nice_to_have.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }
  lines.push("## Debug");
  lines.push(`- JSON-LD found: ${data.debug.jsonld_found}`);
  lines.push(`- Readability length: ${data.debug.readability_text_length}`);
  lines.push(`- Top blocks captured: ${data.debug.top_blocks.length}`);
  return lines.join("\n");
};

const handleSaveMarkdown = async (dataOverride) => {
  const data = dataOverride || prepareDataForSave();
  if (!data) return;
  const filenameBase = buildFilenameBase(data);
  const filename = `${filenameBase}.md`;
  const md = markdownForData(data);
  await downloadBlob(md, filename, "text/markdown");
  if (!dataOverride) {
    await saveHistoryEntry(filenameBase, data);
  }
  setStatus(`Saved ${filename}`);
};

const handleExtraction = async ({ updateStage = true, keepStage = false } = {}) => {
  if (updateStage) {
    setPipelineStage("EXTRACTING", DEFAULT_STAGE_MESSAGES.EXTRACTING);
  }
  setStatus("Extracting...");
  extractBtn.disabled = true;
  try {
    const response = await sendMessage({
      action: "start_extraction",
      includeDebug: true // always request full debug, toggle controls saved output
    });
    if (!response || !response.ok) {
      throw new Error(response?.error || "Extraction failed");
    }
    currentExtraction = response.data;
    platformSelect.value = currentExtraction.meta.platform || "other";
    syncInputsIntoState();
    renderPreview();
    updateButtons();
    setStatus("Extraction ready. Review and save.");
    if (updateStage && !keepStage) {
      setPipelineStage("IDLE", "");
    }
    return currentExtraction;
  } catch (error) {
    setPipelineStage("ERROR", error.message || "Extraction error", { failureStage: "EXTRACTING" });
    setStatus(error.message || "Extraction error");
    throw error;
  } finally {
    extractBtn.disabled = false;
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pollRunStatus = async (runId) => {
  const start = Date.now();
  while (Date.now() - start < 180000) {
    const res = await fetch(`${BACKEND_BASE_URL}/status/${runId}`);
    if (!res.ok) {
      throw new Error(`Status check failed (${res.status})`);
    }
    const data = await res.json();
    const stage = mapBackendStage(data.stage) || pipelineState.stage;
    const msg = data.message || DEFAULT_STAGE_MESSAGES[stage];
    const files = data.files || pipelineState.files;
    if (data.status === "error") {
      setPipelineStage("ERROR", msg, { failureStage: stage, files, runId });
      throw new Error(msg || "Pipeline error");
    }
    setPipelineStage(stage, msg, { files, runId });
    if (stage === "DONE" && data.status === "success") {
      pipelineState.files = files;
      setPipelineStage("DONE", msg, { files, runId });
      return files;
    }
    await wait(1000);
  }
  throw new Error("Timed out waiting for backend");
};

const handleAnalyze = async () => {
  if (isPipelineBusy()) return;
  pipelineState.files = null;
  pipelineState.failureStage = null;
  try {
    let extraction = currentExtraction;
    if (!extraction) {
      extraction = await handleExtraction({ updateStage: true, keepStage: true });
    } else {
      setPipelineStage("EXTRACTING", "Using current extraction");
      setStatus("Using current extraction data.");
    }
    if (!extraction) return;
    syncInputsIntoState();
    extraction = currentExtraction;
    setPipelineStage("ANALYZING", DEFAULT_STAGE_MESSAGES.ANALYZING);
    const payload = {
      job_payload: extraction,
      resume_id: "default",
      options: {
        page_limit: 1,
        style: "ats_clean",
        debug: debugToggle.checked
      }
    };
    const response = await fetch(`${BACKEND_BASE_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Backend error (${response.status})`);
    }
    const data = await response.json();
    const stage = mapBackendStage(data.stage) || "ANALYZING";
    setPipelineStage(stage, data.message || DEFAULT_STAGE_MESSAGES[stage], {
      files: data.files,
      runId: data.run_id
    });
    if (data.status === "success" && data.files?.pdf) {
      pipelineState.files = data.files;
      setPipelineStage("DONE", data.message || DEFAULT_STAGE_MESSAGES.DONE, {
        files: data.files,
        runId: data.run_id
      });
      setStatus("Resume ready to download.");
      return;
    }
    await pollRunStatus(data.run_id);
    setStatus("Resume ready to download.");
  } catch (error) {
    setPipelineStage("ERROR", error.message || "Analyze failed", {
      failureStage: pipelineState.failureStage || pipelineState.stage
    });
    setStatus(error.message || "Analyze failed");
  } finally {
    updateButtons();
  }
};

const handleDownloadArtifact = async (key, ext) => {
  if (!pipelineState.files || !pipelineState.files[key]) return;
  const filenameBase = currentExtraction ? buildFilenameBase(currentExtraction) : pipelineState.runId || "resume";
  const filename = `${filenameBase}.${ext}`;
  await downloadRequest({
    url: `${BACKEND_BASE_URL}${pipelineState.files[key]}`,
    filename,
    saveAs: true
  });
  setStatus(`Downloading ${filename}`);
};

const renderHistory = () => {
  if (!historyCache.length) {
    historyList.textContent = "No history yet.";
    return;
  }
  historyList.textContent = "";
  historyCache.slice(0, 5).forEach((item) => {
    const container = document.createElement("div");
    container.className = "history-item";
    container.dataset.id = item.id;

    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.title || "Untitled role";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.platform} · ${new Date(item.timestamp_iso).toLocaleString()}`;
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "meta";
    right.textContent = item.filenameBase;

    row.appendChild(left);
    row.appendChild(right);

    const actions = document.createElement("div");
    actions.className = "actions";
    const jsonBtn = document.createElement("button");
    jsonBtn.className = "secondary";
    jsonBtn.dataset.action = "download-json";
    jsonBtn.dataset.id = item.id;
    jsonBtn.textContent = "JSON";
    const mdBtn = document.createElement("button");
    mdBtn.className = "secondary";
    mdBtn.dataset.action = "download-md";
    mdBtn.dataset.id = item.id;
    mdBtn.textContent = "MD";
    actions.appendChild(jsonBtn);
    actions.appendChild(mdBtn);

    container.appendChild(row);
    container.appendChild(actions);
    historyList.appendChild(container);
  });
};

const loadHistory = async () => {
  const { history = [] } = await storageGet("history");
  let mutated = false;
  const sanitizedEntries = await Promise.all(
    history.map(async (entry) => {
      if (entry?.data?.job?.description_text) {
        mutated = true;
        const cleanedData = await sanitizeHistoryPayload(entry.data);
        return { ...entry, data: cleanedData };
      }
      return entry;
    })
  );
  if (mutated) {
    await storageSet({ history: sanitizedEntries });
  }
  historyCache = mutated ? sanitizedEntries : history;
  renderHistory();
};

analyzeBtn.addEventListener("click", handleAnalyze);
extractBtn.addEventListener("click", () => handleExtraction({ updateStage: true }));
saveJsonBtn.addEventListener("click", () => handleSaveJson());
saveMdBtn.addEventListener("click", () => handleSaveMarkdown());
platformSelect.addEventListener("change", () => syncInputsIntoState());
tagsInput.addEventListener("input", () => syncInputsIntoState());
notesInput.addEventListener("input", () => syncInputsIntoState());
refreshHistoryBtn.addEventListener("click", loadHistory);
downloadPdfBtn.addEventListener("click", () => handleDownloadArtifact("pdf", "pdf"));
downloadJsonBtn.addEventListener("click", () => handleDownloadArtifact("json", "json"));
downloadLatexBtn.addEventListener("click", () => handleDownloadArtifact("tex", "tex"));

historyList.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (!action) return;
  const id = event.target.dataset.id;
  const entry = historyCache.find((h) => h.id === id);
  if (!entry) return;
  if (action === "download-json") {
    handleSaveJson(entry.data);
  }
  if (action === "download-md") {
    handleSaveMarkdown(entry.data);
  }
});

setPipelineStage("IDLE", DEFAULT_STAGE_MESSAGES.IDLE);
loadHistory();
renderPreview();
updateButtons();
