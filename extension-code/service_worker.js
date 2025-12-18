/* global chrome */

// Keep injection minimal and reliable. (The repo does not include lib/readability.js.)
const CONTENT_FILES = ["content_script.js"];
const BACKEND_BASE_URL = "https://resume-intelligence-nine.vercel.app";
const DEFAULT_UI_STATE = {
  tabScope: "currentWindow",
  selectedCaptureId: null,
  selectedRunId: null,
  selectedTabId: null,
  selectedTabIds: [],
  detailsTab: "overview"
};

const STORAGE_KEYS = ["captures", "runs", "ui_state"];
const DEBUG_LOG_KEY = "debug_logs";
const DEBUG_LOG_LIMIT = 80;

const PIPELINE_STAGE_MAP = {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const storageGet = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result));
  });

const storageSet = (payload) =>
  new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });

const logDebug = async (event, data) => {
  try {
    const entry = {
      ts: new Date().toISOString(),
      event,
      data: data || null
    };
    const current = (await storageGet(DEBUG_LOG_KEY))[DEBUG_LOG_KEY] || [];
    const next = [entry, ...current].slice(0, DEBUG_LOG_LIMIT);
    await storageSet({ [DEBUG_LOG_KEY]: next });
    // eslint-disable-next-line no-console
    console.log("[sidepanel-debug]", event, data || "");
  } catch (e) {
    // swallow logging errors
  }
};

const sendTabMessage = (tabId, payload) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const injectScripts = (tabId) =>
  new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: CONTENT_FILES
      },
      (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      }
    );
  });

const queryTabs = (query) =>
  new Promise((resolve, reject) => {
    chrome.tabs.query(query, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs);
    });
  });

const EXT_ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");
const DASHBOARD_URL = chrome.runtime.getURL("dashboard.html");

const isExtensionUrl = (url) => Boolean(url && url.startsWith(EXT_ORIGIN));
const isDashboardUrl = (url) => Boolean(url && url.startsWith(DASHBOARD_URL));

const getTab = (tabId) =>
  new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });

const mapTabForUi = (tab) => ({
  id: tab.id,
  title: tab.title,
  url: tab.url,
  favIconUrl: tab.favIconUrl || "",
  active: tab.active,
  windowId: tab.windowId,
  index: tab.index,
  isDashboard: isDashboardUrl(tab.url)
});

async function ensureContentScripts(tabId) {
  try {
    const ping = await sendTabMessage(tabId, { type: "ping" });
    if (ping && ping.ok) return;
  } catch (e) {
    // will inject below
  }
  await injectScripts(tabId);
}

const mapBackendStage = (stage) => {
  if (!stage) return null;
  const normalized = stage.toString().toUpperCase();
  return PIPELINE_STAGE_MAP[normalized] || null;
};

const hashString = async (value) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value || "");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const truncate = (value, limit) => {
  if (!value) return "";
  return value.length > limit ? value.slice(0, limit) : value;
};

const makeShortQueueId = () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "Q-";
  for (let i = 0; i < 4; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
};

const getDefaultedState = (state) => ({
  captures: state.captures || [],
  runs: state.runs || [],
  ui_state: { ...DEFAULT_UI_STATE, ...(state.ui_state || {}) }
});

const readState = async () => {
  const state = await storageGet(STORAGE_KEYS);
  return getDefaultedState(state);
};

const persistUiState = async (partial) => {
  const { ui_state } = await readState();
  const next = { ...ui_state, ...partial };
  await storageSet({ ui_state: next });
  return next;
};

const upsertCapture = async (capture) => {
  const state = await readState();
  const captures = state.captures || [];
  const existingIdx = captures.findIndex((c) => c.captureId === capture.captureId);
  let updated = captures;
  if (existingIdx >= 0) {
    updated = [...captures];
    updated[existingIdx] = { ...captures[existingIdx], ...capture };
  } else {
    updated = [capture, ...captures];
  }
  await storageSet({ captures: updated });
  return updated;
};

const upsertRun = async (runUpdate) => {
  const state = await readState();
  const runs = state.runs || [];
  const matchIndex = runs.findIndex(
    (r) => r.runId === runUpdate.runId || (runUpdate.clientRunId && r.clientRunId === runUpdate.clientRunId)
  );
  const nowIso = new Date().toISOString();
  let merged = { ...runUpdate };
  if (matchIndex >= 0) {
    const existing = runs[matchIndex];
    merged = {
      ...existing,
      ...runUpdate
    };
    merged.startedAt = existing.startedAt || runUpdate.startedAt || nowIso;
  } else {
    merged.startedAt = runUpdate.startedAt || nowIso;
  }
  merged.updatedAt = nowIso;
  const durationMs = Date.parse(merged.updatedAt) - Date.parse(merged.startedAt);
  if (Number.isFinite(durationMs)) {
    merged.durationSec = Math.max(0, Math.round(durationMs / 1000));
  }
  if (!merged.message && merged.error) {
    merged.message = merged.error;
  }
  const nextRuns = matchIndex >= 0 ? [...runs] : [merged, ...runs];
  if (matchIndex >= 0) {
    nextRuns[matchIndex] = merged;
  }
  nextRuns.sort((a, b) => Date.parse(b.startedAt || b.updatedAt || 0) - Date.parse(a.startedAt || a.updatedAt || 0));
  await storageSet({ runs: nextRuns });
  return merged;
};

const removeCapture = async (captureId) => {
  const state = await readState();
  const nextCaptures = (state.captures || []).filter((c) => c.captureId !== captureId);
  await storageSet({ captures: nextCaptures });
  const uiNext = { ...state.ui_state };
  if (uiNext.selectedCaptureId === captureId) {
    uiNext.selectedCaptureId = null;
    await storageSet({ ui_state: uiNext });
  }
  return nextCaptures;
};

const removeRun = async (runId) => {
  const state = await readState();
  const nextRuns = (state.runs || []).filter((r) => r.runId !== runId && r.clientRunId !== runId);
  await storageSet({ runs: nextRuns });
  const uiNext = { ...state.ui_state };
  if (uiNext.selectedRunId === runId) {
    uiNext.selectedRunId = null;
    await storageSet({ ui_state: uiNext });
  }
  return nextRuns;
};

const buildWarnings = (extraction) => {
  const warnings = [];
  if (!extraction?.job?.description_text) warnings.push("missing_description");
  if ((extraction?.meta?.confidence || 0) < 0.55) warnings.push("low_confidence");
  if (extraction?.meta?.extraction_method && extraction.meta.extraction_method !== "jsonld") {
    warnings.push("readability_fallback");
  }
  return warnings;
};

const sanitizeArray = (items, limit = 8, itemLimit = 200) => {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, limit)
    .map((entry) => truncate((entry || "").toString(), itemLimit))
    .filter(Boolean);
};

const buildCaptureRecord = async (extraction, tab) => {
  const rawText = extraction?.job?.description_text || "";
  const captureId = `cap_${Date.now().toString(16)}`;
  const rawTextHash = await hashString(rawText);
  const rawTextPreview = truncate(rawText, 500);

  const capture = {
    captureId,
    tab: {
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl || ""
    },
    capturedAt: new Date().toISOString(),
    platform: extraction?.meta?.platform || "other",
    confidence: extraction?.meta?.confidence || 0,
    warnings: buildWarnings(extraction),
    job: {
      title: extraction?.job?.title || "",
      company: extraction?.job?.company || "",
      location: extraction?.job?.location || "",
      rawTextHash
    },
    rawTextPreview,
    tags: extraction?.meta?.user_tags || [],
    notes: extraction?.meta?.notes || "",
    meta: {
      extraction_method: extraction?.meta?.extraction_method || "unknown"
    }
  };

  const requirements = sanitizeArray(extraction?.job?.requirements);
  const niceToHave = sanitizeArray(extraction?.job?.nice_to_have);
  if (requirements.length) capture.job.requirements = requirements;
  if (niceToHave.length) capture.job.nice_to_have = niceToHave;
  return capture;
};

const runExtractionOnTab = async (tabId, { includeDebug = false } = {}) => {
  await ensureContentScripts(tabId);
  const response = await sendTabMessage(tabId, { type: "extract_job", includeDebug });
  if (!response || !response.ok) {
    throw new Error(response?.error || "Extraction failed");
  }
  return response.data;
};

const extractAndStoreCapture = async (tabId) => {
  const extraction = await runExtractionOnTab(tabId, { includeDebug: false });
  let tab;
  try {
    tab = await getTab(tabId);
  } catch (e) {
    tab = null;
  }
  const tabMeta =
    tab || {
      id: tabId,
      windowId: null,
      url: extraction.meta?.url || "",
      title: extraction.job?.title || "Unknown tab",
      favIconUrl: ""
    };
  const capture = await buildCaptureRecord(extraction, tabMeta);
  await upsertCapture(capture);
  await persistUiState({ selectedCaptureId: capture.captureId, selectedTabId: tabId });
  return { capture, extraction, tab: tabMeta };
};

const getBackendHealth = async () => {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/health`);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json().catch(() => ({}));
    return { ok: true, status: data.status || "ok" };
  } catch (error) {
    return { ok: false, error: error.message || "Backend offline" };
  }
};

const downloadArtifact = (url, filename) =>
  new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: true }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(id);
    });
  });

const pollRunStatus = async ({ backendRunId, clientRunId }) => {
  let delay = 750;
  while (true) {
    const res = await fetch(`${BACKEND_BASE_URL}/api/status/${backendRunId}`);
    if (!res.ok) {
      throw new Error(`Status check failed (${res.status})`);
    }
    const data = await res.json();
    const stage = mapBackendStage(data.stage) || "ANALYZING";
    const result = data.status === "success" ? "success" : data.status === "error" ? "error" : "pending";
    const runId = data.run_id || backendRunId;
    const artifacts = data.files || {};
    const message = data.message || null;
    const coverageRaw = data.coverage_percent ?? data.coverage ?? data.coverage_ratio;
    const coverage =
      typeof coverageRaw === "number"
        ? coverageRaw > 1
          ? Math.round(coverageRaw)
          : Math.round(coverageRaw * 100)
        : null;
    const topKeywords = Array.isArray(data.top_keywords) ? data.top_keywords.filter(Boolean) : [];
    const uncovered = Array.isArray(data.uncovered_requirements) ? data.uncovered_requirements.filter(Boolean) : [];

    await upsertRun({
      runId,
      clientRunId,
      backendRunId: runId,
      status: stage,
      stage,
      result,
      message,
      artifacts,
      coverage,
      top_keywords: topKeywords,
      uncovered_requirements: uncovered,
      error: result === "error" ? data.message || "Pipeline error" : null
    });

    if (result === "error") {
      throw new Error(data.message || "Pipeline error");
    }
    if (stage === "DONE" && result === "success") {
      return artifacts;
    }
    await sleep(delay);
    delay = Math.min(1500, delay + 250);
  }
};

const handleAnalyzeCapture = async (captureId, queueContext = null, clientRunIdOverride = null) => {
  const { captures } = await readState();
  const capture = captures.find((c) => c.captureId === captureId);
  if (!capture) {
    throw new Error("Capture not found");
  }
  if (!capture.tab?.tabId) {
    throw new Error("Capture has no tab reference");
  }
  const health = await getBackendHealth();
  if (!health.ok) {
    throw new Error("Backend offline — analysis disabled.");
  }

  const clientRunId = clientRunIdOverride || `run_${Date.now().toString(16)}`;
  const queueMeta = queueContext || { queueId: makeShortQueueId(), queuePosition: 1, queueSize: 1, queueLabel: null };
  const baseRun = {
    runId: clientRunId,
    clientRunId,
    queueId: queueMeta.queueId || clientRunId,
    queuePosition: Number.isFinite(queueMeta.queuePosition) ? queueMeta.queuePosition : 1,
    queueSize: Number.isFinite(queueMeta.queueSize) ? queueMeta.queueSize : 1,
    queueLabel: queueMeta.queueLabel || null,
    captureId,
    title: capture?.job?.title || "",
    company: capture?.job?.company || "",
    startedAt: new Date().toISOString(),
    status: "EXTRACTING",
    stage: "EXTRACTING",
    result: "pending",
    artifacts: {},
    tab: capture.tab,
    platform: capture.platform,
    error: null,
    responseReceivedAt: null
  };
  await upsertRun(baseRun);
  await persistUiState({ selectedRunId: clientRunId });

  let backendRunId = clientRunId;
  try {
    if (stopRunIds.has(clientRunId) || stopQueueIds.has(queueMeta.queueId)) {
      throw new Error("Run stopped by user");
    }
    const freshExtraction = await runExtractionOnTab(capture.tab.tabId, { includeDebug: false });

    const payload = {
      job_payload: freshExtraction,
      resume_id: "default",
      options: {
        page_limit: 1,
        style: "ats_clean",
        debug: false
      }
    };

    const response = await fetch(`${BACKEND_BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      await upsertRun({
        ...baseRun,
        status: "ERROR",
        stage: "ERROR",
        result: "error",
        error: `Backend error (${response.status})`
      });
      throw new Error(`Backend error (${response.status})`);
    }
    const data = await response.json();
    const backendStage = mapBackendStage(data.stage) || "ANALYZING";
    backendRunId = data.run_id || clientRunId;
    await upsertRun({
      ...baseRun,
      runId: backendRunId,
      clientRunId,
      backendRunId,
      queueId: queueMeta.queueId || clientRunId,
      queuePosition: Number.isFinite(queueMeta.queuePosition) ? queueMeta.queuePosition : 1,
      queueSize: Number.isFinite(queueMeta.queueSize) ? queueMeta.queueSize : 1,
      queueLabel: queueMeta.queueLabel || null,
      status: backendStage,
      stage: backendStage,
      result: data.status || "pending",
      message: data.message || null,
      artifacts: data.files || {}
    });

    if (data.status === "success" && (data.files?.pdf || data.files?.json || data.files?.tex)) {
      await upsertRun({
        runId: backendRunId,
        clientRunId,
        queueId: queueMeta.queueId || clientRunId,
        queuePosition: Number.isFinite(queueMeta.queuePosition) ? queueMeta.queuePosition : 1,
        queueSize: Number.isFinite(queueMeta.queueSize) ? queueMeta.queueSize : 1,
        queueLabel: queueMeta.queueLabel || null,
        backendRunId,
        status: "DONE",
        stage: "DONE",
        result: "success",
        artifacts: data.files
      });
      return { runId: backendRunId, artifacts: data.files };
    }

    await pollRunStatus({ backendRunId, clientRunId });
    return { runId: backendRunId };
  } catch (error) {
    // honor stop for individual run or queue
    if (stopRunIds.has(clientRunId) || stopRunIds.has(backendRunId) || stopQueueIds.has(queueMeta.queueId)) {
      error = new Error("Run stopped by user");
    }
    await upsertRun({
      ...baseRun,
      runId: backendRunId,
      clientRunId,
      queueId: queueMeta.queueId || clientRunId,
      queuePosition: Number.isFinite(queueMeta.queuePosition) ? queueMeta.queuePosition : 1,
      queueSize: Number.isFinite(queueMeta.queueSize) ? queueMeta.queueSize : 1,
      queueLabel: queueMeta.queueLabel || null,
      backendRunId,
      status: "ERROR",
      stage: "ERROR",
      result: "error",
      error: error.message || "Analyze failed",
      message: error.message || "Analyze failed"
    });
    throw error;
  }
};

const handleStartQueue = async (tabIds = []) => {
  const uniqueIds = Array.from(new Set((tabIds || []).filter((id) => Number.isFinite(Number(id)))));
  if (!uniqueIds.length) {
    throw new Error("No tabs selected for queue");
  }

  const queueId = makeShortQueueId();
  const tabsMeta = (
    await Promise.all(
      uniqueIds.map(async (tabId) => {
        try {
          const tab = await getTab(Number(tabId));
          return mapTabForUi(tab);
        } catch (error) {
          await logDebug("queue:getTab_failed", { tabId, error: error?.message });
          return null;
        }
      })
    )
  )
    .filter(Boolean)
    .filter((tab) => !tab.isDashboard);

  if (!tabsMeta.length) {
    throw new Error("No valid tabs for queue (dashboard tabs are excluded)");
  }

  const ordered = [...tabsMeta].sort((a, b) => {
    if (a.windowId !== b.windowId) return (a.windowId || 0) - (b.windowId || 0);
    return (a.index || 0) - (b.index || 0);
  });

  const queueSize = ordered.length;
  const results = [];

  // Upfront extraction and pending run creation
  const prepared = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const tab = ordered[i];
    const position = i + 1;
    try {
      const { capture } = await extractAndStoreCapture(tab.id);
      const clientRunId = `${queueId}_${position}`;
      await upsertRun({
        runId: clientRunId,
        clientRunId,
        queueId,
        queuePosition: position,
        queueSize,
        queueLabel: null,
        captureId: capture.captureId,
        startedAt: new Date().toISOString(),
        status: "EXTRACTING",
        stage: "EXTRACTING",
        result: "pending",
        artifacts: {},
        tab: capture.tab,
        platform: capture.platform,
        error: null,
        message: "Queued"
      });
      prepared.push({ tab, position, capture, clientRunId });
      results.push({ ok: true, tabId: tab.id, captureId: capture.captureId, runId: clientRunId, position });
    } catch (error) {
      const clientRunId = `${queueId}_${position}_err`;
      await upsertRun({
        runId: clientRunId,
        clientRunId,
        queueId,
        queuePosition: position,
        queueSize,
        queueLabel: null,
        startedAt: new Date().toISOString(),
        status: "ERROR",
        stage: "ERROR",
        result: "error",
        message: error?.message || "Queue step failed",
        error: error?.message || "Queue step failed",
        tab: { tabId: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title }
      });
      results.push({ ok: false, tabId: tab.id, error: error?.message || "Queue step failed", position });
    }
  }

  // Sequential analyze; continue even if a step fails unless user stops queue
  for (let idx = 0; idx < prepared.length; idx += 1) {
    const item = prepared[idx];
    const { capture, position, clientRunId } = item;
    if (stopQueueIds.has(queueId)) {
      await upsertRun({
        runId: clientRunId,
        clientRunId,
        queueId,
        queuePosition: position,
        queueSize,
        queueLabel: null,
        status: "ERROR",
        stage: "ERROR",
        result: "error",
        message: "Queue stopped by user",
        error: "Queue stopped by user"
      });
      results.push({
        ok: false,
        tabId: capture.tab?.tabId,
        error: "Queue stopped by user",
        position
      });
      continue;
    }
    try {
      await handleAnalyzeCapture(
        capture.captureId,
        {
          queueId,
          queuePosition: position,
          queueSize,
          queueLabel: null
        },
        clientRunId
      );
    } catch (error) {
      results.push({ ok: false, tabId: capture.tab?.tabId, error: error?.message || "Analyze failed", position });
      // current run already updated to ERROR inside handleAnalyzeCapture; continue to next
    }
  }

  await persistUiState({ selectedRunId: results.find((r) => r.runId)?.runId || null, activeQueueId: queueId });
  return { queueId, queueSize, results };
};

const stopQueueIds = new Set();
const stopRunIds = new Set();

const shouldBackfillRun = (run) => {
  const needsTitle = !run?.title;
  const needsCompany = !run?.company;
  const needsCoverage = run?.result === "success" && (run?.coverage === null || run?.coverage === undefined);
  const needsKeywords = !Array.isArray(run?.top_keywords) && !Array.isArray(run?.keywords);
  const needsUncovered = !Array.isArray(run?.uncovered_requirements) && !Array.isArray(run?.uncovered);
  return needsTitle || needsCompany || needsCoverage || needsKeywords || needsUncovered;
};

const backfillRunInsights = async ({ limit = 200 } = {}) => {
  const health = await getBackendHealth();
  if (!health.ok) {
    throw new Error("Backend offline — backfill unavailable.");
  }

  const state = await readState();
  const runs = state.runs || [];
  const captures = state.captures || [];
  const captureById = new Map(captures.map((c) => [c.captureId, c]));

  const targets = runs.filter(shouldBackfillRun).slice(0, limit);
  if (!targets.length) {
    return { updated: 0, total: runs.length };
  }

  const byId = new Map(runs.map((r) => [r.runId, r]));
  let updated = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const run = targets[i];
    const id = run?.backendRunId || run?.runId;
    if (!id) continue;
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/status/${encodeURIComponent(id)}`);
      if (!res.ok) continue;
      const data = await res.json();

      const coverageRaw = data.coverage_percent ?? data.coverage ?? data.coverage_ratio;
      const coverage =
        typeof coverageRaw === "number"
          ? coverageRaw > 1
            ? Math.round(coverageRaw)
            : Math.round(coverageRaw * 100)
          : null;

      const topKeywords = Array.isArray(data.top_keywords) ? data.top_keywords.filter(Boolean) : [];
      const uncovered = Array.isArray(data.uncovered_requirements) ? data.uncovered_requirements.filter(Boolean) : [];

      const cap = run.captureId ? captureById.get(run.captureId) : null;
      const title =
        run.title ||
        data.job_title ||
        data.title ||
        cap?.job?.title ||
        "";
      const company =
        run.company ||
        data.company ||
        cap?.job?.company ||
        "";
      const sourcePlatform = (data.source_platform || "").toString();

      const merged = {
        ...run,
        title,
        company,
        ...(sourcePlatform ? { platform: sourcePlatform } : {}),
        ...(typeof coverage === "number" ? { coverage } : {}),
        ...(topKeywords.length ? { top_keywords: topKeywords } : {}),
        ...(uncovered.length ? { uncovered_requirements: uncovered } : {})
      };

      byId.set(run.runId, merged);
      updated += 1;
    } catch (e) {
      // keep going
    }
    await sleep(75);
  }

  const nextRuns = runs.map((r) => byId.get(r.runId) || r);
  await storageSet({ runs: nextRuns });
  return { updated, total: runs.length };
};

const syncBackendRuns = async ({ limit = 500 } = {}) => {
  const health = await getBackendHealth();
  if (!health.ok) {
    throw new Error("Backend offline — sync unavailable.");
  }
  const res = await fetch(`${BACKEND_BASE_URL}/api/runs?limit=${encodeURIComponent(limit)}`);
  if (!res.ok) {
    throw new Error(`Sync failed (HTTP ${res.status})`);
  }
  const data = await res.json().catch(() => null);
  const list = Array.isArray(data?.runs) ? data.runs : [];
  let updated = 0;
  for (const r of list) {
    const runId = r.run_id || r.runId;
    if (!runId) continue;
    const platform = (r?.job?.platform || r?.source_platform || r?.platform || "").toString();
    await upsertRun({
      runId: runId.toString(),
      backendRunId: runId.toString(),
      title: r?.job?.title || r?.job_title || r?.title || "",
      company: r?.job?.company || r?.company || "",
      platform: platform || "other",
      status: mapBackendStage(r.stage) || r.stage || "ANALYZING",
      stage: mapBackendStage(r.stage) || r.stage || "ANALYZING",
      result: r.status === "success" ? "success" : r.status === "error" ? "error" : "pending",
      message: r.message || null,
      artifacts: r.files || {},
      startedAt: r.startedAt || null,
      updatedAt: r.updatedAt || null,
      coverage: typeof r.coverage_percent === "number" ? Math.round(r.coverage_percent) : r.coverage ?? null,
      top_keywords: Array.isArray(r.top_keywords) ? r.top_keywords : [],
      uncovered_requirements: Array.isArray(r.uncovered_requirements) ? r.uncovered_requirements : []
    });
    updated += 1;
    await sleep(25);
  }
  return { updated, total: list.length };
};

const stopPendingRuns = async ({ queueId = null, runId = null, message = "Stopped by user" }) => {
  const state = await readState();
  const runs = state.runs || [];
  const next = runs.map((r) => {
    const matchQueue = queueId && (r.queueId === queueId || r.runId === queueId || r.clientRunId === queueId);
    const matchRun = runId && (r.runId === runId || r.clientRunId === runId);
    if ((matchQueue || matchRun) && r.result === "pending") {
      return {
        ...r,
        status: "ERROR",
        stage: "ERROR",
        result: "error",
        message,
        error: message
      };
    }
    return r;
  });
  await storageSet({ runs: next });
};

const handleGetTabs = async (scope) => {
  const query = scope === "allWindows" ? {} : { currentWindow: true };
  const tabs = await queryTabs(query);
  const mapped = tabs.map((tab) => mapTabForUi(tab));
  // Only return non-extension pages (avoid any chrome-extension:// pages).
  return mapped.filter((tab) => !isExtensionUrl(tab.url));
};

const storageRemove = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve());
  });

const setStartRunPrefill = async (prefill) => {
  // Stored as a single-use handoff to the dashboard. The dashboard should consume & clear it.
  await storageSet({ start_run_prefill: prefill || null });
};

const openOrFocusDashboardTab = async ({ routeHash = "#/start-run" } = {}) => {
  const url = `${DASHBOARD_URL}${routeHash || ""}`;
  const existing = await queryTabs({ url: `${DASHBOARD_URL}*` }).catch(() => []);
  if (existing && existing.length) {
    // Prefer the most recently active dashboard tab.
    const target = existing.find((t) => t.active) || existing[0];
    await chrome.tabs.update(target.id, { active: true, url });
    await chrome.windows.update(target.windowId, { focused: true }).catch(() => undefined);
    return { tabId: target.id, reused: true };
  }
  const created = await new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
  return { tabId: created.id, reused: false };
};

const tabFirstLaunchFromActiveTab = async (tab) => {
  const tabId = tab?.id;
  if (!tabId) {
    await openOrFocusDashboardTab({ routeHash: "#/start-run" });
    return;
  }

  // Best-effort extraction so the dashboard can show a confident prefilled start.
  let capture = null;
  try {
    const result = await extractAndStoreCapture(tabId);
    capture = result?.capture || null;
  } catch (error) {
    await logDebug("actionClick:extract_failed", { tabId, error: error?.message || String(error) });
  }

  // Persist UI intent for Start Run selection.
  await persistUiState({
    tabScope: "currentWindow",
    selectedTabId: tabId,
    selectedTabIds: [tabId]
  }).catch(() => undefined);

  await setStartRunPrefill({
    source: "action_click",
    tabId,
    url: tab.url || null,
    title: tab.title || null,
    captureId: capture?.captureId || null,
    capturedAt: capture?.capturedAt || null
  });

  await openOrFocusDashboardTab({ routeHash: "#/start-run" });
};

chrome.action.onClicked.addListener((tab) => {
  tabFirstLaunchFromActiveTab(tab).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return undefined;

  const respond = (payload) => sendResponse(payload);
  const fail = (error) => sendResponse({ ok: false, error: error?.message || String(error) });

  switch (message.action) {
    case "OPEN_DASHBOARD": {
      (async () => {
        try {
          // Optional: allow callers to attach prefill (consumed by Start Run).
          if (message.prefill) {
            await setStartRunPrefill(message.prefill);
          }
          if (message.ui_state) {
            await persistUiState(message.ui_state);
          }
          const routeHash = message.routeHash || "#/start-run";
          const out = await openOrFocusDashboardTab({ routeHash });
          respond({ ok: true, ...out });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "start_extraction": {
      (async () => {
        try {
          const [tab] = await queryTabs({ active: true, currentWindow: true });
          if (!tab || !tab.id) {
            respond({ ok: false, error: "No active tab found." });
            return;
          }
          await ensureContentScripts(tab.id);
          const result = await sendTabMessage(tab.id, {
            type: "extract_job",
            includeDebug: Boolean(message.includeDebug)
          });
          respond(result);
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "GET_STATE": {
      readState()
        .then((state) => respond({ ok: true, ...state }))
        .catch((err) => fail(err));
      return true;
    }
    case "GET_TABS": {
      handleGetTabs(message.scope || "currentWindow")
        .then((tabs) => respond({ ok: true, tabs }))
        .catch((err) => fail(err));
      return true;
    }
    case "START_QUEUE": {
      handleStartQueue(message.tabIds || [])
        .then((output) => respond({ ok: true, ...output }))
        .catch((err) => fail(err));
      return true;
    }
    case "STOP_QUEUE": {
      if (!message.queueId) {
        fail(new Error("queueId required"));
        return true;
      }
      stopQueueIds.add(message.queueId);
      stopPendingRuns({ queueId: message.queueId, message: "Queue stopped by user" }).catch(() => undefined);
      respond({ ok: true });
      return true;
    }
    case "STOP_RUN": {
      if (!message.runId) {
        fail(new Error("runId required"));
        return true;
      }
      stopRunIds.add(message.runId);
      stopPendingRuns({ runId: message.runId, message: "Run stopped by user" }).catch(() => undefined);
      respond({ ok: true });
      return true;
    }
    case "STOP_QUEUE": {
      try {
        if (!message.queueId) throw new Error("queueId required");
        stopQueueIds.add(message.queueId);
        respond({ ok: true });
      } catch (err) {
        fail(err);
      }
      return true;
    }
    case "SET_UI_STATE": {
      persistUiState(message.ui_state || {})
        .then((next) => respond({ ok: true, ui_state: next }))
        .catch((err) => fail(err));
      return true;
    }
    case "CONSUME_START_RUN_PREFILL": {
      (async () => {
        try {
          const res = await storageGet(["start_run_prefill"]);
          const prefill = res?.start_run_prefill || null;
          await storageRemove(["start_run_prefill"]);
          respond({ ok: true, prefill });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "EXTRACT_FROM_TAB": {
      (async () => {
        try {
          if (!message.tabId) throw new Error("tabId required");
          const result = await extractAndStoreCapture(message.tabId);
          respond({ ok: true, capture: result.capture });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "DELETE_CAPTURE": {
      removeCapture(message.captureId)
        .then((captures) => respond({ ok: true, captures }))
        .catch((err) => fail(err));
      return true;
    }
    case "DELETE_RUN": {
      removeRun(message.runId)
        .then((runs) => respond({ ok: true, runs }))
        .catch((err) => fail(err));
      return true;
    }
    case "SET_RUN_USER_FIELDS": {
      (async () => {
        try {
          const { runId, user } = message || {};
          if (!runId) throw new Error("runId required");
          if (!user || typeof user !== "object") throw new Error("user patch required");

          const state = await readState();
          const runs = state.runs || [];
          const idx = runs.findIndex((r) => r.runId === runId || r.clientRunId === runId);
          if (idx < 0) throw new Error("Run not found");

          const existing = runs[idx] || {};
          const nextRun = {
            ...existing,
            responseReceivedAt:
              typeof user.responseReceivedAt === "string" || user.responseReceivedAt === null
                ? user.responseReceivedAt
                : existing.responseReceivedAt
          };

          const nextRuns = [...runs];
          nextRuns[idx] = nextRun;
          await storageSet({ runs: nextRuns });
          respond({ ok: true, run: nextRun });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "BACKFILL_RUN_INSIGHTS": {
      (async () => {
        try {
          const limit = Number.isFinite(Number(message?.limit)) ? Number(message.limit) : 200;
          const result = await backfillRunInsights({ limit });
          respond({ ok: true, ...result });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "SYNC_BACKEND_RUNS": {
      (async () => {
        try {
          const limit = Number.isFinite(Number(message?.limit)) ? Number(message.limit) : 500;
          const result = await syncBackendRuns({ limit });
          respond({ ok: true, ...result });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "ANALYZE_CAPTURE": {
      (async () => {
        try {
          if (!message.captureId) throw new Error("captureId required");
          const output = await handleAnalyzeCapture(message.captureId, message.queue || null, message.clientRunId || null);
          respond({ ok: true, ...output });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    case "GET_BACKEND_HEALTH": {
      getBackendHealth()
        .then((health) => respond({ ok: health.ok, status: health.status, error: health.error }))
        .catch((err) => fail(err));
      return true;
    }
    case "GET_DEBUG_LOGS": {
      storageGet(DEBUG_LOG_KEY)
        .then((res) => respond({ ok: true, logs: res[DEBUG_LOG_KEY] || [] }))
        .catch((err) => fail(err));
      return true;
    }
    case "DOWNLOAD_ARTIFACT": {
      (async () => {
        try {
          const { runId, artifactKey, filename } = message;
          if (!artifactKey || !runId) throw new Error("runId and artifactKey required");
          const { runs } = await readState();
          const run = runs.find((r) => r.runId === runId || r.clientRunId === runId);
          const path = run?.artifacts?.[artifactKey];
          if (!path) throw new Error("Artifact not available");
          const url = path.startsWith("http") ? path : `${BACKEND_BASE_URL}${path}`;
          await downloadArtifact(url, filename || `${artifactKey}.bin`);
          respond({ ok: true });
        } catch (error) {
          fail(error);
        }
      })();
      return true;
    }
    default:
      return undefined;
  }
});
