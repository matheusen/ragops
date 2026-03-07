import type { DailyUsage } from "@/lib/dashboard-data";

interface SparkBarsProps {
  items: DailyUsage[];
}

export function SparkBars({ items }: SparkBarsProps) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.day}>
          <span>{item.day}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <span>{item.count}</span>
        </div>
      ))}
    </div>
  );
}