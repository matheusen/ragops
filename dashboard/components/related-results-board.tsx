"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ResultRelatedAuditCard } from "@/lib/results-data";

interface RelatedResultsBoardProps {
  currentId: string;
  currentTitle: string;
  currentSummary: string;
  currentTopics: string[];
  items: ResultRelatedAuditCard[];
}

const RELATION_META: Record<ResultRelatedAuditCard["relation_kind"], { label: string; mod: string }> = {
  duplicate_signal: { label: "forte candidato a duplicata", mod: "rrb__kind--duplicate" },
  "same-context": { label: "mesmo contexto operacional", mod: "rrb__kind--context" },
  "semantic-neighbor": { label: "vizinho semântico", mod: "rrb__kind--semantic" },
};

const CLS_META: Record<string, { label: string; mod: string }> = {
  bug: { label: "Bug", mod: "rrb__status--bug" },
  not_bug: { label: "Não bug", mod: "rrb__status--ok" },
  needs_review: { label: "Revisão", mod: "rrb__status--warn" },
  article_analysis: { label: "Article analysis", mod: "rrb__status--context" },
};

type LayoutNode = {
  item: ResultRelatedAuditCard;
  x: number;
  y: number;
  edgeX: number;
  edgeY: number;
};

export function RelatedResultsBoard({
  currentId,
  currentTitle,
  currentSummary,
  currentTopics,
  items,
}: RelatedResultsBoardProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [
        item.issue_key,
        item.summary,
        ...item.reasons,
        ...item.shared_topics,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [items, query]);

  const strongestTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const topic of item.shared_topics) {
        counts.set(topic, (counts.get(topic) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([topic]) => topic);
  }, [items]);

  const layout = useMemo(() => buildMindMapLayout(filtered), [filtered]);

  if (items.length === 0) {
    return null;
  }

  const currentTopicChips = currentTopics.length > 0 ? currentTopics : strongestTopics.slice(0, 4);

  return (
    <section className="rrb">
      <div className="rrb__header">
        <div>
          <span className="eyebrow">smart correlation</span>
          <h2 className="rrb__title">Mapa de correlações entre notas</h2>
          <p className="rrb__copy">
            O resultado atual vira a nota central. As notas vizinhas são conectadas por afinidade semântica, contexto compartilhado e tópicos em comum, no estilo de um mapa de pensamento navegável.
          </p>
        </div>
        <div className="rrb__stats">
          <div className="rrb__stat">
            <span className="rrb__stat-value">{items.length}</span>
            <span className="rrb__stat-label">correlações</span>
          </div>
          <div className="rrb__stat">
            <span className="rrb__stat-value">{filtered.length}</span>
            <span className="rrb__stat-label">visíveis</span>
          </div>
          <div className="rrb__stat">
            <span className="rrb__stat-value">{strongestTopics.length}</span>
            <span className="rrb__stat-label">pontes</span>
          </div>
        </div>
      </div>

      <div className="rrb__toolbar">
        <input
          className="rrb__search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por issue, razão ou tópico..."
        />
      </div>

      <div className="rrb__topic-rail">
        {strongestTopics.map((topic) => (
          <span key={topic} className="rrb__chip rrb__chip--accent">{topic}</span>
        ))}
      </div>

      <section className="rrb__canvas" aria-label="Mind map de correlações">
        <svg className="rrb__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {layout.map(({ item, edgeX, edgeY }) => {
            const relation = RELATION_META[item.relation_kind];
            return (
              <line
                key={`line-${item.id}`}
                x1="50"
                y1="50"
                x2={String(edgeX)}
                y2={String(edgeY)}
                className={`rrb__link ${relation.mod}`}
              />
            );
          })}
        </svg>

        <article className="rrb__note rrb__note--center">
          <div className="rrb__note-top">
            <span className="rrb__center-label">nota central</span>
            <span className="rrb__meta-chip">{currentId.split("__")[0]}</span>
          </div>
          <h3 className="rrb__note-title">{currentTitle}</h3>
          <p className="rrb__note-copy">{currentSummary}</p>
          {currentTopicChips.length > 0 && (
            <div className="rrb__chips">
              {currentTopicChips.map((topic) => (
                <span key={`center-${topic}`} className="rrb__chip rrb__chip--accent">{topic}</span>
              ))}
            </div>
          )}
        </article>

        {layout.map(({ item, x, y }) => {
          const relation = RELATION_META[item.relation_kind];
          const status = CLS_META[item.classification] ?? { label: item.classification, mod: "" };
          const pct = Math.round(item.relation_score * 100);
          const bridgeLabel = item.shared_topics[0] || item.reasons[0] || relation.label;
          return (
            <article
              key={item.id}
              className="rrb__note rrb__note--orbit"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className="rrb__note-top">
                <span className={`rrb__kind ${relation.mod}`}>{relation.label}</span>
                <span className="rrb__score-badge">{pct}%</span>
              </div>
              <div className="rrb__bridge-label">{bridgeLabel}</div>
              <Link href={`/results/${encodeURIComponent(item.id)}`} className="rrb__issue-link">
                {item.issue_key}
              </Link>
              <p className="rrb__summary">{item.summary}</p>
              <div className="rrb__meta">
                <span className={`rrb__status ${status.mod}`}>{status.label}</span>
                <span className="rrb__meta-chip">{item.provider}</span>
              </div>
              {item.shared_topics.length > 0 && (
                <div className="rrb__chips">
                  {item.shared_topics.slice(0, 4).map((topic) => (
                    <span key={`${item.id}-${topic}`} className="rrb__chip rrb__chip--accent">{topic}</span>
                  ))}
                </div>
              )}
              {item.reasons.length > 0 && (
                <div className="rrb__reason-list">
                  {item.reasons.slice(0, 2).map((reason) => (
                    <span key={`${item.id}-${reason}`} className="rrb__chip">{reason}</span>
                  ))}
                </div>
              )}
              <div className="rrb__foot">
                <Link href={`/results/${encodeURIComponent(item.id)}`} className="rrb__open-link">
                  Abrir nota relacionada
                </Link>
                {item.id === currentId && <span className="rrb__self">resultado atual</span>}
              </div>
            </article>
          );
        })}
      </section>
    </section>
  );
}

function buildMindMapLayout(items: ResultRelatedAuditCard[]): LayoutNode[] {
  const sorted = [...items].sort((left, right) => right.relation_score - left.relation_score);
  const ringLimits = [6, 12, 20];
  const radii = [
    { x: 28, y: 24 },
    { x: 39, y: 32 },
    { x: 46, y: 39 },
  ];

  const layout: LayoutNode[] = [];
  let startIndex = 0;
  ringLimits.forEach((limit, ringIndex) => {
    if (startIndex >= sorted.length) return;
    const ringItems = sorted.slice(startIndex, Math.min(sorted.length, limit));
    const count = ringItems.length;
    ringItems.forEach((item, index) => {
      const angle = (-90 + (360 / count) * index) * (Math.PI / 180);
      const radius = radii[ringIndex] ?? radii[radii.length - 1];
      const x = 50 + Math.cos(angle) * radius.x;
      const y = 50 + Math.sin(angle) * radius.y;
      const edgeX = 50 + Math.cos(angle) * (radius.x * 0.82);
      const edgeY = 50 + Math.sin(angle) * (radius.y * 0.82);
      layout.push({ item, x, y, edgeX, edgeY });
    });
    startIndex = limit;
  });

  if (startIndex < sorted.length) {
    const overflow = sorted.slice(startIndex);
    overflow.forEach((item, index) => {
      const angle = (-90 + (360 / overflow.length) * index) * (Math.PI / 180);
      const x = 50 + Math.cos(angle) * 47;
      const y = 50 + Math.sin(angle) * 41;
      layout.push({ item, x, y, edgeX: 50 + Math.cos(angle) * 39, edgeY: 50 + Math.sin(angle) * 34 });
    });
  }

  return layout;
}
