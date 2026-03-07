export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { ResultsList, type AuditSummary } from "@/components/results-list";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000") + "/api/v1";

async function fetchAuditList(): Promise<AuditSummary[]> {
  try {
    const r = await fetch(`${API_BASE}/audit/results`, { cache: "no-store" });
    if (!r.ok) return [];
    return r.json();
  } catch {
    return [];
  }
}

export default async function ResultsPage() {
  const items = await fetchAuditList();

  return (
    <main className="page">
      <PageHeader
        title="Results"
        subtitle="Histórico de todas as validações executadas. Clique em um resultado para abrir o canvas de análise."
      />
      <ResultsList items={items} />
    </main>
  );
}
