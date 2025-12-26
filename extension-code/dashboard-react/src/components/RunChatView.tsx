import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, RunChatSession, RunRecord } from "../types";
import { BACKEND_BASE_URL, chatRun } from "../api/bridge";
import { useDashboardStore } from "../store/dashboardStore";

const SESSION_TTL_MS = 15 * 60 * 1000;

const formatSessionLabel = (s: RunChatSession) => {
  const created = new Date(s.createdAt);
  const time = Number.isFinite(created.getTime()) ? created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Unknown";
  const date = Number.isFinite(created.getTime()) ? created.toLocaleDateString() : "";
  return `${date} ${time}`.trim();
};

const RunChatView = ({
  run,
  draftSeed
}: {
  run: RunRecord;
  draftSeed?: string | null;
}) => {
  const backendStatus = useDashboardStore((s) => s.backendStatus);
  const refreshRunStatus = useDashboardStore((s) => s.refreshRunStatus);
  const ensureActiveChatSession = useDashboardStore((s) => s.ensureActiveChatSession);
  const createChatSession = useDashboardStore((s) => s.createChatSession);
  const selectChatSession = useDashboardStore((s) => s.selectChatSession);
  const appendChatMessage = useDashboardStore((s) => s.appendChatMessage);
  const setChatFocusOnce = useDashboardStore((s) => s.setChatFocusOnce);
  const setChatPendingAction = useDashboardStore((s) => s.setChatPendingAction);
  const sessions = useDashboardStore((s) => s.chatSessionsByRunId[run.runId] || []);
  const activeSessionId = useDashboardStore((s) => s.activeChatSessionByRunId[run.runId]);
  const canTalkToBackend = backendStatus === "online";

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Ensure there's always an active session for this run.
    ensureActiveChatSession(run);
    setDraft("");
    setSending(false);
    setError(null);
  }, [run.runId]);

  const activeSession = useMemo(() => {
    if (!sessions.length) return null;
    const id = activeSessionId || sessions[0]?.sessionId;
    return sessions.find((s) => s.sessionId === id) || sessions[0] || null;
  }, [sessions, activeSessionId]);

  const isExpired = useMemo(() => {
    if (!activeSession) return false;
    const last = Date.parse(activeSession.lastActiveAt || activeSession.createdAt || "0");
    if (!Number.isFinite(last)) return false;
    return Date.now() - last > SESSION_TTL_MS;
  }, [activeSession?.lastActiveAt, activeSession?.createdAt]);

  // BUG-011: Calculate time until expiry for proactive warning
  const timeUntilExpiry = useMemo(() => {
    if (!activeSession || isExpired) return 0;
    const last = Date.parse(activeSession.lastActiveAt || activeSession.createdAt || "0");
    if (!Number.isFinite(last)) return 0;
    const expiresAt = last + SESSION_TTL_MS;
    return Math.max(0, expiresAt - Date.now());
  }, [activeSession?.lastActiveAt, activeSession?.createdAt, isExpired]);

  // BUG-011: Show warning when close to expiry (< 2 minutes)
  const isNearExpiry = timeUntilExpiry > 0 && timeUntilExpiry < 2 * 60 * 1000;

  useEffect(() => {
    if (!draftSeed) return;
    // Only seed if user hasn't started typing.
    setDraft((cur) => (cur.trim() ? cur : draftSeed));
  }, [draftSeed]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeSession?.messages?.length, sending]);

  const messages = activeSession?.messages || [];
  const focusOnce = activeSession?.focusOnce || null;
  const pendingAction = activeSession?.pendingAction || null;

  const focusSnippet = useMemo(() => {
    const snippet = focusOnce?.snippet;
    if (typeof snippet !== "string") return null;
    return snippet.length > 4000 ? `${snippet.slice(0, 3950)}\n\n[TRUNCATED]` : snippet;
  }, [focusOnce]);

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return null;
  }, [messages]);

  const sanitizeFocusForBackend = (focus: any | null) => {
    if (!focus || typeof focus !== "object") return null;
    // Avoid sending full LaTeX text to the model.
    // JSON.stringify will drop undefined keys.
    return { ...focus, docText: undefined };
  };

  const resolveArtifactUrl = (url: string) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/")) return `${BACKEND_BASE_URL}${url}`;
    return `${BACKEND_BASE_URL}/${url}`;
  };

  const normalizeOps = (action: any) => {
    if (!action || typeof action !== "object") return null;
    if (action.type === "latex_patch_v2" && Array.isArray(action.ops)) return action.ops;
    if (action.type === "latex_patch_v1" && typeof action.op === "string") {
      return [{ op: action.op, start: action.start, end: action.end, replacement: action.replacement }];
    }
    return null;
  };

  const applyPatchToLatex = (latexText: string, action: any, focus: any) => {
    const ops = normalizeOps(action);
    if (!ops) {
      throw new Error("No applicable patch found.");
    }

    const selStart = Number(focus?.selection?.start);
    const selEnd = Number(focus?.selection?.end);
    const focusSnippetRaw = typeof focus?.snippet === "string" ? focus.snippet : null;
    if (!Number.isFinite(selStart) || !Number.isFinite(selEnd) || selEnd <= selStart) {
      throw new Error("Invalid selection focus.");
    }
    if (!focusSnippetRaw || focusSnippetRaw.includes("[TRUNCATED]")) {
      throw new Error("Selection was truncated; please reselect a smaller region to apply edits safely.");
    }
    const currentSelected = latexText.slice(selStart, selEnd);
    if (currentSelected !== focusSnippetRaw) {
      throw new Error("The resume.tex content changed since you selected this snippet. Please reselect and try again.");
    }

    // Validate ops stay within selection, with insert ops allowed only at boundaries.
    const normalized = ops.map((o: any) => ({
      op: (o?.op || "").toString(),
      start: Number(o?.start),
      end: Number(o?.end),
      replacement: typeof o?.replacement === "string" ? o.replacement : null
    }));

    for (const [idx, o] of normalized.entries()) {
      const isDelete = o.op === "delete_range" || o.op === "delete_selection";
      const isReplace = o.op === "replace_range" || o.op === "replace_selection";
      const isInsertBefore = o.op === "insert_before";
      const isInsertAfter = o.op === "insert_after";
      if (!isDelete && !isReplace && !isInsertBefore && !isInsertAfter) {
        throw new Error(`Unsupported patch operation: ${o.op || `op[${idx}]`}`);
      }
      if (!Number.isFinite(o.start) || !Number.isFinite(o.end)) throw new Error("Invalid patch range.");
      if (isInsertBefore || isInsertAfter) {
        if (o.start !== o.end) throw new Error("Insert op must have start=end.");
        if (isInsertBefore && o.start !== selStart) throw new Error("insert_before must be at selection start.");
        if (isInsertAfter && o.start !== selEnd) throw new Error("insert_after must be at selection end.");
        if (typeof o.replacement !== "string") throw new Error("Insert op requires replacement text.");
        continue;
      }
      if (o.end <= o.start) throw new Error("Invalid patch range.");
      if (o.start < selStart || o.end > selEnd) throw new Error("Patch op must stay within the focused selection.");
      if (isReplace && typeof o.replacement !== "string") throw new Error("Replace op requires replacement text.");
    }

    // Apply from right-to-left so offsets remain valid.
    const sorted = [...normalized].sort((a, b) => {
      if (a.start !== b.start) return b.start - a.start;
      return b.end - a.end;
    });

    let next = latexText;
    for (const o of sorted) {
      const isDelete = o.op === "delete_range" || o.op === "delete_selection";
      const isReplace = o.op === "replace_range" || o.op === "replace_selection";
      const isInsert = o.op === "insert_before" || o.op === "insert_after";
      if (isInsert) {
        const ins = o.replacement || "";
        next = `${next.slice(0, o.start)}${ins}${next.slice(o.start)}`;
        continue;
      }
      if (isDelete) {
        next = `${next.slice(0, o.start)}${next.slice(o.end)}`;
        continue;
      }
      if (isReplace) {
        const rep = o.replacement || "";
        next = `${next.slice(0, o.start)}${rep}${next.slice(o.end)}`;
        continue;
      }
    }

    return next;
  };

  const handleApplyAndSave = async () => {
    setError(null);
    if (!pendingAction || !activeSession) return;
    const action = pendingAction;
    if (!canTalkToBackend) {
      setError("Backend is offline.");
      return;
    }
    setSending(true);
    try {
      // Full-document replacement action (no selection focus required).
      if (action?.type === "latex_replace_full" && typeof (action as any)?.latex === "string") {
        const updated = (action as any).latex as string;
        const resSave = await fetch(`${BACKEND_BASE_URL}/runs/${encodeURIComponent(run.runId)}/latex`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latex: updated })
        });
        if (!resSave.ok) {
          const data = (await resSave.json().catch(() => null)) as any | null;
          throw new Error(data?.message || data?.error || `Save failed (HTTP ${resSave.status})`);
        }
        await refreshRunStatus(run.runId).catch(() => undefined);
        appendChatMessage(run.runId, activeSession.sessionId, {
          role: "assistant",
          content:
            "Applied the suggested full-file edit and saved updated resume.tex. Switch back to “LaTeX Editor” and click “Reload generated” to see it."
        });
        setChatPendingAction(run.runId, activeSession.sessionId, null);
        setChatFocusOnce(run.runId, activeSession.sessionId, null);
        return;
      }

      // Selection-based patch action (requires a focused snippet + existing resume.tex artifact URL).
      const focus = focusOnce;
      const texPath = run.artifacts?.tex;
      if (!texPath) {
        throw new Error("No resume.tex artifact found for this run yet.");
      }
      const texUrl = resolveArtifactUrl(texPath);
      const resTex = await fetch(texUrl);
      if (!resTex.ok) {
        throw new Error(`Failed to load current resume.tex (HTTP ${resTex.status})`);
      }
      const currentLatex = await resTex.text();
      const updated = applyPatchToLatex(currentLatex, action, focus);
      const resSave = await fetch(`${BACKEND_BASE_URL}/runs/${encodeURIComponent(run.runId)}/latex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: updated })
      });
      if (!resSave.ok) {
        const data = (await resSave.json().catch(() => null)) as any | null;
        throw new Error(data?.message || data?.error || `Save failed (HTTP ${resSave.status})`);
      }
      await refreshRunStatus(run.runId).catch(() => undefined);
      appendChatMessage(run.runId, activeSession.sessionId, {
        role: "assistant",
        content: "Applied the suggested edit and saved updated resume.tex. Switch back to “LaTeX Editor” and click “Reload generated” to see it."
      });
      setChatPendingAction(run.runId, activeSession.sessionId, null);
      setChatFocusOnce(run.runId, activeSession.sessionId, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply and save");
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    setError(null);
    const text = draft.trim();
    if (!text) return;
    if (!canTalkToBackend) {
      setError("Backend is offline.");
      return;
    }
    if (sending) return;
    if (!activeSession) return;
    if (isExpired) {
      setError("This session expired (15 min inactivity). Start a new session to continue chatting.");
      return;
    }

    appendChatMessage(run.runId, activeSession.sessionId, { role: "user", content: text });
    setDraft("");
    setSending(true);

    try {
      const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
      const recent = nextMessages.slice(-18);
      const res = await chatRun(run.runId, recent, sanitizeFocusForBackend(focusOnce));
      const assistant = res.assistant?.content?.trim()
        ? res.assistant
        : ({ role: "assistant", content: "I couldn’t generate a response for that. Try rephrasing." } as ChatMessage);
      appendChatMessage(run.runId, activeSession.sessionId, assistant);
      if (res.action) {
        setChatPendingAction(run.runId, activeSession.sessionId, res.action);
      } else if (focusOnce) {
        setChatFocusOnce(run.runId, activeSession.sessionId, null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      setError(msg);
      // Keep the user message in the thread, but append a visible assistant error.
      appendChatMessage(run.runId, activeSession.sessionId, { role: "assistant", content: `Error: ${msg}` });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend().catch(() => undefined);
    }
  };

  return (
    <div className="run-chat">
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-head">
          <div>
            <h4>Chat</h4>
            <p className="hint">Ask questions about what changed and why. Press Ctrl/⌘ + Enter to send.</p>
          </div>
          <div className="pill subtle">{canTalkToBackend ? "Backend online" : "Backend offline"}</div>
        </div>
        <div className="run-chat-sessions">
          <div className="meta">Session</div>
          <select
            className="run-chat-session-select"
            value={activeSession?.sessionId || ""}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              selectChatSession(run.runId, id);
              setError(null);
            }}
          >
            {sessions.map((s) => {
              const last = Date.parse(s.lastActiveAt || s.createdAt || "0");
              const expired = Number.isFinite(last) ? Date.now() - last > SESSION_TTL_MS : false;
              const count = s.messages?.length || 0;
              return (
                <option key={s.sessionId} value={s.sessionId}>
                  {formatSessionLabel(s)} · {count} msgs{expired ? " · expired" : ""}
                </option>
              );
            })}
          </select>
          <button
            className="ghost"
            onClick={() => {
              const newId = createChatSession(run, null);
              selectChatSession(run.runId, newId);
              setDraft("");
              setError(null);
            }}
          >
            New session
          </button>
        </div>

        {/* BUG-011: Proactive expiry warning BEFORE session expires */}
        {activeSession && isNearExpiry && !isExpired && (
          <div className="session-expiry-warning">
            <strong>⏰ Session expiring soon</strong>
            <div className="hint" style={{ marginTop: 6 }}>
              This session will expire in {Math.ceil(timeUntilExpiry / 60000)} minute(s). 
              Send a message to keep it active, or start a new session to continue chatting.
            </div>
            <div className="actions-inline" style={{ marginTop: 10 }}>
              <button
                className="ghost small"
                onClick={() => {
                  // BUG-011: Preserve draft when creating new session
                  const currentDraft = draft;
                  const newId = createChatSession(run, activeSession.sessionId);
                  selectChatSession(run.runId, newId);
                  setDraft(currentDraft); // Keep the draft!
                  setError(null);
                }}
              >
                Continue in new session
              </button>
            </div>
          </div>
        )}

        {activeSession && isExpired && (
          <div className="warning-box" style={{ marginTop: 10 }}>
            <strong>Session expired</strong>
            <div className="hint" style={{ marginTop: 6 }}>
              This chat is read-only after 15 minutes of inactivity. Your draft will be preserved when you continue.
            </div>
            <div className="actions-inline" style={{ marginTop: 10 }}>
              <button
                className="primary"
                onClick={() => {
                  // BUG-011: Preserve draft when continuing session
                  const currentDraft = draft;
                  const newId = createChatSession(run, activeSession.sessionId);
                  selectChatSession(run.runId, newId);
                  setDraft(currentDraft); // Keep the draft!
                  setError(null);
                }}
              >
                Continue from this session
              </button>
              <button
                className="ghost"
                onClick={() => {
                  // BUG-011: Preserve draft when starting fresh
                  const currentDraft = draft;
                  const newId = createChatSession(run, null);
                  selectChatSession(run.runId, newId);
                  setDraft(currentDraft); // Keep the draft!
                  setError(null);
                }}
              >
                Start fresh
              </button>
            </div>
          </div>
        )}

        {focusOnce ? (
          <div className="run-chat-focus" style={{ marginTop: 10 }}>
            <div className="run-chat-focus-head">
              <div className="meta">
                Focus attached for next message: <strong>{focusOnce?.type || "selection"}</strong>
              </div>
              <button className="ghost" onClick={() => activeSession && setChatFocusOnce(run.runId, activeSession.sessionId, null)}>
                Clear focus
              </button>
            </div>
            {focusSnippet ? (
              <details className="run-chat-focus-details" open>
                <summary>Preview focused snippet</summary>
                <pre className="run-chat-focus-snippet">{focusSnippet}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
        {pendingAction ? (
          <div className="run-chat-focus" style={{ marginTop: 10 }}>
            <div className="run-chat-focus-head">
              <div className="meta">
                Suggested edit ready: <strong>{pendingAction?.op || pendingAction?.type || "patch"}</strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="ghost"
                  onClick={() => activeSession && setChatPendingAction(run.runId, activeSession.sessionId, null)}
                  disabled={sending}
                >
                  Dismiss
                </button>
                <button className="primary" onClick={handleApplyAndSave} disabled={sending || !canTalkToBackend}>
                  {sending ? "Applying..." : "Apply & Save"}
                </button>
              </div>
            </div>
            <div className="meta" style={{ marginTop: 8 }}>
              This will modify <code>resume.tex</code> for this run using the patch produced by the edit prompt.
            </div>
          </div>
        ) : null}
        {lastUserMessage ? <div className="meta">Last question: {lastUserMessage}</div> : null}
        {error ? <div className="warning-box" style={{ marginTop: 10 }}>{error}</div> : null}
      </div>

      <div className="run-chat-thread" ref={threadRef}>
        {messages.map((m, idx) => (
          <div key={idx} className={`run-chat-row ${m.role}`}>
            <div className={`run-chat-bubble ${m.role}`}>{m.content}</div>
          </div>
        ))}
        {sending ? (
          <div className="run-chat-row assistant">
            <div className="run-chat-bubble assistant">Thinking…</div>
          </div>
        ) : null}
      </div>

      <div className="run-chat-input">
        <textarea
          className="run-chat-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={canTalkToBackend ? "Ask a question…" : "Backend offline. Start the backend to chat."}
          disabled={!canTalkToBackend || sending}
          rows={3}
        />
        <button className="primary" onClick={handleSend} disabled={!canTalkToBackend || sending || !draft.trim()}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default RunChatView;

