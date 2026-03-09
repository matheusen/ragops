"use client";

import type { ResultAudit } from "@/lib/results-data";

export function RuntimeTechniquesPanel({ audit }: { audit: ResultAudit }) {
  const runtime = audit.runtime_view;
  if (!runtime) return null;

  return (
    <section className="rtp">
      <div className="rtp__head">
        <div>
          <span className="eyebrow">results</span>
          <h2 className="rtp__title">Tecnicas aplicadas</h2>
          <p className="rtp__copy">{runtime.summary}</p>
        </div>
        <div className="rtp__chips">
          <span className="rtp__chip">{runtime.flow_mode}</span>
          <span className="rtp__chip">{runtime.execution_path}</span>
          <span className="rtp__chip">{runtime.provider}</span>
          <span className="rtp__chip">{runtime.model}</span>
          {runtime.prompt_name && <span className="rtp__chip">{runtime.prompt_name}</span>}
        </div>
      </div>

      {runtime.techniques.length > 0 && (
        <div className="rtp__grid">
          {runtime.techniques.map((item) => (
            <article key={item.id} className="rtp__card">
              <div className="rtp__label">{item.label}</div>
              {item.value && <div className="rtp__value">{item.value}</div>}
              {item.detail && <p className="rtp__detail">{item.detail}</p>}
            </article>
          ))}
        </div>
      )}

      {(runtime.query_text || runtime.trace_nodes.length > 0 || runtime.supported_runtime_nodes.length > 0) && (
        <div className="rtp__meta">
          {runtime.query_text && (
            <div className="rtp__meta-row">
              <span className="rtp__meta-label">Query</span>
              <span className="rtp__meta-value">{runtime.query_text}</span>
            </div>
          )}
          {runtime.trace_nodes.length > 0 && (
            <div className="rtp__meta-row">
              <span className="rtp__meta-label">Trace</span>
              <span className="rtp__meta-value">{runtime.trace_nodes.join(" -> ")}</span>
            </div>
          )}
          {runtime.supported_runtime_nodes.length > 0 && (
            <div className="rtp__meta-row">
              <span className="rtp__meta-label">Nos do runtime</span>
              <span className="rtp__meta-value">{runtime.supported_runtime_nodes.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      {runtime.ignored_nodes.length > 0 && (
        <article className="rtp__note">
          <div className="rtp__label">Nos ignorados</div>
          <p className="rtp__detail">{runtime.ignored_nodes.join(", ")}</p>
        </article>
      )}

      {runtime.warnings.length > 0 && (
        <article className="rtp__note rtp__note--warn">
          <div className="rtp__label">Avisos do runtime</div>
          <ul className="rtp__list">
            {runtime.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </article>
      )}
    </section>
  );
}
