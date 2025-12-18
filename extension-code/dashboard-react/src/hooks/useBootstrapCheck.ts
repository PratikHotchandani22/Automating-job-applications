import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUserBootstrap } from "../api/bridge";
import { useAuth } from "../contexts/AuthContext";

type BootstrapData = any | null;
type BootstrapState = { bootstrap: BootstrapData; error: string | null; loading: boolean };

// Shared cache so multiple consumers stay in sync.
let cachedBootstrap: BootstrapData = null;
let cachedError: string | null = null;
let cachedLoading = false;
const listeners = new Set<(state: BootstrapState) => void>();

const emit = () => {
  const snapshot: BootstrapState = {
    bootstrap: cachedBootstrap,
    error: cachedError,
    loading: cachedLoading
  };
  listeners.forEach((fn) => fn(snapshot));
};

const setGlobalState = (next: Partial<BootstrapState>) => {
  if ("bootstrap" in next) cachedBootstrap = next.bootstrap ?? null;
  if ("error" in next) cachedError = next.error ?? null;
  if ("loading" in next) cachedLoading = Boolean(next.loading);
  emit();
};

export function useBootstrapCheck() {
  const { isAuthenticated, isConfigured } = useAuth();
  const [bootstrap, setBootstrap] = useState<BootstrapData>(() => cachedBootstrap);
  const [loading, setLoading] = useState<boolean>(() => cachedLoading);
  const [error, setError] = useState<string | null>(() => cachedError);
  const mountedRef = useRef(true);

  // Subscribe to global state updates
  useEffect(() => {
    const listener = (state: BootstrapState) => {
      if (!mountedRef.current) return;
      setBootstrap(state.bootstrap);
      setError(state.error);
      setLoading(state.loading);
    };
    listeners.add(listener);
    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
    };
  }, []);

  const resetState = useCallback(() => {
    setGlobalState({ bootstrap: null, error: null, loading: false });
  }, []);

  const refresh = useCallback(async () => {
    if (!isConfigured || !isAuthenticated) {
      resetState();
      return null;
    }

    setGlobalState({ loading: true, error: null });
    try {
      console.info("[Bootstrap] Refresh start");
      const data = await fetchUserBootstrap();
      console.info("[Bootstrap] Refresh success", {
        has_master_resume: data?.has_master_resume,
        default_master_resume_id: data?.default_master_resume_id,
        resumes: Array.isArray(data?.master_resumes) ? data.master_resumes.length : "n/a"
      });
      setGlobalState({ bootstrap: data, loading: false, error: null });
      return data;
    } catch (err: any) {
      const message = err?.message || "Failed to load profile";
      console.warn("[Bootstrap] Refresh failed", message);
      setGlobalState({ error: message, loading: false });
      throw err;
    }
  }, [isAuthenticated, isConfigured, resetState]);

  // Always refresh when authenticated/configured changes to avoid stale banner
  useEffect(() => {
    if (!isConfigured || !isAuthenticated) {
      resetState();
      return;
    }
    refresh().catch(() => undefined);
  }, [isAuthenticated, isConfigured, refresh, resetState]);

  const requiresBootstrap = isConfigured && isAuthenticated;
  // Be lenient: accept any signal that a master resume exists to avoid false negatives in the UI.
  const hasMasterResume =
    !requiresBootstrap ||
    Boolean(
      bootstrap?.has_master_resume ||
        bootstrap?.default_master_resume_id ||
        (Array.isArray(bootstrap?.master_resumes) && bootstrap.master_resumes.length > 0)
    );

  return {
    bootstrap,
    hasMasterResume,
    requiresBootstrap,
    loading,
    error,
    refresh
  };
}

export default useBootstrapCheck;
