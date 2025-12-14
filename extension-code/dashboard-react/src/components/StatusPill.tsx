import type { BackendStatus } from "../types";

interface Props {
  status: BackendStatus;
  onRetry?: () => void;
}

const labelMap: Record<BackendStatus, string> = {
  online: "Online",
  offline: "Offline",
  checking: "Checking…"
};

export const StatusPill = ({ status, onRetry }: Props) => {
  return (
    <button
      className={`status-pill ${status}`}
      onClick={status === "offline" && onRetry ? onRetry : undefined}
      title={status === "offline" ? "Retry health check" : ""}
    >
      <span className="dot" />
      {labelMap[status]}
    </button>
  );
};

export default StatusPill;
