import { useEffect } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import StatusPill from "./components/StatusPill";
import { useRunPolling } from "./hooks/useRunPolling";
import OverviewPage from "./pages/Overview";
import RunsPage from "./pages/Runs";
import RunDetailPage from "./pages/RunDetail";
import SettingsPage from "./pages/Settings";
import StartRunPage from "./pages/StartRun";
import { useDashboardStore } from "./store/dashboardStore";
import "./App.css";

const navItems = [
  { path: "/overview", label: "Overview" },
  { path: "/runs", label: "Runs" },
  { path: "/settings", label: "Settings" },
  { path: "/compare", label: "Compare", disabled: true }
];

const AppShell = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const backendStatus = useDashboardStore((state) => state.backendStatus);
  const loadInitial = useDashboardStore((state) => state.loadInitial);
  const startNewRun = useDashboardStore((state) => state.startNewRun);
  const refreshRuns = useDashboardStore((state) => state.refreshRuns);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (location.pathname === "/") {
      navigate("/overview", { replace: true });
    }
  }, [location.pathname, navigate]);

  useRunPolling();

  return (
    <div className="app-shell">
      {backendStatus === "offline" ? (
        <div className="banner warn">
          Backend offline — downloads and analysis are disabled.
          <button className="ghost small" onClick={() => refreshRuns()}>
            Retry health check
          </button>
        </div>
      ) : null}

      <header className="app-topbar">
        <div className="brand">
          <div className="logo-dot" />
          <div>
            <div className="brand-title">ResumeGen Tracker</div>
            <div className="brand-subtitle">Dashboard</div>
          </div>
        </div>
        <div className="top-actions">
          <StatusPill status={backendStatus} onRetry={refreshRuns} />
          <button className="ghost" onClick={() => refreshRuns()}>
            Refresh
          </button>
          <button
            className="primary"
            onClick={() => {
              // If we're in the dashboard, use React Router navigation
              if (window.location.href.includes("dashboard.html")) {
                navigate("/start-run");
              } else {
                // Otherwise, use the bridge function to open dashboard
                startNewRun();
              }
            }}
          >
            Start New Run
          </button>
        </div>
      </header>

      <nav className="tabs">
        {navItems.map((item) =>
          item.disabled ? (
            <span key={item.path} className="tab disabled">
              {item.label}
            </span>
          ) : (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      <main className="content">
        <Routes>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/run/:runId" element={<RunDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/start-run" element={<StartRunPage />} />
          <Route path="/compare" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default AppShell;
