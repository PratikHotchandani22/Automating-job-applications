import { useEffect, useMemo, useRef, useState } from "react";
import type { RunRecord } from "../types";
import { BACKEND_BASE_URL } from "../api/bridge";
import { useDashboardStore } from "../store/dashboardStore";

type CompileResult = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export type LatexChatFocus = {
  type: "latex_selection";
  artifact: "resume.tex";
  selection: { start: number; end: number };
  snippet: string;
  // Used for local editing + saving (do not send to LLM).
  docText?: string;
};

const resolveArtifactUrl = (url: string) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${BACKEND_BASE_URL}${url}`;
  return `${BACKEND_BASE_URL}/${url}`;
};

const RunLatexEditorView = ({
  run,
  onAskChat
}: {
  run: RunRecord;
  onAskChat?: (focus: LatexChatFocus) => void;
}) => {
  const backendStatus = useDashboardStore((s) => s.backendStatus);
  const refreshRunStatus = useDashboardStore((s) => s.refreshRunStatus);
  
  // BUG-010: Track if user has been warned about unsaved changes
  const hasWarnedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [latex, setLatex] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveOkAt, setSaveOkAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [askChatError, setAskChatError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const lastLoadedLatex = useRef<string>("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const texUrl = useMemo(() => {
    const raw = run.artifacts?.tex;
    return raw ? resolveArtifactUrl(raw) : null;
  }, [run.artifacts]);

  const canTalkToBackend = backendStatus === "online";

  const loadGeneratedLatex = async () => {
    setLoadError(null);
    setSaveOkAt(null);
    if (!texUrl) {
      setLatex("");
      lastLoadedLatex.current = "";
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(texUrl);
      if (!res.ok) {
        throw new Error(`Failed to load LaTeX (HTTP ${res.status})`);
      }
      const text = await res.text();
      setLatex(text);
      lastLoadedLatex.current = text;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load LaTeX");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset preview when switching runs.
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setCompileError(null);
    setSaveError(null);
    setSaveOkAt(null);
    loadGeneratedLatex().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId, texUrl]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  useEffect(() => {
    if (!contextMenu) return;
    const onDocClick = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const isDirty = latex !== lastLoadedLatex.current;

  // BUG-010: Warn user before navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Reset warning flag when changes are saved
  useEffect(() => {
    if (!isDirty) {
      hasWarnedRef.current = false;
    }
  }, [isDirty]);

  const handleSave = async () => {
    setSaveError(null);
    setSaveOkAt(null);
    setCompileError(null);
    if (!canTalkToBackend) {
      setSaveError("Backend is offline.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/runs/${encodeURIComponent(run.runId)}/latex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as CompileResult | null;
        throw new Error(data?.message || data?.error || `Save failed (HTTP ${res.status})`);
      }
      lastLoadedLatex.current = latex;
      setSaveOkAt(new Date().toISOString());
      await refreshRunStatus(run.runId).catch(() => undefined);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCompile = async () => {
    setCompileError(null);
    setSaveError(null);
    if (!canTalkToBackend) {
      setCompileError("Backend is offline.");
      return;
    }
    setCompiling(true);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/runs/${encodeURIComponent(run.runId)}/compile-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as CompileResult | null;
        throw new Error(data?.message || data?.error || `Compile failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      if (blob.type && blob.type !== "application/pdf") {
        throw new Error(`Unexpected response type: ${blob.type}`);
      }
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      const nextUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(nextUrl);
      lastLoadedLatex.current = latex;
      await refreshRunStatus(run.runId).catch(() => undefined);
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : "Compile failed");
    } finally {
      setCompiling(false);
    }
  };

  const handleReset = () => {
    setLatex(lastLoadedLatex.current);
    setSaveError(null);
    setSaveOkAt(null);
    setCompileError(null);
    setAskChatError(null);
  };

  const handleAskChat = () => {
    setAskChatError(null);
    if (!onAskChat) {
      setAskChatError("Chat is unavailable in this view.");
      return;
    }
    const el = textareaRef.current;
    if (!el) {
      setAskChatError("Unable to read selection.");
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (!end || end <= start) {
      setAskChatError("Select a LaTeX snippet first, then click 'Ask about selection'.");
      return;
    }
    const raw = latex.slice(start, end);
    const snippet = raw.length > 6000 ? `${raw.slice(0, 5900)}\n\n[TRUNCATED]` : raw;
    onAskChat({
      type: "latex_selection",
      artifact: "resume.tex",
      selection: { start, end },
      snippet,
      docText: latex
    });
  };

  const handleTextareaContextMenu: React.MouseEventHandler<HTMLTextAreaElement> = (e) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    // Only show custom menu when there's an actual selection.
    if (!end || end <= start) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="latex-editor">
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-head" style={{ alignItems: "center" }}>
          <div>
            <h4>LaTeX Editor</h4>
            <p className="hint">
              Edit the generated <code>resume.tex</code>, then compile to preview the PDF here.
            </p>
          </div>
          <div className="latex-actions">
            <button className="ghost" onClick={loadGeneratedLatex} disabled={loading || !texUrl}>
              Reload generated
            </button>
            <button className="ghost" onClick={handleAskChat} disabled={!latex || loading}>
              Ask about selection
            </button>
            <button className="ghost" onClick={handleReset} disabled={!isDirty}>
              Reset edits
            </button>
            <button className="ghost" onClick={handleSave} disabled={saving || compiling || !canTalkToBackend}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="primary" onClick={handleCompile} disabled={compiling || saving || !canTalkToBackend}>
              {compiling ? "Compiling..." : "Compile PDF"}
            </button>
          </div>
        </div>

        {loadError && <div className="warning-box" style={{ marginTop: 10 }}>{loadError}</div>}
        {saveError && <div className="warning-box" style={{ marginTop: 10 }}>{saveError}</div>}
        {compileError && <div className="warning-box" style={{ marginTop: 10 }}>{compileError}</div>}
        {askChatError && <div className="warning-box" style={{ marginTop: 10 }}>{askChatError}</div>}
        {saveOkAt ? (
          <div className="meta" style={{ marginTop: 10 }}>
            Saved at {new Date(saveOkAt).toLocaleString()}
            {isDirty ? " (unsaved edits present)" : ""}
          </div>
        ) : (
          <div className="meta" style={{ marginTop: 10 }}>
            {isDirty ? "Unsaved edits present" : texUrl ? "Loaded generated LaTeX" : "No LaTeX artifact yet"}
          </div>
        )}
      </div>

      <div className="latex-split">
        <div className="latex-pane">
          <div className="latex-pane-head">
            <strong>resume.tex</strong>
            <span className="hint">{loading ? "Loading..." : isDirty ? "● Unsaved" : "Edit LaTeX"}</span>
          </div>
          <div className="latex-textarea-wrap">
            <textarea
              ref={textareaRef}
              className="latex-textarea"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              onContextMenu={handleTextareaContextMenu}
              spellCheck={false}
              placeholder={
                texUrl
                  ? "Loading LaTeX..."
                  : "No LaTeX found for this run yet. Finish the run (or generate LaTeX) to edit here."
              }
              disabled={loading}
            />
            {contextMenu && (
              <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
                <button
                  className="context-menu-item"
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setContextMenu(null);
                    handleAskChat();
                  }}
                >
                  Ask about selection
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BUG-016: Better PDF preview empty state */}
        <div className="latex-pane">
          <div className="latex-pane-head">
            <strong>PDF Preview</strong>
            <span className="hint">
              {pdfBlobUrl 
                ? "✓ Compiled" 
                : compiling 
                  ? "Compiling..." 
                  : "Ready"}
            </span>
          </div>
          <div className="latex-preview">
            {pdfBlobUrl ? (
              <iframe title="PDF preview" src={pdfBlobUrl} />
            ) : (
              <div className="pdf-empty-state">
                <div className="pdf-empty-icon">
                  {compiling ? "⏳" : "📄"}
                </div>
                <div className="pdf-empty-title">
                  {compiling ? "Compiling PDF..." : "No Preview Yet"}
                </div>
                <div className="pdf-empty-hint">
                  {compiling 
                    ? "This may take a few seconds" 
                    : "Click 'Compile PDF' to generate preview"}
                </div>
                {!compiling && canTalkToBackend && latex && (
                  <button 
                    className="primary" 
                    onClick={handleCompile}
                    style={{ marginTop: 16 }}
                  >
                    Compile PDF
                  </button>
                )}
                {!canTalkToBackend && (
                  <div className="pdf-empty-warning">
                    ⚠️ Backend offline
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BUG-010: Unsaved changes indicator */}
      {isDirty && (
        <div className="unsaved-banner">
          <span>⚠️ You have unsaved changes</span>
          <button className="ghost small" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Now"}
          </button>
        </div>
      )}
    </div>
  );
};

export default RunLatexEditorView;
