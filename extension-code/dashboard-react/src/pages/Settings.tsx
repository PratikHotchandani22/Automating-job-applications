import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchUserBootstrap, upsertMasterResume } from "../api/bridge";
import useBootstrapCheck from "../hooks/useBootstrapCheck";

const SettingsPage = () => {
  const { isAuthenticated, isConfigured, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState("My Resume");
  const [resumeJsonText, setResumeJsonText] = useState("");
  const [saveResult, setSaveResult] = useState<any | null>(null);
  const { refresh: refreshBootstrap } = useBootstrapCheck();

  const hasResume = Boolean(
    bootstrap?.has_master_resume ||
      bootstrap?.default_master_resume_id ||
      (Array.isArray(bootstrap?.master_resumes) && bootstrap.master_resumes.length > 0)
  );
  const resumes = useMemo(() => bootstrap?.master_resumes || [], [bootstrap]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!isConfigured || !isAuthenticated) return;
      setLoading(true);
      setError(null);
    try {
      const data = await fetchUserBootstrap();
      if (mounted) setBootstrap(data);
      // Keep global auth/resume gate in sync.
      await refreshBootstrap().catch(() => undefined);
    } catch (e: any) {
      if (mounted) setError(e?.message || "Failed to load profile");
    } finally {
      if (mounted) setLoading(false);
    }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, isConfigured]);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setSaveResult(null);
    setError(null);
    try {
      const text = await file.text();
      // Validate JSON early
      JSON.parse(text);
      setResumeJsonText(text);
    } catch (e: any) {
      setError(e?.message || "Invalid JSON file");
    }
  };

  const onSave = async () => {
    setSaveResult(null);
    setError(null);
    setLoading(true);
    try {
      const parsed = JSON.parse(resumeJsonText);
      const result = await upsertMasterResume(resumeName, parsed);
      setSaveResult(result);
      const refreshed = await fetchUserBootstrap();
      setBootstrap(refreshed);
      await refreshBootstrap().catch(() => undefined); // keep global auth/resume gate in sync
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Settings</h2>
            <p className="hint">Supabase auth is not configured for this dashboard.</p>
          </div>
        </div>
        <div className="empty-state">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your dashboard env.</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Settings</h2>
            <p className="hint">Sign in to manage your account and master resume.</p>
          </div>
        </div>
        <div className="empty-state">Please sign in first.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Settings</h2>
          <p className="hint">Account: {user?.email}</p>
        </div>
        <div className="actions-inline">
          <button className="ghost small" disabled={loading} onClick={() => setBootstrap(null)}>
            Refresh view
          </button>
        </div>
      </div>

      {error ? <div className="banner warn">{error}</div> : null}

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="panel-head">
          <div>
            <h3>Master resume</h3>
            <p className="hint">
              {hasResume
                ? "Your default master resume is used as the source for tailoring."
                : "No master resume yet — upload a master resume JSON to get started."}
            </p>
          </div>
        </div>

        {resumes?.length ? (
          <div className="table-wrapper">
            <table className="runs-table compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Default</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.is_default ? "Yes" : "—"}</td>
                    <td>{r.updated_at || r.created_at || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <label className="hint">
            Upload JSON file:
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => onPickFile(e.target.files?.[0] || null)}
              disabled={loading}
              style={{ display: "block", marginTop: 6 }}
            />
          </label>

          <label className="hint">
            Resume name:
            <input
              className="input"
              value={resumeName}
              onChange={(e) => setResumeName(e.target.value)}
              disabled={loading}
              style={{ display: "block", width: "100%", marginTop: 6 }}
            />
          </label>

          <label className="hint">
            Or paste JSON:
            <textarea
              value={resumeJsonText}
              onChange={(e) => setResumeJsonText(e.target.value)}
              disabled={loading}
              placeholder='{\n  \"basics\": { ... },\n  \"work\": [ ... ]\n}\n'
              style={{
                display: "block",
                width: "100%",
                minHeight: 180,
                marginTop: 6,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 12
              }}
            />
          </label>

          <button className="primary" disabled={loading || !resumeJsonText.trim()} onClick={onSave}>
            {loading ? "Saving…" : "Save as default master resume"}
          </button>

          {saveResult ? (
            <div className="empty-state" style={{ textAlign: "left" }}>
              Saved. Embeddings: {saveResult?.embeddings?.stored ? "stored" : "skipped"}{" "}
              {saveResult?.embeddings?.error ? `(${saveResult.embeddings.error})` : ""}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
