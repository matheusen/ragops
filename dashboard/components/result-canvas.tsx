"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Audit JSON types (minimal) ─────────────────────────────────────────────────

interface ArtifactFact {
  artifact_id: string;
  artifact_type: string;
  source_path: string;
  extracted_text: string;
  facts: Record<string, unknown>;
  confidence: number;
}

interface RetrievedItem {
  evidence_id: string;
  source: string;
  content: string;
  metadata: { category: string; type?: string };
  final_score: number;
}

interface AuditJSON {
  issue: {
    issue_key: string;
    summary: string;
    description: string;
    priority: string | null;
    issue_type: string;
    status: string | null;
    project: string | null;
    component: string | null;
    service: string | null;
    environment: string | null;
  };
  attachment_facts?: {
    artifacts?: ArtifactFact[];
    contradictions?: string[];
  };
  rule_evaluation?: {
    missing_items?: string[];
    contradictions?: string[];
    results?: { rule_name: string; severity: string; message: string }[];
  };
  retrieved?: RetrievedItem[];
  decision?: {
    issue_key: string;
    classification: string;
    is_bug: boolean;
    is_complete: boolean;
    ready_for_dev: boolean;
    confidence: number;
    missing_items: string[];
    evidence_used: string[];
    contradictions: string[];
    financial_impact_detected: boolean;
    requires_human_review: boolean;
    rationale: string;
    provider: string;
    model: string;
  };
}

// ── Graph types ────────────────────────────────────────────────────────────────

type NodeType = "issue" | "artifact" | "policy" | "decision" | "contradiction" | "missing" | "rule";

interface CANode {
  id: string;
  type: NodeType;
  x: number; y: number; w: number; h: number;
  title: string;
  subtitle: string;
  detail: string;
  badge?: string;
  score?: number;
}

interface CAEdge {
  id: string;
  from: string;
  to: string;
  color: string;
  dashed?: boolean;
  label?: string;
}

// ── Node color/icon palette ────────────────────────────────────────────────────

const NODE_THEME: Record<NodeType, { border: string; bg: string; icon: string; dark: string }> = {
  issue:         { border: "#3b82f6", bg: "#eff6ff", icon: "🎯", dark: "#1d4ed8" },
  artifact:      { border: "#f97316", bg: "#fff7ed", icon: "📄", dark: "#c2410c" },
  policy:        { border: "#8b5cf6", bg: "#f5f3ff", icon: "📋", dark: "#6d28d9" },
  decision:      { border: "#16a34a", bg: "#f0fdf4", icon: "⚖️", dark: "#15803d" },
  contradiction: { border: "#ef4444", bg: "#fef2f2", icon: "⚡", dark: "#b91c1c" },
  missing:       { border: "#f59e0b", bg: "#fffbeb", icon: "❓", dark: "#b45309" },
  rule:          { border: "#06b6d4", bg: "#ecfeff", icon: "📏", dark: "#0e7490" },
};

const CLS_DECISION_THEME: Record<string, { border: string; bg: string }> = {
  bug:          { border: "#ef4444", bg: "#fef2f2" },
  not_bug:      { border: "#16a34a", bg: "#f0fdf4" },
  needs_review: { border: "#f59e0b", bg: "#fffbeb" },
};

// ── Layout algorithm ───────────────────────────────────────────────────────────

const CX = 650;
const NODE_W = { issue: 320, artifact: 250, policy: 250, decision: 320, contradiction: 260, missing: 240, rule: 230 };
const NODE_H_DEFAULT = 90;
const GAP_Y = 24;

function computeLayout(audit: AuditJSON): { nodes: CANode[]; edges: CAEdge[]; height: number } {
  const nodes: CANode[] = [];
  const edges: CAEdge[] = [];

  // ── Issue ──────────────────────────────────────────────────────────────────
  nodes.push({
    id: "issue",
    type: "issue",
    x: CX - NODE_W.issue / 2,
    y: 40,
    w: NODE_W.issue,
    h: 110,
    title: audit.issue.issue_key,
    subtitle: audit.issue.summary,
    detail: [
      audit.issue.description,
      audit.issue.environment && `Ambiente: ${audit.issue.environment}`,
      audit.issue.component && `Componente: ${audit.issue.component}`,
    ].filter(Boolean).join("\n\n"),
    badge: [audit.issue.priority, audit.issue.issue_type, audit.issue.status].filter(Boolean).join(" · "),
  });

  // ── Artifacts ─────────────────────────────────────────────────────────────
  const artifacts = audit.attachment_facts?.artifacts ?? [];
  const artStartY = 200;
  const artH = NODE_H_DEFAULT;
  artifacts.forEach((art, i) => {
    const name = art.source_path.replace(/\\/g, "/").split("/").pop() ?? `artifact-${i}`;
    const nodeId = `artifact_${i}`;
    nodes.push({
      id: nodeId,
      type: "artifact",
      x: 40,
      y: artStartY + i * (artH + GAP_Y),
      w: NODE_W.artifact,
      h: artH,
      title: name,
      subtitle: art.artifact_type,
      detail: art.extracted_text?.slice(0, 600) ?? "",
      badge: `conf: ${(art.confidence * 100).toFixed(0)}%`,
      score: art.confidence,
    });
    edges.push({
      id: `e_issue_${nodeId}`,
      from: "issue",
      to: nodeId,
      color: NODE_THEME.artifact.border,
    });
  });

  // ── Policies (retrieved) ───────────────────────────────────────────────────
  const policies = (audit.retrieved ?? []).filter((r) => r.metadata?.category === "policy");
  const polStartY = 200;
  const polH = NODE_H_DEFAULT;
  policies.forEach((pol, i) => {
    const label = pol.source.replace("policy:", "").replace(/-/g, " ");
    const nodeId = `policy_${i}`;
    nodes.push({
      id: nodeId,
      type: "policy",
      x: 1020,
      y: polStartY + i * (polH + GAP_Y),
      w: NODE_W.policy,
      h: polH,
      title: label,
      subtitle: `relevância: ${pol.final_score?.toFixed(3) ?? "–"}`,
      detail: pol.content,
      score: pol.final_score,
    });
    edges.push({
      id: `e_issue_${nodeId}`,
      from: "issue",
      to: nodeId,
      color: NODE_THEME.policy.border,
      dashed: true,
    });
  });

  // ── Vertical center for bottom nodes ──────────────────────────────────────
  const artBottom = artStartY + artifacts.length * (artH + GAP_Y);
  const polBottom = polStartY + policies.length * (polH + GAP_Y);
  const midBottom = Math.max(artBottom, polBottom, 380);

  // ── Rules ─────────────────────────────────────────────────────────────────
  const rules = audit.rule_evaluation?.results ?? [];
  rules.forEach((rule, i) => {
    const nodeId = `rule_${i}`;
    nodes.push({
      id: nodeId,
      type: "rule",
      x: 388 + i * (NODE_W.rule + 16),
      y: midBottom,
      w: NODE_W.rule,
      h: 75,
      title: rule.rule_name.replace(/_/g, " "),
      subtitle: rule.severity,
      detail: rule.message,
    });
    edges.push({
      id: `e_rule_${nodeId}`,
      from: "issue",
      to: nodeId,
      color: NODE_THEME.rule.border,
      dashed: true,
    });
  });

  const rulesBottom = rules.length > 0 ? midBottom + 75 + GAP_Y * 2 : midBottom + GAP_Y;

  // ── Decision ──────────────────────────────────────────────────────────────
  const dec = audit.decision;
  const decisionY = rulesBottom + 30;
  const evidenceUsed = dec?.evidence_used ?? [];

  // Connect artifacts to decision if used in evidence
  artifacts.forEach((art, i) => {
    const used = evidenceUsed.some(
      (e) => e.includes(art.source_path.replace(/\\/g, "/").split("/").pop() ?? "") ||
             e.includes(art.artifact_id),
    );
    if (used) {
      edges.push({
        id: `e_art_dec_${i}`,
        from: `artifact_${i}`,
        to: "decision",
        color: NODE_THEME.artifact.border,
        label: "evidência",
      });
    }
  });

  // Connect policies to decision if used
  policies.forEach((pol, i) => {
    const used = evidenceUsed.some((e) => e.includes(pol.source) || e.includes(pol.evidence_id));
    if (used) {
      edges.push({
        id: `e_pol_dec_${i}`,
        from: `policy_${i}`,
        to: "decision",
        color: NODE_THEME.policy.border,
        label: "política",
      });
    }
  });

  nodes.push({
    id: "decision",
    type: "decision",
    x: CX - NODE_W.decision / 2,
    y: decisionY,
    w: NODE_W.decision,
    h: 130,
    title: (dec?.classification ?? "decision").replace(/_/g, " ").toUpperCase(),
    subtitle: dec?.rationale?.slice(0, 140) ?? "",
    detail: dec?.rationale ?? "",
    badge: `${dec?.provider ?? ""} · ${dec?.model ?? ""} · ${Math.round((dec?.confidence ?? 0) * 100)}%`,
  });

  // ── Contradictions ─────────────────────────────────────────────────────────
  const contradictions = [
    ...(audit.rule_evaluation?.contradictions ?? []),
    ...(audit.attachment_facts?.contradictions ?? []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const contStartY = decisionY + 150 + GAP_Y;
  contradictions.forEach((c, i) => {
    const nodeId = `contradiction_${i}`;
    nodes.push({
      id: nodeId,
      type: "contradiction",
      x: 40,
      y: contStartY + i * (75 + GAP_Y),
      w: NODE_W.contradiction,
      h: 75,
      title: "Contradição",
      subtitle: c.length > 80 ? c.slice(0, 80) + "…" : c,
      detail: c,
    });
    edges.push({
      id: `e_cont_${i}`,
      from: nodeId,
      to: "decision",
      color: NODE_THEME.contradiction.border,
      dashed: true,
      label: "⚡",
    });
  });

  // ── Missing items ──────────────────────────────────────────────────────────
  const missing = dec?.missing_items ?? audit.rule_evaluation?.missing_items ?? [];
  const missStartY = decisionY + 150 + GAP_Y;
  missing.forEach((m, i) => {
    const nodeId = `missing_${i}`;
    nodes.push({
      id: nodeId,
      type: "missing",
      x: 1050,
      y: missStartY + i * (70 + GAP_Y),
      w: NODE_W.missing,
      h: 70,
      title: "Campo ausente",
      subtitle: m,
      detail: `O campo "${m}" é obrigatório para que a issue esteja pronta para desenvolvimento.`,
    });
    edges.push({
      id: `e_miss_${i}`,
      from: nodeId,
      to: "decision",
      color: NODE_THEME.missing.border,
      dashed: true,
    });
  });

  const finalH = Math.max(
    contStartY + contradictions.length * (75 + GAP_Y),
    missStartY + missing.length * (70 + GAP_Y),
    decisionY + 200,
  ) + 80;

  return { nodes, edges, height: finalH };
}

// ── Edge geometry helpers ──────────────────────────────────────────────────────

interface Anchor { x: number; y: number }

function getAnchors(from: CANode, to: CANode): { s: Anchor; e: Anchor } {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;

  let s: Anchor, e: Anchor;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy >= 0) {
      s = { x: fc.x, y: from.y + from.h };
      e = { x: tc.x, y: to.y };
    } else {
      s = { x: fc.x, y: from.y };
      e = { x: tc.x, y: to.y + to.h };
    }
  } else {
    if (dx >= 0) {
      s = { x: from.x + from.w, y: fc.y };
      e = { x: to.x, y: tc.y };
    } else {
      s = { x: from.x, y: fc.y };
      e = { x: to.x + to.w, y: tc.y };
    }
  }
  return { s, e };
}

function bezier(s: Anchor, e: Anchor): string {
  const mx = (s.x + e.x) / 2;
  const my = (s.y + e.y) / 2;
  const dx = Math.abs(e.x - s.x);
  const dy = Math.abs(e.y - s.y);
  const bend = Math.max(40, Math.min(120, Math.max(dx, dy) * 0.35));

  // Decide control points based on dominant direction
  if (Math.abs(e.y - s.y) >= Math.abs(e.x - s.x)) {
    return `M ${s.x} ${s.y} C ${s.x} ${s.y + bend}, ${e.x} ${e.y - bend}, ${e.x} ${e.y}`;
  } else {
    return `M ${s.x} ${s.y} C ${s.x + (e.x > s.x ? bend : -bend)} ${s.y}, ${e.x + (e.x > s.x ? -bend : bend)} ${e.y}, ${e.x} ${e.y}`;
  }
}

// ── SVG edges layer ────────────────────────────────────────────────────────────

function EdgesLayer({
  edges,
  nodes,
  selectedId,
  canvasHeight,
}: {
  edges: CAEdge[];
  nodes: CANode[];
  selectedId: string | null;
  canvasHeight: number;
}) {
  const nodeMap = useMemo(() => {
    const m = new Map<string, CANode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  return (
    <svg
      className="rc__edges"
      style={{ width: 1340, height: canvasHeight, pointerEvents: "none" }}
    >
      <defs>
        {Object.entries(NODE_THEME).map(([type, th]) => (
          <marker
            key={type}
            id={`arrow-${type}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill={th.border} />
          </marker>
        ))}
      </defs>

      {edges.map((edge) => {
        const fromNode = nodeMap.get(edge.from);
        const toNode   = nodeMap.get(edge.to);
        if (!fromNode || !toNode) return null;
        const { s, e } = getAnchors(fromNode, toNode);
        const path = bezier(s, e);
        const toType = toNode.type;
        const isActive = selectedId === edge.from || selectedId === edge.to;
        return (
          <path
            key={edge.id}
            d={path}
            fill="none"
            stroke={edge.color}
            strokeWidth={isActive ? 2.2 : 1.4}
            strokeDasharray={edge.dashed ? "5 4" : undefined}
            strokeOpacity={isActive ? 0.95 : 0.45}
            markerEnd={`url(#arrow-${toType})`}
          />
        );
      })}
    </svg>
  );
}

// ── Single canvas node ────────────────────────────────────────────────────────

function CanvasNodeCard({
  node,
  selected,
  onClick,
}: {
  node: CANode;
  selected: boolean;
  onClick: (id: string) => void;
}) {
  const theme = NODE_THEME[node.type];
  const decisionOverride =
    node.type === "decision" && node.title.toLowerCase().replaceAll(" ", "_")
      ? CLS_DECISION_THEME[node.title.toLowerCase().replaceAll(" ", "_")] : null;

  const bg     = decisionOverride?.bg ?? theme.bg;
  const border = decisionOverride?.border ?? theme.border;

  return (
    <div
      className={`rc__node rc__node--${node.type}${selected ? " rc__node--selected" : ""}`}
      style={{
        position: "absolute",
        left: node.x, top: node.y,
        width: node.w, height: node.h,
        background: bg,
        borderColor: border,
        boxShadow: selected ? `0 0 0 3px ${border}44, 0 4px 16px ${border}33` : undefined,
      }}
      onClick={() => onClick(node.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick(node.id)}
    >
      <div className="rc__node-header">
        <span className="rc__node-icon">{theme.icon}</span>
        <span className="rc__node-title" title={node.title}>{node.title}</span>
        {node.badge && <span className="rc__node-badge" style={{ color: theme.dark }}>{node.badge}</span>}
      </div>
      {node.subtitle && (
        <p className="rc__node-sub" title={node.subtitle}>{node.subtitle}</p>
      )}
      {node.score !== undefined && (
        <div className="rc__node-score-bar">
          <div style={{ width: `${Math.min(node.score, 1) * 100}%`, background: border }} />
        </div>
      )}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: CANode; onClose: () => void }) {
  const theme = NODE_THEME[node.type];
  return (
    <div className="rc__detail">
      <div className="rc__detail-header" style={{ borderColor: theme.border }}>
        <div className="rc__detail-title">
          <span>{theme.icon}</span>
          <span>{node.title}</span>
        </div>
        <button className="rc__detail-close" onClick={onClose} type="button">✕</button>
      </div>
      <div className="rc__detail-body">
        {node.badge && (
          <div className="rc__detail-badge" style={{ color: theme.dark, borderColor: theme.border }}>
            {node.badge}
          </div>
        )}
        {node.subtitle && node.subtitle !== node.title && (
          <div className="rc__detail-sub">{node.subtitle}</div>
        )}
        {node.detail && (
          <pre className="rc__detail-content">{node.detail}</pre>
        )}
      </div>
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function Toolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="rc__toolbar">
      <button className="rc__tb-btn" onClick={onZoomIn} title="Zoom in" type="button">+</button>
      <span className="rc__tb-zoom">{Math.round(zoom * 100)}%</span>
      <button className="rc__tb-btn" onClick={onZoomOut} title="Zoom out" type="button">−</button>
      <div className="rc__tb-sep" />
      <button className="rc__tb-btn" onClick={onFit} title="Ajustar à tela" type="button">⊡</button>
      <button className="rc__tb-btn" onClick={onReset} title="Resetar view" type="button">↺</button>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ types }: { types: NodeType[] }) {
  const unique = [...new Set(types)];
  return (
    <div className="rc__legend">
      {unique.map((t) => (
        <div key={t} className="rc__legend-item">
          <div className="rc__legend-dot" style={{ background: NODE_THEME[t].border }} />
          <span className="rc__legend-label">{NODE_THEME[t].icon} {t}</span>
        </div>
      ))}
    </div>
  );
}

// ── Minimap ───────────────────────────────────────────────────────────────────

function Minimap({
  nodes,
  canvasHeight,
  pan,
  zoom,
  viewW,
  viewH,
}: {
  nodes: CANode[];
  canvasHeight: number;
  pan: { x: number; y: number };
  zoom: number;
  viewW: number;
  viewH: number;
}) {
  const mmW = 160, mmH = 90;
  const scaleX = mmW / 1340;
  const scaleY = mmH / canvasHeight;
  const vW = (viewW / zoom) * scaleX;
  const vH = (viewH / zoom) * scaleY;
  const vX = (-pan.x / zoom) * scaleX;
  const vY = (-pan.y / zoom) * scaleY;

  return (
    <svg className="rc__minimap" width={mmW} height={mmH}>
      <rect width={mmW} height={mmH} fill="#f8fafc" rx="4" />
      {nodes.map((n) => (
        <rect
          key={n.id}
          x={n.x * scaleX}
          y={n.y * scaleY}
          width={n.w * scaleX}
          height={n.h * scaleY}
          fill={NODE_THEME[n.type].border}
          opacity={0.6}
          rx="1"
        />
      ))}
      <rect
        x={Math.max(0, vX)}
        y={Math.max(0, vY)}
        width={Math.min(vW, mmW)}
        height={Math.min(vH, mmH)}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        rx="2"
      />
    </svg>
  );
}

// ── Main canvas component ─────────────────────────────────────────────────────

const CANVAS_W = 1340;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;

export function ResultCanvas({ audit }: { audit: AuditJSON }) {
  const { nodes, edges, height: canvasHeight } = useMemo(() => computeLayout(audit), [audit]);

  const wrapRef  = useRef<HTMLDivElement>(null);
  const [zoom,   setZoom]   = useState(1);
  const [pan,    setPan]    = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewSize, setViewSize] = useState({ w: 900, h: 600 });

  // Observe wrapper size for minimap
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setViewSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Zoom via wheel
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Pan via mouse drag on background
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".rc__node, .rc__detail")) return;
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging || !startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      setPan({ x: startRef.current.px + dx, y: startRef.current.py + dy });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const zoomIn  = () => setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + 0.1).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - 0.1).toFixed(2))));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const fitView = useCallback(() => {
    if (!wrapRef.current) return;
    const vw = wrapRef.current.clientWidth;
    const vh = wrapRef.current.clientHeight;
    const newZoom = Math.min(vw / CANVAS_W, vh / canvasHeight, 1);
    setZoom(parseFloat(newZoom.toFixed(2)));
    setPan({ x: (vw - CANVAS_W * newZoom) / 2, y: (vh - canvasHeight * newZoom) / 2 });
  }, [canvasHeight]);

  const selectedNode = selected ? nodes.find((n) => n.id === selected) ?? null : null;
  const nodeTypes = [...new Set(nodes.map((n) => n.type))];

  return (
    <div className="rc">
      {/* canvas header */}
      <div className="rc__header">
        <div className="rc__header-left">
          <span className="rc__issue-key">{audit.issue.issue_key}</span>
          <span className="rc__issue-summary">{audit.issue.summary}</span>
        </div>
        <Toolbar zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fitView} onReset={resetView} />
      </div>

      {/* canvas viewport */}
      <div
        ref={wrapRef}
        className={`rc__viewport${dragging ? " rc__viewport--grabbing" : ""}`}
        onMouseDown={handleMouseDown}
      >
        {/* stage */}
        <div
          className="rc__stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: CANVAS_W,
            height: canvasHeight,
          }}
        >
          {/* edges SVG */}
          <EdgesLayer
            edges={edges}
            nodes={nodes}
            selectedId={selected}
            canvasHeight={canvasHeight}
          />

          {/* nodes */}
          {nodes.map((node) => (
            <CanvasNodeCard
              key={node.id}
              node={node}
              selected={selected === node.id}
              onClick={(id) => setSelected((prev) => (prev === id ? null : id))}
            />
          ))}
        </div>

        {/* minimap */}
        <div className="rc__minimap-wrap">
          <Minimap
            nodes={nodes}
            canvasHeight={canvasHeight}
            pan={pan}
            zoom={zoom}
            viewW={viewSize.w}
            viewH={viewSize.h}
          />
        </div>
      </div>

      {/* detail panel */}
      {selectedNode && (
        <DetailPanel node={selectedNode} onClose={() => setSelected(null)} />
      )}

      {/* legend */}
      <Legend types={nodeTypes} />
    </div>
  );
}
