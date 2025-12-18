import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ChartCard from "../components/ChartCard";
import KpiCard from "../components/KpiCard";
import { useDashboardStore } from "../store/dashboardStore";
import { formatDateTime } from "../utils/runFilters";
import { cleanJobTitle, cleanCompanyName } from "../utils/validateCleaning";
import type { RunRecord } from "../types";

const statusClass = (run: RunRecord) => {
  if (run.result === "error" || run.status === "ERROR") return "error";
  if (run.result === "success" || run.status === "DONE") return "done";
  return "pending";
};

const statusLabel = (run: RunRecord) => {
  if (run.result === "success") return "Completed";
  if (run.result === "error") return "Needs attention";
  return "In progress";
};

type Range = "today" | "7d" | "30d" | "90d" | "all";
type SortKey = "date" | "title" | "company";

const rangeToDays: Record<Exclude<Range, "all">, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90
};

const OverviewPage = () => {
  const navigate = useNavigate();
  const runs = useDashboardStore((state) => state.runs);
  const refreshRuns = useDashboardStore((state) => state.refreshRuns);
  const setResponseReceived = useDashboardStore((state) => state.setResponseReceived);
  const backfillInsights = useDashboardStore((state) => state.backfillInsights);
  const backfilling = useDashboardStore((state) => state.backfilling);
  const backendStatus = useDashboardStore((state) => state.backendStatus);
  const [range, setRange] = useState<Range>("7d");
  const [sortKey, setSortKey] = useState<SortKey>("date");

  const needsBackfill = useMemo(
    () => {
      return runs.some((r) => {
        const title = cleanJobTitle(r.title);
        const company = cleanCompanyName(r.company);
        const missingCoverage = typeof r.coverage !== "number";
        const missingCompany = !company;
        const suspiciousTitle = title === "Untitled role";
        return missingCoverage || missingCompany || suspiciousTitle;
      });
    },
    [runs]
  );

  const metrics = useMemo(() => {
    const analyzed = runs.length;
    const responses = runs.filter((r) => Boolean(r.responseReceivedAt)).length;
    const withCoverage = runs.filter((r) => r.result === "success" && typeof r.coverage === "number");
    const avgMatch =
      withCoverage.length ? Math.round(withCoverage.reduce((sum, r) => sum + (r.coverage || 0), 0) / withCoverage.length) : null;
    const gaps = new Map<string, number>();
    runs
      .filter((r) => r.result === "success")
      .forEach((r) => {
        (r.uncovered || []).forEach((u) => {
          const key = (u || "").toString().trim();
          if (!key) return;
          gaps.set(key, (gaps.get(key) || 0) + 1);
        });
      });
    const uniqueGaps = gaps.size;
    return { analyzed, responses, avgMatch, uniqueGaps };
  }, [runs]);

  const matchTrend = useMemo(() => {
    // Include any run that has a computed match, even if the pipeline is still running.
    const withMatch = runs.filter((r) => typeof r.coverage === "number");

    if (range === "all") {
      // Monthly buckets across the full history.
      const monthMap = new Map<string, number[]>();
      withMatch.forEach((r) => {
        const ts = r.startedAt || r.updatedAt;
        if (!ts) return;
        const d = new Date(ts);
        if (!Number.isFinite(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const arr = monthMap.get(key) || [];
        arr.push(r.coverage || 0);
        monthMap.set(key, arr);
      });
      const keys = Array.from(monthMap.keys()).sort();
      return keys.map((label) => {
        const vals = monthMap.get(label) || [];
        const match = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        return { label, match };
      });
    }

    const days = rangeToDays[range];
    const today = new Date();
    const buckets: { label: string; match: number | null }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayRuns = withMatch.filter((r) => {
        const ts = r.startedAt || r.updatedAt;
        if (!ts) return false;
        const d = new Date(ts);
        return d >= dayStart && d < dayEnd;
      });
      const match = dayRuns.length ? Math.round(dayRuns.reduce((sum, r) => sum + (r.coverage || 0), 0) / dayRuns.length) : null;
      buckets.push({ label, match });
    }
    return buckets;
  }, [range, runs]);

  const topSkills = useMemo(() => {
    const counts = new Map<string, number>();
    runs
      .filter((r) => r.result === "success")
      .forEach((r) => {
        (r.keywords || []).forEach((kw) => {
          const key = (kw || "").toString().trim();
          if (!key) return;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
      });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));
  }, [runs]);

  const recentRuns = useMemo(() => {
    const list = [...runs].slice(0, 10);
    const sorted = [...list].sort((a, b) => {
      if (sortKey === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortKey === "company") return (a.company || "").localeCompare(b.company || "");
      const aTs = Date.parse(a.startedAt || a.updatedAt || "0");
      const bTs = Date.parse(b.startedAt || b.updatedAt || "0");
      return bTs - aTs;
    });
    return sorted;
  }, [runs, sortKey]);

  return (
    <div className="page-grid">
      <div className="kpi-grid">
        <KpiCard title="Applications analyzed" value={String(metrics.analyzed)} hint="Jobs you’ve analyzed so far" variant="primary" />
        <KpiCard title="Responses received" value={String(metrics.responses)} hint="Manually marked responses" variant="primary" />
        <KpiCard title="Resume match strength" value={metrics.avgMatch !== null ? `${metrics.avgMatch}%` : "—"} hint="Average match across completed runs" />
        <KpiCard title="Skills to improve" value={String(metrics.uniqueGaps)} hint="Unique missing requirements across completed runs" />
      </div>

      {needsBackfill ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Compute insights for past applications</h3>
              <p className="hint">We’ll calculate match strength and skills for older runs (requires backend).</p>
            </div>
            <div className="actions-inline">
              <button
                className="primary"
                disabled={backendStatus !== "online" || backfilling}
                onClick={() => backfillInsights()}
                title={backendStatus !== "online" ? "Backend required" : "Compute insights now"}
              >
                {backfilling ? "Computing…" : "Compute now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="chart-grid">
        <ChartCard
          title="Resume match trend"
          subtitle="Average match strength over time"
          action={
            <div className="pill-group">
              {(["today", "7d", "30d", "90d", "all"] as Range[]).map((option) => (
                <button
                  key={option}
                  className={`pill ${range === option ? "active" : ""}`}
                  onClick={() => setRange(option)}
                >
                  {option === "today" ? "Today" : option === "7d" ? "7 days" : option === "30d" ? "30 days" : option === "90d" ? "90 days" : "All"}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={matchTrend}>
              <defs>
                <linearGradient id="countGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: "#8ea0b8" }} />
              <YAxis domain={[0, 100]} allowDecimals={false} tick={{ fill: "#8ea0b8" }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
              <Area type="monotone" dataKey="match" stroke="#7dd3fc" fill="url(#countGradient)" strokeWidth={2} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top skills employers request" subtitle="Most frequent skills across analyzed job postings">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topSkills} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#8ea0b8" }} />
              <YAxis type="category" dataKey="skill" width={110} tick={{ fill: "#8ea0b8" }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1f2937" }} />
              <Bar dataKey="count" fill="#60a5fa" radius={[6, 6, 6, 6]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Recent applications</h3>
            <p className="hint">Your most recently analyzed jobs</p>
          </div>
          <div className="actions-inline">
            <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} title="Sort recent runs">
              <option value="date">Sort: Date</option>
              <option value="title">Sort: Job title</option>
              <option value="company">Sort: Company</option>
            </select>
            <button className="ghost small" onClick={() => refreshRuns()}>
              Refresh
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="runs-table compact">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Match</th>
                <th>Date</th>
                <th>Response</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => {
                const cleanedTitle = cleanJobTitle(run.title);
                const cleanedCompany = cleanCompanyName(run.company);
                return (
                  <tr
                    key={run.runId}
                    className="clickable"
                    onClick={() => {
                      const target = `/run/${run.runId}`;
                      navigate(target);
                      if (typeof window !== "undefined") {
                        window.location.hash = `#${target}`;
                      }
                    }}
                  >
                    <td>
                      <div className="cell-title">{cleanedTitle}</div>
                      {cleanedCompany ? <div className="hint">{cleanedCompany}</div> : null}
                    </td>
                    <td>
                      <span className={`status-pill tiny ${statusClass(run)}`}>{statusLabel(run)}</span>
                    </td>
                    <td>{typeof run.coverage === "number" ? `${run.coverage}%` : "—"}</td>
                    <td>{formatDateTime(run.startedAt || run.updatedAt)}</td>
                    <td>
                      <div className="actions-inline">
                        <span className="hint">{run.responseReceivedAt ? "Marked" : "—"}</span>
                        <button
                          className="ghost small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResponseReceived(run.runId, !run.responseReceivedAt).catch(() => undefined);
                          }}
                          title="Mark whether you received a response for this application"
                        >
                          {run.responseReceivedAt ? "Unmark response" : "Mark response"}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="actions-inline">
                        {run.tab?.url ? (
                          <a
                            className="ghost small"
                            href={run.tab.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Open job application page"
                          >
                            Apply
                          </a>
                        ) : null}
                        <button
                          className="ghost small"
                          onClick={(e) => {
                            e.stopPropagation();
                            const target = `/run/${run.runId}`;
                            navigate(target);
                            if (typeof window !== "undefined") {
                              window.location.hash = `#${target}`;
                            }
                          }}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!recentRuns.length ? <div className="empty-state">No runs yet. Start a new run to see activity.</div> : null}
        </div>
      </div>
    </div>
  );
};

export default OverviewPage;
