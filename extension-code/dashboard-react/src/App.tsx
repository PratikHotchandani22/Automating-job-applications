import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import StatusPill from "./components/StatusPill";
import { useRunPolling } from "./hooks/useRunPolling";
import { useAuth } from "./contexts/AuthContext";
import OverviewPage from "./pages/Overview";
import RunsPage from "./pages/Runs";
import RunDetailPage from "./pages/RunDetail";
import SettingsPage from "./pages/Settings";
import StartRunPage from "./pages/StartRun";
import LoginPage from "./pages/Login";
import useBootstrapCheck from "./hooks/useBootstrapCheck";
import { useDashboardStore } from "./store/dashboardStore";
import "./App.css";
// Import validation utilities for browser console access
import "./utils/runValidation";

const navItems = [
  { path: "/overview", label: "Overview" },
  { path: "/runs", label: "Applications" },
  { path: "/settings", label: "Settings" },
  { path: "/compare", label: "Compare", disabled: true }
];

// User menu component
const UserMenu = () => {
  const { user, isAuthenticated, signOut, isConfigured } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (!isConfigured) {
    return null; // Don't show user menu if auth not configured
  }

  if (!isAuthenticated) {
    return (
      <button className="ghost small" onClick={() => navigate("/login")}>
        Sign in
      </button>
    );
  }

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate("/login");
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="user-menu">
      <button className="user-menu-trigger" onClick={() => setMenuOpen(!menuOpen)}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="user-avatar" />
        ) : (
          <div className="user-avatar-placeholder">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="user-name">{displayName}</span>
      </button>
      {menuOpen && (
        <>
          <div className="user-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="user-menu-dropdown">
            <div className="user-menu-header">
              <div className="user-menu-email">{user?.email}</div>
            </div>
            <button className="user-menu-item" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const AppShell = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading: authLoading, isAuthenticated, isConfigured } = useAuth();
  const {
    requiresBootstrap,
    loading: bootstrapLoading,
    error: bootstrapError,
    refresh: refreshBootstrap
  } = useBootstrapCheck();
  const backendStatus = useDashboardStore((state) => state.backendStatus);
  const loadInitial = useDashboardStore((state) => state.loadInitial);
  const startNewRun = useDashboardStore((state) => state.startNewRun);
  const refreshRuns = useDashboardStore((state) => state.refreshRuns);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    console.debug("[App] Auth/Bootstrap state", {
      authLoading,
      isAuthenticated,
      isConfigured,
      requiresBootstrap,
      bootstrapLoading,
      bootstrapError
    });
    if (location.pathname === "/") {
      navigate("/overview", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!isConfigured) return;
    if (authLoading) return;
    if (!isAuthenticated && location.pathname !== "/login") {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [authLoading, isAuthenticated, isConfigured, location.pathname, navigate]);

  useRunPolling();

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <div className="app-shell loading">
        <div className="loading-spinner" />
      </div>
    );
  }

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
            <div className="brand-title">Resume Assistant</div>
            <div className="brand-subtitle">Job application insights</div>
          </div>
        </div>
        <div className="top-actions">
          <StatusPill status={backendStatus} onRetry={refreshRuns} />
          <button className="ghost" onClick={() => refreshRuns()}>
            Refresh
          </button>
          <button
            className="primary"
            disabled={requiresBootstrap && bootstrapLoading}
            onClick={() => {
              if (requiresBootstrap && bootstrapLoading) {
                navigate("/settings");
                return;
              }
              // If we're in the dashboard, use React Router navigation
              if (window.location.href.includes("dashboard.html")) {
                navigate("/start-run");
              } else {
                // Otherwise, use the bridge function to open dashboard
                startNewRun();
              }
            }}
          >
            Analyze a job
          </button>
          <UserMenu />
        </div>
      </header>

      {requiresBootstrap && bootstrapError ? (
        <div className="banner warn">
          {bootstrapError}
          <button className="ghost small" onClick={() => refreshBootstrap()}>
            Retry
          </button>
        </div>
      ) : null}

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
          <Route path="/login" element={<LoginPage />} />
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
