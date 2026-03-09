"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { saveProviderConfigAction, saveSettingAction, type ProviderConfigState, type SettingActionState } from "@/app/actions";
import type { ActiveProviderConfig, MongoStatus, SettingItem, SettingsGroup } from "@/lib/dashboard-data";

// ─────────────────────────────────────────────
// Active provider hero banner
// ─────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  ollama: "Ollama (local)",
  ollm: "oLLM (in-process)",
  mock: "Mock (testing)",
};

const PROVIDER_COLOR: Record<string, string> = {
  openai: "#10a37f",
  gemini: "#4285f4",
  ollama: "#e05d2a",
  ollm: "#0f766e",
  mock: "#888",
};

const MODEL_PRESETS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3", "o4-mini"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"],
  ollama: ["llama3", "llama3.1", "llama3.2", "mistral", "phi3", "gemma3", "qwen2.5"],
  ollm: ["llama3-1B-chat", "llama3-3B-chat", "llama3-8B-chat", "gpt-oss-20B", "qwen3-next-80B", "gemma3-12B", "voxtral-small-24B"],
  mock: [],
};

const INITIAL_PC: ProviderConfigState = { status: "idle", message: "" };

export function ActiveProviderBanner({ config }: { config: ActiveProviderConfig }) {
  const { provider, model, secondaryProvider, secondOpinionEnabled, confidentialityMode } = config;
  const [changing, setChanging] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [state, dispatch, pending] = useActionState(saveProviderConfigAction, INITIAL_PC);

  const label = PROVIDER_LABELS[provider] ?? provider;
  const color = PROVIDER_COLOR[provider] ?? "var(--primary)";
  const secondLabel = PROVIDER_LABELS[secondaryProvider] ?? secondaryProvider;
  const presets = MODEL_PRESETS[selectedProvider] ?? [];

  // Close form on success
  useEffect(() => {
    if (state.status === "success") setChanging(false);
  }, [state.status]);

  return (
    <div className="apb">
      {/* ── Status row ────────────────────────── */}
      <div className="apb__main">
        <div className="apb__pill" style={{ background: color }}>{label}</div>
        <div className="apb__model">{model}</div>
        {confidentialityMode && (
          <div className="apb__badge apb__badge--conf">Confidentiality mode ON</div>
        )}
      </div>

      <div className="apb__right">
        {secondOpinionEnabled && secondaryProvider && (
          <div className="apb__secondary">
            <span className="apb__secondary-label">2nd opinion</span>
            <span
              className="apb__pill apb__pill--sm"
              style={{ background: PROVIDER_COLOR[secondaryProvider] ?? "var(--primary)" }}
            >
              {secondLabel}
            </span>
          </div>
        )}
        {!secondOpinionEnabled && (
          <div className="apb__hint">ENABLE_SECOND_OPINION = false</div>
        )}
        <button
          type="button"
          className="btn-sm btn-sm--primary"
          onClick={() => setChanging((v) => !v)}
        >
          {changing ? "Cancel" : "Change provider / model"}
        </button>
      </div>

      {/* ── Quick-change form ─────────────────── */}
      {changing && (
        <form action={dispatch} className="apb__form">
          <div className="apb__form-row">
            <label className="apb__form-label">Provider</label>
            <select
              name="provider"
              className="apb__select"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
              <option value="ollama">Ollama (local)</option>
              <option value="ollm">oLLM (in-process)</option>
              <option value="mock">Mock (testing)</option>
            </select>
          </div>

          {selectedProvider !== "mock" && (
            <div className="apb__form-row">
              <label className="apb__form-label">Model</label>
              <div className="apb__model-combo">
                <select
                  name="model"
                  className="apb__select"
                  defaultValue={selectedProvider === provider ? model : presets[0] ?? ""}
                  key={selectedProvider}
                >
                  {presets.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className="apb__hint">or type a custom value below</span>
                <input
                  name="model"
                  className="apb__input"
                  placeholder={`Custom model (overrides dropdown)`}
                  defaultValue=""
                />
              </div>
            </div>
          )}

          {state.status === "error" && (
            <div className="apb__form-error">{state.message}</div>
          )}

          <div className="apb__form-actions">
            <button type="submit" className="btn-sm btn-sm--primary" disabled={pending}>
              {pending ? "Saving…" : "Apply"}
            </button>
            <button type="button" className="btn-sm" onClick={() => setChanging(false)}>Cancel</button>
            {state.status === "success" && (
              <span className="apb__hint" style={{ color: "var(--primary)" }}>{state.message} ✓</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MongoDB status panel (server-rendered data, client component for refresh)
// ─────────────────────────────────────────────

export function MongoStatusPanel({ status }: { status: MongoStatus }) {
  const { configured, connected, docCount, uri, error } = status;

  const statusLabel = !configured
    ? "Not configured"
    : connected
    ? "Connected"
    : "Connection failed";

  const statusColor = !configured ? "var(--text-secondary)" : connected ? "#22c55e" : "#ef4444";

  return (
    <div className="mongo-status">
      <div className="mongo-status__row">
        <span className="mongo-status__dot" style={{ background: statusColor }} />
        <span className="mongo-status__label" style={{ color: statusColor }}>{statusLabel}</span>
        <code className="mongo-status__uri">{uri}</code>
      </div>
      {connected && (
        <div className="mongo-status__row mongo-status__row--sub">
          <span className="mongo-status__key">DB:</span><code>ragflow</code>
          <span className="mongo-status__key">collection:</span><code>settings</code>
          <span className="mongo-status__key">saved overrides:</span>
          <strong>{docCount}</strong>
        </div>
      )}
      {error && (
        <div className="mongo-status__error">{error}</div>
      )}
      {!configured && (
        <div className="mongo-status__hint">
          Adicione <code>MONGODB_URI=mongodb://localhost:27017</code> ao <code>.env</code> do dashboard e reinicie o servidor.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────

export function SettingsPanels({
  groups,
  mongoConfigured,
}: {
  groups: SettingsGroup[];
  mongoConfigured: boolean;
}) {
  return (
    <div className="settings-grid">
      {!mongoConfigured && (
        <div className="mongo-banner">
          <span className="mongo-banner__icon">ℹ</span>
          <span>
            Salvando no <strong>.env</strong> (fallback). Para persistência em banco adicione{" "}
            <code>MONGODB_URI=mongodb://...</code> ao <code>.env</code> do dashboard.
          </span>
        </div>
      )}
      {groups.map((group) => (
        <SettingsCard key={group.title} group={group} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Card per group
// ─────────────────────────────────────────────

function SettingsCard({ group }: { group: SettingsGroup }) {
  return (
    <article className="settings-card">
      <div className="mini-label">{group.title}</div>
      <h3>{group.description}</h3>
      <dl className="settings-stack">
        {group.items.map((item) => (
          <SettingRow key={item.key} item={item} />
        ))}
      </dl>
    </article>
  );
}

// ─────────────────────────────────────────────
// Individual editable / read-only row
// ─────────────────────────────────────────────

const INITIAL_STATE: SettingActionState = { status: "idle", message: "", key: "" };

function SettingRow({ item }: { item: SettingItem }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(item.rawValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, dispatch, pending] = useActionState(saveSettingAction, INITIAL_STATE);
  const isThisKey = state.key === item.key;

  useEffect(() => {
    if (isThisKey && state.status === "success") {
      setEditing(false);
    }
  }, [state, isThisKey]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const canEdit = item.editable;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
    }
    if (e.key === "Escape") {
      setLocalValue(item.rawValue);
      setEditing(false);
    }
  }

  return (
    <div className={`stack-row${editing ? " stack-row--editing" : ""}`}>
      <dt className="stack-row__key">{item.key}</dt>
      <dd className="stack-row__value">
        {editing ? (
          <form action={dispatch} className="inline-edit-form">
            <input type="hidden" name="key" value={item.key} />
            <input
              ref={inputRef}
              name="value"
              className="inline-input"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={pending}
              aria-label={`Edit ${item.key}`}
            />
            <button type="submit" className="btn-icon btn-icon--save" disabled={pending} title="Salvar">
              {pending ? "…" : "✓"}
            </button>
            <button
              type="button"
              className="btn-icon btn-icon--cancel"
              onClick={() => { setLocalValue(item.rawValue); setEditing(false); }}
              title="Cancelar"
            >
              ✕
            </button>
            <button
              type="submit"
              name="reset"
              value="true"
              className="btn-icon btn-icon--reset"
              disabled={pending}
              title="Resetar para o valor do .env"
            >
              ↺
            </button>
            {isThisKey && state.status === "error" && (
              <span className="inline-error">{state.message}</span>
            )}
          </form>
        ) : (
          <span className="stack-row__display">
            <span className={item.rawValue ? "value-set" : "value-empty"}>{item.value}</span>
            {isThisKey && state.status === "success" && (
              <span className="inline-success"> salvo ✓</span>
            )}
            {canEdit && (
              <button
                type="button"
                className="btn-icon btn-icon--edit"
                onClick={() => setEditing(true)}
                title={`Editar ${item.key}`}
              >
                ✎
              </button>
            )}
            {!item.editable && (
              <span className="badge-readonly" title="Edite diretamente no .env">.env only</span>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}
