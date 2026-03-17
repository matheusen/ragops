"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getApiBase } from "@/lib/api-base";

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
  const resources    = data.resources as string[];
  const title        = data.title as string;
  const desc         = data.description as string;
  const importance   = data.interviewImportance as "high" | "medium" | undefined;
  const tip          = data.interviewTip as string | undefined;

  const ivColor  = importance === "high" ? "#f59e0b" : importance === "medium" ? "#6366f1" : undefined;
  const ivBorder = ivColor ? `2px solid ${ivColor}` : `1.5px solid ${color}`;

  return (
    <div
      className={`rmn rmn--topic ${importance ? "rmn--interview" : ""}`}
      style={{ border: ivBorder, boxShadow: ivColor ? `0 0 0 3px ${ivColor}22` : undefined }}
    >
      <AllHandles />
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

  const panelOpen = interactions.length > 0 || !!interacting;

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
                <button className="code-modal__interact-clear" onClick={() => setInteractions([])}>Limpar</button>
              </div>

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
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, provider }),
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
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, provider, append: true }),
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
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, provider }),
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
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, pair_index: pairIndex, provider }),
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
        body: JSON.stringify({ topic_id: topicId, topic_title: topicTitle, example_index: exIndex, provider }),
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

  // Expand state
  const [showExpand,  setShowExpand]  = useState(false);
  const [expandText,  setExpandText]  = useState("");
  const [expanding,   setExpanding]   = useState(false);
  const [expandError, setExpandError] = useState("");

  // Review state
  const [reviewing,    setReviewing]    = useState(false);
  const [reviewError,  setReviewError]  = useState("");
  const [reviewedAt,   setReviewedAt]   = useState<string | null>(null);

  // LinkedIn post state
  const [linkedinPost,      setLinkedinPost]      = useState<string | null>(null);
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false);
  const [linkedinError,     setLinkedinError]     = useState("");
  const [linkedinCopied,    setLinkedinCopied]    = useState(false);

  // KB panel context
  const [kbContext, setKbContext] = useState<{ query: string; topicId: string | null; topicTitle: string; topicData: RoadmapTopic | null } | null>(null);

  // ReactFlow
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Open KB panel — for topics, pass topicId + resolve full topic data
  const handleSearch = useCallback((q: string, topicId?: string) => {
    let topicData: RoadmapTopic | null = null;
    if (topicId && roadmapRef.current) {
      for (const phase of roadmapRef.current.phases) {
        const found = phase.topics.find((t) => t.id === topicId);
        if (found) { topicData = found; break; }
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

  useEffect(() => { savedIdRef.current = savedId; }, [savedId]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { roadmapRef.current = roadmap; }, [roadmap]);

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

  const doGenerateLinkedin = async () => {
    if (!savedIdRef.current) return;
    setGeneratingLinkedin(true);
    setLinkedinError("");
    setLinkedinPost(null);
    try {
      const res = await fetch(`${API_BASE}/roadmap/${savedIdRef.current}/linkedin-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.detail || `HTTP ${res.status}`);
      setLinkedinPost(d.post);
    } catch (e: unknown) {
      setLinkedinError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingLinkedin(false);
    }
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

  const applyRoadmap = useCallback((data: RoadmapData & { node_positions?: SavedPositions }) => {
    setRoadmap(data);
    setKbContext(null);
    const { nodes: n, edges: e } = buildLayout(data, handleSearch, data.node_positions ?? {}, () => doReviewRef.current());
    setNodes(n as Node[]);
    setEdges(e as Edge[]);
  }, [handleSearch, setNodes, setEdges]);

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
  const loadRoadmap = async (id: string) => {
    setSavedId(id);
    setKbContext(null);
    try {
      const res = await fetch(`${API_BASE}/roadmap/${id}`);
      if (!res.ok) return;
      const data: RoadmapData = await res.json();
      setGoal(data.goal || "");
      applyRoadmap(data);
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
          rows={1}
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
              <span>{p.icon}</span><span>{p.label}</span>
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
            : <>🗺️ Gerar Roadmap</>}
        </button>
        {saving && <span className="rg2__saving">Salvando…</span>}
        {savedId && !saving && <span className="rg2__saved-ok">✓ Salvo</span>}
      </div>

      {error && <div className="rg2__error"><strong>Erro:</strong> {error}</div>}

      {/* ── Expand / Review strip (only when a roadmap is loaded and saved) ── */}
      {roadmap && savedId && (
        <div className="rg2__expand-strip">
          <button className="rg2__expand-toggle" type="button" onClick={() => setShowExpand((v) => !v)}>
            {showExpand ? "▲" : "➕"} Expandir roadmap
          </button>
          <button
            className="rg2__review-btn"
            type="button"
            onClick={doReview}
            disabled={reviewing}
            title="Revisa e corrige as referências de cada tópico com base na KB real"
          >
            {reviewing ? <><span className="rg2__spinner" /> Revisando…</> : "🔍 Revisar referências"}
          </button>
          {reviewedAt && !reviewing && <span className="rg2__review-ok">✓ Revisado às {reviewedAt}</span>}
          {reviewError && <span className="rg2__expand-err">{reviewError}</span>}
          <button
            className="rg2__linkedin-btn"
            type="button"
            onClick={doGenerateLinkedin}
            disabled={generatingLinkedin}
            title="Gerar post para o LinkedIn com base neste roadmap"
          >
            {generatingLinkedin ? <><span className="rg2__spinner" /> Gerando…</> : "💼 Post LinkedIn"}
          </button>
          {linkedinError && <span className="rg2__expand-err">{linkedinError}</span>}
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
                  onNodeDragStop={savePositions}
                  nodeTypes={NODE_TYPES}
                  fitView
                  fitViewOptions={{ padding: 0.18 }}
                  minZoom={0.15}
                  maxZoom={2.5}
                  attributionPosition="bottom-right"
                >
                  <Background gap={24} size={1} color="#dde0e8" />
                  <Controls showInteractive={false} />
                  <MiniMap
                    zoomable
                    pannable
                    nodeColor={(n) => (n.data?.color as string) || "#4f7df3"}
                    style={{ background: "var(--surface)" }}
                  />
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

              {/* KB + Examples side panel */}
              {panelOpen && kbContext && (
                <KbPanel
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

      {/* ── LinkedIn Post Modal ── */}
      {linkedinPost && (
        <div className="li-modal__overlay" onClick={() => setLinkedinPost(null)}>
          <div className="li-modal" onClick={(e) => e.stopPropagation()}>
            <div className="li-modal__header">
              <span className="li-modal__title">💼 Post para LinkedIn</span>
              <button className="li-modal__close" onClick={() => setLinkedinPost(null)}>✕</button>
            </div>
            <textarea
              className="li-modal__textarea"
              value={linkedinPost}
              onChange={(e) => setLinkedinPost(e.target.value)}
              rows={14}
              spellCheck
            />
            <div className="li-modal__footer">
              <span className="li-modal__chars">{linkedinPost.length} caracteres</span>
              <button
                className="li-modal__copy"
                onClick={() => {
                  navigator.clipboard.writeText(linkedinPost);
                  setLinkedinCopied(true);
                  setTimeout(() => setLinkedinCopied(false), 2000);
                }}
              >
                {linkedinCopied ? "✓ Copiado!" : "📋 Copiar"}
              </button>
              <button className="li-modal__regen" onClick={doGenerateLinkedin} disabled={generatingLinkedin}>
                {generatingLinkedin ? <><span className="rg2__spinner" /> Gerando…</> : "🔄 Regenerar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ── Roadmap v2 layout ── */
        .rg2 {
          display: flex; flex-direction: column;
          height: calc(100vh - var(--topbar-h));
          overflow: hidden; gap: 0;
        }

        /* Config strip */
        .rg2__strip {
          display: flex; flex-wrap: wrap; align-items: center; gap: .75rem;
          padding: .75rem 1.25rem;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .rg2__goal-input {
          flex: 1; min-width: 260px; resize: none;
          border: 1px solid var(--border); border-radius: var(--radius-md);
          padding: .5rem .85rem; font-size: .9rem; color: var(--text);
          background: var(--bg); outline: none; transition: border-color 140ms;
          line-height: 1.4;
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
        .rg2__expand-toggle {
          width: 100%; text-align: left; background: none; border: none;
          padding: .4rem 1.25rem; font-size: .78rem; font-weight: 700;
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
          background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-secondary); padding: .28rem .75rem;
          font-size: .78rem; font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: border-color 120ms, color 120ms;
        }
        .rg2__review-btn:hover:not(:disabled) { border-color: #58a6ff; color: #58a6ff; }
        .rg2__review-btn:disabled { opacity: .5; cursor: not-allowed; }
        .rg2__review-ok { font-size: .72rem; color: var(--success); }
        .rg2__linkedin-btn {
          display: flex; align-items: center; gap: .35rem;
          background: none; border: 1px solid #0a66c2; border-radius: var(--radius-sm);
          color: #0a66c2; padding: .28rem .75rem;
          font-size: .78rem; font-weight: 600; cursor: pointer; white-space: nowrap;
          transition: background 120ms, color 120ms;
        }
        .rg2__linkedin-btn:hover:not(:disabled) { background: #0a66c2; color: #fff; }
        .rg2__linkedin-btn:disabled { opacity: .5; cursor: not-allowed; }

        /* ── LinkedIn Modal ── */
        .li-modal__overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.55);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
        }
        .li-modal {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); width: min(640px, 92vw);
          display: flex; flex-direction: column; gap: .75rem; padding: 1.25rem;
          box-shadow: 0 8px 32px rgba(0,0,0,.25);
        }
        .li-modal__header { display: flex; align-items: center; justify-content: space-between; }
        .li-modal__title { font-size: .95rem; font-weight: 700; color: var(--text); }
        .li-modal__close {
          background: none; border: none; font-size: 1rem;
          color: var(--text-secondary); cursor: pointer; padding: .2rem .4rem;
        }
        .li-modal__close:hover { color: var(--text); }
        .li-modal__textarea {
          width: 100%; resize: vertical; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--bg-alt);
          color: var(--text); font-size: .85rem; line-height: 1.55;
          padding: .65rem .8rem; font-family: inherit;
        }
        .li-modal__textarea:focus { outline: none; border-color: #0a66c2; }
        .li-modal__footer { display: flex; align-items: center; gap: .6rem; }
        .li-modal__chars { font-size: .72rem; color: var(--text-secondary); margin-right: auto; }
        .li-modal__copy, .li-modal__regen {
          display: flex; align-items: center; gap: .3rem;
          border-radius: var(--radius-sm); font-size: .78rem; font-weight: 600;
          padding: .3rem .8rem; cursor: pointer; transition: background 110ms, color 110ms;
        }
        .li-modal__copy {
          background: none; border: 1px solid var(--border); color: var(--text-secondary);
        }
        .li-modal__copy:hover { border-color: #58a6ff; color: #58a6ff; }
        .li-modal__regen {
          background: #0a66c2; border: 1px solid #0a66c2; color: #fff;
        }
        .li-modal__regen:hover:not(:disabled) { background: #004182; border-color: #004182; }
        .li-modal__regen:disabled { opacity: .5; cursor: not-allowed; }

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
      `}</style>
    </div>
  );
}
