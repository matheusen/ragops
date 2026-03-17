export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { RoadmapGenerator } from "@/components/roadmap-generator";

export default function RoadmapPage() {
  return (
    <main className="page">
      <PageHeader
        title="Roadmap Generator"
        subtitle="Gere um roadmap de desenvolvimento ou aprendizado usando sua base de conhecimento + LLM"
      />
      <RoadmapGenerator />
    </main>
  );
}
