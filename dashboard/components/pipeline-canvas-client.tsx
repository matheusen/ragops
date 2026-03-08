"use client";

import dynamic from "next/dynamic";
import type { SavedFlow } from "@/components/pipeline-canvas";

const PipelineCanvas = dynamic(
  () => import("@/components/pipeline-canvas").then((m) => m.PipelineCanvas),
  {
    ssr: false,
    loading: () => <div className="pc__loading">Carregando canvas…</div>,
  },
);

export function PipelineCanvasClient({ initialFlows }: { initialFlows: SavedFlow[] }) {
  return <PipelineCanvas initialFlows={initialFlows} />;
}
