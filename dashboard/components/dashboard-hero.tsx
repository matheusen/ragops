import { MetricCard } from "@/components/metric-card";
import { SparkBars } from "@/components/spark-bars";
import type { UsageOverview } from "@/lib/dashboard-data";

export function DashboardHero({ usageOverview, promptCount }: { usageOverview: UsageOverview; promptCount: number }) {
  return (
    <section className="hero">
      <div>
        <span className="eyebrow">Enterprise Dashboard</span>
        <h1>RAG Operations Control</h1>
        <p>
          Unified monitoring for request traffic, prompt assets, runtime configuration and pipeline evaluation — backed by live workspace data.
        </p>

        <div className="hero-grid">
          <MetricCard label="Total requests" value={String(usageOverview.totalRequests)} delta={`${usageOverview.uniqueIssues} unique issues`} />
          <MetricCard label="Avg confidence" value={`${Math.round(usageOverview.avgConfidence * 100)}%`} delta="From audit decisions" />
          <MetricCard label="Needs review" value={`${Math.round(usageOverview.reviewRate * 100)}%`} delta="Review rate" />
          <MetricCard label="Prompt assets" value={String(promptCount)} delta="Active templates" />
        </div>
      </div>

      <aside className="spotlight-card">
        <div className="mini-label">Request cadence</div>
        <div className="value">{usageOverview.totalRequests}</div>
        <div className="muted">Validated executions from the audit trail.</div>
        <SparkBars items={usageOverview.dailyUsage.length ? usageOverview.dailyUsage : [{ day: "n/a", count: 0 }]} />
        <div className="footer-note">
          {usageOverview.byProvider.map((entry) => `${entry.name} ${entry.count}`).join(" · ") || "No provider data"}
        </div>
      </aside>
    </section>
  );
}