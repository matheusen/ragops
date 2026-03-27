"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  SelectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getApiBase } from "@/lib/api-base";
import { PdfViewerModal } from "./pdf-viewer-modal";

const API_BASE = getApiBase();

// ── Types ─────────────────────────────────────────────────────────────────────

interface QaPair {
  question: string;
  answer: string;
  sources: string[];
  difficulty: "conceitual" | "prática" | "desafiadora";
}

interface TopicExamples {
  topic_title: string;
  generated_at: string;
  provider: string;
  model: string;
  qa_pairs: QaPair[];
}

interface CodeExample {
  title: string;
  language: string;
  explanation: string;
  code: string;
}

interface TopicCodeExamples {
  topic_title: string;
  generated_at: string;
  provider: string;
  model: string;
  code_examples: CodeExample[];
}

interface RoadmapTopic {
  id: string;
  title: string;
  description: string;
  resources: string[];
  prerequisites: string[];
}

interface RoadmapPhase {
  id: string;
  title: string;
  duration: string;
  description: string;
  topics: RoadmapTopic[];
}

interface RoadmapData {
  title: string;
  goal: string;
  phases: RoadmapPhase[];
  connections: { from_id: string; to_id: string; label: string }[];
  provider: string;
  model: string;
  context_docs_used: number;
  raw_output: string;
}

interface KbChunk {
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
  minio_key?: string | null;
  chunk_id?: string;
}

interface AskResult {
  answer: string;
  sources: KbChunk[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: "openai",  label: "OpenAI GPT",     icon: "🤖" },
  { id: "gemini",  label: "Google Gemini",  icon: "✨" },
  { id: "ollama",  label: "Ollama (local)", icon: "🦙" },
  { id: "mock",    label: "Mock (teste)",   icon: "🧪" },
];

const PHASE_COLORS = [
  "#4f7df3","#22a06b","#e57c2f","#9c6ef8","#0ea5e9","#f43f5e","#14b8a6","#f59e0b",
];

// ── Layout: radial mindmap ─────────────────────────────────────────────────────

type SavedPositions = Record<string, { x: number; y: number }>;

function buildLayout(
  roadmap: RoadmapData,
  onTopicSearch: (q: string, topicId?: string) => void,
  savedPositions: SavedPositions = {},
  onReviewRefs?: () => void,
  onExpand?: (topicId: string, title: string, description: string, color: string) => void,
  onChat?: (topicId: string, title: string, description: string) => void,
) {
  const nodes: ReturnType<typeof makeNode>[] = [];
  const edges: ReturnType<typeof makeEdge>[] = [];

  const PHASE_R  = 290;
  const TOPIC_R  = 240;
  const N = roadmap.phases.length;

  const pos = (id: string, defaultX: number, defaultY: number) =>
    savedPositions[id] ?? { x: defaultX, y: defaultY };

  // Goal node — centre
  const goalPos = pos("goal", -110, -45);
  nodes.push(makeNode("goal", "goalNode", goalPos.x, goalPos.y, {
    title: roadmap.title,
    goal: roadmap.goal,
    onSearch: () => onTopicSearch(roadmap.goal),
  }));

  roadmap.phases.forEach((phase, pi) => {
    const color = PHASE_COLORS[pi % PHASE_COLORS.length];
    const phaseAngle = (pi / N) * 2 * Math.PI - Math.PI / 2;
    const px = PHASE_R * Math.cos(phaseAngle);
    const py = PHASE_R * Math.sin(phaseAngle);

    const phasePos = pos(phase.id, px - 95, py - 28);
    nodes.push(makeNode(phase.id, "phaseNode", phasePos.x, phasePos.y, {
      title: phase.title, duration: phase.duration, color, index: pi,
      onSearch: () => onTopicSearch(phase.title),
    }));

    edges.push(makeEdge(`g-${phase.id}`, "goal", phase.id, color, 2.5));

    const M = phase.topics.length;
    const spread = Math.min((Math.PI * 0.7), (M - 1) * 0.28);

    phase.topics.forEach((topic, ti) => {
      const topicAngle = M > 1
        ? phaseAngle + (ti - (M - 1) / 2) * (spread / Math.max(M - 1, 1))
        : phaseAngle;
      const tx = px + TOPIC_R * Math.cos(topicAngle);
      const ty = py + TOPIC_R * Math.sin(topicAngle);

      const topicPos = pos(topic.id, tx - 105, ty - 50);
      nodes.push(makeNode(topic.id, "topicNode", topicPos.x, topicPos.y, {
        title: topic.title,
        description: topic.description,
        resources: topic.resources,
        color,
        onSearch: () => onTopicSearch(topic.title, topic.id),
        onResourceSearch: (r: string) => onTopicSearch(r),
        onReviewRefs,
        onExpand: onExpand
          ? () => onExpand(topic.id, topic.title, topic.description, color)
          : undefined,
        onChat: onChat
          ? () => onChat(topic.id, topic.title, topic.description)
          : undefined,
      }));

      edges.push(makeEdge(`${phase.id}-${topic.id}`, phase.id, topic.id, color, 1.5));
    });
  });

  return { nodes, edges };
}

function makeNode(id: string, type: string, x: number, y: number, data: Record<string, unknown>) {
  return { id, type, position: { x, y }, data, draggable: true };
}

function makeEdge(id: string, source: string, target: string, color: string, width: number) {
  return {
    id, source, target,
    type: "smoothstep",
    style: { stroke: color, strokeWidth: width, opacity: 0.65 },
  };
}

// ── Custom Nodes ───────────────────────────────────────────────────────────────

function GoalNode({ data }: NodeProps) {
  return (
    <div className="rmn rmn--goal" onClick={data.onSearch as () => void}>
      <AllHandles />
      <div className="rmn__goal-icon">🗺️</div>
      <div className="rmn__goal-title">{data.title as string}</div>
      <div className="rmn__goal-sub">
        {((data.goal as string) || "").slice(0, 90)}
        {((data.goal as string) || "").length > 90 ? "…" : ""}
      </div>
    </div>
  );
}

function PhaseNode({ data }: NodeProps) {
  const color = data.color as string;
  return (
    <div className="rmn rmn--phase" style={{ borderColor: color }} onClick={data.onSearch as () => void}>
      <AllHandles />
      <div className="rmn__phase-num" style={{ background: color }}>{(data.index as number) + 1}</div>
      <div className="rmn__phase-info">
        <div className="rmn__phase-title">{data.title as string}</div>
        <div className="rmn__phase-dur">{data.duration as string}</div>
      </div>
    </div>
  );
}

function TopicNode({ data }: NodeProps) {
  const color        = data.color as string;
  const onSearch     = data.onSearch as () => void;
  const onResSearch  = data.onResourceSearch as (r: string) => void;
  const onReviewRefs = data.onReviewRefs as (() => void) | undefined;
  const onExpand     = data.onExpand as (() => void) | undefined;
  const onChat       = data.onChat as (() => void) | undefined;
  const resources    = data.resources as string[];
  const title        = data.title as string;
  const desc         = data.description as string;
  const importance   = data.interviewImportance as "high" | "medium" | undefined;
  const tip          = data.interviewTip as string | undefined;
  const expanding    = data.expanding as boolean | undefined;

  const isExpanded = !!(data.isExpanded as boolean | undefined);
  const isDone     = !!(data.isDone     as boolean | undefined);
  const ivColor  = importance === "high" ? "#f59e0b" : importance === "medium" ? "#6366f1" : undefined;
  const ivBorder = ivColor
    ? `2px solid ${ivColor}`
    : isDone
      ? `1.5px solid #22c55e`
      : isExpanded
        ? `1.5px dashed ${color}99`
        : `1.5px solid ${color}`;

  return (
    <div
      className={`rmn rmn--topic ${importance ? "rmn--interview" : ""} ${isExpanded ? "rmn--child" : ""} ${isDone ? "rmn--done" : ""}`}
      style={{ border: ivBorder, boxShadow: ivColor ? `0 0 0 3px ${ivColor}22` : isDone ? "0 0 0 3px #22c55e22" : undefined }}
    >
      <AllHandles />
      {isDone && (
        <div className="rmn__done-badge">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          concluído
        </div>
      )}
      {isExpanded && (
        <div className="rmn__child-badge" style={{ color, borderColor: color + "55", background: color + "12" }}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8V3H6v10h12.17l-2.58 2.58L17 17l5-5-5-5z"/></svg>
          sub-tópico
        </div>
      )}
      {importance && (
        <div className="rmn__iv-badge" style={{ background: ivColor }}>
          {importance === "high" ? "🎯 Alta prioridade" : "🔹 Média prioridade"}
        </div>
      )}
      <div className="rmn__topic-title" onClick={onSearch}>{title}</div>
      <div className="rmn__topic-desc">
        {desc.slice(0, 85)}{desc.length > 85 ? "…" : ""}
      </div>
      {tip && (
        <div className="rmn__iv-tip">💬 {tip}</div>
      )}
      {resources.length > 0 && !importance && (
        <div className="rmn__res-list">
          {resources.slice(0, 2).map((r, i) => (
            <span
              key={i}
              className="rmn__res-badge"
              style={{ borderColor: color + "55" }}
              onClick={(e) => { e.stopPropagation(); onResSearch(r); }}
            >
              📚 {r.length > 30 ? r.slice(0, 30) + "…" : r}
            </span>
          ))}
          {onReviewRefs && (
            <button
              className="rmn__res-review-btn"
              onClick={(e) => { e.stopPropagation(); onReviewRefs(); }}
              title="Revisar referências com base na KB"
            >
              🔍 Revisar refs
            </button>
          )}
        </div>
      )}
      <div className="rmn__node-actions">
        {onExpand && (
          <button
            className="rmn__expand-btn"
            style={{ borderColor: color + "88", color }}
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            disabled={!!expanding}
            title="Expandir: ver subtópicos e dependências diretas"
          >
            {expanding
              ? <><span className="rmn__expand-spin" /> Expandindo…</>
              : <><span className="rmn__expand-plus">+</span> Expandir</>}
          </button>
        )}
        {onChat && (
          <button
            className="rmn__chat-btn"
            style={{ borderColor: color + "88", color }}
            onClick={(e) => { e.stopPropagation(); onChat(); }}
            title="Perguntar sobre este tópico no chat"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
            </svg>
            Chat
          </button>
        )}
      </div>
    </div>
  );
}

function AllHandles() {
  const s = { opacity: 0, width: 6, height: 6 };
  return (
    <>
      <Handle id="s-t" type="source"  position={Position.Top}    style={s} />
      <Handle id="s-b" type="source"  position={Position.Bottom} style={s} />
      <Handle id="s-l" type="source"  position={Position.Left}   style={s} />
      <Handle id="s-r" type="source"  position={Position.Right}  style={s} />
      <Handle id="t-t" type="target"  position={Position.Top}    style={s} />
      <Handle id="t-b" type="target"  position={Position.Bottom} style={s} />
      <Handle id="t-l" type="target"  position={Position.Left}   style={s} />
      <Handle id="t-r" type="target"  position={Position.Right}  style={s} />
    </>
  );
}

const NODE_TYPES = { goalNode: GoalNode, phaseNode: PhaseNode, topicNode: TopicNode };

// ── Checklist Panel ───────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  title: string;
  type: "phase" | "topic" | "subtopic";
  children: ChecklistItem[];
}

interface ChecklistPanelProps {
  roadmap: RoadmapData;
  expandedRecords: Record<string, { parent_id: string; title: string; description: string; color: string }>;
  progress: Record<string, boolean>;
  onToggle: (id: string, checked: boolean) => void;
  onClose: () => void;
}

function ChecklistPanel({ roadmap, expandedRecords, progress, onToggle, onClose }: ChecklistPanelProps) {
  // Build tree from roadmap + expanded nodes
  const tree: ChecklistItem[] = roadmap.phases.map((phase) => {
    const topics: ChecklistItem[] = phase.topics.map((topic) => {
      const subtopics: ChecklistItem[] = Object.entries(expandedRecords)
        .filter(([, rec]) => rec.parent_id === topic.id)
        .map(([id, rec]) => ({ id, title: rec.title, type: "subtopic" as const, children: [] }));
      return { id: topic.id, title: topic.title, type: "topic" as const, children: subtopics };
    });
    return { id: phase.id, title: phase.title, type: "phase" as const, children: topics };
  });

  // Count totals
  const allTopicIds = tree.flatMap(ph =>
    ph.children.flatMap(t => [t.id, ...t.children.map(s => s.id)])
  );
  const doneCount  = allTopicIds.filter(id => progress[id]).length;
  const totalCount = allTopicIds.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const renderItem = (item: ChecklistItem, depth: number) => {
    const done = !!progress[item.id];
    const childIds = item.children.flatMap(c => [c.id, ...c.children.map(s => s.id)]);
    const childDone  = childIds.filter(id => progress[id]).length;
    const childTotal = childIds.length;

    return (
      <div key={item.id}>
        <label
          className={`cl-item cl-item--${item.type} ${done ? "cl-item--done" : ""}`}
          style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
        >
          <input
            type="checkbox"
            className="cl-item__cb"
            checked={done}
            onChange={e => onToggle(item.id, e.target.checked)}
          />
          <span className="cl-item__title">{item.title}</span>
          {item.type === "phase" && childTotal > 0 && (
            <span className="cl-item__count">{childDone}/{childTotal}</span>
          )}
        </label>
        {item.children.map(child => renderItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="cl-panel">
      <div className="cl-panel__header">
        <span className="cl-panel__title">☑ Checklist de progresso</span>
        <button className="cl-panel__close" onClick={onClose}>×</button>
      </div>

      {/* Overall progress bar */}
      <div className="cl-panel__progress">
        <div className="cl-panel__progress-bar">
          <div className="cl-panel__progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="cl-panel__progress-label">{doneCount}/{totalCount} · {pct}%</span>
      </div>

      <div className="cl-panel__list">
        {tree.map(phase => renderItem(phase, 0))}
      </div>
    </div>
  );
}

// ── Roadmap Chat Panel ────────────────────────────────────────────────────────

interface ChatMessage { role: "user" | "assistant"; content: string; timestamp: string; }

interface RoadmapChatPanelProps {
  roadmapId: string;
  provider: string;
  roadmapTitle: string;
  onClose: () => void;
  pinnedNode?: { id: string; title: string; description: string } | null;
  onClearPin?: () => void;
}

function RoadmapChatPanel({ roadmapId, provider, roadmapTitle, onClose, pinnedNode, onClearPin }: RoadmapChatPanelProps) {
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [input,       setInput]       = useState("");
  const [sending,     setSending]     = useState(false);
  const [loadingHist, setLoadingHist] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef     = useRef<any>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/roadmap/${roadmapId}/chat`)
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
      .catch(() => {})
      .finally(() => setLoadingHist(false));
  }, [roadmapId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { alert("Reconhecimento de voz não suportado. Use Chrome ou Edge."); return; }
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = false; rec.interimResults = true;
    rec.onstart  = () => { setIsListening(true); setTranscript(""); };
    rec.onend    = () => setIsListening(false);
    rec.onerror  = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        e.results[i].isFinal ? (final += t) : (interim += t);
      }
      setTranscript(interim || final);
      if (final) { setInput(p => p ? p + " " + final.trim() : final.trim()); setTranscript(""); }
    };
    recRef.current = rec; rec.start();
  };

  const stopListening = () => { recRef.current?.stop(); setIsListening(false); };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/roadmap/${roadmapId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          provider,
          ...(pinnedNode ? { node_context: { id: pinnedNode.id, title: pinnedNode.title, description: pinnedNode.description } } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setMessages(d.messages || []);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Erro ao obter resposta. Tente novamente.", timestamp: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    if (!confirm("Limpar todo o histórico desta conversa?")) return;
    await fetch(`${API_BASE}/roadmap/${roadmapId}/chat`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
  };

  return (
    <div className="rc-panel">
      <div className="rc-panel__header">
        <span className="rc-panel__title">💬 Chat — {roadmapTitle.slice(0, 40)}{roadmapTitle.length > 40 ? "…" : ""}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="rc-panel__clear" onClick={clearChat} title="Limpar histórico">🗑</button>
          <button className="rc-panel__close" onClick={onClose}>×</button>
        </div>
      </div>

      {!pinnedNode && (
        <div className="rc-panel__drop-hint">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
          <span>Arraste um nó do mapa até aqui para conversar sobre ele</span>
        </div>
      )}
      <div className="rc-panel__messages">
        {loadingHist && <div className="rc-panel__hint">Carregando histórico…</div>}
        {!loadingHist && messages.length === 0 && (
          <div className="rc-panel__hint">Sem mensagens ainda. Pergunte qualquer dúvida sobre seu roadmap! 🚀</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`rc-msg rc-msg--${msg.role}`}>
            <div className="rc-msg__bubble">{msg.content}</div>
            <div className="rc-msg__time">
              {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        ))}
        {sending && (
          <div className="rc-msg rc-msg--assistant">
            <div className="rc-msg__bubble rc-msg__typing">
              <span className="rc-dot" /><span className="rc-dot" /><span className="rc-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="rc-panel__footer">
        {pinnedNode && (
          <div className="rc-panel__pin">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
            </svg>
            <span className="rc-panel__pin-label">{pinnedNode.title}</span>
            <button className="rc-panel__pin-clear" onClick={onClearPin} title="Remover contexto">×</button>
          </div>
        )}
        <div className="rc-panel__input-row">
          <textarea
            className="rc-panel__input"
            placeholder={isListening ? "🎤 Ouvindo…" : "Pergunte sobre o roadmap… (Enter para enviar)"}
            value={isListening && transcript ? transcript : input}
            onChange={e => { if (!isListening) setInput(e.target.value); }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            rows={2}
            disabled={sending}
            style={isListening ? { borderColor: "#ef4444", background: "#fff1f1" } : undefined}
          />
          <button
            className={`rc-panel__mic${isListening ? " rc-panel__mic--active" : ""}`}
            onClick={isListening ? stopListening : startListening}
            title={isListening ? "Parar gravação" : "Falar (pt-BR)"}
            type="button"
          >
            {isListening
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 8a1 1 0 0 1 1 1 6 6 0 0 0 12 0 1 1 0 1 1 2 0 8 8 0 0 1-7 7.93V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A8 8 0 0 1 4 12a1 1 0 0 1 1-1z"/></svg>
            }
          </button>
        </div>
        <button
          className="rc-panel__send"
          onClick={sendMessage}
          disabled={sending || !(isListening ? transcript : input).trim()}
        >
          {sending ? <span className="rc-panel__spin" /> : "↑ Enviar"}
        </button>
      </div>
    </div>
  );
}

// ── Syntax Highlighter ────────────────────────────────────────────────────────

const SH_KW: Record<string, string[]> = {
  java: ['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','super','switch','synchronized','this','throw','throws','transient','try','var','void','volatile','while','null','true','false','String','List','Map','Set'],
  python: ['False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield','self','print','range','len'],
  javascript: ['const','let','var','function','return','if','else','for','while','do','class','import','export','default','from','async','await','try','catch','throw','new','this','null','undefined','true','false','typeof','instanceof','of','in','switch','case','break','continue','delete'],
  typescript: ['const','let','var','function','return','if','else','for','while','do','class','import','export','default','from','async','await','try','catch','throw','new','this','null','undefined','true','false','typeof','instanceof','of','in','switch','case','break','continue','interface','type','enum','implements','extends','abstract','public','private','protected','readonly','static'],
};
SH_KW.go = ['break','case','chan','const','continue','default','defer','else','fallthrough','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var','nil','true','false'];

type SHToken = { text: string; color: string };

function shHighlight(code: string, lang: string): SHToken[] {
  const kw = SH_KW[lang.toLowerCase()] ?? SH_KW.javascript;
  const kwPat = kw.map(k => `\\b${k}\\b`).join('|');
  const RE = new RegExp(
    `(\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)` +
    `|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)` +
    `|(\\b\\d+\\.?\\d*\\b)` +
    `|(${kwPat})` +
    `|(\\b[a-zA-Z_$][\\w$]*(?=\\s*\\())` +
    `|([\\s\\S])`,
    'g'
  );
  const tokens: SHToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE.exec(code)) !== null) {
    if      (m[1]) tokens.push({ text: m[1], color: '#6a9955' });
    else if (m[2]) tokens.push({ text: m[2], color: '#ce9178' });
    else if (m[3]) tokens.push({ text: m[3], color: '#b5cea8' });
    else if (m[4]) tokens.push({ text: m[4], color: '#569cd6' });
    else if (m[5]) tokens.push({ text: m[5], color: '#dcdcaa' });
    else           tokens.push({ text: m[6], color: '#d4d4d4' });
  }
  return tokens;
}

function shLines(tokens: SHToken[]): SHToken[][] {
  const lines: SHToken[][] = [[]];
  for (const tok of tokens) {
    const parts = tok.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, color: tok.color });
    });
  }
  return lines;
}

// ── Code Modal ────────────────────────────────────────────────────────────────

type CodeInteractAction = "explain" | "extend" | "new_file";

interface CodeInteraction {
  id: number;
  type: CodeInteractAction;
  selectedCode: string;
  parsed: Record<string, unknown>;
  error?: string;
}

interface CodeModalProps {
  example: CodeExample;
  regenLoading: boolean;
  onClose: () => void;
  onRegen: () => void;
  roadmapId?: string | null;
  topicTitle?: string;
  provider?: string;
  zOffset?: number; // stacking for nested modals
}

function CodeModal({ example, regenLoading, onClose, onRegen, roadmapId, topicTitle = "", provider = "gemini", zOffset = 0 }: CodeModalProps) {
  const [copied,       setCopied]       = useState(false);
  const [currentCode,  setCurrentCode]  = useState(example.code);
  const [selText,      setSelText]      = useState("");
  const [tooltipPos,   setTooltipPos]   = useState<{ x: number; y: number } | null>(null);
  const [interacting,  setInteracting]  = useState<CodeInteractAction | null>(null);
  const [interactions, setInteractions] = useState<CodeInteraction[]>([]);
  const [nestedFile,   setNestedFile]   = useState<CodeExample | null>(null);

  // Execution state
  const [running,     setRunning]     = useState(false);
  const [runOutput,   setRunOutput]   = useState<{ stdout: string; stderr: string; exit_code: number; version: string } | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [stdinInput,  setStdinInput]  = useState("");

  const lines = shLines(shHighlight(currentCode, example.language));

  const copy = () => {
    navigator.clipboard.writeText(currentCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  const handleMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || text.length < 2) { setTooltipPos(null); setSelText(""); return; }
    const range = sel?.getRangeAt(0);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    setSelText(text);
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
  };

  const doInteract = async (action: CodeInteractAction) => {
    if (!selText || !roadmapId) return;
    setInteracting(action);
    setTooltipPos(null);
    window.getSelection()?.removeAllRanges();

    const content = `Código completo (${example.language}):\n\`\`\`${example.language}\n${currentCode}\n\`\`\`\n\nTrecho selecionado:\n\`\`\`\n${selText}\n\`\`\``;

    let parsed: Record<string, unknown> = {};
    let errorMsg: string | undefined;
    try {
      const res = await fetch(`${API_BASE}/roadmap/${roadmapId}/code-interact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, content, topic_title: topicTitle, provider }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      try { parsed = JSON.parse(d.output); } catch { parsed = { explanation: d.output }; }
    } catch (e: unknown) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      setInteracting(null);
    }

    setInteractions(prev => [{ id: Date.now(), type: action, selectedCode: selText, parsed, error: errorMsg }, ...prev]);
  };

  const applyExtension = (newCode: string) => { setCurrentCode(newCode); };

  const runCode = async () => {
    setRunning(true);
    setShowTerminal(true);
    setRunOutput(null);
    try {
      const res = await fetch(`${API_BASE}/code/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentCode, language: example.language, stdin: stdinInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      setRunOutput(data);
    } catch (e: unknown) {
      setRunOutput({ stdout: "", stderr: e instanceof Error ? e.message : String(e), exit_code: -1, version: "" });
    } finally {
      setRunning(false);
    }
  };

  const panelOpen = interactions.length > 0 || !!interacting || showTerminal;

  return (
    <>
      <div className="code-modal__backdrop" onClick={onClose} style={{ zIndex: 99 + zOffset }} />
      <div className={`code-modal${panelOpen ? " code-modal--wide" : ""}`} role="dialog" aria-modal="true" style={{ zIndex: 100 + zOffset }}>
        {/* Header */}
        <div className="code-modal__header">
          <span className="code-modal__lang-pill">{example.language}</span>
          <div className="code-modal__title">{example.title}</div>
          {roadmapId && <span className="code-modal__select-hint">Selecione código → interagir</span>}
          <button className="code-modal__regen" onClick={onRegen} disabled={regenLoading} title="Regenerar">
            {regenLoading ? <span className="code-modal__spin" /> : "🔄"}
          </button>
          <button className="code-modal__run-btn" onClick={runCode} disabled={running} title="Executar código">
            {running ? <><span className="code-modal__spin" /> Executando…</> : "▶ Executar"}
          </button>
          <button className="code-modal__copy" onClick={copy}>
            {copied ? "✓ Copiado!" : "📋 Copiar"}
          </button>
          <button className="code-modal__close" onClick={onClose} title="Fechar">×</button>
        </div>

        {/* Content row: code left + interaction right */}
        <div className="code-modal__content">
          <div className="code-modal__left">
            <div className="code-modal__explanation">{example.explanation}</div>
            <div className="code-modal__body" onMouseUp={handleMouseUp} style={{ position: "relative" }}>
              <div className="code-modal__line-nums" aria-hidden="true">
                {lines.map((_, li) => <div key={li}>{li + 1}</div>)}
              </div>
              <pre className="code-modal__pre">
                {lines.map((line, li) => (
                  <div key={li} className="code-modal__line">
                    {line.map((tok, ti) => (
                      <span key={ti} style={{ color: tok.color }}>{tok.text}</span>
                    ))}
                  </div>
                ))}
              </pre>
            </div>
          </div>

          {/* Interaction panel */}
          {panelOpen && (
            <div className="code-modal__interact-panel">
              <div className="code-modal__interact-head">
                <span>Interações</span>
                <button className="code-modal__interact-clear" onClick={() => { setInteractions([]); setShowTerminal(false); setRunOutput(null); }}>Limpar</button>
              </div>

              {/* ── Terminal output ── */}
              {showTerminal && (
                <div className="code-modal__terminal">
                  <div className="code-modal__terminal-header">
                    <span className="code-modal__terminal-title">
                      {running ? "⏳ Executando…" : runOutput ? (runOutput.exit_code === 0 ? "✅ Saída" : "❌ Erro") : "Terminal"}
                    </span>
                    {runOutput?.version && <span className="code-modal__terminal-badge">{example.language} {runOutput.version}</span>}
                    <button className="code-modal__terminal-close" onClick={() => { setShowTerminal(false); setRunOutput(null); }}>×</button>
                  </div>

                  {/* stdin input */}
                  <div className="code-modal__stdin-row">
                    <span className="code-modal__stdin-label">stdin</span>
                    <input
                      className="code-modal__stdin-input"
                      placeholder="entrada para o programa (opcional)"
                      value={stdinInput}
                      onChange={(e) => setStdinInput(e.target.value)}
                      disabled={running}
                    />
                    <button className="code-modal__run-btn code-modal__run-btn--sm" onClick={runCode} disabled={running}>
                      {running ? <span className="code-modal__spin" /> : "▶"}
                    </button>
                  </div>

                  {running && (
                    <div className="code-modal__terminal-body code-modal__terminal-body--loading">
                      <span className="code-modal__spin code-modal__spin--green" /> compilando e executando…
                    </div>
                  )}

                  {!running && runOutput && (
                    <div className="code-modal__terminal-body">
                      {runOutput.stdout && (
                        <pre className="code-modal__terminal-out">{runOutput.stdout}</pre>
                      )}
                      {runOutput.stderr && (
                        <pre className="code-modal__terminal-err">{runOutput.stderr}</pre>
                      )}
                      {!runOutput.stdout && !runOutput.stderr && (
                        <span className="code-modal__terminal-empty">(sem saída)</span>
                      )}
                      <div className="code-modal__terminal-exit">
                        exit {runOutput.exit_code}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Loading state */}
              {interacting && (
                <div className="code-modal__interact-loading">
                  <span className="code-modal__spin" />
                  <span>{interacting === "explain" ? "Explicando…" : interacting === "extend" ? "Estendendo…" : "Gerando arquivo…"}</span>
                </div>
              )}

              {interactions.map((it) => (
                <div key={it.id} className="code-modal__interact-item">
                  <div className="code-modal__interact-badge">
                    {it.type === "explain" ? "💬 Explicação" : it.type === "extend" ? "➕ Extensão" : "📄 Novo arquivo"}
                  </div>
                  <div className="code-modal__interact-snippet">{it.selectedCode.length > 80 ? it.selectedCode.slice(0, 80) + "…" : it.selectedCode}</div>
                  {it.error && <div className="code-modal__interact-error">{it.error}</div>}

                  {it.type === "explain" && !it.error && (
                    <>
                      <div className="code-modal__interact-text">{String(it.parsed.explanation ?? "")}</div>
                      {Array.isArray(it.parsed.key_concepts) && it.parsed.key_concepts.length > 0 && (
                        <div className="code-modal__interact-concepts">
                          {(it.parsed.key_concepts as string[]).map((c, i) => (
                            <span key={i} className="code-modal__interact-tag">{c}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {it.type === "extend" && !it.error && !!it.parsed.code && (
                    <>
                      <div className="code-modal__interact-text">{String(it.parsed.explanation ?? "")}</div>
                      <button className="code-modal__interact-apply" onClick={() => applyExtension(String(it.parsed.code))}>
                        ✅ Aplicar extensão
                      </button>
                    </>
                  )}

                  {it.type === "new_file" && !it.error && !!it.parsed.code && (
                    <>
                      <div className="code-modal__interact-filename">{String(it.parsed.title ?? "")}</div>
                      <div className="code-modal__interact-text">{String(it.parsed.explanation ?? "")}</div>
                      <button className="code-modal__interact-open" onClick={() => setNestedFile({
                        title: String(it.parsed.title ?? "Novo arquivo"),
                        language: String(it.parsed.language ?? example.language),
                        explanation: String(it.parsed.explanation ?? ""),
                        code: String(it.parsed.code),
                      })}>
                        📂 Abrir arquivo
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selection tooltip */}
      {tooltipPos && selText && (
        <div className="code-sel-tooltip" style={{ position: "fixed", left: tooltipPos.x, top: tooltipPos.y, transform: "translate(-50%, -100%)", zIndex: 200 + zOffset }}>
          {(["explain", "extend", "new_file"] as CodeInteractAction[]).map((action) => (
            <button key={action} className="code-sel-tooltip__btn" onClick={() => doInteract(action)} disabled={!roadmapId || !!interacting}>
              {action === "explain" ? "💬 Explicar" : action === "extend" ? "➕ Estender" : "📄 Novo arquivo"}
            </button>
          ))}
          <button className="code-sel-tooltip__dismiss" onClick={() => { setTooltipPos(null); setSelText(""); window.getSelection()?.removeAllRanges(); }}>×</button>
        </div>
      )}

      {/* Nested modal for new_file */}
      {nestedFile && (
        <CodeModal
          example={nestedFile}
          regenLoading={false}
          onClose={() => setNestedFile(null)}
          onRegen={() => {}}
          zOffset={zOffset + 10}
        />
      )}
    </>
  );
}

// ── KB Panel ──────────────────────────────────────────────────────────────────

interface KbPanelProps {
  query: string;
  topicId: string | null;
  topicTitle: string;
  topicData: RoadmapTopic | null;
  roadmapId: string | null;
  provider: string;
  onClose: () => void;
  onNodeUpdated: (nodeId: string, updates: { title?: string; description?: string; resources?: string[] }) => void;
}

function KbPanel({ query, topicId, topicTitle, topicData, roadmapId, provider, onClose, onNodeUpdated }: KbPanelProps) {
  const [chunks,   setChunks]   = useState<KbChunk[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [askText,  setAskText]  = useState("");
  const [asking,   setAsking]   = useState(false);
  const [answers,  setAnswers]  = useState<AskResult[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // PDF viewer state
  const [pdfModal, setPdfModal] = useState<{ docId: string; docTitle: string; page?: number; chunkId?: string } | null>(null);

  // Edit node
  const [showEdit,      setShowEdit]      = useState(false);
  const [editTitle,     setEditTitle]     = useState(topicData?.title ?? "");
  const [editDesc,      setEditDesc]      = useState(topicData?.description ?? "");
  const [editResources, setEditResources] = useState(topicData?.resources?.join("\n") ?? "");
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState("");

  // Reset edit fields whenever topic changes
  useEffect(() => {
    setEditTitle(topicData?.title ?? "");
    setEditDesc(topicData?.description ?? "");
    setEditResources(topicData?.resources?.join("\n") ?? "");
    setShowEdit(false);
    setEditError("");
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const doEditNode = async () => {
    if (!roadmapId || !topicId) return;
    setEditSaving(true);
    setEditError("");
    try {
      const resources = editResources.split("\n").map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`${API_BASE}/roadmap/${roadmapId}/edit-node`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: topicId, updates: { title: editTitle, description: editDesc, resources } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      onNodeUpdated(topicId, { title: editTitle, description: editDesc, resources });
      setShowEdit(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  };

  // Examples (Q&A generated by LLM)
  const [examples,     setExamples]     = useState<TopicExamples | null>(null);
  const [genLoading,   setGenLoading]   = useState(false);
  const [genMoreLoad,  setGenMoreLoad]  = useState(false);
  const [genError,     setGenError]     = useState("");
  const [showExamples, setShowExamples] = useState(false);

  // Code examples
  const [codeExamples,     setCodeExamples]     = useState<TopicCodeExamples | null>(null);
  const [genCodeLoading,   setGenCodeLoading]   = useState(false);
  const [genCodeError,     setGenCodeError]     = useState("");
  const [showCodeExamples, setShowCodeExamples] = useState(false);

  // Per-item regeneration loading sets
  const [regeneratingQa,   setRegeneratingQa]   = useState<Set<number>>(new Set());
  const [regeneratingCode, setRegeneratingCode] = useState<Set<number>>(new Set());

  // Code viewer modal
  const [codeModalEx, setCodeModalEx] = useState<{ example: CodeExample; index: number } | null>(null);

  // Speech recognition
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { alert("Reconhecimento de voz não suportado. Use Chrome ou Edge."); return; }

    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onstart  = () => { setIsListening(true); setTranscript(""); };
    rec.onend    = () => { setIsListening(false); };
    rec.onerror  = () => { setIsListening(false); };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        e.results[i].isFinal ? (final += t) : (interim += t);
      }
      setTranscript(interim || final);
      if (final) {
        setAskText((prev) => (prev ? prev + " " + final.trim() : final.trim()));
        setTranscript("");
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Load chunks + any previously saved examples when query/topic changes
  useEffect(() => {
    if (!query) return;
    setAnswers([]);
    setAskText("");
    setExpanded(new Set());
    setExamples(null);
    setShowExamples(false);
    setGenError("");
    setCodeExamples(null);
    setShowCodeExamples(false);
    setGenCodeError("");

    setLoading(true);
    fetch(`${API_BASE}/knowledge/search?q=${encodeURIComponent(query)}&top_k=10`)
      .then((r) => r.json())
      .then((d) => setChunks(d.results || []))
      .catch(() => setChunks([]))
      .finally(() => setLoading(false));

    // Load saved examples for this topic
    if (roadmapId && topicId) {
      fetch(`${API_BASE}/roadmap/${roadmapId}`)
        .then((r) => r.json())
        .then((d) => {
          const ex = d?.examples?.[topicId];
          if (ex) { setExamples(ex); setShowExamples(true); }
          const cx = d?.code_examples?.[topicId];
          if (cx) { setCodeExamples(cx); setShowCodeExamples(true); }
          // Load saved interactions for this topic
          const interactions: AskResult[] = (d?.interactions || [])
            .filter((i: { context: string }) => i.context === topicTitle)
            .map((i: { answer: string; sources: KbChunk[] }) => ({ answer: i.answer, sources: i.sources || [] }));
          if (interactions.length) setAnswers(interactions);
        })
        .catch(() => {});
    }
  }, [query, topicId, roadmapId, topicTitle]);

  // Ask and auto-save interaction
  const doAsk = async () => {
    if (!askText.trim()) return;
    const q = askText.trim();
    setAsking(true);
    try {
      const r = await fetch(`${API_BASE}/knowledge/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, top_k: 8 }),
      });
      const d = await r.json();
      const result: AskResult = { answer: d.answer || "Sem resposta.", sources: d.sources || [] };
      setAnswers((prev) => [...prev, result]);
      setAskText("");

      // Persist interaction linked to roadmap
      if (roadmapId) {
        fetch(`${API_BASE}/roadmap/${roadmapId}/save-interaction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            answer: result.answer,
            sources: result.sources.slice(0, 3).map((s) => ({ title: s.title, page: s.page_number })),
            context: topicTitle,
          }),
        }).catch(() => {});
      }
    } catch {
      setAnswers((prev) => [...prev, { answer: "Erro ao consultar a base.", sources: [] }]);
    } finally {
      setAsking(false);
    }
  };

  // Generate examples via LLM
  const generateExamples = async () => {
    if (!roadmapId || !topicId) return;
    setGenLoading(true);
    setGenError("");
    try {
      const r = await fetch(`${API_BASE}/roadmap/${roadmapId}/generate-examples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, topic_description: topicData?.description ?? "", provider }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setExamples({
        topic_title: topicTitle,
        generated_at: new Date().toISOString(),
        provider: d.provider,
        model: d.model,
        qa_pairs: d.qa_pairs || [],
      });
      setShowExamples(true);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenLoading(false);
    }
  };

  // Append 5 more Q&A pairs to existing ones
  const generateMoreExamples = async () => {
    if (!roadmapId || !topicId) return;
    setGenMoreLoad(true);
    setGenError("");
    try {
      const r = await fetch(`${API_BASE}/roadmap/${roadmapId}/generate-examples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, topic_description: topicData?.description ?? "", provider, append: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setExamples({
        topic_title: topicTitle,
        generated_at: new Date().toISOString(),
        provider: d.provider,
        model: d.model,
        qa_pairs: d.qa_pairs || [],
      });
      setShowExamples(true);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenMoreLoad(false);
    }
  };

  // Generate code examples
  const generateCodeExamples = async () => {
    if (!roadmapId || !topicId) return;
    setGenCodeLoading(true);
    setGenCodeError("");
    try {
      const r = await fetch(`${API_BASE}/roadmap/${roadmapId}/generate-code-examples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, topic_description: topicData?.description ?? "", provider }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setCodeExamples({
        topic_title: topicTitle,
        generated_at: new Date().toISOString(),
        provider: d.provider,
        model: d.model,
        code_examples: d.code_examples || [],
      });
      setShowCodeExamples(true);
    } catch (e: unknown) {
      setGenCodeError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenCodeLoading(false);
    }
  };

  // Regenerate a single Q&A pair at a given index
  const regenQaPair = async (pairIndex: number) => {
    if (!roadmapId || !topicId) return;
    setRegeneratingQa((prev) => new Set(prev).add(pairIndex));
    try {
      const r = await fetch(`${API_BASE}/roadmap/${roadmapId}/regenerate-qa-pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, topic_description: topicData?.description ?? "", pair_index: pairIndex, provider }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setExamples((prev) => prev ? { ...prev, qa_pairs: d.qa_pairs } : prev);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeneratingQa((prev) => { const s = new Set(prev); s.delete(pairIndex); return s; });
    }
  };

  // Regenerate a single code example at a given index
  const regenCodeExample = async (exIndex: number) => {
    if (!roadmapId || !topicId) return;
    setRegeneratingCode((prev) => new Set(prev).add(exIndex));
    try {
      const r = await fetch(`${API_BASE}/roadmap/${roadmapId}/regenerate-code-example`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, topic_description: topicData?.description ?? "", example_index: exIndex, provider }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      setCodeExamples((prev) => prev ? { ...prev, code_examples: d.code_examples } : prev);
    } catch (e: unknown) {
      setGenCodeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegeneratingCode((prev) => { const s = new Set(prev); s.delete(exIndex); return s; });
    }
  };

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });

  const DIFF_COLOR: Record<string, string> = {
    conceitual: "var(--primary)", prática: "var(--success)", desafiadora: "var(--warning)",
  };

  return (
    <>
    <div className="kb-panel">
      {/* Header */}
      <div className="kb-panel__header">
        <div>
          <div className="kb-panel__label">Base de Conhecimento</div>
          <div className="kb-panel__query">"{topicTitle || query}"</div>
        </div>
        <button className="kb-panel__close" onClick={onClose}>×</button>
      </div>

      {/* Ask bar */}
      <div className="kb-panel__ask">
        <div className="kb-panel__ask-wrap">
          <input
            className="kb-panel__ask-input"
            placeholder={isListening ? "Ouvindo…" : "Fazer uma pergunta sobre este tópico…"}
            value={isListening && transcript ? transcript : askText}
            onChange={(e) => { if (!isListening) setAskText(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !isListening) doAsk(); }}
            style={isListening ? { borderColor: "#ef4444", background: "#fff1f1" } : undefined}
          />
          <button
            className={`kb-panel__mic-btn ${isListening ? "kb-panel__mic-btn--active" : ""}`}
            onClick={isListening ? stopListening : startListening}
            title={isListening ? "Parar gravação" : "Falar pergunta (pt-BR)"}
            type="button"
          >
            {isListening ? (
              <span className="kb-panel__mic-pulse">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2"/>
                </svg>
              </span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 8a1 1 0 0 1 1 1 6 6 0 0 0 12 0 1 1 0 1 1 2 0 8 8 0 0 1-7 7.93V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A8 8 0 0 1 4 12a1 1 0 0 1 1-1z"/>
              </svg>
            )}
          </button>
        </div>
        <button className="kb-panel__ask-btn" onClick={doAsk} disabled={asking || !askText.trim()}>
          {asking ? <span className="kb-panel__spin" /> : "Perguntar"}
        </button>
      </div>

      {/* Accumulated answers */}
      {answers.map((ans, ai) => (
        <div key={ai} className="kb-panel__answer">
          <div className="kb-panel__answer-label">Resposta {answers.length > 1 ? ai + 1 : ""}</div>
          <div className="kb-panel__answer-text">{ans.answer}</div>
          {ans.sources.length > 0 && (
            <div className="kb-panel__answer-sources">
              <span className="kb-panel__answer-src-label">Fontes:</span>
              {ans.sources.slice(0, 3).map((s, i) => (
                <span key={i} className="kb-panel__answer-src-tag">
                  {s.title}{s.page_number ? ` p.${s.page_number}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Generate buttons bar */}
      {topicId && roadmapId && (
        <div className="kb-panel__gen-bar">
          <button className="kb-panel__gen-btn" onClick={generateExamples} disabled={genLoading || genMoreLoad}>
            {genLoading ? <><span className="kb-panel__spin" /> Gerando…</> : examples ? "🔄 Regenerar Q&A" : "✨ Gerar Exemplos Q&A"}
          </button>
          {examples && (
            <button className="kb-panel__gen-btn kb-panel__gen-btn--more" onClick={generateMoreExamples} disabled={genLoading || genMoreLoad}>
              {genMoreLoad ? <><span className="kb-panel__spin" /> Gerando…</> : "➕ Mais exemplos"}
            </button>
          )}
          <button className="kb-panel__gen-btn kb-panel__gen-btn--code" onClick={generateCodeExamples} disabled={genCodeLoading}>
            {genCodeLoading ? <><span className="kb-panel__spin" /> Gerando…</> : codeExamples ? "🔄 Regen. código" : "💻 Gerar códigos"}
          </button>
          {examples && (
            <button className="kb-panel__toggle-ex" onClick={() => setShowExamples((v) => !v)}>
              {showExamples ? "▲" : "▼"} Q&A ({examples.qa_pairs.length})
            </button>
          )}
          {codeExamples && (
            <button className="kb-panel__toggle-ex" onClick={() => setShowCodeExamples((v) => !v)}>
              {showCodeExamples ? "▲" : "▼"} Código ({codeExamples.code_examples.length})
            </button>
          )}
          {(genError || genCodeError) && (
            <span className="kb-panel__gen-err">{genError || genCodeError}</span>
          )}
        </div>
      )}

      {/* Q&A Examples section */}
      {showExamples && examples && (
        <div className="kb-panel__examples">
          <div className="kb-panel__ex-head">
            <span className="kb-panel__ex-title">Exemplos Q&amp;A</span>
            <span className="kb-panel__ex-meta">{examples.provider} · {examples.model} · {examples.qa_pairs.length} pares</span>
          </div>
          {examples.qa_pairs.map((qa, qi) => (
            <div key={qi} className="kb-panel__qa">
              <div className="kb-panel__qa-header">
                <span className="kb-panel__qa-badge" style={{ background: DIFF_COLOR[qa.difficulty] || "var(--primary)" }}>
                  {qa.difficulty}
                </span>
                <button
                  className="kb-panel__item-regen"
                  onClick={() => regenQaPair(qi)}
                  disabled={regeneratingQa.has(qi)}
                  title="Regenerar este par"
                >
                  {regeneratingQa.has(qi) ? <span className="kb-panel__spin--dark" /> : "🔄"}
                </button>
              </div>
              <div className="kb-panel__qa-q">{qa.question}</div>
              <div className="kb-panel__qa-a">{qa.answer}</div>
              {qa.sources.length > 0 && (
                <div className="kb-panel__qa-sources">
                  {qa.sources.map((s, si) => <span key={si} className="kb-panel__answer-src-tag">{s}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Code Examples section */}
      {showCodeExamples && codeExamples && (
        <div className="kb-panel__examples">
          <div className="kb-panel__ex-head">
            <span className="kb-panel__ex-title">Exemplos de Código</span>
            <span className="kb-panel__ex-meta">{codeExamples.provider} · {codeExamples.model}</span>
          </div>
          {codeExamples.code_examples.map((ex, ei) => (
            <div key={ei} className="kb-panel__code-ex">
              <div className="kb-panel__code-title">
                <span className="kb-panel__code-num">{ei + 1}</span>
                <span className="kb-panel__code-title-text">{ex.title}</span>
                <span className="kb-panel__code-lang">{ex.language}</span>
                <button
                  className="kb-panel__item-regen"
                  onClick={() => regenCodeExample(ei)}
                  disabled={regeneratingCode.has(ei)}
                  title="Regenerar este código"
                >
                  {regeneratingCode.has(ei) ? <span className="kb-panel__spin--dark" /> : "🔄"}
                </button>
                <button
                  className="kb-panel__code-view-btn"
                  onClick={() => setCodeModalEx({ example: ex, index: ei })}
                  title="Ver código formatado"
                >
                  👁 Ver
                </button>
              </div>
              <div className="kb-panel__code-explanation">{ex.explanation}</div>
            </div>
          ))}
        </div>
      )}

      {/* Edit topic section */}
      {topicId && roadmapId && (
        <div className="kb-panel__edit-section">
          <button className="kb-panel__edit-toggle" onClick={() => setShowEdit((v) => !v)} type="button">
            {showEdit ? "▲" : "✏️"} Editar tópico
          </button>
          {showEdit && (
            <div className="kb-panel__edit-form">
              <label className="kb-panel__edit-label">Título</label>
              <input
                className="kb-panel__edit-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <label className="kb-panel__edit-label">Descrição</label>
              <textarea
                className="kb-panel__edit-textarea"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
              />
              <label className="kb-panel__edit-label">Recursos (um por linha)</label>
              <textarea
                className="kb-panel__edit-textarea"
                value={editResources}
                onChange={(e) => setEditResources(e.target.value)}
                rows={3}
                placeholder="Nome do livro ou recurso&#10;Outro recurso"
              />
              <div className="kb-panel__edit-actions">
                <button className="kb-panel__edit-save" onClick={doEditNode} disabled={editSaving} type="button">
                  {editSaving ? <><span className="kb-panel__spin" /> Salvando…</> : "Salvar"}
                </button>
                <button className="kb-panel__edit-cancel" onClick={() => setShowEdit(false)} type="button">Cancelar</button>
                {editError && <span className="kb-panel__edit-err">{editError}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chunks */}
      <div className="kb-panel__scroll">
        {loading && (
          <div className="kb-panel__loading">
            <div className="kb-panel__load-bar" />
            <span>Buscando na base…</span>
          </div>
        )}
        {!loading && chunks.length === 0 && (
          <div className="kb-panel__empty">Nenhum conteúdo encontrado para este tópico na base.</div>
        )}
        {chunks.map((chunk) => {
          const key = `${chunk.doc_id}-${chunk.chunk_index}`;
          const exp = expanded.has(key);
          const isImg = chunk.chunk_kind === "figure" && chunk.image_path;
          const pct = Math.round(chunk.score * 100);
          return (
            <div key={key} className="kb-chunk">
              <div className="kb-chunk__head">
                <div className="kb-chunk__meta">
                  <span className="kb-chunk__book">{chunk.title}</span>
                  {chunk.page_number && <span className="kb-chunk__page">pág {chunk.page_number}</span>}
                  {chunk.section_title && <span className="kb-chunk__section">{chunk.section_title}</span>}
                  {chunk.minio_key && (
                    <button
                      type="button"
                      title="Abrir PDF no ponto exato"
                      onClick={() => setPdfModal({ docId: chunk.doc_id, docTitle: chunk.title, page: chunk.page_number ?? undefined, chunkId: chunk.chunk_id })}
                      style={{
                        background: "rgba(79,125,243,.12)", border: "none", borderRadius: 4,
                        cursor: "pointer", padding: "2px 7px", color: "#4f7df3",
                        fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3,
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      PDF
                    </button>
                  )}
                </div>
                <div className="kb-chunk__score-wrap">
                  <div className="kb-chunk__score-bar">
                    <div className="kb-chunk__score-fill" style={{
                      width: `${pct}%`,
                      background: pct >= 80 ? "var(--success)" : pct >= 55 ? "var(--primary)" : "var(--warning)",
                    }} />
                  </div>
                  <span className="kb-chunk__score-num">{pct}%</span>
                </div>
              </div>
              {isImg ? (
                <img src={`${API_BASE}/knowledge/image?path=${encodeURIComponent(chunk.image_path!)}`}
                  alt={chunk.content} className="kb-chunk__image" />
              ) : (
                <div className="kb-chunk__text">
                  {exp ? chunk.content : chunk.content.slice(0, 220) + (chunk.content.length > 220 ? "…" : "")}
                </div>
              )}
              {!isImg && chunk.content.length > 220 && (
                <button className="kb-chunk__expand" onClick={() => toggleExpand(key)}>
                  {exp ? "Recolher" : "Ler mais"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
    {codeModalEx && (
      <CodeModal
        example={codeModalEx.example}
        regenLoading={regeneratingCode.has(codeModalEx.index)}
        onClose={() => setCodeModalEx(null)}
        onRegen={() => regenCodeExample(codeModalEx.index)}
        roadmapId={roadmapId}
        topicTitle={topicTitle}
        provider={provider}
      />
    )}
    {pdfModal && (
      <PdfViewerModal
        docId={pdfModal.docId}
        docTitle={pdfModal.docTitle}
        initialPage={pdfModal.page}
        initialChunkId={pdfModal.chunkId}
        onClose={() => setPdfModal(null)}
      />
    )}
    </>
  );
}

// ── Saved Roadmap Types ────────────────────────────────────────────────────────

interface SavedItem {
  id: string;
  title: string;
  goal: string;
  provider: string;
  model: string;
  created_at: string;
  phase_count: number;
  topic_count: number;
}

// ── Saved Roadmaps Sidebar ─────────────────────────────────────────────────────

interface SavedSidebarProps {
  active: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  refreshTick: number;
}

function SavedSidebar({ active, onLoad, onDelete: _onDelete, onNew, refreshTick }: SavedSidebarProps) {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/roadmap/list`)
      .then((r) => r.json())
      .then((d) => setItems(d.roadmaps || []))
      .catch(() => {});
  }, [refreshTick]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleting(id);
    await fetch(`${API_BASE}/roadmap/${id}`, { method: "DELETE" }).catch(() => {});
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleting(null);
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso.slice(0, 10); }
  };

  return (
    <div className="rg2__sidebar">
      <div className="rg2__sidebar-head">
        <span className="rg2__sidebar-title">Roadmaps Salvos</span>
        <button className="rg2__sidebar-new" onClick={onNew} title="Novo roadmap">＋</button>
      </div>
      <div className="rg2__sidebar-list">
        {items.length === 0 && (
          <div className="rg2__sidebar-empty">Nenhum roadmap salvo ainda.</div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className={`rg2__saved-item ${active === item.id ? "rg2__saved-item--active" : ""}`}
            onClick={() => onLoad(item.id)}
          >
            <div className="rg2__saved-title">{item.title || item.goal}</div>
            <div className="rg2__saved-meta">
              <span>{item.phase_count} fases · {item.topic_count} tópicos</span>
              <span>{fmtDate(item.created_at)}</span>
            </div>
            <div className="rg2__saved-badges">
              <span className="rg2__saved-badge">{item.provider}</span>
            </div>
            <button
              className="rg2__saved-del"
              onClick={(e) => handleDelete(e, item.id)}
              disabled={deleting === item.id}
              title="Deletar"
            >
              {deleting === item.id ? "…" : "✕"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Export Panel (inner component — needs ReactFlow context) ──────────────────

const EXPORT_W = 3840;
const EXPORT_H = 2160;
const EXPORT_PIXEL_RATIO = 2; // renders at 2× → effective 7680×4320

function ExportPanel({ title }: { title: string }) {
  const { getNodes } = useReactFlow();
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);

  const capture = async (): Promise<string> => {
    const nodes = getNodes();
    const bounds = getNodesBounds(nodes);
    const transform = getViewportForBounds(bounds, EXPORT_W, EXPORT_H, 0.05, 2, 0.08);
    const viewport = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!viewport) throw new Error("canvas not found");
    const { toPng } = await import("html-to-image");
    return toPng(viewport, {
      backgroundColor: "#0f1117",
      width: EXPORT_W,
      height: EXPORT_H,
      pixelRatio: EXPORT_PIXEL_RATIO,
      cacheBust: true,
      style: {
        width: `${EXPORT_W}px`,
        height: `${EXPORT_H}px`,
        transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.zoom})`,
        transformOrigin: "top left",
      },
    });
  };

  const exportPng = async () => {
    setExporting("png");
    try {
      const dataUrl = await capture();
      const a = document.createElement("a");
      a.download = `roadmap-${title.slice(0, 40).replace(/\s+/g, "-")}.png`;
      a.href = dataUrl;
      a.click();
    } finally { setExporting(null); }
  };

  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const dataUrl = await capture();
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [EXPORT_W, EXPORT_H], hotfixes: ["px_scaling"] });
      pdf.addImage(dataUrl, "PNG", 0, 0, EXPORT_W, EXPORT_H);
      pdf.save(`roadmap-${title.slice(0, 40).replace(/\s+/g, "-")}.pdf`);
    } finally { setExporting(null); }
  };

  return (
    <Panel position="top-right" className="rg2__export-panel">
      <button
        className="rg2__export-btn"
        onClick={exportPng}
        disabled={!!exporting}
        title="Exportar como PNG"
      >
        {exporting === "png" ? <><span className="rg2__export-spin" />PNG…</> : "↓ PNG"}
      </button>
      <button
        className="rg2__export-btn"
        onClick={exportPdf}
        disabled={!!exporting}
        title="Exportar como PDF"
      >
        {exporting === "pdf" ? <><span className="rg2__export-spin" />PDF…</> : "↓ PDF"}
      </button>
    </Panel>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function RoadmapGenerator() {
  const [goal,    setGoal]    = useState("");
  const [provider,setProvider]= useState("gemini");
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error,   setError]   = useState("");
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Canvas interaction mode: pan (mãozinha) ↔ select (ponteiro + multi-drag)
  const [interactionMode, setInteractionMode] = useState<"pan" | "select">("pan");

  // Checklist state
  const [showChecklist, setShowChecklist] = useState(false);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const saveProgressTick = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatPinnedNode, setChatPinnedNode] = useState<{ id: string; title: string; description: string } | null>(null);
  const preDragPosRef = useRef<{ x: number; y: number } | null>(null);

  // Expand state
  const [showExpand,  setShowExpand]  = useState(false);
  const [expandText,  setExpandText]  = useState("");
  const [expanding,   setExpanding]   = useState(false);
  const [expandError, setExpandError] = useState("");

  // Review state
  const [reviewing,    setReviewing]    = useState(false);
  const [reviewError,  setReviewError]  = useState("");
  const [reviewedAt,   setReviewedAt]   = useState<string | null>(null);

  // LinkedIn Studio state
  const [showLinkedinStudio, setShowLinkedinStudio] = useState(false);
  const [linkedinPost,       setLinkedinPost]       = useState<string | null>(null);
  const [linkedinPostId,     setLinkedinPostId]     = useState<string | null>(null);
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false);
  const [linkedinError,      setLinkedinError]      = useState("");
  const [linkedinCopied,     setLinkedinCopied]     = useState(false);
  const [liTopicFocus,       setLiTopicFocus]       = useState("");
  const [liCustomPrompt,     setLiCustomPrompt]     = useState("");
  const [liIsListening,      setLiIsListening]      = useState(false);
  const [liTranscript,       setLiTranscript]       = useState("");
  const liRecRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [savedPosts,         setSavedPosts]         = useState<{id:string;content:string;topic_focus:string;created_at:string}[]>([]);
  const [liCrons,            setLiCrons]            = useState<{id:string;schedule:string;topic_focus:string;next_run_at:string|null}[]>([]);
  const [liCronSchedule,     setLiCronSchedule]     = useState("weekly");
  const [creatingCron,       setCreatingCron]       = useState(false);

  // How it works modal
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // KB panel context
  const [kbContext, setKbContext] = useState<{ query: string; topicId: string | null; topicTitle: string; topicData: RoadmapTopic | null } | null>(null);

  // ReactFlow
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Open KB panel — for topics, pass topicId + resolve full topic data
  const handleSearch = useCallback((q: string, topicId?: string) => {
    let topicData: RoadmapTopic | null = null;
    if (topicId && roadmapRef.current) {
      // 1. look in roadmap phases
      for (const phase of roadmapRef.current.phases) {
        const found = phase.topics.find((t) => t.id === topicId);
        if (found) { topicData = found; break; }
      }
      // 2. fallback: expanded node stored in ref → build synthetic RoadmapTopic
      if (!topicData && expandedRecordsRef.current[topicId]) {
        const rec = expandedRecordsRef.current[topicId];
        topicData = { id: topicId, title: rec.title, description: rec.description, resources: [], prerequisites: [] };
      }
    }
    setKbContext({ query: q, topicId: topicId ?? null, topicTitle: q, topicData });
  }, []);

  // Refs para evitar stale closures no drag handler e em handleSearch
  const savedIdRef   = useRef<string | null>(null);
  const nodesRef     = useRef<Node[]>([]);
  const roadmapRef   = useRef<RoadmapData | null>(null);
  const savePosTick  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doReviewRef  = useRef<() => void>(() => {});

  // Ref que acumula todos os nós expandidos: id → record
  const expandedRecordsRef = useRef<Record<string, { parent_id: string; title: string; description: string; color: string }>>({});

  useEffect(() => { savedIdRef.current = savedId; }, [savedId]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { roadmapRef.current = roadmap; }, [roadmap]);

  // Sync progress → node data.isDone so TopicNode can render done state
  useEffect(() => {
    setNodes(nds => nds.map(n => {
      const done = !!progress[n.id];
      if (!!n.data.isDone === done) return n;
      return { ...n, data: { ...n.data, isDone: done } };
    }));
  }, [progress, setNodes]);

  // Fetch the app's default LLM provider from settings on mount
  useEffect(() => {
    fetch(`${API_BASE}/settings/default-provider`)
      .then((r) => r.json())
      .then((d) => { if (d.provider) setProvider(d.provider); })
      .catch(() => {});
  }, []);

  const flushPositions = useCallback(() => {
    const id = savedIdRef.current;
    if (!id) return;
    const positions: SavedPositions = {};
    nodesRef.current.forEach((n) => { positions[n.id] = n.position; });
    fetch(`${API_BASE}/roadmap/${id}/positions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions }),
    }).catch(() => {});
  }, []);

  const savePositions = useCallback(() => {
    if (savePosTick.current) clearTimeout(savePosTick.current);
    savePosTick.current = setTimeout(flushPositions, 600);
  }, [flushPositions]);

  const handleOpenChat = useCallback((nodeId?: string, title?: string, description?: string) => {
    setShowChat(true);
    if (nodeId && title) {
      setChatPinnedNode({ id: nodeId, title, description: description ?? "" });
    }
  }, []);

  const handleNodeDragStart = useCallback((_evt: React.MouseEvent, node: Node) => {
    preDragPosRef.current = { x: node.position.x, y: node.position.y };
  }, []);

  const handleNodeDragStop = useCallback((evt: React.MouseEvent, node: Node) => {
    // Check if dropped onto the chat panel — if so, pin the node as context
    const panel = document.querySelector(".rc-panel") as HTMLElement | null;
    if (panel && showChat) {
      const rect = panel.getBoundingClientRect();
      if (
        evt.clientX >= rect.left && evt.clientX <= rect.right &&
        evt.clientY >= rect.top  && evt.clientY <= rect.bottom
      ) {
        // Restore pre-drag position so the node stays on canvas
        if (preDragPosRef.current) {
          const prev = preDragPosRef.current;
          setNodes(nds => nds.map(n => n.id === node.id ? { ...n, position: prev } : n));
        }
        // Pin node as chat context
        const title       = node.data.title as string;
        const description = (node.data.description as string) ?? "";
        setChatPinnedNode({ id: node.id, title, description });
        return; // skip savePositions — position restored
      }
    }
    savePositions();
  }, [showChat, savePositions, setNodes]);

  const saveExpansions = useCallback(() => {
    const id = savedIdRef.current;
    if (!id) return;
    const expanded_nodes = Object.entries(expandedRecordsRef.current).map(([nodeId, rec]) => ({
      id: nodeId, ...rec,
    }));
    fetch(`${API_BASE}/roadmap/${id}/expansions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expanded_nodes }),
    }).catch(() => {});
  }, []);

  const doExpand = async () => {
    if (!savedIdRef.current || !expandText.trim()) return;
    setExpanding(true);
    setExpandError("");
    try {
      const res = await fetch(`${API_BASE}/roadmap/${savedIdRef.current}/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expansion: expandText.trim(), provider }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      applyRoadmap(d);
      setExpandText("");
      setShowExpand(false);
      setRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      setExpandError(e instanceof Error ? e.message : String(e));
    } finally {
      setExpanding(false);
    }
  };

  const doReview = async () => {
    if (!savedIdRef.current) return;
    setReviewing(true);
    setReviewError("");
    try {
      const res = await fetch(`${API_BASE}/roadmap/${savedIdRef.current}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      applyRoadmap(d);
      setReviewedAt(new Date().toLocaleTimeString());
      setRefreshTick((t) => t + 1);
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewing(false);
    }
  };

  // Keep ref in sync so buildLayout closures always call the latest version
  doReviewRef.current = doReview;

  const loadSavedPosts = useCallback(async (id: string) => {
    const r = await fetch(`${API_BASE}/roadmap/${id}/linkedin-posts`).catch(() => null);
    if (r?.ok) { const d = await r.json(); setSavedPosts(d.posts || []); }
  }, []);

  const loadLiCrons = useCallback(async (id: string) => {
    const r = await fetch(`${API_BASE}/roadmap/${id}/linkedin-crons`).catch(() => null);
    if (r?.ok) { const d = await r.json(); setLiCrons(d.crons || []); }
  }, []);

  const openLinkedinStudio = useCallback(() => {
    setShowLinkedinStudio(true);
    const id = savedIdRef.current;
    if (id) { loadSavedPosts(id); loadLiCrons(id); }
  }, [loadSavedPosts, loadLiCrons]);

  const doGenerateLinkedin = async () => {
    if (!savedIdRef.current) return;
    setGeneratingLinkedin(true);
    setLinkedinError("");
    setLinkedinPost(null);
    try {
      const res = await fetch(`${API_BASE}/roadmap/${savedIdRef.current}/linkedin-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, topic_focus: liTopicFocus, custom_prompt: liCustomPrompt }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      setLinkedinPost(d.post);
      setLinkedinPostId(d.post_id || null);
      if (savedIdRef.current) loadSavedPosts(savedIdRef.current);
    } catch (e: unknown) {
      setLinkedinError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingLinkedin(false);
    }
  };

  const liStartListening = () => {
    const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = false; rec.interimResults = true;
    rec.onstart  = () => { setLiIsListening(true); setLiTranscript(""); };
    rec.onend    = () => setLiIsListening(false);
    rec.onerror  = () => setLiIsListening(false);
    rec.onresult = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        e.results[i].isFinal ? (final += t) : (interim += t);
      }
      setLiTranscript(interim || final);
      if (final) { setLiCustomPrompt(p => p ? p + " " + final.trim() : final.trim()); setLiTranscript(""); }
    };
    liRecRef.current = rec; rec.start();
  };
  const liStopListening = () => { liRecRef.current?.stop(); setLiIsListening(false); };

  const liAppendElement = (text: string) => setLiCustomPrompt(p => p ? p + " " + text : text);

  const doCreateLiCron = async () => {
    if (!savedIdRef.current) return;
    setCreatingCron(true);
    try {
      const r = await fetch(`${API_BASE}/roadmap/${savedIdRef.current}/linkedin-cron`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: liCronSchedule, topic_focus: liTopicFocus, prompt: liCustomPrompt, provider }),
      });
      if (r.ok && savedIdRef.current) await loadLiCrons(savedIdRef.current);
    } finally { setCreatingCron(false); }
  };

  const doDeleteLiCron = async (cronId: string) => {
    await fetch(`${API_BASE}/linkedin-crons/${cronId}`, { method: "DELETE" }).catch(() => {});
    setLiCrons(prev => prev.filter(c => c.id !== cronId));
  };

  const doDeleteSavedPost = async (postId: string) => {
    await fetch(`${API_BASE}/linkedin-posts/${postId}`, { method: "DELETE" }).catch(() => {});
    setSavedPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleNodeUpdated = useCallback((nodeId: string, updates: { title?: string; description?: string; resources?: string[] }) => {
    setRoadmap((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        phases: prev.phases.map((p) => ({
          ...p,
          topics: p.topics.map((t) => t.id === nodeId ? { ...t, ...updates } : t),
        })),
      };
    });
    setNodes((nds) => nds.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
    ));
    setKbContext((ctx) => {
      if (!ctx || ctx.topicId !== nodeId) return ctx;
      return { ...ctx, topicTitle: updates.title ?? ctx.topicTitle, topicData: ctx.topicData ? { ...ctx.topicData, ...updates } : null };
    });
  }, [setNodes]);

  const handleExpandTopic = useCallback(async (
    topicId: string, title: string, description: string,
    color: string,
  ) => {
    // Captura posição ANTES de qualquer await — garante que é a posição atual do nó
    const parentNode = nodesRef.current.find(n => n.id === topicId);
    const parentX = parentNode?.position.x ?? 0;
    const parentY = parentNode?.position.y ?? 0;

    // Mark node as expanding
    setNodes(nds => nds.map(n => n.id === topicId ? { ...n, data: { ...n.data, expanding: true } } : n));
    try {
      const res = await fetch(`${API_BASE}/roadmap/expand-topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_title: title, topic_description: description, roadmap_goal: roadmap?.goal ?? "", provider, roadmap_id: savedIdRef.current ?? "", parent_topic_id: topicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      const subtopics: { id: string; title: string; description: string }[] = data.subtopics || [];
      if (!subtopics.length) return;

      const R = 220;
      const newNodes: Node[] = subtopics.map((st, i) => {
        const angle = (i / subtopics.length) * 2 * Math.PI - Math.PI / 2;
        const nodeId = `exp-${topicId}-${st.id}-${i}`;
        const nx = parentX + R * Math.cos(angle);
        const ny = parentY + R * Math.sin(angle);
        return {
          id: nodeId, type: "topicNode", draggable: true,
          position: { x: nx, y: ny },
          data: {
            title: st.title, description: st.description,
            resources: [], color, isExpanded: true,
            onSearch: () => handleSearch(st.title, nodeId),
            onResourceSearch: (r: string) => handleSearch(r),
            onExpand: () => handleExpandTopic(nodeId, st.title, st.description, color),
            onChat: () => handleOpenChat(nodeId, st.title, st.description),
          },
        };
      });

      const newEdges: Edge[] = subtopics.map((_, i) => ({
        id: `exp-edge-${topicId}-${i}`,
        source: topicId,
        target: newNodes[i].id,
        style: { stroke: color + "99", strokeWidth: 1.2, strokeDasharray: "5 3" },
        animated: true,
      }));

      // Registra no ref para persistência
      subtopics.forEach((st, i) => {
        expandedRecordsRef.current[newNodes[i].id] = {
          parent_id: topicId, title: st.title, description: st.description, color,
        };
      });

      setNodes(nds => [...nds, ...newNodes]);
      setEdges(eds => [...eds, ...newEdges]);
      saveExpansions();
      savePositions(); // posições dos novos nós também
    } catch (e) {
      console.error("expand-topic error:", e);
    } finally {
      setNodes(nds => nds.map(n => n.id === topicId ? { ...n, data: { ...n.data, expanding: false } } : n));
    }
  }, [provider, roadmap, handleSearch, handleOpenChat, setNodes, setEdges, saveExpansions, savePositions]);

  const applyRoadmap = useCallback((data: RoadmapData & { node_positions?: SavedPositions; expanded_nodes?: { id: string; parent_id: string; title: string; description: string; color: string }[] }) => {
    setRoadmap(data);
    setKbContext(null);
    const positions = data.node_positions ?? {};
    const { nodes: n, edges: e } = buildLayout(data, handleSearch, positions, () => doReviewRef.current(), handleExpandTopic, handleOpenChat);

    // Restaura nós expandidos salvos
    expandedRecordsRef.current = {};
    const expNodes: Node[] = [];
    const expEdges: Edge[] = [];
    for (const rec of data.expanded_nodes ?? []) {
      expandedRecordsRef.current[rec.id] = { parent_id: rec.parent_id, title: rec.title, description: rec.description, color: rec.color };
      const pos = positions[rec.id] ?? { x: 0, y: 0 };
      expNodes.push({
        id: rec.id, type: "topicNode", draggable: true, position: pos,
        data: {
          title: rec.title, description: rec.description,
          resources: [], color: rec.color, isExpanded: true,
          onSearch: () => handleSearch(rec.title, rec.id),
          onResourceSearch: (r: string) => handleSearch(r),
          onExpand: () => handleExpandTopic(rec.id, rec.title, rec.description, rec.color),
          onChat: () => handleOpenChat(rec.id, rec.title, rec.description),
        },
      });
      expEdges.push({
        id: `exp-edge-${rec.parent_id}-${rec.id}`,
        source: rec.parent_id, target: rec.id,
        style: { stroke: rec.color + "99", strokeWidth: 1.2, strokeDasharray: "5 3" },
        animated: true,
      });
    }

    setNodes([...n as Node[], ...expNodes]);
    setEdges([...e as Edge[], ...expEdges]);
  }, [handleSearch, handleExpandTopic, handleOpenChat, setNodes, setEdges]);

  // Auto-save after generation
  const saveRoadmap = useCallback(async (data: RoadmapData) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/roadmap/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await res.json();
      setSavedId(d.id);
      setRefreshTick((t) => t + 1);
    } catch {
      // silently ignore save errors
    } finally {
      setSaving(false);
    }
  }, []);

  // Generate
  const generate = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    setError("");
    setRoadmap(null);
    setKbContext(null);
    setSavedId(null);

    try {
      const res = await fetch(`${API_BASE}/roadmap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), provider }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const data: RoadmapData = await res.json();
      applyRoadmap(data);
      saveRoadmap(data); // auto-save, fire & forget
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Load saved roadmap
  const flushProgress = useCallback((id: string, prog: Record<string, boolean>) => {
    fetch(`${API_BASE}/roadmap/${id}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: prog }),
    }).catch(() => {});
  }, []);

  const handleToggleProgress = useCallback((nodeId: string, checked: boolean) => {
    setProgress(prev => {
      const next = { ...prev, [nodeId]: checked };
      const id = savedIdRef.current;
      if (id) {
        if (saveProgressTick.current) clearTimeout(saveProgressTick.current);
        saveProgressTick.current = setTimeout(() => flushProgress(id, next), 600);
      }
      return next;
    });
  }, [flushProgress]);

  const loadRoadmap = async (id: string) => {
    setSavedId(id);
    setKbContext(null);
    try {
      const [roadmapRes, progressRes] = await Promise.all([
        fetch(`${API_BASE}/roadmap/${id}`),
        fetch(`${API_BASE}/roadmap/${id}/progress`),
      ]);
      if (!roadmapRes.ok) return;
      const data: RoadmapData = await roadmapRes.json();
      setGoal(data.goal || "");
      applyRoadmap(data);
      if (progressRes.ok) {
        const pd = await progressRes.json();
        setProgress(pd.progress || {});
      }
    } catch {
      setError("Erro ao carregar roadmap.");
    }
  };

  const panelOpen = !!kbContext;

  return (
    <div className="rg2">
      {/* ── Config strip ── */}
      <div className="rg2__strip">
        <textarea
          className="rg2__goal-input"
          placeholder="Descreva seu objetivo… (ex: engenheiro de software avançado em Java, Spring Boot e IA)"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          rows={3}
          disabled={loading}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }}
        />
        <div className="rg2__providers">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`rg2__prov ${provider === p.id ? "rg2__prov--active" : ""}`}
              onClick={() => setProvider(p.id)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="rg2__gen-btn"
          onClick={generate}
          disabled={loading || !goal.trim()}
        >
          {loading
            ? <><span className="rg2__spinner" />Gerando…</>
            : "Gerar Roadmap"}
        </button>
        {saving && <span className="rg2__saving">Salvando…</span>}
        {savedId && !saving && <span className="rg2__saved-ok">✓ Salvo</span>}
        <button
          type="button"
          className="rg2__help-btn"
          onClick={() => setShowHowItWorks(true)}
          title="Como o roadmap é gerado?"
        >?</button>
      </div>

      {/* ── How it works modal ── */}
      {showHowItWorks && (
        <div className="hiw__overlay" onClick={() => setShowHowItWorks(false)}>
          <div className="hiw__modal" onClick={(e) => e.stopPropagation()}>
            <div className="hiw__header">
              <span className="hiw__title">Como o roadmap é gerado</span>
              <button className="hiw__close" onClick={() => setShowHowItWorks(false)}>✕</button>
            </div>
            <div className="hiw__body">
              <div className="hiw__step">
                <span className="hiw__step-num">1</span>
                <div>
                  <strong>Catálogo da base de conhecimento</strong>
                  <p>Todos os documentos indexados nas collections <code>articles</code> e <code>books</code> do Qdrant são listados, extraindo títulos e tópicos de cada um.</p>
                </div>
              </div>
              <div className="hiw__step">
                <span className="hiw__step-num">2</span>
                <div>
                  <strong>Busca RAG semântica</strong>
                  <p>Seu objetivo é transformado em um embedding vetorial e comparado contra as duas collections via busca <strong>híbrida</strong> (BM25 sparse + dense). O sistema retorna os 30+ chunks mais relevantes, com corrective RAG automático se a relevância for baixa.</p>
                </div>
              </div>
              <div className="hiw__step">
                <span className="hiw__step-num">3</span>
                <div>
                  <strong>Montagem do contexto</strong>
                  <p>Os trechos recuperados são concatenados junto ao catálogo de livros/artigos disponíveis, formando o contexto que será enviado ao LLM.</p>
                </div>
              </div>
              <div className="hiw__step">
                <span className="hiw__step-num">4</span>
                <div>
                  <strong>Geração pelo LLM</strong>
                  <p>O prompt <code>roadmap_generate</code> instrui o modelo selecionado (Gemini / OpenAI / Ollama) a criar um roadmap estruturado em fases e tópicos, citando somente recursos presentes na base.</p>
                </div>
              </div>
              <div className="hiw__step">
                <span className="hiw__step-num">5</span>
                <div>
                  <strong>Salvo e interativo</strong>
                  <p>O roadmap é persistido no MongoDB e renderizado como grafo interativo. Você pode expandir fases, gerar exemplos Q&amp;A e código por tópico, revisar referências e exportar como post LinkedIn.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="rg2__error"><strong>Erro:</strong> {error}</div>}

      {/* ── Expand / Review strip (only when a roadmap is loaded and saved) ── */}
      {roadmap && savedId && (
        <div className="rg2__expand-strip">
          <div className="rg2__strip-row">
            <button className="rg2__expand-toggle" type="button" onClick={() => setShowExpand((v) => !v)}>
              {showExpand ? "▲" : "➕"} Expandir roadmap
            </button>
            <div className="rg2__strip-actions">
              {reviewedAt && !reviewing && <span className="rg2__review-ok">✓ Revisado às {reviewedAt}</span>}
              {reviewError && <span className="rg2__expand-err">{reviewError}</span>}
              {linkedinError && <span className="rg2__expand-err">{linkedinError}</span>}
              <button
                className="rg2__review-btn"
                type="button"
                onClick={doReview}
                disabled={reviewing}
                title="Revisa e corrige as referências de cada tópico com base na KB real"
              >
                {reviewing ? <><span className="rg2__spinner" /> Revisando…</> : "Revisar referências"}
              </button>
              <button
                className="rg2__linkedin-btn"
                type="button"
                onClick={openLinkedinStudio}
                title="LinkedIn Studio — gerar e agendar posts"
              >
                LinkedIn Studio
              </button>
              <button
                className={`rg2__checklist-btn${showChecklist ? " rg2__checklist-btn--active" : ""}`}
                type="button"
                onClick={() => setShowChecklist(v => !v)}
                title="Ver checklist de progresso"
              >
                Checklist
              </button>
              <button
                className="rg2__chat-btn"
                type="button"
                onClick={() => setShowChat(v => !v)}
                title="Chat com tutor sobre este roadmap"
              >
                Chat
              </button>
            </div>
          </div>
          {showExpand && (
            <div className="rg2__expand-form">
              <textarea
                className="rg2__expand-input"
                placeholder="Descreva o que quer adicionar… ex: 'fases de deploy e monitoramento em produção'"
                value={expandText}
                onChange={(e) => setExpandText(e.target.value)}
                rows={2}
                disabled={expanding}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doExpand(); } }}
              />
              <button className="rg2__expand-btn" type="button" onClick={doExpand} disabled={expanding || !expandText.trim()}>
                {expanding ? <><span className="rg2__spinner" /> Expandindo…</> : "Gerar Expansão"}
              </button>
              {expandError && <span className="rg2__expand-err">{expandError}</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Body: sidebar + main ── */}
      <div className="rg2__body">
        {/* Saved roadmaps sidebar */}
        <SavedSidebar
          active={savedId}
          onLoad={loadRoadmap}
          onDelete={(id) => { if (savedId === id) { setRoadmap(null); setSavedId(null); } }}
          onNew={() => { setRoadmap(null); setSavedId(null); setGoal(""); setKbContext(null); }}
          refreshTick={refreshTick}
        />

        {/* Right side: mindmap or empty */}
        <div className="rg2__right">
          {/* ── Main: mindmap + KB panel ── */}
          {roadmap && (
            <div className="rg2__main">
              {/* ReactFlow canvas */}
              <div className="rg2__canvas" style={{ flex: panelOpen ? "1 1 60%" : "1 1 100%" }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeDragStart={handleNodeDragStart}
                  onNodeDragStop={handleNodeDragStop}
                  nodeTypes={NODE_TYPES}
                  fitView
                  fitViewOptions={{ padding: 0.18 }}
                  minZoom={0.15}
                  maxZoom={2.5}
                  attributionPosition="bottom-right"
                  // Modo pan: arrastar canvas; Modo select: arrastar cria seleção + multi-drag
                  panOnDrag={interactionMode === "pan"}
                  selectionOnDrag={interactionMode === "select"}
                  selectionMode={SelectionMode.Partial}
                  multiSelectionKeyCode={null}
                >
                  <Background gap={24} size={1} color="#dde0e8" />
                  <Controls showInteractive={false} />
                  <MiniMap
                    zoomable
                    pannable
                    nodeColor={(n) => (n.data?.color as string) || "#4f7df3"}
                    style={{ background: "var(--surface)" }}
                  />
                  <ExportPanel title={roadmap.title} />
                  {/* Toolbar de modo de interação */}
                  <Panel position="top-left" className="rg2__mode-panel">
                    <button
                      className={`rg2__mode-btn${interactionMode === "pan" ? " rg2__mode-btn--active" : ""}`}
                      onClick={() => setInteractionMode("pan")}
                      title="Modo mover — arrastar navega pelo canvas"
                    >
                      ✋
                    </button>
                    <button
                      className={`rg2__mode-btn${interactionMode === "select" ? " rg2__mode-btn--active" : ""}`}
                      onClick={() => setInteractionMode("select")}
                      title="Modo seleção — clique e arraste para selecionar múltiplos nós"
                    >
                      ↖
                    </button>
                  </Panel>
                </ReactFlow>

                {/* Floating meta pill */}
                <div className="rg2__meta">
                  <span className="rg2__meta-badge">{roadmap.provider} / {roadmap.model}</span>
                  <span className="rg2__meta-badge">{roadmap.context_docs_used} livros consultados</span>
                  <span className="rg2__meta-badge">
                    {roadmap.phases.length} fases · {roadmap.phases.reduce((s, p) => s + p.topics.length, 0)} tópicos
                  </span>
                  <span className="rg2__meta-hint">Clique em qualquer nó → busca na base + exemplos Q&amp;A</span>
                </div>
              </div>

              {/* Checklist overlay */}
              {showChecklist && roadmap && (
                <ChecklistPanel
                  roadmap={roadmap}
                  expandedRecords={expandedRecordsRef.current}
                  progress={progress}
                  onToggle={handleToggleProgress}
                  onClose={() => setShowChecklist(false)}
                />
              )}

              {/* KB + Examples side panel */}
              {panelOpen && kbContext && (
                <KbPanel
                  key={kbContext.topicId ?? kbContext.query}
                  query={kbContext.query}
                  topicId={kbContext.topicId}
                  topicTitle={kbContext.topicTitle}
                  topicData={kbContext.topicData}
                  roadmapId={savedId}
                  provider={provider}
                  onClose={() => setKbContext(null)}
                  onNodeUpdated={handleNodeUpdated}
                />
              )}
              {showChat && savedId && roadmap && (
                <RoadmapChatPanel
                  key={savedId}
                  roadmapId={savedId}
                  provider={provider}
                  roadmapTitle={roadmap.title}
                  onClose={() => setShowChat(false)}
                  pinnedNode={chatPinnedNode}
                  onClearPin={() => setChatPinnedNode(null)}
                />
              )}
            </div>
          )}

          {/* ── Empty state ── */}
          {!roadmap && !loading && !error && (
            <div className="rg2__empty">
              <div className="rg2__empty-icon">🗺️</div>
              <div className="rg2__empty-title">Gere seu roadmap personalizado</div>
              <div className="rg2__empty-sub">
                O roadmap será construído como um mindmap interativo. Clique em qualquer tópico
                para buscar o conteúdo exato na sua base de livros e fazer perguntas.
              </div>
              <div className="rg2__examples">
                {[
                  "Engenheiro de software sênior em Java e Spring Boot",
                  "Machine Learning do zero ao avançado",
                  "Arquitetura de sistemas distribuídos e cloud",
                  "Inteligência Artificial e LLMs para desenvolvedores",
                ].map((eg) => (
                  <button key={eg} type="button" className="rg2__eg-btn" onClick={() => setGoal(eg)}>
                    {eg}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── LinkedIn Studio Modal ── */}
      {showLinkedinStudio && (
        <div className="lis__overlay" onClick={() => setShowLinkedinStudio(false)}>
          <div className="lis__modal" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="lis__header">
              <span className="lis__title">💼 LinkedIn Studio</span>
              <div className="lis__header-actions">
                <a href="/linkedin-posts" target="_blank" rel="noreferrer" className="lis__posts-link">
                  Ver todos os posts →
                </a>
                <button className="lis__close" onClick={() => setShowLinkedinStudio(false)}>✕</button>
              </div>
            </div>

            {/* Topic focus */}
            <div className="lis__section">
              <label className="lis__label">Foco do post</label>
              <select
                className="lis__select"
                value={liTopicFocus}
                onChange={(e) => setLiTopicFocus(e.target.value)}
              >
                <option value="">Resumo geral do roadmap</option>
                {roadmap?.phases.flatMap((p) => [
                  <option key={`phase:${p.id}`} value={`phase:${p.id}`} style={{ fontWeight: 700 }}>
                    📌 {p.title}
                  </option>,
                  ...p.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      &nbsp;&nbsp;&nbsp;└ {t.title}
                    </option>
                  )),
                ])}
              </select>
            </div>

            {/* Custom prompt + audio */}
            <div className="lis__section">
              <label className="lis__label">
                Instrução customizada <span className="lis__optional">(opcional)</span>
              </label>
              <div className="lis__prompt-row">
                <textarea
                  className="lis__prompt-input"
                  rows={3}
                  placeholder="Ex: foco em casos práticos, mencione a lib X, seja mais direto, inclua uma história pessoal…"
                  value={liCustomPrompt}
                  onChange={(e) => setLiCustomPrompt(e.target.value)}
                />
                <button
                  className={`lis__mic${liIsListening ? " lis__mic--active" : ""}`}
                  type="button"
                  onClick={liIsListening ? liStopListening : liStartListening}
                  title={liIsListening ? "Parar gravação" : "Ditado por voz"}
                >
                  🎙
                </button>
              </div>
              {liTranscript && <div className="lis__transcript">{liTranscript}</div>}
              <div className="lis__elements">
                {[
                  { label: "+ Hashtags", text: "Inclua hashtags relevantes e populares" },
                  { label: "+ CTA",      text: "Adicione uma chamada para ação forte ao final" },
                  { label: "+ Emojis",   text: "Use emojis para tornar o post mais visual" },
                  { label: "+ Métricas", text: "Inclua dados e métricas concretos para dar credibilidade" },
                ].map((btn) => (
                  <button key={btn.label} type="button" className="lis__elem-btn" onClick={() => liAppendElement(btn.text)}>
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate */}
            <button className="lis__gen-btn" type="button" onClick={doGenerateLinkedin} disabled={generatingLinkedin}>
              {generatingLinkedin ? <><span className="rg2__spinner" /> Gerando post…</> : "✨ Gerar Post"}
            </button>
            {linkedinError && <span className="lis__error">{linkedinError}</span>}

            {/* Post preview */}
            {linkedinPost && (
              <div className="lis__preview">
                <div className="lis__preview-header">
                  <span className="lis__label">Post gerado</span>
                  <span className={`lis__chars${linkedinPost.length > 1300 ? " lis__chars--over" : ""}`}>
                    {linkedinPost.length} / 1300
                  </span>
                </div>
                <textarea
                  className="lis__post-textarea"
                  rows={10}
                  value={linkedinPost}
                  onChange={(e) => setLinkedinPost(e.target.value)}
                  spellCheck
                />
                <div className="lis__preview-actions">
                  <button
                    className="lis__copy-btn"
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(linkedinPost);
                      setLinkedinCopied(true);
                      setTimeout(() => setLinkedinCopied(false), 2000);
                    }}
                  >
                    {linkedinCopied ? "✓ Copiado!" : "📋 Copiar"}
                  </button>
                  <button className="lis__regen-btn" type="button" onClick={doGenerateLinkedin} disabled={generatingLinkedin}>
                    {generatingLinkedin ? <><span className="rg2__spinner" /> Gerando…</> : "🔄 Regenerar"}
                  </button>
                </div>
              </div>
            )}

            {/* Saved posts */}
            {savedPosts.length > 0 && (
              <details className="lis__details">
                <summary className="lis__summary">📁 Posts salvos ({savedPosts.length})</summary>
                <div className="lis__saved-list">
                  {savedPosts.map((p) => (
                    <div key={p.id} className="lis__saved-item">
                      <div className="lis__saved-meta">
                        <span className="lis__saved-topic">{p.topic_focus || "Geral"}</span>
                        <span className="lis__saved-date">
                          {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <p className="lis__saved-preview">{p.content.slice(0, 130)}…</p>
                      <div className="lis__saved-actions">
                        <button className="lis__saved-use" type="button" onClick={() => setLinkedinPost(p.content)}>
                          Usar este
                        </button>
                        <button className="lis__saved-del" type="button" onClick={() => doDeleteSavedPost(p.id)}>
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Cron scheduler */}
            <details className="lis__details">
              <summary className="lis__summary">⏰ Agendamento automático de posts</summary>
              <div className="lis__cron-section">
                <div className="lis__cron-row">
                  <select className="lis__cron-sel" value={liCronSchedule} onChange={(e) => setLiCronSchedule(e.target.value)}>
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quinzenal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                  <button className="lis__cron-add" type="button" onClick={doCreateLiCron} disabled={creatingCron}>
                    {creatingCron ? <><span className="rg2__spinner" /> Criando…</> : "+ Agendar"}
                  </button>
                </div>
                {liCrons.length > 0 && (
                  <div className="lis__cron-list">
                    {liCrons.map((c) => (
                      <div key={c.id} className="lis__cron-item">
                        <span className="lis__cron-badge">{c.schedule}</span>
                        {c.topic_focus && <span className="lis__cron-topic">{c.topic_focus}</span>}
                        {c.next_run_at && (
                          <span className="lis__cron-next">
                            Próximo: {new Date(c.next_run_at).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                        <button className="lis__cron-del" type="button" onClick={() => doDeleteLiCron(c.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>

          </div>
        </div>
      )}

      <style>{`
        /* ── Roadmap v2 layout ── */
        .rg2 {
          display: flex; flex-direction: column;
          height: 100%;
          overflow: hidden; gap: 0;
        }

        /* Config strip */
        .rg2__strip {
          display: flex; flex-wrap: wrap; align-items: flex-start; gap: .75rem;
          padding: .85rem 1.25rem;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .rg2__goal-input {
          flex: 1; min-width: 260px; resize: none;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          padding: .65rem 1rem; font-size: .9rem; color: var(--text);
          background: var(--bg); outline: none; transition: border-color 140ms;
          line-height: 1.6; min-height: 72px;
        }
        .rg2__goal-input:focus { border-color: var(--primary); }
        .rg2__goal-input:disabled { opacity: .6; }

        .rg2__providers { display: flex; gap: .3rem; flex-wrap: wrap; }
        .rg2__prov {
          display: flex; align-items: center; gap: .3rem;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--bg); padding: .3rem .7rem; font-size: .8rem;
          cursor: pointer; color: var(--text-secondary); transition: all 110ms;
        }
        .rg2__prov:hover { border-color: var(--primary); color: var(--primary); }
        .rg2__prov--active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); font-weight: 700; }
        .rg2__prov:disabled { opacity: .5; cursor: not-allowed; }

        .rg2__gen-btn {
          display: flex; align-items: center; gap: .45rem;
          background: var(--primary); color: #fff; border: none;
          border-radius: var(--radius-md); padding: .5rem 1.2rem;
          font-size: .88rem; font-weight: 700; cursor: pointer;
          transition: opacity 120ms; white-space: nowrap;
        }
        .rg2__gen-btn:hover { opacity: .88; }
        .rg2__gen-btn:disabled { opacity: .45; cursor: not-allowed; }
        .rg2__spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
          border-radius: 50%; animation: rg2spin .7s linear infinite;
        }
        @keyframes rg2spin { to { transform: rotate(360deg); } }

        .rg2__saving { font-size: .78rem; color: var(--text-tertiary); }
        .rg2__saved-ok { font-size: .78rem; color: var(--success); font-weight: 700; }
        .rg2__help-btn {
          width: 22px; height: 22px; border-radius: 50%;
          border: 1.5px solid var(--border); background: none;
          color: var(--text-secondary); font-size: .8rem; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: border-color 120ms, color 120ms;
          margin-left: auto;
        }
        .rg2__help-btn:hover { border-color: var(--primary); color: var(--primary); }

        /* ── How it works modal ── */
        .hiw__overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.55);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
        }
        .hiw__modal {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-lg); width: min(540px, 92vw);
          max-height: 80vh; overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,.4);
        }
        .hiw__header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.25rem .75rem; border-bottom: 1px solid var(--border);
        }
        .hiw__title { font-size: 1rem; font-weight: 700; color: var(--text); }
        .hiw__close {
          background: none; border: none; color: var(--text-secondary);
          font-size: 1rem; cursor: pointer; padding: .2rem .4rem;
          border-radius: var(--radius-sm); transition: color 100ms;
        }
        .hiw__close:hover { color: var(--text); }
        .hiw__body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
        .hiw__step {
          display: flex; gap: .85rem; align-items: flex-start;
        }
        .hiw__step-num {
          flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%;
          background: var(--primary); color: #fff;
          font-size: .75rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          margin-top: .1rem;
        }
        .hiw__step strong { display: block; font-size: .88rem; color: var(--text); margin-bottom: .25rem; }
        .hiw__step p { font-size: .82rem; color: var(--text-secondary); margin: 0; line-height: 1.55; }
        .hiw__step code {
          font-family: monospace; font-size: .78rem;
          background: var(--bg); border: 1px solid var(--border);
          padding: .1rem .35rem; border-radius: 3px; color: var(--primary);
        }

        /* Body: sidebar + right */
        .rg2__body {
          flex: 1; display: flex; overflow: hidden; min-height: 0;
        }
        .rg2__right {
          flex: 1; display: flex; overflow: hidden; min-height: 0;
        }

        /* Saved sidebar */
        .rg2__sidebar {
          width: 220px; flex-shrink: 0;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .rg2__sidebar-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: .65rem .85rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .rg2__sidebar-title {
          font-size: .72rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: .08em; color: var(--text-tertiary);
        }
        .rg2__sidebar-new {
          background: var(--primary-soft); border: 1px solid var(--primary);
          border-radius: var(--radius-sm); color: var(--primary);
          font-size: .85rem; font-weight: 700; padding: .05rem .35rem;
          cursor: pointer; line-height: 1.4;
        }
        .rg2__sidebar-new:hover { background: var(--primary); color: #fff; }
        .rg2__sidebar-list { flex: 1; overflow-y: auto; padding: .4rem; display: flex; flex-direction: column; gap: .3rem; }
        .rg2__sidebar-empty { font-size: .75rem; color: var(--text-tertiary); padding: .75rem .5rem; text-align: center; }

        .rg2__saved-item {
          position: relative; padding: .55rem .65rem .55rem .6rem;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          cursor: pointer; transition: background 110ms, border-color 110ms;
          background: var(--bg);
        }
        .rg2__saved-item:hover { background: var(--bg-alt); border-color: var(--primary); }
        .rg2__saved-item--active { background: var(--primary-soft); border-color: var(--primary); }
        .rg2__saved-title {
          font-size: .76rem; font-weight: 700; color: var(--text);
          line-height: 1.3; padding-right: 1.2rem;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .rg2__saved-meta {
          display: flex; justify-content: space-between;
          font-size: .65rem; color: var(--text-tertiary); margin-top: .25rem;
        }
        .rg2__saved-badges { display: flex; gap: .25rem; margin-top: .25rem; }
        .rg2__saved-badge {
          font-size: .62rem; background: var(--bg-alt); border: 1px solid var(--border);
          border-radius: 3px; padding: .05rem .3rem; color: var(--text-tertiary);
        }
        .rg2__saved-del {
          position: absolute; top: .4rem; right: .4rem;
          background: none; border: none; cursor: pointer;
          font-size: .7rem; color: var(--text-tertiary); padding: .1rem .25rem;
          border-radius: 3px; line-height: 1;
        }
        .rg2__saved-del:hover { background: var(--danger-soft); color: var(--danger); }

        .rg2__error {
          margin: .5rem 1.25rem; padding: .65rem 1rem;
          background: var(--danger-soft); border: 1px solid var(--danger);
          color: var(--danger); border-radius: var(--radius-md); font-size: .84rem;
        }

        /* Main area */
        .rg2__main {
          flex: 1; display: flex; overflow: hidden; min-height: 0;
        }
        .rg2__canvas {
          position: relative; min-width: 0; min-height: 0;
          transition: flex 200ms ease;
        }

        /* Export panel */
        .rg2__export-panel {
          display: flex; gap: .4rem;
        }
        .rg2__export-btn {
          display: flex; align-items: center; gap: .3rem;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: .3rem .7rem;
          font-size: .76rem; font-weight: 700; color: var(--text-secondary);
          cursor: pointer; box-shadow: var(--shadow-sm);
          transition: border-color 120ms, color 120ms;
          white-space: nowrap;
        }
        .rg2__export-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
        .rg2__export-btn:disabled { opacity: .5; cursor: not-allowed; }
        .rg2__export-spin {
          display: inline-block; width: 11px; height: 11px;
          border: 2px solid var(--border); border-top-color: var(--primary);
          border-radius: 50%; animation: rg2spin .7s linear infinite;
        }

        /* Floating meta */
        .rg2__meta {
          position: absolute; bottom: 52px; left: 12px;
          display: flex; flex-wrap: wrap; gap: .3rem; z-index: 5;
          pointer-events: none;
        }
        .rg2__meta-badge {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 20px; padding: .18rem .55rem;
          font-size: .72rem; color: var(--text-secondary);
          font-weight: 600; box-shadow: var(--shadow-sm);
        }
        .rg2__meta-hint {
          background: var(--primary-soft); border: 1px solid var(--primary);
          border-radius: 20px; padding: .18rem .55rem;
          font-size: .72rem; color: var(--primary); font-weight: 600;
          box-shadow: var(--shadow-sm);
        }
        .rg2__iv-btn {
          display: flex; align-items: center; gap: .3rem;
          background: var(--surface); border: 1px solid #f59e0b;
          border-radius: 20px; padding: .2rem .65rem;
          font-size: .72rem; color: #92400e; font-weight: 700;
          cursor: pointer; box-shadow: var(--shadow-sm);
          transition: background 120ms;
          pointer-events: all;
        }
        .rg2__iv-btn:hover:not(:disabled) { background: #fef3c7; }
        .rg2__iv-btn--active { background: #fef3c7; border-color: #d97706; color: #78350f; }
        .rg2__iv-btn:disabled { opacity: .6; cursor: not-allowed; }
        .rg2__spinner--sm {
          width: 10px; height: 10px; border-width: 1.5px;
        }

        /* Interview node styles */
        .rmn__iv-badge {
          color: #fff; font-size: .62rem; font-weight: 800;
          border-radius: 3px; padding: .1rem .4rem; margin-bottom: .3rem;
          display: inline-block;
        }
        .rmn__iv-tip {
          font-size: .68rem; color: #92400e; background: #fef3c7;
          border-radius: 4px; padding: .25rem .4rem; margin-top: .35rem;
          line-height: 1.4; border-left: 2px solid #f59e0b;
        }

        /* Empty state */
        .rg2__empty {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 1rem; padding: 3rem;
          text-align: center;
        }
        .rg2__empty-icon { font-size: 3rem; }
        .rg2__empty-title { font-size: 1.25rem; font-weight: 800; color: var(--text); }
        .rg2__empty-sub {
          max-width: 520px; font-size: .9rem; color: var(--text-secondary); line-height: 1.6;
        }
        .rg2__examples {
          display: flex; flex-wrap: wrap; gap: .5rem; justify-content: center; margin-top: .5rem;
        }
        .rg2__eg-btn {
          background: var(--bg-alt); border: 1px solid var(--border); border-radius: 20px;
          padding: .3rem .85rem; font-size: .8rem; color: var(--text-secondary);
          cursor: pointer; transition: all 110ms;
        }
        .rg2__eg-btn:hover { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }

        /* ── Mindmap nodes ── */
        .rmn {
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          font-family: var(--display), system-ui, sans-serif;
          cursor: pointer; user-select: none;
          transition: box-shadow 150ms, transform 100ms;
        }
        .rmn:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); }

        .rmn--goal {
          width: 220px;
          background: linear-gradient(135deg, #4f7df3 0%, #7c3aed 100%);
          color: #fff; padding: .85rem 1rem;
          border: 2px solid transparent;
          text-align: center;
        }
        .rmn__goal-icon { font-size: 1.4rem; margin-bottom: .3rem; }
        .rmn__goal-title { font-size: .88rem; font-weight: 800; line-height: 1.3; }
        .rmn__goal-sub { font-size: .71rem; opacity: .82; margin-top: .25rem; line-height: 1.4; }

        .rmn--phase {
          width: 190px;
          background: var(--surface);
          border: 2px solid;
          padding: .5rem .75rem;
          display: flex; align-items: center; gap: .6rem;
        }
        .rmn__phase-num {
          width: 24px; height: 24px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: .75rem; font-weight: 800;
          flex-shrink: 0;
        }
        .rmn__phase-title { font-size: .8rem; font-weight: 700; color: var(--text); line-height: 1.3; }
        .rmn__phase-dur { font-size: .68rem; color: var(--text-tertiary); margin-top: .1rem; }

        .rmn--topic {
          width: 210px;
          background: var(--surface);
          border: 1.5px solid;
          padding: .6rem .75rem;
        }
        .rmn--child {
          width: 195px;
          opacity: .92;
        }
        .rmn__child-badge {
          display: inline-flex; align-items: center; gap: 3px;
          font-size: .58rem; font-weight: 700; letter-spacing: .03em; text-transform: uppercase;
          border: 1px solid; border-radius: 4px;
          padding: 1px 5px; margin-bottom: .3rem;
          line-height: 1.6;
        }
        .rmn__topic-title {
          font-size: .79rem; font-weight: 700; color: var(--text);
          line-height: 1.3; margin-bottom: .3rem;
          text-decoration-color: transparent;
          transition: color 100ms;
        }
        .rmn--topic:hover .rmn__topic-title { color: var(--primary); }
        .rmn__topic-desc { font-size: .7rem; color: var(--text-secondary); line-height: 1.4; }
        .rmn__res-list { display: flex; flex-direction: column; gap: .2rem; margin-top: .4rem; }
        .rmn__res-badge {
          font-size: .65rem; border: 1px solid; border-radius: 4px;
          padding: .1rem .35rem; color: var(--text-secondary);
          cursor: pointer; transition: background 110ms;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .rmn__res-badge:hover { background: var(--bg-alt); }
        .rmn__res-review-btn {
          margin-top: .25rem; font-size: .63rem; font-weight: 600;
          background: none; border: 1px solid var(--border); border-radius: 4px;
          color: var(--text-secondary); padding: .15rem .45rem; cursor: pointer;
          transition: border-color 110ms, color 110ms; text-align: left;
        }
        .rmn__res-review-btn:hover { border-color: #58a6ff; color: #58a6ff; }

        .rmn__node-actions {
          display: flex; gap: .3rem; margin-top: .35rem; flex-wrap: wrap;
        }
        .rmn__expand-btn, .rmn__chat-btn {
          display: flex; align-items: center; gap: .3rem;
          flex: 1; min-width: 0;
          background: none; border: 1px dashed; border-radius: 4px;
          padding: .22rem .5rem; cursor: pointer;
          font-size: .65rem; font-weight: 700;
          transition: background 110ms, opacity 110ms;
        }
        .rmn__expand-btn:hover:not(:disabled), .rmn__chat-btn:hover { background: rgba(255,255,255,.06); }
        .rmn__expand-btn:disabled { opacity: .5; cursor: not-allowed; }
        .rmn__expand-plus {
          font-size: .85rem; font-weight: 900; line-height: 1;
        }
        .rmn__expand-spin {
          display: inline-block; width: 9px; height: 9px;
          border: 1.5px solid rgba(255,255,255,.2); border-top-color: currentColor;
          border-radius: 50%; animation: rg2spin .7s linear infinite;
        }

        /* ── KB Side Panel ── */
        .kb-panel {
          width: 400px; min-width: 340px;
          background: var(--surface);
          border-left: 1px solid var(--border);
          display: flex; flex-direction: column; overflow: hidden;
          flex-shrink: 0;
        }
        .kb-panel__header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: .9rem 1rem; border-bottom: 1px solid var(--border);
          gap: .5rem; flex-shrink: 0;
        }
        .kb-panel__label { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-tertiary); }
        .kb-panel__query { font-size: .88rem; font-weight: 700; color: var(--text); margin-top: .15rem; line-height: 1.3; }
        .kb-panel__close {
          background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: .15rem .45rem; font-size: 1.1rem; cursor: pointer; color: var(--text-secondary);
          line-height: 1; flex-shrink: 0;
        }
        .kb-panel__close:hover { border-color: var(--danger); color: var(--danger); }

        .kb-panel__ask {
          display: flex; gap: .4rem; padding: .65rem 1rem;
          border-bottom: 1px solid var(--border); flex-shrink: 0; align-items: center;
        }
        .kb-panel__ask-wrap {
          flex: 1; display: flex; align-items: center;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--bg); overflow: hidden; transition: border-color 140ms;
        }
        .kb-panel__ask-wrap:focus-within { border-color: var(--primary); }
        .kb-panel__ask-input {
          flex: 1; border: none; outline: none;
          padding: .35rem .6rem; font-size: .82rem;
          background: transparent; color: var(--text);
        }
        .kb-panel__mic-btn {
          flex-shrink: 0; background: none; border: none;
          padding: .3rem .5rem; cursor: pointer; color: var(--text-tertiary);
          display: flex; align-items: center; transition: color 120ms;
        }
        .kb-panel__mic-btn:hover { color: var(--primary); }
        .kb-panel__mic-btn--active { color: #ef4444; }
        .kb-panel__mic-pulse {
          display: flex; animation: mic-pulse .9s ease-in-out infinite alternate;
        }
        @keyframes mic-pulse { from { opacity: 1; } to { opacity: .3; } }
        .kb-panel__ask-btn {
          background: var(--primary); color: #fff; border: none;
          border-radius: var(--radius-sm); padding: .35rem .75rem;
          font-size: .8rem; font-weight: 700; cursor: pointer;
          transition: opacity 120ms; display: flex; align-items: center;
        }
        .kb-panel__ask-btn:disabled { opacity: .5; cursor: not-allowed; }
        .kb-panel__ask-btn:hover:not(:disabled) { opacity: .88; }
        .kb-panel__spin {
          width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.3);
          border-top-color: #fff; border-radius: 50%;
          animation: rg2spin .7s linear infinite;
        }

        .kb-panel__answer {
          padding: .7rem 1rem; border-bottom: 1px solid var(--border);
          background: var(--primary-soft); flex-shrink: 0;
        }
        .kb-panel__answer-label { font-size: .68rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--primary); margin-bottom: .35rem; }
        .kb-panel__answer-text { font-size: .82rem; color: var(--text); line-height: 1.55; }
        .kb-panel__answer-sources { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .5rem; align-items: center; }
        .kb-panel__answer-src-label { font-size: .68rem; font-weight: 700; color: var(--text-tertiary); }
        .kb-panel__answer-src-tag {
          font-size: .68rem; background: var(--surface); border: 1px solid var(--border);
          border-radius: 4px; padding: .1rem .4rem; color: var(--text-secondary);
        }

        .kb-panel__scroll { flex: 1; overflow-y: auto; padding: .5rem; display: flex; flex-direction: column; gap: .4rem; }
        .kb-panel__loading { padding: 1.5rem; text-align: center; color: var(--text-secondary); font-size: .83rem; display: flex; flex-direction: column; gap: .6rem; align-items: center; }
        .kb-panel__load-bar {
          width: 60px; height: 3px; border-radius: 2px;
          background: linear-gradient(90deg, var(--primary) 0%, transparent 100%);
          animation: kb-load 1.2s ease-in-out infinite alternate;
        }
        @keyframes kb-load { to { width: 120px; opacity: .4; } }
        .kb-panel__empty { padding: 2rem 1rem; text-align: center; color: var(--text-tertiary); font-size: .83rem; }

        /* ── KB Chunk cards ── */
        .kb-chunk {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: .65rem .75rem;
          display: flex; flex-direction: column; gap: .35rem;
          transition: box-shadow 120ms;
        }
        .kb-chunk:hover { box-shadow: var(--shadow-sm); }
        .kb-chunk__head { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }
        .kb-chunk__meta { display: flex; flex-direction: column; gap: .15rem; flex: 1; }
        .kb-chunk__book { font-size: .75rem; font-weight: 700; color: var(--text); line-height: 1.3; }
        .kb-chunk__page { font-size: .67rem; color: var(--text-tertiary); }
        .kb-chunk__section { font-size: .67rem; color: var(--text-tertiary); font-style: italic; }
        .kb-chunk__score-wrap { display: flex; align-items: center; gap: .3rem; flex-shrink: 0; }
        .kb-chunk__score-bar { width: 44px; height: 4px; background: var(--bg-alt); border-radius: 2px; overflow: hidden; }
        .kb-chunk__score-fill { height: 100%; border-radius: 2px; transition: width 300ms; }
        .kb-chunk__score-num { font-size: .67rem; font-weight: 700; color: var(--text-secondary); min-width: 26px; text-align: right; }

        .kb-chunk__text { font-size: .78rem; color: var(--text-secondary); line-height: 1.55; }
        .kb-chunk__image { max-width: 100%; border-radius: var(--radius-sm); border: 1px solid var(--border); }
        .kb-chunk__expand {
          background: none; border: none; cursor: pointer;
          font-size: .72rem; color: var(--primary); padding: 0;
          font-weight: 600; text-align: left;
        }
        .kb-chunk__expand:hover { opacity: .75; }

        /* ── Generate Examples bar ── */
        .kb-panel__gen-bar {
          display: flex; flex-wrap: wrap; gap: .4rem; align-items: center;
          padding: .55rem 1rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .kb-panel__gen-btn {
          display: flex; align-items: center; gap: .35rem;
          background: var(--primary); color: #fff; border: none;
          border-radius: var(--radius-sm); padding: .32rem .75rem;
          font-size: .79rem; font-weight: 700; cursor: pointer;
          transition: opacity 120ms;
        }
        .kb-panel__gen-btn:hover:not(:disabled) { opacity: .85; }
        .kb-panel__gen-btn:disabled { opacity: .5; cursor: not-allowed; }
        .kb-panel__toggle-ex {
          background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: .28rem .6rem; font-size: .76rem; color: var(--text-secondary); cursor: pointer;
        }
        .kb-panel__toggle-ex:hover { border-color: var(--primary); color: var(--primary); }
        .kb-panel__gen-err { font-size: .72rem; color: var(--danger); }

        /* ── Q&A Examples section ── */
        .kb-panel__examples {
          border-bottom: 1px solid var(--border); padding: .5rem;
          display: flex; flex-direction: column; gap: .4rem;
          max-height: 42vh; overflow-y: auto; flex-shrink: 0;
        }
        .kb-panel__ex-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: .2rem .25rem .35rem;
        }
        .kb-panel__ex-title { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; color: var(--text-tertiary); }
        .kb-panel__ex-meta  { font-size: .67rem; color: var(--text-tertiary); }

        .kb-panel__qa {
          background: var(--bg); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: .55rem .65rem;
          display: flex; flex-direction: column; gap: .35rem;
        }
        .kb-panel__qa-q {
          font-size: .79rem; font-weight: 700; color: var(--text);
          line-height: 1.4; display: flex; flex-direction: column; gap: .25rem;
        }
        .kb-panel__qa-badge {
          display: inline-block; color: #fff; font-size: .62rem; font-weight: 800;
          border-radius: 3px; padding: .08rem .38rem; align-self: flex-start;
          text-transform: capitalize;
        }
        .kb-panel__qa-a {
          font-size: .77rem; color: var(--text-secondary); line-height: 1.55;
          border-left: 2px solid var(--border); padding-left: .5rem;
        }
        .kb-panel__qa-sources { display: flex; flex-wrap: wrap; gap: .25rem; }

        /* ── Code examples ── */
        .kb-panel__code-ex {
          background: var(--bg); border: 1px solid var(--border);
          border-radius: var(--radius-sm); overflow: hidden;
          display: flex; flex-direction: column;
        }
        .kb-panel__code-title {
          display: flex; align-items: center; gap: .45rem;
          padding: .45rem .65rem; background: var(--surface);
          border-bottom: 1px solid var(--border);
          font-size: .79rem; font-weight: 700; color: var(--text);
        }
        .kb-panel__code-num {
          width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
          background: var(--primary); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: .65rem; font-weight: 800;
        }
        .kb-panel__code-lang {
          margin-left: auto; font-size: .65rem; font-weight: 700;
          background: var(--primary-soft); color: var(--primary);
          border: 1px solid var(--primary); border-radius: 3px;
          padding: .05rem .35rem; text-transform: uppercase;
        }
        .kb-panel__code-explanation {
          font-size: .74rem; color: var(--text-secondary); line-height: 1.5;
          padding: .4rem .65rem; border-bottom: 1px solid var(--border);
        }
        .kb-panel__code-block {
          margin: 0; padding: .65rem .75rem;
          font-family: "Fira Code", "Cascadia Code", Consolas, monospace;
          font-size: .74rem; line-height: 1.6;
          color: #d4f0ff; background: #0d1117;
          overflow-x: auto; white-space: pre;
        }
        .kb-panel__code-block code { font-family: inherit; }

        /* ── Extra gen-btn variants ── */
        .kb-panel__gen-btn--more {
          background: var(--success);
        }
        .kb-panel__gen-btn--code {
          background: #7c3aed;
        }

        /* ── Expand strip ── */
        .rg2__expand-strip {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .rg2__strip-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: .25rem .75rem .25rem 1.25rem; gap: .5rem;
        }
        .rg2__strip-actions {
          display: flex; align-items: center; gap: .5rem; flex-shrink: 0;
        }
        .rg2__expand-toggle {
          background: none; border: none; flex: 1; text-align: left;
          padding: .3rem 0; font-size: .78rem; font-weight: 700;
          color: var(--text-secondary); cursor: pointer; transition: color 110ms;
        }
        .rg2__expand-toggle:hover { color: var(--primary); }
        .rg2__expand-form {
          display: flex; flex-wrap: wrap; gap: .5rem; align-items: flex-start;
          padding: 0 1.25rem .65rem;
        }
        .rg2__expand-input {
          flex: 1; min-width: 280px; resize: none;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: .4rem .65rem; font-size: .82rem; color: var(--text);
          background: var(--bg); outline: none; transition: border-color 140ms; line-height: 1.4;
        }
        .rg2__expand-input:focus { border-color: var(--primary); }
        .rg2__expand-btn {
          display: flex; align-items: center; gap: .35rem;
          background: var(--success); color: #fff; border: none;
          border-radius: var(--radius-sm); padding: .4rem .9rem;
          font-size: .82rem; font-weight: 700; cursor: pointer;
          transition: opacity 120ms; white-space: nowrap;
        }
        .rg2__expand-btn:hover:not(:disabled) { opacity: .85; }
        .rg2__expand-btn:disabled { opacity: .45; cursor: not-allowed; }
        .rg2__expand-err { font-size: .72rem; color: var(--danger); }
        .rg2__review-btn {
          display: flex; align-items: center; gap: .35rem;
          background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-secondary); padding: .3rem .7rem;
          font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: border-color 110ms, color 110ms;
        }
        .rg2__review-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
        .rg2__review-btn:disabled { opacity: .5; cursor: not-allowed; }
        .rg2__review-ok { font-size: .72rem; color: var(--success); }
        .rg2__linkedin-btn {
          display: flex; align-items: center; gap: .35rem;
          background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-secondary); padding: .3rem .7rem;
          font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: border-color 110ms, color 110ms;
        }
        .rg2__linkedin-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
        .rg2__linkedin-btn:disabled { opacity: .5; cursor: not-allowed; }

        /* ── LinkedIn Studio Modal ── */
        .lis__overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.55);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 1rem;
        }
        .lis__modal {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); width: min(720px, 96vw);
          max-height: 90vh; overflow-y: auto;
          display: flex; flex-direction: column; gap: .9rem; padding: 1.4rem;
          box-shadow: 0 12px 40px rgba(0,0,0,.28);
        }
        .lis__header {
          display: flex; align-items: center; justify-content: space-between;
          padding-bottom: .7rem; border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .lis__title { font-size: 1rem; font-weight: 700; color: var(--text); }
        .lis__header-actions { display: flex; align-items: center; gap: .6rem; }
        .lis__posts-link {
          font-size: .75rem; color: #0a66c2; text-decoration: none; font-weight: 600;
          padding: .2rem .5rem; border-radius: 5px; transition: background .12s;
        }
        .lis__posts-link:hover { background: #e8f0fe; }
        .lis__close {
          background: none; border: none; font-size: 1.1rem;
          color: var(--text-secondary); cursor: pointer; padding: .2rem .4rem; border-radius: 4px;
        }
        .lis__close:hover { background: #f1f5f9; color: var(--text); }
        .lis__section { display: flex; flex-direction: column; gap: .45rem; }
        .lis__label { font-size: .78rem; font-weight: 700; color: var(--text-secondary); }
        .lis__optional { font-weight: 400; opacity: .7; }
        .lis__select {
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--bg); color: var(--text); font-size: .84rem;
          padding: .4rem .65rem; outline: none; transition: border-color .13s;
          font-family: inherit;
        }
        .lis__select:focus { border-color: #0a66c2; }
        .lis__prompt-row { display: flex; gap: .5rem; align-items: flex-start; }
        .lis__prompt-input {
          flex: 1; resize: vertical; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--bg);
          color: var(--text); font-size: .83rem; line-height: 1.5;
          padding: .5rem .7rem; font-family: inherit; outline: none; transition: border-color .13s;
        }
        .lis__prompt-input:focus { border-color: #0a66c2; }
        .lis__mic {
          width: 36px; height: 36px; flex-shrink: 0;
          border-radius: 50%; border: 1.5px solid var(--border);
          background: var(--bg); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 1rem; transition: background .13s, border-color .13s;
        }
        .lis__mic:hover { background: #f1f5f9; border-color: #94a3b8; }
        .lis__mic--active { background: #ef4444; border-color: #ef4444; animation: rcPulse 1s infinite; }
        .lis__transcript {
          font-size: .75rem; color: #64748b; font-style: italic; padding: .25rem .4rem;
          background: #f8fafc; border-radius: 5px; border: 1px solid #e2e8f0;
        }
        .lis__elements { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .15rem; }
        .lis__elem-btn {
          border: 1px solid #cbd5e1; border-radius: 20px; background: var(--bg);
          color: #475569; font-size: .73rem; font-weight: 600; padding: .2rem .65rem;
          cursor: pointer; transition: border-color .12s, color .12s, background .12s;
        }
        .lis__elem-btn:hover { border-color: #0a66c2; color: #0a66c2; background: #e8f0fe; }
        .lis__gen-btn {
          display: flex; align-items: center; justify-content: center; gap: .45rem;
          background: #0a66c2; color: #fff; border: none;
          border-radius: var(--radius-sm); padding: .55rem 1.4rem;
          font-size: .88rem; font-weight: 700; cursor: pointer; transition: background .13s;
          align-self: flex-start;
        }
        .lis__gen-btn:hover:not(:disabled) { background: #004182; }
        .lis__gen-btn:disabled { opacity: .5; cursor: not-allowed; }
        .lis__error { font-size: .75rem; color: var(--danger); }
        .lis__preview {
          display: flex; flex-direction: column; gap: .5rem;
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: .9rem;
        }
        .lis__preview-header { display: flex; align-items: center; justify-content: space-between; }
        .lis__chars { font-size: .72rem; color: #64748b; }
        .lis__chars--over { color: #ef4444; font-weight: 700; }
        .lis__post-textarea {
          width: 100%; resize: vertical; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--surface);
          color: var(--text); font-size: .84rem; line-height: 1.6;
          padding: .65rem .8rem; font-family: inherit; outline: none; transition: border-color .13s;
        }
        .lis__post-textarea:focus { border-color: #0a66c2; }
        .lis__preview-actions { display: flex; gap: .5rem; }
        .lis__copy-btn, .lis__regen-btn {
          display: flex; align-items: center; gap: .3rem;
          border-radius: var(--radius-sm); font-size: .78rem; font-weight: 600;
          padding: .3rem .8rem; cursor: pointer; transition: background .11s, color .11s;
        }
        .lis__copy-btn {
          background: none; border: 1px solid var(--border); color: var(--text-secondary);
        }
        .lis__copy-btn:hover { border-color: #58a6ff; color: #58a6ff; }
        .lis__regen-btn {
          background: #0a66c2; border: 1px solid #0a66c2; color: #fff;
        }
        .lis__regen-btn:hover:not(:disabled) { background: #004182; border-color: #004182; }
        .lis__regen-btn:disabled { opacity: .5; cursor: not-allowed; }
        .lis__details {
          border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
        }
        .lis__summary {
          font-size: .8rem; font-weight: 700; color: var(--text-secondary);
          padding: .55rem .9rem; cursor: pointer; list-style: none;
          background: var(--bg); transition: background .12s;
          display: flex; align-items: center; gap: .4rem;
        }
        .lis__summary:hover { background: #f1f5f9; }
        .lis__summary::-webkit-details-marker { display: none; }
        .lis__saved-list {
          display: flex; flex-direction: column; gap: .4rem;
          padding: .6rem .8rem; background: #fafbfc;
        }
        .lis__saved-item {
          background: var(--surface); border: 1px solid #e2e8f0; border-radius: 8px;
          padding: .65rem .8rem; display: flex; flex-direction: column; gap: .3rem;
        }
        .lis__saved-meta { display: flex; align-items: center; gap: .5rem; }
        .lis__saved-topic {
          font-size: .7rem; font-weight: 700; color: #0a66c2;
          background: #e8f0fe; border-radius: 4px; padding: 1px 6px;
        }
        .lis__saved-date { font-size: .68rem; color: #94a3b8; margin-left: auto; }
        .lis__saved-preview { font-size: .78rem; color: #475569; line-height: 1.45; margin: 0; }
        .lis__saved-actions { display: flex; gap: .4rem; align-items: center; }
        .lis__saved-use {
          border: 1px solid #0a66c2; border-radius: 5px; background: none;
          color: #0a66c2; font-size: .73rem; font-weight: 600; padding: .18rem .6rem;
          cursor: pointer; transition: background .11s, color .11s;
        }
        .lis__saved-use:hover { background: #0a66c2; color: #fff; }
        .lis__saved-del {
          background: none; border: none; cursor: pointer;
          color: #94a3b8; font-size: .9rem; padding: .15rem .3rem;
          border-radius: 4px; transition: color .11s;
        }
        .lis__saved-del:hover { color: #ef4444; }
        .lis__cron-section { padding: .65rem .9rem; background: #fafbfc; display: flex; flex-direction: column; gap: .5rem; }
        .lis__cron-row { display: flex; gap: .5rem; align-items: center; }
        .lis__cron-sel {
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--bg); color: var(--text); font-size: .82rem;
          padding: .3rem .55rem; outline: none; font-family: inherit;
        }
        .lis__cron-add {
          display: flex; align-items: center; gap: .3rem;
          border: 1px solid #22c55e; border-radius: var(--radius-sm);
          background: none; color: #16a34a; font-size: .78rem; font-weight: 700;
          padding: .3rem .75rem; cursor: pointer; transition: background .11s, color .11s;
        }
        .lis__cron-add:hover:not(:disabled) { background: #22c55e; color: #fff; }
        .lis__cron-add:disabled { opacity: .5; cursor: not-allowed; }
        .lis__cron-list { display: flex; flex-direction: column; gap: .3rem; }
        .lis__cron-item {
          display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
          background: var(--surface); border: 1px solid #e2e8f0;
          border-radius: 6px; padding: .45rem .65rem;
        }
        .lis__cron-badge {
          font-size: .7rem; font-weight: 700; background: #dcfce7; color: #16a34a;
          border-radius: 4px; padding: 1px 7px;
        }
        .lis__cron-topic { font-size: .75rem; color: #475569; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lis__cron-next { font-size: .7rem; color: #94a3b8; white-space: nowrap; }
        .lis__cron-del {
          background: none; border: none; cursor: pointer; color: #94a3b8;
          font-size: .8rem; padding: .1rem .3rem; border-radius: 4px; margin-left: auto;
          transition: color .11s;
        }
        .lis__cron-del:hover { color: #ef4444; }

        /* ── Edit node form ── */
        .kb-panel__edit-section {
          border-bottom: 1px solid var(--border); flex-shrink: 0;
        }
        .kb-panel__edit-toggle {
          width: 100%; text-align: left; background: none; border: none;
          padding: .4rem 1rem; font-size: .76rem; font-weight: 700;
          color: var(--text-secondary); cursor: pointer; transition: color 110ms;
        }
        .kb-panel__edit-toggle:hover { color: var(--primary); }
        .kb-panel__edit-form {
          display: flex; flex-direction: column; gap: .4rem;
          padding: 0 1rem .7rem;
        }
        .kb-panel__edit-label {
          font-size: .69rem; font-weight: 700; color: var(--text-tertiary);
          display: block; margin-bottom: .05rem;
        }
        .kb-panel__edit-input, .kb-panel__edit-textarea {
          width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: .32rem .55rem; font-size: .8rem; color: var(--text);
          background: var(--bg); outline: none; transition: border-color 140ms;
          box-sizing: border-box;
        }
        .kb-panel__edit-input:focus, .kb-panel__edit-textarea:focus { border-color: var(--primary); }
        .kb-panel__edit-textarea { resize: vertical; line-height: 1.4; min-height: 56px; }
        .kb-panel__edit-actions { display: flex; gap: .4rem; align-items: center; margin-top: .15rem; }
        .kb-panel__edit-save {
          background: var(--primary); color: #fff; border: none;
          border-radius: var(--radius-sm); padding: .3rem .75rem;
          font-size: .78rem; font-weight: 700; cursor: pointer;
          transition: opacity 120ms; display: flex; align-items: center; gap: .3rem;
        }
        .kb-panel__edit-save:disabled { opacity: .5; cursor: not-allowed; }
        .kb-panel__edit-save:hover:not(:disabled) { opacity: .85; }
        .kb-panel__edit-cancel {
          background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
          padding: .26rem .6rem; font-size: .75rem; color: var(--text-secondary); cursor: pointer;
        }
        .kb-panel__edit-cancel:hover { border-color: var(--danger); color: var(--danger); }
        .kb-panel__edit-err { font-size: .7rem; color: var(--danger); }

        /* ── Q&A header row ── */
        .kb-panel__qa-header {
          display: flex; align-items: center; gap: .35rem; margin-bottom: .25rem;
        }
        .kb-panel__qa-q {
          font-size: .79rem; font-weight: 700; color: var(--text); line-height: 1.4;
        }

        /* ── Per-item regen button ── */
        .kb-panel__item-regen {
          background: none; border: none; cursor: pointer;
          font-size: .73rem; padding: .1rem .22rem;
          color: var(--text-tertiary); transition: color 120ms, background 120ms;
          border-radius: 3px; line-height: 1; display: flex; align-items: center;
          margin-left: auto; flex-shrink: 0;
        }
        .kb-panel__item-regen:hover:not(:disabled) { color: var(--primary); background: var(--primary-soft); }
        .kb-panel__item-regen:disabled { opacity: .4; cursor: not-allowed; }
        .kb-panel__spin--dark {
          width: 10px; height: 10px;
          border: 1.5px solid rgba(79,125,243,.25); border-top-color: var(--primary);
          border-radius: 50%; animation: rg2spin .7s linear infinite; display: inline-block;
        }

        /* ── Code example card (compact – no pre) ── */
        .kb-panel__code-title {
          display: flex; align-items: center; gap: .4rem;
          padding: .45rem .65rem;
          background: var(--surface); border-bottom: 1px solid var(--border);
        }
        .kb-panel__code-title-text {
          flex: 1; font-size: .78rem; font-weight: 700; color: var(--text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .kb-panel__code-view-btn {
          background: none; border: 1px solid var(--border); border-radius: 3px;
          padding: .1rem .4rem; font-size: .68rem; color: var(--text-secondary);
          cursor: pointer; transition: all 110ms; white-space: nowrap; flex-shrink: 0;
        }
        .kb-panel__code-view-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }

        /* ── Code Modal (fixed, slides in from right of canvas) ── */
        .code-modal__backdrop {
          position: fixed; inset: 0; z-index: 99;
          background: transparent;
        }
        .code-modal {
          position: fixed;
          right: 410px;
          top: var(--topbar-h, 48px);
          bottom: 0;
          width: 580px;
          display: flex; flex-direction: column;
          background: #0d1117;
          border: 1px solid #21262d;
          border-right: none;
          border-radius: 8px 0 0 8px;
          box-shadow: -8px 0 32px rgba(0,0,0,.55);
          z-index: 100;
          overflow: hidden;
          animation: code-modal-in .15s ease;
          transition: width .2s ease;
        }
        .code-modal--wide { width: 940px; }
        .code-modal__content {
          flex: 1; display: flex; overflow: hidden;
        }
        .code-modal__left {
          flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0;
        }
        /* Select hint in header */
        .code-modal__select-hint {
          font-size: .68rem; color: #484f58; font-style: italic; flex-shrink: 0;
        }
        /* ── Selection tooltip ── */
        .code-sel-tooltip {
          display: flex; gap: .3rem; align-items: center;
          background: #161b22; border: 1px solid #30363d;
          border-radius: 8px; padding: .35rem .5rem;
          box-shadow: 0 4px 20px rgba(0,0,0,.6);
          pointer-events: auto;
        }
        .code-sel-tooltip::after {
          content: "";
          position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
          border: 5px solid transparent; border-top-color: #30363d;
        }
        .code-sel-tooltip__btn {
          background: none; border: 1px solid #30363d; border-radius: 5px;
          color: #c9d1d9; padding: .28rem .65rem; cursor: pointer;
          font-size: .74rem; white-space: nowrap;
          transition: border-color 120ms, color 120ms, background 120ms;
        }
        .code-sel-tooltip__btn:hover:not(:disabled) { border-color: #58a6ff; color: #58a6ff; background: rgba(88,166,255,.07); }
        .code-sel-tooltip__btn:disabled { opacity: .4; cursor: not-allowed; }
        .code-sel-tooltip__dismiss {
          background: none; border: none; color: #484f58; cursor: pointer;
          font-size: 1rem; line-height: 1; padding: .1rem .3rem;
          transition: color 120ms;
        }
        .code-sel-tooltip__dismiss:hover { color: #f85149; }
        /* ── Interaction panel ── */
        .code-modal__interact-panel {
          width: 340px; flex-shrink: 0; display: flex; flex-direction: column;
          border-left: 1px solid #21262d; background: #0d1117; overflow: hidden;
        }
        .code-modal__interact-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: .75rem 1rem; border-bottom: 1px solid #21262d;
          font-size: .78rem; font-weight: 700; color: #8b949e;
          background: #161b22; flex-shrink: 0;
        }
        .code-modal__interact-clear {
          background: none; border: none; color: #484f58; cursor: pointer;
          font-size: .72rem; padding: .1rem .3rem;
          transition: color 120ms;
        }
        .code-modal__interact-clear:hover { color: #f85149; }
        .code-modal__interact-loading {
          display: flex; align-items: center; gap: .6rem;
          padding: .9rem 1rem; color: #8b949e; font-size: .78rem;
          border-bottom: 1px solid #21262d;
        }
        .code-modal__interact-item {
          padding: .85rem 1rem; border-bottom: 1px solid #21262d;
          overflow-y: auto; flex-shrink: 0;
        }
        .code-modal__interact-badge {
          font-size: .7rem; font-weight: 700; color: #58a6ff;
          margin-bottom: .4rem;
        }
        .code-modal__interact-snippet {
          font-family: "Fira Code", Consolas, monospace; font-size: .72rem;
          color: #484f58; background: #161b22; border-radius: 4px;
          padding: .3rem .5rem; margin-bottom: .6rem;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          border-left: 2px solid #30363d;
        }
        .code-modal__interact-text {
          font-size: .79rem; color: #8b949e; line-height: 1.6; margin-bottom: .5rem;
        }
        .code-modal__interact-concepts {
          display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .4rem;
        }
        .code-modal__interact-tag {
          font-size: .68rem; background: #1f3a5f; color: #58a6ff;
          border-radius: 4px; padding: .15rem .45rem;
        }
        .code-modal__interact-filename {
          font-size: .74rem; font-weight: 700; color: #3fb950;
          margin-bottom: .3rem;
        }
        .code-modal__interact-error {
          font-size: .75rem; color: #f85149; margin-top: .3rem;
        }
        .code-modal__interact-apply, .code-modal__interact-open {
          background: none; border: 1px solid #30363d; border-radius: 5px;
          color: #8b949e; padding: .3rem .75rem; cursor: pointer;
          font-size: .75rem; font-weight: 600; transition: all 120ms;
          margin-top: .3rem;
        }
        .code-modal__interact-apply:hover { border-color: #3fb950; color: #3fb950; }
        .code-modal__interact-open:hover  { border-color: #58a6ff; color: #58a6ff; }
        @keyframes code-modal-in {
          from { transform: translateX(16px); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
        .code-modal__header {
          display: flex; align-items: center; gap: .75rem;
          padding: 1rem 1.25rem; border-bottom: 1px solid #21262d;
          flex-shrink: 0; background: #161b22;
        }
        .code-modal__lang-pill {
          font-size: .68rem; font-weight: 800; text-transform: uppercase;
          background: #1f3a5f; color: #58a6ff;
          border-radius: 5px; padding: .25rem .65rem; flex-shrink: 0;
          letter-spacing: .05em;
        }
        .code-modal__title {
          flex: 1; font-size: .9rem; font-weight: 700; color: #e6edf3;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .code-modal__regen {
          background: none; border: 1px solid #30363d; border-radius: 5px;
          color: #8b949e; padding: .32rem .6rem; cursor: pointer;
          font-size: .82rem; display: flex; align-items: center;
          transition: border-color 120ms, color 120ms; flex-shrink: 0;
        }
        .code-modal__regen:hover:not(:disabled) { border-color: #58a6ff; color: #58a6ff; }
        .code-modal__regen:disabled { opacity: .5; cursor: not-allowed; }
        .code-modal__copy {
          background: none; border: 1px solid #30363d; border-radius: 5px;
          color: #8b949e; padding: .32rem .85rem; cursor: pointer;
          font-size: .78rem; font-weight: 600; transition: all 120ms; flex-shrink: 0;
        }
        .code-modal__copy:hover { border-color: #3fb950; color: #3fb950; }
        .code-modal__close {
          background: none; border: 1px solid #30363d; border-radius: 5px;
          color: #8b949e; padding: .28rem .58rem; cursor: pointer;
          font-size: 1.15rem; line-height: 1; transition: all 120ms; flex-shrink: 0;
        }
        .code-modal__close:hover { border-color: #f85149; color: #f85149; }
        .code-modal__run-btn {
          display: flex; align-items: center; gap: .3rem;
          background: #1a3a1a; border: 1px solid #3fb950; border-radius: 5px;
          color: #3fb950; padding: .32rem .8rem; cursor: pointer;
          font-size: .78rem; font-weight: 700; transition: all 120ms; flex-shrink: 0;
          white-space: nowrap;
        }
        .code-modal__run-btn:hover:not(:disabled) { background: #3fb950; color: #0d1117; }
        .code-modal__run-btn:disabled { opacity: .5; cursor: not-allowed; }
        .code-modal__run-btn--sm { padding: .28rem .55rem; font-size: .85rem; }

        /* Terminal panel */
        .code-modal__terminal {
          border: 1px solid #238636; border-radius: 6px; overflow: hidden;
          margin: .75rem .75rem 0; background: #010409; flex-shrink: 0;
        }
        .code-modal__terminal-header {
          display: flex; align-items: center; gap: .5rem;
          padding: .35rem .75rem; background: #161b22; border-bottom: 1px solid #238636;
        }
        .code-modal__terminal-title { font-size: .76rem; font-weight: 700; color: #3fb950; flex: 1; }
        .code-modal__terminal-badge {
          font-size: .68rem; color: #8b949e; background: #21262d;
          padding: .1rem .4rem; border-radius: 3px; font-family: monospace;
        }
        .code-modal__terminal-close {
          background: none; border: none; color: #8b949e; cursor: pointer;
          font-size: .95rem; padding: 0 .2rem; line-height: 1;
        }
        .code-modal__terminal-close:hover { color: #f85149; }
        .code-modal__stdin-row {
          display: flex; align-items: center; gap: .4rem;
          padding: .35rem .6rem; border-bottom: 1px solid #21262d; background: #0d1117;
        }
        .code-modal__stdin-label { font-size: .68rem; color: #8b949e; font-family: monospace; flex-shrink: 0; }
        .code-modal__stdin-input {
          flex: 1; background: transparent; border: none; outline: none;
          color: #cdd9e5; font-size: .75rem; font-family: monospace;
        }
        .code-modal__stdin-input::placeholder { color: #3d444d; }
        .code-modal__terminal-body {
          padding: .65rem .85rem; min-height: 60px; max-height: 260px; overflow-y: auto;
        }
        .code-modal__terminal-body--loading {
          display: flex; align-items: center; gap: .5rem;
          color: #8b949e; font-size: .78rem;
        }
        .code-modal__terminal-out {
          margin: 0; font-family: "Fira Code", Consolas, monospace;
          font-size: .76rem; color: #cdd9e5; white-space: pre-wrap; word-break: break-all;
        }
        .code-modal__terminal-err {
          margin: .4rem 0 0; font-family: "Fira Code", Consolas, monospace;
          font-size: .76rem; color: #f85149; white-space: pre-wrap; word-break: break-all;
        }
        .code-modal__terminal-empty { font-size: .76rem; color: #3d444d; font-style: italic; }
        .code-modal__terminal-exit {
          margin-top: .5rem; font-size: .68rem; color: #3d444d;
          font-family: monospace; border-top: 1px solid #21262d; padding-top: .35rem;
        }
        .code-modal__spin--green { border-color: rgba(63,185,80,.25); border-top-color: #3fb950; }
        .code-modal__spin {
          width: 12px; height: 12px;
          border: 1.5px solid rgba(88,166,255,.25); border-top-color: #58a6ff;
          border-radius: 50%; animation: rg2spin .7s linear infinite; display: inline-block;
        }
        .code-modal__explanation {
          padding: .9rem 1.25rem; font-size: .82rem; color: #8b949e;
          border-bottom: 1px solid #21262d; flex-shrink: 0; line-height: 1.65;
          background: #0d1117;
        }
        .code-modal__body {
          flex: 1; overflow: auto; display: flex; background: #0d1117;
        }
        .code-modal__line-nums {
          padding: 1rem .85rem 1rem 1rem; text-align: right;
          color: #3d444d; font-family: "Fira Code", Consolas, monospace;
          font-size: .8rem; line-height: 1.75; user-select: none;
          border-right: 1px solid #21262d; flex-shrink: 0; min-width: 3.2rem;
        }
        .code-modal__line-nums > div { line-height: 1.75; }
        .code-modal__pre {
          margin: 0; padding: 1rem 1.25rem;
          font-family: "Fira Code", "Cascadia Code", Consolas, monospace;
          font-size: .8rem; line-height: 1.75;
          color: #d4d4d4; white-space: pre; overflow: visible; flex: 1;
          background: transparent;
        }
        .code-modal__line { min-height: 1.75em; }

        /* ── Interaction mode toggle ─────────────────────────────────── */
        .rg2__mode-panel {
          display: flex; flex-direction: column; gap: 4px;
          background: var(--surface, #fff);
          border: 1px solid #e2e8f0;
          border-radius: 8px; padding: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,.08);
        }
        .rg2__mode-btn {
          width: 32px; height: 32px; border: none; border-radius: 6px;
          background: transparent; cursor: pointer;
          font-size: 1rem; display: flex; align-items: center; justify-content: center;
          color: #64748b; transition: background .15s, color .15s;
        }
        .rg2__mode-btn:hover { background: #f1f5f9; color: #1e293b; }
        .rg2__mode-btn--active {
          background: #4f7df3; color: #fff;
        }
        .rg2__mode-btn--active:hover { background: #3b6de0; color: #fff; }

        /* ── Checklist button ───────────────────────────────────────────── */
        .rg2__checklist-btn {
          background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-secondary); padding: .3rem .7rem;
          font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: border-color 110ms, color 110ms, background 110ms;
        }
        .rg2__checklist-btn:hover { border-color: var(--primary); color: var(--primary); }
        .rg2__checklist-btn--active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }

        /* ── Checklist panel ─────────────────────────────────────────────── */
        .cl-panel {
          position: absolute; left: 0; top: 0; bottom: 0;
          width: 300px; z-index: 50;
          display: flex; flex-direction: column;
          background: var(--surface);
          border-right: 1px solid var(--border);
          box-shadow: 4px 0 24px rgba(0,0,0,.08);
        }
        .cl-panel__header {
          display: flex; align-items: center; justify-content: space-between;
          padding: .75rem 1rem; border-bottom: 1px solid var(--border);
          background: var(--bg); flex-shrink: 0;
        }
        .cl-panel__title { font-size: .82rem; font-weight: 700; color: var(--text); }
        .cl-panel__close {
          border: none; background: transparent; cursor: pointer;
          font-size: 1.1rem; color: var(--text-tertiary); padding: 2px 6px; border-radius: 4px;
        }
        .cl-panel__close:hover { background: var(--border-light); color: var(--text); }
        .cl-panel__progress {
          display: flex; align-items: center; gap: 8px;
          padding: .55rem 1rem; border-bottom: 1px solid var(--border-light); flex-shrink: 0;
        }
        .cl-panel__progress-bar {
          flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;
        }
        .cl-panel__progress-fill {
          height: 100%; background: #22c55e; border-radius: 3px;
          transition: width .3s ease;
        }
        .cl-panel__progress-label { font-size: .7rem; color: var(--text-secondary); white-space: nowrap; font-weight: 600; }
        .cl-panel__list { flex: 1; overflow-y: auto; padding: .4rem 0; }

        /* checklist items */
        .cl-item {
          display: flex; align-items: flex-start; gap: 7px;
          padding: .3rem .75rem; cursor: pointer;
          transition: background .1s; user-select: none;
        }
        .cl-item:hover { background: var(--bg); }
        .cl-item--phase {
          font-size: .76rem; font-weight: 700; color: var(--text);
          border-top: 1px solid var(--border-light); margin-top: .25rem;
        }
        .cl-item--phase:first-child { border-top: none; margin-top: 0; }
        .cl-item--topic  { font-size: .74rem; color: var(--text-secondary); }
        .cl-item--subtopic { font-size: .71rem; color: var(--text-secondary); }
        .cl-item__cb { flex-shrink: 0; margin-top: 2px; accent-color: #22c55e; cursor: pointer; }
        .cl-item__title { flex: 1; line-height: 1.4; }
        .cl-item__count {
          font-size: .65rem; color: var(--text-tertiary); white-space: nowrap;
          background: var(--border-light); border-radius: 8px; padding: 1px 6px;
        }
        .cl-item--done .cl-item__title {
          text-decoration: line-through; color: var(--text-tertiary);
        }

        /* done node on canvas */
        .rmn--done { background: #f0fdf4 !important; }
        .rmn__done-badge {
          display: inline-flex; align-items: center; gap: 3px;
          font-size: .58rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
          color: #16a34a; border: 1px solid #bbf7d0; background: #dcfce7;
          border-radius: 4px; padding: 1px 5px; margin-bottom: .3rem; line-height: 1.6;
        }

        /* ── Roadmap Chat button ────────────────────────────────────────── */
        .rg2__chat-btn {
          background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-secondary); padding: .3rem .7rem;
          font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: border-color 110ms, color 110ms;
        }
        .rg2__chat-btn:hover { border-color: var(--primary); color: var(--primary); }

        /* ── Roadmap Chat Panel ──────────────────────────────────────────── */
        .rc-panel {
          position: absolute; right: 0; top: 0; bottom: 0;
          width: 380px; z-index: 50;
          display: flex; flex-direction: column;
          background: var(--surface);
          border-left: 1px solid var(--border);
          box-shadow: -4px 0 24px rgba(0,0,0,.10);
        }
        .rc-panel__drop-hint {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: .35rem .75rem; margin: 0 .75rem .3rem;
          background: var(--primary-soft); border: 1.5px dashed var(--primary-medium); border-radius: 7px;
          color: var(--primary); font-size: .72rem; font-weight: 600;
          pointer-events: none; flex-shrink: 0;
        }
        .rc-panel__header {
          display: flex; align-items: center; justify-content: space-between;
          padding: .75rem 1rem; border-bottom: 1px solid var(--border);
          background: var(--bg); flex-shrink: 0;
        }
        .rc-panel__title { font-size: .82rem; font-weight: 700; color: var(--text); }
        .rc-panel__clear {
          border: none; background: transparent; cursor: pointer;
          font-size: .95rem; color: var(--text-tertiary); padding: 2px 4px; border-radius: 4px;
        }
        .rc-panel__clear:hover { color: #ef4444; background: rgba(239,68,68,.12); }
        .rc-panel__close {
          border: none; background: transparent; cursor: pointer;
          font-size: 1.1rem; color: var(--text-tertiary); line-height: 1; padding: 2px 6px; border-radius: 4px;
        }
        .rc-panel__close:hover { background: var(--border-light); color: var(--text); }
        .rc-panel__messages {
          flex: 1; overflow-y: auto; padding: .75rem 1rem; display: flex; flex-direction: column; gap: .6rem;
        }
        .rc-panel__hint { font-size: .78rem; color: var(--text-tertiary); text-align: center; padding: 1rem 0; }
        .rc-msg { display: flex; flex-direction: column; max-width: 88%; }
        .rc-msg--user  { align-self: flex-end; align-items: flex-end; }
        .rc-msg--assistant { align-self: flex-start; align-items: flex-start; }
        .rc-msg__bubble {
          padding: .55rem .8rem; border-radius: 12px; font-size: .8rem; line-height: 1.55;
          white-space: pre-wrap; word-break: break-word;
        }
        .rc-msg--user      .rc-msg__bubble { background: var(--primary); color: #fff; border-bottom-right-radius: 3px; }
        .rc-msg--assistant .rc-msg__bubble { background: var(--bg-alt); color: var(--text); border-bottom-left-radius: 3px; }
        .rc-msg__time { font-size: .65rem; color: var(--text-tertiary); margin-top: 2px; padding: 0 4px; }
        .rc-msg__typing { display: flex; gap: 4px; align-items: center; min-height: 1.4em; }
        .rc-dot {
          width: 6px; height: 6px; border-radius: 50%; background: var(--text-tertiary);
          animation: rcDotBounce .9s infinite ease-in-out;
        }
        .rc-dot:nth-child(2) { animation-delay: .15s; }
        .rc-dot:nth-child(3) { animation-delay: .3s; }
        @keyframes rcDotBounce { 0%,80%,100% { transform: scale(.7); opacity:.5; } 40% { transform: scale(1); opacity:1; } }
        .rc-panel__pin {
          display: flex; align-items: center; gap: 6px;
          background: var(--primary-soft); border: 1px solid var(--primary-medium); border-radius: 8px;
          padding: 5px 8px; font-size: .75rem; color: var(--primary); flex-shrink: 0;
        }
        .rc-panel__pin-label { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rc-panel__pin-clear {
          border: none; background: transparent; cursor: pointer;
          font-size: 1rem; color: var(--text-tertiary); line-height: 1; padding: 0 2px;
        }
        .rc-panel__pin-clear:hover { color: var(--primary); }
        .rc-panel__footer {
          flex-shrink: 0; padding: .6rem .75rem; border-top: 1px solid var(--border);
          display: flex; flex-direction: column; gap: .45rem; background: var(--bg);
        }
        .rc-panel__input-row { display: flex; gap: 6px; align-items: flex-end; }
        .rc-panel__input {
          flex: 1; resize: none; border: 1.5px solid var(--border); border-radius: 8px;
          padding: .45rem .6rem; font-size: .8rem; line-height: 1.45; outline: none;
          font-family: inherit; transition: border-color .15s;
          background: var(--surface); color: var(--text);
        }
        .rc-panel__input:focus { border-color: var(--primary); }
        .rc-panel__input::placeholder { color: var(--text-tertiary); }
        .rc-panel__mic {
          flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid var(--border);
          background: var(--surface); cursor: pointer; display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary); transition: background .15s, border-color .15s, color .15s;
        }
        .rc-panel__mic:hover { background: var(--border-light); border-color: var(--border); }
        .rc-panel__mic--active { background: #ef4444; border-color: #ef4444; color: #fff; animation: rcPulse 1s infinite; }
        @keyframes rcPulse { 0%,100% { box-shadow: 0 0 0 0 #ef444440; } 50% { box-shadow: 0 0 0 6px #ef444400; } }
        .rc-panel__send {
          align-self: flex-end; padding: .4rem .9rem; border-radius: 7px;
          border: none; background: var(--primary); color: #fff;
          font-size: .78rem; font-weight: 600; cursor: pointer; transition: background .15s;
          display: flex; align-items: center; gap: 4px;
        }
        .rc-panel__send:hover:not(:disabled) { filter: brightness(1.12); }
        .rc-panel__send:disabled { background: var(--border); cursor: not-allowed; }
        .rc-panel__spin {
          width: 12px; height: 12px; border: 2px solid #fff4; border-top-color: #fff;
          border-radius: 50%; animation: spin .7s linear infinite; display: inline-block;
        }
      `}</style>
    </div>
  );
}
