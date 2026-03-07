"use client";

import { useActionState, useEffect, useState } from "react";

import { deletePromptAction, updatePromptAction, type PromptActionState } from "@/app/actions";
import type { PromptTemplate } from "@/lib/dashboard-data";

const IDLE: PromptActionState = { status: "idle", message: "" };

export function PromptLibrary({ prompts }: { prompts: PromptTemplate[] }) {
  return (
    <div className="prompt-list">
      {prompts.map((prompt) => (
        <PromptCard key={prompt.fileName} prompt={prompt} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────

function PromptCard({ prompt }: { prompt: PromptTemplate }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [updateState, updateDispatch, updatePending] = useActionState(updatePromptAction, IDLE);
  const [deleteState, deleteDispatch, deletePending] = useActionState(deletePromptAction, IDLE);

  // Close edit form on success
  useEffect(() => {
    if (updateState.status === "success") setEditing(false);
  }, [updateState.status]);

  if (editing) {
    return (
      <PromptEditForm
        prompt={prompt}
        dispatch={updateDispatch}
        pending={updatePending}
        state={updateState}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article className="prompt-item">
      <div className="prompt-head">
        <div>
          <div className="prompt-name">{prompt.name}</div>
          <div className="prompt-body">{prompt.description || "No description provided."}</div>
        </div>
        <div className="prompt-card-actions">
          <div className="chip-row">
            <span className="chip accent">{prompt.mode}</span>
            <span className="chip">{prompt.fileName}</span>
          </div>
          <div className="prompt-btn-row">
            <button
              type="button"
              className="btn-sm"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
            <button
              type="button"
              className="btn-sm btn-sm--primary"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <form action={deleteDispatch}>
              <input type="hidden" name="fileName" value={prompt.fileName} />
              <button
                type="submit"
                className="btn-sm btn-sm--danger"
                disabled={deletePending}
                onClick={(e) => {
                  if (!confirm(`Delete '${prompt.fileName}'?`)) e.preventDefault();
                }}
              >
                {deletePending ? "…" : "Delete"}
              </button>
            </form>
          </div>
          {deleteState.status === "error" && (
            <span className="prompt-action-error">{deleteState.message}</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="prompt-expanded">
          <div className="prompt-section-label">System prompt</div>
          <pre className="prompt-pre">{prompt.systemPrompt}</pre>
          <div className="prompt-section-label">User prompt template</div>
          <pre className="prompt-pre">{prompt.userPromptTemplate}</pre>
        </div>
      )}

      {!expanded && (
        <>
          <div className="prompt-body">
            <strong>System:</strong>{" "}
            {prompt.systemPrompt.slice(0, 200)}
            {prompt.systemPrompt.length > 200 ? "…" : ""}
          </div>
          <div className="prompt-body mono">
            Template vars: {extractTemplateVars(prompt.userPromptTemplate)}
          </div>
        </>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────
// Edit form
// ─────────────────────────────────────────────

function PromptEditForm({
  prompt,
  dispatch,
  pending,
  state,
  onCancel,
}: {
  prompt: PromptTemplate;
  dispatch: (payload: FormData) => void;
  pending: boolean;
  state: PromptActionState;
  onCancel: () => void;
}) {
  return (
    <article className="prompt-item prompt-item--editing">
      <div className="prompt-name">{prompt.name}</div>
      <form action={dispatch} className="prompt-edit-form">
        <input type="hidden" name="fileName" value={prompt.fileName} />

        <div className="pef-row">
          <label className="pef-label" htmlFor={`mode-${prompt.fileName}`}>Mode</label>
          <select
            id={`mode-${prompt.fileName}`}
            name="mode"
            className="pef-select"
            defaultValue={prompt.mode}
          >
            <option value="text">text</option>
            <option value="decision">decision</option>
          </select>
        </div>

        <div className="pef-row">
          <label className="pef-label" htmlFor={`desc-${prompt.fileName}`}>Description</label>
          <input
            id={`desc-${prompt.fileName}`}
            name="description"
            className="pef-input"
            defaultValue={prompt.description}
            placeholder="What this prompt does"
          />
        </div>

        <div className="pef-row pef-row--col">
          <label className="pef-label" htmlFor={`sys-${prompt.fileName}`}>System prompt</label>
          <textarea
            id={`sys-${prompt.fileName}`}
            name="systemPrompt"
            className="pef-textarea"
            rows={6}
            defaultValue={prompt.systemPrompt}
          />
        </div>

        <div className="pef-row pef-row--col">
          <label className="pef-label" htmlFor={`tpl-${prompt.fileName}`}>User prompt template</label>
          <textarea
            id={`tpl-${prompt.fileName}`}
            name="userPromptTemplate"
            className="pef-textarea"
            rows={6}
            defaultValue={prompt.userPromptTemplate}
          />
        </div>

        {state.status === "error" && (
          <div className="prompt-action-error">{state.message}</div>
        )}

        <div className="pef-actions">
          <button type="submit" className="btn-sm btn-sm--primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </article>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function extractTemplateVars(template: string) {
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches?.length ? matches.join(" · ") : "no placeholders";
}