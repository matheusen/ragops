"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBase } from "@/lib/api-base";
import { setThemeAction } from "@/app/actions";

const navItems = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/learning-journey",
    label: "Journey",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19h16" />
        <path d="M6 15l4-4 3 3 5-7" />
        <circle cx="6" cy="15" r="1.5" />
        <circle cx="10" cy="11" r="1.5" />
        <circle cx="13" cy="14" r="1.5" />
        <circle cx="18" cy="7" r="1.5" />
      </svg>
    ),
  },
  {
    href: "/apresentacao",
    label: "Apresentacao",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5h18v10H3z" />
        <path d="M8 21h8" />
        <path d="M12 15v6" />
        <path d="M7 9h10" />
      </svg>
    ),
  },
  {
    href: "/requests",
    label: "Requests",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    href: "/prompts",
    label: "Prompts",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
  {
    href: "/flow",
    label: "Flow",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: "/results",
    label: "Results",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="4" />
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    href: "/run",
    label: "Run",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    href: "/cost",
    label: "Cost",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  {
    href: "/ingest",
    label: "Ingest",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    href: "/mindmap",
    label: "Conhecimento",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <circle cx="4" cy="6" r="2" />
        <circle cx="20" cy="6" r="2" />
        <circle cx="4" cy="18" r="2" />
        <circle cx="20" cy="18" r="2" />
        <line x1="6" y1="7" x2="10" y2="11" />
        <line x1="18" y1="7" x2="14" y2="11" />
        <line x1="6" y1="17" x2="10" y2="13" />
        <line x1="18" y1="17" x2="14" y2="13" />
      </svg>
    ),
  },
  {
    href: "/roadmap",
    label: "Roadmap",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </svg>
    ),
  },
  {
    href: "/article",
    label: "Artigo",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
        <line x1="8" y1="9" x2="10" y2="9" />
      </svg>
    ),
  },
  {
    href: "/linkedin-posts",
    label: "LinkedIn",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
];

function getBreadcrumb(pathname: string) {
  const item = navItems.find((n) => n.href === pathname || pathname.startsWith(n.href + "/"));
  return item?.label ?? "Overview";
}

export function AppShell({ children, initialTheme }: { children: React.ReactNode; initialTheme: "light" | "dark" }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);

  const toggleTheme = useCallback(async () => {
    const next: "light" | "dark" = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    await setThemeAction(next);
  }, [theme]);

  // ── Quick Capture state ───────────────────────────────────────────────────
  const [qkOpen,     setQkOpen]     = useState(false);
  const [qkIssueKey, setQkIssueKey] = useState("");
  const [qkProvider, setQkProvider] = useState("mock");
  const [qkLoading,  setQkLoading]  = useState(false);
  const [qkResult,   setQkResult]   = useState<null | { classification: string; confidence: number; rationale: string }>(null);
  const [qkError,    setQkError]    = useState("");
  const qkInputRef = useRef<HTMLInputElement>(null);

  const openQk = useCallback(() => {
    setQkOpen(true);
    setQkResult(null);
    setQkError("");
    setQkIssueKey("");
    setTimeout(() => qkInputRef.current?.focus(), 60);
  }, []);

  const closeQk = useCallback(() => {
    setQkOpen(false);
    setQkResult(null);
    setQkError("");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setQkOpen((v) => { if (!v) { setTimeout(() => qkInputRef.current?.focus(), 60); } return !v; });
      }
      if (e.key === "Escape") closeQk();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeQk]);

  const runQkValidate = useCallback(async () => {
    if (!qkIssueKey.trim()) return;
    setQkLoading(true);
    setQkError("");
    setQkResult(null);
    try {
      const API_BASE = getApiBase();
      const res = await fetch(`${API_BASE}/validate/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue: {
            issue_key: qkIssueKey.trim().toUpperCase(),
            summary: "",
            description: "",
            issue_type: "Bug",
          },
          provider: qkProvider,
          artifact_paths: [],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setQkResult({
        classification: data.classification,
        confidence: data.confidence,
        rationale: data.rationale ?? "",
      });
    } catch (err: unknown) {
      setQkError(err instanceof Error ? err.message : String(err));
    } finally {
      setQkLoading(false);
    }
  }, [qkIssueKey, qkProvider]);

  const QK_CLS: Record<string, { label: string; mod: string }> = {
    bug:          { label: "🐛 Bug confirmado",  mod: "qk__banner--bug"  },
    not_bug:      { label: "✅ Não é bug",        mod: "qk__banner--ok"  },
    needs_review: { label: "⚠️ Revisão humana",  mod: "qk__banner--warn" },
  };

  return (
    <div className={`shell ${collapsed ? "shell--collapsed" : ""}`}>
      {/* ── Sidebar ── */}
      <aside className={`sidebar ${drawerOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <div className="sidebar__logo">R</div>
          <span className="sidebar__title">RAG Ops</span>
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                className={`sidebar__link ${active ? "sidebar__link--active" : ""}`}
                href={item.href}
                key={item.href}
                onClick={() => setDrawerOpen(false)}
                title={item.label}
              >
                <span className="sidebar__link-icon">{item.icon}</span>
                <span className="sidebar__link-text">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar__bottom">
          <button
            className="sidebar__collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            type="button"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
            <span className="sidebar__link-text">Collapse</span>
          </button>
          <div className="sidebar__version">v1.0 &middot; Enterprise</div>
        </div>
      </aside>

      {drawerOpen && (
        <button
          aria-label="Close navigation"
          className="sidebar__overlay"
          onClick={() => setDrawerOpen(false)}
          type="button"
        />
      )}

      {/* ── Main column ── */}
      <div className="main">
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar__left">
            <button
              aria-label="Toggle menu"
              aria-expanded={drawerOpen}
              className="topbar__hamburger"
              onClick={() => setDrawerOpen((o) => !o)}
              type="button"
            >
              <span /><span /><span />
            </button>
            <nav className="topbar__breadcrumb">
              <span className="topbar__breadcrumb-root">Dashboard</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              <span className="topbar__breadcrumb-current">{getBreadcrumb(pathname)}</span>
            </nav>
          </div>
          <div className="topbar__right">
            <button
              type="button"
              className="qk__topbar-trigger"
              onClick={openQk}
              title="Quick Capture (⌘K)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Validar</span>
              <kbd className="qk__kbd">⌘K</kbd>
            </button>
            <div className="topbar__status">
              <span className="topbar__dot" />
              System healthy
            </div>
            <button
              type="button"
              className="topbar__theme-btn"
              onClick={toggleTheme}
              title={theme === "light" ? "Mudar para tema escuro" : "Mudar para tema claro"}
              aria-label="Alternar tema"
            >
              {theme === "light" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              )}
            </button>
            <div className="topbar__avatar">OP</div>
          </div>
        </header>

        {/* Page content */}
        <div className="main__content">
          {children}
        </div>
      </div>

      {/* ── Quick Capture modal ────────────────────────────────────────── */}
      {qkOpen && (
        <>
          <button
            type="button"
            className="qk__overlay"
            aria-label="Fechar Quick Capture"
            onClick={closeQk}
          />
          <div className="qk__modal" role="dialog" aria-modal aria-label="Quick Capture">
            <div className="qk__modal-header">
              <span className="qk__modal-title">⚡ Quick Capture</span>
              <span className="qk__modal-hint">Valide uma issue sem sair da tela</span>
              <button type="button" className="qk__close" onClick={closeQk}>✕</button>
            </div>

            <div className="qk__modal-body">
              <div className="qk__row">
                <input
                  ref={qkInputRef}
                  className="qk__input"
                  placeholder="Issue key (ex: PAY-1421)"
                  value={qkIssueKey}
                  onChange={(e) => setQkIssueKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runQkValidate(); }}
                  disabled={qkLoading}
                />
                <select
                  className="qk__select"
                  value={qkProvider}
                  onChange={(e) => setQkProvider(e.target.value)}
                  disabled={qkLoading}
                >
                  {["mock", "ollama", "ollm", "openai", "gemini"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="qk__run-btn"
                  onClick={runQkValidate}
                  disabled={qkLoading || !qkIssueKey.trim()}
                >
                  {qkLoading ? "…" : "Validar"}
                </button>
              </div>

              {qkError && (
                <div className="qk__error">{qkError}</div>
              )}

              {qkResult && (() => {
                const meta = QK_CLS[qkResult.classification] ?? { label: qkResult.classification, mod: "" };
                const pct  = Math.round(qkResult.confidence * 100);
                const color = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
                return (
                  <div className="qk__result">
                    <div className={`qk__banner ${meta.mod}`}>{meta.label}</div>
                    <div className="qk__conf">
                      <span className="qk__conf-label">Confiança</span>
                      <div className="qk__conf-track">
                        <div className="qk__conf-fill" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="qk__conf-pct" style={{ color }}>{pct}%</span>
                    </div>
                    {qkResult.rationale && (
                      <p className="qk__rationale">{qkResult.rationale.slice(0, 280)}{qkResult.rationale.length > 280 ? "…" : ""}</p>
                    )}
                    <Link
                      href="/results"
                      className="qk__view-link"
                      onClick={closeQk}
                    >
                      Ver em Results →
                    </Link>
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
