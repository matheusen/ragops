export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultCanvas } from "@/components/result-canvas";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000") + "/api/v1";

async function fetchAudit(issueKey: string, timestamp: string) {
  const r = await fetch(`${API_BASE}/audit/results/${issueKey}/${timestamp}`, {
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

interface Props {
  params: { id: string };
}

export default async function ResultCanvasPage({ params }: Props) {
  // id format: ISSUEKEY__TIMESTAMP
  const [issueKey, timestamp] = decodeURIComponent(params.id).split("__");
  if (!issueKey || !timestamp) notFound();

  const audit = await fetchAudit(issueKey, timestamp);
  if (!audit) notFound();

  return (
    <main className="page page--canvas">
      <div className="rc__breadcrumb">
        <Link href="/results" className="rc__breadcrumb-back">← Resultados</Link>
        <span className="rc__breadcrumb-sep">/</span>
        <span className="rc__breadcrumb-id">{issueKey}</span>
        <span className="rc__breadcrumb-ts">{timestamp}</span>
      </div>
      <ResultCanvas audit={audit} />
    </main>
  );
}
