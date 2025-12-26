export type BackendStatus = "online" | "offline" | "checking";

export type RunStage =
  | "EXTRACTING"
  | "RUBRIC"
  | "EVIDENCE"
  | "EMBEDDINGS"
  | "SELECTION"
  | "ANALYZING"
  | "GENERATING_LATEX"
  | "COMPILING_PDF"
  | "DONE"
  | "ERROR"
  | "IDLE"
  | "RUNNING"
  | "UNKNOWN";

export type RunResult = "pending" | "success" | "error";

export interface ArtifactMap {
  [key: string]: string | undefined;
}

export interface StageSnapshot {
  key: string;
  label: string;
  status: "pending" | "active" | "complete" | "error";
  detail?: string;
}

export interface RunRecord {
  runId: string;
  clientRunId?: string;
  queueId?: string | null;
  queuePosition?: number | null;
  queueSize?: number | null;
  queueLabel?: string | null;
  tab?: {
    tabId?: number | null;
    windowId?: number | null;
    url?: string | null;
    title?: string | null;
  };
  captureId?: string;
  title?: string;
  company?: string;
  platform?: string;
  status: RunStage;
  result: RunResult;
  coverage?: number | null;
  runtimeSec?: number | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  message?: string | null;
  error?: string | null;
  artifacts?: ArtifactMap;
  stages?: StageSnapshot[];
  uncovered?: string[];
  keywords?: string[];
  debugNotes?: string;
}

export type DateRangeFilter = "today" | "7d" | "30d" | "all";
export type StatusFilter = "all" | "done" | "running" | "error";
export type PlatformFilter = "all" | "linkedin" | "greenhouse" | "workday" | "other";
export type RunSort = "newest" | "coverage" | "runtime";

export interface Filters {
  search: string;
  dateRange: DateRangeFilter;
  status: StatusFilter;
  platform: PlatformFilter;
  sort: RunSort;
}

