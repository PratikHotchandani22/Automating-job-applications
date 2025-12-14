import type { Filters } from "../types";

interface Props {
  filters: Filters;
  onChange: (update: Partial<Filters>) => void;
}

const RunFilters = ({ filters, onChange }: Props) => {
  return (
    <div className="run-filters">
      <input
        className="input"
        placeholder="Search by title or company"
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
      <div className="pill-group">
        {["today", "7d", "30d", "all"].map((range) => (
          <button
            key={range}
            className={`pill ${filters.dateRange === range ? "active" : ""}`}
            onClick={() => onChange({ dateRange: range as Filters["dateRange"] })}
          >
            {range === "7d" ? "7d" : range === "30d" ? "30d" : range === "today" ? "Today" : "All"}
          </button>
        ))}
      </div>
      <select className="select" value={filters.status} onChange={(e) => onChange({ status: e.target.value as Filters["status"] })}>
        <option value="all">Status: All</option>
        <option value="done">Done</option>
        <option value="running">Running</option>
        <option value="error">Error</option>
      </select>
      <select
        className="select"
        value={filters.platform}
        onChange={(e) => onChange({ platform: e.target.value as Filters["platform"] })}
      >
        <option value="all">Platform: All</option>
        <option value="linkedin">LinkedIn</option>
        <option value="greenhouse">Greenhouse</option>
        <option value="workday">Workday</option>
        <option value="other">Other</option>
      </select>
      <select className="select" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as Filters["sort"] })}>
        <option value="newest">Sort: Newest</option>
        <option value="coverage">Best coverage</option>
        <option value="runtime">Fastest runtime</option>
      </select>
    </div>
  );
};

export default RunFilters;
