"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { learningJourneyPresentationSlides } from "@/lib/learning-journey";

export function LearningJourneyPresentation() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(true);

  const slide = learningJourneyPresentationSlides[slideIndex];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown") {
        setSlideIndex((current) => Math.min(current + 1, learningJourneyPresentationSlides.length - 1));
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
        setSlideIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key.toLowerCase() === "f") {
        setFullscreen((current) => !current);
      }
      if (event.key === "Escape") {
        setFullscreen(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`journey-presentation ${fullscreen ? "journey-presentation--fullscreen" : ""}`}>
      <aside className="journey-presentation__rail">
        <div className="journey-presentation__rail-head">
          <div className="mini-label">Modo apresentacao</div>
          <h2>RAG Ainda e Necessario?</h2>
          <p>Deck tecnico com {learningJourneyPresentationSlides.length} slides, ancorado no acervo local e pronto para defesa tecnica com o time.</p>
        </div>

        <div className="journey-presentation__list">
          {learningJourneyPresentationSlides.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`journey-presentation__jump ${index === slideIndex ? "journey-presentation__jump--active" : ""}`}
              onClick={() => setSlideIndex(index)}
            >
              <span className="journey-presentation__jump-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="journey-presentation__jump-copy">
                <strong>{item.title}</strong>
                <span>{item.eyebrow}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="journey-presentation__rail-footer">
          <Link className="button" href="/apresentacao">
            Abrir pagina da apresentacao
          </Link>
        </div>
      </aside>

      <section className="journey-presentation__stage">
        <div className="journey-presentation__topbar">
          <div className="journey-presentation__meta">
            <span className="eyebrow">{slide.eyebrow}</span>
            <span className="journey-presentation__counter">
              {slideIndex + 1} / {learningJourneyPresentationSlides.length}
            </span>
          </div>

          <div className="button-row journey-button-row">
            <button className="button" type="button" onClick={() => setShowNotes((current) => !current)}>
              {showNotes ? "Ocultar notas" : "Mostrar notas"}
            </button>
            <button className="button" type="button" onClick={() => setFullscreen((current) => !current)}>
              {fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            </button>
          </div>
        </div>

        <article className="journey-slide">
          <div className="journey-slide__surface">
            <div className="journey-slide__header">
              <div className="journey-slide__index">{String(slideIndex + 1).padStart(2, "0")}</div>
              <div>
                <h1>{slide.title}</h1>
                <p className="journey-slide__subtitle">{slide.subtitle}</p>
              </div>
            </div>

            <ul className="journey-slide__bullets">
              {slide.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>

            {slide.highlight ? <div className="journey-slide__highlight">{slide.highlight}</div> : null}
            {slide.note ? <p className="journey-slide__note">{slide.note}</p> : null}

            {showNotes && slide.speakerNotes?.length ? (
              <section className="journey-slide__speaker-notes">
                <div className="journey-slide__speaker-notes-title">Notas de apresentacao</div>
                <ul className="journey-slide__speaker-notes-list">
                  {slide.speakerNotes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {slide.links?.length ? (
              <div className="button-row journey-button-row">
                {slide.links.map((item) => (
                  <Link className="button" href={item.href} key={item.href}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <div className="journey-presentation__controls">
          <button
            className="journey-presentation__nav"
            type="button"
            disabled={slideIndex === 0}
            onClick={() => setSlideIndex((current) => Math.max(current - 1, 0))}
          >
            ← Anterior
          </button>

          <div className="journey-presentation__hint">Use ← →, F e o painel de notas durante a apresentacao.</div>

          <button
            className="journey-presentation__nav"
            type="button"
            disabled={slideIndex === learningJourneyPresentationSlides.length - 1}
            onClick={() => setSlideIndex((current) => Math.min(current + 1, learningJourneyPresentationSlides.length - 1))}
          >
            Proximo →
          </button>
        </div>
      </section>
    </div>
  );
}