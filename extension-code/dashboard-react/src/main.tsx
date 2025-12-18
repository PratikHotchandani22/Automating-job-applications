import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import "./index.css";
import App from "./App";

function renderFatalError(err: unknown) {
  const root = document.getElementById("root");
  if (!root) return;
  const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ""}` : String(err);
  root.innerHTML = `
    <div style="padding:16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;max-width:960px;margin:0 auto;">
      <h2 style="margin:0 0 10px 0;">Dashboard failed to load</h2>
      <p style="margin:0 0 10px 0;opacity:0.8;">Open DevTools console for details.</p>
      <pre style="white-space:pre-wrap;background:rgba(0,0,0,0.35);padding:12px;border-radius:12px;border:1px solid rgba(148,163,184,0.25);">${message}</pre>
    </div>
  `;
}

// Surface crashes that would otherwise look like a blank page.
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("Window error", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled rejection", e.reason);
});

try {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AuthProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </AuthProvider>
    </StrictMode>
  );
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("Fatal render error", err);
  renderFatalError(err);
}
