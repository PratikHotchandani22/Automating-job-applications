interface Props {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function ChartCard({ title, subtitle, action, children }: Props) {
  return (
    <div className="panel chart-card">
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="hint">{subtitle}</p> : null}
        </div>
        {action ? <div className="card-action">{action}</div> : null}
      </div>
      <div className="chart-body">{children}</div>
    </div>
  );
}

