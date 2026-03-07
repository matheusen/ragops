import { promises as fs } from "fs";
import path from "path";

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

export interface SettingsGroup {
  title: string;
  description: string;
  items: Array<{ key: string; value: string }>;
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

export interface DashboardData {
  prompts: PromptTemplate[];
  recentRequests: RequestEntry[];
  usageOverview: UsageOverview;
  settingsGroups: SettingsGroup[];
  comparisonReports: ComparisonReport[];
  timeline: TimelineStep[];
}

const REPO_ROOT = path.resolve(process.cwd(), "..");
const PROMPTS_DIR = path.join(REPO_ROOT, "prompts");
const AUDIT_DIR = path.join(REPO_ROOT, "data", "audit");
const REPORTS_DIR = path.join(REPO_ROOT, "data", "eval_reports");
const ENV_PATH = path.join(REPO_ROOT, ".env");

export async function getDashboardData(): Promise<DashboardData> {
  const [prompts, recentRequests, comparisonReports, settingsGroups] = await Promise.all([
    readPrompts(),
    readRecentRequests(),
    readComparisonReports(),
    readSettingsGroups(),
  ]);

  return {
    prompts,
    recentRequests,
    usageOverview: buildUsageOverview(recentRequests),
    settingsGroups,
    comparisonReports,
    timeline: buildTimeline(),
  };
}

export async function createPromptFile(input: {
  name: string;
  mode: PromptMode;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
}): Promise<void> {
  const fileName = `${slugify(input.name)}.json`;
  const targetPath = path.join(PROMPTS_DIR, fileName);
  await fs.mkdir(PROMPTS_DIR, { recursive: true });

  try {
    await fs.access(targetPath);
    throw new Error(`Prompt '${fileName}' already exists`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== "ENOENT") {
      throw error;
    }
  }

  const payload = {
    name: slugify(input.name),
    mode: input.mode,
    description: input.description.trim(),
    system_prompt: input.systemPrompt.trim(),
    user_prompt_template: input.userPromptTemplate.trim(),
  };

  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function readPrompts(): Promise<PromptTemplate[]> {
  const files = await safeReadDir(PROMPTS_DIR);
  const promptFiles = files.filter((file) => file.endsWith(".json")).sort();
  const prompts = await Promise.all(
    promptFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(PROMPTS_DIR, fileName), "utf-8");
      const payload = JSON.parse(raw) as Record<string, unknown>;
      return {
        name: String(payload.name ?? fileName.replace(/\.json$/, "")),
        mode: (payload.mode === "decision" ? "decision" : "text") as PromptMode,
        description: String(payload.description ?? ""),
        systemPrompt: String(payload.system_prompt ?? ""),
        userPromptTemplate: String(payload.user_prompt_template ?? ""),
        fileName,
      };
    }),
  );
  return prompts;
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

async function readSettingsGroups(): Promise<SettingsGroup[]> {
  const env = await parseEnvFile();
  return [
    {
      title: "Execution posture",
      description: "Controles de confidencialidade, providers e decisão padrão.",
      items: [
        setting(env, "CONFIDENTIALITY_MODE"),
        setting(env, "ALLOW_THIRD_PARTY_LLM"),
        setting(env, "ALLOW_THIRD_PARTY_EMBEDDINGS"),
        setting(env, "ALLOW_EXTERNAL_VECTOR_STORE"),
        setting(env, "DEFAULT_PROVIDER"),
        setting(env, "SECONDARY_PROVIDER"),
      ],
    },
    {
      title: "Vertex and model routing",
      description: "Configuração corrente do Gemini via Vertex AI e dos modelos ativos.",
      items: [
        setting(env, "GCP_PROJECT_ID"),
        setting(env, "GCP_LOCATION"),
        setting(env, "GOOGLE_APPLICATION_CREDENTIALS"),
        setting(env, "OPENAI_MODEL"),
        setting(env, "GEMINI_MODEL"),
      ],
    },
    {
      title: "Directories and storage",
      description: "Pastas que alimentam o dashboard e o pipeline operacional.",
      items: [
        { key: "PROMPTS_DIR", value: promptDisplayPath(PROMPTS_DIR) },
        { key: "AUDIT_DIR", value: promptDisplayPath(AUDIT_DIR) },
        { key: "EVAL_REPORTS_DIR", value: promptDisplayPath(REPORTS_DIR) },
        setting(env, "QDRANT_URL"),
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

function setting(env: Record<string, string>, key: string): { key: string; value: string } {
  const value = env[key];
  return { key, value: maskSettingValue(key, value) };
}

function maskSettingValue(key: string, value?: string): string {
  if (!value) {
    return "not configured";
  }
  const upperKey = key.toUpperCase();
  if (upperKey.includes("CREDENTIALS")) {
    return `${path.basename(value)} configured`;
  }
  if (upperKey.includes("TOKEN") || upperKey.includes("SECRET") || upperKey.endsWith("_KEY")) {
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