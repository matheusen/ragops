"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { ResultArticleCard, ResultThemeCluster } from "@/lib/results-data";

interface ArticleSummaryBoardProps {
  articleCards: ResultArticleCard[];
  themeClusters: ResultThemeCluster[];
}

export function ArticleSummaryBoard({
  articleCards,
  themeClusters,
}: ArticleSummaryBoardProps) {
  const [query, setQuery] = useState("");
  const [themeFilter, setThemeFilter] = useState("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

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
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredQuery);
    });
  }, [articleCards, deferredQuery, themeFilter]);

  return (
    <section className="asb">
      <div className="asb__header">
        <div>
          <span className="eyebrow">article cards</span>
          <h2 className="asb__title">Resumo navegável de todos os artigos</h2>
          <p className="asb__copy">
            Cada card representa um PDF analisado. Use os clusters para percorrer o corpus por assunto.
          </p>
        </div>
        <div className="asb__stats">
          <div className="asb__stat">
            <span className="asb__stat-value">{articleCards.length}</span>
            <span className="asb__stat-label">artigos</span>
          </div>
          <div className="asb__stat">
            <span className="asb__stat-value">{themeClusters.length}</span>
            <span className="asb__stat-label">clusters</span>
          </div>
          <div className="asb__stat">
            <span className="asb__stat-value">{filteredCards.length}</span>
            <span className="asb__stat-label">visíveis</span>
          </div>
        </div>
      </div>

      <div className="asb__toolbar">
        <input
          className="asb__search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por título, tema ou assunto..."
        />
        <div className="asb__filters">
          <button
            type="button"
            className={`asb__filter${themeFilter === "all" ? " asb__filter--active" : ""}`}
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
                className={`asb__filter${themeFilter === filterId ? " asb__filter--active" : ""}`}
                onClick={() => setThemeFilter(filterId)}
                title={cluster.summary}
              >
                {cluster.label} <span>{cluster.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="asb__cluster-strip">
        {themeClusters.map((cluster) => (
          <article key={cluster.id} className="asb__cluster-card">
            <div className="asb__cluster-top">
              <span className="asb__cluster-name">{cluster.label}</span>
              <span className="asb__cluster-count">{cluster.count}</span>
            </div>
            <p className="asb__cluster-copy">{cluster.summary}</p>
          </article>
        ))}
      </div>

      <div className="asb__grid">
        {filteredCards.map((card) => (
          <article key={card.id} className="asb__card">
            <div className="asb__card-head">
              <span className="asb__theme">{card.theme}</span>
              <span className="asb__confidence">{Math.round(card.confidence * 100)}%</span>
            </div>
            <h3 className="asb__card-title">{card.title}</h3>
            <p className="asb__card-summary">{card.summary}</p>
            <div className="asb__chips">
              {card.secondary_themes.map((theme) => (
                <span key={`${card.id}-${theme}`} className="asb__chip">
                  {theme}
                </span>
              ))}
              {card.linked_topic_ids.map((topicId) => (
                <span key={`${card.id}-${topicId}`} className="asb__chip asb__chip--accent">
                  {topicId}
                </span>
              ))}
            </div>
            <div className="asb__card-foot">
              <span className="asb__source">{card.source_name}</span>
            </div>
          </article>
        ))}
      </div>

      {filteredCards.length === 0 && (
        <div className="asb__empty">
          Nenhum artigo corresponde ao filtro atual.
        </div>
      )}
    </section>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
