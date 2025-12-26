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

export interface ResumeMeta {
  id: string;
  label: string;
  file: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
  latexFile?: string | null;
  latexUpdatedAt?: string | null;
}

export interface ResumeState {
  defaultId: string | null;
  selectedId: string | null;
  resumes: ResumeMeta[];
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

export interface Tab {
  id: number;
  title?: string;
  url?: string;
  active?: boolean;
  windowId?: number;
  index?: number;
  isDashboard?: boolean;
}

export interface Capture {
  captureId: string;
  job: {
    title?: string;
    company?: string;
    location?: string;
    source_platform?: string;
    confidence?: number;
    rawTextHash?: string;
    raw_job_text_hash?: string;
    extracted_preview?: string;
  };
  tab: {
    tabId?: number;
    title?: string;
    url?: string;
  };
  platform?: string;
  confidence: number;
  capturedAt: string;
  rawTextPreview?: string;
  warnings?: string[];
}

export interface StartRunUIState {
  tabScope: "currentWindow" | "allWindows";
  selectedCaptureId: string | null;
  selectedRunId: string | null;
  selectedTabId: number | null;
  selectedTabIds?: number[] | null;
  activeQueueId?: string | null;
  detailsTab: "overview" | "explain";
  selectedResumeId?: string | null;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCitation {
  doc_id: string;
  quote: string;
  reason: string;
}

export interface RunChatResponse {
  ok: boolean;
  run_id?: string;
  assistant?: ChatMessage;
  citations?: ChatCitation[];
  action?: any;
  debug?: any;
  message?: string;
}

export interface RunChatSession {
  sessionId: string;
  runId: string;
  createdAt: string;
  lastActiveAt: string;
  messages: ChatMessage[];
  // One-time focus attached to next model call / patch apply.
  focusOnce?: any | null;
  // Patch returned by exec prompt, pending user apply.
  pendingAction?: any | null;
}
