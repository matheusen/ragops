import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { SettingsPanels } from "@/components/settings-panels";
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

      <SectionCard eyeline="Environment" title="Live configuration" description="Settings read from the .env file, grouped by domain.">
        <SettingsPanels groups={data.settingsGroups} />
        <div className="footer-note">Sensitive values are masked. The dashboard shows posture, not secrets.</div>
      </SectionCard>
    </main>
  );
}