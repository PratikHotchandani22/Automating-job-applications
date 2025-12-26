import { useEffect, useState, useCallback, useMemo } from "react";
import {
  analyzeCapture,
  extractFromTab,
  fetchBackendHealth,
  fetchExtensionState,
  getTabs,
  setUIState,
  startQueue
} from "../api/bridge";
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
  const [runs, setRuns] = useState<any[]>([]);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [statusText, setStatusText] = useState<string>("");
  const [tabScope, setTabScope] = useState<"currentWindow" | "allWindows">("currentWindow");
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [forcedTabIds, setForcedTabIds] = useState<number[]>([]);

  const validSelectedTabs = useMemo(
    () => selectedTabIds.filter((id) => tabs.some((t) => t.id === id)),
    [selectedTabIds, tabs]
  );
  const runningSelectedCount = useMemo(
    () =>
      runs.filter(
        (r) =>
          (r.result === "pending" || r.status === "RUNNING" || r.status === "ANALYZING" || r.status === "EXTRACTING") &&
          r.tab?.tabId &&
          validSelectedTabs.includes(r.tab.tabId)
      ).length,
    [runs, validSelectedTabs]
  );
  const analyzedSelectedCount = useMemo(
    () => runs.filter((r) => r.result === "success" && r.tab?.tabId && validSelectedTabs.includes(r.tab.tabId)).length,
    [runs, validSelectedTabs]
  );
  const analyzedByTabId = useMemo(() => {
    const map = new Map<number, any>();
    runs.forEach((r) => {
      if (r.result === "success" && r.tab?.tabId) {
        map.set(r.tab.tabId, r);
      }
    });
    return map;
  }, [runs]);

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
      setRuns((state as any).runs || []);
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
      const filtered = tabsData.filter((t) => !t.isDashboard && !(t.url || "").startsWith("chrome-extension://"));
      setTabs(filtered);
      if (filtered.length > 0 && selectedTabIds.length === 0) {
        const activeTab = filtered.find((t) => t.active) || filtered[0];
        setSelectedTabIds([activeTab.id]);
        await setUIState({ selectedTabId: activeTab.id, selectedTabIds: [activeTab.id] });
      } else if (filtered.length > 0) {
        const validSelection = selectedTabIds.filter((id) => filtered.some((t) => t.id === id));
        if (validSelection.length !== selectedTabIds.length) {
          setSelectedTabIds(validSelection);
          await setUIState({ selectedTabId: validSelection[0] || null, selectedTabIds: validSelection });
        }
      } else {
        setSelectedTabIds([]);
        await setUIState({ selectedTabId: null, selectedTabIds: [] });
      }
    } catch (error: any) {
      setStatusText(error.message || "Unable to load tabs");
      setTabs([]);
    }
  }, [tabScope, selectedTabIds]);

  const handleAnalyze = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'StartRun.tsx:84',message:'handleAnalyze called',data:{capturesLength:captures.length,backendStatus,captures:captures.map(c=>({captureId:c.captureId,title:c.job?.title,tabId:c.tab?.tabId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-debug',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (validSelectedTabs.length === 0) {
      setStatusText("Select at least one tab.");
      return;
    }

    if (runningSelectedCount) {
      setStatusText(`Already running for ${runningSelectedCount} selected tab${runningSelectedCount > 1 ? "s" : ""}.`);
      return;
    }

    const runnableTabIds = validSelectedTabs.filter(
      (id) => !analyzedByTabId.get(id) || forcedTabIds.includes(id)
    );
    if (runnableTabIds.length === 0) {
      setStatusText("Nothing to run. Toggle force or pick a new tab.");
      return;
    }

    if (runnableTabIds.length > 1) {
      if (backendStatus !== "online") {
        setStatusText("Backend required for queue.");
        return;
      }
      setAnalyzing(true);
      setStatusText("Starting queue across selected tabs…");
      try {
        const response = await startQueue(runnableTabIds);
        const successCount = response.results?.filter((r: any) => r?.ok).length || 0;
        const failCount = (response.results?.length || 0) - successCount;
        setStatusText(
          `Queue started (${successCount} queued${failCount ? `, ${failCount} failed to start` : ""}).`
        );
        await loadState();
      } catch (error: any) {
        setStatusText(error.message || "Queue start failed");
      } finally {
        setAnalyzing(false);
      }
      return;
    }

    // Single-tab flow
    const targetTabId = runnableTabIds[0];
    if (backendStatus !== "online") {
      setStatusText("Backend required for analysis.");
      return;
    }
    setAnalyzing(true);
    setStatusText("Extracting and starting analysis…");
    try {
      await extractFromTab(targetTabId);
      await loadState();
      const refreshedCaptures = (await fetchExtensionState()).captures || [];
      const sortedCaptures = [...refreshedCaptures].sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
      const candidate = sortedCaptures.find((c) => c.tab?.tabId === targetTabId) || sortedCaptures[0];
      if (!candidate) {
        setStatusText("Extraction done but no capture found.");
        setAnalyzing(false);
        return;
      }
      await analyzeCapture(candidate.captureId);
      setStatusText("Run started. Polling status…");
      await loadState();
    } catch (error: any) {
      setStatusText(error.message || "Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }, [captures, backendStatus, loadState, tabs, tabScope, selectedTabIds]);


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
        if (changes.runs) setRuns(changes.runs.newValue || []);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, [loadState, refreshTabs, checkBackendHealth]);


  const handleToggleTab = (tabId: number) => {
    setSelectedTabIds((prev) => {
      const exists = prev.includes(tabId);
      const next = exists ? prev.filter((id) => id !== tabId) : [...prev, tabId];
      setUIState({ selectedTabIds: next, selectedTabId: next[0] || null });
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = tabs.map((t) => t.id);
    setSelectedTabIds(allIds);
    setForcedTabIds([]);
    setUIState({ selectedTabIds: allIds, selectedTabId: allIds[0] || null });
    setDropdownOpen(false);
  };

  const handleClearSelection = () => {
    setSelectedTabIds([]);
    setForcedTabIds([]);
    setUIState({ selectedTabIds: [], selectedTabId: null });
    setDropdownOpen(false);
  };

  const groupedByWindow = tabs.reduce<Record<number, Tab[]>>((acc, tab) => {
    const winId = tab.windowId ?? -1;
    acc[winId] = acc[winId] ? [...acc[winId], tab] : [tab];
    return acc;
  }, {});

  const windowIds = Object.keys(groupedByWindow)
    .map((k) => Number(k))
    .sort((a, b) => a - b);

  const queueSize = selectedTabIds.length;

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
            <label htmlFor="tabSelect">Tabs (queue order)</label>
            <div className="multi-select">
              <button className="select" type="button" onClick={() => setDropdownOpen((o) => !o)}>
                {tabs.length === 0
                  ? "No tabs found"
                  : analyzing
                    ? "Analyzing…"
                    : `${queueSize} selected · ${tabs.length} available`}
              </button>
              {dropdownOpen ? (
                <div className="multi-select-menu">
                  <div className="multi-select-actions">
                    <button className="ghost small" type="button" onClick={handleSelectAll} disabled={!tabs.length}>
                      Select all (excl. dashboard)
                    </button>
                    <button className="ghost small" type="button" onClick={handleClearSelection}>
                      Clear
                    </button>
                  </div>
                  {windowIds.map((winId) => (
                    <div key={winId} className="window-group">
                      <div className="window-label">Window {winId === -1 ? "?" : winId}</div>
                      <div className="tab-table">
                        <div className="tab-table-head">
                          <span>Tab</span>
                          <span>Status</span>
                          <span>Actions</span>
                        </div>
                        {groupedByWindow[winId]
                          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
                          .map((tab) => {
                            const analyzedRun = analyzedByTabId.get(tab.id);
                            const isForced = forcedTabIds.includes(tab.id);
                            return (
                              <div key={tab.id} className="tab-row structured">
                                <label className="tab-cell">
                                  <input
                                    type="checkbox"
                                    checked={selectedTabIds.includes(tab.id)}
                                    onChange={() => handleToggleTab(tab.id)}
                                  />
                                  <span className="tab-title">
                                    {tab.active ? "• " : ""}
                                    {tab.title || tab.url || "Untitled"} ({formatUrl(tab.url)})
                                    {tab.isDashboard ? " — Dashboard (excluded from All)" : ""}
                                  </span>
                                </label>
                                <div className="tab-cell status">
                                  {analyzedRun ? <span className="badge subtle">Analyzed</span> : <span className="badge subtle">New</span>}
                                  {isForced ? <span className="badge">Force</span> : null}
                                </div>
                                <div className="tab-cell actions">
                                  {analyzedRun ? (
                                    <button
                                      className="link-button small"
                                      type="button"
                                      onClick={() => {
                                        if (typeof window !== "undefined") {
                                          window.location.hash = `#/run/${analyzedRun.runId}`;
                                        }
                                      }}
                                    >
                                      View
                                    </button>
                                  ) : null}
                                  {analyzedRun ? (
                                    <label className="checkbox-label tiny">
                                      <input
                                        type="checkbox"
                                        checked={isForced}
                                        onChange={() =>
                                          setForcedTabIds((prev) =>
                                            isForced ? prev.filter((id) => id !== tab.id) : [...prev, tab.id]
                                          )
                                        }
                                      />
                                      <span>Force</span>
                                    </label>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {queueSize > 1 ? <p className="hint">Queue will run in tab order across windows.</p> : null}
            {runningSelectedCount ? (
              <p className="hint warn">
                {runningSelectedCount} selected tab{runningSelectedCount > 1 ? "s" : ""} already running.
              </p>
            ) : null}
            {analyzedSelectedCount ? (
              <p className="hint">
                {analyzedSelectedCount} selected tab(s) have prior completed runs. Toggle force on the tab to re-run.
              </p>
            ) : null}
            {analyzing ? <p className="hint">Analysis in progress…</p> : null}
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
            <button
              className="primary"
              onClick={handleAnalyze}
              disabled={
                analyzing ||
                backendStatus !== "online" ||
                tabs.length === 0 ||
                runningSelectedCount > 0
              }
              title={
                backendStatus !== "online"
                  ? "Backend required for analysis."
                  : tabs.length === 0
                    ? "Open at least one job tab."
                    : runningSelectedCount > 0
                      ? "A run is already in progress for a selected tab."
                      : "Extract then analyze selected tabs."
              }
            >
              {analyzing ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </div>

        {statusText && (
          <div className="status-text">
            {statusText}
          </div>
        )}

        {/* Active runs/queues */}
        {runs.some((r) => r.result === "pending" || (r.status && !["DONE", "ERROR"].includes(r.status))) ? (
          <div className="active-runs">
            <h4>Active runs</h4>
            {Object.values(
              runs
                .filter((r) => r.result === "pending" || (r.status && !["DONE", "ERROR"].includes(r.status)))
                .reduce<Record<string, any>>((acc, run) => {
                  const key = run.queueId || run.runId;
                  if (!acc[key]) acc[key] = { queueId: key, runs: [] as typeof runs };
                  acc[key].runs.push(run);
                  return acc;
                }, {})
            )
              .map((group) => {
                const sorted = group.runs
                  .slice()
                  .sort((a: any, b: any) => (a.queuePosition || 0) - (b.queuePosition || 0));
                return (
                  <div key={group.queueId} className="queue-card">
                    <div className="queue-card-head">
                      <div>
                        <div className="queue-title">{group.queueId}</div>
                        <div className="hint">
                          {sorted.length} item{sorted.length > 1 ? "s" : ""} · ordered by queue
                        </div>
                      </div>
                    </div>
                    <div className="queue-body">
                      {sorted.map((run: any) => (
                        <div key={run.runId} className="tab-row structured">
                          <div className="tab-cell">
                            <span className="tab-title">
                              {run.queuePosition ? `#${run.queuePosition} ` : ""}
                              {run.title || "Untitled"} ({run.company || "Unknown"})
                            </span>
                          </div>
                          <div className="tab-cell status">
                            <span className="status-pill tiny">
                              {run.queuePosition === 1 ? "RUNNING" : "PENDING"}
                            </span>
                          </div>
                          <div className="tab-cell actions">
                            <button
                              className="link-button small"
                              type="button"
                              onClick={() => {
                                if (typeof window !== "undefined") {
                                  window.location.hash = `#/run/${run.runId}`;
                                }
                              }}
                            >
                              Open
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}
      </div>


    </div>
  );
};

export default StartRunPage;
