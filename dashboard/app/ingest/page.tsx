export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { IngestPanel } from "@/components/ingest-panel";

export default function IngestPage() {
  return (
    <main className="page">
      <PageHeader
        title="Knowledge Ingest"
        subtitle="Faça upload de livros e PDFs para construir sua base de conhecimento no Qdrant"
      />
      <IngestPanel />
    </main>
  );
}
