"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import UserOnboarding from "@/components/UserOnboarding";
import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import { formatDateTime } from "@/utils/runFilters";

export default function StartRunPage() {
  const { user: clerkUser } = useUser();
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "checking">("online");
  const [syncingJobs, setSyncingJobs] = useState(false);
  
  // Get user from Convex
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );

  // Get user's master resumes
  const resumes = useQuery(
    api.masterResumes.getMasterResumes,
    convexUser ? { userId: convexUser._id } : "skip"
  );

  const activeResume = useMemo(() => {
    return resumes?.find((r: any) => r.isActive) || resumes?.[0];
  }, [resumes]);

  // Get tabs from extension (like React dashboard did)
  const [tabs, setTabs] = useState<any[]>([]);
  
  // Get user's jobs (for reference, but we'll work with tabs primarily)
  const jobs = useQuery(
    api.jobs.getJobs,
    convexUser ? { userId: convexUser._id } : "skip"
  ) || [];

  // Get user's runs
  const runs = useQuery(
    api.runs.getRuns,
    convexUser ? { userId: convexUser._id } : "skip"
  ) || [];

  const createRun = useMutation(api.runs.createRun);

  // Function to request tabs from extension
  const requestTabs = useCallback(() => {
    // Check if we're in an iframe by trying to access parent
    let isInIframe = false;
    try {
      // Try to access parent - if we can and it's different, we're in an iframe
      isInIframe = typeof window !== "undefined" && 
                   window.parent !== window && 
                   window.parent !== null;
    } catch (e) {
      // Cross-origin iframe - we're definitely in an iframe
      isInIframe = true;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:54',message:'requestTabs called',data:{hasWindow:typeof window!=='undefined',isIframe,windowLocation:typeof window!=='undefined'?window.location.href:'none',parentExists:typeof window!=='undefined'&&window.parent!==null},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (isInIframe && typeof window !== "undefined") {
      // We're in an iframe - request tabs from parent (extension sidepanel)
      const message = { type: "GET_TABS", scope: "currentWindow" };
      try {
        // Try sending to parent - use "*" to allow cross-origin
        window.parent.postMessage(message, "*");
        // Also try sending to top window
        if (window.top && window.top !== window) {
          window.top.postMessage(message, "*");
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:72',message:'postMessage sent to parent',data:{messageType:message.type,hasTop:!!window.top},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:78',message:'postMessage error',data:{error:String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      }
    } else {
      // Not in iframe - show message that extension is required
      setStatusText("Please open this page through the extension sidepanel to access tabs.");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:84',message:'Not in iframe - cannot access tabs',data:{hasWindow:typeof window!=='undefined',isIframe},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }
  }, []);

  // Listen for tab data from extension and sync jobs
  useEffect(() => {
    // Request tabs on mount
    requestTabs();
    
    // Also request tabs after a short delay to ensure iframe is ready
    const timeout = setTimeout(() => {
      requestTabs();
    }, 1000);

    const handleMessage = async (event: MessageEvent) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:68',message:'Message received',data:{origin:event.origin,type:event.data?.type,hasData:!!event.data,dataType:event.data?.type},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Accept messages from extension sidepanel (chrome-extension://) or same origin
      const isExtensionOrigin = event.origin.startsWith("chrome-extension://");
      const isSameOrigin = event.origin === window.location.origin;
      if (!isExtensionOrigin && !isSameOrigin) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:75',message:'Message rejected - wrong origin',data:{origin:event.origin,isExtension:isExtensionOrigin,isSame:isSameOrigin},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return;
      }

      if (event.data && event.data.type === "TABS_DATA") {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:80',message:'Received tabs data from extension',data:{tabsCount:event.data.tabs?.length||0,jobsCount:event.data.jobs?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        // Set tabs directly (like React dashboard did)
        if (event.data.tabs && Array.isArray(event.data.tabs)) {
          const filtered = event.data.tabs.filter((t: any) => 
            !t.isDashboard && 
            !(t.url || "").startsWith("chrome-extension://")
          );
          setTabs(filtered);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:88',message:'Tabs set',data:{filteredCount:filtered.length},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
        }

        // Optionally sync jobs to Convex in background (non-blocking)
        if (event.data.jobs && event.data.jobs.length > 0 && clerkUser && !syncingJobs) {
          setSyncingJobs(true);
          fetch("/api/sync-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tabs: event.data.jobs }),
          })
            .then((res) => res.json())
            .then((result) => {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:100',message:'Jobs synced to Convex',data:{created:result.created},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
            })
            .catch((err) => {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:105',message:'Job sync failed',data:{error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
            })
            .finally(() => setSyncingJobs(false));
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };
  }, [clerkUser, syncingJobs, requestTabs]);

  // Track which jobs have been analyzed
  const analyzedByJobId = useMemo(() => {
    const map = new Map<string, any>();
    runs.forEach((r: any) => {
      if (r.status === "success" && r.jobId) {
        map.set(r.jobId, r);
      }
    });
    return map;
  }, [runs]);

  const runningSelectedCount = useMemo(() => {
    return runs.filter((r: any) => 
      (r.status === "running" || r.stage !== "DONE") &&
      r.jobId &&
      selectedJobIds.includes(r.jobId)
    ).length;
  }, [runs, selectedJobIds]);

  const analyzedSelectedCount = useMemo(() => {
    return runs.filter((r: any) => 
      r.status === "success" && 
      r.jobId && 
      selectedJobIds.includes(r.jobId)
    ).length;
  }, [runs, selectedJobIds]);

  const handleToggleJob = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const exists = prev.includes(jobId);
      return exists ? prev.filter((id) => id !== jobId) : [...prev, jobId];
    });
  };

  const handleSelectAll = () => {
    const allIds = tabs.map((t: any) => t.id.toString());
    setSelectedJobIds(allIds);
    setDropdownOpen(false);
  };

  const handleClearSelection = () => {
    setSelectedJobIds([]);
    setDropdownOpen(false);
  };

  const handleAnalyze = useCallback(async () => {
    if (selectedJobIds.length === 0) {
      setStatusText("Select at least one tab.");
      return;
    }

    if (!activeResume) {
      setStatusText("No active master resume. Please create one in Settings.");
      return;
    }

    if (runningSelectedCount > 0) {
      setStatusText(`Already running for ${runningSelectedCount} selected tab${runningSelectedCount > 1 ? "s" : ""}.`);
      return;
    }

    if (backendStatus !== "online") {
      setStatusText("Backend required for analysis.");
      return;
    }

    setAnalyzing(true);
    setStatusText("Extracting from tabs and starting runs...");

    try {
      // For each selected tab, we need to:
      // 1. Extract job data from the tab
      // 2. Create/update job in Convex
      // 3. Create run
      
      // Note: This is a simplified version - in production you'd want to handle this via the extension
      // For now, we'll show a message that this needs to be implemented
      setStatusText("Tab-based analysis requires extension integration. Please use the extension's analyze feature.");
      
      // TODO: Implement proper tab extraction and run creation
      // This would require calling the extension's EXTRACT_FROM_TAB and ANALYZE_CAPTURE actions
      
    } catch (error: any) {
      setStatusText(error.message || "Failed to start run");
    } finally {
      setAnalyzing(false);
    }
  }, [selectedJobIds, activeResume, backendStatus, convexUser, tabs, runningSelectedCount]);

  // Show onboarding if user not set up
  if (!convexUser) {
    return <UserOnboarding />;
  }

  const queueSize = selectedJobIds.length;

  return (
    <div className="page-grid">
      {backendStatus === "offline" && (
        <div className="banner warn">
          Backend offline — analysis disabled.
        </div>
      )}

      {!activeResume && (
        <div className="banner warn">
          No active master resume. <Link href="/settings" className="link-button">Create one in Settings</Link>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Start New Run</h2>
            <p className="hint">Select tabs and start analysis runs</p>
          </div>
          <div className="actions-inline">
            <StatusPill status={backendStatus} onRetry={() => setBackendStatus("online")} />
            <button 
              className="ghost small" 
              onClick={requestTabs}
              title="Refresh tabs from extension"
            >
              Refresh tabs
            </button>
            <Link href="/overview" className="ghost small">
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="start-run-controls">
          <div className="control-group">
            <label htmlFor="jobSelect">Tabs (queue order)</label>
            <div className="multi-select">
              <button 
                className="select" 
                type="button" 
                onClick={() => setDropdownOpen((o) => !o)}
              >
                {tabs.length === 0
                  ? "No tabs found"
                  : analyzing
                    ? "Analyzing…"
                    : `${queueSize} selected · ${tabs.length} available`}
              </button>
              {dropdownOpen && tabs.length > 0 ? (
                <div className="multi-select-menu">
                  <div className="multi-select-actions">
                    <button className="ghost small" type="button" onClick={handleSelectAll}>
                      Select all
                    </button>
                    <button className="ghost small" type="button" onClick={handleClearSelection}>
                      Clear
                    </button>
                  </div>
                  <div className="tab-table">
                    <div className="tab-table-head">
                      <span>Job</span>
                      <span>Status</span>
                      <span>Actions</span>
                    </div>
                    {tabs.map((tab: any) => {
                      // Find if this tab has been analyzed (check runs by tab URL or ID)
                      const analyzedRun = runs.find((r: any) => 
                        r.jobId && jobs.find((j: any) => j._id === r.jobId && j.jobUrl === tab.url)
                      );
                      return (
                        <div key={tab.id} className="tab-row structured">
                          <label className="tab-cell">
                            <input
                              type="checkbox"
                              checked={selectedJobIds.includes(tab.id.toString())}
                              onChange={() => handleToggleJob(tab.id.toString())}
                            />
                            <span className="tab-title">
                              {tab.active ? "• " : ""}
                              {tab.title || tab.url || "Untitled"} ({tab.url ? new URL(tab.url).hostname : ""})
                            </span>
                          </label>
                          <div className="tab-cell status">
                            {analyzedRun ? (
                              <span className="badge subtle">Analyzed</span>
                            ) : (
                              <span className="badge subtle">New</span>
                            )}
                          </div>
                          <div className="tab-cell actions">
                            {analyzedRun ? (
                              <Link
                                href={`/run/${analyzedRun.runId}`}
                                className="link-button small"
                              >
                                View
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            {queueSize > 1 ? (
              <p className="hint">Queue will run in job order.</p>
            ) : null}
            {runningSelectedCount > 0 ? (
              <p className="hint warn">
                {runningSelectedCount} selected job{runningSelectedCount > 1 ? "s" : ""} already running.
              </p>
            ) : null}
            {analyzedSelectedCount > 0 ? (
              <p className="hint">
                {analyzedSelectedCount} selected job(s) have prior completed runs. Re-running will create a new run.
              </p>
            ) : null}
            {analyzing ? <p className="hint">Analysis in progress…</p> : null}
          </div>

          <div className="control-group actions">
            <button
              className="primary"
              onClick={handleAnalyze}
              disabled={
                analyzing ||
                backendStatus !== "online" ||
                tabs.length === 0 ||
                runningSelectedCount > 0 ||
                !activeResume ||
                selectedJobIds.length === 0
              }
              title={
                !activeResume
                  ? "No active master resume. Create one in Settings."
                  : backendStatus !== "online"
                    ? "Backend required for analysis."
                    : tabs.length === 0
                      ? "No tabs found. Open some job posting tabs."
                      : runningSelectedCount > 0
                        ? "A run is already in progress for a selected tab."
                        : selectedJobIds.length === 0
                          ? "Select at least one tab."
                          : "Start analysis for selected tabs."
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

        {/* Active runs */}
        {runs.some((r: any) => r.status === "running" || (r.stage && !["DONE", "ERROR"].includes(r.stage))) ? (
          <div className="active-runs">
            <h4>Active runs</h4>
            {Object.values(
              runs
                .filter((r: any) => r.status === "running" || (r.stage && !["DONE", "ERROR"].includes(r.stage)))
                .reduce<Record<string, any>>((acc, run: any) => {
                  const key = run.runId;
                  if (!acc[key]) acc[key] = { runId: key, runs: [] };
                  acc[key].runs.push(run);
                  return acc;
                }, {})
            )
              .map((group: any) => {
                const sorted = group.runs.slice().sort((a: any, b: any) => 
                  (a.createdAt || 0) - (b.createdAt || 0)
                );
                return (
                  <div key={group.runId} className="queue-card">
                    <div className="queue-card-head">
                      <div>
                        <div className="queue-title">{group.runId}</div>
                        <div className="hint">
                          {sorted.length} item{sorted.length > 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="queue-body">
                      {sorted.map((run: any) => (
                        <div key={run._id} className="tab-row structured">
                          <div className="tab-cell">
                            <span className="tab-title">
                              {run.title || "Untitled"} ({run.company || "Unknown"})
                            </span>
                          </div>
                          <div className="tab-cell status">
                            <span className="status-pill tiny">
                              {run.stage === "DONE" ? "DONE" : run.stage || "RUNNING"}
                            </span>
                          </div>
                          <div className="tab-cell actions">
                            <Link
                              href={`/run/${run.runId}`}
                              className="link-button small"
                            >
                              Open
                            </Link>
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
}
