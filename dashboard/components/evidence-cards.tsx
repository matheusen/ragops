"use client";

import { useState } from "react";
import type { ResultAudit } from "@/lib/results-data";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvidenceCard {
  id: string;
  kind: "artifact" | "retrieved" | "rule" | "missing" | "contradiction";
  icon: string;
  title: string;
  subtitle: string;
  body: string;
  badge?: string;
  badgeMod?: string;
  score?: number;
}

const KIND_META: Record<EvidenceCard["kind"], { section: string; color: string; bg: string }> = {
  artifact:      { section: "Artefatos Processados",  color: "#f97316", bg: "#fff7ed" },
  retrieved:     { section: "Evidências Recuperadas", color: "#10b981", bg: "#d1fae5" },
  rule:          { section: "Resultados de Regras",   color: "#06b6d4", bg: "#ecfeff" },
  missing:       { section: "Itens Faltantes",        color: "#f59e0b", bg: "#fffbeb" },
  contradiction: { section: "Contradições",           color: "#ef4444", bg: "#fef2f2" },
};

const SECTION_ORDER: EvidenceCard["kind"][] = [
  "artifact", "retrieved", "rule", "missing", "contradiction",
];

// ── Build cards from audit ────────────────────────────────────────────────────

function buildCards(audit: ResultAudit): EvidenceCard[] {
  const cards: EvidenceCard[] = [];

  // Artifacts
  for (const a of audit.attachment_facts?.artifacts ?? []) {
    const factKeys = Object.keys(a.facts ?? {}).slice(0, 3).join(", ");
    const extraction = (a.facts as Record<string, unknown> | undefined)?.pdf_extraction as Record<string, unknown> | undefined;
    const extractionEngine = typeof extraction?.selected_engine === "string" ? extraction.selected_engine : "";
    const extractionOutputDir = typeof extraction?.output_dir === "string" ? extraction.output_dir : "";
    const extractionFiles = Array.isArray(extraction?.files)
      ? extraction.files.filter((file): file is string => typeof file === "string")
      : [];
    const extractionSummary = [
      extractionEngine ? `engine: ${extractionEngine}` : "",
      extractionOutputDir ? `output: ${extractionOutputDir}` : "",
      extractionFiles.length ? `files: ${extractionFiles.slice(0, 3).join(", ")}` : "",
    ].filter(Boolean).join(" | ");
    cards.push({
      id: `artifact-${a.artifact_id}`,
      kind: "artifact",
      icon: a.artifact_type === "pdf" ? "📄" : a.artifact_type === "image" ? "🖼️" : a.artifact_type === "xlsx" ? "📊" : "📝",
      title: a.source_path.split(/[/\\]/).pop() ?? a.artifact_id,
      subtitle: `${a.artifact_type.toUpperCase()} · confiança ${Math.round(a.confidence * 100)}%${extractionEngine ? ` · ${extractionEngine}` : ""}`,
      body: [extractionSummary, a.extracted_text?.slice(0, 200) || factKeys || "Sem texto extraído."].filter(Boolean).join("\n\n"),
      badge: a.artifact_type,
      badgeMod: "ev__badge--artifact",
      score: a.confidence,
    });
  }

  // Retrieved evidence
  for (const r of audit.retrieved ?? []) {
    cards.push({
      id: `retrieved-${r.evidence_id}`,
      kind: "retrieved",
      icon: "🔍",
      title: r.source,
      subtitle: `Categoria: ${r.metadata?.category ?? "—"} · score ${r.final_score.toFixed(3)}`,
      body: r.content?.slice(0, 200) ?? "—",
      badge: r.metadata?.type ?? r.metadata?.category,
      badgeMod: "ev__badge--retrieved",
      score: r.final_score,
    });
  }

  // Rule results
  for (const rule of audit.rule_evaluation?.results ?? []) {
    const isWarn = rule.severity === "warning";
    cards.push({
      id: `rule-${rule.rule_name}`,
      kind: "rule",
      icon: "📏",
      title: rule.rule_name.replace(/_/g, " "),
      subtitle: `Severidade: ${rule.severity}`,
      body: rule.message,
      badge: rule.severity,
      badgeMod: isWarn ? "ev__badge--warn" : "ev__badge--ok",
    });
  }

  // Missing items
  for (const [i, m] of (audit.rule_evaluation?.missing_items ?? []).entries()) {
    cards.push({
      id: `missing-${i}`,
      kind: "missing",
      icon: "❓",
      title: m,
      subtitle: "Item obrigatório ausente",
      body: m,
      badge: "missing",
      badgeMod: "ev__badge--warn",
    });
  }

  // Contradictions
  for (const [i, c] of (audit.rule_evaluation?.contradictions ?? []).entries()) {
    cards.push({
      id: `contradiction-${i}`,
      kind: "contradiction",
      icon: "⚡",
      title: `Contradição ${i + 1}`,
      subtitle: "Conflito entre fontes",
      body: c,
      badge: "contradiction",
      badgeMod: "ev__badge--danger",
    });
  }

  return cards;
}

// ── Single card ───────────────────────────────────────────────────────────────

function EvCard({ card }: { card: EvidenceCard }) {
  const [expanded, setExpanded] = useState(false);
  const meta = KIND_META[card.kind];
  return (
    <article
      className="ev__card"
      style={{ borderColor: meta.color, background: meta.bg }}
      tabIndex={0}
    >
      <div className="ev__card-head">
        <span className="ev__card-icon">{card.icon}</span>
        <div className="ev__card-titles">
          <div className="ev__card-title">{card.title}</div>
          <div className="ev__card-sub">{card.subtitle}</div>
        </div>
        {card.badge && (
          <span className={`ev__badge ${card.badgeMod ?? ""}`}>{card.badge}</span>
        )}
        {card.score !== undefined && (
          <div
            className="ev__score-dot"
            style={{
              background: card.score >= 0.8 ? "#16a34a" : card.score >= 0.5 ? "#d97706" : "#dc2626",
            }}
            title={`Score: ${(card.score * 100).toFixed(0)}%`}
          />
        )}
      </div>
      <p className="ev__card-body">{expanded || card.body.length <= 100 ? card.body : `${card.body.slice(0, 100)}…`}</p>
      {card.body.length > 100 && (
        <button
          type="button"
          className="ev__expand-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Colapsar" : "Ver mais"}
        </button>
      )}
    </article>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function EvSection({ kind, cards }: { kind: EvidenceCard["kind"]; cards: EvidenceCard[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = KIND_META[kind];
  return (
    <div className="ev__section">
      <button
        type="button"
        className="ev__section-header"
        style={{ borderLeftColor: meta.color }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="ev__section-toggle">{collapsed ? "▶" : "▼"}</span>
        <span className="ev__section-title">{meta.section}</span>
        <span className="ev__section-count" style={{ background: meta.color }}>{cards.length}</span>
      </button>
      {!collapsed && (
        <div className="ev__section-grid">
          {cards.map((c) => <EvCard key={c.id} card={c} />)}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EvidenceCards({ audit }: { audit: ResultAudit }) {
  const cards = buildCards(audit);
  if (cards.length === 0) return null;

  const byKind = new Map<EvidenceCard["kind"], EvidenceCard[]>();
  for (const c of cards) {
    const arr = byKind.get(c.kind) ?? [];
    arr.push(c);
    byKind.set(c.kind, arr);
  }

  const totalLinked = (audit.attachment_facts?.artifacts?.length ?? 0) +
    (audit.retrieved?.length ?? 0);

  return (
    <div className="ev">
      <div className="ev__header">
        <div className="ev__header-titles">
          <h2 className="ev__title">🔗 Evidence Cards</h2>
          <p className="ev__desc">
            {cards.length} evidências ligadas a esta issue — {totalLinked} fontes indexadas.
            Clique em cada seção para expandir/colapsar.
          </p>
        </div>
        <div className="ev__header-stats">
          {SECTION_ORDER.filter((k) => byKind.has(k)).map((k) => (
            <div key={k} className="ev__stat" style={{ borderColor: KIND_META[k].color }}>
              <span className="ev__stat-num" style={{ color: KIND_META[k].color }}>
                {byKind.get(k)!.length}
              </span>
              <span className="ev__stat-label">{KIND_META[k].section.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ev__sections">
        {SECTION_ORDER
          .filter((k) => byKind.has(k))
          .map((k) => (
            <EvSection key={k} kind={k} cards={byKind.get(k)!} />
          ))}
      </div>
    </div>
  );
}
