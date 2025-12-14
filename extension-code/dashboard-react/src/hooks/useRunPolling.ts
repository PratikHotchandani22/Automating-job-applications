import { useEffect, useRef } from "react";
import { useDashboardStore } from "../store/dashboardStore";

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
      if (isRunning(run.status, run.result)) {
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
