"use client";

import dynamic from "next/dynamic";
import type { SavedFlowDoc } from "@/lib/flow-store";

const PipelineCanvas = dynamic(
  () => import("@/components/pipeline-canvas").then((m) => m.PipelineCanvas),
  {
    ssr: false,
    loading: () => <div className="pc__loading">Carregando canvas…</div>,
  },
);

export function PipelineCanvasClient({ initialFlows }: { initialFlows: SavedFlowDoc[] }) {
  return <PipelineCanvas initialFlows={initialFlows} />;
}
