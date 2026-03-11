"use client";

import type { ResultAudit } from "@/lib/results-data";

interface ArticleAnalysisReportProps {
  audit: ResultAudit;
}

export function ArticleAnalysisReport({ audit }: ArticleAnalysisReportProps) {
  const view = audit.article_run;
  if (!view) return null;

  const decision = audit.decision;
  const sourceName = view.source
    ? view.source.replace(/\\/g, "/").split("/").pop() || view.source
    : "conteudo manual";
  const graphAssessment = view.graph_assessment ?? view.benchmark?.graph_usefulness ?? null;

  const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
  const formatModeLabel = (value: string) => value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return (
    <section className="aar">
      <div className="aar__hero">
        <div>
          <span className="eyebrow">article analysis</span>
          <h2 className="aar__title">{view.title}</h2>
          <p className="aar__copy">
            Esta secao mostra de forma direta o que o provider respondeu sobre o artigo, sem misturar com o canvas tecnico.
          </p>
        </div>
        <div className="aar__meta">
          <span className="aar__chip aar__chip--accent">{view.provider}</span>
          <span className="aar__chip">{view.model}</span>
          <span className="aar__chip">{view.prompt_name}</span>
          <span className="aar__chip">{sourceName}</span>
          {decision && <span className="aar__chip">confidence {formatPercent(decision.confidence)}</span>}
          {decision?.requires_human_review && <span className="aar__chip aar__chip--accent">revisao humana</span>}
          {graphAssessment?.mode && <span className="aar__chip">{formatModeLabel(graphAssessment.mode)}</span>}
        </div>
      </div>

      <div className="aar__grid">
        <article className="aar__card aar__card--summary">
          <div className="aar__label">Resumo executivo</div>
          <p className="aar__summary">{view.executive_summary}</p>
        </article>

        <article className="aar__card">
          <div className="aar__label">Ideias centrais</div>
          {view.central_ideas.length > 0 ? (
            <ul className="aar__list">
              {view.central_ideas.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p className="aar__empty">O output nao trouxe uma lista explicita de ideias centrais.</p>
          )}
        </article>

        <article className="aar__card">
          <div className="aar__label">Riscos ou pontos fracos</div>
          {view.risks.length > 0 ? (
            <ul className="aar__list">
              {view.risks.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p className="aar__empty">Nenhum risco explicito foi destacado pelo modelo.</p>
          )}
        </article>

        <article className="aar__card">
          <div className="aar__label">Recomendacoes e proximos passos</div>
          {view.next_steps.length > 0 ? (
            <ul className="aar__list">
              {view.next_steps.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : (
            <p className="aar__empty">Nao houve proximos passos estruturados na resposta.</p>
          )}
        </article>

        {graphAssessment && (
          <article className="aar__card">
            <div className="aar__label">Graph usefulness gate</div>
            <div className="aar__chips">
              <span className="aar__chip aar__chip--accent">{formatModeLabel(graphAssessment.mode)}</span>
              <span className="aar__chip">score {formatPercent(graphAssessment.score)}</span>
              {graphAssessment.signals.map((signal) => <span key={signal} className="aar__chip">{signal}</span>)}
            </div>
            <p className="aar__summary aar__summary--sm">
              {graphAssessment.rationale || "Sem racional adicional salvo para o gate de grafo."}
            </p>
          </article>
        )}

        {view.benchmark && (
          <article className="aar__card">
            <div className="aar__label">Benchmark de retrieval</div>
            <div className="aar__chips">
              <span className="aar__chip aar__chip--accent">
                recomendado: {formatModeLabel(view.benchmark.recommended_mode)}
              </span>
              {view.benchmark.query && <span className="aar__chip">query: {view.benchmark.query}</span>}
            </div>
            {view.benchmark.scenarios.length > 0 ? (
              <ul className="aar__list">
                {view.benchmark.scenarios.map((scenario) => (
                  <li key={`${scenario.mode}-${scenario.retrieval_mode}`}>
                    {formatModeLabel(scenario.mode)} | {Math.round(scenario.latency_ms)} ms | {scenario.result_count} hits
                  </li>
                ))}
              </ul>
            ) : (
              <p className="aar__empty">Nenhum cenario de benchmark foi salvo.</p>
            )}
          </article>
        )}
      </div>

      <div className="aar__split">
        <article className="aar__card">
          <div className="aar__label">Trecho do artigo analisado</div>
          <p className="aar__excerpt">{view.content_excerpt || "Sem trecho salvo."}</p>
        </article>

        <article className="aar__card">
          <div className="aar__label">Resposta bruta do modelo</div>
          <pre className="aar__raw">{view.raw_output || audit.decision?.rationale || "Sem resposta textual salva."}</pre>
        </article>
      </div>

      {view.extraction_reports.length > 0 && (
        <article className="aar__card">
          <div className="aar__label">Inspeção da extração do PDF</div>
          <div className="aar__context-grid">
            {view.extraction_reports.map((report, index) => (
              <article key={`${report.source_path}-${index}`} className="aar__context-card">
                <div className="aar__context-top">
                  <h3>{report.file_name || `arquivo ${index + 1}`}</h3>
                  <span>{report.selected_engine || "sem engine"}</span>
                </div>
                <div className="aar__chips">
                  {report.used_monkeyocr && <span className="aar__chip aar__chip--accent">MonkeyOCR</span>}
                  {report.file_type && <span className="aar__chip">{report.file_type}</span>}
                  {report.output_dir && <span className="aar__chip">{report.output_dir}</span>}
                </div>
                {report.files.length > 0 && (
                  <ul className="aar__list">
                    {report.files.map((file) => <li key={`${report.source_path}-${file}`}>{file}</li>)}
                  </ul>
                )}
                {report.attempts.length > 0 && (
                  <ul className="aar__list">
                    {report.attempts.map((attempt, attemptIndex) => (
                      <li key={`${report.source_path}-${attempt.engine}-${attemptIndex}`}>
                        {attempt.engine}: {attempt.success ? "ok" : "falhou"}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </article>
      )}

      {view.distillation && (
        <article className="aar__card">
          <div className="aar__label">Small-model distillation</div>
          <div className="aar__chips">
            <span className="aar__chip aar__chip--accent">{view.distillation.mode}</span>
            {view.distillation.key_entities.map((entity) => <span key={entity} className="aar__chip">{entity}</span>)}
            {view.distillation.key_topics.map((topic) => <span key={topic} className="aar__chip">{topic}</span>)}
          </div>
          <pre className="aar__raw">{view.distillation.context_text}</pre>
          {view.distillation.evidence_paths.length > 0 && (
            <ul className="aar__list">
              {view.distillation.evidence_paths.map((path) => (
                <li key={path.path_id}>
                  {path.summary || `${path.relation}: ${path.nodes.join(" -> ")}`}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      {(view.search_query || view.retrieved_contexts.length > 0) && (
        <div className="aar__context">
          <div className="aar__context-head">
            <div className="aar__label">Contexto recuperado</div>
            {view.search_query && <span className="aar__chip">query: {view.search_query}</span>}
          </div>
          <div className="aar__context-grid">
            {view.retrieved_contexts.map((item, index) => (
              <article key={`${item.id}-${item.source_name}-${index}`} className="aar__context-card">
                <div className="aar__context-top">
                  <h3>{item.title}</h3>
                  <span>{Math.round(item.score * 100)} pts</span>
                </div>
                <p>{item.excerpt}</p>
                {(item.topics.length > 0 || item.entities.length > 0 || item.retrieval_mode) && (
                  <div className="aar__chips">
                    {item.topics.map((topic) => <span key={`${item.id}-${topic}`} className="aar__chip">{topic}</span>)}
                    {item.entities.map((entity) => <span key={`${item.id}-${entity}`} className="aar__chip">{entity}</span>)}
                    {item.chunk_kind && <span className="aar__chip">{item.chunk_kind}</span>}
                    {item.page_number !== null && <span className="aar__chip">page {item.page_number}</span>}
                    {item.section_title && <span className="aar__chip">{item.section_title}</span>}
                    {item.retrieval_mode && <span className="aar__chip aar__chip--accent">{formatModeLabel(item.retrieval_mode)}</span>}
                  </div>
                )}
                {item.evidence_paths.length > 0 && (
                  <ul className="aar__list">
                    {item.evidence_paths.map((path) => (
                      <li key={path.path_id}>
                        {path.summary || `${path.relation}: ${path.nodes.join(" -> ")}`}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {view.warnings.length > 0 && (
        <article className="aar__card">
          <div className="aar__label">Warnings do runtime</div>
          <ul className="aar__list">
            {view.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </article>
      )}

      {decision?.next_action && (
        <article className="aar__card">
          <div className="aar__label">Proxima acao recomendada</div>
          <p className="aar__summary aar__summary--sm">{decision.next_action}</p>
        </article>
      )}
    </section>
  );
}
