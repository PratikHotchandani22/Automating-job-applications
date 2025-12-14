import { create } from "zustand";
import {
  downloadArtifact,
  fetchBackendHealth,
  fetchExtensionState,
  fetchRunStatusFromBackend,
  normalizeRun,
  openStartRunSurface,
  retryRunFromCapture
} from "../api/bridge";
import { sampleRuns } from "../sampleData";
import type { BackendStatus, RunRecord } from "../types";

type DetailTab = "summary" | "explain" | "downloads" | "debug";

interface DashboardState {
  runs: RunRecord[];
  backendStatus: BackendStatus;
  loading: boolean;
  error: string | null;
  selectedRunId: string | null;
  detailTab: DetailTab;
  lastUpdated: string | null;
  loadInitial: () => Promise<void>;
  refreshRuns: () => Promise<void>;
  refreshRunStatus: (runId: string) => Promise<void>;
  selectRun: (runId: string | null) => void;
  setDetailTab: (tab: DetailTab) => void;
  download: (runId: string, artifactKey: string) => Promise<void>;
  retryRun: (runId: string) => Promise<string | null>;
  startNewRun: () => Promise<void>;
}

const sortRuns = (runs: RunRecord[]) => {
  return [...runs].sort((a, b) => {
    const aTs = Date.parse(a.updatedAt || a.startedAt || a.createdAt || "0");
    const bTs = Date.parse(b.updatedAt || b.startedAt || b.createdAt || "0");
    return bTs - aTs;
  });
};

const mergeRuns = (existing: RunRecord[], updates: Partial<RunRecord>[]): RunRecord[] => {
  const map = new Map<string, RunRecord>();
  existing.forEach((run) => map.set(run.runId, run));
  updates.forEach((update) => {
    const id = update.runId;
    if (!id) return;
    const current = map.get(id) || normalizeRun(update);
    map.set(id, { ...current, ...update });
  });
  return sortRuns(Array.from(map.values()));
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  runs: sampleRuns,
  backendStatus: "checking",
  loading: false,
  error: null,
  selectedRunId: null,
  detailTab: "summary",
  lastUpdated: null,

  loadInitial: async () => {
    set({ loading: true, error: null });
    try {
      const [state, health] = await Promise.all([fetchExtensionState(), fetchBackendHealth()]);
      set({
        runs: sortRuns(state.runs),
        backendStatus: health,
        loading: false,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      set({
        runs: sampleRuns,
        loading: false,
        error: error?.message || "Unable to load dashboard",
        lastUpdated: new Date().toISOString()
      });
    }
  },

  refreshRuns: async () => {
    try {
      const [state, health] = await Promise.all([fetchExtensionState(), fetchBackendHealth()]);
      set({
        runs: sortRuns(state.runs),
        backendStatus: health,
        lastUpdated: new Date().toISOString(),
        error: null
      });
    } catch (error: any) {
      set({ error: error?.message || "Unable to refresh runs" });
    }
  },

  refreshRunStatus: async (runId: string) => {
    const patch = await fetchRunStatusFromBackend(runId);
    if (patch) {
      set((state) => ({ runs: mergeRuns(state.runs, [patch]) }));
      return;
    }
    // fallback to full refresh if backend status fails
    await get().refreshRuns();
  },

  selectRun: (runId: string | null) => {
    set((state) => {
      const nextSelectedRunId = runId;
      const nextDetailTab: DetailTab = "summary";
      if (state.selectedRunId === nextSelectedRunId && state.detailTab === nextDetailTab) return state;
      return { selectedRunId: nextSelectedRunId, detailTab: nextDetailTab };
    });
  },

  setDetailTab: (tab: DetailTab) => set({ detailTab: tab }),

  download: async (runId: string, artifactKey: string) => {
    await downloadArtifact(runId, artifactKey);
  },

  retryRun: async (runId: string) => {
    const run = get().runs.find((r) => r.runId === runId);
    if (!run) {
      throw new Error("Run not found");
    }
    set({ loading: true, error: null });
    try {
      const newRunId = await retryRunFromCapture(run);
      await get().refreshRuns();
      if (newRunId) {
        set({ selectedRunId: newRunId, detailTab: "summary" });
      }
      return newRunId;
    } catch (error: any) {
      set({ error: error?.message || "Retry failed" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  startNewRun: async () => {
    await openStartRunSurface();
  }
}));
