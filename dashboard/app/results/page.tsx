export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { ResultsList } from "@/components/results-list";
import { getResultsList } from "@/lib/results-data";

export default async function ResultsPage() {
  const items = await getResultsList();

  return (
    <main className="page">
      <PageHeader
        title="Results"
        subtitle="Histórico de validações com fallback local/mock. Clique em um resultado para abrir o canvas de análise e correlação."
      />
      <ResultsList items={items} />
    </main>
  );
}
