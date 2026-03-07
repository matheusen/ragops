import { FlowTimeline } from "@/components/flow-timeline";
import { PageHeader } from "@/components/page-header";
import { ReportsList } from "@/components/reports-list";
import { SectionCard } from "@/components/section-card";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function FlowPage() {
  const data = await getDashboardData();

  return (
    <main className="page">
      <PageHeader
        eyebrow="Flow"
        title="Pipeline flow"
        description="Orchestration timeline and evaluation comparison artifacts."
      />

      <div className="section-grid">
        <SectionCard eyeline="Timeline" title="Application pipeline" description="Orchestration path as a design-forward timeline.">
          <FlowTimeline steps={data.timeline} />
        </SectionCard>

        <SectionCard eyeline="Evaluation" title="Comparison reports" description="Scenario comparisons across retriever, reranker and provider choices.">
          <ReportsList reports={data.comparisonReports} />
        </SectionCard>
      </div>
    </main>
  );
}