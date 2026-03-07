import type { RequestEntry } from "@/lib/dashboard-data";

export function RequestFeed({ requests }: { requests: RequestEntry[] }) {
  return (
    <div className="request-list">
      {requests.map((request) => (
        <article className="request-item" key={`${request.issueKey}-${request.timestamp}`}>
          <div className="request-head">
            <div>
              <div className="issue-key">{request.issueKey}</div>
              <div className="request-meta">{request.summary}</div>
            </div>
            <div className="chip-row">
              <span className="chip accent">{request.provider}</span>
              <span className={`chip ${request.classification === "needs_review" ? "warn" : ""}`}>{request.classification}</span>
              <span className="chip">{Math.round(request.confidence * 100)}% confidence</span>
            </div>
          </div>
          <div className="chip-row">
            <span className="chip">retrieved {request.retrievedCount}</span>
            <span className={`chip ${request.contradictions > 0 ? "warn" : ""}`}>contradictions {request.contradictions}</span>
            <span className={`chip ${request.financialImpact ? "warn" : "accent"}`}>
              {request.financialImpact ? "financial impact" : "no financial signal"}
            </span>
            <span className="chip">ready {request.readyForDev ? "yes" : "no"}</span>
          </div>
          <div className="request-meta mono">{request.timestamp}</div>
        </article>
      ))}
    </div>
  );
}