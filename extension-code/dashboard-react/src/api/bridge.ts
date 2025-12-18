import { sampleRuns } from "../sampleData";
import type {
  BackendStatus,
  Capture,
  ChatMessage,
  RunChatResponse,
  RunRecord,
  RunResult,
  RunStage,
  StartRunUIState,
  Tab
} from "../types";
import { getAccessToken, isSupabaseConfigured } from "../lib/supabase";

// IMPORTANT:
// - VITE_BACKEND_BASE_URL should be the *site* origin, not including `/api`.
// - We defensively normalize to avoid misconfig like "...vercel.app/api" which would otherwise become "/api/api/health".
const RAW_BACKEND_BASE_URL =
  (import.meta.env.VITE_BACKEND_BASE_URL && import.meta.env.VITE_BACKEND_BASE_URL.trim()) ||
  "https://resume-intelligence-nine.vercel.app";
export const BACKEND_BASE_URL = RAW_BACKEND_BASE_URL.replace(/\/+$/g, "").replace(/\/api$/i, "");

const hasChromeRuntime = typeof chrome !== "undefined" && Boolean(chrome?.runtime?.sendMessage);
// Simple cache to avoid hammering hosted APIs in web (non-extension) mode.
let webStateCache: { promise: Promise<{ runs: RunRecord[]; captures?: Capture[]; ui_state?: StartRunUIState }>; ts: number } | null =
  null;
const WEB_STATE_CACHE_TTL_MS = 3000;
// Dedupe bootstrap/profile fetches to avoid overlapping calls and noisy logs.
let bootstrapCache: { promise: Promise<any>; ts: number } | null = null;
const BOOTSTRAP_CACHE_TTL_MS = 3000;

/**
 * Get authorization headers for API calls
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  // Only add auth header if Supabase is configured
  if (isSupabaseConfigured) {
    try {
      const token = await getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn("Failed to get auth token:", error);
    }
  }
  
  return headers;
}

// Cache for backend health status to prevent rapid state changes (glitching)
let healthCache: { status: BackendStatus; timestamp: number } | null = null;
const HEALTH_CACHE_TTL = 5000; // 5 seconds cache

const stageMap: Record<string, RunStage> = {
  EXTRACTING: "EXTRACTING",
  RUBRIC: "RUBRIC",
  EVIDENCE: "EVIDENCE",
  EMBEDDINGS: "EMBEDDINGS",
  SELECTION: "SELECTION",
  ANALYZING: "ANALYZING",
  GENERATING_LATEX: "GENERATING_LATEX",
  COMPILING_PDF: "COMPILING_PDF",
  DONE: "DONE",
  ERROR: "ERROR",
  RUNNING: "RUNNING"
};

const sendRuntimeMessage = <T,>(payload: any): Promise<T> =>
  new Promise((resolve, reject) => {
    if (!hasChromeRuntime) {
      reject(new Error("Runtime messaging unavailable"));
      return;
    }
    chrome.runtime.sendMessage(payload, (response: T) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const mapStage = (value?: string | null): RunStage => {
  if (!value) return "UNKNOWN";
  const key = value.toString().toUpperCase();
  return stageMap[key] || "UNKNOWN";
};

const mapResult = (value?: string | null): RunResult => {
  const normalized = (value || "").toString().toLowerCase();
  if (normalized === "success" || normalized === "done") return "success";
  if (normalized === "error" || normalized === "failed") return "error";
  return "pending";
};

export const normalizeRun = (raw: any): RunRecord => {
  const runId = (raw.runId || raw.run_id || raw.clientRunId || raw.id || `run_${Date.now()}`).toString();
  const queueId = raw.queueId || raw.queue_id || null;
  const queuePosition = Number.isFinite(raw.queuePosition) ? Number(raw.queuePosition) : raw.queue_position;
  const queueSize = Number.isFinite(raw.queueSize) ? Number(raw.queueSize) : raw.queue_size;
  const queueLabel = raw.queueLabel || raw.queue_label || null;
  const coverageRaw =
    raw.coverage ?? raw.coverage_percent ?? raw.coverage_ratio ?? raw.coverage_score ?? raw.coverageScore;
  let coverage: number | null = null;
  const coverageNum =
    typeof coverageRaw === "number"
      ? coverageRaw
      : typeof coverageRaw === "string" && Number.isFinite(Number(coverageRaw))
        ? Number(coverageRaw)
        : null;
  if (typeof coverageNum === "number") {
    coverage = coverageNum > 1 ? Math.round(coverageNum) : Math.round(coverageNum * 100);
  }
  const runtimeMs = raw.runtime_ms ?? raw.durationMs ?? null;
  const runtimeSec = raw.runtimeSec ?? raw.durationSec ?? (runtimeMs ? Math.round(runtimeMs / 1000) : null);
  const startedAt = raw.startedAt || raw.started_at || raw.createdAt || raw.created_at || null;
  const updatedAt = raw.updatedAt || raw.updated_at || raw.completedAt || raw.completed_at || startedAt || null;
  const platformRaw = (raw.platform || raw.tab?.platform || raw.job?.platform || "").toString().trim();
  // Normalize platform: extract domain name from URLs, capitalize properly
  let platform = "Other";
  if (platformRaw) {
    if (/^https?:\/\//i.test(platformRaw) || /^www\./i.test(platformRaw)) {
      try {
        const url = platformRaw.startsWith("http") ? new URL(platformRaw) : new URL(`https://${platformRaw}`);
        const hostname = url.hostname.replace(/^www\./i, "");
        if (hostname.includes("linkedin.com")) platform = "LinkedIn";
        else if (hostname.includes("greenhouse.io")) platform = "Greenhouse";
        else if (hostname.includes("workday.com")) platform = "Workday";
        else if (hostname.includes("lever.co")) platform = "Lever";
        else if (hostname.includes("smartrecruiters.com")) platform = "SmartRecruiters";
        else platform = hostname.split(".")[0] || "Other";
      } catch {
        const match = platformRaw.match(/(?:www\.)?([^.]+)\./i);
        platform = match ? match[1] : "Other";
      }
    } else {
      platform = platformRaw.charAt(0).toUpperCase() + platformRaw.slice(1).toLowerCase();
    }
  }
  const responseReceivedAt = raw.responseReceivedAt ?? raw.response_received_at ?? null;

  const stripBrowserTitleNoise = (value?: string) => {
    if (!value) return "";
    let cleaned = value.trim();
    cleaned = cleaned.replace(/^\d+\s+notifications?\s*(?:[-–—|:]\s*)?/i, "");
    cleaned = cleaned.replace(/extensions?\s*(?:[-–—|:]\s*)?job\s+page/i, "");
    return cleaned.trim();
  };

  const titleCandidates = [
    // Hosted API / Supabase schema fields
    raw.job_title,
    raw.jobTitle,
    raw.job?.title,
    raw.job?.job_title,
    raw.job?.role_hint,
    raw.title,
    raw.tab?.title
  ]
    .map((entry) => (entry || "").toString().trim())
    .filter(Boolean);
  const sanitizedTitle = titleCandidates.map(stripBrowserTitleNoise).find(Boolean);
  const title = sanitizedTitle || titleCandidates[0] || "";
  const companySources = [
    raw.company,
    raw.company_name,
    raw.job_company,
    raw.job?.company,
    raw.job?.company_name
  ];
  let company = companySources.map((entry) => (entry || "").toString().trim()).find(Boolean) || "";
  if (/^https?:\/\//i.test(company) || /^www\./i.test(company) || company.toLowerCase().includes("unknown") || company.length < 2) {
    company = "";
  }

  return {
    runId,
    clientRunId: raw.clientRunId,
    queueId: queueId || `Q-${runId.toString().slice(0, 6)}`, // legacy runs become single-item queues
    queuePosition: Number.isFinite(queuePosition) ? Number(queuePosition) : 1,
    queueSize: Number.isFinite(queueSize) ? Number(queueSize) : 1,
    queueLabel,
    tab: raw.tab || undefined,
    captureId: raw.captureId,
    title,
    company,
    platform,
    status: mapStage(raw.stage || raw.status),
    result: mapResult(raw.result || raw.status),
    coverage,
    runtimeSec: runtimeSec ?? null,
    responseReceivedAt: typeof responseReceivedAt === "string" || responseReceivedAt === null ? responseReceivedAt : null,
    startedAt,
    updatedAt,
    createdAt: raw.createdAt || null,
    message: raw.message || null,
    error: raw.error || null,
    artifacts: raw.artifacts || raw.files || {},
    stages: raw.stages || [],
    uncovered: raw.uncovered || raw.uncovered_requirements || [],
    keywords: raw.keywords || raw.top_keywords || []
  };
};

export const fetchExtensionState = async (): Promise<{ runs: RunRecord[]; captures?: Capture[]; ui_state?: StartRunUIState }> => {
  // Extension mode: read state via chrome.runtime messaging.
  if (hasChromeRuntime) {
    const response: any = await sendRuntimeMessage({ action: "GET_STATE" });
    if (response?.ok === false) {
      throw new Error(response?.error || "Unable to read extension state");
    }
    const runs = Array.isArray(response?.runs) ? response.runs.map(normalizeRun) : [];
    const captures = Array.isArray(response?.captures) ? response.captures : [];
    const ui_state = response?.ui_state || undefined;
    return { runs: runs.length ? runs : sampleRuns, captures, ui_state };
  }

  // Web (Supabase) mode: once signed in, fetch runs from hosted backend (/api/runs).
  // This prevents polling storms against demo run IDs like "RUN-3013".
  if (isSupabaseConfigured) {
    if (webStateCache && Date.now() - webStateCache.ts < WEB_STATE_CACHE_TTL_MS) {
      return webStateCache.promise;
    }
    const token = await getAccessToken().catch(() => null);
    if (token) {
      const headers = await getAuthHeaders();
      const url = `${BACKEND_BASE_URL}/api/runs?limit=50&offset=0`;
      const fetchPromise = (async () => {
        try {
          console.info("[Runs] Fetching hosted runs", { url });
          const res = await fetch(url, { headers });
          if (res.ok) {
            const data: any = await res.json().catch(() => null);
            const rows = Array.isArray(data?.runs) ? data.runs : [];
            console.info("[Runs] Loaded hosted runs", { count: rows.length });
            return { runs: rows.map(normalizeRun), captures: [] };
          }
          console.warn("[Runs] Fetch failed", { status: res.status });
        } catch (err: any) {
          console.warn("[Runs] Fetch error", err?.message || err);
        } finally {
          // Bust cache after TTL so we can refetch on next call.
          setTimeout(() => {
            if (webStateCache && Date.now() - webStateCache.ts >= WEB_STATE_CACHE_TTL_MS) {
              webStateCache = null;
            }
          }, WEB_STATE_CACHE_TTL_MS);
        }
        return { runs: sampleRuns, captures: [] };
      })();
      webStateCache = { promise: fetchPromise, ts: Date.now() };
      return fetchPromise;
    }
  }

  // Fallback: demo UI (no auth / no backend runs yet).
  return { runs: sampleRuns, captures: [] };
};

export const fetchBackendHealth = async (forceRefresh = false): Promise<BackendStatus> => {
  // Return cached result if still valid (prevents UI glitching)
  if (!forceRefresh && healthCache && Date.now() - healthCache.timestamp < HEALTH_CACHE_TTL) {
    return healthCache.status;
  }

  try {
    let status: BackendStatus;
    
    if (hasChromeRuntime) {
      const res: any = await sendRuntimeMessage({ action: "GET_BACKEND_HEALTH" });
      status = (res?.ok || res?.status === "ok") ? "online" : "offline";
    } else {
      // Health endpoint is public - don't send auth headers
      // Use AbortController with manual timeout for better browser support
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const started = Date.now();
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/health`, { 
          method: "GET",
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        status = res.ok ? "online" : "offline";
        console.info("[Health] Health check", { ok: res.ok, ms: Date.now() - started });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError?.name === "AbortError") {
          console.info("[Health] Backend check timed out", { ms: Date.now() - started });
          // Don't flip to offline on timeout; keep previous state if any.
          return healthCache?.status || "checking";
        }
        throw fetchError;
      }
    }
    
    // Cache the result
    healthCache = { status, timestamp: Date.now() };
    return status;
  } catch (error: any) {
    if (error?.name !== "AbortError") {
      console.warn("[Health] Backend check failed:", error);
    }
    // Preserve previous status if available; otherwise mark offline.
    const fallback = healthCache?.status || "offline";
    healthCache = { status: fallback, timestamp: Date.now() };
    return fallback;
  }
};

export const fetchRunStatusFromBackend = async (runId: string): Promise<Partial<RunRecord> | null> => {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_BASE_URL}/api/status/${encodeURIComponent(runId)}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const coverageRaw = data.coverage ?? data.coverage_percent ?? data.coverage_ratio;
    const coverage =
      typeof coverageRaw === "number"
        ? coverageRaw > 1
          ? Math.round(coverageRaw)
          : Math.round(coverageRaw * 100)
        : null;
    return {
      runId,
      status: mapStage(data.stage),
      result: mapResult(data.status),
      message: data.message || null,
      artifacts: data.files || {},
      coverage,
      keywords: data.top_keywords || data.keywords || [],
      uncovered: data.uncovered_requirements || data.uncovered || [],
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    return null;
  }
};

export const downloadArtifact = async (runId: string, key: string, filename?: string) => {
  if (hasChromeRuntime) {
    const res: any = await sendRuntimeMessage({
      action: "DOWNLOAD_ARTIFACT",
      runId,
      artifactKey: key,
      filename
    });
    if (res?.ok === false) {
      throw new Error(res?.error || "Download failed");
    }
    return;
  }
  const url = `${BACKEND_BASE_URL}/api/download/${encodeURIComponent(runId)}/${encodeURIComponent(key)}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `${key}.bin`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const retryRunFromCapture = async (run: RunRecord): Promise<string | null> => {
  if (hasChromeRuntime && run.captureId) {
    const res: any = await sendRuntimeMessage({
      action: "ANALYZE_CAPTURE",
      captureId: run.captureId
    });
    if (res?.ok === false) {
      throw new Error(res?.error || "Retry failed");
    }
    return res?.runId || res?.backendRunId || null;
  }
  // fallback: best-effort backend retry (if implemented)
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_BASE_URL}/api/retry/${encodeURIComponent(run.runId)}`, { 
      method: "POST",
      headers 
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.run_id || data.runId || null;
    }
  } catch (error) {
    // swallow; handled by caller
  }
  throw new Error("Retry unavailable without capture reference");
};

export const chatRun = async (runId: string, messages: ChatMessage[], focus?: any): Promise<RunChatResponse> => {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_BASE_URL}/api/runs/${encodeURIComponent(runId)}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, focus: focus || null })
  });
  const data = (await res.json().catch(() => null)) as RunChatResponse | null;
  if (!res.ok) {
    throw new Error(data?.message || `Chat failed (HTTP ${res.status})`);
  }
  if (!data) {
    throw new Error("Chat failed: empty response");
  }
  return data;
};

export const getTabs = async (scope: "currentWindow" | "allWindows" = "currentWindow"): Promise<Tab[]> => {
  if (!hasChromeRuntime) return [];
  const response: any = await sendRuntimeMessage({ action: "GET_TABS", scope });
  if (response?.ok === false) {
    throw new Error(response?.error || "Unable to load tabs");
  }
  return response?.tabs || [];
};

export const extractFromTab = async (tabId: number): Promise<{ capture: Capture }> => {
  if (!hasChromeRuntime) {
    throw new Error("Runtime messaging unavailable");
  }
  const response: any = await sendRuntimeMessage({ action: "EXTRACT_FROM_TAB", tabId });
  if (response?.ok === false) {
    throw new Error(response?.error || "Extraction failed");
  }
  return { capture: response.capture };
};

export const deleteCapture = async (captureId: string): Promise<void> => {
  if (!hasChromeRuntime) {
    throw new Error("Runtime messaging unavailable");
  }
  const response: any = await sendRuntimeMessage({ action: "DELETE_CAPTURE", captureId });
  if (response?.ok === false) {
    throw new Error(response?.error || "Delete failed");
  }
};

export const analyzeCapture = async (captureId: string): Promise<{ runId?: string }> => {
  if (!hasChromeRuntime) {
    throw new Error("Runtime messaging unavailable");
  }
  const response: any = await sendRuntimeMessage({ action: "ANALYZE_CAPTURE", captureId });
  if (response?.ok === false) {
    throw new Error(response?.error || "Analyze failed");
  }
  return { runId: response?.runId || response?.backendRunId || null };
};

export const deleteRun = async (runId: string): Promise<void> => {
  if (!hasChromeRuntime) {
    throw new Error("Runtime messaging unavailable");
  }
  const response: any = await sendRuntimeMessage({ action: "DELETE_RUN", runId });
  if (response?.ok === false) {
    throw new Error(response?.error || "Delete run failed");
  }
};

export const setRunUserFields = async (
  runId: string,
  user: { responseReceivedAt?: string | null }
): Promise<void> => {
  if (!hasChromeRuntime) {
    throw new Error("Runtime messaging unavailable");
  }
  const response: any = await sendRuntimeMessage({ action: "SET_RUN_USER_FIELDS", runId, user });
  if (response?.ok === false) {
    throw new Error(response?.error || "Update failed");
  }
};

export const backfillRunInsights = async (limit = 200): Promise<{ updated: number; total: number }> => {
  if (!hasChromeRuntime) {
    return { updated: 0, total: 0 };
  }
  const response: any = await sendRuntimeMessage({ action: "BACKFILL_RUN_INSIGHTS", limit });
  if (response?.ok === false) {
    throw new Error(response?.error || "Backfill failed");
  }
  return { updated: Number(response?.updated || 0), total: Number(response?.total || 0) };
};

export const syncBackendRuns = async (limit = 500): Promise<{ updated: number; total: number }> => {
  if (!hasChromeRuntime) {
    return { updated: 0, total: 0 };
  }
  const response: any = await sendRuntimeMessage({ action: "SYNC_BACKEND_RUNS", limit });
  if (response?.ok === false) {
    throw new Error(response?.error || "Sync failed");
  }
  return { updated: Number(response?.updated || 0), total: Number(response?.total || 0) };
};

// =============================================================================
// Web/Supabase mode helpers (hosted API)
// =============================================================================

export const fetchUserBootstrap = async (): Promise<any> => {
  if (bootstrapCache && Date.now() - bootstrapCache.ts < BOOTSTRAP_CACHE_TTL_MS) {
    return bootstrapCache.promise;
  }

  const headers = await getAuthHeaders();

  // Add a timeout so the UI doesn't hang forever if the network stalls.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const url = `${BACKEND_BASE_URL}/api/profile`;
  console.info("[Bootstrap] Fetching profile", { url });
  const fetchPromise = (async () => {
    const started = Date.now();
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.warn("[Bootstrap] Profile fetch failed", { status: res.status, data });
        throw new Error(data?.error || `Profile fetch failed (HTTP ${res.status})`);
      }
      console.info("[Bootstrap] Profile fetch ok", {
        has_master_resume: data?.has_master_resume,
        default_master_resume_id: data?.default_master_resume_id,
        resumes: Array.isArray(data?.master_resumes) ? data.master_resumes.length : "n/a",
        ms: Date.now() - started
      });
      return data;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.warn("[Bootstrap] Profile fetch timed out", { ms: Date.now() - started });
      } else {
        console.error("[Bootstrap] Profile fetch error", error?.message || error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      // Expire cache after TTL so future calls can retry.
      setTimeout(() => {
        if (bootstrapCache && Date.now() - bootstrapCache.ts >= BOOTSTRAP_CACHE_TTL_MS) {
          bootstrapCache = null;
        }
      }, BOOTSTRAP_CACHE_TTL_MS);
    }
  })();

  bootstrapCache = { promise: fetchPromise, ts: Date.now() };
  return fetchPromise;
};

export const upsertMasterResume = async (name: string, content: any): Promise<any> => {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_BASE_URL}/api/master-resume`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, content })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Master resume save failed (HTTP ${res.status})`);
  }
  return data;
};

export const startQueue = async (tabIds: number[]): Promise<{ queueId?: string; results?: any[] }> => {
  if (!hasChromeRuntime) {
    throw new Error("Runtime messaging unavailable");
  }
  const response: any = await sendRuntimeMessage({ action: "START_QUEUE", tabIds });
  if (response?.ok === false) {
    throw new Error(response?.error || "Queue failed");
  }
  return { queueId: response?.queueId, results: response?.results || [] };
};

export const stopQueue = async (queueId: string): Promise<void> => {
  if (!hasChromeRuntime) throw new Error("Runtime messaging unavailable");
  const response: any = await sendRuntimeMessage({ action: "STOP_QUEUE", queueId });
  if (response?.ok === false) {
    throw new Error(response?.error || "Stop queue failed");
  }
};

export const stopRun = async (runId: string): Promise<void> => {
  if (!hasChromeRuntime) throw new Error("Runtime messaging unavailable");
  const response: any = await sendRuntimeMessage({ action: "STOP_RUN", runId });
  if (response?.ok === false) {
    throw new Error(response?.error || "Stop run failed");
  }
};

export const setUIState = async (uiState: Partial<StartRunUIState>): Promise<void> => {
  if (!hasChromeRuntime) return;
  await sendRuntimeMessage({ action: "SET_UI_STATE", ui_state: uiState });
};

export const consumeStartRunPrefill = async (): Promise<any | null> => {
  if (!hasChromeRuntime) return null;
  const response: any = await sendRuntimeMessage({ action: "CONSUME_START_RUN_PREFILL" });
  if (response?.ok === false) {
    throw new Error(response?.error || "Unable to read start-run prefill");
  }
  return response?.prefill || null;
};

export const openDashboardTab = async (routeHash: string, prefill?: any, ui_state?: Partial<StartRunUIState>) => {
  if (!hasChromeRuntime) {
    // In non-extension environments, just navigate within the current page.
    if (typeof window !== "undefined") {
      window.location.hash = routeHash || "#/start-run";
    }
    return;
  }
  await sendRuntimeMessage({ action: "OPEN_DASHBOARD", routeHash, prefill: prefill || null, ui_state: ui_state || null });
};

export const openStartRunSurface = async () => {
  // Navigate to React route within the dashboard
  if (typeof window !== "undefined") {
    const currentUrl = window.location.href;

    // Check if we're already in dashboard.html (the React app)
    const isInDashboard = currentUrl.includes("dashboard.html");

    if (isInDashboard) {
      // Already in dashboard, just navigate using hash (HashRouter will handle it)
      window.location.hash = "#/start-run";
      return;
    }

    // If we're in a chrome extension context and NOT in dashboard, open/focus the dashboard tab (tab-first).
    if (hasChromeRuntime) {
      await openDashboardTab("#/start-run");
      return;
    }

    // Fallback: navigate in current window
    window.location.hash = "#/start-run";
  }
};
