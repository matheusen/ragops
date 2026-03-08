export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleSummaryBoard } from "@/components/article-summary-board";
import { EvidenceCards } from "@/components/evidence-cards";
import { ResultCanvas } from "@/components/result-canvas";
import { getResultById } from "@/lib/results-data";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ResultCanvasPage({ params }: Props) {
  const { id } = await params;
  const [issueKey, timestamp] = decodeURIComponent(id).split("__");
  if (!issueKey || !timestamp) notFound();

  const audit = await getResultById(`${issueKey}__${timestamp}`);
  if (!audit) notFound();

  return (
    <main className="page page--result-detail">
      <div className="rc__breadcrumb">
        <Link href="/results" className="rc__breadcrumb-back">← Resultados</Link>
        <span className="rc__breadcrumb-sep">/</span>
        <span className="rc__breadcrumb-id">{issueKey}</span>
        <span className="rc__breadcrumb-ts">{timestamp}</span>
      </div>
      <section className="rc__shell">
        <ResultCanvas audit={audit} />
      </section>
      <ArticleSummaryBoard
        articleCards={audit.knowledge_map.article_cards}
        themeClusters={audit.knowledge_map.theme_clusters}
      />
      <EvidenceCards audit={audit} />
    </main>
  );
}
