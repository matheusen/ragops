"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditSummary {
  id: string;
  issue_key: string;
  timestamp: string;
  summary: string;
  classification: "bug" | "not_bug" | "needs_review" | string;
  is_bug: boolean;
  is_complete: boolean;
  ready_for_dev: boolean;
  confidence: number;
  provider: string;
  requires_human_review: boolean;
  financial_impact_detected: boolean;
  generated_at: string;
}

const CLS_META: Record<string, { label: string; mod: string; icon: string }> = {
  bug:          { label: "Bug",           mod: "ris__badge--bug",    icon: "🐛" },
  not_bug:      { label: "Não é bug",     mod: "ris__badge--ok",     icon: "✅" },
  needs_review: { label: "Revisão",       mod: "ris__badge--warn",   icon: "⚠️" },
};

function fmt(iso: string) {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

function ConfDot({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="ris__conf" title={`Confiança: ${pct}%`}>
      <div className="ris__conf-track">
        <div className="ris__conf-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="ris__conf-pct" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResultsList({ items }: { items: AuditSummary[] }) {
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState<"all" | "bug" | "not_bug" | "needs_review">("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const filtered = useMemo(() => {
    let list = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.issue_key.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.provider.toLowerCase().includes(q),
      );
    }
    if (filter !== "all") list = list.filter((a) => a.classification === filter);
    list.sort((a, b) => {
      const cmp = a.generated_at.localeCompare(b.generated_at);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [items, search, filter, sortDir]);

  if (items.length === 0) {
    return (
      <div className="ris__empty">
        <div className="ris__empty-icon">📭</div>
        <div className="ris__empty-text">Nenhum resultado de auditoria encontrado.</div>
        <div className="ris__empty-sub">Execute o pipeline via a aba <strong>Run</strong> para gerar auditorias.</div>
      </div>
    );
  }

  return (
    <div className="ris">
      {/* toolbar */}
      <div className="ris__toolbar">
        <input
          className="ris__search"
          placeholder="Buscar por issue key, resumo ou provider…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ris__filters">
          {(["all", "bug", "not_bug", "needs_review"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`ris__filter ${filter === f ? "ris__filter--active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Todos" : (CLS_META[f]?.label ?? f)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ris__sort"
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          title="Trocar ordem"
        >
          {sortDir === "desc" ? "↓ Mais recente" : "↑ Mais antigo"}
        </button>
      </div>

      {/* count */}
      {filtered.length !== items.length && (
        <div className="ris__count">{filtered.length} de {items.length} resultado(s)</div>
      )}

      {/* list */}
      <div className="ris__list">
        {filtered.length === 0 ? (
          <div className="ris__no-match">Nenhum resultado para os filtros aplicados.</div>
        ) : (
          filtered.map((item) => {
            const cls = CLS_META[item.classification] ?? { label: item.classification, mod: "", icon: "?" };
            return (
              <Link
                key={item.id}
                href={`/results/${encodeURIComponent(item.id)}`}
                className="ris__card"
              >
                <div className="ris__card-head">
                  <span className="ris__issue-key">{item.issue_key}</span>
                  <span className={`ris__badge ${cls.mod}`}>{cls.icon} {cls.label}</span>
                  <span className="ris__date">{fmt(item.generated_at)}</span>
                </div>

                <div className="ris__summary">{item.summary || "—"}</div>

                <div className="ris__card-foot">
                  <ConfDot value={item.confidence} />
                  <div className="ris__chips">
                    {item.is_complete    && <span className="ris__chip ris__chip--ok">Completa</span>}
                    {!item.is_complete   && <span className="ris__chip ris__chip--warn">Incompleta</span>}
                    {item.ready_for_dev  && <span className="ris__chip ris__chip--ok">Pronta p/ dev</span>}
                    {item.requires_human_review && <span className="ris__chip ris__chip--danger">Revisão humana</span>}
                    {item.financial_impact_detected && <span className="ris__chip ris__chip--danger">Fin. impact</span>}
                  </div>
                  <span className="ris__provider">{item.provider}</span>
                  <div className="ris__arrow">→</div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
