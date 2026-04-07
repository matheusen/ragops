import { LearningJourneyPresentation } from "@/components/learning-journey-presentation";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function LearningJourneyPresentationPage() {
  return (
    <main className="page page--journey-presentation">
      <PageHeader
        eyebrow="Apresentacao"
        title="Modo slides"
        description="Um deck tecnico em portugues, baseado no acervo local, para discutir RAG moderno, hybrid retrieval, grafo, avaliacao e grounding em 2026."
      />

      <LearningJourneyPresentation />
    </main>
  );
}