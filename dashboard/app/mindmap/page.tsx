import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { KnowledgeMindmapClient } from "@/components/knowledge-mindmap-client";

export default function MindmapPage() {
  return (
    <main className="page page--canvas">
      <PageHeader
        eyebrow="Mindmaps"
        title="Conhecimento e mapas guiados"
        description="Use o mindmap do corpus para explorar documentos indexados ou abra o mapa guiado do deck de RAG para navegar a tese e os artigos analisados."
      />
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <Link
          href="/mindmap/rag-ainda-e-necessario"
          style={{
            display: "grid",
            gap: ".45rem",
            padding: "1rem 1.1rem",
            borderRadius: "22px",
            border: "1px solid var(--border)",
            background: "linear-gradient(180deg, rgba(255,255,255,.97), rgba(246,248,251,.95))",
            boxShadow: "0 16px 34px rgba(15,23,42,.07)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span className="mini-label">novo mapa guiado</span>
          <strong style={{ fontSize: "1rem", color: "var(--text)" }}>RAG Ainda e Necessario?</strong>
          <span style={{ color: "var(--text-secondary)", lineHeight: 1.6, fontSize: ".9rem" }}>
            Abre um mapa mental do `.md` com centro, ramos, comparacoes de arquitetura e referencias dos sete artigos-chave.
          </span>
        </Link>
      </section>
      <KnowledgeMindmapClient />
    </main>
  );
}
