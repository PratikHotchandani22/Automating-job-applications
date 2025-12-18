import { create } from "zustand";
import {
  backfillRunInsights as backfillRunInsightsBridge,
  syncBackendRuns as syncBackendRunsBridge,
  deleteRun as deleteRunBridge,
  downloadArtifact,
  fetchBackendHealth,
  fetchExtensionState,
  fetchRunStatusFromBackend,
  normalizeRun,
  openStartRunSurface,
  retryRunFromCapture,
  setRunUserFields as setRunUserFieldsBridge
} from "../api/bridge";
import { sampleRuns } from "../sampleData";
import type { BackendStatus, ChatMessage, RunChatSession, RunRecord } from "../types";

interface DashboardState {
  runs: RunRecord[];
  backendStatus: BackendStatus;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  backfilling: boolean;
  chatSessionsByRunId: Record<string, RunChatSession[]>;
  activeChatSessionByRunId: Record<string, string | undefined>;
  hydrateChatSessions: () => Promise<void>;
  clearAllChatSessions: () => Promise<void>;
  loadInitial: () => Promise<void>;
  refreshRuns: () => Promise<void>;
  refreshRunStatus: (runId: string) => Promise<void>;
  backfillInsights: () => Promise<void>;
  setResponseReceived: (runId: string, received: boolean) => Promise<void>;
  deleteRun: (runId: string) => Promise<void>;
  download: (runId: string, artifactKey: string) => Promise<void>;
  retryRun: (runId: string) => Promise<string | null>;
  startNewRun: () => Promise<void>;
  ensureActiveChatSession: (run: RunRecord) => string;
  createChatSession: (run: RunRecord, seedFromSessionId?: string | null) => string;
  selectChatSession: (runId: string, sessionId: string) => void;
  appendChatMessage: (runId: string, sessionId: string, message: ChatMessage) => void;
  setChatFocusOnce: (runId: string, sessionId: string, focus: any | null) => void;
  setChatPendingAction: (runId: string, sessionId: string, pendingAction: any | null) => void;
}

const makeSessionId = () => `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const buildStarterMessage = (run: RunRecord): ChatMessage => {
  const title = run.title || "this role";
  const company = run.company ? ` at ${run.company}` : "";
  return {
    role: "assistant",
    content: `Ask me anything about the changes made for ${title}${company}.\n\nExamples:\n- Why did you choose this bullet?\n- Which job requirements were not covered?\n- Rewrite this LaTeX snippet to be cleaner and keep it truthful.`
  };
};

const touchSession = (session: RunChatSession): RunChatSession => ({
  ...session,
  lastActiveAt: new Date().toISOString()
});

const CHAT_STORAGE_KEY = "resumeintel.chatSessions.v1";
const CHAT_STORAGE_MAX_SESSIONS_PER_RUN = 8;
const CHAT_STORAGE_MAX_MESSAGES_PER_SESSION = 80;
const CHAT_STORAGE_MAX_TOTAL_CHARS = 800_000; // ~0.8MB of text, comfortably below chrome.storage.local quota

const hasChromeStorage = () =>
  typeof chrome !== "undefined" &&
  Boolean((chrome as any)?.storage?.local?.get) &&
  Boolean((chrome as any)?.storage?.local?.set);

const safeJsonParse = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const sanitizeForStorage = (
  chatSessionsByRunId: Record<string, RunChatSession[]>,
  activeChatSessionByRunId: Record<string, string | undefined>
) => {
  // Strip any potentially large/ephemeral fields (focusOnce/pendingAction), and prune aggressively.
  const sanitized: Record<string, RunChatSession[]> = {};
  const runIds = Object.keys(chatSessionsByRunId || {});
  for (const runId of runIds) {
    const sessions = chatSessionsByRunId[runId] || [];
    const sorted = [...sessions].sort(
      (a, b) => Date.parse(b.lastActiveAt || b.createdAt || "0") - Date.parse(a.lastActiveAt || a.createdAt || "0")
    );
    sanitized[runId] = sorted.slice(0, CHAT_STORAGE_MAX_SESSIONS_PER_RUN).map((s) => ({
      sessionId: s.sessionId,
      runId: s.runId,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      messages: (s.messages || []).slice(-CHAT_STORAGE_MAX_MESSAGES_PER_SESSION),
      focusOnce: null,
      pendingAction: null
    }));
  }

  // Enforce a total char budget across all messages (drop oldest sessions until under budget).
  const allSessions: Array<{ runId: string; session: RunChatSession }> = [];
  for (const runId of Object.keys(sanitized)) {
    for (const session of sanitized[runId] || []) {
      allSessions.push({ runId, session });
    }
  }
  allSessions.sort(
    (a, b) => Date.parse(b.session.lastActiveAt || b.session.createdAt || "0") - Date.parse(a.session.lastActiveAt || a.session.createdAt || "0")
  );

  const charCount = (s: RunChatSession) => (s.messages || []).reduce((sum, m) => sum + (m.content || "").length, 0);
  let total = allSessions.reduce((sum, x) => sum + charCount(x.session), 0);
  if (total > CHAT_STORAGE_MAX_TOTAL_CHARS) {
    // Drop oldest sessions first.
    for (let i = allSessions.length - 1; i >= 0 && total > CHAT_STORAGE_MAX_TOTAL_CHARS; i--) {
      const drop = allSessions[i];
      const dropChars = charCount(drop.session);
      sanitized[drop.runId] = (sanitized[drop.runId] || []).filter((s) => s.sessionId !== drop.session.sessionId);
      total -= dropChars;
    }
  }

  // Clean active session pointers that no longer exist.
  const nextActive: Record<string, string | undefined> = { ...(activeChatSessionByRunId || {}) };
  for (const runId of Object.keys(nextActive)) {
    const active = nextActive[runId];
    if (!active) continue;
    const exists = (sanitized[runId] || []).some((s) => s.sessionId === active);
    if (!exists) nextActive[runId] = sanitized[runId]?.[0]?.sessionId;
  }

  return { chatSessionsByRunId: sanitized, activeChatSessionByRunId: nextActive };
};

const persistChatSessions = async (
  chatSessionsByRunId: Record<string, RunChatSession[]>,
  activeChatSessionByRunId: Record<string, string | undefined>
) => {
  const payload = sanitizeForStorage(chatSessionsByRunId, activeChatSessionByRunId);
  if (hasChromeStorage()) {
    await new Promise<void>((resolve) => {
      try {
        (chrome as any).storage.local.set({ [CHAT_STORAGE_KEY]: payload }, () => resolve());
      } catch {
        resolve();
      }
    });
    return;
  }
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }
};

const loadPersistedChatSessions = async (): Promise<{
  chatSessionsByRunId: Record<string, RunChatSession[]>;
  activeChatSessionByRunId: Record<string, string | undefined>;
} | null> => {
  try {
    if (hasChromeStorage()) {
      const result = await new Promise<any>((resolve) => {
        try {
          (chrome as any).storage.local.get([CHAT_STORAGE_KEY], (items: any) => resolve(items));
        } catch {
          resolve(null);
        }
      });
      const value = result?.[CHAT_STORAGE_KEY] || null;
      if (!value) return null;
      return value;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return null;
      return safeJsonParse(raw);
    }
    return null;
  } catch {
    return null;
  }
};

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

let autoBackfillTriggered = false;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  runs: sampleRuns,
  backendStatus: "checking",
  loading: false,
  error: null,
  lastUpdated: null,
  backfilling: false,
  chatSessionsByRunId: {},
  activeChatSessionByRunId: {},

  loadInitial: async () => {
    set({ loading: true, error: null });
    try {
      // Hydrate persisted chat sessions early (best-effort).
      await get().hydrateChatSessions().catch(() => undefined);
      const [state, health] = await Promise.all([fetchExtensionState(), fetchBackendHealth()]);
      const nextRuns = sortRuns(state.runs);
      set({
        runs: nextRuns,
        backendStatus: health,
        loading: false,
        lastUpdated: new Date().toISOString()
      });

      // Auto-backfill once per session if we have historical runs missing match strength.
      if (!autoBackfillTriggered && health === "online") {
        const missing = nextRuns.some((r) => r.result === "success" && (r.coverage === null || r.coverage === undefined));
        if (missing) {
          autoBackfillTriggered = true;
          get()
            .backfillInsights()
            .catch(() => undefined);
        }
      }
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
    // IMPORTANT: Do NOT fallback to refreshRuns here.
    // When runs are sample/demo (or runId is invalid), this creates a refresh storm
    // that can freeze the UI and flip backend status rapidly.
    return;
  },

  backfillInsights: async () => {
    if (get().backfilling) return;
    set({ backfilling: true, error: null });
    try {
      // First: import backend run history (covers runs created outside extension storage).
      await syncBackendRunsBridge(2000).catch(() => undefined);
      // Then: compute missing insights for existing stored runs.
      await backfillRunInsightsBridge(2000);
      await get().refreshRuns();
    } catch (error: any) {
      set({ error: error?.message || "Backfill failed" });
    } finally {
      set({ backfilling: false });
    }
  },

  setResponseReceived: async (runId: string, received: boolean) => {
    const ts = received ? new Date().toISOString() : null;
    await setRunUserFieldsBridge(runId, { responseReceivedAt: ts });
    set((state) => ({
      runs: state.runs.map((r) => (r.runId === runId ? { ...r, responseReceivedAt: ts } : r))
    }));
  },

  deleteRun: async (runId: string) => {
    await deleteRunBridge(runId);
    set((state) => ({ runs: state.runs.filter((r) => r.runId !== runId && r.clientRunId !== runId) }));
  },

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
  },

  hydrateChatSessions: async () => {
    const persisted = await loadPersistedChatSessions();
    if (!persisted) return;
    const sessions = persisted.chatSessionsByRunId || {};
    const active = persisted.activeChatSessionByRunId || {};
    set({
      chatSessionsByRunId: sessions,
      activeChatSessionByRunId: active
    });
  },

  clearAllChatSessions: async () => {
    set({ chatSessionsByRunId: {}, activeChatSessionByRunId: {} });
    if (hasChromeStorage()) {
      await new Promise<void>((resolve) => {
        try {
          (chrome as any).storage.local.remove([CHAT_STORAGE_KEY], () => resolve());
        } catch {
          resolve();
        }
      });
      return;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  },

  ensureActiveChatSession: (run: RunRecord) => {
    const runId = run.runId;
    const existingActive = get().activeChatSessionByRunId[runId];
    const existingSessions = get().chatSessionsByRunId[runId] || [];
    if (existingActive && existingSessions.some((s) => s.sessionId === existingActive)) {
      return existingActive;
    }
    const sessionId = makeSessionId();
    const now = new Date().toISOString();
    const nextSession: RunChatSession = {
      sessionId,
      runId,
      createdAt: now,
      lastActiveAt: now,
      messages: [buildStarterMessage(run)],
      focusOnce: null,
      pendingAction: null
    };
    set((state) => ({
      chatSessionsByRunId: { ...state.chatSessionsByRunId, [runId]: [nextSession, ...(state.chatSessionsByRunId[runId] || [])] },
      activeChatSessionByRunId: { ...state.activeChatSessionByRunId, [runId]: sessionId }
    }));
    persistChatSessions(get().chatSessionsByRunId, get().activeChatSessionByRunId).catch(() => undefined);
    return sessionId;
  },

  createChatSession: (run: RunRecord, seedFromSessionId?: string | null) => {
    const runId = run.runId;
    const sessionId = makeSessionId();
    const now = new Date().toISOString();
    const existing = get().chatSessionsByRunId[runId] || [];
    const seed = seedFromSessionId ? existing.find((s) => s.sessionId === seedFromSessionId) : null;
    const messages = seed?.messages?.length ? seed.messages : [buildStarterMessage(run)];
    const nextSession: RunChatSession = {
      sessionId,
      runId,
      createdAt: now,
      lastActiveAt: now,
      messages,
      focusOnce: null,
      pendingAction: null
    };
    set((state) => ({
      chatSessionsByRunId: { ...state.chatSessionsByRunId, [runId]: [nextSession, ...(state.chatSessionsByRunId[runId] || [])] },
      activeChatSessionByRunId: { ...state.activeChatSessionByRunId, [runId]: sessionId }
    }));
    persistChatSessions(get().chatSessionsByRunId, get().activeChatSessionByRunId).catch(() => undefined);
    return sessionId;
  },

  selectChatSession: (runId: string, sessionId: string) => {
    set((state) => ({
      activeChatSessionByRunId: { ...state.activeChatSessionByRunId, [runId]: sessionId }
    }));
    persistChatSessions(get().chatSessionsByRunId, get().activeChatSessionByRunId).catch(() => undefined);
  },

  appendChatMessage: (runId: string, sessionId: string, message: ChatMessage) => {
    set((state) => {
      const list = state.chatSessionsByRunId[runId] || [];
      const nextList = list.map((s) => {
        if (s.sessionId !== sessionId) return s;
        return touchSession({ ...s, messages: [...(s.messages || []), message] });
      });
      return { chatSessionsByRunId: { ...state.chatSessionsByRunId, [runId]: nextList } };
    });
    persistChatSessions(get().chatSessionsByRunId, get().activeChatSessionByRunId).catch(() => undefined);
  },

  setChatFocusOnce: (runId: string, sessionId: string, focus: any | null) => {
    set((state) => {
      const list = state.chatSessionsByRunId[runId] || [];
      const nextList = list.map((s) => (s.sessionId === sessionId ? touchSession({ ...s, focusOnce: focus }) : s));
      return { chatSessionsByRunId: { ...state.chatSessionsByRunId, [runId]: nextList } };
    });
    // Persist sessions without focus (sanitizeForStorage drops it).
    persistChatSessions(get().chatSessionsByRunId, get().activeChatSessionByRunId).catch(() => undefined);
  },

  setChatPendingAction: (runId: string, sessionId: string, pendingAction: any | null) => {
    set((state) => {
      const list = state.chatSessionsByRunId[runId] || [];
      const nextList = list.map((s) =>
        s.sessionId === sessionId ? touchSession({ ...s, pendingAction }) : s
      );
      return { chatSessionsByRunId: { ...state.chatSessionsByRunId, [runId]: nextList } };
    });
    // Persist sessions without pending actions (sanitizeForStorage drops it).
    persistChatSessions(get().chatSessionsByRunId, get().activeChatSessionByRunId).catch(() => undefined);
  }
}));
