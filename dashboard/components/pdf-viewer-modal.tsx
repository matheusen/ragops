"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/api-base";

const API_BASE = getApiBase();

// ── Types ──────────────────────────────────────────────────────────────────

interface PdfChunkItem {
  chunk_id: string;
  chunk_index: number;
  chunk_kind: string;
  page_number: number | null;
  section_title: string | null;
  content_preview: string;
  pdf_url: string | null;
}

interface PdfChunksResponse {
  doc_id: string;
  title: string;
  minio_key: string | null;
  chunks: PdfChunkItem[];
}

interface PdfViewerModalProps {
  docId: string;
  docTitle?: string;
  /** Abre direto na página do chunk especificado */
  initialChunkId?: string;
  initialPage?: number;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchPresignedUrl(docId: string, page?: number): Promise<string | null> {
  try {
    const params = page ? `?page=${page}` : "";
    const res = await fetch(`${API_BASE}/pdf/${docId}/url${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

async function fetchChunks(docId: string): Promise<PdfChunksResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/pdf/${docId}/chunks`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Chunk list item ────────────────────────────────────────────────────────

function ChunkItem({
  chunk,
  active,
  onClick,
}: {
  chunk: PdfChunkItem;
  active: boolean;
  onClick: () => void;
}) {
  const kindColor: Record<string, string> = {
    text: "#4f7df3",
    table: "#22a06b",
    figure: "#f79009",
    heading: "#9b59b6",
  };
  const color = kindColor[chunk.chunk_kind] ?? "#8b92a5";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: active ? "var(--primary-soft, rgba(79,125,243,.12))" : "transparent",
        border: `1px solid ${active ? "var(--primary, #4f7df3)" : "var(--border, #e2e5eb)"}`,
        borderRadius: 6,
        padding: "8px 10px",
        marginBottom: 6,
        cursor: "pointer",
        transition: "all 150ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color,
            background: `${color}18`,
            borderRadius: 4,
            padding: "1px 6px",
            textTransform: "uppercase",
            letterSpacing: ".05em",
          }}
        >
          {chunk.chunk_kind}
        </span>
        {chunk.page_number != null && (
          <span style={{ fontSize: 10, color: "var(--text-secondary, #6b7280)" }}>
            Pág. {chunk.page_number}
          </span>
        )}
        {chunk.section_title && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary, #9ca3af)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 120,
            }}
          >
            {chunk.section_title}
          </span>
        )}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          color: "var(--text, #1a1d23)",
          lineHeight: 1.45,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {chunk.content_preview || "(sem prévia)"}
      </p>
    </button>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function PdfViewerModal({
  docId,
  docTitle,
  initialPage,
  initialChunkId,
  onClose,
}: PdfViewerModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [chunks, setChunks] = useState<PdfChunkItem[]>([]);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(initialChunkId ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load chunks and initial PDF URL
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchChunks(docId), fetchPresignedUrl(docId, initialPage)]).then(
      ([chunksData, url]) => {
        if (chunksData) setChunks(chunksData.chunks);
        setPdfUrl(url);
        if (!url && !chunksData) setError("PDF não encontrado no MinIO. Faça a ingestão novamente.");
        setLoading(false);
      }
    );
  }, [docId, initialPage]);

  // Navigate iframe to chunk page
  const navigateToChunk = useCallback(
    async (chunk: PdfChunkItem) => {
      setActiveChunkId(chunk.chunk_id);
      if (chunk.pdf_url) {
        setPdfUrl(chunk.pdf_url);
      } else if (chunk.page_number) {
        const url = await fetchPresignedUrl(docId, chunk.page_number);
        if (url) setPdfUrl(url);
      }
    },
    [docId]
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="pdf-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pdf-modal">
        {/* Header */}
        <div className="pdf-modal__header">
          <div className="pdf-modal__title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{docTitle ?? docId}</span>
          </div>
          <button type="button" className="pdf-modal__close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className="pdf-modal__body">
          {/* Left — chunk list */}
          <div className="pdf-modal__sidebar">
            <div className="pdf-modal__sidebar-header">
              <span>Chunks ({chunks.length})</span>
            </div>
            <div className="pdf-modal__chunk-list">
              {loading && <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Carregando…</p>}
              {!loading && chunks.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Nenhum chunk indexado.</p>
              )}
              {chunks.map((chunk) => (
                <ChunkItem
                  key={chunk.chunk_id}
                  chunk={chunk}
                  active={activeChunkId === chunk.chunk_id}
                  onClick={() => navigateToChunk(chunk)}
                />
              ))}
            </div>
          </div>

          {/* Right — PDF viewer */}
          <div className="pdf-modal__viewer">
            {loading && (
              <div className="pdf-modal__placeholder">
                <div className="pdf-modal__spinner" />
                <p>Carregando PDF…</p>
              </div>
            )}
            {!loading && error && (
              <div className="pdf-modal__placeholder">
                <p style={{ color: "var(--danger, #ef4444)" }}>{error}</p>
              </div>
            )}
            {!loading && !error && !pdfUrl && (
              <div className="pdf-modal__placeholder">
                <p style={{ color: "var(--text-secondary)" }}>
                  PDF não disponível no MinIO. Faça a ingestão para armazenar o original.
                </p>
              </div>
            )}
            {pdfUrl && (
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title={docTitle ?? "PDF"}
                className="pdf-modal__iframe"
                allow="fullscreen"
              />
            )}
          </div>
        </div>
      </div>

      <style>{`
        .pdf-modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,.55); display: flex;
          align-items: center; justify-content: center;
          padding: 1.5rem;
        }
        .pdf-modal {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #e2e5eb);
          border-radius: 12px;
          width: 100%; max-width: 1100px;
          height: 85vh; display: flex; flex-direction: column;
          overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.25);
        }
        .pdf-modal__header {
          display: flex; align-items: center; justify-content: space-between;
          padding: .75rem 1.25rem;
          border-bottom: 1px solid var(--border, #e2e5eb);
          flex-shrink: 0;
        }
        .pdf-modal__title {
          display: flex; align-items: center; gap: .5rem;
          font-size: .9rem; font-weight: 700; color: var(--text, #1a1d23);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pdf-modal__close {
          background: none; border: none; cursor: pointer;
          color: var(--text-secondary, #6b7280); font-size: 1.4rem; line-height: 1;
          padding: 0 .25rem; flex-shrink: 0;
        }
        .pdf-modal__body {
          display: flex; flex: 1; overflow: hidden;
        }
        .pdf-modal__sidebar {
          width: 280px; flex-shrink: 0;
          border-right: 1px solid var(--border, #e2e5eb);
          display: flex; flex-direction: column; overflow: hidden;
        }
        .pdf-modal__sidebar-header {
          padding: .6rem 1rem;
          font-size: .75rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: .07em; color: var(--text-secondary, #6b7280);
          border-bottom: 1px solid var(--border-light, #f1f3f6);
          flex-shrink: 0;
        }
        .pdf-modal__chunk-list {
          flex: 1; overflow-y: auto; padding: .75rem;
        }
        .pdf-modal__viewer {
          flex: 1; display: flex; align-items: center; justify-content: center;
          background: var(--bg-alt, #f5f7fa); overflow: hidden;
        }
        .pdf-modal__iframe {
          width: 100%; height: 100%; border: none;
        }
        .pdf-modal__placeholder {
          display: flex; flex-direction: column; align-items: center; gap: .75rem;
          color: var(--text-secondary, #6b7280); font-size: .9rem; text-align: center;
          padding: 2rem;
        }
        .pdf-modal__spinner {
          width: 32px; height: 32px;
          border: 3px solid var(--border, #e2e5eb);
          border-top-color: var(--primary, #4f7df3);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
