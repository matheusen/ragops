import { aiEvolutionStages } from "@/lib/learning-journey";

export function AiEvolutionTimeline() {
  return (
    <div className="ai-evolution">
      <div className="ai-evolution__intro">
        <div>
          <div className="mini-label">Concept ladder</div>
          <h3>IA, attention, Transformer e LLM nao ficam no mesmo nivel conceitual</h3>
        </div>
        <p>
          A leitura correta e progressiva: campo, paradigma de aprendizado, mecanismo, arquitetura, modelo em escala e, por fim, sistema com retrieval e orquestracao.
        </p>
      </div>

      <div className="ai-evolution__rail" aria-hidden="true" />

      <div className="ai-evolution__grid">
        {aiEvolutionStages.map((stage) => (
          <article className="ai-stage" key={stage.step}>
            <div className="ai-stage__marker">
              <span>{stage.step}</span>
            </div>
            <div className="ai-stage__body">
              <div className="chip accent">{stage.label}</div>
              <h4>{stage.title}</h4>
              <p>{stage.summary}</p>
              <div className="ai-stage__pivot">{stage.pivot}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}