import { LearningJourneyPresentation } from "@/components/learning-journey-presentation";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function LearningJourneyPresentationPage() {
  return (
    <main className="page page--journey-presentation">
      <PageHeader
        eyebrow="Apresentacao"
        title="Modo slides"
        description="Uma sequencia de slides em portugues para explicar IA, Transformer, LLM, RAG e o novo valor do desenvolvedor em um mercado com mais automacao."
      />

      <LearningJourneyPresentation />
    </main>
  );
}