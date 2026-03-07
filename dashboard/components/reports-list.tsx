import type { ComparisonReport } from "@/lib/dashboard-data";

export function ReportsList({ reports }: { reports: ComparisonReport[] }) {
  return (
    <div className="comparison-list">
      {reports.length ? (
        reports.map((report) => (
          <article className="comparison-item" key={report.fileName}>
            <div className="comparison-head">
              <div className="comparison-title">{report.fileName}</div>
              <span className="chip accent">{report.scenarioCount} scenarios</span>
            </div>
            <div className="comparison-body">Dataset: {report.datasetPath}</div>
            <div className="comparison-body mono">Generated at: {report.generatedAt}</div>
          </article>
        ))
      ) : (
        <article className="comparison-item">
          <div className="comparison-title">No comparison reports yet</div>
          <div className="comparison-body">Run the Python evaluation compare flow and reports will appear here automatically.</div>
        </article>
      )}
    </div>
  );
}