"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { ResultArticleCard, ResultRelatedAuditCard, ResultThemeCluster } from "@/lib/results-data";

interface ArticleSummaryBoardProps {
  title: string;
  summary: string;
  centralIdeas: string[];
  topics: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
  articleCards: ResultArticleCard[];
  themeClusters: ResultThemeCluster[];
  relatedItems: ResultRelatedAuditCard[];
}

export function ArticleSummaryBoard({
  title,
  summary,
  centralIdeas,
  topics,
  warnings,
  metadata,
  articleCards,
  themeClusters,
  relatedItems,
}: ArticleSummaryBoardProps) {
  const [query, setQuery] = useState("");
  const [themeFilter, setThemeFilter] = useState("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const sourceFiles = readStringArray(metadata.source_files);
  const sourceDocuments = Array.isArray(metadata.source_documents) ? metadata.source_documents : [];
  const uploadedCount = sourceFiles.length;
  const extractedCount = sourceDocuments.length || articleCards.length;
  const missingCount = Math.max(uploadedCount - extractedCount, 0);

  const filteredCards = useMemo(() => {
    return articleCards.filter((card) => {
      const matchesTheme = themeFilter === "all" || slugify(card.theme) === themeFilter;
      if (!matchesTheme) return false;
      if (!deferredQuery) return true;

      const haystack = [
        card.title,
        card.theme,
        card.summary,
        card.source_name,
        ...card.secondary_themes,
        ...card.linked_topic_ids,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredQuery);
    });
  }, [articleCards, deferredQuery, themeFilter]);

  const filteredClusters = useMemo(() => {
    const visibleIds = new Set(filteredCards.map((card) => card.id));
    return themeClusters.filter((cluster) =>
      articleCards.some((card) => visibleIds.has(card.id) && slugify(card.theme) === slugify(cluster.label)),
    );
  }, [articleCards, filteredCards, themeClusters]);

  const cardsByTheme = useMemo(() => {
    const grouped = new Map<string, ResultArticleCard[]>();
    filteredCards.forEach((card) => {
      const key = slugify(card.theme);
      const current = grouped.get(key) ?? [];
      current.push(card);
      grouped.set(key, current);
    });
    return grouped;
  }, [filteredCards]);

  const inboxNotes = useMemo(() => {
    const notes: Array<{ id: string; title: string; body: string; tone: "warn" | "info" | "accent" }> = [];
    if (missingCount > 0) {
      notes.push({
        id: "extraction-gap",
        title: "Inbox: extração incompleta",
        body: `${missingCount} de ${uploadedCount} PDFs enviados não produziram texto útil para o corpus final. Eles precisam de revisão ou parser mais forte antes de confiar na síntese.`,
        tone: "warn",
      });
    }
    warnings.forEach((warning, index) => {
      notes.push({
        id: `warning-${index}`,
        title: index === 0 ? "Inbox: atenção do runtime" : "Sinal adicional",
        body: warning,
        tone: warning.toLowerCase().includes("human review") ? "warn" : "info",
      });
    });
    if (relatedItems.length > 0) {
      notes.push({
        id: "related-notes",
        title: "Notas relacionadas",
        body: `${relatedItems.length} resultados relacionados foram ligados semanticamente ao board atual. Use o mapa abaixo para navegar por padrões recorrentes.`,
        tone: "accent",
      });
    }
    return notes.slice(0, 5);
  }, [missingCount, relatedItems.length, uploadedCount, warnings]);

  return (
    <section className="akb">
      <div className="akb__header">
        <div>
          <span className="eyebrow">knowledge board</span>
          <h2 className="akb__title">Whiteboard do corpus</h2>
          <p className="akb__copy">
            O board organiza a análise como notas espaciais: uma nota central com a tese do corpus, uma inbox para lacunas do runtime e sections por tema para navegar pelos PDFs como cards de conhecimento.
          </p>
        </div>
        <div className="akb__stats">
          <div className="akb__stat">
            <span className="akb__stat-value">{articleCards.length}</span>
            <span className="akb__stat-label">cards</span>
          </div>
          <div className="akb__stat">
            <span className="akb__stat-value">{themeClusters.length}</span>
            <span className="akb__stat-label">sections</span>
          </div>
          <div className="akb__stat">
            <span className="akb__stat-value">{uploadedCount > 0 ? `${extractedCount}/${uploadedCount}` : extractedCount}</span>
            <span className="akb__stat-label">extraídos</span>
          </div>
          <div className="akb__stat">
            <span className="akb__stat-value">{relatedItems.length}</span>
            <span className="akb__stat-label">links</span>
          </div>
        </div>
      </div>

      <div className="akb__toolbar">
        <input
          className="akb__search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por título, tema, técnica ou assunto..."
        />
        <div className="akb__filters">
          <button
            type="button"
            className={`akb__filter${themeFilter === "all" ? " akb__filter--active" : ""}`}
            onClick={() => setThemeFilter("all")}
          >
            Todos
          </button>
          {themeClusters.map((cluster) => {
            const filterId = slugify(cluster.label);
            return (
              <button
                key={cluster.id}
                type="button"
                className={`akb__filter${themeFilter === filterId ? " akb__filter--active" : ""}`}
                onClick={() => setThemeFilter(filterId)}
                title={cluster.summary}
              >
                {cluster.label} <span>{cluster.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="akb__board">
        <article className="akb__note akb__note--central">
          <div className="akb__note-top">
            <span className="akb__note-tag">nota central</span>
            <span className="akb__note-meta">{uploadedCount > 0 ? `${extractedCount}/${uploadedCount} PDFs úteis` : `${articleCards.length} PDFs úteis`}</span>
          </div>
          <h3 className="akb__note-title">{title}</h3>
          <p className="akb__note-copy">{summary}</p>
          {topics.length > 0 && (
            <div className="akb__chips">
              {topics.slice(0, 6).map((topic) => (
                <span key={`topic-${topic}`} className="akb__chip akb__chip--accent">{topic}</span>
              ))}
            </div>
          )}
          {centralIdeas.length > 0 && (
            <ul className="akb__list">
              {centralIdeas.slice(0, 4).map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
          )}
        </article>

        <aside className="akb__inbox">
          <div className="akb__section-head">
            <span className="akb__section-label">Inbox</span>
            <span className="akb__section-meta">{inboxNotes.length} nota(s)</span>
          </div>
          <div className="akb__inbox-list">
            {inboxNotes.map((note) => (
              <article key={note.id} className={`akb__note akb__note--inbox akb__note--${note.tone}`}>
                <h3 className="akb__note-title">{note.title}</h3>
                <p className="akb__note-copy">{note.body}</p>
              </article>
            ))}
            {inboxNotes.length === 0 && (
              <article className="akb__note akb__note--inbox">
                <h3 className="akb__note-title">Inbox limpa</h3>
                <p className="akb__note-copy">Nenhum aviso estrutural relevante foi registrado para este corpus.</p>
              </article>
            )}
          </div>
        </aside>
      </div>

      <div className="akb__sections">
        {filteredClusters.map((cluster) => {
          const cards = cardsByTheme.get(slugify(cluster.label)) ?? [];
          return (
            <section key={cluster.id} className="akb__section">
              <div className="akb__section-head">
                <div>
                  <span className="akb__section-label">{cluster.label}</span>
                  <p className="akb__section-copy">{cluster.summary}</p>
                </div>
                <span className="akb__section-meta">{cards.length}</span>
              </div>
              <div className="akb__cards">
                {cards.map((card) => (
                  <article key={card.id} className="akb__note akb__note--card">
                    <div className="akb__note-top">
                      <span className="akb__theme">{card.theme}</span>
                      <span className="akb__note-meta">{Math.round(card.confidence * 100)}%</span>
                    </div>
                    <h3 className="akb__note-title">{card.title}</h3>
                    <p className="akb__note-copy">{card.summary}</p>
                    <div className="akb__chips">
                      {card.linked_topic_ids.slice(0, 3).map((topic) => (
                        <span key={`${card.id}-${topic}`} className="akb__chip akb__chip--accent">{topic}</span>
                      ))}
                      {card.secondary_themes.slice(0, 2).map((theme) => (
                        <span key={`${card.id}-${theme}`} className="akb__chip">{theme}</span>
                      ))}
                    </div>
                    <div className="akb__source">{card.source_name}</div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {filteredCards.length === 0 && (
        <div className="akb__empty">
          Nenhum card corresponde ao filtro atual.
        </div>
      )}
    </section>
  );
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
