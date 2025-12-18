import { useEffect, useState, useCallback, useMemo } from "react";
import {
  analyzeCapture,
  consumeStartRunPrefill,
  extractFromTab,
  fetchExtensionState,
  fetchUserBootstrap,
  getTabs,
  setUIState,
  startQueue
} from "../api/bridge";
import { useNavigate } from "react-router-dom";
import type { Capture, StartRunUIState, Tab } from "../types";
import StatusPill from "../components/StatusPill";
import { useDashboardStore } from "../store/dashboardStore";
import useBootstrapCheck from "../hooks/useBootstrapCheck";
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
  const navigate = useNavigate();
  const {
    requiresBootstrap,
    loading: bootstrapLoading,
    error: bootstrapError,
    refresh: refreshBootstrap
  } = useBootstrapCheck();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [statusText, setStatusText] = useState<string>("");
  const [tabScope, setTabScope] = useState<"currentWindow" | "allWindows">("currentWindow");
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [forcedTabIds, setForcedTabIds] = useState<number[]>([]);
  
  // Use global backend status from store to avoid flickering between local and global states
  const backendStatus = useDashboardStore((state) => state.backendStatus);
  const refreshBackendStatus = useDashboardStore((state) => state.refreshRuns);

  const validSelectedTabs = useMemo(
    () => selectedTabIds.filter((id) => tabs.some((t) => t.id === id)),
    [selectedTabIds, tabs]
  );
  const runningSelectedCount = useMemo(() => {
    return validSelectedTabs.filter((id) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return false;
      const runningRun = runs.find(
        (r) =>
          (r.result === "pending" || r.status === "RUNNING" || r.status === "ANALYZING" || r.status === "EXTRACTING") &&
          r.tab?.tabId === tab.id &&
          r.tab?.url === tab.url
      );
      return !!runningRun;
    }).length;
  }, [runs, validSelectedTabs, tabs]);
  const analyzedSelectedCount = useMemo(() => {
    return validSelectedTabs.filter((id) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return false;
      const analyzedRun = runs.find(
        (r) => r.result === "success" && r.tab?.tabId === tab.id && r.tab?.url === tab.url
      );
      return !!analyzedRun;
    }).length;
  }, [runs, validSelectedTabs, tabs]);
  const analyzedByTabId = useMemo(() => {
    const map = new Map<number, any>();
    runs.forEach((r) => {
      if (r.result === "success" && r.tab?.tabId && r.tab?.url) {
        // Store the run with a key that combines tabId and URL
        // This ensures that navigating to a different page in the same tab won't show as "Analyzed"
        const key = `${r.tab.tabId}_${r.tab.url}`;
        map.set(key as any, r);
      }
    });
    return map;
  }, [runs]);
  
  // Helper function to check if a tab has been analyzed
  const getAnalyzedRun = (tab: Tab) => {
    const key = `${tab.id}_${tab.url}`;
    return analyzedByTabId.get(key as any);
  };

  const loadState = useCallback(async () => {
    try {
      const state = await fetchExtensionState();
      setCaptures((state as any).captures || []);
      setRuns((state as any).runs || []);

      const ui = ((state as any).ui_state || null) as StartRunUIState | null;
      if (ui?.tabScope) {
        setTabScope(ui.tabScope);
      }
      if (Array.isArray(ui?.selectedTabIds) && ui?.selectedTabIds?.length) {
        setSelectedTabIds(ui.selectedTabIds.filter((n) => Number.isFinite(Number(n))).map((n) => Number(n)));
      } else if (ui?.selectedTabId && Number.isFinite(Number(ui.selectedTabId))) {
        setSelectedTabIds([Number(ui.selectedTabId)]);
      }
    } catch (error: any) {
      setStatusText(error.message || "Unable to load state");
    }
  }, []);

  // Use the store's refreshRuns which also updates backend health status
  const checkBackendHealth = useCallback(async () => {
    await refreshBackendStatus();
  }, [refreshBackendStatus]);

  const refreshTabs = useCallback(async () => {
    try {
      const tabsData = await getTabs(tabScope);
      const filtered = tabsData.filter((t) => {
        // Exclude dashboard tabs
        if (t.isDashboard) return false;
        
        // Exclude chrome extension URLs
        const url = (t.url || "").toLowerCase();
        if (url.startsWith("chrome-extension://") || url.startsWith("chrome://")) return false;
        
        // Exclude extension-like titles
        const title = (t.title || "").toLowerCase();
        if (title.includes("extensions") || title.includes("chrome web store")) return false;
        
        return true;
      });
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
    if (validSelectedTabs.length === 0) {
      setStatusText("Select at least one tab.");
      return;
    }

    console.debug("[StartRun] Analyze click", {
      requiresBootstrap,
      bootstrapLoading,
      backendStatus,
      selectedTabs: validSelectedTabs
    });

    // Backend source of truth: ensure a master resume exists before kicking off analysis.
    if (requiresBootstrap) {
      try {
        const bootstrap = await fetchUserBootstrap();
        const hasResume =
          bootstrap?.has_master_resume ||
          bootstrap?.default_master_resume_id ||
          (Array.isArray(bootstrap?.master_resumes) && bootstrap.master_resumes.length > 0);
        if (!hasResume) {
          setStatusText("No master resume found in your account. Upload one in Settings, then recheck.");
          console.warn("[StartRun] Master resume missing at analyze time", bootstrap);
          return;
        }
        console.debug("[StartRun] Master resume verified");
      } catch (error: any) {
        setStatusText(error?.message || "Unable to verify master resume. Please retry.");
        console.error("[StartRun] Master resume check failed", error);
        return;
      }
    }

    if (runningSelectedCount) {
      setStatusText(`Already running for ${runningSelectedCount} selected tab${runningSelectedCount > 1 ? "s" : ""}.`);
      return;
    }

    const runnableTabIds = validSelectedTabs.filter((id) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return false;
      const analyzedRun = getAnalyzedRun(tab);
      return !analyzedRun || forcedTabIds.includes(id);
    });
    if (runnableTabIds.length === 0) {
      setStatusText("Nothing to run. Toggle force or pick a new tab.");
      return;
    }

    if (runnableTabIds.length > 1) {
      if (backendStatus !== "online") {
        setStatusText("Backend required for batch analysis.");
        return;
      }
      setAnalyzing(true);
      setStatusText("Starting batch analysis across selected tabs…");
      try {
        const response = await startQueue(runnableTabIds);
        const successCount = response.results?.filter((r: any) => r?.ok).length || 0;
        const failCount = (response.results?.length || 0) - successCount;
        setStatusText(
          `Batch started (${successCount} started${failCount ? `, ${failCount} failed to start` : ""}).`
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
  }, [captures, backendStatus, loadState, tabs, tabScope, selectedTabIds, requiresBootstrap]);


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
    (async () => {
      await loadState();
      await refreshTabs();
      await checkBackendHealth();
      // If the extension action opened the dashboard, it may have provided a one-time prefill.
      // We consume it here so the dashboard feels immediately “ready”.
      try {
        const prefill = await consumeStartRunPrefill();
        if (prefill?.tabId && Number.isFinite(Number(prefill.tabId))) {
          const id = Number(prefill.tabId);
          setSelectedTabIds([id]);
          await setUIState({ tabScope: "currentWindow", selectedTabId: id, selectedTabIds: [id] });
          setStatusText("Prefilled from your active job tab. Review and click Analyze.");
          setDropdownOpen(false);
        } else {
          setStatusText("Ready.");
        }
      } catch {
        setStatusText("Ready.");
      }
    })();

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


  if (requiresBootstrap && bootstrapError) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Unable to load your account</h2>
            <p className="hint">{bootstrapError}</p>
          </div>
        </div>
        <div className="actions-inline" style={{ padding: "0 12px 12px" }}>
          <button className="ghost" onClick={() => refreshBootstrap()}>
            Retry
          </button>
          <button className="ghost" onClick={() => navigate("/settings")}>
            Open settings
          </button>
        </div>
      </div>
    );
  }

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
      {requiresBootstrap && bootstrapLoading ? (
        <div className="banner">
          Preparing your workspace… verifying account and resume.
          <button className="ghost small" onClick={() => refreshBootstrap()} style={{ marginLeft: 8 }}>
            Recheck
          </button>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Analyze a job</h2>
            <p className="hint">Select a job tab and generate tailored materials</p>
          </div>
          <div className="actions-inline">
            <StatusPill status={backendStatus} onRetry={checkBackendHealth} />
            <button className="ghost small" onClick={refreshTabs}>
              Refresh tabs
            </button>
          </div>
        </div>

        <div className="start-run-hero">
          <div className="start-run-hero-left">
            <div className="start-run-hero-title">From job tab → tailored resume</div>
            <div className="start-run-hero-subtitle">
              Select the job tab you’re viewing. We’ll extract the description, tailor your resume, then you can edit and download.
            </div>
          </div>
          <div className="start-run-hero-right">
            <div className="start-run-hero-metrics">
              <div className="metric">
                <div className="metric-label">Selected</div>
                <div className="metric-value">{queueSize}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Running</div>
                <div className="metric-value">{runningSelectedCount}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Done</div>
                <div className="metric-value">{analyzedSelectedCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="start-run-controls">
          <div className="control-group">
            <label htmlFor="tabSelect">Job tabs (order)</label>
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
                            const analyzedRun = getAnalyzedRun(tab);
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
            {queueSize > 1 ? <p className="hint">We’ll analyze the selected tabs in this order.</p> : null}
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
            <h4>In progress</h4>
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
                        <div className="queue-title">Batch analysis</div>
                        <div className="hint">
                          {sorted.length} item{sorted.length > 1 ? "s" : ""} · in selected order
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
                              In progress
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
