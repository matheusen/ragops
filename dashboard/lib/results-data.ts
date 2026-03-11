import { promises as fs } from "fs";
import path from "path";

export type ResultDataSource = "local" | "mock";

export interface AuditSummary {
  id: string;
  issue_key: string;
  timestamp: string;
  summary: string;
  kind: "issue-validation" | "article-analysis";
  classification: "bug" | "not_bug" | "needs_review" | string;
  is_bug: boolean;
  is_complete: boolean;
  ready_for_dev: boolean;
  confidence: number;
  provider: string;
  requires_human_review: boolean;
  financial_impact_detected: boolean;
  generated_at: string;
  data_source: ResultDataSource;
}

export interface ResultKnowledgeTopic {
  id: string;
  label: string;
  strength: number;
  notes: string;
}

export interface ResultKnowledgeDocument {
  id: string;
  title: string;
  kind: "artifact" | "issue" | "article" | "runbook";
  summary: string;
  linked_topic_ids: string[];
  evidence_refs: string[];
}

export interface ResultArticleCard {
  id: string;
  title: string;
  theme: string;
  summary: string;
  source_path: string;
  source_name: string;
  confidence: number;
  secondary_themes: string[];
  linked_topic_ids: string[];
}

export interface ResultThemeCluster {
  id: string;
  label: string;
  count: number;
  summary: string;
}

export interface ResultRelatedAuditCard {
  id: string;
  issue_key: string;
  summary: string;
  classification: "bug" | "not_bug" | "needs_review" | string;
  confidence: number;
  provider: string;
  generated_at: string;
  relation_score: number;
  relation_kind: "duplicate_signal" | "same-context" | "semantic-neighbor";
  reasons: string[];
  shared_topics: string[];
}

export interface ResultArticleContextHit {
  id: string;
  title: string;
  excerpt: string;
  score: number;
  topics: string[];
  entities: string[];
  retrieval_mode: string;
  evidence_paths: ResultArticleEvidencePath[];
  source_name: string;
}

export interface ResultGraphAssessment {
  mode: string;
  score: number;
  rationale: string;
  signals: string[];
}

export interface ResultArticleEvidencePath {
  path_id: string;
  relation: string;
  nodes: string[];
  score: number;
  summary: string;
}

export interface ResultArticleDistillation {
  mode: string;
  context_text: string;
  key_entities: string[];
  key_topics: string[];
  evidence_paths: ResultArticleEvidencePath[];
}

export interface ResultExtractionAttempt {
  engine: string;
  success: boolean;
  output_dir: string;
  files: string[];
}

export interface ResultExtractionReport {
  source_path: string;
  file_name: string;
  file_type: string;
  selected_engine: string;
  used_monkeyocr: boolean;
  output_dir: string;
  files: string[];
  attempts: ResultExtractionAttempt[];
}

export interface ResultArticleBenchmarkScenario {
  mode: string;
  retrieval_mode: string;
  latency_ms: number;
  result_count: number;
  top_doc_ids: string[];
  top_titles: string[];
}

export interface ResultArticleBenchmark {
  query: string;
  recommended_mode: string;
  graph_usefulness: ResultGraphAssessment | null;
  scenarios: ResultArticleBenchmarkScenario[];
}

export interface ResultArticleAnalysisView {
  title: string;
  source: string;
  prompt_name: string;
  provider: string;
  model: string;
  metadata: Record<string, unknown>;
  search_query: string;
  content_excerpt: string;
  executive_summary: string;
  central_ideas: string[];
  risks: string[];
  next_steps: string[];
  raw_output: string;
  warnings: string[];
  retrieved_contexts: ResultArticleContextHit[];
  related_articles: Array<Record<string, unknown>>;
  graph_assessment: ResultGraphAssessment | null;
  distillation: ResultArticleDistillation | null;
  benchmark: ResultArticleBenchmark | null;
  extraction_reports: ResultExtractionReport[];
}

export interface ResultTechniqueItem {
  id: string;
  label: string;
  value?: string;
  detail?: string;
}

export interface ResultRuntimeView {
  flow_mode: string;
  execution_path: string;
  provider: string;
  model: string;
  prompt_name: string;
  query_text: string;
  search_hits: number;
  summary: string;
  techniques: ResultTechniqueItem[];
  warnings: string[];
  supported_runtime_nodes: string[];
  ignored_nodes: string[];
  trace_nodes: string[];
}

export interface ResultKnowledgeMap {
  summary: string;
  topics: ResultKnowledgeTopic[];
  documents: ResultKnowledgeDocument[];
  article_cards: ResultArticleCard[];
  theme_clusters: ResultThemeCluster[];
  related_audits: ResultRelatedAuditCard[];
}

export interface ResultAudit {
  result_kind: "issue-validation" | "article-analysis";
  issue: {
    issue_key: string;
    summary: string;
    description: string;
    priority: string | null;
    issue_type: string;
    status: string | null;
    project?: string | null;
    component?: string | null;
    service?: string | null;
    environment?: string | null;
    labels?: string[];
    expected_behavior?: string;
    actual_behavior?: string;
  };
  attachment_facts?: {
    artifacts?: Array<{
      artifact_id: string;
      artifact_type: string;
      source_path: string;
      extracted_text: string;
      facts: Record<string, unknown>;
      confidence: number;
    }>;
    contradictions?: string[];
  };
  rule_evaluation?: {
    missing_items?: string[];
    contradictions?: string[];
    results?: Array<{ rule_name: string; severity: string; message: string }>;
  };
  retrieved?: Array<{
    evidence_id: string;
    source: string;
    content: string;
    metadata: { category: string; type?: string };
    final_score: number;
  }>;
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
  prompt_execution?: {
    prompt_name: string;
    mode: "decision" | "text";
    provider: string;
    model: string;
    output_text: string;
  };
  runtime?: Record<string, unknown>;
  runtime_view?: ResultRuntimeView | null;
  article_run?: ResultArticleAnalysisView | null;
  result_meta: {
    id: string;
    timestamp: string;
    data_source: ResultDataSource;
  };
  knowledge_map: ResultKnowledgeMap;
}

const REPO_ROOT = path.resolve(process.cwd(), "..");
const AUDIT_DIR = path.join(REPO_ROOT, "data", "audit");

type RawAudit = {
  issue: ResultAudit["issue"];
  attachment_facts?: ResultAudit["attachment_facts"];
  rule_evaluation?: ResultAudit["rule_evaluation"];
  retrieved?: Array<{
    evidence_id?: string;
    source?: string;
    title?: string;
    chunk_id?: string;
    source_path?: string;
    content?: string;
    topics?: string[];
    entities?: string[];
    retrieval_mode?: string;
    evidence_paths?: unknown[];
    metadata?: { category?: string; type?: string; retrieval_mode?: string; topics?: string[]; entities?: string[]; evidence_paths?: unknown[] };
    final_score?: number;
    score?: number;
  }>;
  decision?: ResultAudit["decision"];
  prompt_execution?: ResultAudit["prompt_execution"];
  article_run?: {
    title?: string;
    source?: string;
    prompt_name?: string;
    search_query?: string;
    metadata?: Record<string, unknown>;
    content_excerpt?: string;
    output_text?: string;
    warnings?: string[];
    related_articles?: Array<Record<string, unknown>>;
    graph_assessment?: Record<string, unknown> | null;
    distillation?: Record<string, unknown> | null;
    benchmark?: Record<string, unknown> | null;
    extraction_reports?: unknown[];
  } | null;
  runtime?: Record<string, unknown>;
  run_kind?: string;
};
type AuditSeed = { issueKey: string; timestamp: string; payload: RawAudit };

type TopicDefinition = {
  id: string;
  label: string;
  tokens: string[];
  notes: string;
};

const ISSUE_TOPIC_LIBRARY: TopicDefinition[] = [
  {
    id: "payments",
    label: "Payments",
    tokens: ["payment", "pix", "charge", "ledger", "captured", "authorization", "checkout"],
    notes: "Fluxos financeiros e comportamento da autorização/captura.",
  },
  {
    id: "ux-validation",
    label: "UX Validation",
    tokens: ["warning", "ui", "form", "client-side", "validation", "field", "banner"],
    notes: "Mensagens ao usuário, validação no cliente e estados do formulário.",
  },
  {
    id: "observability",
    label: "Observability",
    tokens: ["trace", "request", "log", "observability", "timestamp", "error", "exception"],
    notes: "Sinais de logs, traces e correlação operacional.",
  },
  {
    id: "readiness",
    label: "Readiness",
    tokens: ["reproduction", "expected", "actual", "ready", "missing", "environment"],
    notes: "Campos obrigatórios e prontidão para desenvolvimento.",
  },
  {
    id: "risk-review",
    label: "Risk Review",
    tokens: ["review", "human", "financial", "mismatch", "contradiction", "failed", "success"],
    notes: "Sinais de risco, revisão humana e conflitos entre fontes.",
  },
];

const ARTICLE_TOPIC_LIBRARY: TopicDefinition[] = [
  {
    id: "Advanced RAG",
    label: "Advanced RAG",
    tokens: ["rag", "retrieval", "rerank", "re-rank", "chunk", "chunks", "hybrid", "corrective", "adaptive", "embedding", "embeddings", "graphrag"],
    notes: "Arquiteturas RAG avançadas, retrieval híbrido, re-ranking e chunking.",
  },
  {
    id: "Agents & MCP",
    label: "Agents & MCP",
    tokens: ["agent", "agents", "agentic", "agente", "agentes", "mcp", "tool", "tools", "langgraph", "planner", "workflow", "routing"],
    notes: "Agentes, uso de ferramentas, MCP e orquestração de fluxos complexos.",
  },
  {
    id: "Evaluation & Observability",
    label: "Evaluation & Observability",
    tokens: ["evaluation", "evaluacao", "evaluate", "observability", "observabilidade", "langsmith", "trace", "traces", "metrics", "faithfulness", "precision", "recall"],
    notes: "Avaliação contínua, tracing, métricas e observabilidade de sistemas LLM.",
  },
  {
    id: "Local Inference & Cost",
    label: "Local Inference & Cost",
    tokens: ["ollama", "ollm", "local", "gpu", "quantization", "quantizacao", "cache", "cost", "custo", "latency", "inferencia", "llama.cpp"],
    notes: "Execução local, otimização de custo, quantização, caching e hardware.",
  },
  {
    id: "Document Intelligence",
    label: "Document Intelligence",
    tokens: ["ocr", "pdf", "document", "documents", "docling", "monkeyocr", "multimodal", "table", "tables", "figure"],
    notes: "Extração documental, OCR, PDFs complexos e pipelines multimodais.",
  },
  {
    id: "LLMOps & Production",
    label: "LLMOps & Production",
    tokens: ["llmops", "production", "producao", "deploy", "deployment", "docker", "aws", "runtime", "monitoring", "pipeline", "service"],
    notes: "Operação em produção, deploy, runtime e infraestrutura de aplicações de IA.",
  },
];

const ALL_TOPIC_LIBRARY = [...ISSUE_TOPIC_LIBRARY, ...ARTICLE_TOPIC_LIBRARY];
const GENERIC_RELATION_LABELS = new Set(["article-analysis", "issue-validation"]);

const MOCK_AUDITS: ResultAudit[] = buildMockAudits();

export async function getResultsList(): Promise<AuditSummary[]> {
  const audits = await loadAudits();
  return audits.map(toSummary);
}

export async function getResultById(id: string): Promise<ResultAudit | null> {
  const audits = await loadAudits();
  return audits.find((audit) => audit.result_meta.id === id) ?? null;
}

async function loadAudits(): Promise<ResultAudit[]> {
  const localAudits = await loadLocalAudits();
  if (localAudits.length > 0) {
    return localAudits;
  }
  return MOCK_AUDITS;
}

async function loadLocalAudits(): Promise<ResultAudit[]> {
  const issueDirs = await safeReadDir(AUDIT_DIR);
  const rawAudits: Array<{ issueKey: string; timestamp: string; payload: RawAudit }> = [];

  for (const issueDir of issueDirs) {
    const issuePath = path.join(AUDIT_DIR, issueDir);
    const stat = await safeStat(issuePath);
    if (!stat?.isDirectory()) continue;

    const files = (await safeReadDir(issuePath)).filter((file) => file.endsWith(".json"));
    for (const fileName of files) {
      const filePath = path.join(issuePath, fileName);
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        rawAudits.push({
          issueKey: issueDir,
          timestamp: fileName.replace(/\.json$/, ""),
          payload: JSON.parse(raw) as RawAudit,
        });
      } catch {
        continue;
      }
    }
  }

  if (rawAudits.length === 0) return [];

  return rawAudits
    .map(({ issueKey, timestamp, payload }, _index, all) =>
      enrichAudit(
        payload,
        issueKey,
        timestamp,
        "local",
        all,
      ),
    )
    .sort((left, right) => right.result_meta.timestamp.localeCompare(left.result_meta.timestamp));
}

function toSummary(audit: ResultAudit): AuditSummary {
  const decision = audit.decision;
  return {
    id: audit.result_meta.id,
    issue_key: audit.issue.issue_key,
    timestamp: audit.result_meta.timestamp,
    summary: audit.article_run?.title ?? audit.issue.summary,
    kind: audit.result_kind,
    classification: audit.result_kind === "article-analysis"
      ? "article_analysis"
      : (decision?.classification ?? "needs_review"),
    is_bug: Boolean(decision?.is_bug),
    is_complete: audit.result_kind === "article-analysis" ? true : Boolean(decision?.is_complete),
    ready_for_dev: audit.result_kind === "article-analysis" ? true : Boolean(decision?.ready_for_dev),
    confidence: Number(decision?.confidence ?? (audit.result_kind === "article-analysis" ? 1 : 0)),
    provider: audit.prompt_execution?.provider ?? decision?.provider ?? "mock",
    requires_human_review: Boolean(decision?.requires_human_review),
    financial_impact_detected: Boolean(decision?.financial_impact_detected),
    generated_at: audit.result_meta.timestamp,
    data_source: audit.result_meta.data_source,
  };
}

function enrichAudit(
  payload: RawAudit,
  issueKey: string,
  timestamp: string,
  dataSource: ResultDataSource,
  peerAudits: AuditSeed[],
): ResultAudit {
  const resultKind = payload.run_kind === "article-analysis" || payload.article_run
    ? "article-analysis"
    : "issue-validation";
  return {
    ...payload,
    retrieved: normalizeRetrieved(payload.retrieved),
    result_kind: resultKind,
    runtime: payload.runtime,
    runtime_view: buildRuntimeView(payload),
    article_run: buildArticleAnalysisView(payload),
    result_meta: {
      id: `${issueKey}__${timestamp}`,
      timestamp,
      data_source: dataSource,
    },
    knowledge_map: buildKnowledgeMap(payload, issueKey, timestamp, peerAudits),
  };
}

function buildKnowledgeMap(
  audit: RawAudit,
  issueKey: string,
  timestamp: string,
  peerAudits: AuditSeed[],
): ResultKnowledgeMap {
  const topics = rankTopicsForAudit(audit);
  const topicLibrary = getTopicLibrary(audit);

  const articleArtifacts = buildKnowledgeArtifacts(audit);
  const articleCards = articleArtifacts.map((artifact, index) =>
    buildArticleCard(artifact, index, topics),
  );

  const themeClusters = buildThemeClusters(articleCards);
  const relatedAudits = buildRelatedAuditCards(audit, issueKey, timestamp, topics, peerAudits);

  const artifactDocuments: ResultKnowledgeDocument[] = articleArtifacts.slice(0, 4).map((artifact) => {
    const title = path.basename(artifact.source_path);
    return {
      id: `artifact:${artifact.artifact_id}`,
      title,
      kind: "artifact",
      summary: summarizeText(artifact.extracted_text, 140) || `Artifact ${artifact.artifact_type}`,
      linked_topic_ids: topics
        .filter((topic) => matchesTopic(`${title} ${artifact.extracted_text}`.toLowerCase(), topic.id, topicLibrary))
        .map((topic) => topic.id),
      evidence_refs: [artifact.artifact_id, artifact.source_path],
    };
  });

  const peerDocuments: ResultKnowledgeDocument[] = relatedAudits.slice(0, 4).map((peer) => ({
    id: `issue:${peer.issue_key}:${peer.generated_at}`,
    title: peer.issue_key,
    kind: "issue" as const,
    summary: peer.summary,
    linked_topic_ids: peer.shared_topics,
    evidence_refs: [peer.id, ...peer.reasons],
  }));

  const curatedDocuments: ResultKnowledgeDocument[] = [
    {
      id: "article:payments-reconciliation",
      title: "Payments reconciliation note",
      kind: "article",
      summary: "Resumo mock com padrões de divergência entre UI, ledger e captura.",
      linked_topic_ids: topics.filter((topic) => topic.id !== "ux-validation").map((topic) => topic.id),
      evidence_refs: ["mock:payments-reconciliation"],
    },
    {
      id: "runbook:incident-triage",
      title: "Incident triage runbook",
      kind: "runbook",
      summary: "Checklist operacional para decidir se o caso precisa de revisão humana.",
      linked_topic_ids: topics.map((topic) => topic.id).slice(0, 2),
      evidence_refs: ["mock:incident-triage"],
    },
  ];

  const documents = [...artifactDocuments, ...peerDocuments];
  if (documents.length < 3) {
    documents.push(...curatedDocuments.slice(0, 3 - documents.length));
  }

  return {
    summary: buildKnowledgeSummary(audit, topics, documents, articleCards, themeClusters),
    topics,
    documents: documents.slice(0, 6),
    article_cards: articleCards,
    theme_clusters: themeClusters,
    related_audits: relatedAudits,
  };
}

function buildTopicTextCorpus(audit: RawAudit): string {
  return [
    audit.issue.summary,
    audit.issue.description,
    audit.issue.expected_behavior,
    audit.issue.actual_behavior,
    audit.issue.component,
    audit.issue.service,
    audit.issue.environment,
    ...(audit.issue.labels ?? []),
    ...(audit.attachment_facts?.artifacts?.map((artifact) => artifact.extracted_text) ?? []),
    ...(audit.retrieved?.map((item) => item.content) ?? []),
    ...(audit.rule_evaluation?.contradictions ?? []),
    ...(audit.decision?.contradictions ?? []),
    audit.prompt_execution?.output_text,
    audit.article_run?.search_query,
    audit.article_run?.content_excerpt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function rankTopicsForAudit(audit: RawAudit): ResultKnowledgeTopic[] {
  const topicLibrary = getTopicLibrary(audit);
  const textCorpus = buildTopicTextCorpus(audit);
  const rankedTopics = topicLibrary.map((topic) => {
    const hits = topic.tokens.reduce((count, token) => {
      return count + (textCorpus.includes(token) ? 1 : 0);
    }, 0);
    return {
      id: topic.id,
      label: topic.label,
      strength: hits / topic.tokens.length,
      notes: topic.notes,
    };
  })
    .filter((topic) => topic.strength > 0)
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 4);

  return rankedTopics.length > 0
    ? rankedTopics
    : (audit.run_kind === "article-analysis" || audit.article_run
      ? [
          {
            id: "Article Corpus",
            label: "Article Corpus",
            strength: 0.55,
            notes: "Fallback para corpus de artigos quando a auditoria não contém sinais fortes o suficiente.",
          },
        ]
      : [
          {
            id: "triage",
            label: "Triage",
            strength: 0.55,
            notes: "Fallback de triagem quando a auditoria não contém sinais fortes o suficiente.",
          },
        ]);
}

function buildRelatedAuditCards(
  audit: RawAudit,
  issueKey: string,
  timestamp: string,
  topics: ResultKnowledgeTopic[],
  peerAudits: AuditSeed[],
): ResultRelatedAuditCard[] {
  const currentContext = buildCorrelationContext(audit, issueKey, timestamp, topics);
  const ranked = peerAudits
    .filter((peer) => !(peer.issueKey === issueKey && peer.timestamp === timestamp))
    .map((peer) => {
      const peerTopics = rankTopicsForAudit(peer.payload);
      const peerContext = buildCorrelationContext(peer.payload, peer.issueKey, peer.timestamp, peerTopics);
      const correlation = correlateAuditContexts(currentContext, peerContext);
      return correlation
        ? {
            id: `${peer.issueKey}__${peer.timestamp}`,
            issue_key: peer.issueKey,
            summary: peer.payload.issue.summary,
            classification: peer.payload.decision?.classification ?? "needs_review",
            confidence: Number(peer.payload.decision?.confidence ?? 0),
            provider: peer.payload.decision?.provider ?? "mock",
            generated_at: peer.timestamp,
            relation_score: correlation.score,
            relation_kind: correlation.kind,
            reasons: correlation.reasons,
            shared_topics: correlation.sharedTopics,
          }
        : null;
    })
    .filter((item): item is ResultRelatedAuditCard => item !== null)
    .sort((left, right) => {
      if (right.relation_score !== left.relation_score) {
        return right.relation_score - left.relation_score;
      }
      return right.generated_at.localeCompare(left.generated_at);
    });

  const deduped = new Map<string, ResultRelatedAuditCard>();
  ranked.forEach((item) => {
    if (!deduped.has(item.issue_key)) {
      deduped.set(item.issue_key, item);
    }
  });

  return [...deduped.values()].slice(0, 6);
}

function buildCorrelationContext(
  audit: RawAudit,
  issueKey: string,
  timestamp: string,
  topics: ResultKnowledgeTopic[],
) {
  const component = normalizeToken(audit.issue.component);
  const service = normalizeToken(audit.issue.service);
  const environment = normalizeToken(audit.issue.environment);
  const labels = new Set(
    (audit.issue.labels ?? [])
      .map(normalizeToken)
      .filter((label) => label && !GENERIC_RELATION_LABELS.has(label)),
  );
  const topicsSet = new Set(topics.map((topic) => topic.id));
  const contradictionText = [
    ...(audit.rule_evaluation?.contradictions ?? []),
    ...(audit.attachment_facts?.contradictions ?? []),
    ...(audit.decision?.contradictions ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const extracted = [
    audit.issue.summary,
    audit.issue.description,
    ...(audit.attachment_facts?.artifacts?.map((artifact) => artifact.extracted_text) ?? []),
    ...(audit.retrieved?.map((item) => item.content) ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const signalTokens = new Set(
    tokenizeForCorrelation([
      audit.issue.summary,
      audit.issue.description,
      audit.issue.expected_behavior,
      audit.issue.actual_behavior,
      contradictionText,
      extracted,
    ].join(" "))
  );

  return {
    id: `${issueKey}__${timestamp}`,
    issueKey,
    component,
    service,
    environment,
    labels,
    topics: topicsSet,
    signalTokens,
    contradictionText,
    classification: audit.decision?.classification ?? "needs_review",
    hasHumanReview: Boolean(audit.decision?.requires_human_review),
    hasFinancialImpact: Boolean(audit.decision?.financial_impact_detected),
  };
}

function correlateAuditContexts(
  current: ReturnType<typeof buildCorrelationContext>,
  peer: ReturnType<typeof buildCorrelationContext>,
): { score: number; reasons: string[]; sharedTopics: string[]; kind: ResultRelatedAuditCard["relation_kind"] } | null {
  const reasons: string[] = [];
  let score = 0;

  if (current.component && current.component === peer.component) {
    score += 0.26;
    reasons.push(`Mesmo componente: ${current.component}`);
  }
  if (current.service && current.service === peer.service) {
    score += 0.24;
    reasons.push(`Mesmo serviço: ${current.service}`);
  }
  if (current.environment && current.environment === peer.environment) {
    score += 0.08;
    reasons.push(`Mesmo ambiente: ${current.environment}`);
  }

  const sharedLabels = intersectSets(current.labels, peer.labels);
  if (sharedLabels.length > 0) {
    score += Math.min(0.18, sharedLabels.length * 0.06);
    reasons.push(`Labels em comum: ${sharedLabels.slice(0, 3).join(", ")}`);
  }

  const sharedTopics = intersectSets(current.topics, peer.topics);
  if (sharedTopics.length > 0) {
    score += Math.min(0.24, sharedTopics.length * 0.08);
    reasons.push(`Tópicos em comum: ${sharedTopics.slice(0, 3).join(", ")}`);
  }

  const sharedTokens = intersectSets(current.signalTokens, peer.signalTokens);
  if (sharedTokens.length >= 3) {
    score += Math.min(0.22, sharedTokens.length * 0.015);
    reasons.push(`Vocabulário técnico próximo: ${sharedTokens.slice(0, 4).join(", ")}`);
  }

  if (current.classification === peer.classification) {
    score += 0.05;
  }
  if (current.hasHumanReview && peer.hasHumanReview) {
    score += 0.07;
    reasons.push("Ambas pedem revisão humana");
  }
  if (current.hasFinancialImpact && peer.hasFinancialImpact) {
    score += 0.07;
    reasons.push("Ambas têm sinal financeiro");
  }

  if (score < 0.24) {
    return null;
  }

  let kind: ResultRelatedAuditCard["relation_kind"] = "semantic-neighbor";
  if (
    (current.component && current.component === peer.component) ||
    (current.service && current.service === peer.service)
  ) {
    kind = "same-context";
  }
  if (
    (current.component && current.component === peer.component) &&
    sharedTokens.length >= 5 &&
    sharedTopics.length >= 2
  ) {
    kind = "duplicate_signal";
  }

  return {
    score: Math.min(0.99, Number(score.toFixed(3))),
    reasons: reasons.slice(0, 4),
    sharedTopics,
    kind,
  };
}

function tokenizeForCorrelation(text: string): string[] {
  const stopwords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "have", "were",
    "como", "para", "com", "uma", "que", "por", "das", "dos", "não", "mais",
    "issue", "user", "data", "flow", "card", "page", "resultado", "audit",
  ]);
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !stopwords.has(part));
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function intersectSets(left: Set<string>, right: Set<string>): string[] {
  const out: string[] = [];
  left.forEach((value) => {
    if (right.has(value)) {
      out.push(value);
    }
  });
  return out;
}

function buildKnowledgeSummary(
  audit: RawAudit,
  topics: ResultKnowledgeTopic[],
  documents: ResultKnowledgeDocument[],
  articleCards: ResultArticleCard[],
  themeClusters: ResultThemeCluster[],
): string {
  if (audit.run_kind === "article-analysis" || audit.article_run) {
    const title = audit.article_run?.title || audit.issue.summary;
    const provider = audit.prompt_execution?.provider || audit.decision?.provider || "provider";
    const topTopic = topics[0]?.label ?? "Article analysis";
    return `Análise de artigo para "${title}" via ${provider}. O resultado conectou ${articleCards.length} card(s) de conteúdo, ${documents.length} documento(s) de apoio e destacou ${topTopic} como tema dominante.`;
  }
  const topTopic = topics[0]?.label ?? "Triage";
  const documentCount = documents.length;
  const artifactCount = audit.attachment_facts?.artifacts?.length ?? 0;
  const topCluster = themeClusters[0]?.label ?? topTopic;
  return `Mapa derivado da auditoria ${audit.issue.issue_key}: ${topTopic} aparece como eixo principal. Foram conectados ${artifactCount} artefato(s), ${documentCount} documento(s) e ${articleCards.length} card(s) de artigo. O cluster dominante do corpus é ${topCluster}.`;
}

function getTopicLibrary(audit: RawAudit): TopicDefinition[] {
  return audit.run_kind === "article-analysis" || audit.article_run
    ? ARTICLE_TOPIC_LIBRARY
    : ISSUE_TOPIC_LIBRARY;
}

function findTopicDefinition(topicId: string, topicLibrary: TopicDefinition[] = ALL_TOPIC_LIBRARY): TopicDefinition | undefined {
  return topicLibrary.find((item) => item.id === topicId);
}

function matchesTopic(text: string, topicId: string, topicLibrary: TopicDefinition[] = ALL_TOPIC_LIBRARY): boolean {
  const topic = findTopicDefinition(topicId, topicLibrary);
  if (!topic) return false;
  return topic.tokens.some((token) => text.includes(token));
}

function summarizeText(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}…`;
}

function buildKnowledgeArtifacts(
  audit: RawAudit,
): NonNullable<NonNullable<RawAudit["attachment_facts"]>["artifacts"]> {
  const artifacts = audit.attachment_facts?.artifacts ?? [];
  const metadata = asRecord(audit.article_run?.metadata);
  const sourceDocuments = Array.isArray(metadata?.source_documents) ? metadata?.source_documents : [];
  if (sourceDocuments.length === 0) {
    return artifacts;
  }

  const hasGranularArtifacts = artifacts.length > 1;
  if (hasGranularArtifacts) {
    return artifacts;
  }

  const derivedArtifacts: NonNullable<NonNullable<RawAudit["attachment_facts"]>["artifacts"]> = [];
  sourceDocuments.forEach((item, index) => {
      const record = asRecord(item);
      if (!record) {
        return;
      }
      const fileName = readString(record.file_name) || `documento_${index + 1}.txt`;
      const title = readString(record.title) || path.basename(fileName, path.extname(fileName));
      const excerpt = summarizeText(readString(record.excerpt), 320);
      const charCount = readNumber(record.char_count);
      derivedArtifacts.push({
        artifact_id: `article-meta:${index + 1}:${slugify(fileName) || "doc"}`,
        artifact_type: fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "text",
        source_path: fileName,
        extracted_text: excerpt || title,
        facts: {
          article_title: title,
          primary_theme: "",
          secondary_themes: [],
          char_count: Number.isFinite(charCount) ? charCount : 0,
        },
        confidence: 1,
      });
    });
  return derivedArtifacts;
}

function inferArticleTheme(
  title: string,
  summary: string,
  linkedTopicIds: string[],
): string {
  const text = `${title} ${summary}`.toLowerCase();
  if (text.includes("graphrag") || text.includes("grafo") || text.includes("knowledge graph")) {
    return "GraphRAG";
  }
  if (text.includes("mcp")) {
    return "MCP";
  }
  if (text.includes("ocr") || text.includes("pdf")) {
    return "OCR e PDF";
  }
  if (text.includes("llmops") || text.includes("langsmith") || text.includes("observability")) {
    return "LLMOps";
  }
  if (text.includes("rag")) {
    return "RAG";
  }
  if (text.includes("agent") || text.includes("agente") || text.includes("langgraph")) {
    return "Agentes";
  }
  if (text.includes("local") || text.includes("ollama") || text.includes("litellm")) {
    return "Modelos Locais";
  }
  const topic = ARTICLE_TOPIC_LIBRARY.find((item) => linkedTopicIds.includes(item.id));
  return topic?.label || "Tema misto";
}

function buildArticleCard(
  artifact: NonNullable<NonNullable<RawAudit["attachment_facts"]>["artifacts"]>[number],
  index: number,
  topics: ResultKnowledgeTopic[],
): ResultArticleCard {
  const facts = artifact.facts as Record<string, unknown>;
  const title =
    readStringFact(facts, "article_title") ||
    path.basename(artifact.source_path, path.extname(artifact.source_path)) ||
    `Article ${index + 1}`;
  const secondaryThemes = readStringArrayFact(facts, "secondary_themes");
  const summary = summarizeText(artifact.extracted_text, 220) || title;
  const sourceName = path.basename(artifact.source_path);
  const baseTheme = readStringFact(facts, "primary_theme");
  const linkedTopicIds = topics
    .filter((topic) => {
      const text = `${title} ${baseTheme} ${secondaryThemes.join(" ")} ${artifact.extracted_text}`.toLowerCase();
      return matchesTopic(text, topic.id, ARTICLE_TOPIC_LIBRARY);
    })
    .map((topic) => topic.id);
  const theme = baseTheme || inferArticleTheme(title, summary, linkedTopicIds);

  return {
    id: `article-card:${artifact.artifact_id}`,
    title,
    theme,
    summary,
    source_path: artifact.source_path,
    source_name: sourceName,
    confidence: artifact.confidence,
    secondary_themes: secondaryThemes,
    linked_topic_ids: linkedTopicIds,
  };
}

function buildThemeClusters(articleCards: ResultArticleCard[]): ResultThemeCluster[] {
  const clusters = new Map<string, ResultArticleCard[]>();

  articleCards.forEach((card) => {
    const key = slugify(card.theme) || "tema-misto";
    const current = clusters.get(key) ?? [];
    current.push(card);
    clusters.set(key, current);
  });

  return [...clusters.entries()]
    .map(([id, cards]) => {
      const label = cards[0]?.theme ?? "Tema misto";
      const summaries = cards.slice(0, 2).map((card) => card.summary);
      return {
        id,
        label,
        count: cards.length,
        summary: summarizeText(
          `${label} reúne ${cards.length} artigo(s). ${summaries.join(" ")}`,
          180,
        ),
      };
    })
    .sort((left, right) => right.count - left.count);
}

function readStringFact(facts: Record<string, unknown>, key: string): string {
  const value = facts[key];
  return typeof value === "string" ? value : "";
}

function readStringArrayFact(facts: Record<string, unknown>, key: string): string[] {
  const value = facts[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildArticleAnalysisView(audit: RawAudit): ResultArticleAnalysisView | null {
  const looksLikeArticleUpload = Boolean(
    audit.attachment_facts?.artifacts?.some((artifact) => artifact.artifact_type === "pdf" || artifact.artifact_type === "text")
    && /^upload:/i.test(audit.issue.summary || "")
  );

  if (!(audit.run_kind === "article-analysis" || audit.article_run || audit.prompt_execution?.prompt_name === "article_analysis" || looksLikeArticleUpload)) {
    return null;
  }

  const outputText = (audit.article_run?.output_text || audit.prompt_execution?.output_text || audit.decision?.rationale || "").trim();
  const parsed = parseArticleOutput(outputText);
  const source = String(audit.article_run?.source || audit.attachment_facts?.artifacts?.[0]?.source_path || "");
  const title = String(audit.article_run?.title || audit.issue.summary || "Article analysis");
  const runtimeGraphAssessment = asRecord(asRecord(audit.runtime)?.graph_assessment);
  const graphAssessment = normalizeGraphAssessment(audit.article_run?.graph_assessment ?? runtimeGraphAssessment);
  const distillation = normalizeArticleDistillation(audit.article_run?.distillation);
  const benchmark = normalizeArticleBenchmark(audit.article_run?.benchmark);
  const extractionReports = normalizeExtractionReports(
    audit.article_run?.extraction_reports
      ?? (audit.attachment_facts?.artifacts?.[0]?.facts as Record<string, unknown> | undefined)?.extraction_reports
      ?? (
        (audit.attachment_facts?.artifacts?.[0]?.facts as Record<string, unknown> | undefined)?.pdf_extraction
          ? [(audit.attachment_facts?.artifacts?.[0]?.facts as Record<string, unknown>).pdf_extraction]
          : []
      ),
  );
  const contentExcerpt = String(
    audit.article_run?.content_excerpt
    || audit.attachment_facts?.artifacts?.[0]?.extracted_text
    || audit.issue.description
    || ""
  );
  const contexts = (audit.retrieved ?? []).slice(0, 6).map((item) => {
    const metadata = asRecord(item.metadata);
    const sourceTitle = readString(item.title) || readString(item.source) || readString(item.evidence_id) || readString(item.chunk_id);
    const sourceName = readString(item.source_path) || readString(item.source) || sourceTitle;
    const directTopics = Array.isArray(item.topics) ? item.topics.filter((topic): topic is string => typeof topic === "string") : [];
    const directEntities = Array.isArray(item.entities) ? item.entities.filter((entity): entity is string => typeof entity === "string") : [];
    return {
      id: readString(item.chunk_id) || readString(item.evidence_id) || sourceTitle,
      title: sourceTitle,
      excerpt: summarizeText(readString(item.content), 220) || readString(item.content),
      score: Number.isFinite(readNumber(item.score)) ? readNumber(item.score) : Number(item.final_score ?? 0),
      topics: directTopics.length > 0 ? directTopics : readStringArray(metadata?.topics),
      entities: directEntities.length > 0 ? directEntities : readStringArray(metadata?.entities),
      retrieval_mode: readString(item.retrieval_mode) || readString(metadata?.retrieval_mode) || "vector-global",
      evidence_paths: normalizeEvidencePaths(item.evidence_paths ?? metadata?.evidence_paths),
      source_name: path.basename(sourceName),
    };
  });

  return {
    title,
    source,
    prompt_name: audit.prompt_execution?.prompt_name || audit.article_run?.prompt_name || "article_analysis",
    provider: audit.prompt_execution?.provider || audit.decision?.provider || "unknown",
    model: audit.prompt_execution?.model || audit.decision?.model || "unknown",
    metadata: asRecord(audit.article_run?.metadata) ?? {},
    search_query: String(audit.article_run?.search_query || ""),
    content_excerpt: contentExcerpt,
    executive_summary: resolveArticleSummary(parsed.executiveSummary, contentExcerpt, looksLikeArticleUpload),
    central_ideas: parsed.centralIdeas.length > 0 ? parsed.centralIdeas : extractIdeaFallbacks(contentExcerpt),
    risks: parsed.risks.length > 0 ? parsed.risks : buildRiskFallbacks(audit),
    next_steps: parsed.nextSteps.length > 0 ? parsed.nextSteps : buildNextStepFallbacks(audit),
    raw_output: outputText,
    warnings: audit.article_run?.warnings ?? [],
    retrieved_contexts: contexts,
    related_articles: audit.article_run?.related_articles ?? [],
    graph_assessment: graphAssessment,
    distillation,
    benchmark,
    extraction_reports: extractionReports,
  };
}

function normalizeRetrieved(value: RawAudit["retrieved"]): ResultAudit["retrieved"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item, index) => ({
    evidence_id: readString(item.evidence_id) || readString(item.chunk_id) || `retrieved-${index + 1}`,
    source: readString(item.source) || readString(item.title) || readString(item.source_path) || `source-${index + 1}`,
    content: readString(item.content),
    metadata: {
      category: readString(item.metadata?.category) || "article",
      type: readString(item.metadata?.type),
    },
    final_score: Number.isFinite(readNumber(item.final_score))
      ? readNumber(item.final_score)
      : (Number.isFinite(readNumber(item.score)) ? readNumber(item.score) : 0),
  }));
}

function normalizeExtractionReports(value: unknown): ResultExtractionReport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) {
        return null;
      }
      return {
        source_path: readString(record.source_path),
        file_name: readString(record.file_name),
        file_type: readString(record.file_type),
        selected_engine: readString(record.selected_engine),
        used_monkeyocr: Boolean(record.used_monkeyocr),
        output_dir: readString(record.output_dir),
        files: readStringArray(record.files),
        attempts: Array.isArray(record.attempts)
          ? record.attempts
              .map((attempt) => {
                const attemptRecord = asRecord(attempt);
                if (!attemptRecord) {
                  return null;
                }
                return {
                  engine: readString(attemptRecord.engine),
                  success: Boolean(attemptRecord.success),
                  output_dir: readString(attemptRecord.output_dir),
                  files: readStringArray(attemptRecord.files),
                };
              })
              .filter((attempt): attempt is ResultExtractionAttempt => attempt !== null)
          : [],
      };
    })
    .filter((item): item is ResultExtractionReport => item !== null);
}

function normalizeGraphAssessment(value: unknown): ResultGraphAssessment | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    mode: readString(record.mode),
    score: Number.isFinite(readNumber(record.score)) ? readNumber(record.score) : 0,
    rationale: readString(record.rationale),
    signals: readStringArray(record.signals),
  };
}

function normalizeEvidencePaths(value: unknown): ResultArticleEvidencePath[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }
      return {
        path_id: readString(record.path_id),
        relation: readString(record.relation),
        nodes: readStringArray(record.nodes),
        score: Number.isFinite(readNumber(record.score)) ? readNumber(record.score) : 0,
        summary: readString(record.summary),
      };
    })
    .filter((item): item is ResultArticleEvidencePath => item !== null);
}

function normalizeArticleDistillation(value: unknown): ResultArticleDistillation | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    mode: readString(record.mode),
    context_text: readString(record.context_text),
    key_entities: readStringArray(record.key_entities),
    key_topics: readStringArray(record.key_topics),
    evidence_paths: normalizeEvidencePaths(record.evidence_paths),
  };
}

function normalizeArticleBenchmark(value: unknown): ResultArticleBenchmark | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const scenarios = Array.isArray(record.scenarios)
    ? record.scenarios
      .map((entry) => {
        const scenario = asRecord(entry);
        if (!scenario) {
          return null;
        }
        return {
          mode: readString(scenario.mode),
          retrieval_mode: readString(scenario.retrieval_mode),
          latency_ms: Number.isFinite(readNumber(scenario.latency_ms)) ? readNumber(scenario.latency_ms) : 0,
          result_count: Number.isFinite(readNumber(scenario.result_count)) ? readNumber(scenario.result_count) : 0,
          top_doc_ids: readStringArray(scenario.top_doc_ids),
          top_titles: readStringArray(scenario.top_titles),
        };
      })
      .filter((item): item is ResultArticleBenchmarkScenario => item !== null)
    : [];

  return {
    query: readString(record.query),
    recommended_mode: readString(record.recommended_mode),
    graph_usefulness: normalizeGraphAssessment(record.graph_usefulness),
    scenarios,
  };
}

function buildRuntimeView(audit: RawAudit): ResultRuntimeView | null {
  const runtime = audit.runtime;
  if (!runtime || typeof runtime !== "object") {
    return null;
  }

  const runtimeRecord = runtime as Record<string, unknown>;
  const settings = asRecord(runtimeRecord.settings);
  const retrieval = asRecord(runtimeRecord.retrieval);
  const agentic = asRecord(runtimeRecord.agentic);
  const flowMode = readString(runtimeRecord.flow_mode) || (audit.article_run ? "article-analysis" : "issue-validation");
  const provider = readString(runtimeRecord.provider) || audit.prompt_execution?.provider || audit.decision?.provider || "unknown";
  const model = readString(runtimeRecord.llm_model) || readString(runtimeRecord.model) || audit.prompt_execution?.model || audit.decision?.model || "unknown";
  const promptName = readString(runtimeRecord.prompt_name) || audit.prompt_execution?.prompt_name || "";
  const queryText = readString(runtimeRecord.query_text);
  const searchHits = readNumber(runtimeRecord.search_hits);
  const warnings = readStringArray(runtimeRecord.warnings);
  const supportedRuntimeNodes = readStringArray(runtimeRecord.supported_runtime_nodes);
  const ignoredNodes = readStringArray(runtimeRecord.ignored_nodes);
  const traceNodes = uniqueLines(
    Array.isArray(runtimeRecord.trace)
      ? runtimeRecord.trace
        .map((entry) => (typeof entry === "object" && entry && "node" in entry ? readString((entry as Record<string, unknown>).node) : ""))
        .filter(Boolean)
      : [],
  );

  const techniques: ResultTechniqueItem[] = [];
  const addTechnique = (id: string, label: string, value?: string, detail?: string) => {
    techniques.push({ id, label, value, detail });
  };

  if (readBool(runtimeRecord.langgraph)) {
    addTechnique("langgraph", "LangGraph", "ativo", traceNodes.length > 0 ? `etapas: ${traceNodes.join(" -> ")}` : "orquestracao do workflow");
  }
  if (readBool(runtimeRecord.monkeyocr)) {
    addTechnique("monkeyocr", "MonkeyOCR PDF", "ativo", "parsing preferencial para PDFs quando disponivel");
  }
  if (readBool(runtimeRecord.reranker)) {
    addTechnique("reranker", "Reranker", "ativo", "reordena evidencias recuperadas antes da decisao");
  }

  const distillerMode = readString(runtimeRecord.distiller) || readString(settings?.distiller_mode);
  if (distillerMode) {
    addTechnique("distiller", "Distiller", distillerMode, distillerMode === "refrag" ? "compressao REFRAG aplicada ao contexto" : "compressao simples de contexto");
  }

  if (readBool(retrieval?.external)) {
    addTechnique("qdrant", "Qdrant Retrieval", "ativo", "busca vetorial/hibrida no corpus externo");
  }
  if (readBool(retrieval?.graphrag)) {
    addTechnique("graphrag", "Neo4j GraphRAG", "ativo", "expansao via grafo de relacoes");
  }
  if (readBool(retrieval?.cascade)) {
    addTechnique("cascade", "Cascade Retrieval", "ativo", "refino progressivo da recuperacao");
  }

  const plannerEnabled = readBool(agentic?.planner) || readBool(settings?.enable_planner) || traceNodes.includes("plan");
  if (plannerEnabled) {
    addTechnique("planner", "Planner", readString(runtimeRecord.planner_mode) || readString(settings?.planner_mode) || "ativo");
  }
  const rewriterEnabled = readBool(agentic?.query_rewriter) || readBool(settings?.enable_query_rewriter) || traceNodes.includes("rewrite");
  if (rewriterEnabled) {
    addTechnique("query-rewriter", "Query Rewriter", readString(runtimeRecord.query_rewriter_mode) || readString(settings?.query_rewriter_mode) || "ativo");
  }
  const reflectionEnabled = readBool(agentic?.reflection_memory) || readBool(settings?.enable_reflection_memory) || traceNodes.includes("reflect");
  if (reflectionEnabled) {
    addTechnique("reflection", "Reflection Memory", readString(runtimeRecord.reflection_mode) || readString(settings?.reflection_mode) || "ativo");
  }
  const policyLoopEnabled = readBool(agentic?.policy_loop) || readBool(settings?.enable_policy_loop) || traceNodes.includes("policy");
  if (policyLoopEnabled) {
    addTechnique("policy-loop", "Policy Loop", readString(runtimeRecord.policy_mode) || readString(settings?.policy_mode) || "ativo");
  }
  const temporalEnabled = readBool(agentic?.temporal_graphrag) || readBool(settings?.enable_temporal_graphrag) || traceNodes.includes("temporal");
  if (temporalEnabled) {
    addTechnique("temporal-graphrag", "Temporal GraphRAG", readString(runtimeRecord.temporal_graphrag_mode) || readString(settings?.temporal_graphrag_mode) || "ativo");
  }
  if (readBool(runtimeRecord.dspy_active)) {
    addTechnique("dspy", "DSPy + GEPA", "ativo", "otimizacao experimental de prompts");
  }
  if (readBool(runtimeRecord.ragas_active)) {
    addTechnique("ragas", "RAGAS", "ativo", "avaliacao runtime habilitada");
  }
  if (promptName) {
    addTechnique("prompt", "Prompt", promptName, "prompt selecionado para a analise");
  }
  if (Number.isFinite(searchHits) && searchHits > 0) {
    addTechnique("retrieved-context", "Contexto recuperado", `${searchHits}`, "chunks externos usados como contexto adicional");
  }
  if (supportedRuntimeNodes.includes("article-upload")) {
    addTechnique("upload-direct", "Upload direto", "run", "analise executada a partir da page Run, sem canvas salvo");
  }

  const executionPath = readString(runtimeRecord.execution_path)
    || (supportedRuntimeNodes.length > 0 ? "run-flow" : (flowMode === "article-analysis" ? "run-upload" : "validation-workflow"));
  const summary = flowMode === "article-analysis"
    ? `${provider} analisou o artigo com ${techniques.length} tecnica(s) ativa(s).`
    : `A validacao executou ${Math.max(traceNodes.length, techniques.length, 1)} etapa(s) relevantes do runtime.`;

  return {
    flow_mode: flowMode,
    execution_path: executionPath,
    provider,
    model,
    prompt_name: promptName,
    query_text: queryText,
    search_hits: Number.isFinite(searchHits) ? searchHits : 0,
    summary,
    techniques,
    warnings,
    supported_runtime_nodes: supportedRuntimeNodes,
    ignored_nodes: ignoredNodes,
    trace_nodes: traceNodes,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readBool(value: unknown): boolean {
  return value === true;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function parseArticleOutput(output: string): {
  executiveSummary: string;
  centralIdeas: string[];
  risks: string[];
  nextSteps: string[];
} {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sections = {
    executiveSummary: [] as string[],
    centralIdeas: [] as string[],
    risks: [] as string[],
    nextSteps: [] as string[],
  };

  let current: keyof typeof sections = "executiveSummary";
  for (const line of lines) {
    const normalized = line
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes("resumo executivo")) {
      current = "executiveSummary";
      continue;
    }
    if (normalized.includes("ideias centrais") || normalized.includes("pontos centrais")) {
      current = "centralIdeas";
      continue;
    }
    if (normalized.startsWith("riscos") || normalized.includes("pontos fracos")) {
      current = "risks";
      continue;
    }
    if (normalized.includes("recomendacoes") || normalized.includes("proximos passos")) {
      current = "nextSteps";
      continue;
    }

    const bullet = line.replace(/^[-*•]\s*/, "").trim();
    sections[current].push(bullet);
  }

  const summary = sections.executiveSummary.join(" ");
  const fallbackSummary = summarizeText(output, 320);
  return {
    executiveSummary: summary || fallbackSummary || "Sem resumo executivo gerado.",
    centralIdeas: uniqueLines(sections.centralIdeas).slice(0, 6),
    risks: uniqueLines(sections.risks).slice(0, 6),
    nextSteps: uniqueLines(sections.nextSteps).slice(0, 6),
  };
}

function uniqueLines(lines: string[]): string[] {
  return lines.filter((line, index, all) => line && all.indexOf(line) === index);
}

function resolveArticleSummary(
  parsedSummary: string,
  contentExcerpt: string,
  preferContentFallback: boolean,
): string {
  if (!preferContentFallback) {
    return parsedSummary;
  }
  const normalized = parsedSummary.toLowerCase();
  if (normalized.includes("failure evidence") || normalized.includes("missing required fields")) {
    return summarizeText(contentExcerpt, 320) || parsedSummary;
  }
  return parsedSummary;
}

function extractIdeaFallbacks(content: string): string[] {
  const sentences = content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 40);
  return uniqueLines(sentences.slice(0, 4).map((item) => summarizeText(item, 180)));
}

function buildRiskFallbacks(audit: RawAudit): string[] {
  return uniqueLines([
    ...(audit.rule_evaluation?.contradictions ?? []),
    ...(audit.decision?.contradictions ?? []),
    ...(audit.decision?.requires_human_review ? ["O resultado indicou necessidade de revisao humana."] : []),
  ]).slice(0, 5);
}

function buildNextStepFallbacks(audit: RawAudit): string[] {
  return uniqueLines([
    ...(audit.decision?.missing_items?.map((item) => `Complementar: ${item}`) ?? []),
    ...(audit.retrieved?.slice(0, 2).map((item) => `Revisar contexto recuperado: ${item.source}`) ?? []),
  ]).slice(0, 5);
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeStat(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

function buildMockAudits(): ResultAudit[] {
  const raws: Array<{ timestamp: string; payload: RawAudit }> = [
    {
      timestamp: "20260308T090000Z",
      payload: {
        issue: {
          issue_key: "PAY-1421",
          summary: "PIX payment shows failure but customer may have been charged",
          description: "Customer saw payment failed but ledger suggests capture succeeded.",
          priority: "High",
          issue_type: "Bug",
          status: "Triagem",
          project: "PAY",
          component: "checkout",
          service: "payment-service",
          environment: "prod",
          labels: ["pix", "financeiro"],
          expected_behavior: "The UI should confirm a successful payment exactly once.",
          actual_behavior: "The UI showed failure after authorization.",
        },
        attachment_facts: {
          artifacts: [
            {
              artifact_id: "mock-artifact-1",
              artifact_type: "text",
              source_path: "examples/input/PAY-1421/payment_logs.txt",
              extracted_text:
                "2026-03-06 09:11:42 ERROR UI response failed; ledger captured payment successfully for txn=9F01AA44.",
              facts: { ids: ["9F01AA44", "PAY-1421"] },
              confidence: 0.92,
            },
            {
              artifact_id: "mock-artifact-2",
              artifact_type: "spreadsheet",
              source_path: "examples/input/PAY-1421/reconciliation.csv",
              extracted_text: "transaction_id,status,charged_amount,ledger_amount 9F01AA44 failed 120.5 120.5 captured 120.5 120.5",
              facts: { status_counts: { failed: 1, captured: 1 } },
              confidence: 0.95,
            },
          ],
          contradictions: [
            "Spreadsheet contains both captured and failed payment rows",
            "UI or artifact failure evidence conflicts with backend success evidence",
          ],
        },
        rule_evaluation: {
          missing_items: ["reproduction_steps"],
          contradictions: [
            "Spreadsheet contains both captured and failed payment rows",
            "UI or artifact failure evidence conflicts with backend success evidence",
          ],
          results: [
            { rule_name: "financial_impact_detected", severity: "critical", message: "Issue contains financial language or monetary evidence" },
          ],
        },
        retrieved: [
          {
            evidence_id: "mock-evidence-1",
            source: "attachment:payment_logs.txt",
            content: "UI failed but ledger captured payment successfully.",
            metadata: { category: "artifact", type: "text" },
            final_score: 0.81,
          },
          {
            evidence_id: "mock-policy-1",
            source: "policy:financial-review",
            content: "Payment mismatches should be escalated for human review.",
            metadata: { category: "policy" },
            final_score: 0.33,
          },
        ],
        decision: {
          issue_key: "PAY-1421",
          classification: "needs_review",
          is_bug: true,
          is_complete: false,
          ready_for_dev: false,
          confidence: 0.74,
          missing_items: ["reproduction_steps"],
          evidence_used: ["attachment:payment_logs.txt", "attachment:reconciliation.csv"],
          contradictions: [
            "Spreadsheet contains both captured and failed payment rows",
          ],
          financial_impact_detected: true,
          requires_human_review: true,
          rationale: "Há conflito entre UI e ledger. O caso precisa de revisão humana antes de qualquer classificação final.",
          provider: "mock",
          model: "mock-judge-v2",
        },
      },
    },
    {
      timestamp: "20260308T091500Z",
      payload: {
        issue: {
          issue_key: "DOC-310",
          summary: "Article ingestion linked support note with incorrect topic cluster",
          description: "During article analysis, two notes about checkout UX and refunds were merged into the same cluster.",
          priority: "Medium",
          issue_type: "Bug",
          status: "Investigando",
          project: "DOC",
          component: "article-pipeline",
          service: "knowledge-service",
          environment: "staging",
          labels: ["articles", "cluster", "retrieval"],
          expected_behavior: "Topics about refund policy and form validation should remain in separate semantic clusters.",
          actual_behavior: "The same cluster mixed both topics and biased the final summary.",
        },
        attachment_facts: {
          artifacts: [
            {
              artifact_id: "mock-artifact-3",
              artifact_type: "text",
              source_path: "examples/input/DOC-310/cluster-debug.txt",
              extracted_text: "Topic cluster combined refund policy, client-side validation and payment alert snippets into one group.",
              facts: { ids: ["cluster_77"] },
              confidence: 0.89,
            },
          ],
          contradictions: [],
        },
        rule_evaluation: {
          missing_items: [],
          contradictions: [],
          results: [
            { rule_name: "topic_drift_detected", severity: "warning", message: "The retrieved snippets mix distinct semantic themes." },
          ],
        },
        retrieved: [
          {
            evidence_id: "mock-evidence-2",
            source: "article:refund-policy-note",
            content: "Refund policy article discusses chargeback timelines and ledger rollback.",
            metadata: { category: "article", type: "md" },
            final_score: 0.69,
          },
          {
            evidence_id: "mock-evidence-3",
            source: "article:form-validation-guide",
            content: "Validation guide explains client-side blocking, empty fields and warning banners.",
            metadata: { category: "article", type: "md" },
            final_score: 0.66,
          },
        ],
        decision: {
          issue_key: "DOC-310",
          classification: "bug",
          is_bug: true,
          is_complete: true,
          ready_for_dev: true,
          confidence: 0.83,
          missing_items: [],
          evidence_used: ["article:refund-policy-note", "article:form-validation-guide", "mock-artifact-3"],
          contradictions: [],
          financial_impact_detected: false,
          requires_human_review: false,
          rationale: "O erro está no agrupamento semântico do pipeline. O bug é reproduzível e suficientemente documentado.",
          provider: "mock",
          model: "mock-judge-v2",
        },
      },
    },
  ];

  return raws.map(({ timestamp, payload }, _index, all) =>
    enrichAudit(
      payload,
      payload.issue.issue_key,
      timestamp,
      "mock",
      all.map((item) => ({
        issueKey: item.payload.issue.issue_key,
        timestamp: item.timestamp,
        payload: item.payload,
      })),
    ),
  );
}
