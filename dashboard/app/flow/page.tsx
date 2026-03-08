import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { getDashboardData } from "@/lib/dashboard-data";
import { getFlows } from "@/lib/flow-store";
import { PipelineCanvasClient } from "@/components/pipeline-canvas-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FlowPage() {
  const [data, flows] = await Promise.all([getDashboardData(), getFlows().catch(() => [])]);

  return (
    <main className="page page--flow">
      <PageHeader
        eyebrow="Flow"
        title="Pipeline canvas"
        description="Monte, explore e salve configurações da pipeline RAG. Planner, query rewriter, reflection memory, policy loop e Temporal GraphRAG agora entram no runtime via `/run-flow`."
      />

      <div className="flow-canvas-wrapper">
        <PipelineCanvasClient initialFlows={flows} />
      </div>

      {data.comparisonReports.length > 0 && (
        <div className="section-grid" style={{ marginTop: "2rem" }}>
          <SectionCard eyeline="Evaluation" title="Comparison reports" description="Comparações entre configurações de retriever, reranker e provider.">
            <ul className="reports-list">
              {data.comparisonReports.map((r) => (
                <li key={r.fileName} className="reports-list__item">
                  <span className="reports-list__name">{r.fileName.replace(/\.json$/i, "")}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}
    </main>
  );
}
