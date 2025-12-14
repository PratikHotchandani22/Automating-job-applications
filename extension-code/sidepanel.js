/* global chrome */

const DEFAULT_UI = {
  tabScope: "currentWindow",
  selectedCaptureId: null,
  selectedRunId: null,
  selectedTabId: null,
  detailsTab: "overview"
};

const BACKEND_BASE_URL = "http://localhost:3001";

const elements = {
  tabSelect: document.getElementById("tabSelect"),
  allWindowsToggle: document.getElementById("allWindowsToggle"),
  refreshTabsBtn: document.getElementById("refreshTabsBtn"),
  extractBtn: document.getElementById("extractPanelBtn"),
  analyzeBtn: document.getElementById("analyzePanelBtn"),
  capturesList: document.getElementById("capturesList"),
  runsList: document.getElementById("runsList"),
  detailsContent: document.getElementById("detailsContent"),
  healthChip: document.getElementById("healthChip"),
  offlineBanner: document.getElementById("offlineBanner"),
  statusText: document.getElementById("statusText"),
  refreshCapturesBtn: document.getElementById("refreshCapturesBtn"),
  refreshRunsBtn: document.getElementById("refreshRunsBtn")
};

const state = {
  tabs: [],
  captures: [],
  runs: [],
  ui: { ...DEFAULT_UI },
  backendHealthy: true,
  backendStatus: "checking",
  explainCache: {},
  explainFilter: { requirement: null }
};

const STAGE_LABELS = {
  EXTRACTING: "Extracting",
  ANALYZING: "Tailoring",
  GENERATING_LATEX: "Generating LaTeX",
  COMPILING_PDF: "Compiling PDF",
  DONE: "Done",
  ERROR: "Error",
  IDLE: "Idle"
};

const STAGE_ORDER = {
  EXTRACTING: 0,
  ANALYZING: 1,
  GENERATING_LATEX: 2,
  COMPILING_PDF: 3,
  DONE: 4,
  ERROR: 5
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

const setStatus = (text) => {
  elements.statusText.textContent = text || "";
};

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
};

const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
};

const formatUrl = (url) => {
  if (!url) return "Unknown";
  try {
    const u = new URL(url);
    const path = u.pathname.length > 32 ? `${u.pathname.slice(0, 32)}…` : u.pathname || "/";
    return `${u.hostname}${path}`;
  } catch (e) {
    return url;
  }
};

const healthClass = (ok) => (ok ? "chip good" : "chip warn");

const escapeHtml = (str = "") =>
  (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightKeywords = (text = "", keywords = []) => {
  if (!keywords || !keywords.length) return escapeHtml(text);
  const unique = Array.from(new Set(keywords.filter(Boolean)));
  let result = escapeHtml(text);
  unique.forEach((kw) => {
    const regex = new RegExp(`(${escapeRegex(kw)})`, "gi");
    result = result.replace(regex, '<mark class="pill">$1</mark>');
  });
  return result;
};

const buildArtifactUrl = (path) => {
  if (!path) return null;
  return path.startsWith("http") ? path : `${BACKEND_BASE_URL}${path}`;
};

const copyText = async (text, label = "Copied") => {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(label);
  } catch (error) {
    setStatus("Unable to copy");
  }
};

const fetchJsonArtifact = async (path) => {
  const url = buildArtifactUrl(path);
  if (!url) throw new Error("Missing artifact path");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Artifact fetch failed (${res.status})`);
  }
  return res.json();
};

const fetchTextArtifact = async (path) => {
  const url = buildArtifactUrl(path);
  if (!url) throw new Error("Missing artifact path");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Artifact fetch failed (${res.status})`);
  }
  return res.text();
};

const shortHash = (hash) => (hash ? hash.slice(0, 12) : "—");

const isV3Tailored = (tailored = {}) => (tailored.version || "").includes("v3") || Boolean(tailored.jd_rubric);

const groupV3Requirements = (requirements = []) => {
  const must_have = [];
  const nice_to_have = [];
  (requirements || []).forEach((req) => {
    if (!req) return;
    const target = req.type === "nice" ? nice_to_have : must_have;
    target.push({ req_id: req.req_id, text: req.text, jd_snippet: req.jd_snippet });
  });
  return { must_have, nice_to_have };
};

const adaptV3ChangeList = (entries = [], idKey) =>
  (entries || []).map((entry) => {
    const bullet_ids = [];
    const before_bullets = [];
    const after_bullets = [];
    (entry.updated_bullets || []).forEach((b, idx) => {
      const bulletId = b?.bullet_id || `${entry[idKey] || "item"}_b${idx + 1}`;
      bullet_ids.push(bulletId);
      before_bullets.push(b?.before_text || "");
      after_bullets.push(b?.after_text || "");
    });
    return {
      [idKey]: entry[idKey],
      before_bullets,
      after_bullets,
      bullet_ids
    };
  });

const buildExplainView = (tailored = {}) => {
  if (!isV3Tailored(tailored)) {
    return tailored.explainability || tailored.explain || {};
  }
  const requirements = groupV3Requirements(tailored.jd_rubric?.requirements || []);
  const changes = {
    experience: adaptV3ChangeList(tailored.changes?.experience || [], "role_id"),
    projects: adaptV3ChangeList(tailored.changes?.projects || [], "project_id")
  };
  return {
    job_preview: {
      extracted_preview: tailored.job?.extracted_preview || "",
      raw_text_hash: tailored.job?.raw_job_text_hash || tailored.job?.raw_text_hash || ""
    },
    requirements,
    changes,
    mappings: {
      bullet_to_requirements: tailored.mapping?.bullet_to_requirements || [],
      keyword_inserts: tailored.changes?.keyword_insertions || []
    },
    diagnostics: tailored.diagnostics || {},
    top_keywords: tailored.jd_rubric?.top_keywords || []
  };
};

const buildAnalysisView = (tailored, explainView) => {
  if (isV3Tailored(tailored)) {
    return { top_keywords: explainView.top_keywords || tailored.jd_rubric?.top_keywords || [] };
  }
  return tailored.analysis || {};
};

const buildRequirementCatalog = (requirements = {}) => {
  const catalog = {};
  (requirements.must_have || []).forEach((req) => {
    if (req?.req_id) catalog[req.req_id] = { ...req, tier: "must" };
  });
  (requirements.nice_to_have || []).forEach((req) => {
    if (req?.req_id) catalog[req.req_id] = { ...req, tier: "nice" };
  });
  return catalog;
};

const buildReqCounts = (mappings = []) => {
  const counts = {};
  mappings.forEach((m) => {
    (m.req_ids || []).forEach((reqId) => {
      counts[reqId] = (counts[reqId] || 0) + 1;
    });
  });
  return counts;
};

const renderHealth = () => {
  elements.healthChip.className = healthClass(state.backendHealthy);
  elements.healthChip.textContent = state.backendHealthy ? "Backend online" : "Backend offline";
  elements.offlineBanner.classList.toggle("hidden", state.backendHealthy);
  const disabled = !state.backendHealthy || !state.ui.selectedCaptureId;
  elements.analyzeBtn.disabled = disabled;
  elements.analyzeBtn.title = !state.backendHealthy
    ? "Backend required for analysis."
    : !state.ui.selectedCaptureId
      ? "Select a capture first."
      : "Analyze selected capture.";
};

const getSelectedTabId = () => {
  const value = elements.tabSelect.value;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const renderTabs = () => {
  elements.tabSelect.textContent = "";
  if (!state.tabs.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No tabs found";
    elements.tabSelect.appendChild(opt);
    elements.extractBtn.disabled = true;
    return;
  }
  state.tabs.forEach((tab) => {
    const opt = document.createElement("option");
    opt.value = tab.id;
    const prefix = tab.active ? "• " : "";
    opt.textContent = `${prefix}${tab.title || tab.url || "Untitled"} (${formatUrl(tab.url)})`;
    elements.tabSelect.appendChild(opt);
  });
  const desired = state.tabs.find((t) => t.id === state.ui.selectedTabId);
  const fallback = state.tabs.find((t) => t.active) || state.tabs[0];
  elements.tabSelect.value = desired ? desired.id : fallback.id;
  const selected = Number(elements.tabSelect.value);
  if (state.ui.selectedTabId !== selected) {
    state.ui.selectedTabId = selected;
    sendMessage({ action: "SET_UI_STATE", ui_state: { selectedTabId: selected } }).catch(() => {});
  }
  elements.extractBtn.disabled = false;
};

const refreshTabs = async () => {
  try {
    const scope = state.ui.tabScope === "allWindows" ? "allWindows" : "currentWindow";
    const res = await sendMessage({ action: "GET_TABS", scope });
    if (!res?.ok) throw new Error(res?.error || "Unable to load tabs");
    state.tabs = res.tabs || [];
    renderTabs();
  } catch (error) {
    setStatus(error.message || "Unable to load tabs");
    state.tabs = [];
    renderTabs();
  }
};

const loadState = async () => {
  try {
    const res = await sendMessage({ action: "GET_STATE" });
    if (!res?.ok) throw new Error(res?.error || "Unable to load state");
    state.captures = res.captures || [];
    state.runs = res.runs || [];
    state.ui = { ...DEFAULT_UI, ...(res.ui_state || {}) };
    elements.allWindowsToggle.checked = state.ui.tabScope === "allWindows";
    renderAll();
  } catch (error) {
    setStatus(error.message || "Unable to load dashboard state");
  }
};

const checkBackendHealth = async () => {
  try {
    const res = await sendMessage({ action: "GET_BACKEND_HEALTH" });
    state.backendHealthy = Boolean(res?.ok);
    state.backendStatus = res?.status || (res?.ok ? "ok" : "offline");
  } catch (e) {
    state.backendHealthy = false;
    state.backendStatus = "offline";
  }
  renderHealth();
};

const handleSelectCapture = async (captureId) => {
  state.ui.selectedCaptureId = captureId;
  state.ui.selectedRunId = null;
  state.explainFilter.requirement = null;
  await sendMessage({ action: "SET_UI_STATE", ui_state: { selectedCaptureId: captureId, selectedRunId: null } }).catch(() => {});
  renderAll();
};

const handleSelectRun = async (runId) => {
  state.ui.selectedRunId = runId;
  state.explainFilter.requirement = null;
  await sendMessage({ action: "SET_UI_STATE", ui_state: { selectedRunId: runId } }).catch(() => {});
  renderAll();
};

const handleDeleteCapture = async (captureId) => {
  await sendMessage({ action: "DELETE_CAPTURE", captureId }).catch(() => {});
};

const handleAnalyze = async () => {
  if (!state.ui.selectedCaptureId) {
    setStatus("Select a capture first.");
    return;
  }
  if (!state.backendHealthy) {
    setStatus("Backend required for analysis.");
    return;
  }
  elements.analyzeBtn.disabled = true;
  setStatus("Starting analysis…");
  try {
    const res = await sendMessage({ action: "ANALYZE_CAPTURE", captureId: state.ui.selectedCaptureId });
    if (!res?.ok) throw new Error(res?.error || "Analyze failed");
    setStatus("Run started. Polling status…");
  } catch (error) {
    setStatus(error.message || "Analyze failed");
  } finally {
    renderHealth();
  }
};

const handleExtract = async () => {
  const tabId = getSelectedTabId();
  if (!tabId) {
    setStatus("Select a tab first.");
    return;
  }
  elements.extractBtn.disabled = true;
  setStatus("Extracting from tab…");
  try {
    const res = await sendMessage({ action: "EXTRACT_FROM_TAB", tabId });
    if (!res?.ok) throw new Error(res?.error || "Extraction failed");
    setStatus("Capture saved.");
  } catch (error) {
    setStatus(error.message || "Extraction failed");
  } finally {
    elements.extractBtn.disabled = false;
  }
};

const timelineClass = (run, step) => {
  const current = run.stage === "ERROR" ? "ERROR" : run.stage || "IDLE";
  const currentIndex = STAGE_ORDER[current] ?? -1;
  const stepIndex = STAGE_ORDER[step] ?? -1;
  if (run.result === "error" && step === current) return "stage error";
  if (stepIndex < currentIndex) return "stage done";
  if (stepIndex === currentIndex) return "stage active";
  return "stage";
};

const renderWarnings = (warnings = []) => {
  if (!warnings.length) return "";
  return warnings
    .map((w) => `<span class="warning-pill">${w.replace(/_/g, " ")}</span>`)
    .join("");
};

const renderCaptures = () => {
  const container = elements.capturesList;
  container.textContent = "";
  if (!state.captures.length) {
    container.textContent = "No captures yet — click Extract.";
    return;
  }
  state.captures.forEach((cap) => {
    const card = document.createElement("div");
    card.className = `card ${state.ui.selectedCaptureId === cap.captureId ? "selected" : ""}`;

    const row = document.createElement("div");
    row.className = "row";
    const title = document.createElement("div");
    title.className = "title truncate";
    title.textContent = cap.job.title || cap.tab.title || "Untitled role";
    row.appendChild(title);

    const confidence = document.createElement("div");
    confidence.className = `chip ${cap.confidence >= 0.75 ? "good" : cap.confidence >= 0.55 ? "muted" : "warn"}`;
    confidence.textContent = `${Math.round((cap.confidence || 0) * 100)}%`;
    row.appendChild(confidence);
    card.appendChild(row);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${cap.job.company || "—"} · ${formatUrl(cap.tab.url)} · ${formatDate(cap.capturedAt)}`;
    card.appendChild(meta);

    const preview = document.createElement("div");
    preview.className = "preview";
    preview.textContent = cap.rawTextPreview || "No preview captured.";
    card.appendChild(preview);

    if (cap.warnings?.length) {
      const warn = document.createElement("div");
      warn.className = "warnings";
      warn.innerHTML = renderWarnings(cap.warnings);
      card.appendChild(warn);
    }

    const actions = document.createElement("div");
    actions.className = "actions-row";
    const viewBtn = document.createElement("button");
    viewBtn.className = "ghost small";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleSelectCapture(cap.captureId);
    });
    const analyzeBtn = document.createElement("button");
    analyzeBtn.className = "primary small";
    analyzeBtn.textContent = "Analyze";
    analyzeBtn.disabled = !state.backendHealthy;
    analyzeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleSelectCapture(cap.captureId);
      handleAnalyze();
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost small";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteCapture(cap.captureId);
    });
    actions.appendChild(viewBtn);
    actions.appendChild(analyzeBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(actions);

    card.addEventListener("click", () => handleSelectCapture(cap.captureId));
    container.appendChild(card);
  });
};

const renderRuns = () => {
  const container = elements.runsList;
  container.textContent = "";
  if (!state.runs.length) {
    container.textContent = "No runs yet — analyze a capture.";
    return;
  }
  state.runs.forEach((run) => {
    const card = document.createElement("div");
    card.className = `card ${state.ui.selectedRunId === run.runId || state.ui.selectedRunId === run.clientRunId ? "selected" : ""}`;

    const row = document.createElement("div");
    row.className = "row";
    const title = document.createElement("div");
    title.className = "title truncate";
    title.textContent = `Run ${run.runId || run.clientRunId}`;
    row.appendChild(title);

    const chip = document.createElement("div");
    chip.className = `chip ${run.result === "success" ? "good" : run.result === "error" ? "warn" : "muted"}`;
    chip.textContent = STAGE_LABELS[run.stage] || "Pending";
    row.appendChild(chip);
    card.appendChild(row);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${run.tab?.title || "Unknown tab"} · ${formatDate(run.startedAt)} · ${formatDuration(run.durationSec)}`;
    card.appendChild(meta);

    const timeline = document.createElement("div");
    timeline.className = "timeline";
    const steps =
      run.result === "error"
        ? ["EXTRACTING", "ANALYZING", "GENERATING_LATEX", "COMPILING_PDF", "ERROR"]
        : ["EXTRACTING", "ANALYZING", "GENERATING_LATEX", "COMPILING_PDF", "DONE"];
    steps.forEach((stage) => {
      const pill = document.createElement("div");
      pill.className = timelineClass(run, stage);
      pill.textContent = STAGE_LABELS[stage];
      timeline.appendChild(pill);
    });
    card.appendChild(timeline);

    const actions = document.createElement("div");
    actions.className = "actions-row";
    const viewBtn = document.createElement("button");
    viewBtn.className = "ghost small";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleSelectRun(run.runId || run.clientRunId);
    });
    actions.appendChild(viewBtn);

    if (run.artifacts?.pdf || run.artifacts?.json || run.artifacts?.tex) {
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "primary small";
      downloadBtn.textContent = "Download";
      downloadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleSelectRun(run.runId || run.clientRunId);
        handleDownload(run, "pdf");
      });
      actions.appendChild(downloadBtn);
    }
    card.appendChild(actions);

    card.addEventListener("click", () => handleSelectRun(run.runId || run.clientRunId));
    container.appendChild(card);
  });
};

const handleDownload = async (run, key) => {
  if (!run?.artifacts?.[key]) {
    setStatus("Artifact not ready.");
    return;
  }
  const extension = key === "json" || key === "baseline" || key === "final_resume" ? "json" : key === "job_text" ? "txt" : key;
  const filename = `${run.runId || run.clientRunId || "resume"}.${extension}`;
  try {
    await sendMessage({
      action: "DOWNLOAD_ARTIFACT",
      runId: run.runId || run.clientRunId,
      artifactKey: key,
      filename
    });
    setStatus(`Downloading ${filename}`);
  } catch (error) {
    setStatus(error.message || "Download failed");
  }
};

const loadExplainArtifacts = async (run) => {
  if (!run) return;
  const runId = run.runId || run.clientRunId;
  const cached = state.explainCache[runId];
  if (cached?.loading || cached?.data) return;
  state.explainCache[runId] = { loading: true };
  renderDetails();
  try {
    const tailoredPath = run.artifacts?.json || run.artifacts?.tailored || run.artifacts?.tailored_resume;
    if (!tailoredPath) throw new Error("tailored.json not available for this run");
    const tailored = await fetchJsonArtifact(tailoredPath);
    const baseline = run.artifacts?.baseline ? await fetchJsonArtifact(run.artifacts.baseline) : null;
    const finalResume = run.artifacts?.final_resume
      ? await fetchJsonArtifact(run.artifacts.final_resume)
      : tailored.final_resume || null;
    state.explainCache[runId] = {
      loading: false,
      data: {
        tailored,
        baseline,
        final_resume: finalResume || tailored?.final_resume || tailored,
        hasJobText: Boolean(run.artifacts?.job_text),
        artifacts: run.artifacts || {}
      }
    };
  } catch (error) {
    state.explainCache[runId] = {
      loading: false,
      error: error.message || "Unable to load explain artifacts"
    };
  }
  renderDetails();
};

const loadJobText = async (run, path) => {
  const runId = run?.runId || run?.clientRunId;
  if (!runId || !path) return;
  const cached = state.explainCache[runId] || {};
  if (cached.jobTextLoading || cached.jobText) return;
  state.explainCache[runId] = { ...cached, jobTextLoading: true };
  renderDetails();
  try {
    const text = await fetchTextArtifact(path);
    state.explainCache[runId] = { ...cached, jobTextLoading: false, jobText: text };
  } catch (error) {
    state.explainCache[runId] = { ...cached, jobTextLoading: false, jobTextError: error.message || "Unable to load job text" };
  }
  renderDetails();
};

const copyRunId = async (runId) => {
  try {
    await navigator.clipboard.writeText(runId);
    setStatus("Run ID copied");
  } catch (e) {
    setStatus("Unable to copy run ID");
  }
};

const toggleRequirementFilter = (reqId) => {
  state.explainFilter.requirement = state.explainFilter.requirement === reqId ? null : reqId;
  renderAll();
};

const setDetailsTab = (tab) => {
  state.ui.detailsTab = tab;
  sendMessage({ action: "SET_UI_STATE", ui_state: { detailsTab: tab } }).catch(() => {});
  renderAll();
};

const createExplainSection = (title, subtitle = "") => {
  const wrapper = document.createElement("details");
  wrapper.className = "explain-section";
  wrapper.open = true;
  const summary = document.createElement("summary");
  summary.className = "explain-summary";
  const titleEl = document.createElement("div");
  titleEl.className = "section-title";
  titleEl.textContent = title;
  summary.appendChild(titleEl);
  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "section-subtitle";
    sub.textContent = subtitle;
    summary.appendChild(sub);
  }
  wrapper.appendChild(summary);
  const body = document.createElement("div");
  body.className = "section-body";
  wrapper.appendChild(body);
  return { wrapper, body };
};

const renderRunOverview = (container, selectedRun) => {
  if (selectedRun.message && !selectedRun.error) {
    const msg = document.createElement("div");
    msg.className = "label";
    msg.textContent = selectedRun.message;
    container.appendChild(msg);
  }

  if (selectedRun.error) {
    const err = document.createElement("div");
    err.className = "warning-pill";
    err.textContent = selectedRun.error;
    container.appendChild(err);
  }

  if (selectedRun.artifacts) {
    const downloads = document.createElement("div");
    downloads.className = "downloads";
    ["pdf", "tex", "json", "baseline", "final_resume"].forEach((key) => {
      if (selectedRun.artifacts[key]) {
        const btn = document.createElement("button");
        btn.className = "primary small";
        btn.textContent = key.toUpperCase();
        btn.addEventListener("click", () => handleDownload(selectedRun, key));
        downloads.appendChild(btn);
      }
    });
    if (downloads.childElementCount) {
      container.appendChild(downloads);
    }
  }

  const copyBtn = document.createElement("button");
  copyBtn.className = "ghost small";
  copyBtn.textContent = "Copy run id";
  copyBtn.addEventListener("click", () => copyRunId(selectedRun.runId || selectedRun.clientRunId));
  const actions = document.createElement("div");
  actions.className = "actions-row";
  actions.appendChild(copyBtn);
  container.appendChild(actions);
};

const renderExplainTab = (container, selectedRun) => {
  const runId = selectedRun.runId || selectedRun.clientRunId;
  const cache = state.explainCache[runId];
  if (!cache) {
    container.textContent = "Loading explainability…";
    loadExplainArtifacts(selectedRun);
    return;
  }
  if (cache.loading) {
    container.textContent = "Loading explainability…";
    return;
  }
  if (cache.error) {
    container.textContent = `Explainability not available for this run: ${cache.error}`;
    return;
  }
  const data = cache.data || {};
  const tailored = data.tailored || {};
  const explain = buildExplainView(tailored);
  if (!Object.keys(explain).length && !isV3Tailored(tailored)) {
    container.textContent = "Explainability not available for this run (missing explain fields).";
    return;
  }
  const analysis = buildAnalysisView(tailored, explain);
  const job = tailored.job || {};
  const requirements = explain.requirements || {};
  const reqCatalog = buildRequirementCatalog(requirements);
  const reqCounts = buildReqCounts(explain.mappings?.bullet_to_requirements || []);
  const keywordMap = {};
  (explain.mappings?.keyword_inserts || []).forEach((m) => {
    if (m?.bullet_id) keywordMap[m.bullet_id] = m.keywords || [];
  });
  const bulletReqMap = {};
  (explain.mappings?.bullet_to_requirements || []).forEach((m) => {
    if (m?.bullet_id) bulletReqMap[m.bullet_id] = m.req_ids || [];
  });

  const actions = document.createElement("div");
  actions.className = "actions-row";
  const exportBtn = document.createElement("button");
  exportBtn.className = "ghost small";
  exportBtn.textContent = "Export explanation summary";
  exportBtn.addEventListener("click", () =>
    copyText(
      JSON.stringify(
        {
          run_id: runId,
          job: { title: job.title, company: job.company, raw_text_hash: job.raw_text_hash },
          analysis,
          explainability: explain
        },
        null,
        2
      ),
      "Explanation copied"
    )
  );
  actions.appendChild(exportBtn);
  if (state.explainFilter.requirement) {
    const clear = document.createElement("button");
    clear.className = "ghost small";
    clear.textContent = "Clear requirement filter";
    clear.addEventListener("click", () => toggleRequirementFilter(null));
    actions.appendChild(clear);
  }
  container.appendChild(actions);

  const sections = document.createElement("div");
  sections.className = "explain-grid";

  // Extracted
  const extracted = createExplainSection("What we extracted", "Structured fields + preview");
  const extractedList = document.createElement("div");
  extractedList.className = "kv-list";
  [
    ["Title", job.title || "—"],
    ["Company", job.company || "—"],
    ["Location", job.location || "—"],
    ["Platform", job.source_platform || "—"],
    ["Confidence", job.confidence !== undefined ? `${Math.round((job.confidence || 0) * 100)}%` : "—"],
    ["Hash", shortHash(job.raw_job_text_hash || job.raw_text_hash)]
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "kv-row";
    row.innerHTML = `<span class="muted">${label}</span><span>${escapeHtml(value)}</span>`;
    extractedList.appendChild(row);
  });
  extracted.body.appendChild(extractedList);
  const previewBlock = document.createElement("pre");
  previewBlock.className = "code-block";
  previewBlock.textContent = explain.job_preview?.extracted_preview || job.extracted_preview || "Not available for this run.";
  extracted.body.appendChild(previewBlock);
  if (data.hasJobText && data.artifacts?.job_text) {
    const fullBtn = document.createElement("button");
    fullBtn.className = "ghost small";
    fullBtn.textContent = cache.jobText ? "Hide full extracted text" : "View full extracted text";
    fullBtn.addEventListener("click", () => {
      if (cache.jobText) {
        state.explainCache[runId] = { ...cache, jobText: null };
        renderDetails();
        return;
      }
      loadJobText(selectedRun, data.artifacts.job_text);
    });
    extracted.body.appendChild(fullBtn);
    if (cache.jobTextLoading) {
      const loading = document.createElement("div");
      loading.className = "label";
      loading.textContent = "Fetching full text…";
      extracted.body.appendChild(loading);
    }
    if (cache.jobTextError) {
      const err = document.createElement("div");
      err.className = "warning-pill";
      err.textContent = cache.jobTextError;
      extracted.body.appendChild(err);
    }
    if (cache.jobText) {
      const fullText = document.createElement("pre");
      fullText.className = "code-block";
      fullText.textContent = cache.jobText;
      extracted.body.appendChild(fullText);
    }
  }
  sections.appendChild(extracted.wrapper);

  // Detected
  const detected = createExplainSection("What we detected", "Keywords + must-haves");
  const keywordRow = document.createElement("div");
  keywordRow.className = "pill-row";
  (analysis.top_keywords || []).forEach((kw) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = kw;
    keywordRow.appendChild(pill);
  });
  if (!keywordRow.childElementCount) {
    keywordRow.textContent = "Top keywords not available for this run.";
  } else {
    const copyKeywords = document.createElement("button");
    copyKeywords.className = "ghost small";
    copyKeywords.textContent = "Copy keywords";
    copyKeywords.addEventListener("click", () => copyText((analysis.top_keywords || []).join(", ")));
    detected.body.appendChild(copyKeywords);
  }
  detected.body.appendChild(keywordRow);

  const reqGroup = document.createElement("div");
  reqGroup.className = "requirements-group";
  ["must_have", "nice_to_have"].forEach((key) => {
    const list = requirements[key] || [];
    const title = document.createElement("div");
    title.className = "label";
    title.textContent = key === "must_have" ? "Must-haves" : "Nice-to-haves";
    reqGroup.appendChild(title);
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Not available for this run.";
      reqGroup.appendChild(empty);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "req-list";
    list.forEach((req) => {
      const li = document.createElement("li");
      li.textContent = req.text || "";
      ul.appendChild(li);
    });
    reqGroup.appendChild(ul);
    const copyBtn = document.createElement("button");
    copyBtn.className = "ghost small";
    copyBtn.textContent = `Copy ${key === "must_have" ? "must-haves" : "nice-to-haves"}`;
    copyBtn.addEventListener("click", () => copyText(list.map((r) => r.text).join(", ")));
    reqGroup.appendChild(copyBtn);
  });
  detected.body.appendChild(reqGroup);
  sections.appendChild(detected.wrapper);

  // Changes
  const changes = createExplainSection("What we changed", "Before/after bullets + keyword highlights");
  const changeEntries = [
    ...(explain.changes?.experience || []).map((entry) => ({ ...entry, label: "Experience" })),
    ...(explain.changes?.projects || []).map((entry) => ({ ...entry, label: "Projects" }))
  ];
  if (!changeEntries.length) {
    const empty = document.createElement("div");
    empty.textContent = "No change data available for this run.";
    changes.body.appendChild(empty);
  } else {
    changeEntries.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "change-card";
      const title = document.createElement("div");
      title.className = "label";
      title.textContent = `${entry.label}: ${entry.role_id || entry.project_id}`;
      card.appendChild(title);
      const max = Math.max(entry.before_bullets?.length || 0, entry.after_bullets?.length || 0);
      const bulletRows = document.createElement("div");
      bulletRows.className = "diff-grid";
      for (let i = 0; i < max; i += 1) {
        const bulletId = (entry.bullet_ids || [])[i] || `${entry.role_id || entry.project_id}_b${i + 1}`;
        const reqs = bulletReqMap[bulletId] || [];
        if (state.explainFilter.requirement && !reqs.includes(state.explainFilter.requirement)) continue;
        const beforeText = (entry.before_bullets || [])[i] || "—";
        const afterText = (entry.after_bullets || [])[i] || "—";
        const row = document.createElement("div");
        row.className = "diff-row";

        const beforeCol = document.createElement("div");
        beforeCol.className = "diff-col muted";
        beforeCol.innerHTML = `<div class="pill ghost">Before</div><div class="bullet-text">${escapeHtml(beforeText)}</div>`;

        const afterCol = document.createElement("div");
        afterCol.className = "diff-col";
        const highlightList = keywordMap[bulletId]?.length ? keywordMap[bulletId] : analysis.top_keywords || [];
        afterCol.innerHTML = `<div class="pill">After</div><div class="bullet-text" aria-label="after-bullet">${highlightKeywords(afterText, highlightList)}</div>`;

        const meta = document.createElement("div");
        meta.className = "bullet-meta";
        if (reqs.length) {
          reqs.forEach((reqId) => {
            const req = reqCatalog[reqId];
            if (!req) return;
            const chip = document.createElement("span");
            chip.className = `pill ${req.tier === "must" ? "must" : "nice"}`;
            chip.textContent = req.text;
            chip.title = `Requirement ${req.req_id}`;
            chip.addEventListener("click", () => toggleRequirementFilter(req.req_id));
            meta.appendChild(chip);
          });
        } else {
          const none = document.createElement("span");
          none.className = "muted";
          none.textContent = "No mapping available";
          meta.appendChild(none);
        }
        if (keywordMap[bulletId]?.length) {
          const kwChip = document.createElement("span");
          kwChip.className = "pill outline";
          kwChip.textContent = `Inserted: ${keywordMap[bulletId].join(", ")}`;
          meta.appendChild(kwChip);
        }

        row.appendChild(beforeCol);
        row.appendChild(afterCol);
        row.appendChild(meta);
        bulletRows.appendChild(row);
      }
      if (!bulletRows.childElementCount) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = state.explainFilter.requirement
          ? "No bullets mapped to the selected requirement."
          : "No bullet diffs available.";
        bulletRows.appendChild(empty);
      }
      card.appendChild(bulletRows);
      changes.body.appendChild(card);
    });
  }
  sections.appendChild(changes.wrapper);

  // Requirement mapping
  const mapping = createExplainSection("Requirement mapping", "Bullets supporting each requirement");
  const reqList = document.createElement("div");
  reqList.className = "requirement-list";
  const requirementsEntries = Object.values(reqCatalog);
  if (!requirementsEntries.length) {
    const empty = document.createElement("div");
    empty.textContent = "No requirements available for this run.";
    reqList.appendChild(empty);
  } else {
    requirementsEntries.forEach((req) => {
      const row = document.createElement("div");
      row.className = `requirement-row ${state.explainFilter.requirement === req.req_id ? "active" : ""}`;
      const text = document.createElement("div");
      text.textContent = req.text;
      const chips = document.createElement("div");
      chips.className = "pill-row";
      const tier = document.createElement("span");
      tier.className = `pill ${req.tier === "must" ? "must" : "nice"}`;
      tier.textContent = req.tier === "must" ? "Must-have" : "Nice-to-have";
      chips.appendChild(tier);
      const count = document.createElement("span");
      count.className = "pill outline";
      count.textContent = `${reqCounts[req.req_id] || 0} bullets`;
      chips.appendChild(count);
      row.appendChild(text);
      row.appendChild(chips);
      row.addEventListener("click", () => toggleRequirementFilter(req.req_id));
      reqList.appendChild(row);
    });
  }
  mapping.body.appendChild(reqList);
  sections.appendChild(mapping.wrapper);

  container.appendChild(sections);
};

const renderDetails = () => {
  const container = elements.detailsContent;
  container.textContent = "";

  const selectedRun =
    state.runs.find((r) => r.runId === state.ui.selectedRunId || r.clientRunId === state.ui.selectedRunId) || null;
  const selectedCapture = state.captures.find((c) => c.captureId === state.ui.selectedCaptureId) || null;

  if (selectedRun) {
    const header = document.createElement("div");
    header.className = "details-header";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `Run ${selectedRun.runId || selectedRun.clientRunId}`;
    header.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${STAGE_LABELS[selectedRun.stage] || "Pending"} · ${formatDate(selectedRun.updatedAt)} · ${formatDuration(selectedRun.durationSec)}`;
    header.appendChild(meta);

    const captureLine = document.createElement("div");
    captureLine.className = "label";
    captureLine.textContent = `Capture: ${selectedRun.captureId}`;
    header.appendChild(captureLine);
    container.appendChild(header);

    const tabs = document.createElement("div");
    tabs.className = "tab-bar";
    ["overview", "explain"].forEach((tab) => {
      const btn = document.createElement("button");
      btn.className = `pill tab ${state.ui.detailsTab === tab ? "active" : ""}`;
      btn.textContent = tab === "overview" ? "Overview" : "Explain";
      btn.addEventListener("click", () => setDetailsTab(tab));
      tabs.appendChild(btn);
    });
    container.appendChild(tabs);

    const body = document.createElement("div");
    body.className = "details-body";
    if (state.ui.detailsTab === "explain") {
      renderExplainTab(body, selectedRun);
    } else {
      renderRunOverview(body, selectedRun);
    }
    container.appendChild(body);
    return;
  }

  if (selectedCapture) {
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = selectedCapture.job.title || "Untitled role";
    container.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${selectedCapture.job.company || "—"} · ${formatUrl(selectedCapture.tab.url)} · ${formatDate(selectedCapture.capturedAt)}`;
    container.appendChild(meta);

    const preview = document.createElement("div");
    preview.className = "preview";
    preview.textContent = selectedCapture.rawTextPreview || "No preview captured.";
    container.appendChild(preview);

    if (selectedCapture.warnings?.length) {
      const warn = document.createElement("div");
      warn.className = "warnings";
      warn.innerHTML = renderWarnings(selectedCapture.warnings);
      container.appendChild(warn);
    }

    const chips = document.createElement("div");
    chips.className = "timeline";
    const confidence = document.createElement("div");
    confidence.className = `chip ${selectedCapture.confidence >= 0.75 ? "good" : selectedCapture.confidence >= 0.55 ? "muted" : "warn"}`;
    confidence.textContent = `${Math.round(selectedCapture.confidence * 100)}% confidence`;
    chips.appendChild(confidence);
    const hash = document.createElement("div");
    hash.className = "chip muted";
    const rawHash = (selectedCapture.job.rawTextHash || "").slice(0, 12) || "hash-unset";
    hash.textContent = rawHash;
    chips.appendChild(hash);
    container.appendChild(chips);

    return;
  }

  container.textContent = "Select a capture or run to view details.";
};

const renderAll = () => {
  renderHealth();
  renderTabs();
  renderCaptures();
  renderRuns();
  renderDetails();
  elements.analyzeBtn.disabled = !state.backendHealthy || !state.ui.selectedCaptureId;
};

const handleScopeToggle = async (checked) => {
  state.ui.tabScope = checked ? "allWindows" : "currentWindow";
  await sendMessage({ action: "SET_UI_STATE", ui_state: { tabScope: state.ui.tabScope } }).catch(() => {});
  refreshTabs();
};

const attachEvents = () => {
  elements.refreshTabsBtn.addEventListener("click", refreshTabs);
  elements.extractBtn.addEventListener("click", handleExtract);
  elements.analyzeBtn.addEventListener("click", handleAnalyze);
  elements.allWindowsToggle.addEventListener("change", (e) => handleScopeToggle(e.target.checked));
  elements.tabSelect.addEventListener("change", (e) => {
    const val = Number(e.target.value);
    state.ui.selectedTabId = Number.isNaN(val) ? null : val;
    sendMessage({ action: "SET_UI_STATE", ui_state: { selectedTabId: state.ui.selectedTabId } }).catch(() => {});
  });
  elements.refreshCapturesBtn.addEventListener("click", loadState);
  elements.refreshRunsBtn.addEventListener("click", loadState);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.captures) state.captures = changes.captures.newValue || [];
    if (changes.runs) state.runs = changes.runs.newValue || [];
    if (changes.ui_state) state.ui = { ...DEFAULT_UI, ...(changes.ui_state.newValue || {}) };
    renderAll();
  });
};

const init = async () => {
  attachEvents();
  await loadState();
  await refreshTabs();
  await checkBackendHealth();
  setStatus("Ready.");
};

init();
