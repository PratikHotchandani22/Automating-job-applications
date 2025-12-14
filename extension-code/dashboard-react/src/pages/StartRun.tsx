import { useEffect, useState, useCallback } from "react";
import { analyzeCapture, extractFromTab, fetchBackendHealth, fetchExtensionState, getTabs, setUIState } from "../api/bridge";
import type { BackendStatus, Capture, Tab } from "../types";
import StatusPill from "../components/StatusPill";
import "./StartRun.css";




const formatUrl = (url?: string): string => {
  if (!url) return "Unknown";
  try {
    const u = new URL(url);
    const path = u.pathname.length > 32 ? `${u.pathname.slice(0, 32)}…` : u.pathname || "/";
    return `${u.hostname}${path}`;
  } catch (e) {
    return url;
  }
};


const StartRunPage = () => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [statusText, setStatusText] = useState<string>("");
  const [tabScope, setTabScope] = useState<"currentWindow" | "allWindows">("currentWindow");
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const loadState = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:32',message:'loadState called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      const state = await fetchExtensionState();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:35',message:'fetchExtensionState result',data:{capturesCount:(state as any).captures?.length || 0,captures:(state as any).captures},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setCaptures((state as any).captures || []);
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:37',message:'loadState error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setStatusText(error.message || "Unable to load state");
    }
  }, []);

  const checkBackendHealth = useCallback(async () => {
    try {
      const health = await fetchBackendHealth();
      setBackendStatus(health);
    } catch (e) {
      setBackendStatus("offline");
    }
  }, []);

  const refreshTabs = useCallback(async () => {
    try {
      const tabsData = await getTabs(tabScope);
      setTabs(tabsData);
      if (tabsData.length > 0 && !selectedTabId) {
        const activeTab = tabsData.find((t) => t.active) || tabsData[0];
        setSelectedTabId(activeTab.id);
        await setUIState({ selectedTabId: activeTab.id });
      }
    } catch (error: any) {
      setStatusText(error.message || "Unable to load tabs");
      setTabs([]);
    }
  }, [tabScope, selectedTabId]);

  const handleExtract = useCallback(async () => {
    if (!selectedTabId) {
      setStatusText("Select a tab first.");
      return;
    }
    setExtracting(true);
    setStatusText("Extracting from tab…");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:73',message:'Extract started',data:{selectedTabId},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      await extractFromTab(selectedTabId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:75',message:'Extract success, loading state',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setStatusText("Capture saved.");
      await loadState();
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:77',message:'Extract error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setStatusText(error.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }, [selectedTabId, loadState]);

  const handleAnalyze = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:84',message:'handleAnalyze called',data:{capturesLength:captures.length,backendStatus,captures:captures.map(c=>({captureId:c.captureId,title:c.job?.title,tabId:c.tab?.tabId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (captures.length === 0) {
      setStatusText("No captures available. Extract a job posting first.");
      return;
    }
    // Use the most recent capture by capturedAt, preferring one whose tab is still open
    const sortedCaptures = [...captures].sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
    let candidate: Capture | null = null;
    // Refresh tabs to ensure we have current tab ids
    let currentTabs = tabs;
    try {
      currentTabs = await getTabs(tabScope);
      setTabs(currentTabs);
    } catch {
      // ignore, fallback to existing tabs
    }
    candidate = sortedCaptures.find((c) => currentTabs.some((t) => t.id === c.tab?.tabId)) || sortedCaptures[0];
    if (!candidate) {
      setStatusText("No captures available. Extract a job posting first.");
      return;
    }
    const hasTabOpen = currentTabs.some((t) => t.id === candidate?.tab?.tabId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:94',message:'Chosen capture for analyze',data:{captureId:candidate.captureId,title:candidate.job?.title,tabId:candidate.tab?.tabId,hasTabOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (!hasTabOpen) {
      setStatusText("The captured tab is no longer open. Re-open the job tab and extract again.");
      return;
    }
    if (backendStatus !== "online") {
      setStatusText("Backend required for analysis.");
      return;
    }
    setAnalyzing(true);
    setStatusText("Starting analysis…");
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:102',message:'Calling analyzeCapture',data:{captureId:candidate.captureId},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      await analyzeCapture(candidate.captureId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:104',message:'analyzeCapture success',data:{captureId:candidate.captureId},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setStatusText("Run started. Polling status…");
      await loadState();
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:108',message:'analyzeCapture error',data:{error:error.message,stack:error.stack,captureId:candidate.captureId},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setStatusText(error.message || "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }, [captures, backendStatus, loadState, tabs, tabScope]);


  const handleScopeToggle = useCallback(
    async (checked: boolean) => {
      const newScope = checked ? "allWindows" : "currentWindow";
      setTabScope(newScope);
      await setUIState({ tabScope: newScope });
      await refreshTabs();
    },
    [refreshTabs]
  );

  useEffect(() => {
    loadState();
    refreshTabs();
    checkBackendHealth();
    setStatusText("Ready.");

    // Listen for storage changes
    if (typeof chrome !== "undefined" && chrome.storage) {
      const listener = (changes: any, areaName: string) => {
        if (areaName !== "local") return;
        if (changes.captures) setCaptures(changes.captures.newValue || []);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, [loadState, refreshTabs, checkBackendHealth]);


  return (
    <div className="page-grid">
      {backendStatus === "offline" ? (
        <div className="banner warn">
          Backend offline — extraction available; analysis disabled.
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Start New Run</h2>
            <p className="hint">Extract job postings and start analysis runs</p>
          </div>
          <div className="actions-inline">
            <StatusPill status={backendStatus} onRetry={checkBackendHealth} />
            <button className="ghost small" onClick={refreshTabs}>
              Refresh tabs
            </button>
          </div>
        </div>

        <div className="start-run-controls">
          <div className="control-group">
            <label htmlFor="tabSelect">Select Tab</label>
            <select
              id="tabSelect"
              className="select"
              value={selectedTabId || ""}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSelectedTabId(Number.isNaN(val) ? null : val);
                setUIState({ selectedTabId: Number.isNaN(val) ? null : val });
              }}
            >
              {tabs.length === 0 ? (
                <option value="">No tabs found</option>
              ) : (
                tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.active ? "• " : ""}
                    {tab.title || tab.url || "Untitled"} ({formatUrl(tab.url)})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="allWindowsToggle" className="checkbox-label">
              <input
                type="checkbox"
                id="allWindowsToggle"
                checked={tabScope === "allWindows"}
                onChange={(e) => handleScopeToggle(e.target.checked)}
              />
              <span>All windows</span>
            </label>
          </div>

          <div className="control-group actions">
            <button className="primary" onClick={handleExtract} disabled={extracting || tabs.length === 0}>
              Extract
            </button>
            <button
              className="primary"
              onClick={handleAnalyze}
              disabled={analyzing || backendStatus !== "online" || captures.length === 0}
              title={
                backendStatus !== "online"
                  ? "Backend required for analysis."
                  : captures.length === 0
                    ? "Extract a job posting first."
                    : "Analyze the most recent capture."
              }
            >
              Analyze
            </button>
          </div>
        </div>

        {statusText && (
          <div className="status-text">
            {statusText}
          </div>
        )}
      </div>


    </div>
  );
};

export default StartRunPage;
