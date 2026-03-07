import type { TimelineStep } from "@/lib/dashboard-data";

interface FlowTimelineProps {
  steps: TimelineStep[];
}

export function FlowTimeline({ steps }: FlowTimelineProps) {
  return (
    <div className="timeline">
      {steps.map((step) => (
        <article className="timeline-item" key={step.phase}>
          <div className="mini-label">Phase {step.phase}</div>
          <div className="timeline-title">{step.title}</div>
          <div className="timeline-copy">{step.description}</div>
          <div className="timeline-tags">
            {step.tags.map((tag) => (
              <span className="chip accent" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}