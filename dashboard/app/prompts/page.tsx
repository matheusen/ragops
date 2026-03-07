import { PageHeader } from "@/components/page-header";
import { PromptCreateForm } from "@/components/prompt-create-form";
import { PromptLibrary } from "@/components/prompt-library";
import { SectionCard } from "@/components/section-card";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const data = await getDashboardData();

  return (
    <main className="page">
      <PageHeader
        eyebrow="Prompts"
        title="Prompt management"
        description="Browse, inspect and create prompt templates for the Python API."
      />

      <div className="section-grid">
        <SectionCard eyeline="Library" title="Current prompts" description="Active prompt templates backing the API.">
          <PromptLibrary prompts={data.prompts} />
        </SectionCard>

        <SectionCard eyeline="Create" title="New template" description="Create a new prompt variant.">
          <PromptCreateForm />
        </SectionCard>
      </div>
    </main>
  );
}