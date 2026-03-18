"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";

const API_BASE = "/api/backend/api/v1";

interface Post {
  id: string;
  roadmap_id: string;
  roadmap_title?: string;
  topic_focus: string;
  content: string;
  created_at: string;
}

export default function LinkedinPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/linkedin-posts`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setPosts(d.posts || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    await fetch(`${API_BASE}/linkedin-posts/${id}`, { method: "DELETE" }).catch(() => {});
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <main className="lp-page">
      <div className="lp-header">
        <div>
          <h1 className="lp-title">💼 LinkedIn Posts</h1>
          <p className="lp-sub">Todos os posts gerados a partir dos seus roadmaps.</p>
        </div>
        <button className="lp-refresh" onClick={load} disabled={loading}>
          {loading ? "Carregando…" : "↺ Atualizar"}
        </button>
      </div>

      {error && <div className="lp-error">Erro: {error}</div>}

      {!loading && posts.length === 0 && !error && (
        <div className="lp-empty">
          <span className="lp-empty-icon">💼</span>
          <p>Nenhum post salvo ainda.</p>
          <p className="lp-empty-sub">Acesse um roadmap e use o <strong>LinkedIn Studio</strong> para gerar posts.</p>
        </div>
      )}

      <div className="lp-grid">
        {posts.map((p) => {
          const isExp = expanded === p.id;
          return (
            <div key={p.id} className="lp-card">
              <div className="lp-card__meta">
                {p.topic_focus ? (
                  <span className="lp-card__topic">{p.topic_focus}</span>
                ) : (
                  <span className="lp-card__topic lp-card__topic--general">Geral</span>
                )}
                {p.roadmap_title && (
                  <span className="lp-card__roadmap">{p.roadmap_title}</span>
                )}
                <span className="lp-card__date">
                  {new Date(p.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </span>
              </div>

              <p className="lp-card__preview">
                {isExp ? p.content : p.content.slice(0, 200) + (p.content.length > 200 ? "…" : "")}
              </p>
              {p.content.length > 200 && (
                <button
                  className="lp-card__toggle"
                  onClick={() => setExpanded(isExp ? null : p.id)}
                >
                  {isExp ? "Ver menos ▲" : "Ver mais ▼"}
                </button>
              )}

              <div className="lp-card__footer">
                <span className="lp-card__chars">{p.content.length} caracteres</span>
                <button
                  className="lp-card__copy"
                  onClick={() => handleCopy(p.id, p.content)}
                >
                  {copied === p.id ? "✓ Copiado!" : "📋 Copiar"}
                </button>
                <button
                  className="lp-card__del"
                  onClick={() => handleDelete(p.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .lp-page {
          max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem;
          display: flex; flex-direction: column; gap: 1.5rem;
        }
        .lp-header {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
        }
        .lp-title { font-size: 1.5rem; font-weight: 800; color: #1e293b; margin: 0; }
        .lp-sub { font-size: .88rem; color: #64748b; margin: .25rem 0 0; }
        .lp-refresh {
          border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
          color: #475569; font-size: .82rem; font-weight: 600; padding: .4rem .9rem;
          cursor: pointer; transition: border-color .12s, color .12s; white-space: nowrap;
        }
        .lp-refresh:hover:not(:disabled) { border-color: #0a66c2; color: #0a66c2; }
        .lp-refresh:disabled { opacity: .5; cursor: not-allowed; }
        .lp-error {
          background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
          color: #dc2626; font-size: .85rem; padding: .75rem 1rem;
        }
        .lp-empty {
          text-align: center; padding: 4rem 2rem; color: #94a3b8;
          display: flex; flex-direction: column; align-items: center; gap: .5rem;
        }
        .lp-empty-icon { font-size: 3rem; }
        .lp-empty p { margin: 0; font-size: .92rem; }
        .lp-empty-sub { font-size: .82rem; }
        .lp-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 1rem;
        }
        .lp-card {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 1.1rem; display: flex; flex-direction: column; gap: .6rem;
          box-shadow: 0 1px 4px rgba(0,0,0,.06); transition: box-shadow .15s;
        }
        .lp-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.1); }
        .lp-card__meta { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
        .lp-card__topic {
          font-size: .7rem; font-weight: 700; background: #dbeafe; color: #1d4ed8;
          border-radius: 4px; padding: 1px 7px;
        }
        .lp-card__topic--general { background: #f1f5f9; color: #64748b; }
        .lp-card__roadmap {
          font-size: .72rem; color: #94a3b8; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap; max-width: 180px;
        }
        .lp-card__date { font-size: .7rem; color: #94a3b8; margin-left: auto; white-space: nowrap; }
        .lp-card__preview {
          font-size: .84rem; color: #334155; line-height: 1.6;
          white-space: pre-wrap; word-break: break-word; margin: 0;
        }
        .lp-card__toggle {
          background: none; border: none; font-size: .74rem; color: #0a66c2;
          font-weight: 600; cursor: pointer; padding: 0; align-self: flex-start;
          transition: opacity .11s;
        }
        .lp-card__toggle:hover { opacity: .75; }
        .lp-card__footer {
          display: flex; align-items: center; gap: .5rem;
          border-top: 1px solid #f1f5f9; padding-top: .6rem; margin-top: .2rem;
        }
        .lp-card__chars { font-size: .7rem; color: #94a3b8; margin-right: auto; }
        .lp-card__copy {
          border: 1px solid #e2e8f0; border-radius: 6px; background: none;
          color: #475569; font-size: .74rem; font-weight: 600; padding: .2rem .65rem;
          cursor: pointer; transition: border-color .11s, color .11s;
        }
        .lp-card__copy:hover { border-color: #0a66c2; color: #0a66c2; }
        .lp-card__del {
          background: none; border: none; cursor: pointer; color: #cbd5e1;
          font-size: .9rem; padding: .1rem .3rem; border-radius: 4px;
          transition: color .11s;
        }
        .lp-card__del:hover { color: #ef4444; }
      `}</style>
    </main>
  );
}
