import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import RunFilters from "../components/RunFilters";
import RunsTable from "../components/RunsTable";
import { useDashboardStore } from "../store/dashboardStore";
import { defaultFilters, applyFilters } from "../utils/runFilters";
import type { Filters } from "../types";

const RunsPage = () => {
  const navigate = useNavigate();
  const { runId } = useParams();
  const runs = useDashboardStore((state) => state.runs);
  const selectRun = useDashboardStore((state) => state.selectRun);
  const refreshRuns = useDashboardStore((state) => state.refreshRuns);
  const download = useDashboardStore((state) => state.download);
  const backendStatus = useDashboardStore((state) => state.backendStatus);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const filteredRuns = useMemo(() => applyFilters(runs, filters), [runs, filters]);

  // Keep drawer selection in sync with URL param
  useEffect(() => {
    if (runId) {
      selectRun(runId);
    }
  }, [runId, selectRun]);

  const handleSelect = (id: string) => {
    selectRun(id);
    const target = `/run/${id}`;
    navigate(target);
    if (typeof window !== "undefined") {
      window.location.hash = `#${target}`;
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Runs history</h2>
          <p className="hint">Search, filter, and open a run detail drawer</p>
        </div>
        <div className="actions-inline">
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
        onDownload={(run) => download(run.runId, run.artifacts?.pdf ? "pdf" : "json")}
      />
    </div>
  );
};

export default RunsPage;
