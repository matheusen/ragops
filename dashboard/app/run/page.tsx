export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { RunPanel } from "@/components/run-panel";

export default function RunPage() {
  return (
    <main className="page">
      <PageHeader
        title="Run"
        subtitle="Execute o pipeline de validação de issues — via Jira, entrada manual ou pasta de artefatos"
      />
      <RunPanel />
    </main>
  );
}
