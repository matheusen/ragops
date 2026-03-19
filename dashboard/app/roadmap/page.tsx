export const dynamic = "force-dynamic";

import { RoadmapGenerator } from "@/components/roadmap-generator";

export default function RoadmapPage() {
  return (
    <main className="page page--canvas">
      <RoadmapGenerator />
    </main>
  );
}
