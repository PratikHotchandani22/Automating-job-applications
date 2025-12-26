interface Props {
  title: string;
  value: string;
  hint?: string;
  variant?: "primary" | "secondary";
  trend?: string;
}

export default function KpiCard({ title, value, hint, variant = "secondary", trend }: Props) {
  return (
    <div className={`kpi-card ${variant}`}>
      <div className="kpi-top">
        <div className="kpi-title">{title}</div>
        {trend ? <div className="kpi-trend">{trend}</div> : null}
      </div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

