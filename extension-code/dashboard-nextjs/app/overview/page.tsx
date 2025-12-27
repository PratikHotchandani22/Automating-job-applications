"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartCard from "@/components/ChartCard";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";
import { formatDateTime } from "@/utils/runFilters";
import UserOnboarding from "@/components/UserOnboarding";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

type Range = "today" | "7d" | "30d";

const rangeToDays: Record<Range, number> = {
  today: 1,
  "7d": 7,
  "30d": 30
};

export default function OverviewPage() {
  const { user: clerkUser } = useUser();
  const router = useRouter();
  const [range, setRange] = useState<Range>("7d");
  
  // Get user from Convex
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );

  const resumes = useQuery(
    api.masterResumes.getMasterResumes,
    convexUser ? { userId: convexUser._id } : "skip"
  );
  
  // Get user's runs from Convex
  const runs = useQuery(
    api.runs.getRunsWithJobDetails,
    convexUser ? { userId: convexUser._id } : "skip"
  ) || [];

  const metrics = useMemo(() => {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const appsToday = runs.filter((r: any) => r.startedAt && new Date(r.startedAt) >= startOfDay).length;

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const appsWeek = runs.filter((r: any) => r.startedAt && new Date(r.startedAt) >= weekStart).length;

    const successCount = runs.filter((r: any) => r.status === "success").length;
    const successRate = runs.length ? Math.round((successCount / runs.length) * 100) : 0;
    
    // Calculate average runtime from timing data
    const runtimes = runs
      .map((r: any) => r.timing?.totalMs ? r.timing.totalMs / 1000 : 0)
      .filter(Boolean);
    const avgRuntime = runtimes.length ? Math.round(runtimes.reduce((a: number, b: number) => a + b, 0) / runtimes.length) : 0;

    return { appsToday, appsWeek, successRate, avgRuntime };
  }, [runs]);

  const lineData = useMemo(() => {
    const days = rangeToDays[range];
    const today = new Date();
    const buckets: { label: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = runs.filter((r: any) => {
        const ts = r.startedAt || r.updatedAt;
        if (!ts) return false;
        const d = new Date(ts);
        return d >= dayStart && d < dayEnd;
      }).length;
      buckets.push({ label, count });
    }
    return buckets;
  }, [range, runs]);

  const donutData = useMemo(() => {
    const done = runs.filter((r: any) => r.status === "success").length;
    const running = runs.filter((r: any) => r.status === "running" && r.stage !== "ERROR").length;
    const error = runs.filter((r: any) => r.status === "error" || r.stage === "ERROR").length;
    return [
      { name: "Done", value: done },
      { name: "Running", value: running },
      { name: "Error", value: error }
    ];
  }, [runs]);

  const recentRuns = useMemo(() => runs.slice(0, 10), [runs]);

  useEffect(() => {
    if (!convexUser || !resumes) return;
    if (resumes.length === 0) {
      router.replace("/billing");
    }
  }, [convexUser, resumes, router]);

  // Show onboarding if user not set up
  if (!convexUser) {
    return <UserOnboarding />;
  }

  return (
    <div className="page-grid">
      <div className="kpi-grid">
        <KpiCard title="Applications Today" value={String(metrics.appsToday)} hint="Runs started since midnight" variant="primary" />
        <KpiCard title="Success Rate" value={`${metrics.successRate}%`} hint="Completed without errors" variant="primary" />
        <KpiCard title="This Week" value={`${metrics.appsWeek}`} hint="Runs started past 7 days" />
        <KpiCard title="Avg Runtime" value={`${metrics.avgRuntime || 0}s`} hint="Time from extract to PDF" />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Applications over time"
          subtitle="Toggle to zoom into today or last 30 days"
          action={
            <div className="pill-group">
              {(["today", "7d", "30d"] as Range[]).map((option) => (
                <button
                  key={option}
                  className={`pill ${range === option ? "active" : ""}`}
                  onClick={() => setRange(option)}
                >
                  {option === "today" ? "Today" : option === "7d" ? "7 days" : "30 days"}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={lineData}>
              <defs>
                <linearGradient id="countGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: "#8ea0b8" }} />
              <YAxis allowDecimals={false} tick={{ fill: "#8ea0b8" }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
              <Area type="monotone" dataKey="count" stroke="#7dd3fc" fill="url(#countGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status breakdown" subtitle="Current pipeline states">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={donutData}
                innerRadius={60}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
              >
                <Cell fill="#34d399" />
                <Cell fill="#60a5fa" />
                <Cell fill="#f87171" />
              </Pie>
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Recent runs</h3>
            <p className="hint">Last 10 runs across all platforms</p>
          </div>
          <div className="actions-inline">
            <button className="ghost small" onClick={() => window.location.reload()}>
              Refresh
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="runs-table compact">
            <thead>
              <tr>
                <th>Job Title / Company</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Timestamp</th>
                <th>Coverage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run: any) => (
                <tr
                  key={run._id}
                  className="clickable"
                  onClick={() => {
                    window.location.href = `/run/${run.runId}`;
                  }}
                >
                  <td>
                    <div className="cell-title">{run.title || "Untitled role"}</div>
                    <div className="hint">{run.company || "Unknown company"}</div>
                  </td>
                  <td>{run.platform || "Other"}</td>
                  <td>
                    <span className={`status-pill tiny ${run.status === "error" ? "error" : run.status === "success" ? "done" : "pending"}`}>
                      {run.stage}
                    </span>
                  </td>
                  <td>{formatDateTime(run.startedAt || run.updatedAt)}</td>
                  <td>
                    <div className="coverage-cell">
                      <div className="coverage-bar">
                        <span style={{ width: `${Math.min(100, Math.max(0, 0))}%` }} />
                      </div>
                      <span className="coverage-label">—</span>
                    </div>
                  </td>
                  <td>
                    <div className="actions-inline">
                      <Link
                        href={`/run/${run.runId}`}
                        className="ghost small"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </Link>
                      <button className="ghost icon small" onClick={(e) => e.stopPropagation()} title="More actions soon">
                        ⋯
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!recentRuns.length ? <div className="empty-state">No runs yet. Start a new run to see activity.</div> : null}
        </div>
      </div>
    </div>
  );
}
