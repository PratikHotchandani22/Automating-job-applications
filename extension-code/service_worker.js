/* global chrome */

const CONTENT_FILES = ["lib/readability.js", "content_script.js"];
// DEPRECATED: Old backend URL - kept for backward compatibility if needed
// New dashboard uses Next.js at http://localhost:3000 with Convex backend
const BACKEND_BASE_URL = "http://localhost:3001";
const NEXTJS_DASHBOARD_URL = "http://localhost:3000";
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

const isDashboardUrl = (url) => {
  if (!url) return false;
  // Exclude any extension page to avoid injecting content scripts.
  return url.startsWith("chrome-extension://");
};

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
  // Check Next.js dashboard health instead of old backend
  const NEXTJS_DASHBOARD_URL = "http://localhost:3000";
  try {
    const response = await fetch(`${NEXTJS_DASHBOARD_URL}`, { method: "HEAD" });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    return { ok: true, status: "ok", dashboard: "Next.js" };
  } catch (error) {
    return { ok: false, error: error.message || "Next.js dashboard offline", dashboard: "Next.js" };
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
    const res = await fetch(`${BACKEND_BASE_URL}/status/${backendRunId}`);
    if (!res.ok) {
      throw new Error(`Status check failed (${res.status})`);
    }
    const data = await res.json();
    const stage = mapBackendStage(data.stage) || "ANALYZING";
    const result = data.status === "success" ? "success" : data.status === "error" ? "error" : "pending";
    const runId = data.run_id || backendRunId;
    const artifacts = data.files || {};
    const message = data.message || null;

    await upsertRun({
      runId,
      clientRunId,
      backendRunId: runId,
      status: stage,
      stage,
      result,
      message,
      artifacts,
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
    startedAt: new Date().toISOString(),
    status: "EXTRACTING",
    stage: "EXTRACTING",
    result: "pending",
    artifacts: {},
    tab: capture.tab,
    platform: capture.platform,
    error: null
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

    const response = await fetch(`${BACKEND_BASE_URL}/analyze`, {
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
  return mapped.filter((tab) => !tab.isDashboard);
};

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setOptions) {
    chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true });
    logDebug("onInstalled:setOptions", { ok: true, path: "sidepanel.html (Next.js dashboard)" });
  } else {
    logDebug("onInstalled:setOptions", { ok: false, reason: "no_sidePanel_api" });
  }
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    logDebug("onInstalled:setPanelBehavior", { ok: true });
  } else {
    logDebug("onInstalled:setPanelBehavior", { ok: false, reason: "no_sidePanel_api" });
  }
});

chrome.runtime.onStartup.addListener(() => {
  if (chrome.sidePanel?.setOptions) {
    chrome.sidePanel.setOptions({ path: "sidepanel.html", enabled: true });
    logDebug("onStartup:setOptions", { ok: true, path: "sidepanel.html (Next.js dashboard)" });
  }
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    logDebug("onStartup:setPanelBehavior", { ok: true });
  }
});

chrome.action.onClicked.addListener((tab) => {
  (async () => {
    if (chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
        await logDebug("actionClick", { outcome: "sidepanel_open", tabId: tab.id, dashboard: "Next.js" });
        return;
      } catch (error) {
        await logDebug("actionClick", { outcome: "sidepanel_open_failed", error: error?.message });
      }
    }
    // Fallback: open Next.js dashboard in new tab
    await chrome.tabs.create({ url: "http://localhost:3000" });
    await logDebug("actionClick", { outcome: "opened_nextjs_dashboard_tab" });
  })();
});

// Handle messages from external websites (Next.js dashboard at localhost:3000)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // Verify the sender is from our allowed origins
  const allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  if (!sender.origin || !allowedOrigins.some(o => sender.origin.startsWith(o))) {
    sendResponse({ ok: false, error: "Unauthorized origin" });
    return true;
  }

  // Handle GET_EXTENSION_ID request - used for initial handshake
  if (message.action === "GET_EXTENSION_ID") {
    sendResponse({ ok: true, extensionId: chrome.runtime.id });
    return true;
  }

  // Forward all other messages to the main handler
  handleMessage(message, sender, sendResponse);
  return true;
});

// Shared message handler for both internal and external messages
const handleMessage = (message, sender, sendResponse) => {
  if (!message || !message.action) return undefined;

  const respond = (payload) => sendResponse(payload);
  const fail = (error) => sendResponse({ ok: false, error: error?.message || String(error) });

  switch (message.action) {
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
    case "SET_UI_STATE": {
      persistUiState(message.ui_state || {})
        .then((next) => respond({ ok: true, ui_state: next }))
        .catch((err) => fail(err));
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
    case "EXTRACT_JOB_FROM_TAB": {
      (async () => {
        try {
          if (!message.tabId) throw new Error("tabId required");
          const extraction = await runExtractionOnTab(message.tabId, { includeDebug: false });
          respond({ ok: true, data: extraction });
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
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return handleMessage(message, sender, sendResponse);
});
