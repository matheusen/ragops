import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { CostSimulator } from "@/components/cost-simulator";
import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function CostPage() {
  const { prompts } = await getDashboardData();

  return (
    <main className="page">
      <PageHeader
        eyebrow="Cost"
        title="API cost simulator"
        description="Estime tokens e custo em USD e BRL para cada provider antes de executar."
      />
      <SectionCard
        eyeline="Simulator"
        title="Token & cost estimator"
        description="Digite, cole ou importe seus prompts salvos. Os tokens são estimados via chars÷4. Preços oficiais de março 2026."
      >
        <CostSimulator prompts={prompts} />
      </SectionCard>
    </main>
  );
}
