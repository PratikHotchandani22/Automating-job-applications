"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import UserOnboarding from "@/components/UserOnboarding";
import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import { formatDateTime } from "@/utils/runFilters";

// Declare chrome types for TypeScript
declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (extensionId: string, message: any, callback?: (response: any) => void) => void;
      };
    };
  }
}

// Known extension ID - users can update this if using unpacked extension
const EXTENSION_ID = "YOUR_EXTENSION_ID_HERE"; // Will be auto-detected

export default function StartRunPage() {
  const { user: clerkUser } = useUser();
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "checking">("online");
  const [syncingJobs, setSyncingJobs] = useState(false);
  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const extensionIdRef = useRef<string | null>(null);
  
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

  // Get resume bullets for the active resume
  const resumeBullets = useQuery(
    api.resumeBullets.getResumeBullets,
    activeResume ? { masterResumeId: activeResume._id } : "skip"
  );

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

  // Helper to check if we're in an iframe
  const isInIframe = useCallback(() => {
    try {
      return typeof window !== "undefined" && window.parent !== window;
    } catch (e) {
      return true;
    }
  }, []);

  // Check if chrome.runtime is available for external messaging
  const hasChromeRuntime = typeof window !== "undefined" && 
    window.chrome?.runtime?.sendMessage !== undefined;

  // Function to send message to extension using external messaging
  const sendExtensionMessage = useCallback((message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const extId = extensionIdRef.current;
      if (!hasChromeRuntime || !extId) {
        reject(new Error("Extension not available"));
        return;
      }
      try {
        window.chrome!.runtime!.sendMessage(extId, message, (response: any) => {
          if (response?.ok === false) {
            reject(new Error(response?.error || "Extension request failed"));
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }, [hasChromeRuntime]);

  // Function to request tabs from extension
  const requestTabs = useCallback(async () => {
    // Check if we're in an iframe by trying to access parent
    let isInIframe = false;
    try {
      isInIframe = typeof window !== "undefined" && 
                   window.parent !== window && 
                   window.parent !== null;
    } catch (e) {
      isInIframe = true;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:requestTabs',message:'requestTabs called',data:{hasWindow:typeof window!=='undefined',isInIframe,hasChromeRuntime,extensionId:extensionIdRef.current,windowLocation:typeof window!=='undefined'?window.location.href:'none'},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (isInIframe && typeof window !== "undefined") {
      // We're in an iframe - request tabs from parent (extension sidepanel)
      const message = { type: "GET_TABS", scope: "currentWindow" };
      try {
        window.parent.postMessage(message, "*");
        if (window.top && window.top !== window) {
          window.top.postMessage(message, "*");
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:requestTabs',message:'postMessage sent to parent (iframe mode)',data:{messageType:message.type},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:requestTabs',message:'postMessage error',data:{error:String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      }
    } else if (hasChromeRuntime && extensionIdRef.current) {
      // Not in iframe but extension is available - use direct messaging
      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:requestTabs',message:'Using direct extension messaging',data:{extensionId:extensionIdRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const response = await sendExtensionMessage({ action: "GET_TABS", scope: "currentWindow" });
        if (response?.ok && response?.tabs) {
          const filtered = response.tabs.filter((t: any) => 
            !t.isDashboard && 
            !(t.url || "").startsWith("chrome-extension://")
          );
          setTabs(filtered);
          setStatusText(`Found ${filtered.length} tabs.`);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:requestTabs',message:'Got tabs via direct messaging',data:{tabsCount:filtered.length},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
        }
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:requestTabs',message:'Direct extension message failed',data:{error:String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        setStatusText("Extension communication failed. Please check that the extension is installed.");
      }
    } else {
      // No extension available
      setStatusText("Extension not detected. Please install the ResumeGen Tracker extension and reload this page.");
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:requestTabs',message:'No extension available',data:{hasChromeRuntime,extensionId:extensionIdRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
    }
  }, [hasChromeRuntime, sendExtensionMessage]);

  // Detect extension on mount
  useEffect(() => {
    if (!hasChromeRuntime) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:detectExtension',message:'No chrome.runtime available',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      return;
    }

    // Try to detect extension by sending a ping to known extension IDs
    // For unpacked extensions, users need to provide the ID
    const tryExtensionIds = [
      localStorage.getItem("resumegen_extension_id"), // User-provided ID
      // Add your extension ID here when published
    ].filter(Boolean) as string[];

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:detectExtension',message:'Attempting extension detection',data:{tryExtensionIds},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'G'})}).catch(()=>{});
    // #endregion

    const detectExtension = async () => {
      for (const extId of tryExtensionIds) {
        try {
          await new Promise<void>((resolve, reject) => {
            window.chrome!.runtime!.sendMessage(extId, { action: "GET_EXTENSION_ID" }, (response: any) => {
              if (response?.ok && response?.extensionId) {
                extensionIdRef.current = response.extensionId;
                setExtensionId(response.extensionId);
                setExtensionDetected(true);
                setStatusText("Extension connected. Click 'Refresh tabs' to load tabs.");
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:detectExtension',message:'Extension detected',data:{extensionId:response.extensionId},timestamp:Date.now(),sessionId:'debug-session',runId:'sync-jobs',hypothesisId:'G'})}).catch(()=>{});
                // #endregion
                resolve();
              } else {
                reject(new Error("Invalid response"));
              }
            });
          });
          return; // Found a working extension
        } catch (e) {
          // Try next ID
        }
      }
      
      // No extension found with known IDs - show instructions
      setStatusText("Extension not detected. Enter your extension ID in the input below.");
    };

    detectExtension();
  }, [hasChromeRuntime]);

  // Listen for tab data from extension and sync jobs
  useEffect(() => {
    // Request tabs on mount (but only if extension is detected or we're in iframe)
    const isInIframe = typeof window !== "undefined" && window.parent !== window;
    if (isInIframe || extensionDetected) {
    requestTabs();
    }
    
    // Also request tabs after a short delay to ensure iframe is ready
    const timeout = setTimeout(() => {
      if (isInIframe || extensionDetected) {
      requestTabs();
      }
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
  }, [clerkUser, syncingJobs, requestTabs, extensionDetected]);

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

    if (resumeBullets === undefined) {
      setStatusText("Loading resume data... Please wait.");
      return;
    }

    if (runningSelectedCount > 0) {
      setStatusText(`Already running for ${runningSelectedCount} selected tab${runningSelectedCount > 1 ? "s" : ""}.`);
      return;
    }

    // Check if we can communicate with extension
    if (!extensionIdRef.current && !isInIframe()) {
      setStatusText("Extension not connected. Please enter your extension ID above.");
      return;
    }

    setAnalyzing(true);
    setStatusText("Extracting job data from tabs...");

    try {
      // Convert selected IDs to numbers (tab IDs)
      const tabIds = selectedJobIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      
      if (tabIds.length === 0) {
        setStatusText("No valid tabs selected.");
        setAnalyzing(false);
        return;
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:handleAnalyze',message:'Starting analysis',data:{tabIds,selectedJobIds,extensionId:extensionIdRef.current,isInIframe:isInIframe()},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze',hypothesisId:'H'})}).catch(()=>{});
      // #endregion

      let successCount = 0;
      let failCount = 0;
      const results: any[] = [];

      // Process each selected tab
      for (const tabId of tabIds) {
        try {
          setStatusText(`Extracting from tab ${tabId}...`);
          
          // Step 1: Extract job data from tab using extension
          const extractResponse = await sendExtensionMessage({
            action: "EXTRACT_JOB_FROM_TAB",
            tabId
          });

          if (!extractResponse?.ok || !extractResponse?.data) {
            failCount++;
            results.push({ tabId, ok: false, error: "Extraction failed" });
            continue;
          }

          const extraction = extractResponse.data;
          const jobPayload = {
            job: {
              title: extraction.job?.title || "",
              company: extraction.job?.company || "",
              location: extraction.job?.location || "",
              description_text: extraction.job?.description_text || "",
            },
            meta: {
              url: extraction.meta?.url || "",
              platform: extraction.meta?.platform || "",
            }
          };

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:handleAnalyze',message:'Job extracted',data:{tabId,title:jobPayload.job.title,company:jobPayload.job.company,descLength:jobPayload.job.description_text.length},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze',hypothesisId:'H'})}).catch(()=>{});
          // #endregion

          if (!jobPayload.job.description_text) {
            failCount++;
            results.push({ tabId, ok: false, error: "No job description found" });
            continue;
          }

          // Step 2: Call the Next.js analyze API
          setStatusText(`Analyzing job: ${jobPayload.job.title || "Unknown"}...`);

          const analyzeResponse = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_payload: jobPayload,
              master_resume_id: activeResume._id,
            }),
          });

          const analyzeResult = await analyzeResponse.json();

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:handleAnalyze',message:'Analyze API response',data:{tabId,success:analyzeResult.success,runId:analyzeResult.run_id,error:analyzeResult.error},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze',hypothesisId:'H'})}).catch(()=>{});
          // #endregion

          if (analyzeResult.success) {
            successCount++;
            results.push({ 
              tabId, 
              ok: true, 
              runId: analyzeResult.run_id,
              title: jobPayload.job.title,
              company: jobPayload.job.company,
            });
            if (selectedJobIds.length === 1 && analyzeResult.run_id) {
              window.location.href = `/run/${analyzeResult.run_id}`;
              return;
            }

            fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phase: "execute", run_id: analyzeResult.run_id }),
              keepalive: true,
            }).catch(() => {});
          } else {
            failCount++;
            results.push({ tabId, ok: false, error: analyzeResult.error || "Analysis failed" });
          }
        } catch (e: any) {
          failCount++;
          results.push({ tabId, ok: false, error: e.message });
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:handleAnalyze',message:'Analysis complete',data:{successCount,failCount,results},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze',hypothesisId:'H'})}).catch(()=>{});
      // #endregion

      if (failCount > 0 && successCount > 0) {
        setStatusText(`Analysis complete. ${successCount} succeeded, ${failCount} failed.`);
      } else if (failCount > 0) {
        setStatusText(`Analysis failed for all ${failCount} tab(s). Check console for details.`);
      } else {
        setStatusText(`Analysis complete for ${successCount} tab(s)!`);
      }
      
      setSelectedJobIds([]); // Clear selection after starting
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/start-run/page.tsx:handleAnalyze',message:'Analysis error',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      setStatusText(error.message || "Failed to start run");
    } finally {
      setAnalyzing(false);
    }
  }, [selectedJobIds, activeResume, resumeBullets, runningSelectedCount, sendExtensionMessage, isInIframe]);

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

      {/* Extension ID setup - only show when not in iframe and extension not detected */}
      {!extensionDetected && typeof window !== "undefined" && window.parent === window && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <div>
              <h3>Extension Setup</h3>
              <p className="hint">Enter your ResumeGen Tracker extension ID to enable direct communication</p>
            </div>
          </div>
          <div style={{ padding: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Extension ID (e.g., abcdefghijklmnopqrstuvwxyz)"
              defaultValue={typeof localStorage !== "undefined" ? localStorage.getItem("resumegen_extension_id") || "" : ""}
              style={{
                flex: 1,
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const input = e.target as HTMLInputElement;
                  localStorage.setItem("resumegen_extension_id", input.value);
                  window.location.reload();
                }
              }}
            />
            <button
              className="primary small"
              onClick={() => {
                const input = document.querySelector('input[placeholder*="Extension ID"]') as HTMLInputElement;
                if (input?.value) {
                  localStorage.setItem("resumegen_extension_id", input.value);
                  window.location.reload();
                }
              }}
            >
              Connect
            </button>
          </div>
          <p className="hint" style={{ padding: "0 1rem 1rem" }}>
            Find your extension ID at <code>chrome://extensions</code> (enable Developer mode to see it)
          </p>
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
