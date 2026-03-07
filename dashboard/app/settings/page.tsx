import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { ActiveProviderBanner, MongoStatusPanel, SettingsPanels } from "@/components/settings-panels";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getDashboardData();

  return (
    <main className="page">
      <PageHeader
        eyebrow="Settings"
        title="Runtime configuration"
        description="Environment settings grouped by decision posture, provider routing and storage."
      />

      <SectionCard eyeline="Active provider" title="Provider &amp; model in use" description="Which LLM provider and model the pipeline is currently routing requests to.">
        <ActiveProviderBanner config={data.activeConfig} />
      </SectionCard>

      <SectionCard eyeline="Database" title="MongoDB connection" description="Connection status and stored override count.">
        <MongoStatusPanel status={data.mongoStatus} />
      </SectionCard>

      <SectionCard eyeline="Environment" title="Live configuration" description="Settings read from .env merged with MongoDB overrides. Click ✎ to edit a value.">
        <SettingsPanels groups={data.settingsGroups} mongoConfigured={data.mongoConfigured} />
        <div className="footer-note">Sensitive values (.env only) are masked and cannot be edited here.</div>
      </SectionCard>
    </main>
  );
}