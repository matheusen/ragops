export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleSummaryBoard } from "@/components/article-summary-board";
import { ArticleWhiteboard } from "@/components/article-whiteboard";
import { EvidenceCards } from "@/components/evidence-cards";
import { RelatedResultsBoard } from "@/components/related-results-board";
import { ResultCanvas } from "@/components/result-canvas";
import { RuntimeTechniquesPanel } from "@/components/runtime-techniques-panel";
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
      {audit.article_run ? (
        <ArticleWhiteboard audit={audit} />
      ) : (
        <section className="rc__shell">
          <ResultCanvas audit={audit} />
        </section>
      )}
      {!audit.article_run && <RuntimeTechniquesPanel audit={audit} />}
      {!audit.article_run && (
        <>
          <ArticleSummaryBoard
            title={audit.issue.summary}
            summary={audit.knowledge_map.summary}
            centralIdeas={[]}
            topics={audit.knowledge_map.topics.map((topic) => topic.label).slice(0, 8)}
            warnings={[]}
            metadata={{}}
            articleCards={audit.knowledge_map.article_cards}
            themeClusters={audit.knowledge_map.theme_clusters}
            relatedItems={audit.knowledge_map.related_audits}
          />
          <RelatedResultsBoard
            currentId={audit.result_meta.id}
            currentTitle={audit.issue.summary}
            currentSummary={audit.knowledge_map.summary}
            currentTopics={audit.knowledge_map.topics.map((topic) => topic.label).slice(0, 5)}
            items={audit.knowledge_map.related_audits}
          />
        </>
      )}
      {!audit.article_run && <EvidenceCards audit={audit} />}
    </main>
  );
}
