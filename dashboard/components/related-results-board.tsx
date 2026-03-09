"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ResultRelatedAuditCard } from "@/lib/results-data";

interface RelatedResultsBoardProps {
  currentId: string;
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
};

export function RelatedResultsBoard({ currentId, items }: RelatedResultsBoardProps) {
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

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rrb">
      <div className="rrb__header">
        <div>
          <span className="eyebrow">smart correlation</span>
          <h2 className="rrb__title">Issues relacionadas automaticamente</h2>
          <p className="rrb__copy">
            O dashboard cruza componente, serviço, labels, tópicos e vocabulário técnico para sugerir runs que merecem análise conjunta.
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

      <div className="rrb__grid">
        {filtered.map((item) => {
          const relation = RELATION_META[item.relation_kind];
          const status = CLS_META[item.classification] ?? { label: item.classification, mod: "" };
          const pct = Math.round(item.relation_score * 100);
          return (
            <article key={item.id} className="rrb__card">
              <div className="rrb__card-head">
                <div>
                  <div className="rrb__issue-row">
                    <Link href={`/results/${encodeURIComponent(item.id)}`} className="rrb__issue-link">
                      {item.issue_key}
                    </Link>
                    <span className={`rrb__kind ${relation.mod}`}>{relation.label}</span>
                  </div>
                  <p className="rrb__summary">{item.summary}</p>
                </div>
                <div className="rrb__score">
                  <span>{pct}%</span>
                  <small>match</small>
                </div>
              </div>

              <div className="rrb__meta">
                <span className={`rrb__status ${status.mod}`}>{status.label}</span>
                <span className="rrb__meta-chip">{item.provider}</span>
                <span className="rrb__meta-chip">{item.generated_at}</span>
              </div>

              <div className="rrb__section">
                <h3>Razões da ligação</h3>
                <div className="rrb__chips">
                  {item.reasons.map((reason) => (
                    <span key={`${item.id}-${reason}`} className="rrb__chip">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>

              {item.shared_topics.length > 0 && (
                <div className="rrb__section">
                  <h3>Tópicos compartilhados</h3>
                  <div className="rrb__chips">
                    {item.shared_topics.map((topic) => (
                      <span key={`${item.id}-${topic}`} className="rrb__chip rrb__chip--accent">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rrb__foot">
                <Link href={`/results/${encodeURIComponent(item.id)}`} className="rrb__open-link">
                  Abrir resultado relacionado
                </Link>
                {item.id === currentId && <span className="rrb__self">resultado atual</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
