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

// ── Custom node: document card ─────────────────────────────────────────────

function DocCardNode({
  data,
}: {
  data: {
    label: string;
    topics: string[];
    chunks: number;
    highlighted: boolean;
    dimmed: boolean;
    hasPdf: boolean;
    onOpenPdf: () => void;
  };
}) {
  return (
    <div
      style={{
        background: data.highlighted ? "#fff" : data.dimmed ? "rgba(255,255,255,.45)" : "#fff",
        border: `2px solid ${data.highlighted ? "var(--primary, #4f7df3)" : "var(--border, #e2e5eb)"}`,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 160,
        maxWidth: 220,
        boxShadow: data.highlighted ? "0 4px 18px rgba(79,125,243,.25)" : "0 2px 6px rgba(0,0,0,.06)",
        opacity: data.dimmed ? 0.5 : 1,
        transition: "all 200ms",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1d23", marginBottom: 6, lineHeight: 1.35 }}>
        {data.label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
        {data.topics.slice(0, 4).map((t) => (
          <span
            key={t}
            style={{
              background: "rgba(79,125,243,.1)",
              color: "#4f7df3",
              borderRadius: 20,
              fontSize: 10,
              padding: "1px 7px",
              fontWeight: 600,
            }}
          >
            {t}
          </span>
        ))}
        {data.topics.length > 4 && (
          <span style={{ fontSize: 10, color: "#8b92a5" }}>+{data.topics.length - 4}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "#8b92a5" }}>{data.chunks} chunks</span>
        {data.hasPdf && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); data.onOpenPdf(); }}
            title="Abrir PDF original"
            style={{
              background: "rgba(79,125,243,.12)",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              padding: "3px 7px",
              color: "#4f7df3",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
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

// ── Custom node: topic cluster hub ────────────────────────────────────────

function TopicHubNode({ data }: { data: { label: string; count: number; highlighted: boolean; dimmed: boolean } }) {
  return (
    <div
      style={{
        background: data.highlighted ? "#4f7df3" : data.dimmed ? "rgba(79,125,243,.2)" : "rgba(79,125,243,.12)",
        border: `2px solid ${data.highlighted ? "#4f7df3" : "rgba(79,125,243,.3)"}`,
        borderRadius: "50%",
        width: 80,
        height: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: data.dimmed ? 0.4 : 1,
        transition: "all 200ms",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: data.highlighted ? "#fff" : "#4f7df3", textAlign: "center", padding: "0 8px", lineHeight: 1.3 }}>
        {data.label}
      </div>
      <div style={{ fontSize: 9, color: data.highlighted ? "rgba(255,255,255,.8)" : "#8b92a5", marginTop: 2 }}>
        {data.count} docs
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

// ── Layout helper ─────────────────────────────────────────────────────────

function computeLayout(
  docs: DocNode[],
  clusters: Record<string, string[]>,
  onOpenPdf: (docId: string, docTitle: string) => void,
) {
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  const significantTopics = Object.entries(clusters)
    .filter(([, docIds]) => docIds.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 12);

  // Place topic hubs on left column
  significantTopics.forEach(([topic, docIds], i) => {
    const nid = `topic::${topic}`;
    flowNodes.push({
      id: nid,
      type: "topicHub",
      position: { x: 60, y: i * 120 + 40 },
      data: { label: topic, count: docIds.length, highlighted: false, dimmed: false },
    });
  });

  // Place doc cards in a grid on the right
  const cols = Math.max(2, Math.ceil(Math.sqrt(docs.length)));
  docs.forEach((doc, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    flowNodes.push({
      id: doc.doc_id,
      type: "docCard",
      position: { x: 320 + col * 280, y: row * 160 + 40 },
      data: {
        label: doc.title,
        topics: doc.topics,
        chunks: doc.chunk_count,
        highlighted: false,
        dimmed: false,
        hasPdf: !!doc.minio_key,
        onOpenPdf: () => onOpenPdf(doc.doc_id, doc.title),
      },
    });
  });

  // Edges: topic hub → doc card
  significantTopics.forEach(([topic, docIds]) => {
    const nid = `topic::${topic}`;
    docIds.forEach((docId) => {
      flowEdges.push({
        id: `e-${nid}-${docId}`,
        source: nid,
        target: docId,
        style: { stroke: "rgba(79,125,243,.3)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.Arrow, color: "rgba(79,125,243,.3)" },
        animated: false,
      });
    });
  });

  return { flowNodes, flowEdges };
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
  const [searchResult, setSearchResult] = useState<string[] | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const openPdf = useCallback((docId: string, docTitle: string, page?: number, chunkId?: string) => {
    setPdfInfo({ docId, docTitle, page, chunkId });
  }, []);

  // Load graph data
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/knowledge/graph`)
      .then((r) => r.json())
      .then((data: GraphData) => {
        setGraph(data);
        const { flowNodes, flowEdges } = computeLayout(data.nodes, data.topic_clusters, openPdf);
        setNodes(flowNodes);
        setEdges(flowEdges);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [setNodes, setEdges, openPdf]);

  // Add doc-doc edges from backend graph
  useEffect(() => {
    if (!graph) return;
    const docDocEdges: Edge[] = graph.edges
      .filter((e) => e.weight >= 0.15)
      .map((e) => ({
        id: `dd-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        style: {
          stroke: `rgba(34,160,107,${Math.min(0.6, e.weight)})`,
          strokeWidth: Math.max(1, e.weight * 3),
          strokeDasharray: "5,3",
        },
        label: e.shared_topics.slice(0, 2).join(", "),
        labelStyle: { fontSize: 9, fill: "#8b92a5" },
        markerEnd: { type: MarkerType.Arrow, color: "rgba(34,160,107,.4)" },
      }));

    setEdges((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      return [...prev, ...docDocEdges.filter((e) => !existingIds.has(e.id))];
    });
  }, [graph, setEdges]);

  // Search: highlight matching nodes
  const handleSearch = useCallback(() => {
    if (!graph || !search.trim()) {
      setSearchResult(null);
      setNodes((nds) =>
        nds.map((n) => ({ ...n, data: { ...n.data, highlighted: false, dimmed: false } }))
      );
      return;
    }
    const q = search.toLowerCase();
    const matchedDocIds = graph.nodes
      .filter((d) => d.title.toLowerCase().includes(q) || d.topics.some((t) => t.toLowerCase().includes(q)))
      .map((d) => d.doc_id);
    const matchedTopicIds = Object.keys(graph.topic_clusters)
      .filter((t) => t.toLowerCase().includes(q))
      .map((t) => `topic::${t}`);
    const matchedIds = new Set([...matchedDocIds, ...matchedTopicIds]);
    setSearchResult(matchedDocIds);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          highlighted: matchedIds.has(n.id),
          dimmed: !matchedIds.has(n.id),
        },
      }))
    );
  }, [search, graph, setNodes]);

  const clearSearch = () => {
    setSearch("");
    setSearchResult(null);
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, highlighted: false, dimmed: false } }))
    );
  };

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedNode((prev) => (prev === node.id ? null : node.id));
  }, []);

  const selectedDoc = useMemo(() => {
    if (!selectedNode || !graph) return null;
    return graph.nodes.find((d) => d.doc_id === selectedNode) ?? null;
  }, [selectedNode, graph]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-tertiary)" }}>
        <div style={{ marginBottom: "1rem" }}>Carregando grafo de conhecimento…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", color: "var(--danger)", background: "var(--danger-soft)", borderRadius: 10, fontSize: ".9rem" }}>
        Erro ao carregar grafo: {error}
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-tertiary)" }}>
        <p style={{ fontSize: "1rem", marginBottom: ".5rem" }}>Nenhum documento indexado ainda.</p>
        <a href="/ingest" style={{ color: "var(--primary)", fontWeight: 600 }}>Ir para Ingest →</a>
      </div>
    );
  }

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
            <button type="button" className="mindmap__search-clear" onClick={clearSearch}>×</button>
          )}
          <button type="button" className="mindmap__search-btn" onClick={handleSearch}>Buscar</button>
        </div>
        <div className="mindmap__stats">
          <span>{graph.nodes.length} docs</span>
          <span>{graph.edges.length} conexões</span>
          {searchResult !== null && <span style={{ color: "var(--primary)", fontWeight: 600 }}>{searchResult.length} encontrados</span>}
        </div>
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
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={24} />
          <Controls />
          <MiniMap
            nodeColor={(n) => (n.type === "topicHub" ? "#4f7df3" : "#fff")}
            maskColor="rgba(240,242,245,.85)"
          />
        </ReactFlow>
      </div>

      {/* Detail panel */}
      {selectedDoc && (
        <div className="mindmap__detail">
          <button type="button" className="mindmap__detail-close" onClick={() => setSelectedNode(null)}>×</button>
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
            {selectedDoc.topics.map((t) => (
              <span key={t} className="mindmap__topic-tag" onClick={() => { setSearch(t); handleSearch(); }}>
                {t}
              </span>
            ))}
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
                    <div key={e.source + e.target} className="mindmap__related-item" onClick={() => setSelectedNode(otherId)}>
                      <strong>{otherDoc?.title ?? otherId}</strong>
                      <span>{e.shared_topics.slice(0, 2).join(", ")}</span>
                      {otherDoc?.minio_key && (
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); openPdf(otherId, otherDoc.title); }}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--primary, #4f7df3)", fontSize: 10, padding: 0,
                          }}
                        >
                          📄 PDF
                        </button>
                      )}
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
          background: var(--primary-soft); color: var(--primary); border-radius: 20px;
          font-size: .75rem; font-weight: 600; padding: .2rem .6rem; cursor: pointer;
        }
        .mindmap__topic-tag:hover { background: var(--primary-medium); }
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
