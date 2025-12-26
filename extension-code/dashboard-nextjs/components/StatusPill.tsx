type BackendStatus = "online" | "offline" | "checking";

interface Props {
  status: BackendStatus;
  onRetry?: () => void;
}

const labelMap: Record<BackendStatus, string> = {
  online: "Online",
  offline: "Offline",
  checking: "Checking…"
};

export default function StatusPill({ status, onRetry }: Props) {
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
}

