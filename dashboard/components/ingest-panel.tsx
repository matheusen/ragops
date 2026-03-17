"use client";

import { useCallback, useRef, useState } from "react";
import { getApiBase } from "@/lib/api-base";

interface IngestResult {
  doc_id: string;
  title: string;
  path: string;
  chunks_indexed: number;
  topics: string[];
  ok: boolean;
  error?: string;
  warnings?: string[];
}

interface FileItem {
  file: File;
  id: string;
  status: "pending" | "uploading" | "done" | "error";
  result?: IngestResult;
  error?: string;
}

const API_BASE = getApiBase();

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IngestPanel() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const items: FileItem[] = Array.from(newFiles)
      .filter((f) => /\.(pdf|txt|md)$/i.test(f.name))
      .map((f) => ({
        file: f,
        id: `${f.name}-${f.size}-${Date.now()}`,
        status: "pending",
      }));
    setFiles((prev) => {
      const existingNames = new Set(prev.map((p) => p.file.name));
      return [...prev, ...items.filter((it) => !existingNames.has(it.file.name))];
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadItems = async (items: FileItem[]) => {
    for (const item of items) {
      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" } : f))
      );

      const formData = new FormData();
      formData.append("files", item.file);

      try {
        const res = await fetch(`${API_BASE}/knowledge/upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }

        const data: IngestResult[] = await res.json();
        const result = data[0];

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: result.ok ? "done" : "error", result, error: result.error }
              : f
          )
        );
      } catch (err: unknown) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "error", error: err instanceof Error ? err.message : String(err) }
              : f
          )
        );
      }
    }
  };

  const retryFailed = async () => {
    const toRetry = files
      .filter((f) => f.status === "error")
      .map((f) => ({ ...f, status: "pending" as const, error: undefined, result: undefined }));
    if (!toRetry.length) return;
    setFiles((prev) =>
      prev.map((f) => (f.status === "error" ? { ...f, status: "pending", error: undefined, result: undefined } : f))
    );
    setUploading(true);
    await uploadItems(toRetry);
    setUploading(false);
  };

  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (!pending.length) return;
    setUploading(true);
    await uploadItems(pending);
    setUploading(false);
  };

  const clearDone = () => {
    setFiles((prev) => prev.filter((f) => f.status !== "done"));
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="ingest">
      {/* Drop zone */}
      <div
        className={`ingest__dropzone ${dragging ? "ingest__dropzone--active" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md"
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="ingest__dropzone-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="ingest__dropzone-title">
          {dragging ? "Solte os arquivos aqui" : "Arraste PDFs, TXTs ou clique para selecionar"}
        </p>
        <p className="ingest__dropzone-hint">Suporta .pdf, .txt, .md — múltiplos arquivos</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="ingest__list">
          <div className="ingest__list-header">
            <span className="ingest__list-count">
              {files.length} arquivo{files.length !== 1 ? "s" : ""}
              {doneCount > 0 && <span className="ingest__badge ingest__badge--ok">{doneCount} indexados</span>}
              {errorCount > 0 && <span className="ingest__badge ingest__badge--err">{errorCount} com erro</span>}
            </span>
            <div className="ingest__list-actions">
              {doneCount > 0 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={clearDone}>
                  Limpar concluídos
                </button>
              )}
              {errorCount > 0 && !uploading && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={retryFailed}>
                  Tentar novamente ({errorCount})
                </button>
              )}
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={uploadAll}
                disabled={uploading || pendingCount === 0}
              >
                {uploading ? "Indexando…" : `Indexar ${pendingCount > 0 ? pendingCount : ""} arquivo${pendingCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          <div className="ingest__items">
            {files.map((item) => (
              <div key={item.id} className={`ingest__item ingest__item--${item.status}`}>
                <div className="ingest__item-icon">
                  {item.status === "pending" && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                  {item.status === "uploading" && (
                    <div className="ingest__spinner" />
                  )}
                  {item.status === "done" && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {item.status === "error" && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  )}
                </div>

                <div className="ingest__item-info">
                  <span className="ingest__item-name">{item.file.name}</span>
                  <span className="ingest__item-meta">
                    {formatBytes(item.file.size)}
                    {item.result && (
                      <>
                        {" · "}{item.result.chunks_indexed} chunks
                        {item.result.topics.length > 0 && (
                          <> · {item.result.topics.slice(0, 3).join(", ")}{item.result.topics.length > 3 ? "…" : ""}</>
                        )}
                      </>
                    )}
                    {item.error && <span className="ingest__item-error"> · {item.error}</span>}
                  </span>
                </div>

                {item.status === "pending" && (
                  <button
                    type="button"
                    className="ingest__item-remove"
                    onClick={() => removeFile(item.id)}
                    title="Remover"
                  >
                    ×
                  </button>
                )}
                {item.status === "error" && !uploading && (
                  <button
                    type="button"
                    className="ingest__item-remove"
                    title="Tentar novamente"
                    onClick={async () => {
                      const refreshed = { ...item, status: "pending" as const, error: undefined, result: undefined };
                      setFiles((prev) => prev.map((f) => (f.id === item.id ? refreshed : f)));
                      setUploading(true);
                      await uploadItems([refreshed]);
                      setUploading(false);
                    }}
                  >
                    ↺
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="ingest__tips">
        <h3 className="ingest__tips-title">Estratégia de indexação</h3>
        <div className="ingest__tips-grid">
          <div className="ingest__tip">
            <span className="ingest__tip-icon">⚡</span>
            <div>
              <strong>Chunking semântico</strong>
              <p>Cada PDF é dividido por parágrafos/seções com embeddings densos + BM25 esparso para busca híbrida.</p>
            </div>
          </div>
          <div className="ingest__tip">
            <span className="ingest__tip-icon">🔗</span>
            <div>
              <strong>Linkagem por tópicos</strong>
              <p>Tópicos são extraídos automaticamente de cada documento. Docs com tópicos em comum são ligados no mindmap.</p>
            </div>
          </div>
          <div className="ingest__tip">
            <span className="ingest__tip-icon">🗺️</span>
            <div>
              <strong>Pronto para Roadmap</strong>
              <p>Após o ingest, vá para Mindmap para visualizar conexões ou Roadmap para gerar um plano de estudos com LLM.</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .ingest { display: flex; flex-direction: column; gap: 1.5rem; max-width: 860px; }

        .ingest__dropzone {
          border: 2px dashed var(--border);
          border-radius: var(--radius-lg);
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          background: var(--surface);
          transition: border-color 150ms, background 150ms;
          display: flex; flex-direction: column; align-items: center; gap: .75rem;
        }
        .ingest__dropzone:hover, .ingest__dropzone--active {
          border-color: var(--primary);
          background: var(--primary-soft);
        }
        .ingest__dropzone-icon { color: var(--text-tertiary); }
        .ingest__dropzone--active .ingest__dropzone-icon { color: var(--primary); }
        .ingest__dropzone-title { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text); }
        .ingest__dropzone-hint { margin: 0; font-size: .8rem; color: var(--text-tertiary); }

        .ingest__list { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
        .ingest__list-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: .75rem 1rem; border-bottom: 1px solid var(--border);
          background: var(--bg-alt);
        }
        .ingest__list-count { font-size: .85rem; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: .5rem; }
        .ingest__badge { font-size: .7rem; padding: .15rem .45rem; border-radius: 20px; font-weight: 700; }
        .ingest__badge--ok { background: var(--success-soft); color: var(--success); }
        .ingest__badge--err { background: var(--danger-soft); color: var(--danger); }
        .ingest__list-actions { display: flex; gap: .5rem; }

        .ingest__items { display: flex; flex-direction: column; }
        .ingest__item {
          display: flex; align-items: center; gap: .75rem;
          padding: .7rem 1rem; border-bottom: 1px solid var(--border-light);
          transition: background 100ms;
        }
        .ingest__item:last-child { border-bottom: none; }
        .ingest__item--uploading { background: var(--primary-soft); }
        .ingest__item--done { opacity: .7; }
        .ingest__item--error { background: var(--danger-soft); }

        .ingest__item-icon { flex-shrink: 0; color: var(--text-tertiary); }
        .ingest__item-info { flex: 1; min-width: 0; }
        .ingest__item-name { display: block; font-size: .875rem; font-weight: 500; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ingest__item-meta { font-size: .75rem; color: var(--text-secondary); }
        .ingest__item-error { color: var(--danger); }
        .ingest__item-remove {
          flex-shrink: 0; background: none; border: none; cursor: pointer;
          color: var(--text-tertiary); font-size: 1.1rem; line-height: 1; padding: .1rem .3rem;
          border-radius: 4px; transition: background 100ms, color 100ms;
        }
        .ingest__item-remove:hover { background: var(--danger-soft); color: var(--danger); }

        .ingest__spinner {
          width: 18px; height: 18px;
          border: 2px solid var(--primary-medium);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .ingest__tips { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; }
        .ingest__tips-title { margin: 0 0 1rem; font-size: .8rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--text-tertiary); }
        .ingest__tips-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
        .ingest__tip { display: flex; gap: .75rem; }
        .ingest__tip-icon { font-size: 1.25rem; flex-shrink: 0; }
        .ingest__tip strong { display: block; font-size: .875rem; font-weight: 600; color: var(--text); margin-bottom: .2rem; }
        .ingest__tip p { margin: 0; font-size: .8rem; color: var(--text-secondary); line-height: 1.5; }

        .btn { border: none; cursor: pointer; border-radius: var(--radius-sm); font-weight: 600; transition: background 120ms, opacity 120ms; }
        .btn--primary { background: var(--primary); color: #fff; }
        .btn--primary:hover { opacity: .88; }
        .btn--primary:disabled { opacity: .45; cursor: not-allowed; }
        .btn--ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
        .btn--ghost:hover { background: var(--bg-alt); }
        .btn--sm { font-size: .8rem; padding: .35rem .8rem; }
      `}</style>
    </div>
  );
}
