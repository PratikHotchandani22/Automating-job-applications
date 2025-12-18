import { useEffect, useRef } from "react";
import { useDashboardStore } from "../store/dashboardStore";

const hasChromeRuntime = typeof chrome !== "undefined" && Boolean((chrome as any)?.runtime?.sendMessage);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRunning = (status: string, result: string) => {
  if (result === "error" || status === "ERROR" || status === "DONE") return false;
  return true;
};

export const useRunPolling = () => {
  const runs = useDashboardStore((state) => state.runs);
  const refreshRunStatus = useDashboardStore((state) => state.refreshRunStatus);
  const pollers = useRef<Record<string, number>>({});

  useEffect(() => {
    const activeIds = new Set<string>();
    runs.forEach((run) => {
      const id = run.runId;
      if (!id) return;
      // Only poll when:
      // - we're in extension runtime (chrome messaging), OR
      // - the runId looks like a backend UUID (web/Supabase mode).
      // This prevents polling sampleRuns like "RUN-3013" which can never resolve via /api/status.
      const pollable = hasChromeRuntime || UUID_RE.test(id);
      if (pollable && isRunning(run.status, run.result)) {
        activeIds.add(id);
        if (!pollers.current[id]) {
          pollers.current[id] = window.setInterval(() => refreshRunStatus(id), 2500);
        }
      }
    });

    Object.keys(pollers.current).forEach((id) => {
      if (!activeIds.has(id)) {
        clearInterval(pollers.current[id]);
        delete pollers.current[id];
      }
    });

    return () => {
      Object.values(pollers.current).forEach((intervalId) => clearInterval(intervalId));
      pollers.current = {};
    };
  }, [runs, refreshRunStatus]);
};
