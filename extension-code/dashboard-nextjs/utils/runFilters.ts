import { format, isAfter, subDays, startOfDay } from "date-fns";
import type { Filters, RunRecord } from "@/types";

export const defaultFilters: Filters = {
  search: "",
  dateRange: "30d",
  status: "all",
  platform: "all",
  sort: "newest"
};

const matchesSearch = (run: RunRecord, term: string) => {
  if (!term) return true;
  const haystack = `${run.title || ""} ${run.company || ""} ${run.platform || ""}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
};

const matchesStatus = (run: RunRecord, status: Filters["status"]) => {
  if (status === "all") return true;
  if (status === "done") return run.result === "success" || run.status === "DONE";
  if (status === "running") return run.result === "pending" && run.status !== "ERROR";
  if (status === "error") return run.result === "error" || run.status === "ERROR";
  return true;
};

const matchesPlatform = (run: RunRecord, platform: Filters["platform"]) => {
  if (platform === "all") return true;
  return (run.platform || "other").toLowerCase() === platform.toLowerCase();
};

const matchesDateRange = (run: RunRecord, range: Filters["dateRange"]) => {
  if (range === "all") return true;
  const ts = run.startedAt || run.updatedAt || run.createdAt;
  if (!ts) return false;
  const date = new Date(ts);
  const today = startOfDay(new Date());
  if (range === "today") return isAfter(date, today);
  const days = range === "7d" ? 7 : 30;
  const threshold = subDays(today, days);
  return isAfter(date, threshold);
};

const sortRuns = (runs: RunRecord[], sort: Filters["sort"]) => {
  const list = [...runs];
  if (sort === "coverage") {
    return list.sort((a, b) => (b.coverage || 0) - (a.coverage || 0));
  }
  if (sort === "runtime") {
    return list.sort((a, b) => (a.runtimeSec || 0) - (b.runtimeSec || 0));
  }
  return list.sort(
    (a, b) =>
      Date.parse(b.updatedAt || b.startedAt || b.createdAt || "0") -
      Date.parse(a.updatedAt || a.startedAt || a.createdAt || "0")
  );
};

export const applyFilters = (runs: RunRecord[], filters: Filters): RunRecord[] => {
  const filtered = runs.filter(
    (run) =>
      matchesSearch(run, filters.search) &&
      matchesStatus(run, filters.status) &&
      matchesPlatform(run, filters.platform) &&
      matchesDateRange(run, filters.dateRange)
  );
  return sortRuns(filtered, filters.sort);
};

export const formatDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, HH:mm");
  } catch (error) {
    return "—";
  }
};

export const formatDuration = (seconds?: number | null) => {
  if (!seconds && seconds !== 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

