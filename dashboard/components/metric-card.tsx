interface MetricCardProps {
  label: string;
  value: string;
  delta: string;
}

export function MetricCard({ label, value, delta }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="delta">{delta}</div>
    </article>
  );
}