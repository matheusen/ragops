import Link from "next/link";

import { AiEvolutionTimeline } from "@/components/ai-evolution-timeline";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import {
  dashboardConceptExamples,
  developerCareerStages,
  developerMarketShifts,
  developerValueCapabilities,
  learningModules,
} from "@/lib/learning-journey";

export const dynamic = "force-dynamic";

export default function LearningJourneyPage() {
  return (
    <main className="page learning-page">
      <PageHeader
        eyebrow="Learning Journey"
        title="From AI to RAG"
        description="A dedicated walkthrough of the conceptual ladder from symbolic AI to attention, Transformers, LLMs, RAG and agents, plus the capabilities that keep software developers valuable in an AI-heavy market."
      />

      <div className="button-row journey-button-row">
        <Link className="button" href="/apresentacao">
          Open PT presentation page
        </Link>
      </div>

      <SectionCard
        eyeline="Concept map"
        title="One ladder, multiple abstraction levels"
        description="Keep field, learning paradigm, mechanism, architecture, model scale and system orchestration separated."
      >
        <div className="summary-panel">
          <AiEvolutionTimeline />
          <div className="button-row journey-button-row">
            <Link className="button" href="/learning-journey/presentation">
              Open presentation mode
            </Link>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyeline="Module index"
        title="Jump straight to the teaching modules"
        description="Use the anchor map below to navigate the journey in teaching order, from historical evolution to RAG limitations."
      >
        <div className="journey-anchor-grid">
          {learningModules.map((module) => (
            <a className="journey-anchor" href={`#${module.id}`} key={module.id}>
              <span className="chip accent">{module.shortLabel}</span>
              <span className="journey-anchor__title">{module.title}</span>
            </a>
          ))}
        </div>
      </SectionCard>

      <div className="journey-module-list">
        {learningModules.map((module) => (
          <section className="journey-module" id={module.id} key={module.id}>
            <div className="journey-module__header">
              <div className="journey-module__label">{module.shortLabel}</div>
              <div>
                <h2>{module.title}</h2>
                <p>{module.summary}</p>
              </div>
            </div>

            <div className="journey-module__grid">
              <article className="journey-note">
                <div className="mini-label">Teaching focus</div>
                <p>{module.focus}</p>
              </article>
              <article className="journey-note">
                <div className="mini-label">Key question</div>
                <p>{module.keyQuestion}</p>
              </article>
            </div>

            {module.links?.length ? (
              <div className="button-row journey-button-row">
                {module.links.map((item) => (
                  <Link className="button" href={item.href} key={item.href}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <SectionCard
        eyeline="Market relevance"
        title="What makes a software developer valuable in the AI era"
        description="As automation grows, value shifts away from repetitive code production and toward framing, architecture, integration, validation and accountability."
      >
        <div className="journey-market-grid">
          {developerValueCapabilities.map((capability) => (
            <article className="journey-capability" key={capability.title}>
              <h3>{capability.title}</h3>
              <p>{capability.summary}</p>
              <div className="journey-capability__leverage">{capability.leverage}</div>
            </article>
          ))}
        </div>

        <div className="journey-shift-block">
          <div className="mini-label">Market shift</div>
          <div className="journey-shift-list">
            {developerMarketShifts.map((shift) => (
              <article className="journey-shift" key={shift.from}>
                <div>
                  <span className="chip warn">Loses relative value</span>
                  <p>{shift.from}</p>
                </div>
                <div className="journey-shift__arrow">→</div>
                <div>
                  <span className="chip success">Gains value</span>
                  <p>{shift.to}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyeline="Career roadmap"
        title="How junior, mid and senior developers stay relevant"
        description="Use the ladder below as a practical growth path for the team instead of treating AI as a generic productivity topic."
      >
        <div className="journey-career-grid">
          {developerCareerStages.map((stage) => (
            <article className="journey-career-card" key={stage.level}>
              <div className="journey-career-card__top">
                <span className="chip accent">{stage.level}</span>
                <h3>{stage.headline}</h3>
              </div>
              <p className="journey-career-card__goal">{stage.goal}</p>
              <ul className="journey-career-card__list">
                {stage.priorities.map((priority) => (
                  <li key={priority}>{priority}</li>
                ))}
              </ul>
              <div className="journey-career-card__value">{stage.marketValue}</div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyeline="Concrete examples"
        title="Where the concepts appear in this product"
        description="Anchor each concept in a real screen so the team can move from explanation to concrete system behavior."
      >
        <div className="journey-example-list">
          {dashboardConceptExamples.map((item) => (
            <article className="journey-example" key={item.concept}>
              <div className="journey-example__head">
                <div>
                  <div className="mini-label">Concept</div>
                  <h3>{item.concept}</h3>
                </div>
                <Link className="button" href={item.route}>
                  {item.routeLabel}
                </Link>
              </div>
              <p className="journey-example__copy">{item.explanation}</p>
              <div className="journey-example__note">{item.example}</div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="section-grid section-grid-tight">
        <SectionCard
          eyeline="Apply"
          title="Turn the journey into runtime artifacts"
          description="Keep the learning page tied to the operational parts of the product instead of leaving it as a dead-end explanation."
        >
          <div className="button-row journey-button-row">
            <Link className="button" href="/learning-journey/presentation">
              Open presentation mode
            </Link>
            <Link className="button" href="/roadmap">
              Open roadmap builder
            </Link>
            <Link className="button" href="/article">
              Open article workspace
            </Link>
            <Link className="button" href="/flow">
              Open flow canvas
            </Link>
          </div>
        </SectionCard>

        <SectionCard
          eyeline="Reading rule"
          title="Keep the distinctions stable"
          description="This page exists to stop the most common conceptual collapse in AI explanations."
        >
          <div className="summary-panel">
            <div className="journey-rule">Attention is a mechanism.</div>
            <div className="journey-rule">Transformer is an architecture.</div>
            <div className="journey-rule">LLM is a large-scale model, usually built on Transformers.</div>
            <div className="journey-rule">RAG is a system architecture around the model.</div>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}