"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { saveFlowAction, updateFlowAction, deleteFlowAction } from "@/app/actions";
import { getApiBase } from "@/lib/api-base";

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeCategory = "input" | "processing" | "retrieval" | "execution" | "prompt" | "output";
type FlowMode = "issue-validation" | "article-analysis";

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
    id: "flow-mode",
    category: "input",
    label: "Flow Mode",
    description: "Seleciona qual cenário o backend dinâmico executa a partir do canvas. Use issue validation para triagem de Jira e article analysis para resumir ou analisar textos com busca opcional no corpus de artigos.",
    tech: ["Dynamic dispatch", "Issue validation", "Article analysis"],
    optional: false,
    serviceFile: "flow_runner.py",
    variants: [
      { id: "issue-validation", label: "Issue validation", description: "Triagem e validação de issues Jira com ValidationWorkflow e LangGraph.", tech: ["ValidationRequest", "DecisionResult"] },
      { id: "article-analysis", label: "Article analysis", description: "Análise de artigos com PromptCatalog e busca opcional no corpus indexado.", tech: ["PromptExecution", "ArticleStore"] },
    ],
    selectedVariant: "issue-validation",
  },
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
    id: "monkeyocr",
    category: "processing",
    label: "MonkeyOCR PDF Parser",
    description: "Ativa o sidecar MonkeyOCR para PDFs complexos. Ele entra no issue-validation para anexos PDF e nos endpoints de upload/ingest de artigos. No /run-flow de article-analysis com texto colado, este nó não participa.",
    tech: ["MonkeyOCR", "PDF SRR", "Sidecar HTTP", "PDF attachments"],
    optional: true,
    serviceFile: "article_store.py / artifacts.py",
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
    id: "planner",
    category: "prompt",
    label: "Tool-Aware Planner",
    description: "Decompõe a issue em subtarefas, decide se cada passo precisa de retrieval vetorial, grafo, artefato local ou validação determinística e produz um plano iterativo em vez de uma única query linear.",
    tech: ["Planning", "Task decomposition", "LangGraph state"],
    optional: true,
    serviceFile: "langgraph_workflow.py",
    variants: [
      { id: "step-plan", label: "Step plan", description: "Plano simples com 2-5 subperguntas orientadas por evidência.", tech: ["Research steps", "Low latency"] },
      { id: "tool-aware", label: "Tool-aware", description: "Planejador escolhe explicitamente retrieval, grafo, regras ou revisão humana por etapa.", tech: ["Tool routing", "Agentic"] },
    ],
    selectedVariant: "tool-aware",
  },
  {
    id: "query-rewriter",
    category: "prompt",
    label: "Query Rewriter",
    description: "Reescreve e expande a consulta por tipo de evidência: erro, regra oculta, versão conflitante, multi-hop ou agregação. É a peça que tira o app do `build_query()` único.",
    tech: ["Query rewriting", "Metadata-aware", "HyDE optional"],
    optional: true,
    serviceFile: "retrieval.py",
    variants: [
      { id: "metadata-aware", label: "Metadata-aware", description: "Gera queries separadas por labels, componente, serviço e versão.", tech: ["Metadata", "Precision"] },
      { id: "hyde", label: "HyDE", description: "Expansão hipotética da query para recall maior em bases ruidosas.", tech: ["HyDE", "Recall"] },
    ],
    selectedVariant: "metadata-aware",
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
    id: "temporal-graphrag",
    category: "retrieval",
    label: "Temporal GraphRAG",
    description: "Enriquecimento do fluxo com fatos, políticas, versões e relações temporais para lidar com hidden rules, conflitos de versão e multi-hop real entre artefatos.",
    tech: ["Temporal graph", "Entity resolution", "Versioned facts"],
    optional: true,
    serviceFile: "neo4j_store.py",
    variants: [
      { id: "fact-graph", label: "Fact graph", description: "Expande o grafo atual de issues para fatos e entidades extraídas.", tech: ["Facts", "Entities"] },
      { id: "versioned-graph", label: "Versioned graph", description: "Inclui histórico e validade temporal para políticas e comportamento esperado.", tech: ["Temporal edges", "Policy history"] },
    ],
    selectedVariant: "versioned-graph",
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
    id: "distiller",
    category: "retrieval",
    label: "Distiller",
    description: "Comprime o contexto recuperado antes de enviá-lo ao LLM judge. Simple: extrai primeira frase e tokens exatos (IDs, valores, timestamps). REFRAG (Meta 2025): usa um LLM auxiliar leve para reescrever cada chunk em forma compacta, preservando literalmente todos os tokens críticos — ~30x menos tokens sem perda de precisão.",
    tech: ["Context compression", "Token preservation", "REFRAG"],
    optional: true,
    serviceFile: "distiller.py",
    variants: [
      { id: "simple", label: "Simple",  description: "Extração rule-based: primeira frase + tokens exatos por regex. Zero custo de LLM.", tech: ["Regex", "Rule-based", "Free"] },
      { id: "refrag", label: "REFRAG",  description: "Compressão LLM-based estilo REFRAG (Meta 2025): reescreve evidências com modelo auxiliar, preserva tokens críticos literalmente.", tech: ["LLM compression", "Token preservation", "REFRAG"] },
    ],
    selectedVariant: "simple",
  },
  {
    id: "reflection-memory",
    category: "processing",
    label: "Reflection Memory",
    description: "Guarda o histórico cumulativo da pesquisa: o que já foi confirmado, o que continua em aberto e quais estratégias falharam. É a memória curta do loop agentic.",
    tech: ["Research history", "Summaries", "Checkpoint state"],
    optional: true,
    serviceFile: "langgraph_workflow.py",
    variants: [
      { id: "summary-log", label: "Summary log", description: "Cada iteração adiciona um resumo factual curto ao estado.", tech: ["Summaries", "Low token"] },
      { id: "evidence-ledger", label: "Evidence ledger", description: "Mantém ledger estruturado de claims, fontes e gaps ainda não resolvidos.", tech: ["Claims", "Traceability"] },
    ],
    selectedVariant: "evidence-ledger",
  },
  {
    id: "policy-loop",
    category: "execution",
    label: "Policy Loop",
    description: "Nó de controle do LangGraph que decide se o pipeline encerra, replaneja, pede mais evidência, sobe para revisão humana ou chama uma segunda opinião.",
    tech: ["Conditional edges", "Human review", "Control flow"],
    optional: true,
    serviceFile: "langgraph_workflow.py",
    variants: [
      { id: "rule-gated", label: "Rule-gated", description: "Usa sinais determinísticos para decidir continuar, revisar ou encerrar.", tech: ["Rules", "Deterministic"] },
      { id: "policy-agent", label: "Policy agent", description: "Usa um agente leve para escolher próxima ação com base no histórico de pesquisa.", tech: ["Agentic loop", "Dynamic routing"] },
    ],
    selectedVariant: "rule-gated",
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
      { id: "ollm",       label: "oLLM (in-process)", description: "Modelo local no próprio backend Python, com offload para RAM/SSD e foco em contexto longo em hardware comum.", tech: ["oLLM", "In-process", "Offload", "Private"] },
      { id: "mock",       label: "Mock Provider",     description: "Retorno simulado determinístico — sem custo, ideal para testes e CI.", tech: ["Mock", "dev/test", "Free"] },
    ],
    selectedVariant: "gpt4o",
  },
  {
    id: "dspy",
    category: "prompt",
    label: "DSPy Optimizer",
    description: "Quando ativo no issue-validation, roda o lab de otimização com DSPy 3 + GEPA sobre o golden dataset, exporta prompts otimizados para prompts/ e reaproveita o catálogo atualizado no runtime.",
    tech: ["DSPy 3", "GEPA", "Golden dataset", "Prompt export"],
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

const NON_RUNTIME_OPTIONAL_NODES = new Set<string>(["ragas"]);

const SCENARIO_UNSUPPORTED_OPTIONAL_NODES: Record<FlowMode, Set<string>> = {
  "issue-validation": new Set([...NON_RUNTIME_OPTIONAL_NODES]),
  "article-analysis": new Set([
    ...NON_RUNTIME_OPTIONAL_NODES,
    "monkeyocr",
    "normalizer",
    "artifacts",
    "rules",
    "planner",
    "query-rewriter",
    "temporal-graphrag",
    "reranker",
    "distiller",
    "reflection-memory",
    "policy-loop",
    "result-norm",
    "audit",
    "dspy",
  ]),
};

const DSPY_SUPPORTED_PROVIDER_VARIANTS = new Set<string>([
  "gpt4o",
  "gpt4o-mini",
  "gpt41",
  "gemini-flash",
  "gemini-pro",
  "ollama",
]);

// ── Default layout ─────────────────────────────────────────────────────────────
const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  "flow-mode":      { x: -270, y: 170 },
  "api-ingress":    { x: 0,    y: 170 },
  "prompt-catalog": { x: 270,  y: 60  },
  "confidentiality":{ x: 270,  y: 270 },
  "normalizer":     { x: 540,  y: 170 },
  "artifacts":      { x: 810,  y: 60  },
  "rules":          { x: 810,  y: 270 },
  "planner":        { x: 1080, y: 20  },
  "query-rewriter": { x: 1080, y: 300 },
  "embeddings":     { x: 1350, y: 170 },
  "retriever":      { x: 1620, y: 20  },
  "neo4j":          { x: 1620, y: 210 },
  "temporal-graphrag": { x: 1620, y: 400 },
  "reranker":       { x: 1890, y: 170 },
  "distiller":      { x: 2160, y: 20  },
  "reflection-memory": { x: 2160, y: 210 },
  "policy-loop":    { x: 2430, y: 170 },
  "provider":       { x: 2700, y: 20  },
  "dspy":           { x: 2700, y: 250 },
  "result-norm":    { x: 2970, y: 20  },
  "audit":          { x: 2970, y: 210 },
  "ragas":          { x: 2970, y: 400 },
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
  { id:"e00", source:"flow-mode",      target:"api-ingress",      style: eStyle, markerEnd: mk },
  { id:"e01", source:"api-ingress",    target:"prompt-catalog",   style: eStyle, markerEnd: mk },
  { id:"e02", source:"api-ingress",    target:"confidentiality",  style: eStyle, markerEnd: mk },
  { id:"e03", source:"prompt-catalog", target:"normalizer",       style: eStyle, markerEnd: mk },
  { id:"e04", source:"confidentiality",target:"normalizer",       style: eStyle, markerEnd: mk },
  { id:"e05", source:"normalizer",     target:"artifacts",        style: eStyle, markerEnd: mk },
  { id:"e06", source:"normalizer",     target:"rules",            style: eStyle, markerEnd: mk },
  { id:"e07", source:"rules",          target:"planner",          style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e08", source:"artifacts",      target:"planner",          style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e09", source:"planner",        target:"query-rewriter",   style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e10", source:"artifacts",      target:"embeddings",       style: eStyle, markerEnd: mk },
  { id:"e11", source:"rules",          target:"embeddings",       style: eStyle, markerEnd: mk },
  { id:"e12", source:"query-rewriter", target:"embeddings",       style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e13", source:"embeddings",     target:"retriever",        style: eStyle, markerEnd: mk },
  { id:"e14", source:"embeddings",     target:"neo4j",            style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e15", source:"neo4j",          target:"temporal-graphrag",style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e16", source:"retriever",      target:"reranker",         style: eStyle, markerEnd: mk },
  { id:"e17", source:"temporal-graphrag", target:"reranker",      style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e18", source:"neo4j",          target:"reranker",         style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e19", source:"reranker",       target:"distiller",        style: eStyle, markerEnd: mk },
  { id:"e20", source:"distiller",      target:"reflection-memory",style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e21", source:"reflection-memory", target:"policy-loop",   style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e22", source:"distiller",      target:"policy-loop",      style: eStyle, markerEnd: mk },
  { id:"e23", source:"policy-loop",    target:"provider",         style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e24", source:"dspy",           target:"provider",         style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
  { id:"e25", source:"provider",       target:"result-norm",      style: eStyle, markerEnd: mk },
  { id:"e26", source:"result-norm",    target:"audit",            style: eStyle, markerEnd: mk },
  { id:"e27", source:"result-norm",    target:"ragas",            style: eDash,  markerEnd: { ...mk, color: "#cbd5e1" } },
];

const FLOW_DRAFT_STORAGE_KEY = "ragflow:flow-canvas:draft:v1";

function serializeCanvasState(nodes: PipelineNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      active: n.data.active,
      selectedVariant: n.data.selectedVariant,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  };
}

type ActiveFlowRef = { id: string; name: string } | null;

function sortStateNodes(nodes: SavedFlow["nodes"]) {
  return [...nodes].sort((left, right) => left.id.localeCompare(right.id));
}

function sortStateEdges(edges: SavedFlow["edges"]) {
  return [...edges].sort((left, right) => {
    const leftKey = `${left.source}->${left.target}:${left.id}`;
    const rightKey = `${right.source}->${right.target}:${right.id}`;
    return leftKey.localeCompare(rightKey);
  });
}

function areCanvasStatesEqual(
  leftNodes: SavedFlow["nodes"],
  leftEdges: SavedFlow["edges"],
  rightNodes: SavedFlow["nodes"],
  rightEdges: SavedFlow["edges"],
) {
  const aNodes = sortStateNodes(leftNodes);
  const bNodes = sortStateNodes(rightNodes);
  const aEdges = sortStateEdges(leftEdges);
  const bEdges = sortStateEdges(rightEdges);

  return JSON.stringify(aNodes) === JSON.stringify(bNodes)
    && JSON.stringify(aEdges) === JSON.stringify(bEdges);
}

function findMatchingSavedFlow(
  flows: SavedFlow[],
  nodes: SavedFlow["nodes"],
  edges: SavedFlow["edges"],
): ActiveFlowRef {
  const match = flows.find((flow) => areCanvasStatesEqual(flow.nodes, flow.edges, nodes, edges));
  return match ? { id: match.id, name: match.name } : null;
}

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
  nodes,
  onClose,
  onUpdate,
}: {
  node: PipelineNode;
  nodes: PipelineNode[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<PipelineNodeData>) => void;
}) {
  const d = node.data;
  const cfg = CATEGORY_CONFIG[d.category];
  const availability = getNodeRuntimeAvailability(node.id, nodes);
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
            {!availability.selectable && (
              <p className="pc__sb-desc" style={{ marginBottom: ".6rem", color: "#b45309" }}>
                Indisponível neste flow: {availability.reason}
              </p>
            )}
            <label className="pc__toggle">
              <input
                type="checkbox"
                checked={d.active}
                disabled={!availability.selectable}
                onChange={(e) => onUpdate(node.id, { active: e.target.checked })}
              />
              <span className="pc__toggle-track" style={{ "--t-on": cfg.color } as React.CSSProperties} />
              <span className="pc__toggle-label">
                {!availability.selectable
                  ? "Indisponível neste flow"
                  : d.active
                    ? "Ativo na pipeline"
                    : "Desativado (bypass)"}
              </span>
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

// ── Run Flow panel ───────────────────────────────────────────────────────────
type FlowDescription = {
  flow_mode: string;
  provider: string; llm_model: string;
  configured_provider: string; configured_llm_model: string;
  embedding_model: string;
  retrieval: { external: boolean; graphrag: boolean; cascade: boolean };
  agentic: {
    planner: boolean;
    query_rewriter: boolean;
    reflection_memory: boolean;
    policy_loop: boolean;
    temporal_graphrag: boolean;
  };
  reranker: boolean; distiller: string; confidentiality: boolean; langgraph: boolean; monkeyocr: boolean;
  planner_mode: string; query_rewriter_mode: string; reflection_mode: string;
  policy_mode: string; temporal_graphrag_mode: string;
  dspy_active: boolean; ragas_active: boolean;
  supported_runtime_nodes: string[];
  ignored_nodes: string[];
  warnings: string[];
};

type RunDecisionResult = {
  issue_key: string;
  classification: "bug" | "not_bug" | "needs_review";
  is_bug: boolean; is_complete: boolean; ready_for_dev: boolean;
  missing_items: string[]; evidence_used: string[]; contradictions: string[];
  financial_impact_detected: boolean; confidence: number;
  requires_human_review: boolean; provider: string; model: string; rationale: string;
};

type RunPromptResult = {
  prompt_name: string;
  mode: "decision" | "text";
  provider: string;
  model: string;
  output_text: string;
};

type GraphUsefulnessAssessment = {
  mode: "vector-global" | "graph-local" | "graph-multi-hop" | "graph-bridge";
  score: number;
  rationale: string;
  signals: string[];
};

type ArticleEvidencePath = {
  path_id: string;
  relation: string;
  nodes: string[];
  score: number;
  summary: string;
};

type ArticleDistillation = {
  mode: string;
  context_text: string;
  key_entities: string[];
  key_topics: string[];
  evidence_paths: ArticleEvidencePath[];
};

type ArticleBenchmarkScenario = {
  mode: string;
  retrieval_mode: string;
  latency_ms: number;
  result_count: number;
  top_doc_ids: string[];
  top_titles: string[];
};

type ArticleBenchmarkResult = {
  query: string;
  recommended_mode: string;
  graph_usefulness: GraphUsefulnessAssessment | null;
  scenarios: ArticleBenchmarkScenario[];
};

type ArticleSearchHit = {
  chunk_id: string;
  doc_id: string;
  title: string;
  chunk_index: number;
  content: string;
  topics: string[];
  entities?: string[];
  score: number;
  source_path: string;
  retrieval_mode?: string;
  graph_usefulness?: GraphUsefulnessAssessment | null;
  evidence_paths?: ArticleEvidencePath[];
};

type DSPyOptimizationResult = {
  active: boolean;
  optimizer: string | null;
  provider: string | null;
  triggered: boolean;
  skipped_reason: string | null;
  dev_score: number | null;
  exported_files: string[];
  history_file?: string | null;
};

type FlowRunResponse = {
  flow_mode: string;
  decision: RunDecisionResult | null;
  prompt_execution: RunPromptResult | null;
  article_search: ArticleSearchHit[];
  related_articles: Array<Record<string, unknown>>;
  article_graph_assessment: GraphUsefulnessAssessment | null;
  article_distillation: ArticleDistillation | null;
  article_benchmark: ArticleBenchmarkResult | null;
  dspy_optimization: DSPyOptimizationResult | null;
  warnings: string[];
};

function normalizeFlowDescription(raw: unknown, fallbackMode: string): FlowDescription {
  const data = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const retrieval = (data.retrieval && typeof data.retrieval === "object")
    ? data.retrieval as Record<string, unknown>
    : {};
  const agentic = (data.agentic && typeof data.agentic === "object")
    ? data.agentic as Record<string, unknown>
    : {};

  return {
    flow_mode: typeof data.flow_mode === "string" ? data.flow_mode : fallbackMode,
    provider: typeof data.provider === "string" ? data.provider : "unknown",
    llm_model: typeof data.llm_model === "string" ? data.llm_model : "unknown",
    configured_provider: typeof data.configured_provider === "string" ? data.configured_provider : (typeof data.provider === "string" ? data.provider : "unknown"),
    configured_llm_model: typeof data.configured_llm_model === "string" ? data.configured_llm_model : (typeof data.llm_model === "string" ? data.llm_model : "unknown"),
    embedding_model: typeof data.embedding_model === "string" ? data.embedding_model : "unknown",
    retrieval: {
      external: Boolean(retrieval.external),
      graphrag: Boolean(retrieval.graphrag),
      cascade: Boolean(retrieval.cascade),
    },
    agentic: {
      planner: Boolean(agentic.planner),
      query_rewriter: Boolean(agentic.query_rewriter),
      reflection_memory: Boolean(agentic.reflection_memory),
      policy_loop: Boolean(agentic.policy_loop),
      temporal_graphrag: Boolean(agentic.temporal_graphrag),
    },
    reranker: Boolean(data.reranker),
    distiller: typeof data.distiller === "string" ? data.distiller : "simple",
    confidentiality: Boolean(data.confidentiality),
    langgraph: Boolean(data.langgraph),
    monkeyocr: Boolean(data.monkeyocr),
    planner_mode: typeof data.planner_mode === "string" ? data.planner_mode : "",
    query_rewriter_mode: typeof data.query_rewriter_mode === "string" ? data.query_rewriter_mode : "",
    reflection_mode: typeof data.reflection_mode === "string" ? data.reflection_mode : "",
    policy_mode: typeof data.policy_mode === "string" ? data.policy_mode : "",
    temporal_graphrag_mode: typeof data.temporal_graphrag_mode === "string" ? data.temporal_graphrag_mode : "",
    dspy_active: Boolean(data.dspy_active),
    ragas_active: Boolean(data.ragas_active),
    supported_runtime_nodes: Array.isArray(data.supported_runtime_nodes) ? data.supported_runtime_nodes.filter((value): value is string => typeof value === "string") : [],
    ignored_nodes: Array.isArray(data.ignored_nodes) ? data.ignored_nodes.filter((value): value is string => typeof value === "string") : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((value): value is string => typeof value === "string") : [],
  };
}

function normalizeFlowRunResponse(raw: unknown, fallbackMode: string): FlowRunResponse {
  const data = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};

  return {
    flow_mode: typeof data.flow_mode === "string" ? data.flow_mode : fallbackMode,
    decision: (data.decision && typeof data.decision === "object") ? data.decision as RunDecisionResult : null,
    prompt_execution: (data.prompt_execution && typeof data.prompt_execution === "object") ? data.prompt_execution as RunPromptResult : null,
    article_search: Array.isArray(data.article_search) ? data.article_search as ArticleSearchHit[] : [],
    related_articles: Array.isArray(data.related_articles) ? data.related_articles as Array<Record<string, unknown>> : [],
    article_graph_assessment: (data.article_graph_assessment && typeof data.article_graph_assessment === "object")
      ? data.article_graph_assessment as GraphUsefulnessAssessment
      : null,
    article_distillation: (data.article_distillation && typeof data.article_distillation === "object")
      ? data.article_distillation as ArticleDistillation
      : null,
    article_benchmark: (data.article_benchmark && typeof data.article_benchmark === "object")
      ? data.article_benchmark as ArticleBenchmarkResult
      : null,
    dspy_optimization: (data.dspy_optimization && typeof data.dspy_optimization === "object") ? data.dspy_optimization as DSPyOptimizationResult : null,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((value): value is string => typeof value === "string") : [],
  };
}

function buildFlowNodePayload(nodes: PipelineNode[]) {
  return nodes.map((n) => {
    const entry = NODE_CATALOG.find((c) => c.id === n.id);
    const variantLabel = entry?.variants?.find((v) => v.id === n.data.selectedVariant)?.label ?? null;
    return { id: n.id, active: n.data.active, selected_variant: variantLabel };
  });
}

function formatModeLabel(mode?: string | null) {
  if (!mode) {
    return "Auto";
  }

  return mode
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : "n/a";
}

function formatLatency(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} ms`
    : "n/a";
}

function inferFlowMode(nodes: PipelineNode[]): FlowMode {
  const variant = nodes.find((node) => node.id === "flow-mode")?.data.selectedVariant;
  return variant === "article-analysis" ? "article-analysis" : "issue-validation";
}

function getNodeRuntimeAvailability(nodeId: string, nodes: PipelineNode[]) {
  const flowMode = inferFlowMode(nodes);

    if (SCENARIO_UNSUPPORTED_OPTIONAL_NODES[flowMode].has(nodeId)) {
      if (nodeId === "ragas") {
        return {
          selectable: false,
          reason: "RAGAS continua restrito à avaliação offline e ainda não altera o /run-flow.",
        };
      }
      if (nodeId === "monkeyocr" && flowMode === "article-analysis") {
        return {
          selectable: false,
          reason: "MonkeyOCR não participa do /run-flow de article-analysis com texto colado. Ele é usado em anexos PDF de issues e no upload/ingest de artigos.",
        };
      }
      if (flowMode === "article-analysis") {
        return {
          selectable: false,
          reason: "Este nó não participa do runtime de article-analysis.",
        };
    }
  }

  if (nodeId === "dspy") {
    const providerVariant = nodes.find((node) => node.id === "provider")?.data.selectedVariant;
    if (!providerVariant || !DSPY_SUPPORTED_PROVIDER_VARIANTS.has(providerVariant)) {
      return {
        selectable: false,
        reason: "DSPy + GEPA exige provider OpenAI, Gemini ou Ollama no flow atual.",
      };
    }
  }

  return { selectable: true, reason: null as string | null };
}

function coerceNodesToRuntime(nodes: PipelineNode[]) {
  const coerced = nodes.map((node) => {
    if (!node.data.optional) {
      return node;
    }

    const availability = getNodeRuntimeAvailability(node.id, nodes);
    if (!availability.selectable && node.data.active) {
      return { ...node, data: { ...node.data, active: false } };
    }
    return node;
  });

  const retrieverNode = coerced.find((node) => node.id === "retriever");
  if (retrieverNode?.data.selectedVariant !== "neo4j") {
    return coerced;
  }

  return coerced.map((node) => {
    if (node.id !== "neo4j" || !node.data.optional || node.data.active) {
      return node;
    }
    return { ...node, data: { ...node.data, active: true } };
  });
}

function RunFlowPanel({
  nodes, onClose,
}: { nodes: PipelineNode[]; onClose: () => void }) {
  const [issueKey,     setIssueKey]     = useState("PAY-0001");
  const [summary,      setSummary]      = useState("");
  const [description,  setDescription]  = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleContent, setArticleContent] = useState("");
  const [articleSource, setArticleSource] = useState("");
  const [articleSearchQuery, setArticleSearchQuery] = useState("");
  const [articleCollection, setArticleCollection] = useState("articles");
  const [articleRetrievalPolicy, setArticleRetrievalPolicy] = useState("auto");
  const [articleTenantId, setArticleTenantId] = useState("");
  const [articleSourceTags, setArticleSourceTags] = useState("");
  const [articleSourceContains, setArticleSourceContains] = useState("");
  const [articleTopK, setArticleTopK] = useState(5);
  const [exactMatchRequired, setExactMatchRequired] = useState(false);
  const [enableCorrectiveRag, setEnableCorrectiveRag] = useState(true);
  const [useSmallModelDistillation, setUseSmallModelDistillation] = useState(true);
  const [desc,         setDesc]         = useState<FlowDescription | null>(null);
  const [descLoading,  setDescLoading]  = useState(false);
  const [descError,    setDescError]    = useState<string | null>(null);
  const [running,      setRunning]      = useState(false);
  const [result,       setResult]       = useState<FlowRunResponse | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const apiBase = getApiBase();
  const payload = buildFlowNodePayload(nodes);
  const inferredFlowMode = inferFlowMode(nodes);
  const flowMode = desc?.flow_mode ?? inferredFlowMode;

  useEffect(() => {
    setDescLoading(true);
    setDescError(null);
    fetch(`${apiBase}/run-flow/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: payload }),
    })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(await r.text());
        }
        return r.json();
      })
      .then((d: unknown) => setDesc(normalizeFlowDescription(d, inferredFlowMode)))
      .catch((e: unknown) => {
        setDesc(null);
        setDescError(e instanceof Error ? e.message : "Falha ao descrever o flow.");
      })
      .finally(() => setDescLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRun = async () => {
    if (flowMode === "issue-validation" && (!issueKey.trim() || !summary.trim())) return;
    if (flowMode === "article-analysis" && (!articleTitle.trim() || !articleContent.trim())) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const body = flowMode === "article-analysis"
        ? {
            nodes: payload,
            article: {
              title: articleTitle.trim(),
              content: articleContent.trim(),
              metadata: articleSource.trim() ? { source: articleSource.trim() } : {},
              collection: articleCollection.trim() || "articles",
              retrieval_policy: articleRetrievalPolicy,
              tenant_id: articleTenantId.trim() || undefined,
              source_tags: articleSourceTags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
              source_contains: articleSourceContains.trim() || undefined,
              exact_match_required: exactMatchRequired,
              enable_corrective_rag: enableCorrectiveRag,
              search_query: articleSearchQuery.trim() || undefined,
              top_k: articleTopK,
              use_small_model_distillation: useSmallModelDistillation,
            },
          }
        : {
            nodes: payload,
            validation: {
              issue: {
                issue_key: issueKey.trim(),
                summary: summary.trim(),
                description: description.trim(),
              },
            },
          };
      const res = await fetch(`${apiBase}/run-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(normalizeFlowRunResponse(await res.json(), flowMode));
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  const classColor  = { bug: "#ef4444", not_bug: "#10b981", needs_review: "#f59e0b" };
  const classLabel  = { bug: "Bug confirmado", not_bug: "Não é bug", needs_review: "Revisão humana" };

  return (
    <div className="pc__modal-overlay" onClick={onClose}>
      <div className="pc__modal pc__modal--run" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="pc__modal-header">
          <h3>▶ Executar pipeline</h3>
          <button className="pc__sb-close" onClick={onClose}>✕</button>
        </div>

        {/* Config preview strip */}
        <div className="pc__run-preview">
          {descLoading && <span className="pc__run-desc-loading">A carregar configuração…</span>}
          {descError && !descLoading && (
            <span className="pc__run-desc-loading">Preview indisponível: {descError}</span>
          )}
          {desc && !descLoading && (
            <>
              <div className="pc__run-desc-chips">
                <span className="pc__run-chip pc__run-chip--provider">
                  {desc.provider} · {desc.llm_model}
                </span>
                {(desc.configured_provider !== desc.provider || desc.configured_llm_model !== desc.llm_model) && (
                  <span className="pc__run-chip pc__run-chip--warn">
                    configurado: {desc.configured_provider} · {desc.configured_llm_model}
                  </span>
                )}
                <span className="pc__run-chip pc__run-chip--muted">
                  modo: {formatModeLabel(desc.flow_mode)}
                </span>
                {desc.monkeyocr && flowMode !== "article-analysis" && <span className="pc__run-chip">MonkeyOCR PDF ✓</span>}
                {desc.retrieval.external && <span className="pc__run-chip">Qdrant</span>}
                {desc.retrieval.graphrag  && <span className="pc__run-chip pc__run-chip--graph">Neo4j GraphRAG</span>}
                {desc.reranker            && <span className="pc__run-chip">Reranker ✓</span>}
                {desc.distiller === "refrag"
                  ? <span className="pc__run-chip pc__run-chip--refrag">⚡ REFRAG</span>
                  : <span className="pc__run-chip pc__run-chip--muted">Distiller: simple</span>}
                {!desc.retrieval.external && <span className="pc__run-chip pc__run-chip--warn">In-memory</span>}
                {desc.confidentiality     && <span className="pc__run-chip pc__run-chip--safe">🔒 Confidencial</span>}
                {desc.ragas_active        && <span className="pc__run-chip">RAGAS ✓</span>}
                {desc.agentic.planner && <span className="pc__run-chip">Planner · {formatModeLabel(desc.planner_mode)}</span>}
                {desc.agentic.query_rewriter && <span className="pc__run-chip">Rewriter · {formatModeLabel(desc.query_rewriter_mode)}</span>}
                {desc.agentic.reflection_memory && <span className="pc__run-chip">Reflection · {formatModeLabel(desc.reflection_mode)}</span>}
                {desc.agentic.policy_loop && <span className="pc__run-chip">Policy loop · {formatModeLabel(desc.policy_mode)}</span>}
                {desc.agentic.temporal_graphrag && <span className="pc__run-chip pc__run-chip--graph">Temporal Graph · {formatModeLabel(desc.temporal_graphrag_mode)}</span>}
                {desc.ignored_nodes.length > 0 && (
                  <span className="pc__run-chip pc__run-chip--muted">
                    ignorados no runtime: {desc.ignored_nodes.join(", ")}
                  </span>
                )}
                <span className="pc__run-chip pc__run-chip--muted">
                  runtime: {desc.supported_runtime_nodes.length} nós ativos
                </span>
              </div>
              {desc.warnings.length > 0 && (
                <div className="pc__rr-section" style={{ marginTop: ".75rem" }}>
                  <div className="pc__rr-label">Avisos do runtime</div>
                  <ul className="pc__rr-list pc__rr-list--warn">
                    {desc.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Body */}
        <div className="pc__modal-body">
          {!result ? (
            <>
              {flowMode === "article-analysis" ? (
                <>
                  <label className="pc__modal-label">Título do artigo *</label>
                  <input
                    className="pc__modal-input"
                    placeholder="Ex: Building a production RAG pipeline"
                    value={articleTitle}
                    onChange={(e) => setArticleTitle(e.target.value)}
                  />
                  <label className="pc__modal-label" style={{ marginTop: ".75rem" }}>Conteúdo *</label>
                  <textarea
                    className="pc__modal-input pc__modal-textarea"
                    rows={7}
                    placeholder="Cole aqui o texto do artigo para resumir e analisar…"
                    value={articleContent}
                    onChange={(e) => setArticleContent(e.target.value)}
                  />
                  <label className="pc__modal-label" style={{ marginTop: ".75rem" }}>Source / metadado</label>
                  <input
                    className="pc__modal-input"
                    placeholder="Ex: medium, internal, arxiv"
                    value={articleSource}
                    onChange={(e) => setArticleSource(e.target.value)}
                  />
                  <label className="pc__modal-label" style={{ marginTop: ".75rem" }}>Query de busca opcional</label>
                  <input
                    className="pc__modal-input"
                    placeholder="Ex: graph rag policy validation"
                    value={articleSearchQuery}
                    onChange={(e) => setArticleSearchQuery(e.target.value)}
                  />
                  <div className="pc__modal-grid" style={{ marginTop: ".85rem" }}>
                    <div>
                      <label className="pc__modal-label">Collection</label>
                      <input
                        className="pc__modal-input"
                        placeholder="Ex: core-rag"
                        value={articleCollection}
                        onChange={(e) => setArticleCollection(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="pc__modal-label">Retrieval policy</label>
                      <select
                        className="pc__modal-input"
                        value={articleRetrievalPolicy}
                        onChange={(e) => setArticleRetrievalPolicy(e.target.value)}
                      >
                        <option value="auto">Auto</option>
                        <option value="vector-global">Vector global</option>
                        <option value="graph-local">Graph local</option>
                        <option value="graph-bridge">Graph bridge</option>
                        <option value="graph-multi-hop">Graph multi-hop</option>
                        <option value="exact-page">Exact page</option>
                        <option value="corrective">Corrective</option>
                      </select>
                    </div>
                  </div>
                  <div className="pc__modal-grid" style={{ marginTop: ".75rem" }}>
                    <div>
                      <label className="pc__modal-label">Tenant ID</label>
                      <input
                        className="pc__modal-input"
                        placeholder="Ex: acme-prod"
                        value={articleTenantId}
                        onChange={(e) => setArticleTenantId(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="pc__modal-label">Top K</label>
                      <input
                        className="pc__modal-input"
                        type="number"
                        min={1}
                        max={12}
                        value={articleTopK}
                        onChange={(e) => setArticleTopK(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                      />
                    </div>
                  </div>
                  <label className="pc__modal-label" style={{ marginTop: ".75rem" }}>Source tags</label>
                  <input
                    className="pc__modal-input"
                    placeholder="Ex: rag,agentic,medium"
                    value={articleSourceTags}
                    onChange={(e) => setArticleSourceTags(e.target.value)}
                  />
                  <label className="pc__modal-label" style={{ marginTop: ".75rem" }}>Source contains</label>
                  <input
                    className="pc__modal-input"
                    placeholder="Ex: medium or graph praxis"
                    value={articleSourceContains}
                    onChange={(e) => setArticleSourceContains(e.target.value)}
                  />
                  <div className="pc__modal-grid pc__modal-grid--checks" style={{ marginTop: ".85rem" }}>
                    <label className="pc__modal-checkbox">
                      <input
                        type="checkbox"
                        checked={exactMatchRequired}
                        onChange={(e) => setExactMatchRequired(e.target.checked)}
                      />
                      <span>Forçar fallback exact/page-level</span>
                    </label>
                    <label className="pc__modal-checkbox">
                      <input
                        type="checkbox"
                        checked={enableCorrectiveRag}
                        onChange={(e) => setEnableCorrectiveRag(e.target.checked)}
                      />
                      <span>Permitir corrective RAG</span>
                    </label>
                  </div>
                  <label className="pc__modal-checkbox" style={{ marginTop: ".85rem" }}>
                    <input
                      type="checkbox"
                      checked={useSmallModelDistillation}
                      onChange={(e) => setUseSmallModelDistillation(e.target.checked)}
                    />
                    <span>Usar contexto grafo-destilado para modelos menores</span>
                  </label>
                </>
              ) : (
                <>
                  <label className="pc__modal-label">Issue Key</label>
                  <input
                    className="pc__modal-input"
                    placeholder="PAY-1421"
                    value={issueKey}
                    onChange={(e) => setIssueKey(e.target.value)}
                  />
                  <label className="pc__modal-label" style={{ marginTop: ".75rem" }}>Sumário *</label>
                  <input
                    className="pc__modal-input"
                    placeholder="Ex: Payment reconciliation mismatch on ledger export"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                  <label className="pc__modal-label" style={{ marginTop: ".75rem" }}>Descrição</label>
                  <textarea
                    className="pc__modal-input pc__modal-textarea"
                    rows={3}
                    placeholder="Contexto adicional, comportamento esperado vs actual…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </>
              )}
              {error && <p className="pc__run-error">{error}</p>}
            </>
          ) : (
            <div className="pc__run-result">
              {result.decision && (
                <>
                  <div
                    className="pc__rr-banner"
                    style={{
                      background: (classColor[result.decision.classification] ?? "#888") + "18",
                      borderColor: classColor[result.decision.classification] ?? "#888",
                    }}
                  >
                    <span className="pc__rr-class" style={{ color: classColor[result.decision.classification] ?? "#888" }}>
                      {classLabel[result.decision.classification] ?? result.decision.classification}
                    </span>
                    <span className="pc__rr-conf">{Math.round(result.decision.confidence * 100)}% confiança</span>
                  </div>
                  <div className="pc__rr-chips">
                    {result.decision.is_complete && <span className="pc__run-chip">Completo ✓</span>}
                    {result.decision.ready_for_dev && <span className="pc__run-chip pc__run-chip--provider">Pronto p/ dev ✓</span>}
                    {result.decision.financial_impact_detected && <span className="pc__run-chip pc__run-chip--warn">⚠ Impacto financeiro</span>}
                    {result.decision.requires_human_review && <span className="pc__run-chip pc__run-chip--warn">👁 Revisão humana</span>}
                    <span className="pc__run-chip">{result.decision.provider} · {result.decision.model}</span>
                  </div>
                  {result.decision.rationale && (
                    <div className="pc__rr-section">
                      <div className="pc__rr-label">Rationale</div>
                      <p className="pc__rr-text">{result.decision.rationale}</p>
                    </div>
                  )}
                  {result.decision.missing_items.length > 0 && (
                    <div className="pc__rr-section">
                      <div className="pc__rr-label">Itens faltando</div>
                      <ul className="pc__rr-list">
                        {result.decision.missing_items.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.decision.contradictions.length > 0 && (
                    <div className="pc__rr-section">
                      <div className="pc__rr-label">Contradições detectadas</div>
                      <ul className="pc__rr-list pc__rr-list--warn">
                        {result.decision.contradictions.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {result.prompt_execution && (
                <>
                  <div className="pc__rr-chips">
                    <span className="pc__run-chip pc__run-chip--provider">
                      {result.prompt_execution.provider} · {result.prompt_execution.model}
                    </span>
                    <span className="pc__run-chip">
                      prompt: {result.prompt_execution.prompt_name}
                    </span>
                    <span className="pc__run-chip pc__run-chip--muted">
                      modo: {result.prompt_execution.mode}
                    </span>
                    <span className="pc__run-chip pc__run-chip--muted">
                      collection: {articleCollection}
                    </span>
                    <span className="pc__run-chip pc__run-chip--muted">
                      policy: {formatModeLabel(articleRetrievalPolicy)}
                    </span>
                    {articleTenantId.trim() && (
                      <span className="pc__run-chip pc__run-chip--muted">
                        tenant: {articleTenantId.trim()}
                      </span>
                    )}
                  </div>
                  <div className="pc__rr-section">
                    <div className="pc__rr-label">Saída do prompt</div>
                    <p className="pc__rr-text">{result.prompt_execution.output_text}</p>
                  </div>
                  {result.article_graph_assessment && (
                    <div className="pc__rr-section">
                      <div className="pc__rr-label">Graph usefulness gate</div>
                      <div className="pc__rr-chips">
                        <span className="pc__run-chip pc__run-chip--graph">
                          {formatModeLabel(result.article_graph_assessment.mode)}
                        </span>
                        <span className="pc__run-chip">
                          score {formatPercent(result.article_graph_assessment.score)}
                        </span>
                        {result.article_graph_assessment.signals.map((signal) => (
                          <span key={signal} className="pc__run-chip pc__run-chip--muted">
                            {signal}
                          </span>
                        ))}
                      </div>
                      {result.article_graph_assessment.rationale && (
                        <p className="pc__rr-text">{result.article_graph_assessment.rationale}</p>
                      )}
                    </div>
                  )}
                  {result.article_distillation && (
                    <div className="pc__rr-section">
                      <div className="pc__rr-label">Small-model distillation</div>
                      <div className="pc__rr-chips">
                        <span className="pc__run-chip pc__run-chip--provider">
                          {result.article_distillation.mode}
                        </span>
                        {result.article_distillation.key_entities.map((entity) => (
                          <span key={entity} className="pc__run-chip">{entity}</span>
                        ))}
                        {result.article_distillation.key_topics.map((topic) => (
                          <span key={topic} className="pc__run-chip pc__run-chip--muted">{topic}</span>
                        ))}
                      </div>
                      <pre className="pc__rr-pre">{result.article_distillation.context_text}</pre>
                      {result.article_distillation.evidence_paths.length > 0 && (
                        <ul className="pc__rr-list pc__rr-list--compact">
                          {result.article_distillation.evidence_paths.map((path) => (
                            <li key={path.path_id}>
                              {path.summary || `${path.relation}: ${path.nodes.join(" -> ")}`} ({formatPercent(path.score)})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {result.article_benchmark && (
                    <div className="pc__rr-section">
                      <div className="pc__rr-label">Graph benchmark</div>
                      <div className="pc__rr-chips">
                        <span className="pc__run-chip pc__run-chip--graph">
                          recomendado: {formatModeLabel(result.article_benchmark.recommended_mode)}
                        </span>
                        {result.article_benchmark.query && (
                          <span className="pc__run-chip pc__run-chip--muted">
                            query: {result.article_benchmark.query}
                          </span>
                        )}
                      </div>
                      <div className="pc__rr-stack">
                        {result.article_benchmark.scenarios.map((scenario) => (
                          <article key={`${scenario.mode}-${scenario.retrieval_mode}`} className="pc__rr-card">
                            <div className="pc__rr-item-head">
                              <strong>{formatModeLabel(scenario.mode)}</strong>
                              <span>{formatLatency(scenario.latency_ms)} · {scenario.result_count} hits</span>
                            </div>
                            <div className="pc__rr-chips">
                              <span className="pc__run-chip">{formatModeLabel(scenario.retrieval_mode)}</span>
                              {scenario.top_titles.slice(0, 3).map((title) => (
                                <span key={title} className="pc__run-chip pc__run-chip--muted">{title}</span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.article_search.length > 0 && (
                    <div className="pc__rr-section">
                      <div className="pc__rr-label">Contexto recuperado de artigos</div>
                      <div className="pc__rr-stack">
                        {result.article_search.map((item) => (
                          <article key={item.chunk_id} className="pc__rr-card">
                            <div className="pc__rr-item-head">
                              <strong>{item.title} #{item.chunk_index}</strong>
                              <span>{formatPercent(item.score)}</span>
                            </div>
                            <p className="pc__rr-text">{item.content.slice(0, 240)}</p>
                            <div className="pc__rr-chips">
                              {item.retrieval_mode && (
                                <span className="pc__run-chip pc__run-chip--graph">
                                  {formatModeLabel(item.retrieval_mode)}
                                </span>
                              )}
                              {item.topics.map((topic) => (
                                <span key={`${item.chunk_id}-${topic}`} className="pc__run-chip pc__run-chip--muted">
                                  {topic}
                                </span>
                              ))}
                              {(item.entities ?? []).map((entity) => (
                                <span key={`${item.chunk_id}-${entity}`} className="pc__run-chip">
                                  {entity}
                                </span>
                              ))}
                            </div>
                            {(item.evidence_paths?.length ?? 0) > 0 && (
                              <ul className="pc__rr-list pc__rr-list--compact">
                                {item.evidence_paths?.map((path) => (
                                  <li key={path.path_id}>
                                    {path.summary || `${path.relation}: ${path.nodes.join(" -> ")}`}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {result.dspy_optimization && (
                <div className="pc__rr-section">
                  <div className="pc__rr-label">DSPy</div>
                  <div className="pc__rr-chips">
                    <span className="pc__run-chip pc__run-chip--provider">
                      {result.dspy_optimization.optimizer ?? "gepa"}
                    </span>
                    {result.dspy_optimization.provider && (
                      <span className="pc__run-chip">
                        {result.dspy_optimization.provider}
                      </span>
                    )}
                    <span className={`pc__run-chip ${result.dspy_optimization.triggered ? "" : "pc__run-chip--muted"}`}>
                      {result.dspy_optimization.triggered ? "Executado" : "Skip"}
                    </span>
                    {typeof result.dspy_optimization.dev_score === "number" && (
                      <span className="pc__run-chip">
                        dev score {Math.round(result.dspy_optimization.dev_score * 100)}%
                      </span>
                    )}
                  </div>
                  {result.dspy_optimization.skipped_reason && (
                    <p className="pc__rr-text">{result.dspy_optimization.skipped_reason}</p>
                  )}
                  {result.dspy_optimization.exported_files.length > 0 && (
                    <>
                      <div className="pc__rr-label" style={{ marginTop: ".5rem" }}>Prompts exportados</div>
                      <ul className="pc__rr-list">
                        {result.dspy_optimization.exported_files.map((path) => <li key={path}>{path}</li>)}
                      </ul>
                    </>
                  )}
                  {result.dspy_optimization.history_file && (
                    <>
                      <div className="pc__rr-label" style={{ marginTop: ".5rem" }}>Histórico</div>
                      <p className="pc__rr-text">{result.dspy_optimization.history_file}</p>
                    </>
                  )}
                </div>
              )}
              {result.warnings.length > 0 && (
                <div className="pc__rr-section">
                  <div className="pc__rr-label">Warnings</div>
                  <ul className="pc__rr-list pc__rr-list--warn">
                    {result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pc__modal-footer">
          {result ? (
            <>
              <button className="btn-sm" onClick={() => { setResult(null); setError(null); }}>← Novo run</button>
              <button className="btn-sm" onClick={onClose}>Fechar</button>
            </>
          ) : (
            <>
              <button className="btn-sm" onClick={onClose}>Cancelar</button>
              <button
                className="btn-sm btn-sm--run"
                disabled={
                  (flowMode === "issue-validation" && (!issueKey.trim() || !summary.trim()))
                  || (flowMode === "article-analysis" && (!articleTitle.trim() || !articleContent.trim()))
                  || running
                }
                onClick={handleRun}
              >
                {running ? "Executando…" : "▶ Executar"}
              </button>
            </>
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
  const [showRun,    setShowRun]    = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [flows, setFlows] = useState<SavedFlow[]>(initialFlows);
  const [activeFlow, setActiveFlow] = useState<ActiveFlowRef>(null);
  const draftHydratedRef = useRef(false);

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
      coerceNodesToRuntime(
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      ),
    );
  }, [setNodes]);

  useEffect(() => {
    setNodes((nds) => {
      const next = coerceNodesToRuntime(nds);
      const changed = next.some((node, index) => (
        node.data.active !== nds[index]?.data.active
      ));
      return changed ? next : nds;
    });
  }, [nodes, setNodes]);

  useEffect(() => {
    if (draftHydratedRef.current) {
      return;
    }
    draftHydratedRef.current = true;

    try {
      const raw = window.localStorage.getItem(FLOW_DRAFT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        nodes?: SavedFlow["nodes"];
        edges?: SavedFlow["edges"];
        activeFlow?: ActiveFlowRef;
      };
      if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
        setNodes(buildDefaultNodes(parsed.nodes));
      }
      if (Array.isArray(parsed.edges) && parsed.edges.length > 0) {
        setEdges(parsed.edges.map((edge) => ({ ...edge, style: eStyle, markerEnd: mk })));
      }
      if (parsed.activeFlow?.id && parsed.activeFlow?.name) {
        setActiveFlow(parsed.activeFlow);
      } else if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        const inferredFlow = findMatchingSavedFlow(initialFlows, parsed.nodes, parsed.edges);
        if (inferredFlow) {
          setActiveFlow(inferredFlow);
        }
      }
    } catch {
      window.localStorage.removeItem(FLOW_DRAFT_STORAGE_KEY);
    }
  }, [initialFlows, setEdges, setNodes]);

  useEffect(() => {
    if (activeFlow || flows.length === 0) {
      return;
    }
    const currentState = serializeCanvasState(nodes, edges);
    const inferredFlow = findMatchingSavedFlow(flows, currentState.nodes, currentState.edges);
    if (inferredFlow) {
      setActiveFlow(inferredFlow);
    }
  }, [activeFlow, edges, flows, nodes]);

  useEffect(() => {
    if (!draftHydratedRef.current) {
      return;
    }
    try {
      window.localStorage.setItem(
        FLOW_DRAFT_STORAGE_KEY,
        JSON.stringify({
          ...serializeCanvasState(nodes, edges),
          activeFlow,
        }),
      );
    } catch {
      // Ignore storage failures; the flow still remains manually savable.
    }
  }, [activeFlow, edges, nodes]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const handleSave = async (name: string) => {
    setSaveStatus("saving");
    const payload = serializeCanvasState(nodes, edges);
    const result = await saveFlowAction(name, payload.nodes, payload.edges);
    if (result.ok) {
      setSaveStatus("saved");
      const savedFlow = { id: result.id, name, createdAt: new Date().toISOString(), nodes: payload.nodes, edges: payload.edges };
      setActiveFlow({ id: result.id, name });
      setFlows((prev) => [savedFlow, ...prev]);
      setTimeout(() => { setSaveStatus("idle"); setShowSave(false); }, 1500);
    } else {
      setSaveStatus("error");
    }
  };

  const handleUpdateSavedFlow = async () => {
    if (!activeFlow) {
      return;
    }
    setSaveStatus("saving");
    const payload = serializeCanvasState(nodes, edges);
    const result = await updateFlowAction(activeFlow.id, activeFlow.name, payload.nodes, payload.edges);
    if (result.ok) {
      setSaveStatus("saved");
      setFlows((prev) =>
        prev.map((flow) =>
          flow.id === activeFlow.id
            ? { ...flow, name: activeFlow.name, nodes: payload.nodes, edges: payload.edges }
            : flow,
        ),
      );
      setTimeout(() => { setSaveStatus("idle"); }, 1200);
    } else {
      setSaveStatus("error");
    }
  };

  const handleLoad = (flow: SavedFlow) => {
    setNodes(buildDefaultNodes(flow.nodes));
    setEdges(
      flow.edges.map((e) => ({ ...e, style: eStyle, markerEnd: mk })),
    );
    setActiveFlow({ id: flow.id, name: flow.name });
    setSelectedNodeId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteFlowAction(id);
    setFlows((prev) => prev.filter((f) => f.id !== id));
    if (activeFlow?.id === id) {
      setActiveFlow(null);
    }
  };

  const handleReset = () => {
    setNodes(buildDefaultNodes());
    setEdges(DEFAULT_EDGES);
    setActiveFlow(null);
    setSelectedNodeId(null);
    window.localStorage.removeItem(FLOW_DRAFT_STORAGE_KEY);
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
            <button
              className="btn-sm btn-sm--primary"
              onClick={() => {
                if (activeFlow) {
                  void handleUpdateSavedFlow();
                  return;
                }
                setSaveStatus("idle");
                setShowSave(true);
              }}
              title={activeFlow ? `Atualizar "${activeFlow.name}"` : "Salvar novo flow"}
            >
              💾 {activeFlow ? "Atualizar flow" : "Salvar flow"}
            </button>
            <button className="btn-sm btn-sm--run" onClick={() => setShowRun(true)}>
              ▶ Run flow
            </button>
            <button className="btn-sm" onClick={handleReset} title="Resetar para o layout padrão">
              ↺ Resetar
            </button>
          </Panel>

          {/* Legend */}
          <Panel position="bottom-left" className="pc__legend">
            {activeFlow && (
              <div className="pc__legend-item pc__legend-item--hint">
                <span className="pc__legend-label">Editando: <strong>{activeFlow.name}</strong></span>
              </div>
            )}
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
          nodes={nodes}
          onClose={() => setSelectedNodeId(null)}
          onUpdate={handleUpdateNodeData}
        />
      )}

      {/* Run modal */}
      {showRun && (
        <RunFlowPanel
          nodes={nodes}
          onClose={() => setShowRun(false)}
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
