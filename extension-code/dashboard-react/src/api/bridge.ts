import { sampleRuns } from "../sampleData";
import type { BackendStatus, Capture, RunRecord, RunResult, RunStage, StartRunUIState, Tab } from "../types";

export const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:3001";

const hasChromeRuntime = typeof chrome !== "undefined" && Boolean(chrome?.runtime?.sendMessage);

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
  const coverageRaw = raw.coverage ?? raw.coverage_percent ?? raw.coverage_ratio;
  let coverage: number | null = null;
  if (typeof coverageRaw === "number") {
    coverage = coverageRaw > 1 ? Math.round(coverageRaw) : Math.round(coverageRaw * 100);
  }
  const runtimeMs = raw.runtime_ms ?? raw.durationMs ?? null;
  const runtimeSec = raw.runtimeSec ?? raw.durationSec ?? (runtimeMs ? Math.round(runtimeMs / 1000) : null);
  const startedAt = raw.startedAt || raw.started_at || raw.createdAt || raw.created_at || null;
  const updatedAt = raw.updatedAt || raw.updated_at || raw.completedAt || raw.completed_at || startedAt || null;
  const platform = (raw.platform || raw.tab?.platform || raw.job?.platform || "").toString();

  return {
    runId,
    clientRunId: raw.clientRunId,
    captureId: raw.captureId,
    title: raw.job?.title || raw.title || raw.tab?.title || "",
    company: raw.job?.company || raw.company || "",
    platform: platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Other",
    status: mapStage(raw.stage || raw.status),
    result: mapResult(raw.result || raw.status),
    coverage,
    runtimeSec: runtimeSec ?? null,
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

export const fetchExtensionState = async (): Promise<{ runs: RunRecord[]; captures?: Capture[] }> => {
  if (!hasChromeRuntime) return { runs: sampleRuns, captures: [] };
  const response: any = await sendRuntimeMessage({ action: "GET_STATE" });
  if (response?.ok === false) {
    throw new Error(response?.error || "Unable to read extension state");
  }
  const runs = Array.isArray(response?.runs) ? response.runs.map(normalizeRun) : [];
  const captures = Array.isArray(response?.captures) ? response.captures : [];
  return { runs: runs.length ? runs : sampleRuns, captures };
};

export const fetchBackendHealth = async (): Promise<BackendStatus> => {
  try {
    if (hasChromeRuntime) {
      const res: any = await sendRuntimeMessage({ action: "GET_BACKEND_HEALTH" });
      if (res?.ok || res?.status === "ok") return "online";
      return "offline";
    }
    const res = await fetch(`${BACKEND_BASE_URL}/health`);
    return res.ok ? "online" : "offline";
  } catch (error) {
    return "offline";
  }
};

export const fetchRunStatusFromBackend = async (runId: string): Promise<Partial<RunRecord> | null> => {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/status/${encodeURIComponent(runId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      runId,
      status: mapStage(data.stage),
      result: mapResult(data.status),
      message: data.message || null,
      artifacts: data.files || {},
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
  const url = `${BACKEND_BASE_URL}/download/${encodeURIComponent(runId)}/${encodeURIComponent(key)}`;
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
    const res = await fetch(`${BACKEND_BASE_URL}/retry/${encodeURIComponent(run.runId)}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.run_id || data.runId || null;
    }
  } catch (error) {
    // swallow; handled by caller
  }
  throw new Error("Retry unavailable without capture reference");
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bridge.ts:206',message:'analyzeCapture called',data:{captureId,hasChromeRuntime},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  if (!hasChromeRuntime) {
    throw new Error("Runtime messaging unavailable");
  }
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bridge.ts:210',message:'Sending ANALYZE_CAPTURE message',data:{action:'ANALYZE_CAPTURE',captureId},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  const response: any = await sendRuntimeMessage({ action: "ANALYZE_CAPTURE", captureId });
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'bridge.ts:211',message:'ANALYZE_CAPTURE response',data:{response,ok:response?.ok,error:response?.error},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  if (response?.ok === false) {
    throw new Error(response?.error || "Analyze failed");
  }
  return { runId: response?.runId || response?.backendRunId || null };
};

export const setUIState = async (uiState: Partial<StartRunUIState>): Promise<void> => {
  if (!hasChromeRuntime) return;
  await sendRuntimeMessage({ action: "SET_UI_STATE", ui_state: uiState });
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
    
    // If we're in a chrome extension context and NOT in dashboard, open dashboard.html
    if (hasChromeRuntime) {
      const dashboardUrl = chrome.runtime.getURL("dashboard.html#/start-run");
      
      // Try to set sidepanel path to dashboard.html before opening
      if (chrome.sidePanel?.setOptions) {
        try {
          await chrome.sidePanel.setOptions({ path: "dashboard.html#/start-run" });
        } catch (error) {
          // Ignore error
        }
      }
      
      if (chrome.sidePanel?.open) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          await chrome.sidePanel.open({ tabId: tab?.id });
          return;
        } catch (error) {
          // Fall through to tab creation
        }
      }
      
      try {
        await chrome.tabs.create({ url: dashboardUrl });
        return;
      } catch (error) {
        // Fall through to same-tab navigation
      }
      
      window.location.href = dashboardUrl;
      return;
    }
    
    // Fallback: navigate in current window
    window.location.hash = "#/start-run";
  }
};
