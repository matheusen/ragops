import type { ReactNode } from "react";

interface SectionCardProps {
  eyeline: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function SectionCard({ eyeline, title, description, children }: SectionCardProps) {
  return (
    <section className="section-card">
      <div className="section-head">
        <div>
          <div className="eyeline">{eyeline}</div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}