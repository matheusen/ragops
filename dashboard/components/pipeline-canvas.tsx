"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  Handle,
  Position,
  Panel,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { saveFlowAction, deleteFlowAction } from "@/app/actions";

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeCategory = "input" | "processing" | "retrieval" | "execution" | "prompt" | "output";

interface NodeVariant {
  id: string;
  label: string;
  description: string;
  tech: string[];
}

export interface PipelineNodeData extends Record<string, unknown> {
  category: NodeCategory;
  label: string;
  description: string;
  tech: string[];
  active: boolean;
  optional: boolean;
  variants?: NodeVariant[];
  selectedVariant?: string;
  serviceFile?: string;
}

type PipelineNode = Node<PipelineNodeData>;

export interface SavedFlow {
  id: string;
  name: string;
  createdAt: string;
  nodes: Array<{ id: string; x: number; y: number; active: boolean; selectedVariant?: string }>;
  edges: Array<{ id: string; source: string; target: string; animated?: boolean; dashed?: boolean }>;
}

// ── Category config ────────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<NodeCategory, { color: string; label: string; bg: string; border: string }> = {
  input:      { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", label: "Input"      },
  processing: { color: "#0ea5e9", bg: "#e0f2fe", border: "#bae6fd", label: "Processing" },
  retrieval:  { color: "#10b981", bg: "#d1fae5", border: "#a7f3d0", label: "Retrieval"  },
  execution:  { color: "#f59e0b", bg: "#fef3c7", border: "#fde68a", label: "Execução"   },
  prompt:     { color: "#8b5cf6", bg: "#ede9fe", border: "#c4b5fd", label: "Prompt"     },
  output:     { color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", label: "Output"     },
};

// ── Node catalog ───────────────────────────────────────────────────────────────
interface CatalogEntry {
  id: string;
  category: NodeCategory;
  label: string;
  description: string;
  tech: string[];
  optional: boolean;
  variants?: NodeVariant[];
  selectedVariant?: string;
  serviceFile?: string;
}

const NODE_CATALOG: CatalogEntry[] = [
  {
    id: "api-ingress",
    category: "input",
    label: "API Request",
    description: "Ponto de entrada da pipeline. Recebe a requisição HTTP, valida o schema Pydantic, aplica política de confidencialidade e roteia para os próximos estágios. Suporta autenticação por header e rate limiting.",
    tech: ["FastAPI", "Pydantic", "Rate limiting"],
    optional: false,
    serviceFile: "routes.py",
  },
  {
    id: "prompt-catalog",
    category: "prompt",
    label: "PromptCatalog",
    description: "Resolve prompts por nome a partir de arquivos .md em disco. Suporta frontmatter para metadados (nome, modo, descrição), seções ## system_prompt e ## user_prompt_template. Cache em memória para evitar leitura repetida.",
    tech: ["Markdown", "Frontmatter", "In-memory cache"],
    optional: false,
    serviceFile: "prompt_catalog.py",
  },
  {
    id: "confidentiality",
    category: "processing",
    label: "Confidentiality Policy",
    description: "Aplica política de confidencialidade configurada — redacta campos PII, limita profundidade de contexto, bloqueia providers externos em modo strict e registra a policy aplicada na trilha de auditoria.",
    tech: ["Policy engine", "PII redaction", "Audit logging"],
    optional: false,
    serviceFile: "config.py",
  },
  {
    id: "normalizer",
    category: "processing",
    label: "IssueNormalizer",
    description: "Transforma a issue bruta do Jira em um pacote canônico: sumário, tipo, prioridade, componente, ambiente, fingerprint de erro (hash SHA-256 do stack trace) e sinais de impacto financeiro via regex sobre o body.",
    tech: ["Normalization", "SHA-256 fingerprint", "Financial signals", "Regex"],
    optional: false,
    serviceFile: "normalization.py",
  },
  {
    id: "artifacts",
    category: "processing",
    label: "ArtifactPipeline",
    description: "Extrai artefatos estruturados de anexos e logs: entradas CSV de reconciliação, stack traces com frame parsing, tabelas de pagamento e qualquer dado tabulado. Expõe como evidência para o motor de julgamento LLM.",
    tech: ["CSV parsing", "Stack trace parsing", "Structured extraction"],
    optional: false,
    serviceFile: "artifacts.py",
  },
  {
    id: "rules",
    category: "processing",
    label: "RulesEngine",
    description: "Motor de regras 100% determinístico: verifica campos obrigatórios, detecta padrões de impacto financeiro, identifica inconsistências entre campos relacionados e marca duplicatas por fingerprint. Roda antes do LLM — zero custo de tokens.",
    tech: ["Rules DSL", "Financial patterns", "Dedup by fingerprint"],
    optional: false,
    serviceFile: "rules.py",
  },
  {
    id: "embeddings",
    category: "retrieval",
    label: "Embeddings",
    description: "Gera vetores densos para busca semântica. Suporta múltiplos modelos: OpenAI text-embedding-ada-002 (1536 dims), OpenAI text-embedding-3-small, Gemini embedding-001 (768 dims) e modelos locais via Ollama. Dimensão configurável por modelo.",
    tech: ["Dense vectors", "Multiple models"],
    optional: false,
    serviceFile: "embeddings.py",
    variants: [
      { id: "openai-ada", label: "OpenAI Ada-002", description: "text-embedding-ada-002 — 1536 dims, padrão de mercado", tech: ["OpenAI", "1536 dims", "Hosted"] },
      { id: "openai-3s",  label: "OpenAI 3-Small", description: "text-embedding-3-small — mais barato, boa performance", tech: ["OpenAI", "1536 dims", "Cost-optimized"] },
      { id: "gemini",     label: "Gemini Embedding", description: "embedding-001 — 768 dims, Vertex AI, multimodal aware", tech: ["Gemini", "768 dims", "Vertex AI"] },
      { id: "ollama",     label: "Ollama (local)", description: "Modelo local viaOllama — zero custo, privacidade total", tech: ["Ollama", "local", "Free"] },
    ],
    selectedVariant: "openai-ada",
  },
  {
    id: "retriever",
    category: "retrieval",
    label: "HybridRetriever",
    description: "Recupera contexto relevante combinando múltiplas estratégias. Hybrid BM25+Dense oferece melhor cobertura; Qdrant oferece velocidade pura; Neo4j permite navegar relações entre issues; In-memory para desenvolvimento sem dependências externas.",
    tech: ["Configurable strategy", "Metadata filters"],
    optional: false,
    serviceFile: "retrieval.py",
    variants: [
      { id: "hybrid",   label: "Hybrid BM25 + Dense", description: "Fusion de busca esparsa (BM25) com densa — melhor cobertura semântica + keyword", tech: ["BM25", "Dense", "Reciprocal Rank Fusion"] },
      { id: "qdrant",   label: "Qdrant only",          description: "Busca vetorial pura no Qdrant — rápida, escalável, com filtros de metadados", tech: ["Qdrant", "Dense", "Fast"] },
      { id: "neo4j",    label: "Neo4j GraphRAG",        description: "Busca em grafo: retorna issues relacionados, duplicatas e raízes de causa a distância 2 no grafo", tech: ["Neo4j", "Cypher", "Graph depth-2"] },
      { id: "memory",   label: "In-Memory",             description: "Cosine similarity em memória — sem dependências externas, ideal para dev/test", tech: ["In-memory", "Cosine", "No infra"] },
    ],
    selectedVariant: "hybrid",
  },
  {
    id: "neo4j",
    category: "retrieval",
    label: "Neo4j GraphRAG",
    description: "Camada opcional de recuperação baseada em grafo de conhecimento. Cada issue indexada como nó com arestas para componente, serviço, ambiente e fingerprint de erro. Busca em profundidade 2 retorna issues semanticamente relacionados como evidência adicional.",
    tech: ["Neo4j 5+", "Cypher", "Graph index", "Error fingerprint", "Depth-2 search"],
    optional: true,
    serviceFile: "neo4j_store.py",
  },
  {
    id: "reranker",
    category: "retrieval",
    label: "Reranker",
    description: "Cross-encoder que reordena candidatos recuperados por relevância semântica real — elimina falsos positivos do retriever antes de enviar contexto ao LLM. Reduz tokens enviados ao provider sem perder evidência relevante.",
    tech: ["Cross-encoder", "Score threshold", "Token reduction"],
    optional: true,
    serviceFile: "rerank.py",
    variants: [
      { id: "local",  label: "Cross-Encoder local", description: "Modelo cross-encoder local via sentence-transformers — zero custo de API", tech: ["sentence-transformers", "local", "Free"] },
      { id: "cohere", label: "Cohere Rerank",        description: "Cohere Rerank API — alta qualidade, latência baixa, pago por chamada", tech: ["Cohere", "API", "High quality"] },
    ],
    selectedVariant: "local",
  },
  {
    id: "provider",
    category: "execution",
    label: "LLM Provider",
    description: "Executa o prompt renderizado no modelo selecionado. Implementa retry com backoff exponencial, streaming opcional, normalização do retorno JSON contra o schema de DecisionResult e cálculo de confidence score pela probabilidade dos tokens-chave.",
    tech: ["Retry + backoff", "JSON normalization", "Confidence scoring", "Streaming"],
    optional: false,
    serviceFile: "decision.py",
    variants: [
      { id: "gpt4o",      label: "GPT-4o",           description: "Raciocínio avançado, 128k ctx, visão. A escolha para casos complexos.", tech: ["OpenAI", "GPT-4o", "128k ctx"] },
      { id: "gpt4o-mini", label: "GPT-4o mini",      description: "Custo 15x menor que GPT-4o, ótima performance para triagem padrão.", tech: ["OpenAI", "GPT-4o mini", "Cost-optimized"] },
      { id: "gpt41",      label: "GPT-4.1",           description: "GPT-4.1 — melhor seguimento de instruções, 1M ctx.", tech: ["OpenAI", "GPT-4.1", "1M ctx"] },
      { id: "gemini-flash", label: "Gemini 2.5 Flash", description: "Multimodal, 1M ctx, rápido e barato. Ideal para high-volume.", tech: ["Gemini", "2.5 Flash", "1M ctx"] },
      { id: "gemini-pro",   label: "Gemini 2.5 Pro",   description: "Maior capacidade da linha Gemini, 2M ctx, raciocínio profundo.", tech: ["Gemini", "2.5 Pro", "2M ctx"] },
      { id: "ollama",     label: "Ollama (local)",    description: "Modelo local — privacidade total, zero custo de API, sem latência de rede.", tech: ["Ollama", "local", "Free", "Private"] },
      { id: "mock",       label: "Mock Provider",     description: "Retorno simulado determinístico — sem custo, ideal para testes e CI.", tech: ["Mock", "dev/test", "Free"] },
    ],
    selectedVariant: "gpt4o",
  },
  {
    id: "dspy",
    category: "prompt",
    label: "DSPy Optimizer",
    description: "Laboratório offline de otimização de prompts. Treina assinaturas DSPy contra o golden dataset usando BootstrapFewShot ou MIPROv2, seleciona os melhores programas por métrica RAGAS e exporta de volta para prompts/ — fechando o loop de melhoria contínua.",
    tech: ["DSPy", "BootstrapFewShot", "MIPROv2", "Golden dataset", "Prompt export"],
    optional: true,
    serviceFile: "dspy_optimizer.py",
  },
  {
    id: "result-norm",
    category: "output",
    label: "ResultNormalizer",
    description: "Valida a saída bruta do LLM contra o schema DecisionResult, preenche campos ausentes com padrões seguros, calcula scores derivados (completeness, risk_level) e formata a resposta final da API.",
    tech: ["Schema validation", "Safe defaults", "Score derivation"],
    optional: false,
    serviceFile: "decision.py",
  },
  {
    id: "audit",
    category: "output",
    label: "AuditStore",
    description: "Grava trilha de auditoria completa em disco (JSON timestamped) e opcionalmente no MongoDB. Registra: input completo, output do LLM, métricas de latência por estágio, provider usado, política aplicada e estado da pipeline — para replay e análise operacional.",
    tech: ["JSON audit trail", "MongoDB optional", "Latency metrics", "Replay-ready"],
    optional: false,
    serviceFile: "audit.py",
  },
  {
    id: "ragas",
    category: "output",
    label: "RAGASEvaluator",
    description: "Avalia a qualidade da resposta RAG offline contra o golden dataset. Métricas: faithfulness (fidelidade ao contexto), answer relevancy, context precision e context recall. Resultados gravados como comparison report para análise comparativa entre configurações.",
    tech: ["RAGAS", "Faithfulness", "Context precision", "Answer relevancy", "Context recall"],
    optional: true,
    serviceFile: "evaluation.py",
  },
];

// ── Default layout ─────────────────────────────────────────────────────────────
const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  "api-ingress":    { x: 0,    y: 170 },
  "prompt-catalog": { x: 270,  y: 60  },
  "confidentiality":{ x: 270,  y: 270 },
  "normalizer":     { x: 540,  y: 170 },
  "artifacts":      { x: 810,  y: 60  },
  "rules":          { x: 810,  y: 270 },
  "embeddings":     { x: 1080, y: 170 },
  "retriever":      { x: 1350, y: 60  },
  "neo4j":          { x: 1350, y: 290 },
  "reranker":       { x: 1620, y: 170 },
  "provider":       { x: 1890, y: 60  },
  "dspy":           { x: 1890, y: 290 },
  "result-norm":    { x: 2160, y: 60  },
  "audit":          { x: 2160, y: 250 },
  "ragas":          { x: 2160, y: 440 },
};

function buildDefaultNodes(overrides?: SavedFlow["nodes"]): PipelineNode[] {
  return NODE_CATALOG.map((entry) => {
    const ov = overrides?.find((o) => o.id === entry.id);
    return {
      id: entry.id,
      type: "pipeline",
      position: ov ? { x: ov.x, y: ov.y } : (DEFAULT_POSITIONS[entry.id] ?? { x: 0, y: 0 }),
      data: {
        category: entry.category,
        label: entry.label,
        description: entry.description,
        tech: entry.tech,
        active: ov ? ov.active : !entry.optional,
        optional: entry.optional,
        variants: entry.variants,
        selectedVariant: ov?.selectedVariant ?? entry.selectedVariant,
        serviceFile: entry.serviceFile,
      },
    };
  });
}

// ── Edges ──────────────────────────────────────────────────────────────────────
const eStyle = { stroke: "#94a3b8", strokeWidth: 1.5 };
const eDash  = { stroke: "#cbd5e1", strokeWidth: 1.5, strokeDasharray: "6,4" };
const mk = { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 16, height: 16 };

const DEFAULT_EDGES: Edge[] = [
  { id:"e01", source:"api-ingress",    target:"prompt-catalog",   style: eStyle, markerEnd: mk },
  { id:"e02", source:"api-ingress",    target:"confidentiality",  style: eStyle, markerEnd: mk },
  { id:"e03", source:"prompt-catalog", target:"normalizer",       style: eStyle, markerEnd: mk },
  { id:"e04", source:"confidentiality",target:"normalizer",       style: eStyle, markerEnd: mk },
  { id:"e05", source:"normalizer",     target:"artifacts",        style: eStyle, markerEnd: mk },
  { id:"e06", source:"normalizer",     target:"rules",            style: eStyle, markerEnd: mk },
  { id:"e07", source:"artifacts",      target:"embeddings",       style: eStyle, markerEnd: mk },
  { id:"e08", source:"rules",          target:"embeddings",       style: eStyle, markerEnd: mk },
  { id:"e09", source:"embeddings",     target:"retriever",        style: eStyle, markerEnd: mk },
  { id:"e10", source:"embeddings",     target:"neo4j",            style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e11", source:"retriever",      target:"reranker",         style: eStyle, markerEnd: mk },
  { id:"e12", source:"neo4j",          target:"reranker",         style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e13", source:"reranker",       target:"provider",         style: eStyle, markerEnd: mk },
  { id:"e14", source:"provider",       target:"result-norm",      style: eStyle, markerEnd: mk },
  { id:"e15", source:"dspy",           target:"provider",         style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e16", source:"result-norm",    target:"audit",            style: eStyle, markerEnd: mk },
  { id:"e17", source:"result-norm",    target:"ragas",            style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
];

// ── Custom node component ──────────────────────────────────────────────────────
function PipelineNodeComponent({ data, selected }: NodeProps<PipelineNode>) {
  const cfg = CATEGORY_CONFIG[data.category];
  const isActive = data.active;
  const activeVariant = data.variants?.find((v) => v.id === data.selectedVariant);
  return (
    <div
      className={`pn ${isActive ? "pn--active" : "pn--inactive"} ${selected ? "pn--selected" : ""}`}
      style={{ "--pn-color": cfg.color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Left}  className="pn__handle pn__handle--target" />
      <div className="pn__top">
        <span className="pn__cat" style={{ background: isActive ? cfg.color : "#94a3b8" }}>{cfg.label}</span>
        {data.optional && (
          <span className={`pn__status ${isActive ? "pn__status--on" : "pn__status--off"}`}>
            {isActive ? "ativo" : "off"}
          </span>
        )}
      </div>
      <div className="pn__label">{data.label}</div>
      {activeVariant && (
        <div className="pn__variant" style={{ color: isActive ? cfg.color : "#94a3b8" }}>
          {activeVariant.label}
        </div>
      )}
      <div className="pn__tags">
        {data.tech.slice(0, 2).map((t) => (
          <span key={t} className="pn__tag">{t}</span>
        ))}
        {data.tech.length > 2 && (
          <span className="pn__tag pn__tag--more">+{data.tech.length - 2}</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="pn__handle pn__handle--source" />
    </div>
  );
}

const nodeTypes = { pipeline: PipelineNodeComponent };

// ── Node Sidebar ───────────────────────────────────────────────────────────────
function NodeSidebar({
  node,
  onClose,
  onUpdate,
}: {
  node: PipelineNode;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<PipelineNodeData>) => void;
}) {
  const d = node.data;
  const cfg = CATEGORY_CONFIG[d.category];
  return (
    <aside className="pc__sidebar">
      <div className="pc__sb-header" style={{ borderTopColor: cfg.color }}>
        <div className="pc__sb-title-row">
          <span className="pc__sb-cat" style={{ background: cfg.color }}>{cfg.label}</span>
          <button className="pc__sb-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <h2 className="pc__sb-title">{d.label}</h2>
        {d.serviceFile && (
          <code className="pc__sb-file">{d.serviceFile}</code>
        )}
      </div>

      <div className="pc__sb-body">
        <p className="pc__sb-desc">{d.description}</p>

        {/* Active toggle (optional nodes only) */}
        {d.optional && (
          <div className="pc__sb-section">
            <div className="pc__sb-section-label">Status</div>
            <label className="pc__toggle">
              <input
                type="checkbox"
                checked={d.active}
                onChange={(e) => onUpdate(node.id, { active: e.target.checked })}
              />
              <span className="pc__toggle-track" style={{ "--t-on": cfg.color } as React.CSSProperties} />
              <span className="pc__toggle-label">{d.active ? "Ativo na pipeline" : "Desativado (bypass)"}</span>
            </label>
          </div>
        )}

        {/* Variant selector */}
        {d.variants && d.variants.length > 0 && (
          <div className="pc__sb-section">
            <div className="pc__sb-section-label">Implementação</div>
            <div className="pc__variants">
              {d.variants.map((v) => {
                const isSelected = v.id === d.selectedVariant;
                return (
                  <button
                    key={v.id}
                    className={`pc__variant-card ${isSelected ? "pc__variant-card--active" : ""}`}
                    style={{ "--vc-color": cfg.color } as React.CSSProperties}
                    onClick={() => onUpdate(node.id, { selectedVariant: v.id })}
                  >
                    <div className="pc__vc-top">
                      <span className="pc__vc-label">{v.label}</span>
                      {isSelected && <span className="pc__vc-check">✓</span>}
                    </div>
                    <p className="pc__vc-desc">{v.description}</p>
                    <div className="pc__vc-tags">
                      {v.tech.map((t) => <span key={t} className="pn__tag">{t}</span>)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* All tech tags */}
        <div className="pc__sb-section">
          <div className="pc__sb-section-label">Tecnologias</div>
          <div className="pc__sb-tags">
            {d.tech.map((t) => (
              <span key={t} className="chip accent">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Save panel ─────────────────────────────────────────────────────────────────
function SavePanel({
  onClose,
  onSave,
  status,
}: {
  onClose: () => void;
  onSave: (name: string) => void;
  status: "idle" | "saving" | "saved" | "error";
}) {
  const [name, setName] = useState("");
  return (
    <div className="pc__modal-overlay" onClick={onClose}>
      <div className="pc__modal" onClick={(e) => e.stopPropagation()}>
        <div className="pc__modal-header">
          <h3>Salvar configuração</h3>
          <button className="pc__sb-close" onClick={onClose}>✕</button>
        </div>
        <div className="pc__modal-body">
          <label className="pc__modal-label">Nome do flow</label>
          <input
            className="pc__modal-input"
            placeholder="ex: Pipeline analítico com Neo4j"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          />
        </div>
        <div className="pc__modal-footer">
          <button className="btn-sm" onClick={onClose}>Cancelar</button>
          <button
            className="btn-sm btn-sm--primary"
            disabled={!name.trim() || status === "saving"}
            onClick={() => onSave(name.trim())}
          >
            {status === "saving" ? "Salvando…" : status === "saved" ? "✓ Salvo!" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Load panel ─────────────────────────────────────────────────────────────────
function LoadPanel({
  flows,
  onClose,
  onLoad,
  onDelete,
}: {
  flows: SavedFlow[];
  onClose: () => void;
  onLoad: (flow: SavedFlow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="pc__modal-overlay" onClick={onClose}>
      <div className="pc__modal pc__modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="pc__modal-header">
          <h3>Flows salvos</h3>
          <button className="pc__sb-close" onClick={onClose}>✕</button>
        </div>
        <div className="pc__modal-body">
          {flows.length === 0 ? (
            <p className="pc__modal-empty">Nenhum flow salvo ainda. Configure a pipeline e clique em "Salvar flow".</p>
          ) : (
            <ul className="pc__flow-list">
              {flows.map((f) => (
                <li key={f.id} className="pc__flow-item">
                  <div className="pc__flow-info">
                    <span className="pc__flow-name">{f.name}</span>
                    <span className="pc__flow-date">{new Date(f.createdAt).toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year:"numeric" })}</span>
                  </div>
                  <div className="pc__flow-actions">
                    <button className="btn-sm btn-sm--primary" onClick={() => { onLoad(f); onClose(); }}>Carregar</button>
                    <button className="btn-sm btn-sm--danger"  onClick={() => onDelete(f.id)}>Excluir</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main canvas ────────────────────────────────────────────────────────────────
export function PipelineCanvas({ initialFlows = [] }: { initialFlows?: SavedFlow[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>(buildDefaultNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showSave,   setShowSave]   = useState(false);
  const [showLoad,   setShowLoad]   = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [flows, setFlows] = useState<SavedFlow[]>(initialFlows);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, style: eStyle, markerEnd: mk }, eds)),
    [setEdges],
  );

  const handleNodeClick = useCallback((_: React.MouseEvent, node: PipelineNode) => {
    setSelectedNodeId(node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleUpdateNodeData = useCallback((id: string, patch: Partial<PipelineNodeData>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }, [setNodes]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const handleSave = async (name: string) => {
    setSaveStatus("saving");
    const payload = {
      nodes: nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, active: n.data.active, selectedVariant: n.data.selectedVariant })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    };
    const result = await saveFlowAction(name, payload.nodes, payload.edges);
    if (result.ok) {
      setSaveStatus("saved");
      setFlows((prev) => [...prev, { id: result.id, name, createdAt: new Date().toISOString(), nodes: payload.nodes, edges: payload.edges }]);
      setTimeout(() => { setSaveStatus("idle"); setShowSave(false); }, 1500);
    } else {
      setSaveStatus("error");
    }
  };

  const handleLoad = (flow: SavedFlow) => {
    setNodes(buildDefaultNodes(flow.nodes));
    setEdges(
      flow.edges.map((e) => ({ ...e, style: eStyle, markerEnd: mk })),
    );
    setSelectedNodeId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteFlowAction(id);
    setFlows((prev) => prev.filter((f) => f.id !== id));
  };

  const handleReset = () => {
    setNodes(buildDefaultNodes());
    setEdges(DEFAULT_EDGES);
    setSelectedNodeId(null);
  };

  const activeCount   = nodes.filter((n) => n.data.active).length;
  const optionalCount = nodes.filter((n) => n.data.optional).length;

  return (
    <div className={`pc ${selectedNode ? "pc--with-sidebar" : ""}`}>
      <div className="pc__canvas-area">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e2e8f0" />
          <Controls showInteractive={false} className="pc__controls" />
          <MiniMap
            className="pc__minimap"
            nodeColor={(n) => {
              const data = (n.data as PipelineNodeData);
              return data.active ? (CATEGORY_CONFIG[data.category]?.color ?? "#888") : "#d1d5db";
            }}
            maskColor="rgba(248,250,252,0.85)"
            pannable
            zoomable
          />

          {/* Top-right actions */}
          <Panel position="top-right" className="pc__panel-actions">
            <div className="pc__stats">
              <span className="pc__stat">{activeCount} nós ativos</span>
              <span className="pc__stat-sep">·</span>
              <span className="pc__stat">{optionalCount} opcionais</span>
            </div>
            <button className="btn-sm" onClick={() => setShowLoad(true)}>
              📂 Carregar
            </button>
            <button className="btn-sm btn-sm--primary" onClick={() => { setSaveStatus("idle"); setShowSave(true); }}>
              💾 Salvar flow
            </button>
            <button className="btn-sm" onClick={handleReset} title="Resetar para o layout padrão">
              ↺ Resetar
            </button>
          </Panel>

          {/* Legend */}
          <Panel position="bottom-left" className="pc__legend">
            {(Object.entries(CATEGORY_CONFIG) as [NodeCategory, typeof CATEGORY_CONFIG[NodeCategory]][]).map(([key, cfg]) => (
              <div key={key} className="pc__legend-item">
                <span className="pc__legend-dot" style={{ background: cfg.color }} />
                <span className="pc__legend-label">{cfg.label}</span>
              </div>
            ))}
            <div className="pc__legend-item pc__legend-item--hint">
              <span className="pc__legend-dash">- - -</span>
              <span className="pc__legend-label">Opcional</span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Side panel */}
      {selectedNode && (
        <NodeSidebar
          node={selectedNode}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={handleUpdateNodeData}
        />
      )}

      {/* Modals */}
      {showSave && (
        <SavePanel
          onClose={() => setShowSave(false)}
          onSave={handleSave}
          status={saveStatus}
        />
      )}
      {showLoad && (
        <LoadPanel
          flows={flows}
          onClose={() => setShowLoad(false)}
          onLoad={handleLoad}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
