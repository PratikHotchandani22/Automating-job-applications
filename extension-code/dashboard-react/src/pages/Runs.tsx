import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import RunFilters from "../components/RunFilters";
import RunsTable from "../components/RunsTable";
import { useDashboardStore } from "../store/dashboardStore";
import { defaultFilters, applyFilters } from "../utils/runFilters";
import type { Filters } from "../types";
import type { RunRecord } from "../types";
import { stopRun } from "../api/bridge";

const RunsPage = () => {
  const navigate = useNavigate();
  const runs = useDashboardStore((state) => state.runs);
  const refreshRuns = useDashboardStore((state) => state.refreshRuns);
  const download = useDashboardStore((state) => state.download);
  const backendStatus = useDashboardStore((state) => state.backendStatus);
  const setResponseReceived = useDashboardStore((state) => state.setResponseReceived);
  const deleteRun = useDashboardStore((state) => state.deleteRun);
  const retryRun = useDashboardStore((state) => state.retryRun);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

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

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Applications</h2>
          <p className="hint">Search and review your analyzed job applications</p>
        </div>
        <div className="actions-inline">
          <button
            className="ghost small"
            onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}
            title="Toggle table density"
          >
            Density: {density === "compact" ? "Compact" : "Comfortable"}
          </button>
          <button className="ghost small" onClick={() => refreshRuns()}>
            Refresh
          </button>
        </div>
      </div>

      <RunFilters filters={filters} onChange={(update) => setFilters((prev) => ({ ...prev, ...update }))} />

      <RunsTable
        runs={filteredRuns}
        backendOnline={backendStatus === "online"}
        onSelect={handleSelect}
        onDownload={(run) => download(run.runId, "pdf")}
        onToggleResponse={(run: RunRecord) => setResponseReceived(run.runId, !run.responseReceivedAt)}
        onDelete={(run: RunRecord) => deleteRun(run.runId)}
        onRerun={async (run: RunRecord) => {
          await retryRun(run.runId);
          await refreshRuns();
        }}
        onStop={(run) => handleStopRun(run.runId)}
        density={density}
      />
    </div>
  );
};

export default RunsPage;
