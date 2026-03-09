"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AuditSummary } from "@/lib/results-data";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "list" | "table" | "sections" | "projects";

const CLS_META: Record<string, { label: string; mod: string; icon: string; section: string }> = {
  bug:          { label: "Bug",        mod: "ris__badge--bug",  icon: "🐛", section: "Bugs Confirmados"   },
  not_bug:      { label: "Não é bug",  mod: "ris__badge--ok",   icon: "✅", section: "Falsos Positivos"   },
  needs_review: { label: "Revisão",    mod: "ris__badge--warn", icon: "⚠️", section: "Precisam de Revisão" },
  article_analysis: { label: "Artigo", mod: "ris__badge--info", icon: "📰", section: "Análises de Artigo" },
};

const SECTION_ORDER = ["Análises de Artigo", "Bugs Confirmados", "Precisam de Revisão", "Falsos Positivos"];

function fmt(iso: string) {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch { return iso; }
}

function fmtPct(v: number) { return `${Math.round(v * 100)}%`; }

function projectOf(issueKey: string) {
  const m = issueKey.match(/^([A-Z]+)-/);
  return m ? m[1] : "OTHER";
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

// ── Shared card ───────────────────────────────────────────────────────────────

function AuditCard({ item }: { item: AuditSummary }) {
  const cls = CLS_META[item.classification] ?? { label: item.classification, mod: "", icon: "?", section: "" };
  return (
    <Link key={item.id} href={`/results/${encodeURIComponent(item.id)}`} className="ris__card">
      <div className="ris__card-head">
        <span className="ris__issue-key">{item.issue_key}</span>
        <span className={`ris__badge ${cls.mod}`}>{cls.icon} {cls.label}</span>
        {item.data_source === "mock" && (
          <span className="ris__badge ris__badge--mock">mock canvas</span>
        )}
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
}

// ── Table view ────────────────────────────────────────────────────────────────

function TableView({ items }: { items: AuditSummary[] }) {
  const [colFilter, setColFilter] = useState<Record<string, string>>({});

  const displayed = useMemo(() => {
    let list = [...items];
    for (const [col, val] of Object.entries(colFilter)) {
      if (!val) continue;
      list = list.filter((a) => {
        const v = (a as unknown as Record<string, unknown>)[col];
        return String(v ?? "").toLowerCase().includes(val.toLowerCase());
      });
    }
    return list;
  }, [items, colFilter]);

  function setCol(col: string, v: string) {
    setColFilter((prev) => ({ ...prev, [col]: v }));
  }

  return (
    <div className="ris__table-wrap">
      <table className="ris__table">
        <thead>
          <tr>
            {["issue_key","classification","confidence","provider","is_complete","ready_for_dev","requires_human_review","financial_impact_detected","generated_at"].map((col) => (
              <th key={col}>
                <div className="ris__th-inner">
                  <span className="ris__th-label">{col.replace(/_/g," ")}</span>
                  <input
                    className="ris__th-filter"
                    placeholder="filtrar…"
                    value={colFilter[col] ?? ""}
                    onChange={(e) => setCol(col, e.target.value)}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map((item) => {
            const cls = CLS_META[item.classification] ?? { label: item.classification, mod: "", icon: "?" };
            return (
              <tr key={item.id} className="ris__tr">
                <td>
                  <Link href={`/results/${encodeURIComponent(item.id)}`} className="ris__td-link">
                    {item.issue_key}
                  </Link>
                </td>
                <td><span className={`ris__badge ${cls.mod}`}>{cls.icon} {cls.label}</span></td>
                <td className="ris__td-num">
                  <ConfDot value={item.confidence} />
                </td>
                <td className="ris__td-mono">{item.provider}</td>
                <td className="ris__td-bool">{item.is_complete ? "✅" : "❌"}</td>
                <td className="ris__td-bool">{item.ready_for_dev ? "✅" : "❌"}</td>
                <td className="ris__td-bool">{item.requires_human_review ? "⚠️" : "—"}</td>
                <td className="ris__td-bool">{item.financial_impact_detected ? "⚠️" : "—"}</td>
                <td className="ris__td-date">{fmt(item.generated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {displayed.length === 0 && (
        <div className="ris__no-match">Nenhuma linha para os filtros aplicados.</div>
      )}
      <div className="ris__table-footer">{displayed.length} de {items.length} registros</div>
    </div>
  );
}

// ── Sections view ─────────────────────────────────────────────────────────────

function SectionsView({ items }: { items: AuditSummary[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, AuditSummary[]>();
    for (const item of items) {
      const section = CLS_META[item.classification]?.section ?? item.classification;
      const arr = map.get(section) ?? [];
      arr.push(item);
      map.set(section, arr);
    }
    return map;
  }, [items]);

  const sections = SECTION_ORDER.filter((s) => grouped.has(s));
  const rest = [...grouped.keys()].filter((s) => !SECTION_ORDER.includes(s));

  const renderSection = (section: string) => {
    const list = grouped.get(section) ?? [];
    const isCollapsed = collapsed[section];
    const badge = list.length;
    return (
      <div key={section} className="ris__section">
        <button
          type="button"
          className="ris__section-header"
          onClick={() => setCollapsed((p) => ({ ...p, [section]: !p[section] }))}
        >
          <span className="ris__section-toggle">{isCollapsed ? "▶" : "▼"}</span>
          <span className="ris__section-title">{section}</span>
          <span className="ris__section-count">{badge}</span>
        </button>
        {!isCollapsed && (
          <div className="ris__section-body">
            {list.map((item) => <AuditCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="ris__sections">
      {[...sections, ...rest].map(renderSection)}
    </div>
  );
}

// ── Projects view ─────────────────────────────────────────────────────────────

function ProjectsView({ items }: { items: AuditSummary[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, AuditSummary[]>();
    for (const item of items) {
      const proj = projectOf(item.issue_key);
      const arr = map.get(proj) ?? [];
      arr.push(item);
      map.set(proj, arr);
    }
    return map;
  }, [items]);

  const projects = [...grouped.keys()].sort();

  return (
    <div className="ris__sections">
      {projects.map((proj) => {
        const list = grouped.get(proj) ?? [];
        const isCollapsed = collapsed[proj];
        const bugCount = list.filter((a) => a.classification === "bug").length;
        const stats = `${bugCount} bug${bugCount !== 1 ? "s" : ""} · ${list.length} issues`;
        return (
          <div key={proj} className="ris__section ris__section--project">
            <button
              type="button"
              className="ris__section-header ris__section-header--project"
              onClick={() => setCollapsed((p) => ({ ...p, [proj]: !p[proj] }))}
            >
              <span className="ris__section-toggle">{isCollapsed ? "▶" : "▼"}</span>
              <span className="ris__proj-badge">{proj}</span>
              <span className="ris__section-title">{stats}</span>
              <span className="ris__section-count">{list.length}</span>
            </button>
            {!isCollapsed && (
              <div className="ris__section-body">
                {list.map((item) => <AuditCard key={item.id} item={item} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── View toggle ───────────────────────────────────────────────────────────────

const VIEW_MODES: Array<{ id: ViewMode; label: string; icon: string }> = [
  { id: "list",     label: "Lista",    icon: "☰"  },
  { id: "table",    label: "Tabela",   icon: "⊞"  },
  { id: "sections", label: "Seções",   icon: "⊟"  },
  { id: "projects", label: "Projetos", icon: "🗂" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function ResultsList({ items }: { items: AuditSummary[] }) {
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState<"all" | "bug" | "not_bug" | "needs_review">("all");
  const [sortDir,  setSortDir]  = useState<"desc" | "asc">("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

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
        {/* View mode toggle */}
        <div className="ris__view-toggle">
          {VIEW_MODES.map((vm) => (
            <button
              key={vm.id}
              type="button"
              className={`ris__view-btn ${viewMode === vm.id ? "ris__view-btn--active" : ""}`}
              title={vm.label}
              onClick={() => setViewMode(vm.id)}
            >
              {vm.icon}
            </button>
          ))}
        </div>
      </div>

      {/* count */}
      {filtered.length !== items.length && (
        <div className="ris__count">{filtered.length} de {items.length} resultado(s)</div>
      )}

      {/* render by view mode */}
      {filtered.length === 0 ? (
        <div className="ris__no-match">Nenhum resultado para os filtros aplicados.</div>
      ) : viewMode === "table" ? (
        <TableView items={filtered} />
      ) : viewMode === "sections" ? (
        <SectionsView items={filtered} />
      ) : viewMode === "projects" ? (
        <ProjectsView items={filtered} />
      ) : (
        <div className="ris__list">
          {filtered.map((item) => <AuditCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
