"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import UserOnboarding from "@/components/UserOnboarding";
import Link from "next/link";
import StatusPill from "@/components/StatusPill";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// Utility to detect corrupted job titles (like LinkedIn notification badges)
function isCorruptedTitle(title: string | undefined | null): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  // Detect patterns like "0 notifications total", "1 notification total", etc.
  if (/^\d+\s*notifications?\s*total$/i.test(lower)) return true;
  // Detect very short titles that are just numbers
  if (/^\d+$/.test(lower)) return true;
  // Detect other LinkedIn UI text that might get captured
  if (lower === "loading..." || lower === "linkedin" || lower.length < 3) return true;
  return false;
}

// Get a display-safe title, preferring the first valid title from the list
function getSafeTitle(...titles: (string | undefined | null)[]): string {
  for (const title of titles) {
    if (!isCorruptedTitle(title)) return title!;
  }
  return "Untitled Job";
}

function SortableQueueItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

const dedupeJobIds = (jobIds: any[]) => {
  const seen = new Set<string>();
  return jobIds.filter((jobId) => {
    const key = jobId.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const safeHostname = (value?: string) => {
  if (!value) return "";
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

export default function StartRunPage() {
  const { user: clerkUser } = useUser();
  const [selectedTabIds, setSelectedTabIds] = useState<string[]>([]);
  const [tabSearch, setTabSearch] = useState("");
  const [tabFilter, setTabFilter] = useState<"all" | "new" | "analyzed" | "queued">("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "checking">("online");
  const [syncingJobs, setSyncingJobs] = useState(false);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const extensionIdRef = useRef<string | null>(null);
  
  // Track queue processing state locally
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number | null>(null);
  const [completedJobRuns, setCompletedJobRuns] = useState<Map<string, { runId: string; status: "success" | "error" }>>(new Map());
  
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

  const tabTitleByUrl = useMemo(() => {
    const map = new Map<string, string>();
    tabs.forEach((tab: any) => {
      if (tab.url && tab.title) {
        map.set(tab.url, tab.title);
      }
    });
    return map;
  }, [tabs]);

  const jobByUrl = useMemo(() => {
    const map = new Map<string, any>();
    jobs.forEach((job: any) => {
      if (job.jobUrl) {
        map.set(job.jobUrl, job);
      }
    });
    return map;
  }, [jobs]);

  // Get user's runs
  const runs = useQuery(
    api.runs.getRuns,
    convexUser ? { userId: convexUser._id } : "skip"
  ) || [];

  const queueData = useQuery(
    api.runs.getActiveQueueRunWithItems,
    convexUser ? { userId: convexUser._id } : "skip"
  );
  const createQueueRun = useMutation(api.runs.createQueueRun);
  const updateQueueOrder = useMutation(api.runs.updateQueueOrder);
  const updateQueueMasterResume = useMutation(api.runs.updateQueueMasterResume);
  const processQueueSequentially = useAction(api.runs.processQueueSequentially);
  const resetQueueRun = useMutation(api.runs.resetQueueRun);
  const updateRunStatus = useMutation(api.runs.updateRunStatus);

  const queueRun = queueData?.queueRun || null;
  const queueItems = queueData?.items || [];
  const queueJobIds = queueRun?.queueJobIds || [];

  const queueOrder = useMemo(
    () => queueJobIds.map((id: any) => id.toString()),
    [queueJobIds]
  );

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
    
    
    if (isInIframe && typeof window !== "undefined") {
      // We're in an iframe - request tabs from parent (extension sidepanel)
      const message = { type: "GET_TABS", scope: "currentWindow" };
      try {
        window.parent.postMessage(message, "*");
        if (window.top && window.top !== window) {
          window.top.postMessage(message, "*");
        }
      } catch (e) {
      }
    } else if (hasChromeRuntime && extensionIdRef.current) {
      // Not in iframe but extension is available - use direct messaging
      try {
        const response = await sendExtensionMessage({ action: "GET_TABS", scope: "currentWindow" });
        if (response?.ok && response?.tabs) {
          const filtered = response.tabs.filter((t: any) => 
            !t.isDashboard && 
            !(t.url || "").startsWith("chrome-extension://")
          );
          setTabs(filtered);
          setStatusText(`Found ${filtered.length} tabs.`);
        }
      } catch (e) {
        setStatusText("Extension communication failed. Please check that the extension is installed.");
      }
    } else {
      // No extension available
      setStatusText("Extension not detected. Please install the ResumeGen Tracker extension and reload this page.");
    }
  }, [hasChromeRuntime, sendExtensionMessage]);

  // Detect extension on mount
  useEffect(() => {
    if (!hasChromeRuntime) {
      return;
    }

    // Try to detect extension by sending a ping to known extension IDs
    // For unpacked extensions, users need to provide the ID
    const tryExtensionIds = [
      localStorage.getItem("resumegen_extension_id"), // User-provided ID
      // Add your extension ID here when published
    ].filter(Boolean) as string[];


    const detectExtension = async () => {
      for (const extId of tryExtensionIds) {
        try {
          await new Promise<void>((resolve, reject) => {
            window.chrome!.runtime!.sendMessage(extId, { action: "GET_EXTENSION_ID" }, (response: any) => {
                if (response?.ok && response?.extensionId) {
                  extensionIdRef.current = response.extensionId;
                  setExtensionDetected(true);
                setStatusText("Extension connected. Click 'Refresh tabs' to load tabs.");
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
      
      // Accept messages from extension sidepanel (chrome-extension://) or same origin
      const isExtensionOrigin = event.origin.startsWith("chrome-extension://");
      const isSameOrigin = event.origin === window.location.origin;
      if (!isExtensionOrigin && !isSameOrigin) {
        return;
      }

      if (event.data && event.data.type === "TABS_DATA") {

        // Set tabs directly (like React dashboard did)
        if (event.data.tabs && Array.isArray(event.data.tabs)) {
          const filtered = event.data.tabs.filter((t: any) => 
            !t.isDashboard && 
            !(t.url || "").startsWith("chrome-extension://")
          );
          setTabs(filtered);
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
            })
            .catch((err) => {
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

  const tabsWithJobs = useMemo(() => {
    return tabs.map((tab: any) => {
      const job = tab.url ? jobByUrl.get(tab.url) : null;
      const analyzedRun = job ? analyzedByJobId.get(job._id) : null;
      const inQueue = job ? queueOrder.includes(job._id.toString()) : false;
      return { tab, job, analyzedRun, inQueue };
    });
  }, [tabs, jobByUrl, analyzedByJobId, queueOrder]);

  const filteredTabs = useMemo(() => {
    const query = tabSearch.trim().toLowerCase();
    return tabsWithJobs.filter(({ tab, analyzedRun, inQueue }) => {
      if (tabFilter === "analyzed" && !analyzedRun) return false;
      if (tabFilter === "new" && analyzedRun) return false;
      if (tabFilter === "queued" && !inQueue) return false;
      if (!query) return true;
      const title = (tab.title || "").toLowerCase();
      const url = (tab.url || "").toLowerCase();
      return title.includes(query) || url.includes(query);
    });
  }, [tabsWithJobs, tabSearch, tabFilter]);

  // Queue is only "locked" for reordering when actively processing, but adding is always allowed
  const isQueueProcessing = analyzing || currentProcessingIndex !== null;

  // Ref for auto-resume (will be used in effect after handleStartQueue is defined)
  const hasAutoResumedRef = useRef(false);

  const handleToggleTab = (tabId: string) => {
    setSelectedTabIds((prev) => {
      const exists = prev.includes(tabId);
      return exists ? prev.filter((id) => id !== tabId) : [...prev, tabId];
    });
  };

  // Select all visible tabs that are not already in queue
  const handleSelectAll = () => {
    const selectableTabIds = filteredTabs
      .filter(({ inQueue }) => !inQueue)
      .map(({ tab }) => tab.id.toString());
    setSelectedTabIds(selectableTabIds);
  };

  // Deselect all tabs
  const handleDeselectAll = () => {
    setSelectedTabIds([]);
  };

  // Check if all selectable tabs are selected
  const selectableTabIds = filteredTabs
    .filter(({ inQueue }) => !inQueue)
    .map(({ tab }) => tab.id.toString());
  const allSelected = selectableTabIds.length > 0 && selectableTabIds.every((id) => selectedTabIds.includes(id));

  const handleAddToQueue = useCallback(async () => {
    if (!activeResume || !convexUser) {
      setStatusText("No active master resume. Please create one in Settings.");
      return;
    }

    const selectedTabs = tabsWithJobs.filter(({ tab }) =>
      selectedTabIds.includes(tab.id.toString())
    );
    const existingJobIds = selectedTabs
      .map(({ job }) => job?._id)
      .filter(Boolean);

    const missingTabs = selectedTabs.filter(({ job }) => !job);
    let syncedJobIds: any[] = [];

    if (missingTabs.length > 0) {
      if (!extensionIdRef.current && !isInIframe()) {
        setStatusText("Extension not connected. Please enter your extension ID above.");
        return;
      }

      setAnalyzing(true);
      setStatusText("Syncing job data for queued tabs...");

      const jobsToSync: any[] = [];
      for (const { tab } of missingTabs) {
        try {
          const extractResponse = await sendExtensionMessage({
            action: "EXTRACT_JOB_FROM_TAB",
            tabId: tab.id,
          });

          if (!extractResponse?.ok || !extractResponse?.data) {
            continue;
          }

          const extraction = extractResponse.data;
          const description = extraction.job?.description_text || "";
          if (!description) {
            continue;
          }

          jobsToSync.push({
            id: tab.id,
            url: extraction.meta?.url || tab.url || "",
            // Use getSafeTitle to filter out corrupted titles like "0 notifications total"
            // and prefer the browser tab title which is usually more reliable
            title: getSafeTitle(extraction.job?.title, tab.title, "Untitled"),
            company: extraction.job?.company,
            location: extraction.job?.location,
            description,
          });
        } catch {
          // skip failed extraction
        }
      }

      if (jobsToSync.length > 0) {
        const syncResponse = await fetch("/api/sync-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabs: jobsToSync }),
        });
        const result = await syncResponse.json();
        if (!syncResponse.ok) {
          setAnalyzing(false);
          setStatusText(result?.error || "Failed to sync job data.");
          return;
        }
        syncedJobIds = (result.jobs || []).map((entry: any) => entry.jobId);
      }

      setAnalyzing(false);
    }

    const jobIdsToAdd = dedupeJobIds([...existingJobIds, ...syncedJobIds]);

    if (jobIdsToAdd.length === 0) {
      setStatusText("No jobs could be synced for the selected tabs.");
      return;
    }

    const nextQueue = dedupeJobIds([...queueJobIds, ...jobIdsToAdd]);

    try {
      if (!queueRun) {
        await createQueueRun({
          userId: convexUser._id,
          masterResumeId: activeResume._id,
          queueJobIds: nextQueue,
        });
      } else {
        await updateQueueOrder({
          queueRunId: queueRun._id,
          queueJobIds: nextQueue,
        });
        // Also update the master resume to the current active resume
        // This ensures we use the latest resume if the user changed it after queue creation
        await updateQueueMasterResume({
          queueRunId: queueRun._id,
          masterResumeId: activeResume._id,
        });
      }
      setSelectedTabIds([]);
      setStatusText(`Added ${jobIdsToAdd.length} item(s) to queue.`);
    } catch (error: any) {
      setStatusText(error.message || "Failed to update queue.");
    }
  }, [
    activeResume,
    convexUser,
    selectedTabIds,
    tabsWithJobs,
    queueJobIds,
    queueRun,
    createQueueRun,
    updateQueueOrder,
    updateQueueMasterResume,
    sendExtensionMessage,
    isInIframe,
  ]);

  const handleRemoveFromQueue = useCallback(
    async (jobId: string) => {
      if (!queueRun) return;
      const nextQueue = queueJobIds.filter(
        (id: any) => id.toString() !== jobId
      );
      try {
        await updateQueueOrder({
          queueRunId: queueRun._id,
          queueJobIds: nextQueue,
        });
      } catch (error: any) {
        setStatusText(error.message || "Failed to update queue.");
      }
    },
    [queueRun, queueJobIds, updateQueueOrder]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = useCallback(
    async (event: any) => {
      if (!queueRun) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = queueOrder.indexOf(active.id);
      const newIndex = queueOrder.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const nextOrder = arrayMove(queueOrder, oldIndex, newIndex);
      const nextQueue = nextOrder
        .map((id) => queueJobIds.find((jobId: any) => jobId.toString() === id))
        .filter(Boolean) as any[];

      try {
        await updateQueueOrder({
          queueRunId: queueRun._id,
          queueJobIds: nextQueue,
        });
      } catch (error: any) {
        setStatusText(error.message || "Failed to reorder queue.");
      }
    },
    [queueRun, queueOrder, queueJobIds, updateQueueOrder]
  );

  const handleStartQueue = useCallback(async () => {

    if (!queueRun || queueJobIds.length === 0) {
      setStatusText("Add items to the queue before starting.");
      return;
    }
    if (currentProcessingIndex !== null) {
      setStatusText("Queue is already running.");
      return;
    }
    if (!activeResume || !convexUser) {
      setStatusText("No active master resume. Please create one in Settings.");
      return;
    }
    
    // Check if any job is already actively running (not stale)
    // This prevents starting a new processing loop if a job is mid-flight
    const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const activelyRunningJob = queueItems.find((item: any) => {
      const runStatus = item?.run?.status;
      if (runStatus !== "running") return false;
      const runStartedAt = item?.run?.startedAt || item?.run?.createdAt || 0;
      const runAgeMs = Date.now() - runStartedAt;
      return runAgeMs <= STALE_RUN_THRESHOLD_MS; // Not stale = actively running
    });
    
    if (activelyRunningJob) {
      setStatusText("A job is already running. Please wait for it to complete.");
      return;
    }

    // Update the queue's master resume to the current active resume
    // This ensures we always use the latest resume even if it was changed after queue creation
    try {
      await updateQueueMasterResume({
        queueRunId: queueRun._id,
        masterResumeId: activeResume._id,
      });
    } catch (e) {
      console.error("Failed to update queue master resume:", e);
      // Continue anyway - we'll use activeResume._id directly in the API calls
    }

    setAnalyzing(true);
    setStatusText(`Running ${queueJobIds.length} item(s) sequentially...`);

    // Update queue status to running
    try {
      await updateRunStatus({
        runId: queueRun._id,
        status: "running",
        stage: "analyzing",
      });
    } catch (e) {
      console.error("Failed to update queue status:", e);
    }

    let processed = 0;
    let hadError = false;

    // Process each job sequentially using the Next.js /api/analyze endpoint
    for (let i = 0; i < queueJobIds.length; i++) {
      const jobId = queueJobIds[i];
      const jobIdStr = jobId.toString();
      
      // Skip jobs that have already been completed (check both local state AND server data)
      if (completedJobRuns.has(jobIdStr)) {
        processed++;
        continue;
      }
      
      // Also check server data for already completed OR already running jobs
      const queueItem = queueItems.find((item: any) => item?.job?._id?.toString() === jobIdStr);
      const runStatus = queueItem?.run?.status;
      const runStartedAt = queueItem?.run?.startedAt || queueItem?.run?.createdAt || 0;
      const runAgeMs = Date.now() - runStartedAt;
      const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
      const isStaleRun = runStatus === "running" && runAgeMs > STALE_RUN_THRESHOLD_MS;
      
      
      // Allow re-running previously analyzed jobs - don't skip successful runs
      // Users may want to re-analyze with updated resume or different settings
      
      // Skip jobs that are currently running (but NOT stale runs)
      if (runStatus === "running" && !isStaleRun) {
        processed++;
        continue;
      }
      
      // If run is stale (running for too long), log it and proceed to re-process
      if (isStaleRun) {
      }
      
      setCurrentProcessingIndex(i);
      setStatusText(`Processing job ${i + 1} of ${queueJobIds.length}...`);


      try {
        // Get job details
        const job = queueItems.find((item: any) => item?.job?._id?.toString() === jobIdStr)?.job;
        if (!job) {
          console.error("Job not found in queueItems:", jobId);
          setCompletedJobRuns(prev => new Map(prev).set(jobIdStr, { runId: "", status: "error" }));
          hadError = true;
          continue;
        }

        // Phase 1: Start the run
        const startResponse = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_payload: {
              job: {
                title: job.title || "Untitled",
                company: job.company || "",
                location: job.location || "",
                description_text: job.extractedText || job.rawDescription || "",
              },
              meta: {
                url: job.jobUrl || "",
                platform: job.platform || "",
              },
            },
            master_resume_id: activeResume._id,
          }),
        });

        if (!startResponse.ok) {
          const errorData = await startResponse.json().catch(() => ({}));
          console.error("Start phase failed:", errorData);
          setCompletedJobRuns(prev => new Map(prev).set(jobIdStr, { runId: "", status: "error" }));
          hadError = true;
          continue;
        }

        const startData = await startResponse.json();
        const runId = startData.run_id;


        // Phase 2: Execute the pipeline
        setStatusText(`Analyzing job ${i + 1} of ${queueJobIds.length}...`);
        const executeResponse = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "execute",
            run_id: runId,
          }),
        });

        if (!executeResponse.ok) {
          const errorData = await executeResponse.json().catch(() => ({}));
          console.error("Execute phase failed:", errorData);
          setCompletedJobRuns(prev => new Map(prev).set(jobIdStr, { runId, status: "error" }));
          hadError = true;
          continue;
        }

        const executeData = await executeResponse.json();

        // Mark job as completed successfully
        setCompletedJobRuns(prev => new Map(prev).set(jobIdStr, { runId, status: "success" }));
        processed++;
      } catch (error: any) {
        console.error("Error processing job:", error);
        setCompletedJobRuns(prev => new Map(prev).set(jobIdStr, { runId: "", status: "error" }));
        hadError = true;
      }
    }

    // Clear processing state
    setCurrentProcessingIndex(null);

    // Update queue status to complete
    try {
      await updateRunStatus({
        runId: queueRun._id,
        status: hadError ? "error" : "success",
        stage: hadError ? "ERROR" : "DONE",
        errorMessage: hadError ? "One or more items failed." : undefined,
      });
    } catch (e) {
      console.error("Failed to update final queue status:", e);
    }

    setStatusText(
      hadError
        ? `Queue finished with errors. ${processed}/${queueJobIds.length} jobs completed.`
        : `Queue complete. ${processed} job(s) processed successfully.`
    );
    setAnalyzing(false);
  }, [queueRun, queueJobIds, queueItems, activeResume, convexUser, updateRunStatus, updateQueueMasterResume, completedJobRuns, currentProcessingIndex]);

  // Auto-resume queue processing after page refresh if queue was running
  useEffect(() => {
    
    // Only auto-resume once per page load
    if (hasAutoResumedRef.current) return;
    
    // Don't auto-resume if queue data isn't fully loaded yet
    // (queueItems should have same number of items as queueJobIds)
    if (queueJobIds.length > 0 && queueItems.length !== queueJobIds.length) {
      return;
    }
    
    // Check if we have an active queue that was running
    if (
      queueRun &&
      queueRun.status === "running" &&
      queueJobIds.length > 0 &&
      activeResume &&
      convexUser &&
      !analyzing &&
      currentProcessingIndex === null
    ) {
      const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
      
      // FIRST: Check if ANY job is currently running (not stale)
      // If so, DON'T auto-resume - let that job finish first
      const hasActivelyRunningJob = queueItems.some((item: any) => {
        const runStatus = item?.run?.status;
        if (runStatus !== "running") return false;
        const runStartedAt = item?.run?.startedAt || item?.run?.createdAt || 0;
        const runAgeMs = Date.now() - runStartedAt;
        return runAgeMs <= STALE_RUN_THRESHOLD_MS; // Not stale = actively running
      });
      
      if (hasActivelyRunningJob) {
        hasAutoResumedRef.current = true; // Mark as resumed to prevent future triggers
        return;
      }
      
      // Find the first job that needs processing (not completed, not failed, not currently running)
      const firstPendingIndex = queueJobIds.findIndex((jobId: any) => {
        const jobIdStr = jobId.toString();
        const queueItem = queueItems.find((item: any) => item?.job?._id?.toString() === jobIdStr);
        const runStatus = queueItem?.run?.status;
        const runStartedAt = queueItem?.run?.startedAt || queueItem?.run?.createdAt || 0;
        const runAgeMs = Date.now() - runStartedAt;
        const isStaleRun = runStatus === "running" && runAgeMs > STALE_RUN_THRESHOLD_MS;
        
        
        // Job needs processing if: no run, or failed, or stale run
        // Job should be skipped if: success, or currently running (not stale)
        if (runStatus === "success" || runStatus === "error") return false;
        if (runStatus === "running" && !isStaleRun) return false;
        return true; // No run, or stale run - needs processing
      });


      if (firstPendingIndex >= 0) {
        hasAutoResumedRef.current = true;
        setStatusText(`Resuming queue from job ${firstPendingIndex + 1}...`);
        // Use setTimeout to allow state to settle before starting
        setTimeout(() => {
          handleStartQueue();
        }, 500);
      }
    }
  }, [queueRun, queueJobIds, queueItems, activeResume, convexUser, analyzing, currentProcessingIndex, handleStartQueue]);

  const queueSize = queueJobIds.length;
  const selectedCount = selectedTabIds.length;
  const queueItemsByJobId = useMemo(() => {
    const map = new Map<string, any>();
    queueItems.forEach((item: any) => {
      if (item?.job?._id) {
        map.set(item.job._id.toString(), item);
      }
    });
    return map;
  }, [queueItems]);
  const orderedQueueItems = useMemo(() => {
    return queueOrder.map((id, index) => {
      return (
        queueItemsByJobId.get(id) || {
          job: { _id: id, title: "Unknown job", company: "", jobUrl: "" },
          run: null,
          position: index + 1,
        }
      );
    });
  }, [queueOrder, queueItemsByJobId]);

  const getQueueItemState = (item: any, index: number) => {
    const jobId = item?.job?._id?.toString();
    
    // Check if this is the currently processing item (real-time update)
    if (currentProcessingIndex === index) {
      return "running";
    }
    
    // Check server data first (persists across page refresh)
    const run = item?.run;
    if (run?.status === "running") return "running";
    if (run?.status === "success") return "done";
    if (run?.status === "error") return "failed";
    
    // Fall back to local tracking state (for real-time updates before Convex refreshes)
    if (jobId && completedJobRuns.has(jobId)) {
      const completedRun = completedJobRuns.get(jobId);
      return completedRun?.status === "success" ? "done" : "failed";
    }
    
    return "queued";
  };

  const firstFailedIndex = useMemo(() => {
    return orderedQueueItems.findIndex((item: any) => item?.run?.status === "error");
  }, [orderedQueueItems]);

  const hasFailedItems = firstFailedIndex >= 0;

  const handleRetryFailed = useCallback(async () => {
    if (!queueRun) return;
    const cursorIndex = hasFailedItems ? firstFailedIndex : 0;
    try {
      await resetQueueRun({
        queueRunId: queueRun._id,
        cursorIndex,
      });
      setStatusText(
        hasFailedItems
          ? "Queue reset to retry failed items."
          : "Queue reset to the beginning."
      );
    } catch (error: any) {
      setStatusText(error.message || "Failed to reset queue.");
    }
  }, [queueRun, hasFailedItems, firstFailedIndex, resetQueueRun]);

  const handleForceUnlock = useCallback(async () => {
    if (!queueRun) return;
    try {
      await updateRunStatus({
        runId: queueRun._id,
        status: "error",
        stage: "ERROR",
        errorMessage: "Queue was force-unlocked by user.",
      });
      setStatusText("Queue unlocked. You can retry now.");
    } catch (error: any) {
      setStatusText(error.message || "Failed to unlock queue.");
    }
  }, [queueRun, updateRunStatus]);

  // Clear completed jobs from the queue
  const handleClearCompleted = useCallback(async () => {
    if (!queueRun) return;
    
    // Find jobs that are not yet completed
    const pendingJobIds = queueJobIds.filter((jobId: any) => {
      const jobIdStr = jobId.toString();
      const item = queueItems.find((item: any) => item?.job?._id?.toString() === jobIdStr);
      const state = item?.run?.status;
      // Keep jobs that don't have a successful run
      return state !== "success";
    });

    try {
      if (pendingJobIds.length === 0) {
        // All jobs are done - mark queue as complete and it will be replaced by a new one
        await updateRunStatus({
          runId: queueRun._id,
          status: "success",
          stage: "DONE",
        });
        // Clear local tracking
        setCompletedJobRuns(new Map());
        setStatusText("Queue cleared. All jobs completed.");
      } else {
        // Update queue with only pending jobs
        await updateQueueOrder({
          queueRunId: queueRun._id,
          queueJobIds: pendingJobIds,
          allowWhileRunning: true,
        });
        // Clear local tracking for removed jobs
        const pendingSet = new Set(pendingJobIds.map((id: any) => id.toString()));
        setCompletedJobRuns(prev => {
          const next = new Map(prev);
          for (const key of next.keys()) {
            if (!pendingSet.has(key)) {
              next.delete(key);
            }
          }
          return next;
        });
        setStatusText(`Cleared ${queueJobIds.length - pendingJobIds.length} completed job(s).`);
      }
    } catch (error: any) {
      setStatusText(error.message || "Failed to clear completed jobs.");
    }
  }, [queueRun, queueJobIds, queueItems, updateRunStatus, updateQueueOrder]);

  // Show onboarding if user not set up
  if (!convexUser) {
    return <UserOnboarding />;
  }

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
            <p className="hint">Pick tabs, build a queue, and run sequentially</p>
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

        <div className="start-run-pick-queue">
          <div className="start-run-pane">
            <div className="pane-head">
              <div>
                <h4>Available tabs</h4>
                <p className="hint">Search, filter, select → add to queue</p>
              </div>
              <div className="pane-actions">
                <span className="badge subtle">{filteredTabs.length} shown</span>
              </div>
            </div>

            <div className="pane-controls">
              <input
                className="search-input"
                type="text"
                placeholder="Search by role, company, or URL"
                value={tabSearch}
                onChange={(e) => setTabSearch(e.target.value)}
              />
              <div className="chip-row">
                {(["all", "new", "analyzed", "queued"] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`chip ${tabFilter === filter ? "active" : ""}`}
                    type="button"
                    onClick={() => setTabFilter(filter)}
                  >
                    {filter === "all"
                      ? "All"
                      : filter === "new"
                        ? "New"
                        : filter === "analyzed"
                          ? "Analyzed"
                          : "Queued"}
                  </button>
                ))}
              </div>
              <div className="pane-actions-inline">
                <label className="select-all-label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => allSelected ? handleDeselectAll() : handleSelectAll()}
                    disabled={selectableTabIds.length === 0}
                  />
                  <span className="hint">{allSelected ? "Deselect all" : "Select all"}</span>
                </label>
                <button
                  className="primary small"
                  type="button"
                  onClick={handleAddToQueue}
                  disabled={selectedCount === 0}
                  title={
                    selectedCount === 0
                      ? "Select at least one tab."
                      : "Add selected tabs to queue."
                  }
                >
                  Add {selectedCount > 0 ? `(${selectedCount})` : ""} to queue
                </button>
                {syncingJobs ? <span className="hint">Syncing jobs…</span> : null}
              </div>
            </div>

            <div className="tab-table">
              <div className="tab-table-head">
                <span>Job</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {filteredTabs.length === 0 ? (
                <div className="empty-state small">No tabs match this filter.</div>
              ) : (
                filteredTabs.map(({ tab, job, analyzedRun, inQueue }) => {
                  // Get queue item state to check if job is done/running in queue
                  const queueItem = job ? queueItemsByJobId.get(job._id.toString()) : null;
                  const queueItemRun = queueItem?.run;
                  const isQueueDone = queueItemRun?.status === "success";
                  const isQueueFailed = queueItemRun?.status === "error";
                  
                  // Detect stale runs (running for > 10 minutes = likely failed)
                  const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
                  const runStartedAt = queueItemRun?.startedAt || queueItemRun?.createdAt || 0;
                  const runAgeMs = Date.now() - runStartedAt;
                  const isStaleRun = queueItemRun?.status === "running" && runAgeMs > STALE_RUN_THRESHOLD_MS;
                  const isQueueRunning = queueItemRun?.status === "running" && !isStaleRun;
                  
                  // Also check local completedJobRuns for real-time updates
                  const localCompletion = job ? completedJobRuns.get(job._id.toString()) : null;
                  const isLocalDone = localCompletion?.status === "success";
                  const isLocalFailed = localCompletion?.status === "error";
                  
                  // Determine the effective status
                  const isDone = isQueueDone || isLocalDone || analyzedRun;
                  const isRunning = isQueueRunning || (inQueue && currentProcessingIndex !== null && queueItem);
                  const isFailed = isQueueFailed || isLocalFailed || isStaleRun;
                  
                  // Get the run to link to (prefer queue run, then analyzedRun)
                  const runToView = queueItemRun || analyzedRun;
                  
                  return (
                  <div key={tab.id} className="tab-row structured">
                    <label className="tab-cell">
                      <input
                        type="checkbox"
                        checked={selectedTabIds.includes(tab.id.toString())}
                        onChange={() => handleToggleTab(tab.id.toString())}
                        disabled={inQueue}
                      />
                      <span className="tab-title">
                        {tab.active ? "• " : ""}
                        {tab.title || tab.url || "Untitled"}{" "}
                        {safeHostname(tab.url) ? `(${safeHostname(tab.url)})` : ""}
                      </span>
                    </label>
                    <div className="tab-cell status">
                      {!job ? (
                        <span className="badge warn">Not synced</span>
                      ) : isDone ? (
                        <span className="badge subtle">Analyzed</span>
                      ) : isFailed ? (
                        <span className="badge warn">Failed</span>
                      ) : isRunning ? (
                        <span className="badge subtle">Running</span>
                      ) : inQueue ? (
                        <span className="badge subtle">Queued</span>
                      ) : (
                        <span className="badge subtle">New</span>
                      )}
                    </div>
                    <div className="tab-cell actions">
                      {runToView ? (
                        <Link
                          href={`/run/${runToView.runId}`}
                          className="link-button small"
                        >
                          View
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
                })
              )}
            </div>
          </div>

          <div className="start-run-pane queue">
            <div className="pane-head">
              <div>
                <h4>Queue</h4>
                <p className="hint">Drag to reorder · sequential</p>
              </div>
              <div className="pane-actions">
                <span className="badge subtle">{queueSize} items</span>
              </div>
            </div>

            <div className="pane-controls">
              <button
                className="primary"
                onClick={handleStartQueue}
                disabled={
                  isQueueProcessing ||
                  backendStatus !== "online" ||
                  !activeResume ||
                  queueSize === 0
                }
              >
                {isQueueProcessing ? "Running…" : `Analyze (${queueSize}) • sequential`}
              </button>
              <div className="pane-actions-inline">
                <button
                  className="ghost small"
                  type="button"
                  onClick={handleRetryFailed}
                  disabled={isQueueProcessing || (!hasFailedItems && queueRun?.status !== "error")}
                  title={
                    isQueueProcessing
                      ? "Queue is running."
                      : hasFailedItems || queueRun?.status === "error"
                        ? "Retry failed items."
                        : "No failed items to retry."
                  }
                >
                  Retry failed
                </button>
                <button
                  className="ghost small"
                  type="button"
                  onClick={handleClearCompleted}
                  disabled={isQueueProcessing || !orderedQueueItems.some((item: any) => {
                    const state = getQueueItemState(item, orderedQueueItems.indexOf(item));
                    return state === "done";
                  })}
                  title="Remove completed jobs from queue"
                >
                  Clear completed
                </button>
              </div>
              {isQueueProcessing ? (
                <div className="pane-actions-inline">
                  <span className="hint warn">Processing job {(currentProcessingIndex ?? 0) + 1} of {queueSize}...</span>
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() => {
                      setCurrentProcessingIndex(null);
                      setAnalyzing(false);
                      setStatusText("Queue cancelled by user.");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>

            <div className="queue-list">
              {queueSize === 0 ? (
                <div className="empty-state small">Add tabs to build your queue.</div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={queueOrder} strategy={verticalListSortingStrategy}>
                    {orderedQueueItems.map((item: any, index: number) => {
                      const jobId = item?.job?._id?.toString() || queueOrder[index];
                      const state = getQueueItemState(item, index);
                      const jobUrl = item?.job?.jobUrl;
                      const tabTitle = jobUrl ? tabTitleByUrl.get(jobUrl) : "";
                      const displayTitle = getSafeTitle(tabTitle, item?.job?.title, "Untitled role");
                      // Only lock items that are currently running or already completed
                      const isItemLocked = state === "running" || state === "done" || state === "failed";
                      return (
                        <SortableQueueItem key={jobId} id={jobId} disabled={isItemLocked}>
                          <div className={`queue-item ${state}`}>
                            <div className="queue-handle">⋮⋮</div>
                            <div className="queue-main">
                              <div className="queue-title">
                                {index + 1}. {displayTitle}
                              </div>
                              <div className="hint">
                                {item?.job?.company || "Unknown company"} ·{" "}
                                {safeHostname(item?.job?.jobUrl) || "Unknown source"}
                              </div>
                            </div>
                            <div className="queue-meta">
                              <span className={`badge subtle state-${state}`}>
                                {state === "queued"
                                  ? "Queued"
                                  : state === "running"
                                    ? "Running"
                                    : state === "done"
                                      ? "Done"
                                      : "Failed"}
                              </span>
                              {/* Show View link for completed runs - check both local tracking and server data */}
                              {(completedJobRuns.get(jobId)?.runId || item?.run?.runId) ? (
                                <Link
                                  href={`/run/${completedJobRuns.get(jobId)?.runId || item.run.runId}`}
                                  className="link-button small"
                                >
                                  View
                                </Link>
                              ) : null}
                              {/* Only show Remove for queued items that haven't started */}
                              {state === "queued" ? (
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() => handleRemoveFromQueue(jobId)}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </SortableQueueItem>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {statusText && (
          <div className="status-text">
            {statusText}
          </div>
        )}

        {/* Active runs - show ONLY runs from current queue that are actively running */}
        {(() => {
          // Get job IDs from current queue
          const currentQueueJobIds = new Set(queueItems.map((item: any) => item?.job?._id?.toString()).filter(Boolean));
          
          // Only show runs that are part of the current queue AND are running
          const activeRuns = runs.filter((r: any) => {
            // Must be running status
            if (r.status !== "running" || r.runType === "queue") return false;
            // Must be part of the current queue
            const runJobId = r.jobId?.toString();
            return runJobId && currentQueueJobIds.has(runJobId);
          });
          
          
          // Enrich runs with job info from queue items AND tabs (for correct titles)
          const enrichedRuns = activeRuns.map((run: any) => {
            // Get job info from queue items (guaranteed to exist since we filtered by currentQueueJobIds)
            const queueItem = queueItems.find((item: any) => 
              item?.job?._id?.toString() === run.jobId?.toString()
            );
            
            // Use tab title as primary source (more accurate than database)
            const jobUrl = queueItem?.job?.jobUrl;
            const tabTitle = jobUrl ? tabTitleByUrl.get(jobUrl) : "";
            
            
            if (queueItem?.job) {
              return {
                ...run,
                // Use getSafeTitle to filter out corrupted titles like "0 notifications total"
                title: getSafeTitle(tabTitle, queueItem.job.title, run.title),
                company: queueItem.job.company || run.company,
              };
            }
            return run;
          });
          
          return enrichedRuns.length > 0 ? (
          <div className="active-runs">
            <h4>Active runs</h4>
            {enrichedRuns.map((run: any) => (
              <div key={run._id} className="queue-card">
                <div className="queue-card-head">
                  <div>
                    <div className="queue-title">{run.title || "Processing..."}</div>
                    <div className="hint">
                      {run.company || "Unknown company"} · {run.stage || "Running"}
                    </div>
                  </div>
                  <div className="pane-actions">
                    <span className="status-pill tiny running">RUNNING</span>
                  </div>
                </div>
                <div className="queue-body">
                  <div className="tab-row structured">
                    <div className="tab-cell">
                      <span className="hint">Run ID: {run.runId}</span>
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
                </div>
              </div>
            ))}
          </div>
        ) : null;
        })()}
      </div>
    </div>
  );
}
