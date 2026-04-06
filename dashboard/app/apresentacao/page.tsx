import Link from "next/link";

import { AiEvolutionTimeline } from "@/components/ai-evolution-timeline";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import {
  dashboardConceptExamples,
  developerCareerStages,
  developerMarketShifts,
  developerValueCapabilities,
} from "@/lib/learning-journey";

export const dynamic = "force-dynamic";

const presentationActs = [
  {
    step: "Ato 1",
    title: "Separar os niveis da conversa",
    summary: "Comece mostrando que IA, machine learning, deep learning, attention, Transformer, LLM, RAG e agentes pertencem a camadas conceituais diferentes.",
    message: "Sem essa separacao, o time repete termos conhecidos, mas nao enxerga onde termina o modelo e onde comeca o sistema.",
  },
  {
    step: "Ato 2",
    title: "Mostrar como texto vira computacao",
    summary: "Explique tokenizacao, IDs, embeddings, posicao e a passagem pelos blocos Transformer como uma cadeia de transformacoes sobre vetores.",
    message: "A equipe precisa sair entendendo que o modelo nao le como humano; ele recalcula contexto matematico a cada camada.",
  },
  {
    step: "Ato 3",
    title: "Explicar por que o Transformer mudou o jogo",
    summary: "Apresente attention como mecanismo e Transformer como arquitetura que resolveu paralelizacao e tratamento de contexto muito melhor que arquiteturas sequenciais antigas.",
    message: "Esse e o ponto em que o time entende por que os LLMs modernos ganharam escala real.",
  },
  {
    step: "Ato 4",
    title: "Deixar claro o limite do LLM puro",
    summary: "Fale de conhecimento parametrico, cutoff, falta de grounding, contexto corporativo e ausencia de evidencia auditavel na resposta.",
    message: "Fluencia nao garante confiabilidade. Em ambiente real, isso vira risco de produto e operacao.",
  },
  {
    step: "Ato 5",
    title: "Fechar com RAG e valor de negocio",
    summary: "Mostre que RAG nao e um truque interno do modelo, mas uma arquitetura de sistema com ingestao, retrieval, reranking, prompt assembly, resposta e avaliacao.",
    message: "O ganho real nao esta so no modelo; esta em conectar o modelo a memoria, contexto e controle de qualidade.",
  },
  {
    step: "Ato 6",
    title: "Traduzir tudo para o papel do desenvolvedor",
    summary: "Feche a apresentacao explicando como o valor profissional sobe de digitacao para framing, arquitetura, integracao, validacao e governanca.",
    message: "A automacao aumenta a exigencia de criterio tecnico. O profissional relevante passa a decidir melhor, nao apenas a produzir mais linhas.",
  },
];

const presentationPrinciples = [
  "Attention e mecanismo.",
  "Transformer e arquitetura.",
  "LLM e modelo em escala, geralmente baseado em Transformer.",
  "RAG e arquitetura de sistema em torno do modelo.",
];

const presentationOutcomes = [
  "Entender a escada IA -> machine learning -> deep learning -> attention -> Transformer -> LLM -> RAG -> agentes.",
  "Explicar, sem jargao vazio, como texto vira token, vetor, contexto e resposta.",
  "Reconhecer por que um LLM puro falha em cenario corporativo e por que RAG entra na arquitetura.",
  "Conectar a teoria a telas reais do produto e ao valor do desenvolvedor no mercado atual.",
];

const facilitationSteps = [
  {
    step: "01",
    title: "Abra pela confusao mais comum",
    copy: "Comece perguntando o que a equipe acha que e IA, LLM e RAG. Depois mostre a escada conceitual correta para nivelar o vocabulario.",
  },
  {
    step: "02",
    title: "Troque definicao solta por fluxo",
    copy: "Em vez de explicar so termos, mostre o caminho: texto -> token -> embedding -> Transformer -> LLM -> retrieval -> resposta com evidencia.",
  },
  {
    step: "03",
    title: "Sempre ligue conceito a sistema",
    copy: "Cada bloco teorico deve terminar em uma pergunta pratica: onde isso aparece no produto, no custo, no risco ou na qualidade da resposta?",
  },
  {
    step: "04",
    title: "Feche com impacto profissional",
    copy: "A melhor sintese para o time e mostrar que IA nao elimina engenharia; ela desloca valor para desenho de sistema, avaliacao e responsabilidade tecnica.",
  },
];

function capabilityTitle(title: string) {
  if (title === "Problem framing") {
    return "Enquadramento do problema";
  }

  return title;
}

export default function ApresentacaoPage() {
  return (
    <main className="page study-presentation-page">
      <PageHeader
        eyebrow="Apresentacao"
        title="Do token ao RAG"
        description="Uma pagina em portugues para apresentar ao time a evolucao da IA, o funcionamento do LLM, a entrada do RAG e o que isso muda para quem desenvolve software."
      />

      <section className="presentation-hero">
        <div className="presentation-hero__copy">
          <span className="chip accent">Material pronto para alinhamento tecnico</span>
          <h2>O LLM e o motor de geracao, mas a qualidade real depende da cadeia inteira.</h2>
          <p>
            Esta pagina condensa o estudo em uma narrativa curta e apresentavel: como a IA evoluiu, como o texto entra no modelo, por que o
            Transformer ganhou escala, onde o LLM puro falha e por que o RAG entra como arquitetura de sistema.
          </p>
          <div className="button-row journey-button-row">
            <Link className="button" href="/learning-journey/presentation">
              Abrir modo slides
            </Link>
            <Link className="button" href="/learning-journey">
              Abrir jornada completa
            </Link>
            <Link className="button" href="/article">
              Abrir workspace do artigo
            </Link>
          </div>
        </div>

        <div className="presentation-hero__panel">
          <div className="mini-label">Mensagem central</div>
          <blockquote>
            O modelo importa, mas o resultado em ambiente real nasce da combinacao entre tokenizacao, arquitetura, contexto, retrieval,
            grounding, orquestracao e validacao.
          </blockquote>
          <div className="presentation-hero__panel-note">
            Use esta frase como abertura ou fechamento. Ela resume o estudo inteiro sem colapsar conceitos diferentes no mesmo nivel.
          </div>
        </div>
      </section>

      <SectionCard
        eyeline="Mapa conceitual"
        title="A escada que organiza a conversa"
        description="A forma mais segura de apresentar o tema e manter separado o que e campo, paradigma, mecanismo, arquitetura, modelo e sistema."
      >
        <AiEvolutionTimeline />
      </SectionCard>

      <SectionCard
        eyeline="Roteiro narrativo"
        title="Seis atos para conduzir a apresentacao"
        description="Cada ato resolve uma duvida comum da equipe e prepara o proximo bloco sem saltos conceituais."
      >
        <div className="presentation-act-grid">
          {presentationActs.map((act) => (
            <article className="presentation-act" key={act.title}>
              <div className="presentation-act__step">{act.step}</div>
              <h3>{act.title}</h3>
              <p>{act.summary}</p>
              <div className="presentation-act__message">{act.message}</div>
            </article>
          ))}
        </div>
      </SectionCard>

      <div className="section-grid section-grid-tight">
        <SectionCard
          eyeline="Distincao critica"
          title="Quatro regras que precisam ficar estaveis"
          description="Essas frases evitam a confusao mais comum em explicacoes sobre IA aplicada."
        >
          <div className="presentation-principles">
            {presentationPrinciples.map((item) => (
              <div className="presentation-principle" key={item}>
                {item}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          eyeline="Resultado esperado"
          title="O que o time deve sair sabendo"
          description="Se estes quatro pontos ficaram claros, a apresentacao cumpriu o objetivo."
        >
          <div className="presentation-outcome-grid">
            {presentationOutcomes.map((item) => (
              <article className="presentation-outcome" key={item}>
                <span className="chip accent">Objetivo</span>
                <p>{item}</p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        eyeline="Relevancia profissional"
        title="Onde o desenvolvedor agrega valor na era da IA"
        description="Quanto mais a automacao sobe, mais valor profissional sobe para criterio, arquitetura, integracao, avaliacao e governanca."
      >
        <div className="journey-market-grid">
          {developerValueCapabilities.slice(0, 6).map((capability) => (
            <article className="journey-capability" key={capability.title}>
              <h3>{capabilityTitle(capability.title)}</h3>
              <p>{capability.summary}</p>
              <div className="journey-capability__leverage">{capability.leverage}</div>
            </article>
          ))}
        </div>

        <div className="journey-shift-block">
          <div className="mini-label">Mudanca de valor no mercado</div>
          <div className="journey-shift-list">
            {developerMarketShifts.slice(0, 4).map((shift) => (
              <article className="journey-shift" key={shift.from}>
                <div>
                  <span className="chip warn">Perde peso relativo</span>
                  <p>{shift.from}</p>
                </div>
                <div className="journey-shift__arrow">→</div>
                <div>
                  <span className="chip success">Ganha valor</span>
                  <p>{shift.to}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyeline="Roadmap de crescimento"
        title="Como isso conversa com junior, pleno e senior"
        description="A mesma transformacao tecnologica gera exigencias diferentes conforme o nivel de senioridade."
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
        eyeline="No produto"
        title="Onde cada conceito aparece no dashboard"
        description="Amarre a teoria a uma tela real para transformar a apresentacao em capacidade concreta do time."
      >
        <div className="journey-example-list">
          {dashboardConceptExamples.map((item) => (
            <article className="journey-example" key={item.concept}>
              <div className="journey-example__head">
                <div>
                  <div className="mini-label">Conceito</div>
                  <h3>{item.concept}</h3>
                </div>
                <Link className="button" href={item.route}>
                  Abrir tela
                </Link>
              </div>
              <p className="journey-example__copy">{item.explanation}</p>
              <div className="journey-example__note">{item.example}</div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyeline="Conducao"
        title="Como usar esta pagina numa apresentacao ao vivo"
        description="A logica abaixo ajuda a evitar uma aula abstrata demais ou uma demo desconectada dos fundamentos."
      >
        <div className="presentation-flow">
          {facilitationSteps.map((item) => (
            <article className="presentation-flow__step" key={item.step}>
              <div className="presentation-flow__index">{item.step}</div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </main>
  );
}