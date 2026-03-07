import Link from "next/link";

import { DashboardHero } from "@/components/dashboard-hero";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="page">
      <DashboardHero promptCount={data.prompts.length} usageOverview={data.usageOverview} />

      <PageHeader
        eyebrow="Overview"
        title="Enterprise control panel"
        description="Navigate between request monitoring, prompt management, runtime configuration and flow design using the sidebar."
      />

      <div className="section-grid section-grid-tight">
        <SectionCard eyeline="Requests" title="Audit traffic" description="Recent issue classifications, provider routing and readiness signals.">
          <div className="summary-panel">
            <div className="summary-number">{data.usageOverview.totalRequests}</div>
            <div className="summary-copy">Executions from the audit log.</div>
            <Link className="button" href="/requests">Open requests</Link>
          </div>
        </SectionCard>

        <SectionCard eyeline="Prompts" title="Prompt library" description="Browse current templates and create new prompt assets.">
          <div className="summary-panel">
            <div className="summary-number">{data.prompts.length}</div>
            <div className="summary-copy">Templates in the shared prompts directory.</div>
            <Link className="button" href="/prompts">Open prompts</Link>
          </div>
        </SectionCard>
      </div>

      <div className="section-grid section-grid-tight">
        <SectionCard eyeline="Settings" title="Configuration" description="Confidentiality controls, model routing and storage settings.">
          <div className="summary-panel">
            <div className="summary-number">{data.settingsGroups.length}</div>
            <div className="summary-copy">Configuration clusters from the live .env file.</div>
            <Link className="button" href="/settings">Open settings</Link>
          </div>
        </SectionCard>

        <SectionCard eyeline="Flow" title="Pipeline flow" description="Application timeline and evaluation reports.">
          <div className="summary-panel">
            <div className="summary-number">{data.comparisonReports.length}</div>
            <div className="summary-copy">Comparison artifacts and timeline visualization.</div>
            <Link className="button" href="/flow">Open flow</Link>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
