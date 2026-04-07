import { PageHeader } from "@/components/page-header";
import { RagPresentationMindmap } from "@/components/rag-presentation-mindmap";

export default function RagPresentationMindmapPage() {
  return (
    <main className="page page--canvas">
      <PageHeader
        eyebrow="Mindmap"
        title="RAG Ainda e Necessario?"
        description="Mapa mental interativo do deck em Markdown, com a mesma linguagem visual do roadmap e referencias ligadas aos artigos analisados."
      />
      <RagPresentationMindmap />
    </main>
  );
}