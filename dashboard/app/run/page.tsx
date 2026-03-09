export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { RunPanel } from "@/components/run-panel";

export default function RunPage() {
  return (
    <main className="page">
      <PageHeader
        title="Run"
        subtitle="Execute validação de issues ou análise de artigos, com seleção explícita de modo, provider e prompt"
      />
      <RunPanel />
    </main>
  );
}
