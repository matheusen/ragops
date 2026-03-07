"use client";

import { useRef, useMemo, useState } from "react";
import JSZip from "jszip";

import type { PromptTemplate } from "@/lib/dashboard-data";

// ── Pricing data (official March 2026, per 1 000 000 tokens) ──────────────────
interface ModelPricing {
  id: string;
  provider: string;
  label: string;
  inputPer1M: number;
  outputPer1M: number;
  notes?: string;
  sourceUrl: string;
}

const MODELS: ModelPricing[] = [
  // OpenAI — https://openai.com/api/pricing/
  { id: "gpt-4o",       provider: "OpenAI",  label: "GPT-4o",        inputPer1M: 2.50,  outputPer1M: 10.00, sourceUrl: "https://openai.com/api/pricing/" },
  { id: "gpt-4o-mini",  provider: "OpenAI",  label: "GPT-4o mini",   inputPer1M: 0.15,  outputPer1M: 0.60,  sourceUrl: "https://openai.com/api/pricing/" },
  { id: "gpt-4.1",      provider: "OpenAI",  label: "GPT-4.1",       inputPer1M: 2.00,  outputPer1M: 8.00,  sourceUrl: "https://openai.com/api/pricing/" },
  { id: "gpt-4.1-mini", provider: "OpenAI",  label: "GPT-4.1 mini",  inputPer1M: 0.40,  outputPer1M: 1.60,  sourceUrl: "https://openai.com/api/pricing/" },
  { id: "o3",           provider: "OpenAI",  label: "o3",             inputPer1M: 10.00, outputPer1M: 40.00, sourceUrl: "https://openai.com/api/pricing/" },
  { id: "o4-mini",      provider: "OpenAI",  label: "o4-mini",        inputPer1M: 1.10,  outputPer1M: 4.40,  sourceUrl: "https://openai.com/api/pricing/" },
  // Gemini — https://ai.google.dev/gemini-api/docs/pricing
  { id: "gemini-2.5-flash", provider: "Gemini", label: "Gemini 2.5 Flash", inputPer1M: 0.15, outputPer1M: 0.60,  notes: ">200k ctx: $0.30 / $2.50", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  { id: "gemini-2.5-pro",   provider: "Gemini", label: "Gemini 2.5 Pro",   inputPer1M: 1.25, outputPer1M: 10.00, notes: ">200k ctx: $2.50 / $15.00", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  { id: "gemini-2.0-flash", provider: "Gemini", label: "Gemini 2.0 Flash", inputPer1M: 0.10, outputPer1M: 0.40,  sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  { id: "gemini-1.5-pro",   provider: "Gemini", label: "Gemini 1.5 Pro",   inputPer1M: 1.25, outputPer1M: 5.00,  sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  // Ollama — local inference, no API cost
  { id: "llama3",   provider: "Ollama", label: "Llama 3 (local)",   inputPer1M: 0, outputPer1M: 0, notes: "Execução local — sem custo de API", sourceUrl: "https://ollama.com/library/llama3" },
  { id: "mistral",  provider: "Ollama", label: "Mistral (local)",   inputPer1M: 0, outputPer1M: 0, notes: "Execução local — sem custo de API", sourceUrl: "https://ollama.com/library/mistral" },
  { id: "qwen2.5",  provider: "Ollama", label: "Qwen 2.5 (local)", inputPer1M: 0, outputPer1M: 0, notes: "Execução local — sem custo de API", sourceUrl: "https://ollama.com/library/qwen2.5" },
];

const PROVIDER_COLOR: Record<string, string> = {
  OpenAI: "#10a37f",
  Gemini: "#4285f4",
  Ollama: "#e05d2a",
};

// ── Loaded file metadata ───────────────────────────────────────────────────────
interface LoadedFile {
  name: string;
  size: number; // bytes (uncompressed)
  fromZip?: string; // parent zip filename if extracted from zip
}

// ── Token estimation ───────────────────────────────────────────────────────────
function estimateTokens(text: string): number {
  // Standard approximation: 1 token ≈ 4 chars (for English/Portuguese mixed)
  return Math.ceil(text.length / 4);
}

// ── File helpers ───────────────────────────────────────────────────────────────
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    txt: "📄", md: "📝", json: "📋", csv: "📊", log: "🗒️",
    pdf: "📕", zip: "🗜️", xml: "📰", yaml: "⚙️", yml: "⚙️",
    py: "🐍", js: "🟨", ts: "🔷", html: "🌐", sql: "🗄️",
  };
  return map[ext] ?? "📁";
}

// ── File list display sub-component ───────────────────────────────────────────
function FileListPanel({
  files,
  loading,
  onClear,
}: {
  files: LoadedFile[];
  loading: boolean;
  onClear: () => void;
}) {
  if (!loading && files.length === 0) return null;
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  return (
    <div className="cs__file-list">
      {loading && (
        <div className="cs__file-loading">
          <span className="cs__spinner" aria-hidden="true" />
          Carregando arquivos…
        </div>
      )}
      {files.length > 0 && (
        <>
          <div className="cs__file-list-header">
            <span className="cs__file-list-count">
              {files.length} arquivo{files.length > 1 ? "s" : ""} carregado{files.length > 1 ? "s" : ""}
            </span>
            <span className="cs__file-total">{fmtSize(totalSize)} total</span>
            <button type="button" className="btn-sm btn-sm--danger" onClick={onClear}>
              Remover todos
            </button>
          </div>
          <ul className="cs__file-entries">
            {files.map((f, i) => (
              <li key={i} className="cs__file-entry">
                <span className="cs__file-icon" aria-hidden="true">{fileIcon(f.name)}</span>
                <span className="cs__file-name" title={f.name}>{f.name}</span>
                {f.fromZip && (
                  <span className="cs__file-zip-badge" title={`Extraído de ${f.fromZip}`}>
                    📦 {f.fromZip}
                  </span>
                )}
                <span className="cs__file-size">{fmtSize(f.size)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────────
function usd(n: number) {
  if (n === 0) return "—";
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  return `$${n.toFixed(n < 0.01 ? 6 : n < 1 ? 4 : 4)}`;
}
function brl(n: number, rate: number) {
  if (n === 0) return "—";
  const v = n * rate;
  return `R$\u202f${v.toFixed(v < 0.01 ? 6 : 4)}`;
}
function fmtTokens(n: number) {
  return n.toLocaleString("pt-BR");
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CostSimulator({ prompts = [] }: { prompts?: PromptTemplate[] }) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userPrompt, setUserPrompt]     = useState("");
  const [context, setContext]           = useState("");
  const [outputTokens, setOutputTokens] = useState(512);
  const [usdBrl, setUsdBrl]            = useState(5.85);
  const [filterProvider, setFilterProvider] = useState("All");

  // Per-field file tracking (content kept separate — NOT injected into textarea)
  const [sysFiles,     setSysFiles]     = useState<LoadedFile[]>([]);
  const [sysFileText,  setSysFileText]  = useState("");
  const [sysLoading,   setSysLoading]   = useState(false);
  const [userFiles,    setUserFiles]    = useState<LoadedFile[]>([]);
  const [userFileText, setUserFileText] = useState("");
  const [userLoading,  setUserLoading]  = useState(false);
  const [ctxFiles,     setCtxFiles]     = useState<LoadedFile[]>([]);
  const [ctxFileText,  setCtxFileText]  = useState("");
  const [ctxLoading,   setCtxLoading]   = useState(false);

  const sysFileRef  = useRef<HTMLInputElement>(null);
  const userFileRef = useRef<HTMLInputElement>(null);
  const ctxFileRef  = useRef<HTMLInputElement>(null);

  async function readFilesWithMeta(
    files: FileList | null,
    setLoading: (v: boolean) => void,
    setFileText: (v: string) => void,
    setMeta: (v: LoadedFile[]) => void,
    existingFileText = "",
    existingMeta: LoadedFile[] = [],
  ) {
    if (!files || files.length === 0) return;
    setLoading(true);
    const allMeta: LoadedFile[] = [];
    const allParts: string[] = [];
    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        try {
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const entries = Object.values(zip.files).filter((f) => !f.dir);
          for (const entry of entries) {
            const text = await entry.async("text");
            allParts.push(`--- ${entry.name} (de ${file.name}) ---\n${text}`);
            allMeta.push({ name: entry.name, size: new TextEncoder().encode(text).length, fromZip: file.name });
          }
        } catch {
          allMeta.push({ name: file.name, size: file.size });
        }
      } else {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(String(e.target?.result ?? ""));
          reader.onerror = reject;
          reader.readAsText(file, "utf-8");
        });
        allParts.push(text);
        allMeta.push({ name: file.name, size: file.size });
      }
    }
    setLoading(false);
    const joined = allParts.join("\n\n");
    setFileText(existingFileText ? existingFileText + "\n\n" + joined : joined);
    setMeta([...existingMeta, ...allMeta]);
  }

  function loadFromLibrary(fileName: string) {
    const p = prompts.find((x) => x.fileName === fileName);
    if (!p) return;
    setSystemPrompt(p.systemPrompt);
    setUserPrompt(p.userPromptTemplate);
  }

  const inputTokens = useMemo(
    () =>
      estimateTokens(systemPrompt + sysFileText) +
      estimateTokens(userPrompt + userFileText) +
      estimateTokens(context + ctxFileText),
    [systemPrompt, sysFileText, userPrompt, userFileText, context, ctxFileText],
  );

  const rows = useMemo(() => {
    return MODELS
      .filter((m) => filterProvider === "All" || m.provider === filterProvider)
      .map((m) => {
        const inCost  = (inputTokens  / 1_000_000) * m.inputPer1M;
        const outCost = (outputTokens / 1_000_000) * m.outputPer1M;
        const total   = inCost + outCost;
        return { ...m, inCost, outCost, total };
      })
      .sort((a, b) => a.total - b.total);
  }, [inputTokens, outputTokens, filterProvider]);

  const cheapestPaid = rows.find((r) => r.total > 0);

  return (
    <div className="cs">
      {/* ── Library import ── */}
      {prompts.length > 0 && (
        <div className="cs__import-bar">
          <span className="cs__import-label">Importar prompt salvo:</span>
          <select
            className="cs__select"
            defaultValue=""
            onChange={(e) => { if (e.target.value) loadFromLibrary(e.target.value); e.target.value = ""; }}
          >
            <option value="" disabled>— selecione um prompt —</option>
            {prompts.map((p) => (
              <option key={p.fileName} value={p.fileName}>
                {p.name} ({p.mode})
              </option>
            ))}
          </select>
          <span className="cs__import-hint">Preencherá System prompt + User prompt</span>
        </div>
      )}

      {/* ── Inputs ── */}
      <div className="cs__inputs">
        <div className="cs__field">
          <div className="cs__field-head">
            <label className="cs__label">
              System prompt
              <span className="cs__char-count">{(systemPrompt + sysFileText).length} chars · {fmtTokens(estimateTokens(systemPrompt + sysFileText))} tokens</span>
            </label>
            <div className="cs__field-actions">
              <button type="button" className="btn-sm" onClick={() => sysFileRef.current?.click()}>Importar arquivos</button>
              {systemPrompt && <button type="button" className="btn-sm btn-sm--danger" onClick={() => setSystemPrompt("")}>Limpar texto</button>}
              <input ref={sysFileRef} type="file" accept="*" multiple className="cs__file-input" onChange={(e) => { readFilesWithMeta(e.target.files, setSysLoading, setSysFileText, setSysFiles, sysFileText, sysFiles); e.target.value = ""; }} />
            </div>
          </div>
          <textarea
            className="cs__textarea"
            rows={4}
            placeholder="You are a Jira triage assistant..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <FileListPanel files={sysFiles} loading={sysLoading} onClear={() => { setSysFileText(""); setSysFiles([]); }} />
        </div>

        <div className="cs__field">
          <div className="cs__field-head">
            <label className="cs__label">
              User prompt / query
              <span className="cs__char-count">{(userPrompt + userFileText).length} chars · {fmtTokens(estimateTokens(userPrompt + userFileText))} tokens</span>
            </label>
            <div className="cs__field-actions">
              <button type="button" className="btn-sm" onClick={() => userFileRef.current?.click()}>Importar arquivos</button>
              {userPrompt && <button type="button" className="btn-sm btn-sm--danger" onClick={() => setUserPrompt("")}>Limpar texto</button>}
              <input ref={userFileRef} type="file" accept="*" multiple className="cs__file-input" onChange={(e) => { readFilesWithMeta(e.target.files, setUserLoading, setUserFileText, setUserFiles, userFileText, userFiles); e.target.value = ""; }} />
            </div>
          </div>
          <textarea
            className="cs__textarea"
            rows={4}
            placeholder="Analyze issue PAY-1421..."
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
          />
          <FileListPanel files={userFiles} loading={userLoading} onClear={() => { setUserFileText(""); setUserFiles([]); }} />
        </div>

        <div className="cs__field">
          <div className="cs__field-head">
            <label className="cs__label">
              Contexto / anexos (texto dos arquivos, logs, CSV…)
              <span className="cs__char-count">{(context + ctxFileText).length} chars · {fmtTokens(estimateTokens(context + ctxFileText))} tokens</span>
            </label>
            <div className="cs__field-actions">
              <button type="button" className="btn-sm" onClick={() => ctxFileRef.current?.click()}>Adicionar arquivos</button>
              {context && <button type="button" className="btn-sm btn-sm--danger" onClick={() => setContext("")}>Limpar texto</button>}
              <input ref={ctxFileRef} type="file" accept="*" multiple className="cs__file-input" onChange={(e) => { readFilesWithMeta(e.target.files, setCtxLoading, setCtxFileText, setCtxFiles, ctxFileText, ctxFiles); e.target.value = ""; }} />
            </div>
          </div>
          <textarea
            className="cs__textarea cs__textarea--lg"
            rows={6}
            placeholder="Cole aqui o conteúdo dos anexos ou documentos de contexto..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
          <FileListPanel files={ctxFiles} loading={ctxLoading} onClear={() => { setCtxFileText(""); setCtxFiles([]); }} />
        </div>

        <div className="cs__controls">
          <div className="cs__control-group">
            <label className="cs__label">Output esperado (tokens)</label>
            <div className="cs__slider-row">
              <input
                type="range"
                min={64}
                max={8192}
                step={64}
                value={outputTokens}
                onChange={(e) => setOutputTokens(Number(e.target.value))}
                className="cs__slider"
              />
              <input
                type="number"
                min={1}
                max={32768}
                value={outputTokens}
                onChange={(e) => setOutputTokens(Math.max(1, Number(e.target.value)))}
                className="cs__number"
              />
            </div>
          </div>

          <div className="cs__control-group">
            <label className="cs__label">Cotação USD → BRL</label>
            <input
              type="number"
              step={0.01}
              min={1}
              value={usdBrl}
              onChange={(e) => setUsdBrl(Number(e.target.value))}
              className="cs__number"
            />
          </div>

          <div className="cs__control-group">
            <label className="cs__label">Filtrar provider</label>
            <select
              className="cs__select"
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
            >
              <option value="All">Todos</option>
              <option value="OpenAI">OpenAI</option>
              <option value="Gemini">Gemini</option>
              <option value="Ollama">Ollama</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div className="cs__summary">
        <div className="cs__summary-item">
          <span className="cs__summary-label">Input tokens</span>
          <span className="cs__summary-value">{fmtTokens(inputTokens)}</span>
        </div>
        <div className="cs__summary-sep" />
        <div className="cs__summary-item">
          <span className="cs__summary-label">Output tokens</span>
          <span className="cs__summary-value">{fmtTokens(outputTokens)}</span>
        </div>
        <div className="cs__summary-sep" />
        <div className="cs__summary-item">
          <span className="cs__summary-label">Total tokens</span>
          <span className="cs__summary-value">{fmtTokens(inputTokens + outputTokens)}</span>
        </div>
        {cheapestPaid && (
          <>
            <div className="cs__summary-sep" />
            <div className="cs__summary-item">
              <span className="cs__summary-label">Mais barato (pago)</span>
              <span className="cs__summary-value cs__summary-value--green">
                {usd(cheapestPaid.total)} · {brl(cheapestPaid.total, usdBrl)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Results table ── */}
      <div className="cs__table-wrap">
        <table className="cs__table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Modelo</th>
              <th className="cs__th--num">Preço input<br/><span className="cs__th--sub">por 1M tokens</span></th>
              <th className="cs__th--num">Preço output<br/><span className="cs__th--sub">por 1M tokens</span></th>
              <th className="cs__th--num">Custo input<br/><span className="cs__th--sub">{fmtTokens(inputTokens)} tokens</span></th>
              <th className="cs__th--num">Custo output<br/><span className="cs__th--sub">{fmtTokens(outputTokens)} tokens</span></th>
              <th className="cs__th--num">Total USD</th>
              <th className="cs__th--num">Total BRL</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isCheapest = row === cheapestPaid;
              return (
                <tr key={row.id} className={isCheapest ? "cs__tr--best" : ""}>
                  <td>
                    <span
                      className="cs__provider-pill"
                      style={{ background: PROVIDER_COLOR[row.provider] ?? "#888" }}
                    >
                      {row.provider}
                    </span>
                  </td>
                  <td className="cs__model-name">
                    <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="cs__model-link" title="Ver tabela de preços oficial">
                      {row.label}
                    </a>
                    {isCheapest && <span className="cs__best-badge">melhor custo</span>}
                  </td>
                  <td className="cs__td--num cs__td--rate">{row.inputPer1M === 0 ? "—" : `$${row.inputPer1M.toFixed(2)}`}</td>
                  <td className="cs__td--num cs__td--rate">{row.outputPer1M === 0 ? "—" : `$${row.outputPer1M.toFixed(2)}`}</td>
                  <td className="cs__td--num">{row.inputPer1M === 0 ? "—" : usd(row.inCost)}</td>
                  <td className="cs__td--num">{row.outputPer1M === 0 ? "—" : usd(row.outCost)}</td>
                  <td className="cs__td--num cs__td--total">
                    {row.total === 0 ? <span className="cs__free">Grátis</span> : usd(row.total)}
                  </td>
                  <td className="cs__td--num cs__td--brl">
                    {row.total === 0 ? <span className="cs__free">Grátis</span> : brl(row.total, usdBrl)}
                  </td>
                  <td className="cs__notes">{row.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cs__sources">
        <div className="cs__sources-title">Fontes dos preços</div>
        <div className="cs__sources-row">
          <a href="https://openai.com/api/pricing/" target="_blank" rel="noopener noreferrer" className="cs__source-link">
            OpenAI API Pricing ↗
          </a>
          <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer" className="cs__source-link">
            Gemini API Pricing ↗
          </a>
          <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="cs__source-link">
            Ollama (local, gratuito) ↗
          </a>
        </div>
      </div>

      <p className="cs__disclaimer">
        <strong>Contagem de tokens:</strong> estimativa via <code>chars ÷ 4</code> — padrão OpenAI para inglês/português misto (texto latino = ~4 chars/token). Para precisão exata use o <a href="https://platform.openai.com/tokenizer" target="_blank" rel="noopener noreferrer">tokenizer oficial</a>. Gemini usa SentencePiece e pode divergir em ~10–15% para português.{" "}
        <strong>Preços:</strong> tabelas oficiais de março 2026, cobrados por <em>token consumido</em> — input e output separados. Valores em BRL calculados com a cotação informada acima.
      </p>
    </div>
  );
}
