import { promises as fs } from "fs";
import path from "path";

import { isMongoConfigured } from "./mongodb";
import { getSettingsOverrides } from "./settings-store";

export type PromptMode = "decision" | "text";

export interface PromptTemplate {
  name: string;
  mode: PromptMode;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  fileName: string;
}

export interface RequestEntry {
  issueKey: string;
  summary: string;
  classification: string;
  provider: string;
  confidence: number;
  readyForDev: boolean;
  financialImpact: boolean;
  contradictions: number;
  retrievedCount: number;
  timestamp: string;
}

export interface DailyUsage {
  day: string;
  count: number;
}

export interface UsageOverview {
  totalRequests: number;
  uniqueIssues: number;
  avgConfidence: number;
  reviewRate: number;
  byProvider: Array<{ name: string; count: number }>;
  byClassification: Array<{ name: string; count: number }>;
  dailyUsage: DailyUsage[];
}

export interface SettingItem {
  key: string;
  /** Display value — sensitive keys are masked (e.g. "configured"). */
  value: string;
  /** Actual value sent to the editor; empty string for masked/sensitive keys. */
  rawValue: string;
  /** Whether this setting can be edited via the dashboard UI. */
  editable: boolean;
}

export interface SettingsGroup {
  title: string;
  description: string;
  items: SettingItem[];
}

export interface ActiveProviderConfig {
  /** e.g. "openai" | "gemini" | "ollama" | "mock" */
  provider: string;
  /** Active model name for the selected provider */
  model: string;
  /** Value of SECONDARY_PROVIDER (or empty string) */
  secondaryProvider: string;
  /** Whether ENABLE_SECOND_OPINION is "true" */
  secondOpinionEnabled: boolean;
  /** Whether CONFIDENTIALITY_MODE is "true" */
  confidentialityMode: boolean;
}

export interface ComparisonReport {
  fileName: string;
  generatedAt: string;
  scenarioCount: number;
  datasetPath: string;
}

export interface TimelineStep {
  phase: string;
  title: string;
  description: string;
  tags: string[];
}

export interface MongoStatus {
  configured: boolean;
  connected: boolean;
  docCount: number;
  uri: string; // masked e.g. mongodb://localhost:27017
  error?: string;
}

export interface DashboardData {
  prompts: PromptTemplate[];
  recentRequests: RequestEntry[];
  usageOverview: UsageOverview;
  settingsGroups: SettingsGroup[];
  comparisonReports: ComparisonReport[];
  timeline: TimelineStep[];
  mongoConfigured: boolean;
  activeConfig: ActiveProviderConfig;
  mongoStatus: MongoStatus;
}

const REPO_ROOT = path.resolve(process.cwd(), "..");
const PROMPTS_DIR = path.join(REPO_ROOT, "prompts");
const AUDIT_DIR = path.join(REPO_ROOT, "data", "audit");
const REPORTS_DIR = path.join(REPO_ROOT, "data", "eval_reports");
const ENV_PATH = path.join(REPO_ROOT, ".env");

export async function getDashboardData(): Promise<DashboardData> {
  const [prompts, recentRequests, comparisonReports, settingsGroups, activeConfig, mongoStatus] = await Promise.all([
    readPrompts(),
    readRecentRequests(),
    readComparisonReports(),
    readSettingsGroups(),
    readActiveConfig(),
    probeMongoStatus(),
  ]);

  return {
    prompts,
    recentRequests,
    usageOverview: buildUsageOverview(recentRequests),
    settingsGroups,
    comparisonReports,
    timeline: buildTimeline(),
    mongoConfigured: isMongoConfigured(),
    activeConfig,
    mongoStatus,
  };
}

async function probeMongoStatus(): Promise<MongoStatus> {
  const rawUri = process.env.MONGODB_URI ?? "";
  const configured = Boolean(rawUri);

  // Mask credentials in the URI for display
  let maskedUri = "(not set)";
  if (rawUri) {
    try {
      const u = new URL(rawUri);
      if (u.password) u.password = "*****";
      maskedUri = u.toString();
    } catch {
      maskedUri = rawUri.replace(/:([^@/]+)@/, ":*****@");
    }
  }

  if (!configured) {
    return { configured: false, connected: false, docCount: 0, uri: maskedUri };
  }

  try {
    const { getMongoClient } = await import("./mongodb");
    const mongo = await getMongoClient();
    // ping command verifies the connection is alive
    await mongo.db("admin").command({ ping: 1 });
    const docCount = await mongo
      .db("ragflow")
      .collection("settings")
      .countDocuments();
    return { configured: true, connected: true, docCount, uri: maskedUri };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      docCount: 0,
      uri: maskedUri,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function readActiveConfig(): Promise<ActiveProviderConfig> {
  const [env, overrides] = await Promise.all([parseEnvFile(), getSettingsOverrides()]);
  const merged = { ...env, ...overrides };

  const provider = (merged["DEFAULT_PROVIDER"] ?? "openai").toLowerCase();

  const modelByProvider: Record<string, string> = {
    openai: merged["OPENAI_MODEL"] ?? "gpt-4o",
    gemini: merged["GEMINI_MODEL"] ?? "gemini-2.5-flash",
    ollama: merged["OLLAMA_MODEL"] ?? "llama3",
    mock: "(mock — no real LLM)",
  };

  return {
    provider,
    model: modelByProvider[provider] ?? merged["OPENAI_MODEL"] ?? "(not set)",
    secondaryProvider: (merged["SECONDARY_PROVIDER"] ?? "").toLowerCase(),
    secondOpinionEnabled: (merged["ENABLE_SECOND_OPINION"] ?? "false").toLowerCase() === "true",
    confidentialityMode: (merged["CONFIDENTIALITY_MODE"] ?? "false").toLowerCase() === "true",
  };
}

export async function createPromptFile(input: {
  name: string;
  mode: PromptMode;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
}): Promise<void> {
  const slug = slugify(input.name);
  const fileName = `${slug}.md`;
  const targetPath = path.join(PROMPTS_DIR, fileName);
  await fs.mkdir(PROMPTS_DIR, { recursive: true });

  // Check neither .md nor .json already exists
  for (const ext of [".md", ".json"]) {
    try {
      await fs.access(path.join(PROMPTS_DIR, `${slug}${ext}`));
      throw new Error(`Prompt '${slug}${ext}' already exists`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== "ENOENT") throw error;
    }
  }

  await fs.writeFile(targetPath, serializePromptMd({ ...input, name: slug }), "utf-8");
}

export async function updatePromptFile(
  fileName: string,
  input: { mode: PromptMode; description: string; systemPrompt: string; userPromptTemplate: string },
): Promise<void> {
  const targetPath = path.join(PROMPTS_DIR, fileName);
  const slug = fileName.replace(/\.(md|json)$/, "");

  if (fileName.endsWith(".md")) {
    await fs.writeFile(targetPath, serializePromptMd({ name: slug, ...input }), "utf-8");
  } else {
    const payload = {
      name: slug,
      mode: input.mode,
      description: input.description.trim(),
      system_prompt: input.systemPrompt.trim(),
      user_prompt_template: input.userPromptTemplate.trim(),
    };
    await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  }
}

export async function deletePromptFile(fileName: string): Promise<void> {
  const targetPath = path.join(PROMPTS_DIR, fileName);
  await fs.unlink(targetPath);
}

function serializePromptMd(input: {
  name: string;
  mode: PromptMode;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
}): string {
  return [
    `---`,
    `name: ${input.name}`,
    `mode: ${input.mode}`,
    `description: ${input.description.trim()}`,
    `---`,
    ``,
    `## system_prompt`,
    ``,
    input.systemPrompt.trim(),
    ``,
    `## user_prompt_template`,
    ``,
    input.userPromptTemplate.trim(),
    ``,
  ].join("\n");
}


async function readPrompts(): Promise<PromptTemplate[]> {
  const files = await safeReadDir(PROMPTS_DIR);
  // Both .md and .json; .md takes priority over same-stem .json
  const seen = new Set<string>();
  const promptFiles = [
    ...files.filter((f) => f.endsWith(".md")),
    ...files.filter((f) => f.endsWith(".json")),
  ]
    .sort()
    .filter((fileName) => {
      const stem = fileName.replace(/\.(md|json)$/, "");
      if (seen.has(stem)) return false;
      seen.add(stem);
      return true;
    });

  const prompts = await Promise.all(
    promptFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(PROMPTS_DIR, fileName), "utf-8");
      let payload: Record<string, unknown>;
      if (fileName.endsWith(".md")) {
        payload = parseMdPrompt(raw, fileName);
      } else {
        payload = JSON.parse(raw) as Record<string, unknown>;
      }
      return {
        name: String(payload.name ?? fileName.replace(/\.(md|json)$/, "")),
        mode: (payload.mode === "decision" ? "decision" : "text") as PromptMode,
        description: String(payload.description ?? ""),
        systemPrompt: String(payload.system_prompt ?? payload.systemPrompt ?? ""),
        userPromptTemplate: String(payload.user_prompt_template ?? payload.userPromptTemplate ?? ""),
        fileName,
      } satisfies PromptTemplate;
    }),
  );
  return prompts;
}

function parseMdPrompt(text: string, fileName: string): Record<string, unknown> {
  const result: Record<string, unknown> = { name: fileName.replace(/\.md$/, "") };
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fmMatch) {
    for (const line of fmMatch[1].split("\n")) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      result[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    text = text.slice(fmMatch[0].length);
  }
  const parts = text.trim().split(/^##\s+(\S+)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].trim();
    const body = (parts[i + 1] ?? "").trim();
    if (key === "system_prompt") result.system_prompt = body;
    else if (key === "user_prompt_template") result.user_prompt_template = body;
  }
  return result;
}

async function readRecentRequests(): Promise<RequestEntry[]> {
  const issueDirs = await safeReadDir(AUDIT_DIR);
  const auditFiles: string[] = [];

  for (const issueDir of issueDirs) {
    const issuePath = path.join(AUDIT_DIR, issueDir);
    const stat = await safeStat(issuePath);
    if (!stat?.isDirectory()) {
      continue;
    }
    const files = await safeReadDir(issuePath);
    for (const file of files) {
      if (file.endsWith(".json")) {
        auditFiles.push(path.join(issuePath, file));
      }
    }
  }

  const entries = await Promise.all(
    auditFiles.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf-8");
      const payload = JSON.parse(raw) as Record<string, any>;
      const decision = payload.decision ?? {};
      const issue = payload.issue ?? {};
      const ruleEvaluation = payload.rule_evaluation ?? {};
      const retrieved = Array.isArray(payload.retrieved) ? payload.retrieved : [];
      const timestamp = String(decision.generated_at ?? issue.collected_at ?? path.basename(filePath, ".json"));
      return {
        issueKey: String(issue.issue_key ?? "unknown"),
        summary: String(issue.summary ?? "No summary available"),
        classification: String(decision.classification ?? "unknown"),
        provider: String(decision.provider ?? "unknown"),
        confidence: Number(decision.confidence ?? 0),
        readyForDev: Boolean(decision.ready_for_dev),
        financialImpact: Boolean(ruleEvaluation.financial_impact_detected ?? decision.financial_impact_detected),
        contradictions: Array.isArray(ruleEvaluation.contradictions) ? ruleEvaluation.contradictions.length : 0,
        retrievedCount: retrieved.length,
        timestamp,
      } satisfies RequestEntry;
    }),
  );

  return entries
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 18);
}

function buildUsageOverview(entries: RequestEntry[]): UsageOverview {
  const uniqueIssues = new Set(entries.map((entry) => entry.issueKey)).size;
  const avgConfidence = entries.length
    ? entries.reduce((accumulator, entry) => accumulator + entry.confidence, 0) / entries.length
    : 0;
  const reviewRate = entries.length
    ? entries.filter((entry) => entry.classification === "needs_review").length / entries.length
    : 0;

  const providerCounts = countBy(entries, (entry) => entry.provider);
  const classificationCounts = countBy(entries, (entry) => entry.classification);

  const dailyBuckets = new Map<string, number>();
  for (const entry of entries) {
    const normalized = normalizeDay(entry.timestamp);
    dailyBuckets.set(normalized, (dailyBuckets.get(normalized) ?? 0) + 1);
  }

  const dailyUsage = Array.from(dailyBuckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-7)
    .map(([day, count]) => ({ day, count }));

  return {
    totalRequests: entries.length,
    uniqueIssues,
    avgConfidence,
    reviewRate,
    byProvider: toSortedCountArray(providerCounts),
    byClassification: toSortedCountArray(classificationCounts),
    dailyUsage,
  };
}

/** Keys whose values are masked (secrets). These are read-only in the UI. */
const SENSITIVE_KEY_PATTERNS = ["TOKEN", "SECRET", "PASSWORD", "_KEY", "CREDENTIALS"];

function isSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => upper.includes(p));
}

async function readSettingsGroups(): Promise<SettingsGroup[]> {
  const [env, overrides] = await Promise.all([parseEnvFile(), getSettingsOverrides()]);
  // MongoDB overrides take precedence over .env
  const merged = { ...env, ...overrides };
  return [
    {
      title: "Execution posture",
      description: "Controles de confidencialidade, providers e decisão padrão.",
      items: [
        setting(merged, "CONFIDENTIALITY_MODE"),
        setting(merged, "ALLOW_THIRD_PARTY_LLM"),
        setting(merged, "ALLOW_THIRD_PARTY_EMBEDDINGS"),
        setting(merged, "ALLOW_EXTERNAL_VECTOR_STORE"),
        setting(merged, "DEFAULT_PROVIDER"),
        setting(merged, "SECONDARY_PROVIDER"),
        setting(merged, "ENABLE_SECOND_OPINION"),
        setting(merged, "ENABLE_MODULAR_JUDGE"),
        setting(merged, "ENABLE_LANGGRAPH"),
        setting(merged, "ENABLE_RERANKER"),
        setting(merged, "ENABLE_EXTERNAL_RETRIEVAL"),
      ],
    },
    {
      title: "Vertex and model routing",
      description: "Configuração corrente do Gemini via Vertex AI e dos modelos ativos.",
      items: [
        setting(merged, "GCP_PROJECT_ID"),
        setting(merged, "GCP_LOCATION"),
        setting(merged, "GOOGLE_APPLICATION_CREDENTIALS"),
        setting(merged, "GEMINI_API_KEY"),
        setting(merged, "OPENAI_API_KEY"),
        setting(merged, "OPENAI_MODEL"),
        setting(merged, "GEMINI_MODEL"),
        setting(merged, "OPENAI_EMBEDDING_MODEL"),
        setting(merged, "GEMINI_EMBEDDING_MODEL"),
        setting(merged, "EMBEDDING_DIMENSION"),
      ],
    },
    {
      title: "Qdrant vector store",
      description: "Configuração do Qdrant, quantização e recuperação em cascata.",
      items: [
        setting(merged, "QDRANT_URL"),
        setting(merged, "QDRANT_COLLECTION"),
        setting(merged, "QDRANT_API_KEY"),
        setting(merged, "QDRANT_QUANTIZATION_TYPE"),
        setting(merged, "QDRANT_QUANTIZATION_RESCORE"),
        setting(merged, "QDRANT_CASCADE_OVERRETRIEVE_FACTOR"),
        setting(merged, "ENABLE_CASCADE_RETRIEVAL"),
      ],
    },
    {
      title: "Neo4j GraphRAG",
      description: "Camada opcional de recuperação baseada em grafo de conhecimento.",
      items: [
        setting(merged, "ENABLE_GRAPHRAG"),
        setting(merged, "NEO4J_URL"),
        setting(merged, "NEO4J_USER"),
        setting(merged, "NEO4J_DATABASE"),
        setting(merged, "NEO4J_PASSWORD"),
      ],
    },
    {
      title: "Directories and storage",
      description: "Pastas que alimentam o dashboard e o pipeline operacional.",
      items: [
        { key: "PROMPTS_DIR", value: promptDisplayPath(PROMPTS_DIR), rawValue: "", editable: false },
        { key: "AUDIT_DIR", value: promptDisplayPath(AUDIT_DIR), rawValue: "", editable: false },
        { key: "EVAL_REPORTS_DIR", value: promptDisplayPath(REPORTS_DIR), rawValue: "", editable: false },
        setting(merged, "STAGING_DIR"),
        setting(merged, "DSPY_LAB_DIR"),
      ],
    },
    {
      title: "Jira integration",
      description: "Credenciais e configuração do cliente Jira.",
      items: [
        setting(merged, "JIRA_BASE_URL"),
        setting(merged, "JIRA_USER_EMAIL"),
        setting(merged, "JIRA_API_TOKEN"),
        setting(merged, "JIRA_PROJECT_KEY"),
        setting(merged, "JIRA_VERIFY_SSL"),
      ],
    },
    {
      title: "Ollama (local)",
      description: "Provider local via Ollama — funciona em CONFIDENTIALITY_MODE sem custo de API. Auto-melhoria ativa quando classification_accuracy < AUTO_IMPROVEMENT_THRESHOLD.",
      items: [
        setting(merged, "OLLAMA_BASE_URL"),
        setting(merged, "OLLAMA_MODEL"),
        setting(merged, "AUTO_IMPROVEMENT_THRESHOLD"),
      ],
    },
  ];
}

async function readComparisonReports(): Promise<ComparisonReport[]> {
  const files = (await safeReadDir(REPORTS_DIR)).filter((file) => file.endsWith(".json")).sort().reverse();
  const reports = await Promise.all(
    files.slice(0, 6).map(async (fileName) => {
      const raw = await fs.readFile(path.join(REPORTS_DIR, fileName), "utf-8");
      const payload = JSON.parse(raw) as Record<string, any>;
      return {
        fileName,
        generatedAt: String(payload.generated_at ?? fileName.replace(/\.json$/, "")),
        scenarioCount: Array.isArray(payload.scenarios) ? payload.scenarios.length : 0,
        datasetPath: String(payload.dataset_path ?? "n/a"),
      } satisfies ComparisonReport;
    }),
  );
  return reports;
}

function buildTimeline(): TimelineStep[] {
  return [
    {
      phase: "01",
      title: "Request ingress and prompt selection",
      description:
        "A requisição entra pela API Python, seleciona provider, aplica política de confidencialidade e, quando informado, resolve um prompt salvo em disco para o fluxo de decisão ou análise.",
      tags: ["FastAPI", "PromptCatalog", "Confidentiality policy"],
    },
    {
      phase: "02",
      title: "Evidence shaping",
      description:
        "Issues e anexos viram um pacote canônico de fatos, com artefatos extraídos, regras determinísticas, contradições e sinais de impacto financeiro antes de qualquer julgamento com LLM.",
      tags: ["ArtifactPipeline", "RulesEngine", "IssueNormalizer"],
    },
    {
      phase: "03",
      title: "Retrieval and context distillation",
      description:
        "O retriever híbrido combina contexto local, evidência indexada, embeddings e snippets de política. Depois disso, a aplicação destila o contexto para reduzir ruído antes da decisão final.",
      tags: ["HybridRetriever", "Embeddings", "Reranker", "Qdrant optional"],
    },
    {
      phase: "04",
      title: "Provider execution and audit trail",
      description:
        "O provider selecionado executa o prompt renderizado, normaliza o retorno e a aplicação grava uma trilha de auditoria completa para replay, análise operacional e comparação entre cenários.",
      tags: ["Gemini Vertex", "OpenAI", "Mock", "AuditStore"],
    },
    {
      phase: "05",
      title: "DSPy optimization lab",
      description:
        "Laboratório offline que treina assinaturas DSPy contra o golden dataset usando BootstrapFewShot ou MIPROv2. Os melhores programas são exportados de volta para o diretório prompts/ como arquivos JSON, fechando o ciclo de melhoria contínua.",
      tags: ["DSPy", "BootstrapFewShot", "MIPROv2", "Golden dataset", "Prompt export"],
    },
    {
      phase: "06",
      title: "Neo4j GraphRAG layer",
      description:
        "Camada opcional de recuperação baseada em grafo: cada issue é indexada com seus nós de componente, serviço, ambiente e fingerprint de erro. A busca em profundidade 2 retorna issues relacionados, duplicatas e raízes de causa como evidência adicional.",
      tags: ["Neo4j", "GraphRAG", "Cypher", "Issue graph", "Error fingerprint"],
    },
    {
      phase: "07",
      title: "Quantized cascade retrieval",
      description:
        "Para corpora grandes, o Qdrant aplica quantização int8 ou binária. A busca em cascata faz um recall aproximado amplo (overretrieve × N candidatos) e depois rescora o shortlist com precisão total — reduzindo custo sem comprometer precisão.",
      tags: ["Qdrant", "Scalar quantization", "Binary quantization", "Cascade search", "Rescore"],
    },
  ];
}

async function parseEnvFile(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(ENV_PATH, "utf-8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
      .reduce<Record<string, string>>((accumulator, line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        accumulator[key] = value;
        return accumulator;
      }, {});
  } catch {
    return {};
  }
}

async function safeReadDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function safeStat(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function setting(env: Record<string, string>, key: string): SettingItem {
  const raw = env[key] ?? "";
  const sensitive = isSensitiveKey(key);
  return {
    key,
    value: maskSettingValue(key, raw || undefined),
    rawValue: sensitive ? "" : raw,
    editable: !sensitive,
  };
}

function maskSettingValue(key: string, value?: string): string {
  if (!value) {
    return "not configured";
  }
  const upperKey = key.toUpperCase();
  if (upperKey.includes("CREDENTIALS")) {
    return `${path.basename(value)} configured`;
  }
  if (
    upperKey.includes("TOKEN") ||
    upperKey.includes("SECRET") ||
    upperKey.includes("PASSWORD") ||
    upperKey.endsWith("_KEY")
  ) {
    return "configured";
  }
  return value;
}

function promptDisplayPath(targetPath: string): string {
  return path.relative(REPO_ROOT, targetPath).replaceAll("\\", "/");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function countBy<T>(items: T[], getKey: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function toSortedCountArray(counts: Map<string, number>) {
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}

function normalizeDay(timestamp: string): string {
  if (timestamp.includes("T")) {
    return timestamp.slice(5, 10).replace("-", "/");
  }
  if (/^\d{8}T/.test(timestamp)) {
    return `${timestamp.slice(4, 6)}/${timestamp.slice(6, 8)}`;
  }
  return timestamp.slice(0, 10);
}