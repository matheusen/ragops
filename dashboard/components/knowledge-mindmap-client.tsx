"use client";

import dynamic from "next/dynamic";

const KnowledgeMindmap = dynamic(
  () => import("@/components/knowledge-mindmap").then((m) => m.KnowledgeMindmap),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "500px", color: "var(--text-tertiary)", fontSize: ".9rem" }}>
        Carregando mindmap…
      </div>
    ),
  }
);

export function KnowledgeMindmapClient() {
  return <KnowledgeMindmap />;
}
