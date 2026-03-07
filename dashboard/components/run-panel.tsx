"use client";

import { useRef, useState } from "react";

// ── Types mirroring backend models ────────────────────────────────────────────

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
  missing_items: string[];
  evidence_used: string[];
  contradictions: string[];
  financial_impact_detected: boolean;
  confidence: number;
  requires_human_review: boolean;
  provider: string;
  model: string;
  rationale: string;
}

type Tab = "jira" | "manual" | "files";

const API_BASE =
  (typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000")
    : "http://localhost:8000") + "/api/v1";

// ── Small helpers ─────────────────────────────────────────────────────────────

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
    bug:           { label: "🐛 Bug confirmado",       mod: "rp__banner--bug"    },
    not_bug:       { label: "✅ Não é bug",            mod: "rp__banner--ok"     },
    needs_review:  { label: "⚠️ Revisão necessária",   mod: "rp__banner--warn"   },
  };
  const { label, mod } = map[cls] ?? { label: cls, mod: "" };
  return <div className={`rp__banner ${mod}`}>{label}</div>;
}

function ResultPanel({ result }: { result: DecisionResult }) {
  const [showRationale, setShowRationale] = useState(false);
  return (
    <div className="rp__result">
      <ClassBanner cls={result.classification} />
      <ConfidenceBar value={result.confidence} />

      {/* chips */}
      <div className="rp__chips">
        <span className={`rp__chip ${result.is_complete ? "rp__chip--ok" : "rp__chip--warn"}`}>
          {result.is_complete ? "Completa" : "Incompleta"}
        </span>
        <span className={`rp__chip ${result.ready_for_dev ? "rp__chip--ok" : "rp__chip--warn"}`}>
          {result.ready_for_dev ? "Pronta p/ dev" : "Não pronta p/ dev"}
        </span>
        {result.requires_human_review && (
          <span className="rp__chip rp__chip--danger">Revisão humana</span>
        )}
        {result.financial_impact_detected && (
          <span className="rp__chip rp__chip--danger">Impacto financeiro</span>
        )}
        <span className="rp__chip rp__chip--neutral">{result.provider} · {result.model}</span>
      </div>

      {/* rationale */}
      <div className="rp__section">
        <button
          className="rp__toggle"
          onClick={() => setShowRationale((v) => !v)}
          type="button"
        >
          <span>{showRationale ? "▾" : "▸"} Rationale</span>
        </button>
        {showRationale && (
          <p className="rp__rationale">{result.rationale || "—"}</p>
        )}
      </div>

      {/* lists */}
      {result.missing_items.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title rp__section-title--warn">Itens ausentes</div>
          <ul className="rp__list">
            {result.missing_items.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
      {result.contradictions.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title rp__section-title--danger">Contradições</div>
          <ul className="rp__list">
            {result.contradictions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {result.evidence_used.length > 0 && (
        <div className="rp__section">
          <div className="rp__section-title">Evidências usadas</div>
          <ul className="rp__list rp__list--muted">
            {result.evidence_used.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Provider / prompt selects (shared across tabs) ────────────────────────────

function ProviderRow({
  provider, setProvider,
  promptName, setPromptName,
}: {
  provider: string; setProvider: (v: string) => void;
  promptName: string; setPromptName: (v: string) => void;
}) {
  return (
    <div className="rp__row rp__row--2">
      <label className="rp__field">
        <span className="rp__label">Provider</span>
        <select className="rp__select" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">Default (settings)</option>
          <option value="mock">mock</option>
          <option value="openai">openai</option>
          <option value="gemini">gemini</option>
        </select>
      </label>
      <label className="rp__field">
        <span className="rp__label">Prompt name</span>
        <input
          className="rp__input"
          placeholder="default (deixe vazio)"
          value={promptName}
          onChange={(e) => setPromptName(e.target.value)}
        />
      </label>
    </div>
  );
}

// ── Jira Tab ──────────────────────────────────────────────────────────────────

function JiraTab() {
  const [issueKey, setIssueKey]     = useState("");
  const [preview, setPreview]       = useState<IssuePreview | null>(null);
  const [fetching, setFetching]     = useState(false);
  const [fetchErr, setFetchErr]     = useState<string | null>(null);
  const [provider, setProvider]     = useState("");
  const [promptName, setPromptName] = useState("");
  const [running, setRunning]       = useState(false);
  const [result, setResult]         = useState<DecisionResult | null>(null);
  const [runErr, setRunErr]         = useState<string | null>(null);

  async function handleFetch() {
    const key = issueKey.trim().toUpperCase();
    if (!key) return;
    setFetching(true); setFetchErr(null); setPreview(null); setResult(null);
    try {
      const r = await fetch(`${API_BASE}/jira/fetch/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ download_attachments: false }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setPreview(data.issue as IssuePreview);
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : "Erro ao buscar issue");
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
      const r = await fetch(`${API_BASE}/jira/validate/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      setResult(await r.json());
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Erro ao executar");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rp__tab-body">
      <div className="rp__row rp__row--fetch">
        <label className="rp__field rp__field--grow">
          <span className="rp__label">Issue Key</span>
          <input
            className="rp__input rp__input--mono"
            placeholder="ex: PAY-1421"
            value={issueKey}
            onChange={(e) => setIssueKey(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
          />
        </label>
        <button
          className="btn-sm rp__btn-fetch"
          disabled={!issueKey.trim() || fetching}
          onClick={handleFetch}
          type="button"
        >
          {fetching ? "Buscando…" : "Buscar no Jira"}
        </button>
      </div>

      {fetchErr && <div className="rp__error">{fetchErr}</div>}

      {preview && (
        <div className="rp__preview-card">
          <div className="rp__preview-key">{preview.issue_key}</div>
          <div className="rp__preview-summary">{preview.summary}</div>
          <div className="rp__preview-meta">
            {preview.issue_type && <span className="rp__chip rp__chip--neutral">{preview.issue_type}</span>}
            {preview.priority   && <span className="rp__chip rp__chip--neutral">{preview.priority}</span>}
            {preview.status     && <span className="rp__chip rp__chip--neutral">{preview.status}</span>}
            {preview.attachments?.length > 0 && (
              <span className="rp__chip rp__chip--ok">{preview.attachments.length} anexo(s)</span>
            )}
          </div>
          {preview.description && (
            <p className="rp__preview-desc">{preview.description.slice(0, 300)}{preview.description.length > 300 ? "…" : ""}</p>
          )}
        </div>
      )}

      <ProviderRow provider={provider} setProvider={setProvider} promptName={promptName} setPromptName={setPromptName} />

      <button
        className="btn-sm btn-sm--run rp__btn-run"
        disabled={!issueKey.trim() || running}
        onClick={handleRun}
        type="button"
      >
        {running ? "Processando…" : "▶  Validar issue"}
      </button>

      {runErr && <div className="rp__error">{runErr}</div>}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

// ── Manual Tab ────────────────────────────────────────────────────────────────

function ManualTab() {
  const [issueKey,    setIssueKey]    = useState("");
  const [summary,     setSummary]     = useState("");
  const [description, setDescription] = useState("");
  const [issueType,   setIssueType]   = useState("Bug");
  const [priority,    setPriority]    = useState("");
  const [provider,    setProvider]    = useState("");
  const [promptName,  setPromptName]  = useState("");
  const [running,     setRunning]     = useState(false);
  const [result,      setResult]      = useState<DecisionResult | null>(null);
  const [runErr,      setRunErr]      = useState<string | null>(null);

  async function handleRun() {
    const key = issueKey.trim().toUpperCase();
    if (!key || !summary.trim()) return;
    setRunning(true); setRunErr(null); setResult(null);
    try {
      const body: Record<string, unknown> = {
        issue: {
          issue_key: key,
          summary: summary.trim(),
          description: description.trim(),
          issue_type: issueType,
          priority: priority || null,
        },
      };
      if (provider) body.provider = provider;
      if (promptName) body.prompt_name = promptName;
      const r = await fetch(`${API_BASE}/validate/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      setResult(await r.json());
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Erro ao executar");
    } finally {
      setRunning(false);
    }
  }

  const canRun = issueKey.trim() !== "" && summary.trim() !== "";

  return (
    <div className="rp__tab-body">
      <div className="rp__row rp__row--2">
        <label className="rp__field">
          <span className="rp__label">Issue Key <span className="rp__required">*</span></span>
          <input
            className="rp__input rp__input--mono"
            placeholder="PAY-9999"
            value={issueKey}
            onChange={(e) => setIssueKey(e.target.value.toUpperCase())}
          />
        </label>
        <label className="rp__field">
          <span className="rp__label">Issue Type</span>
          <select className="rp__select" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
            <option value="Bug">Bug</option>
            <option value="Story">Story</option>
            <option value="Task">Task</option>
            <option value="Improvement">Improvement</option>
            <option value="Epic">Epic</option>
          </select>
        </label>
      </div>

      <label className="rp__field">
        <span className="rp__label">Summary <span className="rp__required">*</span></span>
        <input
          className="rp__input"
          placeholder="Resumo da issue"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>

      <label className="rp__field">
        <span className="rp__label">Description</span>
        <textarea
          className="rp__textarea"
          rows={5}
          placeholder="Descrição completa, passos de reprodução, comportamento esperado/atual…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="rp__row rp__row--2">
        <label className="rp__field">
          <span className="rp__label">Priority</span>
          <select className="rp__select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">—</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </label>
        <div />
      </div>

      <ProviderRow provider={provider} setProvider={setProvider} promptName={promptName} setPromptName={setPromptName} />

      <button
        className="btn-sm btn-sm--run rp__btn-run"
        disabled={!canRun || running}
        onClick={handleRun}
        type="button"
      >
        {running ? "Processando…" : "▶  Validar issue"}
      </button>

      {runErr && <div className="rp__error">{runErr}</div>}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

// ── Files Tab ─────────────────────────────────────────────────────────────────

function FilesTab() {
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const [files,       setFiles]         = useState<File[]>([]);
  const [issueKey,    setIssueKey]       = useState("");
  const [summary,     setSummary]        = useState("");
  const [description, setDescription]   = useState("");
  const [issueType,   setIssueType]      = useState("Bug");
  const [priority,    setPriority]       = useState("");
  const [provider,    setProvider]       = useState("");
  const [promptName,  setPromptName]     = useState("");
  const [running,     setRunning]        = useState(false);
  const [result,      setResult]         = useState<DecisionResult | null>(null);
  const [runErr,      setRunErr]         = useState<string | null>(null);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const merged = [...prev];
      for (const f of picked) {
        if (!existing.has(f.name + f.size)) merged.push(f);
      }
      return merged;
    });
    // reset input so same file can be re-selected after removal
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleRun() {
    if (!files.length) return;
    setRunning(true); setRunErr(null); setResult(null);
    try {
      const fd = new FormData();
      if (issueKey.trim())  fd.append("issue_key",   issueKey.trim().toUpperCase());
      if (summary.trim())   fd.append("summary",     summary.trim());
      if (description.trim()) fd.append("description", description.trim());
      fd.append("issue_type", issueType);
      if (priority)   fd.append("priority",    priority);
      if (provider)   fd.append("provider",    provider);
      if (promptName) fd.append("prompt_name", promptName);
      for (const f of files) fd.append("files", f);

      const r = await fetch(`${API_BASE}/validate/upload`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      setResult(await r.json());
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : "Erro ao executar");
    } finally {
      setRunning(false);
    }
  }

  const canRun = files.length > 0;

  const fmtSize = (b: number) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <div className="rp__tab-body">
      {/* drop zone / file picker */}
      <div
        className={`rp__dropzone${files.length ? " rp__dropzone--has-files" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("rp__dropzone--drag"); }}
        onDragLeave={(e) => e.currentTarget.classList.remove("rp__dropzone--drag")}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("rp__dropzone--drag");
          const dropped = Array.from(e.dataTransfer.files);
          setFiles((prev) => {
            const existing = new Set(prev.map((f) => f.name + f.size));
            return [...prev, ...dropped.filter((f) => !existing.has(f.name + f.size))];
          });
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFilePick}
        />
        {files.length === 0 ? (
          <>
            <div className="rp__dropzone-icon">📂</div>
            <div className="rp__dropzone-text">
              Clique ou arraste arquivos aqui
            </div>
            <div className="rp__dropzone-hint">
              .txt · .csv · .xlsx · .pdf · qualquer formato suportado
            </div>
          </>
        ) : (
          <div className="rp__dropzone-add">+ Adicionar mais arquivos</div>
        )}
      </div>

      {/* file list */}
      {files.length > 0 && (
        <div className="rp__file-list">
          <div className="rp__file-list-header">
            <span>{files.length} arquivo{files.length !== 1 ? "s" : ""} selecionado{files.length !== 1 ? "s" : ""}</span>
            <button
              type="button"
              className="rp__file-clear"
              onClick={() => setFiles([])}
            >
              Limpar todos
            </button>
          </div>
          {files.map((f, i) => (
            <div key={i} className="rp__file-row">
              <span className="rp__file-name" title={f.name}>{f.name}</span>
              <span className="rp__file-size">{fmtSize(f.size)}</span>
              <button
                type="button"
                className="rp__file-remove"
                onClick={() => removeFile(i)}
                title="Remover"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rp__row rp__row--2">
        <label className="rp__field">
          <span className="rp__label">Issue Key <span className="rp__optional">(opcional)</span></span>
          <input
            className="rp__input rp__input--mono"
            placeholder="ex: PAY-1421 — gerado automaticamente se vazio"
            value={issueKey}
            onChange={(e) => setIssueKey(e.target.value.toUpperCase())}
          />
        </label>
        <label className="rp__field">
          <span className="rp__label">Issue Type</span>
          <select className="rp__select" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
            <option value="Bug">Bug</option>
            <option value="Story">Story</option>
            <option value="Task">Task</option>
            <option value="Improvement">Improvement</option>
            <option value="Epic">Epic</option>
          </select>
        </label>
      </div>

      <label className="rp__field">
        <span className="rp__label">Summary <span className="rp__optional">(opcional)</span></span>
        <input
          className="rp__input"
          placeholder="Título — derivado dos nomes dos arquivos se vazio"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </label>

      <label className="rp__field">
        <span className="rp__label">Description</span>
        <textarea
          className="rp__textarea"
          rows={4}
          placeholder="Descrição opcional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="rp__row rp__row--2">
        <label className="rp__field">
          <span className="rp__label">Priority</span>
          <select className="rp__select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">—</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </label>
        <div />
      </div>

      <ProviderRow provider={provider} setProvider={setProvider} promptName={promptName} setPromptName={setPromptName} />

      <button
        className="btn-sm btn-sm--run rp__btn-run"
        disabled={!canRun || running}
        onClick={handleRun}
        type="button"
      >
        {running ? "Processando…" : "▶  Processar arquivos"}
      </button>

      {runErr && <div className="rp__error">{runErr}</div>}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "jira",   label: "Jira",    icon: "J" },
  { id: "manual", label: "Manual",  icon: "M" },
  { id: "files",  label: "Arquivos", icon: "F" },
];

export function RunPanel() {
  const [tab, setTab] = useState<Tab>("jira");

  return (
    <div className="rp">
      {/* Tab bar */}
      <div className="rp__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`rp__tab ${tab === t.id ? "rp__tab--active" : ""}`}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <span className="rp__tab-icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab descriptions */}
      <div className="rp__tab-desc">
        {tab === "jira"   && "Busca uma issue diretamente no Jira e executa o pipeline completo."}
        {tab === "manual" && "Preencha os dados da issue manualmente para testar sem Jira."}
        {tab === "files"  && "Selecione um ou mais arquivos. Issue key e summary são opcionais — gerados automaticamente se vazios."}
      </div>

      {/* Tab content */}
      {tab === "jira"   && <JiraTab />}
      {tab === "manual" && <ManualTab />}
      {tab === "files"  && <FilesTab />}
    </div>
  );
}
