"use client";

import type { ResultAudit } from "@/lib/results-data";

interface ArticleAnalysisReportProps {
  audit: ResultAudit;
}

export function ArticleAnalysisReport({ audit }: ArticleAnalysisReportProps) {
  const view = audit.article_run;
  if (!view) return null;

  const sourceName = view.source
    ? view.source.replace(/\\/g, "/").split("/").pop() || view.source
    : "conteudo manual";

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
                {item.topics.length > 0 && (
                  <div className="aar__chips">
                    {item.topics.map((topic) => <span key={`${item.id}-${topic}`} className="aar__chip">{topic}</span>)}
                  </div>
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
    </section>
  );
}
