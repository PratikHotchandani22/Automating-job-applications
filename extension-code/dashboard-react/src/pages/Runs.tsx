import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RunFilters from "../components/RunFilters";
import RunsTable from "../components/RunsTable";
import { useDashboardStore } from "../store/dashboardStore";
import { defaultFilters, applyFilters } from "../utils/runFilters";
import type { Filters } from "../types";
import { stopQueue, stopRun } from "../api/bridge";

const RunsPage = () => {
  const navigate = useNavigate();
  const runs = useDashboardStore((state) => state.runs);
  const refreshRuns = useDashboardStore((state) => state.refreshRuns);
  const download = useDashboardStore((state) => state.download);
  const backendStatus = useDashboardStore((state) => state.backendStatus);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const filteredRuns = useMemo(() => applyFilters(runs, filters), [runs, filters]);

  const handleSelect = (id: string) => {
    const target = `/run/${id}`;
    navigate(target);
    if (typeof window !== "undefined") {
      window.location.hash = `#${target}`;
    }
  };

  const handleStopRun = async (runId: string) => {
    try {
      await stopRun(runId);
      await refreshRuns();
    } catch (e: any) {
      console.error("Stop run failed", e?.message || e);
    }
  };

  const handleStopQueue = async (queueId: string) => {
    try {
      await stopQueue(queueId);
      await refreshRuns();
    } catch (e: any) {
      console.error("Stop queue failed", e?.message || e);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Runs history</h2>
          <p className="hint">Search, filter, and open the run detail page</p>
        </div>
        <div className="actions-inline">
          <button className="ghost small" onClick={() => refreshRuns()}>
            Refresh
          </button>
        </div>
      </div>

      <RunFilters filters={filters} onChange={(update) => setFilters((prev) => ({ ...prev, ...update }))} />

      <div className="queue-groups">
        {Object.values(
          filteredRuns.reduce<Record<string, any>>((acc, run) => {
            const key = run.queueId || run.runId;
            if (!acc[key]) acc[key] = { queueId: key, queueLabel: run.queueLabel || key, runs: [] as typeof filteredRuns };
            acc[key].runs.push(run);
            return acc;
          }, {})
        )
          .sort((a, b) => {
            const aTs = Date.parse(a.runs[0]?.updatedAt || a.runs[0]?.startedAt || "0");
            const bTs = Date.parse(b.runs[0]?.updatedAt || b.runs[0]?.startedAt || "0");
            return bTs - aTs;
          })
          .map((group) => {
            const size = group.runs.length;
            const latest = group.runs[0];
            const hasActive = group.runs.some((r: any) => r.result === "pending");
            return (
              <details key={group.queueId} className="queue-card" open>
                <summary className="queue-card-head">
                  <div>
                    <div className="queue-title">{group.queueLabel}</div>
                    <div className="hint">
                      {group.queueId} · {size} run{size > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="queue-meta">
                    <span className={`status-pill tiny ${latest?.result === "error" ? "error" : latest?.result === "success" ? "done" : "pending"}`}>
                      {latest?.status || "UNKNOWN"}
                    </span>
                    {hasActive ? (
                      <button
                        className="ghost small"
                        onClick={(e) => {
                          e.preventDefault();
                          handleStopQueue(group.queueId);
                        }}
                      >
                        Stop queue
                      </button>
                    ) : null}
                  </div>
                </summary>
                <div className="queue-body">
                  <RunsTable
                    runs={group.runs}
                    backendOnline={backendStatus === "online"}
                    onSelect={handleSelect}
                    onDownload={(run) => download(run.runId, run.artifacts?.pdf ? "pdf" : "json")}
                    showHeader={false}
                    onStop={(run) => handleStopRun(run.runId)}
                  />
                </div>
              </details>
            );
          })}
      </div>
    </div>
  );
};

export default RunsPage;
