import Link from "next/link";

import type { ResultArticleCard, ResultAudit, ResultRelatedAuditCard, ResultThemeCluster } from "@/lib/results-data";

interface ArticleWhiteboardProps {
  audit: ResultAudit;
}

type BoardNote = {
  id: string;
  title: string;
  body: string;
  tone: "warn" | "info" | "accent";
};

type MindMapNode = {
  id: string;
  title: string;
  body: string;
  href: string;
  tone: "summary" | "attention" | "build" | "actions" | "topics" | "sources";
  x: number;
  y: number;
  edgeX: number;
  edgeY: number;
};

export function ArticleWhiteboard({ audit }: ArticleWhiteboardProps) {
  const view = audit.article_run;
  if (!view) return null;

  const runtime = audit.runtime_view;
  const topics = audit.knowledge_map.topics;
  const articleCards = audit.knowledge_map.article_cards;
  const themeClusters = audit.knowledge_map.theme_clusters;
  const relatedItems = audit.knowledge_map.related_audits;
  const groupedCards = groupCardsByTheme(articleCards);
  const sourceFiles = readStringArray(view.metadata.source_files);
  const sourceDocuments = Array.isArray(view.metadata.source_documents) ? view.metadata.source_documents : [];
  const uploadedCount = sourceFiles.length;
  const extractedCount = sourceDocuments.length || articleCards.length;
  const missingCount = Math.max(uploadedCount - extractedCount, 0);
  const sourceName = fileNameFromPath(view.source) || "conteudo manual";
  const collectionLabel = uploadedCount > 1
    ? `Coleção de ${uploadedCount} documentos`
    : sourceName;
  const collectionExamples = buildCollectionExamples(articleCards, sourceFiles);
  const graphAssessment = view.graph_assessment ?? view.benchmark?.graph_usefulness ?? null;
  const inboxNotes = buildInboxNotes({
    missingCount,
    uploadedCount,
    warnings: view.warnings,
    nextSteps: view.next_steps,
    relatedCount: relatedItems.length,
  });
  const topRisks = view.risks.slice(0, 3);
  const topIdeas = view.central_ideas.slice(0, 4);
  const topNextSteps = view.next_steps.slice(0, 3);
  const topContexts = view.retrieved_contexts.slice(0, 4);
  const topExtractionReports = view.extraction_reports.slice(0, 3);
  const topRelatedItems = relatedItems.slice(0, 4);
  const mindMapNodes = buildMindMapNodes({
    summary: view.executive_summary,
    topIdeas,
    inboxNotes,
    topRisks,
    runtimeSummary: runtime?.summary || "",
    graphMode: graphAssessment?.mode || "",
    topNextSteps,
    topics: topics.map((topic) => topic.label),
    collectionLabel,
    uploadedCount,
    extractedCount,
  });

  const boardLayers = [
    { href: "#board-overview", label: "Resumo", meta: "o que aconteceu" },
    { href: "#board-topics", label: "Temas", meta: `${themeClusters.length || 1} grupos` },
    { href: "#board-evidence", label: "Evidências", meta: `${view.retrieved_contexts.length} pistas` },
    { href: "#board-related", label: "Relacionadas", meta: `${relatedItems.length} links` },
  ];

  return (
    <section className="hwb">
      <div className="hwb__hero">
        <div>
          <span className="eyebrow">heptabase-style result</span>
          <h1 className="hwb__title">{view.title}</h1>
          <p className="hwb__copy">
            Esta review foi simplificada para responder rápido a três perguntas: o que o LLM concluiu, por que ele concluiu isso e o que vale fazer em seguida.
          </p>
        </div>
        <div className="hwb__meta">
          <span className="hwb__meta-chip hwb__meta-chip--accent">{view.provider}</span>
          <span className="hwb__meta-chip">{uploadedCount > 0 ? `${uploadedCount} fontes` : collectionLabel}</span>
          <span className="hwb__meta-chip">{articleCards.length} cards</span>
          {runtime?.techniques.length ? <span className="hwb__meta-chip">{runtime.techniques.length} técnicas</span> : null}
          {graphAssessment?.mode && <span className="hwb__meta-chip">{formatModeLabel(graphAssessment.mode)}</span>}
        </div>
      </div>

      <nav className="hwb__layers" aria-label="Camadas do board">
        {boardLayers.map((layer) => (
          <a key={layer.href} href={layer.href} className="hwb__layer-link">
            <span>{layer.label}</span>
            <small>{layer.meta}</small>
          </a>
        ))}
      </nav>

      <section className="hwb__mindmap" aria-label="Mapa mental da review">
        <div className="hwb__board-head">
          <div>
            <span className="eyebrow">mind map</span>
            <h2 className="hwb__board-title">Mapa mental da review</h2>
            <p className="hwb__board-copy">
              A síntese central fica no meio e os ramos mostram os motivos, alertas e próximos passos que sustentam a leitura, no formato de whiteboard navegável.
            </p>
          </div>
          <div className="hwb__chips">
            <span className="hwb__chip">{mindMapNodes.length} ramos</span>
            <span className="hwb__chip hwb__chip--accent">visão rápida</span>
          </div>
        </div>

        <div className="hwb__mindmap-canvas">
          <svg className="hwb__mindmap-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {mindMapNodes.map((node) => (
              <line
                key={`line-${node.id}`}
                x1="50"
                y1="50"
                x2={String(node.edgeX)}
                y2={String(node.edgeY)}
                className={`hwb__mindmap-line hwb__mindmap-line--${node.tone}`}
              />
            ))}
          </svg>

          <article className="hwb__mindmap-node hwb__mindmap-node--center">
            <div className="hwb__note-top">
              <span className="hwb__note-tag">síntese central</span>
              <span className="hwb__note-meta">{topics.length || 1} eixos</span>
            </div>
            <h3 className="hwb__topic-title">A leitura do corpus</h3>
            <p className="hwb__topic-copy">{truncateText(view.executive_summary, 260)}</p>
            <div className="hwb__chips">
              {topics.slice(0, 4).map((topic) => (
                <span key={topic.id} className="hwb__chip hwb__chip--accent">{topic.label}</span>
              ))}
            </div>
          </article>

          {mindMapNodes.map((node) => (
            <a
              key={node.id}
              href={node.href}
              className={`hwb__mindmap-node hwb__mindmap-node--${node.tone}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <span className="hwb__note-tag">{node.title}</span>
              <p className="hwb__topic-copy">{node.body}</p>
            </a>
          ))}
        </div>
      </section>

      <section id="board-overview" className="hwb__canvas">
        <article className="hwb__note hwb__note--thesis hwb__note--wide">
          <div className="hwb__note-top">
            <span className="hwb__note-tag">nota central</span>
            <span className="hwb__note-meta">
              {uploadedCount > 0 ? `${extractedCount}/${uploadedCount} fontes úteis` : `${articleCards.length} fontes úteis`}
            </span>
          </div>
          <h2 className="hwb__note-title">O que o modelo concluiu</h2>
          <p className="hwb__note-copy">{view.executive_summary}</p>
          {topIdeas.length > 0 && (
            <ul className="hwb__list">
              {topIdeas.map((idea) => <li key={idea}>{idea}</li>)}
            </ul>
          )}
          {topics.length > 0 && (
            <div className="hwb__chips">
              {topics.slice(0, 6).map((topic) => (
                <span key={topic.id} className="hwb__chip hwb__chip--accent">
                  {topic.label}
                </span>
              ))}
            </div>
          )}
        </article>

        <article className="hwb__note hwb__note--section">
          <div className="hwb__section-head">
            <span className="hwb__section-label">O que merece atenção</span>
            <span className="hwb__section-meta">{Math.max(inboxNotes.length, topRisks.length)}</span>
          </div>
          <div className="hwb__stack-list">
            {inboxNotes.slice(0, 2).map((note) => (
              <article key={note.id} className={`hwb__mini-note hwb__mini-note--${note.tone}`}>
                <h3>{note.title}</h3>
                <p>{note.body}</p>
              </article>
            ))}
          </div>
          {topRisks.length > 0 && (
            <ul className="hwb__list">
              {topRisks.map((risk) => <li key={risk}>{risk}</li>)}
            </ul>
          )}
        </article>

        <article className="hwb__note hwb__note--strategy">
          <div className="hwb__section-head">
            <span className="hwb__section-label">Como essa resposta foi construída</span>
            <span className="hwb__section-meta">{runtime?.techniques.length ?? 0} técnicas</span>
          </div>
          <p className="hwb__note-copy">
            {runtime?.summary || "Sem resumo operacional salvo para esta execução."}
          </p>
          <div className="hwb__chips">
            {runtime?.provider && <span className="hwb__chip">{runtime.provider}</span>}
            {runtime?.model && <span className="hwb__chip">{runtime.model}</span>}
            {runtime?.execution_path && <span className="hwb__chip">{runtime.execution_path}</span>}
            {runtime?.prompt_name && <span className="hwb__chip">{runtime.prompt_name}</span>}
          </div>
          {graphAssessment && (
            <>
              <div className="hwb__subhead">Rota de busca escolhida</div>
              <div className="hwb__chips">
                <span className="hwb__chip hwb__chip--accent">{formatModeLabel(graphAssessment.mode)}</span>
                <span className="hwb__chip">score {formatPercent(graphAssessment.score)}</span>
              </div>
              <p className="hwb__note-copy hwb__note-copy--sm">
                {graphAssessment.rationale || "Sem racional adicional salvo para o gate de grafo."}
              </p>
            </>
          )}
          {view.benchmark && (
            <>
              <div className="hwb__subhead">Estratégia recomendada</div>
              <div className="hwb__chips">
                <span className="hwb__chip hwb__chip--accent">
                  recomendado: {formatModeLabel(view.benchmark.recommended_mode)}
                </span>
              </div>
              <div className="hwb__scenario-list">
                {view.benchmark.scenarios.slice(0, 4).map((scenario) => (
                  <div key={`${scenario.mode}-${scenario.retrieval_mode}`} className="hwb__scenario">
                    <strong>{formatModeLabel(scenario.mode)}</strong>
                    <span>{Math.round(scenario.latency_ms)} ms</span>
                    <span>{scenario.result_count} hits</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="hwb__note hwb__note--source">
          <div className="hwb__section-head">
            <span className="hwb__section-label">O que fazer agora</span>
            <span className="hwb__section-meta">
              {topNextSteps.length}
            </span>
          </div>
          {topNextSteps.length > 0 ? (
            <ul className="hwb__list">
              {topNextSteps.map((step) => <li key={step}>{step}</li>)}
            </ul>
          ) : (
            <p className="hwb__note-copy">Nenhum próximo passo estruturado foi salvo para esta execução.</p>
          )}
          <div className="hwb__chips">
            {view.warnings.length > 0 && <span className="hwb__chip hwb__chip--warn">{view.warnings.length} alertas</span>}
            {topRisks.length > 0 && <span className="hwb__chip">{topRisks.length} riscos resumidos</span>}
          </div>
        </article>

        <article className="hwb__note hwb__note--section">
          <div className="hwb__section-head">
            <span className="hwb__section-label">Corpus analisado</span>
            <span className="hwb__section-meta">
              {uploadedCount > 0 ? `${extractedCount}/${uploadedCount} indexados` : `${articleCards.length} fontes`}
            </span>
          </div>
          <h3 className="hwb__topic-title">{collectionLabel}</h3>
          <p className="hwb__topic-copy">
            Estes são os exemplos de documentos que puxaram os temas dominantes desta review.
          </p>
          {collectionExamples.length > 0 && (
            <ul className="hwb__list">
              {collectionExamples.map((example) => <li key={example}>{example}</li>)}
              {Math.max(articleCards.length, uploadedCount) > collectionExamples.length && (
                <li>{`+${Math.max(articleCards.length, uploadedCount) - collectionExamples.length} outros documentos no corpus`}</li>
              )}
            </ul>
          )}
        </article>
      </section>

      <section id="board-topics" className="hwb__board-section">
        <div className="hwb__board-head">
          <div>
            <span className="eyebrow">second layer</span>
            <h2 className="hwb__board-title">Sections do whiteboard</h2>
            <p className="hwb__board-copy">
              Em vez de abrir mais subníveis, os cards são agrupados em sections temáticas. Cada section funciona como uma área do quadro para leitura rápida e rearranjo futuro.
            </p>
          </div>
          <div className="hwb__chips">
            <span className="hwb__chip">{themeClusters.length || 1} sections</span>
            <span className="hwb__chip">{articleCards.length} cards</span>
          </div>
        </div>

        <div className="hwb__theme-grid">
          {(themeClusters.length > 0 ? themeClusters : buildFallbackClusters(articleCards)).map((cluster) => {
            const cards = groupedCards.get(slugify(cluster.label)) ?? [];
            return (
              <article key={cluster.id} className="hwb__theme-section">
                <div className="hwb__section-head">
                  <div>
                    <span className="hwb__section-label">{cluster.label}</span>
                    <p className="hwb__section-copy">{cluster.summary}</p>
                  </div>
                  <span className="hwb__section-meta">{cards.length}</span>
                </div>
                <div className="hwb__theme-cards">
                  {cards.map((card) => (
                    <article key={card.id} className="hwb__topic-card">
                      <div className="hwb__note-top">
                        <span className="hwb__note-tag">{card.theme}</span>
                        <span className="hwb__note-meta">{Math.round(card.confidence * 100)}%</span>
                      </div>
                      <h3 className="hwb__topic-title">{card.title}</h3>
                      <p className="hwb__topic-copy">{card.summary}</p>
                      <div className="hwb__chips">
                        {card.linked_topic_ids.slice(0, 3).map((topic) => (
                          <span key={`${card.id}-${topic}`} className="hwb__chip hwb__chip--accent">{topic}</span>
                        ))}
                        {card.secondary_themes.slice(0, 2).map((theme) => (
                          <span key={`${card.id}-${theme}`} className="hwb__chip">{theme}</span>
                        ))}
                      </div>
                      <div className="hwb__source">{card.source_name}</div>
                    </article>
                  ))}
                  {cards.length === 0 && (
                    <article className="hwb__topic-card hwb__topic-card--empty">
                      <h3 className="hwb__topic-title">Sem cards</h3>
                      <p className="hwb__topic-copy">Nenhum item do corpus foi agrupado nesta section.</p>
                    </article>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {(view.retrieved_contexts.length > 0 || view.distillation || view.extraction_reports.length > 0) && (
        <section id="board-evidence" className="hwb__board-section">
          <div className="hwb__board-head">
            <div>
              <span className="eyebrow">evidence layer</span>
              <h2 className="hwb__board-title">Por que essa leitura parece confiável</h2>
              <p className="hwb__board-copy">
                Aqui fica apenas o contexto que mais sustentou a síntese. Em vez de listar tudo, a página mostra os sinais mais úteis para checar se a resposta se apoia em boas fontes.
              </p>
            </div>
            <div className="hwb__chips">
              <span className="hwb__chip">{view.retrieved_contexts.length} contextos</span>
              <span className="hwb__chip">{view.extraction_reports.length} extrações</span>
            </div>
          </div>

          <div className="hwb__evidence-grid">
            {view.distillation && (
              <article className="hwb__note hwb__note--evidence">
                <div className="hwb__section-head">
                  <span className="hwb__section-label">Distillation note</span>
                  <span className="hwb__section-meta">{view.distillation.mode}</span>
                </div>
                <div className="hwb__chips">
                  {view.distillation.key_entities.slice(0, 4).map((entity) => <span key={entity} className="hwb__chip">{entity}</span>)}
                  {view.distillation.key_topics.slice(0, 4).map((topic) => <span key={topic} className="hwb__chip hwb__chip--accent">{topic}</span>)}
                </div>
                <pre className="hwb__raw">{view.distillation.context_text}</pre>
              </article>
            )}

            {topContexts.map((item, index) => (
              <article key={`${item.id}-${index}`} className="hwb__note hwb__note--context">
                <div className="hwb__note-top">
                  <span className="hwb__note-tag">chunk {index + 1}</span>
                  <span className="hwb__note-meta">{Math.round(item.score * 100)} pts</span>
                </div>
                <h3 className="hwb__topic-title">{item.title}</h3>
                <p className="hwb__topic-copy">{item.excerpt}</p>
                <div className="hwb__chips">
                  {item.retrieval_mode && <span className="hwb__chip hwb__chip--accent">{formatModeLabel(item.retrieval_mode)}</span>}
                  {item.topics.slice(0, 3).map((topic) => <span key={`${item.id}-${topic}`} className="hwb__chip">{topic}</span>)}
                  {item.entities.slice(0, 2).map((entity) => <span key={`${item.id}-${entity}`} className="hwb__chip">{entity}</span>)}
                </div>
                <div className="hwb__source">{item.source_name}</div>
              </article>
            ))}

            {topExtractionReports.map((report, index) => (
              <article key={`${report.source_path}-${index}`} className="hwb__note hwb__note--context">
                <div className="hwb__note-top">
                  <span className="hwb__note-tag">extração PDF</span>
                  <span className="hwb__note-meta">{report.selected_engine || "sem engine"}</span>
                </div>
                <h3 className="hwb__topic-title">{report.file_name || `arquivo ${index + 1}`}</h3>
                <p className="hwb__topic-copy">
                  {report.used_monkeyocr ? "Extraído com MonkeyOCR." : "Extraído com parser padrão."}
                </p>
                <div className="hwb__chips">
                  {report.file_type && <span className="hwb__chip">{report.file_type}</span>}
                  {report.used_monkeyocr && <span className="hwb__chip hwb__chip--accent">MonkeyOCR</span>}
                  {report.attempts.map((attempt, attemptIndex) => (
                    <span key={`${report.source_path}-${attempt.engine}-${attemptIndex}`} className="hwb__chip">
                      {attempt.engine}: {attempt.success ? "ok" : "falhou"}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section id="board-related" className="hwb__board-section">
        <div className="hwb__board-head">
          <div>
            <span className="eyebrow">linked knowledge</span>
            <h2 className="hwb__board-title">Notas relacionadas</h2>
            <p className="hwb__board-copy">
              O resultado atual fica no centro do board, e as notas relacionadas aparecem como vizinhas semânticas para abrir outros runs e comparar padrões.
            </p>
          </div>
          <div className="hwb__chips">
            <span className="hwb__chip">{relatedItems.length} notas relacionadas</span>
            <span className="hwb__chip">{view.raw_output ? "raw output salvo" : "sem raw output"}</span>
          </div>
        </div>

        <div className="hwb__related-grid">
          {topRelatedItems.map((item) => (
            <RelatedNoteCard key={item.id} item={item} />
          ))}

          <article className="hwb__note hwb__note--raw">
            <details className="hwb__details">
              <summary className="hwb__details-summary">
                <span>Ver análise bruta do LLM</span>
                <span className="hwb__section-meta">expandir</span>
              </summary>
              <pre className="hwb__raw">{view.raw_output || audit.decision?.rationale || "Sem resposta textual salva."}</pre>
            </details>
          </article>
        </div>
      </section>
    </section>
  );
}

function RelatedNoteCard({ item }: { item: ResultRelatedAuditCard }) {
  return (
    <article className="hwb__note hwb__note--related">
      <div className="hwb__note-top">
        <span className="hwb__note-tag">{formatRelationKind(item.relation_kind)}</span>
        <span className="hwb__note-meta">{Math.round(item.relation_score * 100)}%</span>
      </div>
      <Link href={`/results/${encodeURIComponent(item.id)}`} className="hwb__related-link">
        {item.issue_key}
      </Link>
      <p className="hwb__topic-copy">{item.summary}</p>
      <div className="hwb__chips">
        <span className="hwb__chip">{item.provider}</span>
        {item.shared_topics.slice(0, 3).map((topic) => (
          <span key={`${item.id}-${topic}`} className="hwb__chip hwb__chip--accent">
            {topic}
          </span>
        ))}
      </div>
      {item.reasons.length > 0 && <div className="hwb__source">{item.reasons.slice(0, 2).join(" • ")}</div>}
    </article>
  );
}

function buildInboxNotes({
  missingCount,
  uploadedCount,
  warnings,
  nextSteps,
  relatedCount,
}: {
  missingCount: number;
  uploadedCount: number;
  warnings: string[];
  nextSteps: string[];
  relatedCount: number;
}): BoardNote[] {
  const notes: BoardNote[] = [];
  if (missingCount > 0) {
    notes.push({
      id: "extraction-gap",
      title: "Extração incompleta",
      body: `${missingCount} de ${uploadedCount} arquivos enviados ainda não geraram texto útil para o board final.`,
      tone: "warn",
    });
  }
  warnings.slice(0, 2).forEach((warning, index) => {
    notes.push({
      id: `warning-${index}`,
      title: index === 0 ? "Atenção do runtime" : "Sinal adicional",
      body: warning,
      tone: warning.toLowerCase().includes("human review") ? "warn" : "info",
    });
  });
  nextSteps.slice(0, 2).forEach((step, index) => {
    notes.push({
      id: `next-step-${index}`,
      title: "Próximo passo",
      body: step,
      tone: "accent",
    });
  });
  if (relatedCount > 0) {
    notes.push({
      id: "related",
      title: "Pontes semânticas",
      body: `${relatedCount} execuções relacionadas podem ser abertas como notas vizinhas deste board.`,
      tone: "accent",
    });
  }
  return notes.slice(0, 5);
}

function buildFallbackClusters(articleCards: ResultArticleCard[]): ResultThemeCluster[] {
  if (articleCards.length === 0) {
    return [
      {
        id: "cluster-empty",
        label: "Corpus",
        count: 0,
        summary: "Nenhum card foi gerado para este corpus.",
      },
    ];
  }

  const uniqueThemes = [...new Set(articleCards.map((card) => card.theme).filter(Boolean))];
  return uniqueThemes.slice(0, 4).map((theme) => ({
    id: `cluster-${slugify(theme)}`,
    label: theme,
    count: articleCards.filter((card) => slugify(card.theme) === slugify(theme)).length,
    summary: "Agrupamento derivado diretamente dos cards gerados pelo runtime.",
  }));
}

function groupCardsByTheme(articleCards: ResultArticleCard[]) {
  const grouped = new Map<string, ResultArticleCard[]>();
  articleCards.forEach((card) => {
    const key = slugify(card.theme || "corpus");
    const current = grouped.get(key) ?? [];
    current.push(card);
    grouped.set(key, current);
  });
  return grouped;
}

function formatModeLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function fileNameFromPath(value: string) {
  return value.replace(/\\/g, "/").split("/").pop() || value;
}

function buildCollectionExamples(articleCards: ResultArticleCard[], sourceFiles: string[]) {
  const examples = articleCards.length > 0
    ? articleCards.map((card) => card.title)
    : sourceFiles.map(fileNameFromPath);
  return examples.slice(0, 5).map((item) => truncateText(item, 96));
}

function buildMindMapNodes({
  summary,
  topIdeas,
  inboxNotes,
  topRisks,
  runtimeSummary,
  graphMode,
  topNextSteps,
  topics,
  collectionLabel,
  uploadedCount,
  extractedCount,
}: {
  summary: string;
  topIdeas: string[];
  inboxNotes: BoardNote[];
  topRisks: string[];
  runtimeSummary: string;
  graphMode: string;
  topNextSteps: string[];
  topics: string[];
  collectionLabel: string;
  uploadedCount: number;
  extractedCount: number;
}): MindMapNode[] {
  return [
    {
      id: "conclusion",
      title: "Conclusão",
      body: summarizeMindMapText(topIdeas[0] || summary, 92),
      href: "#board-overview",
      tone: "summary",
      x: 22,
      y: 18,
      edgeX: 34,
      edgeY: 31,
    },
    {
      id: "attention",
      title: "Atenção",
      body: summarizeMindMapText(inboxNotes[0]?.body || topRisks[0] || "Sem alertas salvos.", 92),
      href: "#board-overview",
      tone: "attention",
      x: 78,
      y: 19,
      edgeX: 67,
      edgeY: 31,
    },
    {
      id: "build",
      title: "Construção",
      body: summarizeMindMapText(graphMode ? `${runtimeSummary} Rota: ${formatModeLabel(graphMode)}.` : runtimeSummary, 92),
      href: "#board-evidence",
      tone: "build",
      x: 84,
      y: 47,
      edgeX: 70,
      edgeY: 48,
    },
    {
      id: "actions",
      title: "Próximos passos",
      body: summarizeMindMapText(topNextSteps[0] || "Sem próximos passos estruturados.", 92),
      href: "#board-overview",
      tone: "actions",
      x: 75,
      y: 78,
      edgeX: 64,
      edgeY: 66,
    },
    {
      id: "topics",
      title: "Temas dominantes",
      body: summarizeMindMapText(topics.slice(0, 3).join(" • ") || "Sem temas dominantes.", 92),
      href: "#board-topics",
      tone: "topics",
      x: 24,
      y: 79,
      edgeX: 36,
      edgeY: 66,
    },
    {
      id: "sources",
      title: "Corpus",
      body: summarizeMindMapText(`${collectionLabel} com ${uploadedCount > 0 ? `${extractedCount}/${uploadedCount}` : extractedCount} fontes úteis.`, 92),
      href: "#board-overview",
      tone: "sources",
      x: 13,
      y: 49,
      edgeX: 31,
      edgeY: 50,
    },
  ];
}

function formatRelationKind(value: ResultRelatedAuditCard["relation_kind"]) {
  switch (value) {
    case "duplicate_signal":
      return "candidato a duplicata";
    case "same-context":
      return "mesmo contexto";
    default:
      return "vizinho semântico";
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function summarizeMindMapText(value: string, maxLength: number) {
  return truncateText(
    value
      .replace(/\*\*/g, "")
      .replace(/^[\d]+[\.\)]\s*/, "")
      .replace(/\s+/g, " ")
      .trim(),
    maxLength,
  );
}
