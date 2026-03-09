"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getApiBase } from "@/lib/api-base";

interface IssuePreview {
  issue_key: string;
  summary: string;
  description: string;
  priority: string | null;
  issue_type: string;
  status: string | null;
  attachments: { filename: string }[];
}

interface DecisionResult {
  issue_key: string;
  classification: "bug" | "not_bug" | "needs_review";
  is_bug: boolean;
  is_complete: boolean;
  ready_for_dev: boolean;
  ready_for_dev_criteria_met: string[];
  ready_for_dev_blockers: string[];
  missing_items: string[];
  evidence_used: string[];
  contradictions: string[];
  financial_impact_detected: boolean;
  confidence: number;
  requires_human_review: boolean;
  next_action: string;
  provider: string;
  model: string;
  rationale: string;
}

interface PromptInfo {
  name: string;
  mode: "decision" | "text";
  description: string;
}

interface ArticleSearchHit {
  chunk_id: string;
  doc_id: string;
  title: string;
  chunk_index: number;
  content: string;
  topics: string[];
  score: number;
}

interface PromptExecutionResult {
  prompt_name: string;
  mode: "decision" | "text";
  provider: string;
  model: string;
  output_text: string;
}

interface ArticlePromptUploadResult {
  title: string;
  source_files: string[];
  prompt_execution: PromptExecutionResult;
  article_search: ArticleSearchHit[];
  result_id: string | null;
}

type Tab = "jira" | "manual" | "files";
type FileMode = "issue" | "article";
type FlowCanvasDraft = {
  nodes?: Array<{ id: string; active: boolean; selectedVariant?: string }>;
  activeFlow?: { id: string; name: string } | null;
};

const API_BASE = getApiBase();
const FLOW_DRAFT_STORAGE_KEY = "ragflow:flow-canvas:draft:v1";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "jira", label: "Jira", icon: "J" },
  { id: "manual", label: "Manual", icon: "M" },
  { id: "files", label: "Arquivos", icon: "F" },
];

const FLOW_PROVIDER_VARIANTS: Record<string, string> = {
  gpt4o: "openai",
  "gpt4o-mini": "openai",
  gpt41: "openai",
  "gemini-flash": "gemini",
  "gemini-pro": "gemini",
  ollama: "ollama",
  ollm: "ollm",
  mock: "mock",
};

function readRunDefaultsFromFlow(): { provider: string; flowName: string } {
  if (typeof window === "undefined") {
    return { provider: "", flowName: "" };
  }
  try {
    const raw = window.localStorage.getItem(FLOW_DRAFT_STORAGE_KEY);
    if (!raw) {
      return { provider: "", flowName: "" };
    }
    const parsed = JSON.parse(raw) as FlowCanvasDraft;
    const providerNode = parsed.nodes?.find((node) => node.id === "provider");
    const providerVariant = String(providerNode?.selectedVariant || "").trim().toLowerCase();
    return {
      provider: FLOW_PROVIDER_VARIANTS[providerVariant] || "",
      flowName: String(parsed.activeFlow?.name || "").trim(),
    };
  } catch {
    return { provider: "", flowName: "" };
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="rp__conf-wrap">
      <div className="rp__conf-label">Confidence</div>
      <div className="rp__conf-track">
        <div className="rp__conf-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="rp__conf-pct" style={{ color }}>{pct}%</div>
    </div>
  );
}

function ClassBanner({ cls }: { cls: DecisionResult["classification"] }) {
  const map: Record<string, { label: string; mod: string }> = {
    bug: { label: "Bug confirmado", mod: "rp__banner--bug" },
    not_bug: { label: "Não é bug", mod: "rp__banner--ok" },
    needs_review: { label: "Revisão necessária", mod: "rp__banner--warn" },
  };
  const { label, mod } = map[cls] ?? { label: cls, mod: "" };
  return <div className={`rp__banner ${mod}`}>{label}</div>;
}

function usePromptCatalog() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/prompts`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as PromptInfo[];
        if (!cancelled) setPrompts(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar prompts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { prompts, loading, error };
}

function ProviderPromptRow({
  provider,
  setProvider,
  promptName,
  setPromptName,
  prompts,
  promptMode,
  promptLabel,
  flowDefaultProvider,
}: {
  provider: string;
  setProvider: (value: string) => void;
  promptName: string;
  setPromptName: (value: string) => void;
  prompts: PromptInfo[];
  promptMode: "decision" | "text";
  promptLabel: string;
  flowDefaultProvider: string;
}) {
  const options = useMemo(() => prompts.filter((item) => item.mode === promptMode), [prompts, promptMode]);
  const selected = options.find((item) => item.name === promptName) ?? null;

  return (
    <>
      <div className="rp__row rp__row--2">
        <label className="rp__field">
          <span className="rp__label">Provider</span>
          <select className="rp__select" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">{flowDefaultProvider ? `Default do flow (${flowDefaultProvider})` : "Default (settings)"}</option>
            <option value="mock">mock</option>
            <option value="ollama">ollama</option>
            <option value="ollm">ollm</option>
            <option value="openai">openai</option>
            <option value="gemini">gemini</option>
          </select>
        </label>
        <label className="rp__field">
          <span className="rp__label">{promptLabel}</span>
          <select className="rp__select" value={promptName} onChange={(e) => setPromptName(e.target.value)}>
            <option value="">Default do fluxo</option>
            {options.map((prompt) => (
              <option key={prompt.name} value={prompt.name}>{prompt.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="rp__prompt-help">
        {selected
          ? `${selected.name}: ${selected.description || "Prompt do catálogo."}`
          : `Modo atual usa prompts do tipo ${promptMode}. Se vazio, o backend usa o prompt default.`}
      </div>
    </>
  );
}

function IssueResultPanel({ result }: { result: DecisionResult }) {
  const [showRationale, setShowRationale] = useState(false);
  return (
    <div className="rp__result">
      <ClassBanner cls={result.classification} />
      <ConfidenceBar value={result.confidence} />
      <div className="rp__chips">
        <span className={`rp__chip ${result.is_complete ? "rp__chip--ok" : "rp__chip--warn"}`}>{result.is_complete ? "Completa" : "Incompleta"}</span>
        <span className={`rp__chip ${result.ready_for_dev ? "rp__chip--ok" : "rp__chip--warn"}`}>{result.ready_for_dev ? "Pronta p/ dev" : "Não pronta p/ dev"}</span>
        {result.requires_human_review && <span className="rp__chip rp__chip--danger">Revisão humana</span>}
        {result.financial_impact_detected && <span className="rp__chip rp__chip--danger">Impacto financeiro</span>}
        <span className="rp__chip rp__chip--neutral">{result.provider} · {result.model}</span>
      </div>
      <div className="rp__section">
        <button className="rp__toggle" onClick={() => setShowRationale((v) => !v)} type="button">
          <span>{showRationale ? "▾" : "▸"} Rationale</span>
        </button>
        {showRationale && <p className="rp__rationale">{result.rationale || "—"}</p>}
      </div>
      {result.missing_items.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title rp__section-title--warn">Itens ausentes</div>
          <ul className="rp__list">{result.missing_items.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      {result.ready_for_dev_criteria_met.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title rp__section-title--ok">Checklist atendido</div>
          <ul className="rp__list">{result.ready_for_dev_criteria_met.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      {result.ready_for_dev_blockers.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title rp__section-title--warn">Bloqueios para dev</div>
          <ul className="rp__list">{result.ready_for_dev_blockers.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      {result.contradictions.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title rp__section-title--danger">Contradições</div>
          <ul className="rp__list">{result.contradictions.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      {result.next_action && (
        <div className="rp__section">
          <div className="rp__section-title">Próxima ação</div>
          <p className="rp__rationale">{result.next_action}</p>
        </div>
      )}
    </div>
  );
}

function ArticleResultPanel({ result }: { result: ArticlePromptUploadResult }) {
  return (
    <div className="rp__result">
      <div className="rp__banner rp__banner--article">Artigo analisado</div>
      <div className="rp__preview-card">
        <div className="rp__preview-summary">{result.title}</div>
        <div className="rp__preview-meta">
          <span className="rp__chip rp__chip--neutral">{result.prompt_execution.provider}</span>
          <span className="rp__chip rp__chip--neutral">{result.prompt_execution.model}</span>
          <span className="rp__chip rp__chip--ok">{result.prompt_execution.prompt_name}</span>
        </div>
      </div>
      <pre className="rp__article-output">{result.prompt_execution.output_text}</pre>
      {result.article_search.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title">Contexto recuperado</div>
          <ul className="rp__list">
            {result.article_search.map((hit) => <li key={hit.chunk_id}><strong>{hit.title}</strong> · {hit.content.slice(0, 180)}{hit.content.length > 180 ? "…" : ""}</li>)}
          </ul>
        </div>
      )}
      {result.result_id && <Link href={`/results/${encodeURIComponent(result.result_id)}`} className="rp__result-link">Abrir resultado detalhado</Link>}
    </div>
  );
}

function JiraTab({ prompts }: { prompts: PromptInfo[] }) {
  const [issueKey, setIssueKey] = useState("");
  const [preview, setPreview] = useState<IssuePreview | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [promptName, setPromptName] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [flowDefaults, setFlowDefaults] = useState<{ provider: string; flowName: string }>({ provider: "", flowName: "" });

  useEffect(() => {
    const defaults = readRunDefaultsFromFlow();
    setFlowDefaults(defaults);
    if (!provider && defaults.provider) {
      setProvider(defaults.provider);
    }
  }, [provider]);

  async function handleFetch() {
    const key = issueKey.trim().toUpperCase();
    if (!key) return;
    setFetching(true); setFetchErr(null); setPreview(null); setResult(null);
    try {
      const response = await fetch(`${API_BASE}/jira/fetch/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ download_attachments: false }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPreview(data.issue as IssuePreview);
    } catch (err) {
      setFetchErr(err instanceof Error ? err.message : "Erro ao buscar issue");
    } finally {
      setFetching(false);
    }
  }

  async function handleRun() {
    const key = issueKey.trim().toUpperCase();
    if (!key) return;
    setRunning(true); setRunErr(null); setResult(null);
    try {
      const body: Record<string, unknown> = { download_attachments: false };
      if (provider) body.provider = provider;
      if (promptName) body.prompt_name = promptName;
      const response = await fetch(`${API_BASE}/jira/validate/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      setResult(await response.json() as DecisionResult);
    } catch (err) {
      setRunErr(err instanceof Error ? err.message : "Erro ao executar");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rp__tab-body">
      <div className="rp__mode-callout">
        <div className="rp__mode-title">Modo atual: validação de issue</div>
        <div className="rp__mode-copy">Busca no Jira e usa um prompt de decisão selecionável.</div>
      </div>
      <div className="rp__row rp__row--fetch">
        <label className="rp__field rp__field--grow">
          <span className="rp__label">Issue Key</span>
          <input className="rp__input rp__input--mono" placeholder="ex: PAY-1421" value={issueKey} onChange={(e) => setIssueKey(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && handleFetch()} />
        </label>
        <button className="btn-sm rp__btn-fetch" disabled={!issueKey.trim() || fetching} onClick={handleFetch} type="button">{fetching ? "Buscando…" : "Buscar no Jira"}</button>
      </div>
      {fetchErr && <div className="rp__error">{fetchErr}</div>}
      {preview && (
        <div className="rp__preview-card">
          <div className="rp__preview-key">{preview.issue_key}</div>
          <div className="rp__preview-summary">{preview.summary}</div>
          <div className="rp__preview-meta">
            {preview.issue_type && <span className="rp__chip rp__chip--neutral">{preview.issue_type}</span>}
            {preview.priority && <span className="rp__chip rp__chip--neutral">{preview.priority}</span>}
            {preview.status && <span className="rp__chip rp__chip--neutral">{preview.status}</span>}
          </div>
        </div>
      )}
      <ProviderPromptRow provider={provider} setProvider={setProvider} promptName={promptName} setPromptName={setPromptName} prompts={prompts} promptMode="decision" promptLabel="Prompt de decisão" flowDefaultProvider={flowDefaults.provider} />
      <button className="btn-sm btn-sm--run rp__btn-run" disabled={!issueKey.trim() || running} onClick={handleRun} type="button">{running ? "Processando…" : "Validar issue"}</button>
      {runErr && <div className="rp__error">{runErr}</div>}
      {result && <IssueResultPanel result={result} />}
    </div>
  );
}

function ManualTab({ prompts }: { prompts: PromptInfo[] }) {
  const [issueKey, setIssueKey] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState("Bug");
  const [priority, setPriority] = useState("");
  const [provider, setProvider] = useState("");
  const [promptName, setPromptName] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [flowDefaults, setFlowDefaults] = useState<{ provider: string; flowName: string }>({ provider: "", flowName: "" });

  useEffect(() => {
    const defaults = readRunDefaultsFromFlow();
    setFlowDefaults(defaults);
    if (!provider && defaults.provider) {
      setProvider(defaults.provider);
    }
  }, [provider]);

  async function handleRun() {
    if (!issueKey.trim() || !summary.trim()) return;
    setRunning(true); setRunErr(null); setResult(null);
    try {
      const body: Record<string, unknown> = {
        issue: {
          issue_key: issueKey.trim().toUpperCase(),
          summary: summary.trim(),
          description: description.trim(),
          issue_type: issueType,
          priority: priority || null,
        },
      };
      if (provider) body.provider = provider;
      if (promptName) body.prompt_name = promptName;
      const response = await fetch(`${API_BASE}/validate/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      setResult(await response.json() as DecisionResult);
    } catch (err) {
      setRunErr(err instanceof Error ? err.message : "Erro ao executar");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rp__tab-body">
      <div className="rp__mode-callout">
        <div className="rp__mode-title">Modo atual: issue manual</div>
        <div className="rp__mode-copy">Útil para testar prompts de decisão sem depender do Jira.</div>
      </div>
      <div className="rp__row rp__row--2">
        <label className="rp__field">
          <span className="rp__label">Issue Key <span className="rp__required">*</span></span>
          <input className="rp__input rp__input--mono" placeholder="PAY-9999" value={issueKey} onChange={(e) => setIssueKey(e.target.value.toUpperCase())} />
        </label>
        <label className="rp__field">
          <span className="rp__label">Issue Type</span>
          <select className="rp__select" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
            <option value="Bug">Bug</option><option value="Story">Story</option><option value="Task">Task</option><option value="Improvement">Improvement</option><option value="Epic">Epic</option>
          </select>
        </label>
      </div>
      <label className="rp__field"><span className="rp__label">Summary <span className="rp__required">*</span></span><input className="rp__input" placeholder="Resumo da issue" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      <label className="rp__field"><span className="rp__label">Description</span><textarea className="rp__textarea" rows={5} placeholder="Descrição completa" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="rp__row rp__row--2">
        <label className="rp__field">
          <span className="rp__label">Priority</span>
          <select className="rp__select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">—</option><option value="Critical">Critical</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
          </select>
        </label>
        <div />
      </div>
      <ProviderPromptRow provider={provider} setProvider={setProvider} promptName={promptName} setPromptName={setPromptName} prompts={prompts} promptMode="decision" promptLabel="Prompt de decisão" flowDefaultProvider={flowDefaults.provider} />
      <button className="btn-sm btn-sm--run rp__btn-run" disabled={!issueKey.trim() || !summary.trim() || running} onClick={handleRun} type="button">{running ? "Processando…" : "Validar issue"}</button>
      {runErr && <div className="rp__error">{runErr}</div>}
      {result && <IssueResultPanel result={result} />}
    </div>
  );
}

function FilesTab({ prompts }: { prompts: PromptInfo[] }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileMode, setFileMode] = useState<FileMode>("issue");
  const [files, setFiles] = useState<File[]>([]);
  const [issueKey, setIssueKey] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState("Bug");
  const [priority, setPriority] = useState("");
  const [provider, setProvider] = useState("");
  const [promptName, setPromptName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [issueResult, setIssueResult] = useState<DecisionResult | null>(null);
  const [articleResult, setArticleResult] = useState<ArticlePromptUploadResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);
  const [flowDefaults, setFlowDefaults] = useState<{ provider: string; flowName: string }>({ provider: "", flowName: "" });

  useEffect(() => {
    const defaults = readRunDefaultsFromFlow();
    setFlowDefaults(defaults);
    if (!provider && defaults.provider) {
      setProvider(defaults.provider);
    }
  }, [provider]);

  function addFiles(list: File[]) {
    setFiles((prev) => {
      const existing = new Set(prev.map((file) => file.name + file.size));
      return [...prev, ...list.filter((file) => !existing.has(file.name + file.size))];
    });
  }

  async function handleRun() {
    if (files.length === 0) return;
    setRunning(true); setRunErr(null); setIssueResult(null); setArticleResult(null);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));

      if (fileMode === "issue") {
        if (issueKey.trim()) form.append("issue_key", issueKey.trim().toUpperCase());
        if (summary.trim()) form.append("summary", summary.trim());
        if (description.trim()) form.append("description", description.trim());
        form.append("issue_type", issueType);
        if (priority) form.append("priority", priority);
        if (provider) form.append("provider", provider);
        if (promptName) form.append("prompt_name", promptName);
        const response = await fetch(`${API_BASE}/validate/upload`, { method: "POST", body: form });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        setIssueResult(await response.json() as DecisionResult);
      } else {
        if (summary.trim()) form.append("title", summary.trim());
        if (provider) form.append("provider", provider);
        if (promptName) form.append("prompt_name", promptName);
        if (searchQuery.trim()) form.append("search_query", searchQuery.trim());
        const response = await fetch(`${API_BASE}/articles/analyze-upload`, { method: "POST", body: form });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        setArticleResult(await response.json() as ArticlePromptUploadResult);
      }
    } catch (err) {
      setRunErr(err instanceof Error ? err.message : "Erro ao executar");
    } finally {
      setRunning(false);
    }
  }

  const fmtSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

  return (
    <div className="rp__tab-body">
      <div className="rp__mode-switch">
        <button type="button" className={`rp__mode-btn${fileMode === "issue" ? " rp__mode-btn--active" : ""}`} onClick={() => setFileMode("issue")}>
          <strong>Issue com anexos</strong>
          <span>Triagem com prompt de decisão.</span>
        </button>
        <button type="button" className={`rp__mode-btn${fileMode === "article" ? " rp__mode-btn--active" : ""}`} onClick={() => setFileMode("article")}>
          <strong>Artigo</strong>
          <span>Resumo e análise com prompt textual.</span>
        </button>
      </div>

      <div className="rp__mode-callout">
        <div className="rp__mode-title">{fileMode === "issue" ? "Arquivos serão tratados como evidência de issue" : "Arquivos serão tratados como artigo"}</div>
        <div className="rp__mode-copy">{fileMode === "issue" ? "Escolha um prompt de decisão para validar o pacote como ocorrência." : "Escolha um prompt textual para resumir ou analisar o conteúdo extraído."}</div>
      </div>

      <div
        className={`rp__dropzone${files.length ? " rp__dropzone--has-files" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("rp__dropzone--drag"); }}
        onDragLeave={(e) => e.currentTarget.classList.remove("rp__dropzone--drag")}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("rp__dropzone--drag"); addFiles(Array.from(e.dataTransfer.files)); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        {files.length === 0 ? (
          <>
            <div className="rp__dropzone-icon">📂</div>
            <div className="rp__dropzone-text">Clique ou arraste arquivos aqui</div>
            <div className="rp__dropzone-hint">.txt · .csv · .xlsx · .pdf · qualquer formato suportado</div>
          </>
        ) : <div className="rp__dropzone-add">+ Adicionar mais arquivos</div>}
      </div>

      {files.length > 0 && (
        <div className="rp__file-list">
          <div className="rp__file-list-header">
            <span>{files.length} arquivo{files.length !== 1 ? "s" : ""} selecionado{files.length !== 1 ? "s" : ""}</span>
            <button type="button" className="rp__file-clear" onClick={() => setFiles([])}>Limpar todos</button>
          </div>
          {files.map((file, index) => (
            <div key={index} className="rp__file-row">
              <span className="rp__file-name" title={file.name}>{file.name}</span>
              <span className="rp__file-size">{fmtSize(file.size)}</span>
              <button type="button" className="rp__file-remove" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>×</button>
            </div>
          ))}
        </div>
      )}

      {fileMode === "issue" ? (
        <>
          <div className="rp__row rp__row--2">
            <label className="rp__field">
              <span className="rp__label">Issue Key <span className="rp__optional">(opcional)</span></span>
              <input className="rp__input rp__input--mono" placeholder="ex: PAY-1421 — gerado automaticamente se vazio" value={issueKey} onChange={(e) => setIssueKey(e.target.value.toUpperCase())} />
            </label>
            <label className="rp__field">
              <span className="rp__label">Issue Type</span>
              <select className="rp__select" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
                <option value="Bug">Bug</option><option value="Story">Story</option><option value="Task">Task</option><option value="Improvement">Improvement</option><option value="Epic">Epic</option>
              </select>
            </label>
          </div>
          <label className="rp__field"><span className="rp__label">Summary <span className="rp__optional">(opcional)</span></span><input className="rp__input" placeholder="Título — derivado dos nomes dos arquivos se vazio" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
          <label className="rp__field"><span className="rp__label">Description</span><textarea className="rp__textarea" rows={4} placeholder="Descrição opcional" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <div className="rp__row rp__row--2">
            <label className="rp__field">
              <span className="rp__label">Priority</span>
              <select className="rp__select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">—</option><option value="Critical">Critical</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
              </select>
            </label>
            <div />
          </div>
          <ProviderPromptRow provider={provider} setProvider={setProvider} promptName={promptName} setPromptName={setPromptName} prompts={prompts} promptMode="decision" promptLabel="Prompt de decisão" flowDefaultProvider={flowDefaults.provider} />
        </>
      ) : (
        <>
          <label className="rp__field"><span className="rp__label">Título do artigo <span className="rp__optional">(opcional)</span></span><input className="rp__input" placeholder="Se vazio, usa o nome do arquivo" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
          <label className="rp__field"><span className="rp__label">Busca adicional no corpus <span className="rp__optional">(opcional)</span></span><input className="rp__input" placeholder="Query para recuperar contexto adicional" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></label>
          <label className="rp__field"><span className="rp__label">Notas</span><textarea className="rp__textarea" rows={4} placeholder="Contexto opcional para a análise" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <ProviderPromptRow provider={provider} setProvider={setProvider} promptName={promptName} setPromptName={setPromptName} prompts={prompts} promptMode="text" promptLabel="Prompt de análise" flowDefaultProvider={flowDefaults.provider} />
        </>
      )}

      <button className="btn-sm btn-sm--run rp__btn-run" disabled={files.length === 0 || running} onClick={handleRun} type="button">{running ? "Processando…" : fileMode === "issue" ? "Validar arquivos como issue" : "Analisar artigo"}</button>
      {runErr && <div className="rp__error">{runErr}</div>}
      {issueResult && <IssueResultPanel result={issueResult} />}
      {articleResult && <ArticleResultPanel result={articleResult} />}
    </div>
  );
}

export function RunPanel() {
  const [tab, setTab] = useState<Tab>("jira");
  const { prompts, loading, error } = usePromptCatalog();

  return (
    <div className="rp">
      <div className="rp__tabs">
        {TABS.map((tabItem) => (
          <button key={tabItem.id} className={`rp__tab ${tab === tabItem.id ? "rp__tab--active" : ""}`} onClick={() => setTab(tabItem.id)} type="button">
            <span className="rp__tab-icon">{tabItem.icon}</span>
            <span>{tabItem.label}</span>
          </button>
        ))}
      </div>
      <div className="rp__tab-desc">
        {tab === "jira" && "Fluxo orientado a issue do Jira, com prompt de decisão selecionável."}
        {tab === "manual" && "Teste manual de issue com o mesmo pipeline de validação."}
        {tab === "files" && "Escolha explicitamente se os arquivos entram como issue com anexos ou como artigo para análise textual."}
      </div>
      {loading && <div className="rp__tab-body"><div className="rp__info-box">Carregando catálogo de prompts…</div></div>}
      {!loading && error && <div className="rp__tab-body"><div className="rp__error">{error}</div></div>}
      {!loading && !error && (
        <>
          {tab === "jira" && <JiraTab prompts={prompts} />}
          {tab === "manual" && <ManualTab prompts={prompts} />}
          {tab === "files" && <FilesTab prompts={prompts} />}
        </>
      )}
    </div>
  );
}
