"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import StatusPill from "./StatusPill";
import { useState } from "react";

const navItems = [
  { path: "/overview", label: "Overview" },
  { path: "/runs", label: "Runs" },
  { path: "/settings", label: "Settings" },
  { path: "/compare", label: "Compare", disabled: true }
];

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "checking">("online");

  const handleRefresh = () => {
    // TODO: Implement refresh logic with Convex
    window.location.reload();
  };

  return (
    <div className="app-shell">
      {backendStatus === "offline" && (
        <div className="banner warn">
          Backend offline — downloads and analysis are disabled.
          <button className="ghost small" onClick={handleRefresh}>
            Retry health check
          </button>
        </div>
      )}

      <header className="app-topbar">
        <div className="brand">
          <div className="logo-dot" />
          <div>
            <div className="brand-title">ResumeGen Tracker</div>
            <div className="brand-subtitle">Dashboard</div>
          </div>
        </div>
        <div className="top-actions">
          <StatusPill status={backendStatus} onRetry={handleRefresh} />
          <SignedIn>
            <button className="ghost" onClick={handleRefresh}>
              Refresh
            </button>
            <Link href="/start-run" className="primary">
              Start New Run
            </Link>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="ghost">Sign In</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="primary">Sign Up</button>
            </SignUpButton>
          </SignedOut>
        </div>
      </header>

      <SignedIn>
        <nav className="tabs">
          {navItems.map((item) =>
            item.disabled ? (
              <span key={item.path} className="tab disabled">
                {item.label}
              </span>
            ) : (
              <Link
                key={item.path}
                href={item.path}
                className={`tab ${pathname === item.path ? "active" : ""}`}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
      </SignedIn>

      <main className="content">{children}</main>
    </div>
  );
}

