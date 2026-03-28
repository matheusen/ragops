"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getApiBase } from "@/lib/api-base";
import { PdfViewerModal } from "./pdf-viewer-modal";

const API_BASE = getApiBase();

// ── Types ──────────────────────────────────────────────────────────────────

interface DocNode {
  doc_id: string;
  title: string;
  topics: string[];
  chunk_count: number;
  source_path: string;
  minio_key?: string | null;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  shared_topics: string[];
}

interface GraphData {
  nodes: DocNode[];
  edges: GraphEdge[];
  topic_clusters: Record<string, string[]>;
}

interface PdfInfo {
  docId: string;
  docTitle: string;
  page?: number;
  chunkId?: string;
}

// ── Custom node: document card (styled as roadmap topic card) ─────────────

function DocCardNode({
  data,
}: {
  data: {
    label: string;
    topics: string[];
    chunks: number;
    color: string;
    highlighted: boolean;
    dimmed: boolean;
    hasPdf: boolean;
    onOpenPdf: () => void;
  };
}) {
  const color = data.color || "#4f7df3";
  const border = data.highlighted
    ? `2px solid ${color}`
    : data.dimmed
    ? `1.5px solid var(--border)`
    : `1.5px solid ${color}`;

  return (
    <div
      className={`rmn rmn--topic mm-doc-card${data.highlighted ? " mm-doc-card--hl" : ""}${data.dimmed ? " mm-doc-card--dim" : ""}`}
      style={{ border, boxShadow: data.highlighted ? `0 0 0 3px ${color}22` : undefined, opacity: data.dimmed ? 0.45 : 1 }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="rmn__topic-title">{data.label}</div>
      <div className="rmn__res-list">
        {data.topics.slice(0, 4).map((t) => (
          <span key={t} className="rmn__res-badge" style={{ borderColor: color + "55" }}>
            {t}
          </span>
        ))}
        {data.topics.length > 4 && (
          <span className="rmn__res-badge" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
            +{data.topics.length - 4}
          </span>
        )}
      </div>
      <div className="rmn__node-actions">
        <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{data.chunks} chunks</span>
        {data.hasPdf && (
          <button
            type="button"
            className="rmn__expand-btn"
            style={{ borderColor: color + "88", color }}
            onClick={(e) => { e.stopPropagation(); data.onOpenPdf(); }}
            title="Abrir PDF original"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            PDF
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

// ── Custom node: topic cluster hub (styled as roadmap phase card) ─────────

function TopicHubNode({ data }: { data: { label: string; count: number; color: string; highlighted: boolean; dimmed: boolean; expanded: boolean } }) {
  const color = data.color || "#4f7df3";
  return (
    <div
      className={`rmn rmn--phase mm-hub${data.dimmed ? " mm-hub--dim" : ""}`}
      style={{
        borderColor: data.highlighted ? color : color + "55",
        opacity: data.dimmed ? 0.35 : 1,
        background: data.highlighted ? color + "11" : "var(--surface)",
        boxShadow: data.highlighted ? `0 0 0 3px ${color}33` : undefined,
        cursor: "pointer",
      }}
    >
      <div className="rmn__phase-num" style={{ background: color }}>{data.count}</div>
      <div className="rmn__phase-info">
        <div className="rmn__phase-title">{data.label}</div>
        <div className="rmn__phase-dur">{data.expanded ? "▼ recolher" : "▶ expandir"}</div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

// ── Constants & layout helpers ─────────────────────────────────────────────

const PALETTE = ["#4f7df3", "#22a06b", "#e57c2f", "#9c6ef8", "#0ea5e9", "#f43f5e", "#14b8a6", "#f59e0b"];
const MAX_HUBS = 14;
const HUB_X = 60;
const HUB_SPACING_Y = 90;
const DOC_OFFSET_X = 290;
const COLS = 3;
const COL_GAP = 270;
const ROW_GAP = 175;

function getSignificantTopics(clusters: Record<string, string[]>): [string, string[]][] {
  return Object.entries(clusters)
    .filter(([, ids]) => ids.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, MAX_HUBS);
}

function buildHubNodes(topics: [string, string[]][], expandedTopic: string | null): Node[] {
  return topics.map(([topic, docIds], i) => ({
    id: `topic::${topic}`,
    type: "topicHub",
    position: { x: HUB_X, y: i * HUB_SPACING_Y + 40 },
    data: {
      label: topic,
      count: docIds.length,
      color: PALETTE[i % PALETTE.length],
      highlighted: expandedTopic === topic,
      dimmed: expandedTopic !== null && expandedTopic !== topic,
      expanded: expandedTopic === topic,
    },
  }));
}

function buildExpansion(
  docs: DocNode[],
  topicName: string,
  docIds: string[],
  hubIndex: number,
  color: string,
  onOpenPdf: (id: string, title: string) => void,
): { docNodes: Node[]; docEdges: Edge[] } {
  const clusterDocs = docs.filter((d) => docIds.includes(d.doc_id));
  const hubY = hubIndex * HUB_SPACING_Y + 40;
  const totalRows = Math.ceil(clusterDocs.length / COLS);
  const gridH = totalRows * ROW_GAP;
  const startY = hubY - gridH / 2 + ROW_GAP / 2;
  const hubId = `topic::${topicName}`;

  const docNodes: Node[] = clusterDocs.map((doc, i) => ({
    id: doc.doc_id,
    type: "docCard",
    position: {
      x: HUB_X + DOC_OFFSET_X + (i % COLS) * COL_GAP,
      y: startY + Math.floor(i / COLS) * ROW_GAP,
    },
    data: {
      label: doc.title,
      topics: doc.topics,
      chunks: doc.chunk_count,
      color,
      highlighted: false,
      dimmed: false,
      hasPdf: !!doc.minio_key,
      onOpenPdf: () => onOpenPdf(doc.doc_id, doc.title),
    },
  }));

  const docEdges: Edge[] = clusterDocs.map((doc) => ({
    id: `e-${hubId}-${doc.doc_id}`,
    source: hubId,
    target: doc.doc_id,
    style: { stroke: color + "88", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.Arrow, color: color + "aa" },
    animated: false,
  }));

  return { docNodes, docEdges };
}

// ── Node types (stable reference) ─────────────────────────────────────────

const NODE_TYPES: NodeTypes = {
  docCard: DocCardNode,
  topicHub: TopicHubNode,
};

// ── Main component ─────────────────────────────────────────────────────────

export function KnowledgeMindmap() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const openPdf = useCallback((docId: string, docTitle: string, page?: number, chunkId?: string) => {
    setPdfInfo({ docId, docTitle, page, chunkId });
  }, []);

  const significantTopics = useMemo(
    () => (graph ? getSignificantTopics(graph.topic_clusters) : []),
    [graph],
  );

  // Load graph data
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/knowledge/graph`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: GraphData) => setGraph(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Rebuild nodes/edges when expandedTopic or graph changes
  useEffect(() => {
    if (!graph) return;
    const hubNodes = buildHubNodes(significantTopics, expandedTopic);
    if (!expandedTopic) {
      setNodes(hubNodes);
      setEdges([]);
      return;
    }
    const hubIdx = significantTopics.findIndex(([t]) => t === expandedTopic);
    if (hubIdx === -1) { setNodes(hubNodes); setEdges([]); return; }
    const [, docIds] = significantTopics[hubIdx];
    const color = PALETTE[hubIdx % PALETTE.length];
    const { docNodes, docEdges } = buildExpansion(
      graph.nodes, expandedTopic, docIds, hubIdx, color, openPdf,
    );
    setNodes([...hubNodes, ...docNodes]);
    setEdges(docEdges);
  }, [graph, significantTopics, expandedTopic, openPdf, setNodes, setEdges]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === "topicHub") {
      const topic = node.id.replace("topic::", "");
      setExpandedTopic((prev) => (prev === topic ? null : topic));
      setSelectedDocId(null);
    } else {
      setSelectedDocId((prev) => (prev === node.id ? null : node.id));
    }
  }, []);

  const selectedDoc = useMemo(
    () => (selectedDocId && graph ? graph.nodes.find((d) => d.doc_id === selectedDocId) ?? null : null),
    [selectedDocId, graph],
  );

  const handleSearch = useCallback(() => {
    if (!graph || !search.trim()) return;
    const q = search.toLowerCase();
    const matchTopic = significantTopics.find(([t]) => t.toLowerCase().includes(q));
    if (matchTopic) { setExpandedTopic(matchTopic[0]); return; }
    const matchDoc = graph.nodes.find(
      (d) => d.title.toLowerCase().includes(q) || d.topics.some((t) => t.toLowerCase().includes(q)),
    );
    if (matchDoc) {
      const mt = significantTopics.find(([t]) => matchDoc.topics.includes(t));
      if (mt) setExpandedTopic(mt[0]);
    }
  }, [search, graph, significantTopics]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-tertiary)" }}>
        Carregando grafo de conhecimento…
      </div>
    );
  }

  if (error) {
    const isConn = error.includes("fetch") || error.includes("Failed") || error.includes("HTTP") || error.includes("network");
    return (
      <div style={{ padding: "2rem", background: "var(--danger-soft,#fff1f2)", border: "1px solid var(--danger,#f43f5e)", borderRadius: 12, fontSize: ".9rem" }}>
        <div style={{ fontWeight: 700, color: "var(--danger,#f43f5e)", marginBottom: ".5rem" }}>
          ⚠️ {isConn ? "Backend não está rodando" : "Erro ao carregar grafo"}
        </div>
        <div style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          {isConn ? "O servidor FastAPI (porta 8004) não respondeu." : error}
        </div>
        {isConn && (
          <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: ".6rem 1rem", fontSize: ".8rem", color: "var(--text)", overflowX: "auto" }}>
{`.\\venv\\Scripts\\Activate.ps1\npython -m uvicorn jira_issue_rag.main:app --reload --host 0.0.0.0 --port 8004`}
          </pre>
        )}
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-tertiary)" }}>
        <p>Nenhum documento indexado ainda.</p>
        <a href="/ingest" style={{ color: "var(--primary)", fontWeight: 600 }}>Ir para Ingest →</a>
      </div>
    );
  }

  const expandedHubIdx = expandedTopic
    ? significantTopics.findIndex(([t]) => t === expandedTopic)
    : -1;

  return (
    <div className="mindmap">
      {/* Toolbar */}
      <div className="mindmap__toolbar">
        <div className="mindmap__search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="mindmap__search-input"
            placeholder="Buscar tópico ou documento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          {search && (
            <button type="button" className="mindmap__search-clear" onClick={() => setSearch("")}>×</button>
          )}
          <button type="button" className="mindmap__search-btn" onClick={handleSearch}>Buscar</button>
        </div>
        <div className="mindmap__stats">
          <span>{graph.nodes.length} docs</span>
          <span>{significantTopics.length} tópicos</span>
          {expandedTopic && expandedHubIdx >= 0 && (
            <span style={{ color: PALETTE[expandedHubIdx % PALETTE.length], fontWeight: 600 }}>
              {significantTopics[expandedHubIdx][1].length} expandidos
            </span>
          )}
        </div>
      </div>

      {/* Topic filter pills */}
      <div className="mindmap__pills">
        <button
          type="button"
          className={`mindmap__pill${!expandedTopic ? " mindmap__pill--active" : ""}`}
          onClick={() => { setExpandedTopic(null); setSelectedDocId(null); }}
        >
          Visão geral
        </button>
        {significantTopics.map(([topic, docIds], i) => {
          const color = PALETTE[i % PALETTE.length];
          const isActive = expandedTopic === topic;
          return (
            <button
              key={topic}
              type="button"
              className={`mindmap__pill${isActive ? " mindmap__pill--active" : ""}`}
              style={isActive ? { borderColor: color, color, background: color + "18" } : {}}
              onClick={() => { setExpandedTopic(isActive ? null : topic); setSelectedDocId(null); }}
            >
              <span className="mindmap__pill-dot" style={{ background: color }} />
              {topic}
              <span className="mindmap__pill-count">{docIds.length}</span>
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="mindmap__canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={24} />
          <Controls />
          <MiniMap
            nodeColor={(n) => (n.data?.color as string) || "#4f7df3"}
            maskColor="rgba(240,242,245,.85)"
          />
        </ReactFlow>
      </div>

      {/* Detail panel */}
      {selectedDoc && (
        <div className="mindmap__detail">
          <button type="button" className="mindmap__detail-close" onClick={() => setSelectedDocId(null)}>×</button>
          <h3 className="mindmap__detail-title">{selectedDoc.title}</h3>
          <div className="mindmap__detail-meta">
            <span>{selectedDoc.chunk_count} chunks indexados</span>
            {selectedDoc.source_path && <span title={selectedDoc.source_path}>📄 {selectedDoc.source_path.split(/[\\/]/).pop()}</span>}
          </div>

          {/* PDF open button */}
          {selectedDoc.minio_key && (
            <button
              type="button"
              className="mindmap__pdf-btn"
              onClick={() => openPdf(selectedDoc.doc_id, selectedDoc.title)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Abrir PDF original com chunks
            </button>
          )}

          <div className="mindmap__detail-topics">
            {selectedDoc.topics.map((t) => {
              const ti = significantTopics.findIndex(([tn]) => tn === t);
              const color = ti >= 0 ? PALETTE[ti % PALETTE.length] : "var(--primary)";
              return (
                <span
                  key={t}
                  className="mindmap__topic-tag"
                  style={{ background: color + "18", color }}
                  onClick={() => setExpandedTopic(t)}
                >
                  {t}
                </span>
              );
            })}
          </div>

          {/* Related docs */}
          {(() => {
            const related = graph.edges.filter((e) => e.source === selectedDoc.doc_id || e.target === selectedDoc.doc_id).sort((a, b) => b.weight - a.weight).slice(0, 5);
            if (!related.length) return null;
            return (
              <div className="mindmap__related">
                <div className="mindmap__related-label">Documentos relacionados</div>
                {related.map((e) => {
                  const otherId = e.source === selectedDoc.doc_id ? e.target : e.source;
                  const otherDoc = graph.nodes.find((d) => d.doc_id === otherId);
                  return (
                    <div key={e.source + e.target} className="mindmap__related-item" onClick={() => setSelectedDocId(otherId)}>
                      <strong>{otherDoc?.title ?? otherId}</strong>
                      <span>{e.shared_topics.slice(0, 2).join(", ")}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* PDF Viewer Modal */}
      {pdfInfo && (
        <PdfViewerModal
          docId={pdfInfo.docId}
          docTitle={pdfInfo.docTitle}
          initialPage={pdfInfo.page}
          initialChunkId={pdfInfo.chunkId}
          onClose={() => setPdfInfo(null)}
        />
      )}

      <style>{`
        /* ── Shared roadmap-style node tokens ── */
        .rmn {
          background: var(--surface); border-radius: 10px;
          padding: 10px 14px; cursor: pointer;
          transition: box-shadow 150ms, opacity 150ms;
          font-family: inherit;
        }
        .rmn--topic {
          min-width: 160px; max-width: 220px;
          box-shadow: 0 2px 6px rgba(0,0,0,.06);
        }
        .rmn--topic:hover { box-shadow: 0 4px 14px rgba(0,0,0,.1); }
        .rmn__topic-title {
          font-weight: 700; font-size: 12px; color: var(--text);
          margin-bottom: 6px; line-height: 1.35;
        }
        .rmn__topic-desc {
          font-size: 11px; color: var(--text-secondary); margin-bottom: 6px; line-height: 1.4;
        }
        .rmn__res-list { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px; }
        .rmn__res-badge {
          border: 1px solid var(--border); border-radius: 20px;
          font-size: 10px; padding: 1px 7px; font-weight: 600;
          color: var(--text-secondary); background: var(--bg);
          white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis;
        }
        .rmn__node-actions {
          display: flex; align-items: center; justify-content: space-between;
          gap: .4rem; flex-wrap: wrap;
        }
        .rmn__expand-btn {
          display: flex; align-items: center; gap: 3px;
          background: transparent; border: 1px solid; border-radius: 5px;
          cursor: pointer; padding: 2px 8px; font-size: 10px; font-weight: 700;
        }
        .rmn__expand-btn:hover { opacity: .75; }
        /* Phase cards */
        .rmn--phase {
          display: flex; align-items: center; gap: .55rem;
          border: 2px solid; min-width: 140px; max-width: 200px;
          box-shadow: 0 2px 6px rgba(0,0,0,.06);
          padding: 8px 12px;
        }
        .rmn__phase-num {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 800; color: #fff; flex-shrink: 0;
        }
        .rmn__phase-info { min-width: 0; }
        .rmn__phase-title { font-weight: 700; font-size: 11px; color: var(--text); line-height: 1.3; }
        .rmn__phase-dur { font-size: 10px; color: var(--text-tertiary); margin-top: 1px; }
        /* Modifiers */
        .mm-doc-card--hl { box-shadow: 0 4px 18px rgba(0,0,0,.12) !important; }
        .mm-doc-card--dim { filter: grayscale(0.3); }
        .mm-hub--dim { filter: grayscale(0.4); }

        /* ── Mindmap layout ── */
        .mindmap { display: flex; flex-direction: column; gap: 1rem; }
        .mindmap__toolbar {
          display: flex; align-items: center; justify-content: space-between;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: .6rem 1rem; gap: 1rem;
        }
        .mindmap__search { display: flex; align-items: center; gap: .5rem; flex: 1; }
        .mindmap__search-input {
          flex: 1; background: var(--bg); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: .35rem .7rem;
          font-size: .85rem; color: var(--text); outline: none;
        }
        .mindmap__search-input:focus { border-color: var(--primary); }
        .mindmap__search-clear { background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 1rem; line-height: 1; padding: 0 .2rem; }
        .mindmap__search-btn {
          background: var(--primary); color: #fff; border: none; border-radius: var(--radius-sm);
          padding: .35rem .8rem; font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .mindmap__search-btn:hover { opacity: .88; }
        .mindmap__stats { display: flex; gap: .75rem; font-size: .8rem; color: var(--text-secondary); white-space: nowrap; }
        /* Topic pills */
        .mindmap__pills {
          display: flex; gap: .4rem; flex-wrap: wrap; align-items: center; padding: .1rem 0;
        }
        .mindmap__pill {
          display: inline-flex; align-items: center; gap: .3rem;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 20px; padding: .25rem .65rem;
          font-size: .75rem; font-weight: 600; color: var(--text-secondary);
          cursor: pointer; transition: all 120ms; white-space: nowrap;
        }
        .mindmap__pill:hover { border-color: var(--primary); color: var(--primary); }
        .mindmap__pill--active { font-weight: 700; }
        .mindmap__pill-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .mindmap__pill-count {
          background: var(--bg-alt, #f0f2f5); border-radius: 10px;
          font-size: .7rem; padding: .05rem .35rem; color: var(--text-tertiary);
        }
        .mindmap__canvas {
          height: 600px; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden;
          background: var(--bg);
        }
        .mindmap__detail {
          position: relative; background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 1.25rem; max-width: 420px;
        }
        .mindmap__detail-close {
          position: absolute; top: .75rem; right: .75rem; background: none; border: none;
          cursor: pointer; color: var(--text-tertiary); font-size: 1.1rem;
        }
        .mindmap__detail-title { margin: 0 0 .5rem; font-size: 1rem; font-weight: 700; color: var(--text); }
        .mindmap__detail-meta { display: flex; gap: 1rem; font-size: .8rem; color: var(--text-secondary); margin-bottom: .75rem; }
        .mindmap__pdf-btn {
          display: flex; align-items: center; gap: .4rem;
          background: var(--primary); color: #fff; border: none; border-radius: var(--radius-sm);
          padding: .4rem .85rem; font-size: .8rem; font-weight: 600; cursor: pointer;
          margin-bottom: .75rem; width: 100%;
        }
        .mindmap__pdf-btn:hover { opacity: .88; }
        .mindmap__detail-topics { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: 1rem; }
        .mindmap__topic-tag {
          border-radius: 20px; font-size: .75rem; font-weight: 600; padding: .2rem .6rem; cursor: pointer;
        }
        .mindmap__topic-tag:hover { filter: brightness(1.1); }
        .mindmap__related { border-top: 1px solid var(--border-light); padding-top: .75rem; }
        .mindmap__related-label { font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-tertiary); margin-bottom: .5rem; }
        .mindmap__related-item {
          display: flex; flex-direction: column; gap: .1rem; cursor: pointer;
          padding: .4rem .6rem; border-radius: var(--radius-sm); margin-bottom: .25rem;
          transition: background 100ms;
        }
        .mindmap__related-item:hover { background: var(--bg-alt); }
        .mindmap__related-item strong { font-size: .85rem; color: var(--text); }
        .mindmap__related-item span { font-size: .75rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
