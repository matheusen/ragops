import { PageHeader } from "@/components/page-header";
import { RequestFeed } from "@/components/request-feed";
import { SectionCard } from "@/components/section-card";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const data = await getDashboardData();

  return (
    <main className="page">
      <PageHeader
        eyebrow="Requests"
        title="Request monitoring"
        description="Operational visibility into confidence, provider routing and issue-level risk markers."
      />

      <SectionCard eyeline="Recent traffic" title="Latest validated requests" description="Rendered from the Python audit trail.">
        <RequestFeed requests={data.recentRequests} />
      </SectionCard>
    </main>
  );
}