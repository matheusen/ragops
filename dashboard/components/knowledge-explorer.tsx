"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getApiBase } from "@/lib/api-base";

const API_BASE = getApiBase();

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocNode {
  doc_id: string;
  title: string;
  topics: string[];
  chunk_count: number;
  source_path: string;
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

interface Chunk {
  title: string;
  doc_id: string;
  page_number: number | null;
  section_title: string | null;
  content: string;
  score: number;
  chunk_index: number;
  chunk_kind: string;
  topics: string[];
  image_path?: string | null;
}

interface AskResult {
  query: string;
  answer: string;
  sources: Chunk[];
  provider: string;
  model: string;
}

interface TopicCard {
  topic: string;
  books: string[];
  chunkCount: number;
  related: string[];
  color: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PALETTE = [
  "#4f7df3", "#22a06b", "#e57c2f", "#9c6ef8",
  "#0ea5e9", "#f43f5e", "#14b8a6", "#f59e0b",
  "#8b5cf6", "#10b981", "#ef4444", "#3b82f6",
];

const PROVIDERS = [
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama" },
  { id: "mock", label: "Mock" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function topicColor(index: number) {
  return PALETTE[index % PALETTE.length];
}

function scoreToWidth(score: number) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return `${pct}%`;
}

function scoreLabel(score: number) {
  if (score >= 0.85) return "Muito relevante";
  if (score >= 0.65) return "Relevante";
  if (score >= 0.45) return "Moderado";
  return "Baixo";
}

function scoreColor(score: number) {
  if (score >= 0.85) return "var(--success)";
  if (score >= 0.65) return "var(--primary)";
  if (score >= 0.45) return "var(--warning)";
  return "var(--text-tertiary)";
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function KnowledgeExplorer() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [topicCards, setTopicCards] = useState<TopicCard[]>([]);
  const [topicFilter, setTopicFilter] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"idle" | "search" | "ask">("idle");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load graph data on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/knowledge/graph`)
      .then((r) => r.json())
      .then((data: GraphData) => {
        setGraphData(data);

        // Build topic cards from topic_clusters + nodes
        const docById: Record<string, DocNode> = {};
        for (const n of data.nodes) docById[n.doc_id] = n;

        // Compute related topics: topics that co-occur in the same document
        const docTopicList: Record<string, string[]> = {};
        for (const n of data.nodes) docTopicList[n.doc_id] = n.topics;

        const coOccur: Record<string, Set<string>> = {};
        for (const [docId, topics] of Object.entries(docTopicList)) {
          for (const t of topics) {
            if (!coOccur[t]) coOccur[t] = new Set();
            for (const other of topics) {
              if (other !== t) coOccur[t].add(other);
            }
          }
        }

        const cards: TopicCard[] = Object.entries(data.topic_clusters)
          .map(([topic, docIds], i) => {
            const books = [...new Set(docIds.map((id) => docById[id]?.title || id))];
            const chunkCount = docIds.reduce(
              (sum, id) => sum + (docById[id]?.chunk_count || 0),
              0
            );
            const related = [...(coOccur[topic] || [])].slice(0, 6);
            return { topic, books, chunkCount, related, color: topicColor(i) };
          })
          .sort((a, b) => b.books.length - a.books.length || b.chunkCount - a.chunkCount);

        setTopicCards(cards);
      })
      .catch(() => {});
  }, []);

  // ── Search (no LLM) ──────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setMode("search");
    setAskResult(null);
    try {
      const r = await fetch(
        `${API_BASE}/knowledge/search?q=${encodeURIComponent(q)}&top_k=15`
      );
      const data = await r.json();
      setChunks(data.results || []);
    } catch {
      setChunks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Ask LLM ─────────────────────────────────────────────────────────────
  const doAsk = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setMode("ask");
    setChunks([]);
    setAskResult(null);
    try {
      const r = await fetch(`${API_BASE}/knowledge/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, provider, top_k: 12 }),
      });
      const data: AskResult = await r.json();
      setAskResult(data);
      setChunks(data.sources || []);
    } catch {
      setAskResult(null);
      setChunks([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  // ── Topic card click ─────────────────────────────────────────────────────
  const handleTopicClick = useCallback((topic: string) => {
    setSelectedTopic(topic);
    setQuery(topic);
    doSearch(topic);
  }, [doSearch]);

  // ── Keyboard submit ──────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.shiftKey) doAsk(query);
      else doSearch(query);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredCards = topicFilter
    ? topicCards.filter((c) =>
        c.topic.toLowerCase().includes(topicFilter.toLowerCase()) ||
        c.books.some((b) => b.toLowerCase().includes(topicFilter.toLowerCase()))
      )
    : topicCards;

  const stats = graphData
    ? `${topicCards.length} tópicos · ${graphData.nodes.length} livros indexados`
    : "Carregando base de conhecimento…";

  return (
    <div className="ke">
      {/* ── Header ── */}
      <div className="ke__header">
        <div className="ke__header-left">
          <h1 className="ke__title">Base de Conhecimento</h1>
          <span className="ke__stats">{stats}</span>
        </div>
        {/* Provider */}
        <div className="ke__provider-row">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ke__prov-btn ${provider === p.id ? "ke__prov-btn--active" : ""}`}
              onClick={() => setProvider(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="ke__search-bar">
        <div className="ke__search-input-wrap">
          <svg className="ke__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="ke__search-input"
            placeholder="Buscar na base… ou faça uma pergunta e pressione Shift+Enter para obter resposta com LLM"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          {query && (
            <button className="ke__search-clear" onClick={() => { setQuery(""); setSelectedTopic(null); setMode("idle"); setChunks([]); setAskResult(null); }}>×</button>
          )}
        </div>
        <button
          className="btn btn--ghost"
          onClick={() => doSearch(query)}
          disabled={loading || !query.trim()}
          title="Buscar chunks relevantes (Enter)"
        >
          {loading && mode === "search" ? <span className="ke__spin" /> : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}
          Buscar
        </button>
        <button
          className="btn btn--primary"
          onClick={() => doAsk(query)}
          disabled={loading || !query.trim()}
          title="Perguntar ao LLM e obter resposta fundamentada (Shift+Enter)"
        >
          {loading && mode === "ask" ? <span className="ke__spin ke__spin--white" /> : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          )}
          Perguntar
        </button>
      </div>

      {/* ── Body ── */}
      <div className="ke__body">

        {/* ── LEFT: Topic Map ── */}
        <div className="ke__left">
          <div className="ke__left-header">
            <span className="ke__section-label">Mapa de Tópicos</span>
            <input
              className="ke__topic-filter"
              placeholder="Filtrar tópicos…"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
            />
          </div>

          {topicCards.length === 0 && (
            <div className="ke__empty">
              {graphData ? "Nenhum tópico encontrado. Ingira documentos primeiro." : "Carregando…"}
            </div>
          )}

          <div className="ke__topic-grid">
            {filteredCards.map((card) => {
              const isActive = selectedTopic === card.topic;
              return (
                <button
                  key={card.topic}
                  type="button"
                  className={`ke__topic-card ${isActive ? "ke__topic-card--active" : ""}`}
                  style={{ "--card-color": card.color } as React.CSSProperties}
                  onClick={() => handleTopicClick(card.topic)}
                >
                  <div className="ke__topic-name">{titleCase(card.topic)}</div>
                  <div className="ke__topic-meta">
                    <span>{card.books.length} livro{card.books.length !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{card.chunkCount} chunks</span>
                  </div>
                  <div className="ke__topic-books">
                    {card.books.slice(0, 2).map((b) => (
                      <span key={b} className="ke__topic-book" title={b}>
                        {b.length > 22 ? b.slice(0, 22) + "…" : b}
                      </span>
                    ))}
                    {card.books.length > 2 && (
                      <span className="ke__topic-book ke__topic-book--more">+{card.books.length - 2}</span>
                    )}
                  </div>
                  {card.related.length > 0 && (
                    <div className="ke__topic-related">
                      {card.related.slice(0, 4).map((r) => (
                        <span key={r} className="ke__topic-rel-chip"
                          onClick={(e) => { e.stopPropagation(); handleTopicClick(r); }}
                          title={`Buscar: ${r}`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="ke__right">
          {/* Idle state */}
          {mode === "idle" && (
            <div className="ke__right-idle">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>Clique em um tópico ou use a busca para explorar a base de conhecimento</p>
              <p className="ke__right-idle-hint">
                <kbd>Enter</kbd> busca chunks · <kbd>Shift+Enter</kbd> resposta com LLM
              </p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="ke__right-loading">
              <div className="ke__loading-bar" />
              <span>{mode === "ask" ? "Consultando LLM…" : "Buscando na base…"}</span>
            </div>
          )}

          {/* LLM Answer */}
          {!loading && askResult && askResult.answer && (
            <div className="ke__answer">
              <div className="ke__answer-header">
                <div className="ke__answer-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 4a1 1 0 00-1 1v4a1 1 0 002 0V7a1 1 0 00-1-1zm0 10a1.25 1.25 0 110-2.5A1.25 1.25 0 0112 16z" />
                  </svg>
                </div>
                <span className="ke__answer-label">Resposta</span>
                <span className="ke__answer-badge">{askResult.provider} / {askResult.model}</span>
              </div>
              <div className="ke__answer-text">{askResult.answer}</div>
            </div>
          )}

          {/* Sources / Chunks */}
          {!loading && chunks.length > 0 && (
            <div className="ke__sources">
              <div className="ke__sources-header">
                <span className="ke__section-label">
                  {mode === "ask" ? "Fontes utilizadas" : `${chunks.length} resultado${chunks.length !== 1 ? "s" : ""} encontrado${chunks.length !== 1 ? "s" : ""}`}
                </span>
                {selectedTopic && <span className="ke__sources-topic">"{selectedTopic}"</span>}
              </div>
              <div className="ke__chunk-list">
                {chunks.map((chunk, i) => {
                  const key = `${chunk.doc_id}-${chunk.chunk_index}-${i}`;
                  const expanded = expandedChunks.has(key);
                  const preview = chunk.content.length > 220
                    ? chunk.content.slice(0, 220) + "…"
                    : chunk.content;
                  return (
                    <div key={key} className="ke__chunk">
                      {/* Chunk header */}
                      <div className="ke__chunk-header">
                        <div className="ke__chunk-meta">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                          </svg>
                          <span className="ke__chunk-title" title={chunk.title}>{chunk.title}</span>
                          {chunk.page_number && (
                            <span className="ke__chunk-page">pág {chunk.page_number}</span>
                          )}
                          {chunk.section_title && (
                            <span className="ke__chunk-section">§ {chunk.section_title}</span>
                          )}
                        </div>
                        <div className="ke__chunk-score-wrap" title={`${scoreLabel(chunk.score)} (${Math.round(chunk.score * 100)}%)`}>
                          <div className="ke__chunk-score-bar">
                            <div className="ke__chunk-score-fill" style={{ width: scoreToWidth(chunk.score), background: scoreColor(chunk.score) }} />
                          </div>
                          <span className="ke__chunk-score-num" style={{ color: scoreColor(chunk.score) }}>
                            {Math.round(chunk.score * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* Chunk content */}
                      <div className="ke__chunk-content">
                        {expanded ? chunk.content : preview}
                      </div>

                      {/* Topics + actions */}
                      <div className="ke__chunk-footer">
                        <div className="ke__chunk-topics">
                          {chunk.topics.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="ke__chunk-topic-chip"
                              onClick={() => handleTopicClick(t)}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        {chunk.content.length > 220 && (
                          <button
                            type="button"
                            className="ke__chunk-expand"
                            onClick={() => toggleExpand(key)}
                          >
                            {expanded ? "Recolher" : "Ver tudo"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty results */}
          {!loading && mode !== "idle" && chunks.length === 0 && !askResult && (
            <div className="ke__right-idle">
              <p>Nenhum resultado encontrado para "{query}"</p>
              <p className="ke__right-idle-hint">Tente termos diferentes ou verifique se os documentos foram indexados.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
