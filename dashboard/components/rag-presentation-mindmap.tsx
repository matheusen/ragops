"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type ReferenceId =
  | "gao-survey"
  | "blended-rag"
  | "rag-stack"
  | "rag-review-2025"
  | "byokg-rag"
  | "tigervector"
  | "fair-rag";

type MindmapItem = {
  id: string;
  type: "goal" | "branch" | "topic";
  title: string;
  summary: string;
  bullets?: string[];
  branchId?: string;
  referenceIds?: ReferenceId[];
  position: { x: number; y: number };
  color?: string;
};

type ReferenceCard = {
  id: ReferenceId;
  title: string;
  year: string;
  metadataPath: string;
  whyItMatters: string;
  linkedTopics: string[];
};

const BRANCH_COLORS = ["#4f7df3", "#22a06b", "#e57c2f", "#9c6ef8", "#0ea5e9", "#f43f5e"];

const REFERENCE_CARDS: ReferenceCard[] = [
  {
    id: "gao-survey",
    title: "Retrieval-Augmented Generation for Large Language Models: A Survey",
    year: "2023",
    metadataPath: "scripts/article_scraper/results/metadata/hash_6da4a4bdd193.json",
    whyItMatters: "Base para separar naive, advanced e modular RAG como familia de arquiteturas.",
    linkedTopics: ["Taxonomia do RAG", "Tese consolidada", "O que morreu foi o naive RAG"],
  },
  {
    id: "blended-rag",
    title: "Blended RAG: Improving RAG Accuracy with Semantic Search and Hybrid Query-Based Retrievers",
    year: "2024",
    metadataPath: "scripts/article_scraper/results/metadata/10.1109_MIPR62202.2024.00031.json",
    whyItMatters: "Evidencia que hybrid retrieval melhora o retriever e sobe a qualidade do pipeline inteiro.",
    linkedTopics: ["Papers-base", "Quando semantic search basta", "Arquitetura recomendada"],
  },
  {
    id: "rag-stack",
    title: "Engineering the RAG Stack: A Comprehensive Review of the Architecture and Trust Frameworks for RAG Systems",
    year: "2025",
    metadataPath: "scripts/article_scraper/results/metadata/hash_95d62dad6afc.json",
    whyItMatters: "Leva a conversa para trust, governance, seguranca, deployment e taxonomia de arquitetura.",
    linkedTopics: ["Acervo e tese", "Arquitetura recomendada", "Fechamento"],
  },
  {
    id: "rag-review-2025",
    title: "A Systematic Review of Key Retrieval-Augmented Generation (RAG) Systems: Progress, Gaps, and Future Directions",
    year: "2025",
    metadataPath: "scripts/article_scraper/results/metadata/10.48550_arXiv.2507.18910.json",
    whyItMatters: "Conecta hybrid retrieval, agentic RAG, latency, security e integration overhead.",
    linkedTopics: ["Acervo e tese", "Arquitetura recomendada", "Demo e fechamento"],
  },
  {
    id: "byokg-rag",
    title: "BYOKG-RAG: Multi-Strategy Graph Retrieval for Knowledge Graph Question Answering",
    year: "2025",
    metadataPath: "scripts/article_scraper/results/metadata/10.48550_arXiv.2507.04127.json",
    whyItMatters: "Sustenta graph retrieval multi-estrategia em knowledge graphs customizados.",
    linkedTopics: ["Graph retrieval", "Quando grafos agregam", "Demo e fechamento"],
  },
  {
    id: "tigervector",
    title: "TigerVector: Supporting Vector Search in Graph Databases for Advanced RAGs",
    year: "2025",
    metadataPath: "scripts/article_scraper/results/metadata/10.1145_3722212.3724456.json",
    whyItMatters: "Mostra que advanced RAG tambem e escolha de storage e query model.",
    linkedTopics: ["Graph retrieval", "Arquitetura recomendada", "Demo e fechamento"],
  },
  {
    id: "fair-rag",
    title: "FAIR-RAG: Faithful Adaptive Iterative Refinement for Retrieval-Augmented Generation",
    year: "2025",
    metadataPath: "scripts/article_scraper/results/metadata/hash_044972aa8c0c.json",
    whyItMatters: "Mostra por que perguntas multi-hop pedem evidencia faltante, nova query e iteracao.",
    linkedTopics: ["Graph retrieval", "Arquitetura recomendada", "Demo e fechamento"],
  },
];

const MINDMAP_ITEMS: MindmapItem[] = [
  {
    id: "goal",
    type: "goal",
    title: "RAG ainda e necessario?",
    summary: "O que enfraqueceu foi o naive RAG. O que continua necessario e o grounding com retrieval maduro, relacional e avaliavel.",
    bullets: [
      "semantic search e retrieval",
      "grafo e retrieval relacional",
      "RAG e retrieval + generation + grounding",
    ],
    position: { x: 520, y: 360 },
  },
  {
    id: "branch-acervo",
    type: "branch",
    title: "Acervo e tese",
    summary: "O corpus local sustenta bem hybrid retrieval, evaluation e graph-assisted retrieval.",
    bullets: ["1308 PDFs", "1078 metadata", "677 sinais amplos"],
    position: { x: 470, y: 70 },
    color: BRANCH_COLORS[0],
  },
  {
    id: "acervo-corpus",
    type: "topic",
    branchId: "branch-acervo",
    title: "Leitura do corpus",
    summary: "A busca literal no metadata mostrou pouca presenca explicita de context engineering e semantic layer, mas boa base para RAG moderno.",
    bullets: ["GraphRAG = 1", "hybrid retrieval = 4", "evaluation = 26"],
    position: { x: 390, y: -110 },
    color: BRANCH_COLORS[0],
    referenceIds: ["rag-stack", "rag-review-2025"],
  },
  {
    id: "acervo-thesis",
    type: "topic",
    branchId: "branch-acervo",
    title: "Tese consolidada",
    summary: "O miolo tecnico vem do acervo local; a moldura conceitual recente completa o vocabulario de contexto e governanca.",
    bullets: ["naive RAG enfraqueceu", "grounding continua central"],
    position: { x: 620, y: -90 },
    color: BRANCH_COLORS[0],
    referenceIds: ["gao-survey", "rag-stack", "rag-review-2025"],
  },
  {
    id: "branch-papers",
    type: "branch",
    title: "Papers-base",
    summary: "Survey, hybrid retrieval e trust frameworks sustentam a espinha do argumento.",
    bullets: ["Gao", "Blended RAG", "RAG Stack + Review"],
    position: { x: 860, y: 250 },
    color: BRANCH_COLORS[1],
  },
  {
    id: "papers-taxonomy",
    type: "topic",
    branchId: "branch-papers",
    title: "Taxonomia do RAG",
    summary: "Gao et al. organizam naive, advanced e modular RAG e evitam tratar RAG como pipeline unico.",
    position: { x: 1080, y: 150 },
    color: BRANCH_COLORS[1],
    referenceIds: ["gao-survey"],
  },
  {
    id: "papers-hybrid",
    type: "topic",
    branchId: "branch-papers",
    title: "Hybrid retrieval ganha por engenharia",
    summary: "Blended RAG reforca que dense + sparse + blending melhoram o retriever e elevam a qualidade do sistema.",
    bullets: ["87% em TREC-COVID"],
    position: { x: 1120, y: 320 },
    color: BRANCH_COLORS[1],
    referenceIds: ["blended-rag"],
  },
  {
    id: "papers-trust",
    type: "topic",
    branchId: "branch-papers",
    title: "Trust e deployment",
    summary: "Em 2025, a literatura ja trata RAG como problema de arquitetura, custo, seguranca, privacy e observabilidade.",
    position: { x: 980, y: 470 },
    color: BRANCH_COLORS[1],
    referenceIds: ["rag-stack", "rag-review-2025"],
  },
  {
    id: "branch-graph",
    type: "branch",
    title: "Graph retrieval",
    summary: "Grafo agrega quando a pergunta pede ligacoes, multi-hop, dependencia e causalidade.",
    bullets: ["BYOKG-RAG", "TigerVector", "FAIR-RAG"],
    position: { x: 760, y: 620 },
    color: BRANCH_COLORS[2],
  },
  {
    id: "graph-byokg",
    type: "topic",
    branchId: "branch-graph",
    title: "Multi-estrategia em grafo",
    summary: "BYOKG-RAG mostra que graph retrieval serio combina entidades, paths e query language em grafos customizados.",
    bullets: ["+4.5 pontos"],
    position: { x: 940, y: 760 },
    color: BRANCH_COLORS[2],
    referenceIds: ["byokg-rag"],
  },
  {
    id: "graph-storage",
    type: "topic",
    branchId: "branch-graph",
    title: "Infraestrutura tambem decide",
    summary: "TigerVector mostra que advanced RAG depende de substrate que unifique grafo e vetor.",
    position: { x: 760, y: 860 },
    color: BRANCH_COLORS[2],
    referenceIds: ["tigervector"],
  },
  {
    id: "graph-iterative",
    type: "topic",
    branchId: "branch-graph",
    title: "Lacuna de evidencia",
    summary: "FAIR-RAG mostra por que perguntas complexas pedem identificar o que falta e iterar na busca.",
    bullets: ["SEA", "multi-hop"],
    position: { x: 560, y: 860 },
    color: BRANCH_COLORS[2],
    referenceIds: ["fair-rag"],
  },
  {
    id: "branch-distinction",
    type: "branch",
    title: "Distincoes",
    summary: "Semantic search, graph retrieval e RAG nao competem no mesmo nivel de abstracao.",
    bullets: ["retrieval != system architecture"],
    position: { x: 250, y: 620 },
    color: BRANCH_COLORS[3],
  },
  {
    id: "dist-when-semantic",
    type: "topic",
    branchId: "branch-distinction",
    title: "Quando semantic search basta",
    summary: "Descoberta, similares, clustering e exploracao assistida por humano normalmente nao exigem generation final.",
    position: { x: 70, y: 760 },
    color: BRANCH_COLORS[3],
    referenceIds: ["blended-rag"],
  },
  {
    id: "dist-when-graph",
    type: "topic",
    branchId: "branch-distinction",
    title: "Quando grafo agrega mais",
    summary: "Multi-hop, analise de impacto, desambiguacao por entidade e root-cause chains pedem retrieval relacional.",
    position: { x: 250, y: 860 },
    color: BRANCH_COLORS[3],
    referenceIds: ["byokg-rag", "tigervector"],
  },
  {
    id: "dist-where-rag",
    type: "topic",
    branchId: "branch-distinction",
    title: "Onde RAG continua necessario",
    summary: "Sintese multi-documento, resposta natural, justificativa com evidence e reducao de carga cognitiva continuam pedindo generation grounded.",
    position: { x: 450, y: 760 },
    color: BRANCH_COLORS[3],
    referenceIds: ["gao-survey", "rag-review-2025"],
  },
  {
    id: "branch-architecture",
    type: "branch",
    title: "Arquitetura recomendada",
    summary: "O pipeline moderno combina query understanding, retrievers multiplos, rerank, compression e LLM no fim.",
    bullets: ["dense", "sparse", "graph", "exact"],
    position: { x: 150, y: 250 },
    color: BRANCH_COLORS[4],
  },
  {
    id: "arch-naive",
    type: "topic",
    branchId: "branch-architecture",
    title: "O que morreu foi o naive RAG",
    summary: "Top-k vetorial fixo, sem rerank, sem metadado, sem grafo e sem avaliacao nao fecha cenarios grandes e enterprise.",
    position: { x: -70, y: 150 },
    color: BRANCH_COLORS[4],
    referenceIds: ["gao-survey", "blended-rag"],
  },
  {
    id: "arch-pipeline",
    type: "topic",
    branchId: "branch-architecture",
    title: "Pipeline de grounding",
    summary: "Query understanding decide retrieval, fusion + rerank limpam recall e compression reduz ruidao antes da geracao final.",
    position: { x: -110, y: 320 },
    color: BRANCH_COLORS[4],
    referenceIds: ["rag-stack", "rag-review-2025", "fair-rag"],
  },
  {
    id: "arch-external-texts",
    type: "topic",
    branchId: "branch-architecture",
    title: "Context engineering entra aqui",
    summary: "Os dois textos recentes reforcam write, select, compress e isolate como linguagem de contexto e orquestracao.",
    position: { x: 30, y: 470 },
    color: BRANCH_COLORS[4],
  },
  {
    id: "branch-demo",
    type: "branch",
    title: "Demo e fechamento",
    summary: "A mesma pergunta muda bastante quando o retrieval muda. Esse e o ganho didatico do laboratorio local.",
    bullets: ["support", "chain", "4 modos"],
    position: { x: 220, y: 70 },
    color: BRANCH_COLORS[5],
  },
  {
    id: "demo-modes",
    type: "topic",
    branchId: "branch-demo",
    title: "Comparacao de modos",
    summary: "semantic_only, graph_only, hybrid_retrieval e hybrid_graphrag servem para comparar retrieval e response quality sobre a mesma pergunta.",
    position: { x: 60, y: -110 },
    color: BRANCH_COLORS[5],
    referenceIds: ["blended-rag", "byokg-rag", "fair-rag"],
  },
  {
    id: "demo-local-signals",
    type: "topic",
    branchId: "branch-demo",
    title: "Sinais ja vistos na demo",
    summary: "No cenario support, hybrid_graphrag fechou melhor a resposta. No chain, grafo e hybrid_graphrag recuperaram melhor a cadeia relacional.",
    position: { x: 290, y: -90 },
    color: BRANCH_COLORS[5],
    referenceIds: ["byokg-rag", "tigervector", "fair-rag"],
  },
];

function hiddenHandle(id: string, type: "source" | "target", position: Position) {
  return <Handle id={id} type={type} position={position} style={{ opacity: 0, width: 6, height: 6 }} />;
}

function GoalNode({ data }: NodeProps) {
  return (
    <div className="rmn rmn--goal rag-mm__goal-node">
      {hiddenHandle("goal-t", "target", Position.Top)}
      {hiddenHandle("goal-r", "source", Position.Right)}
      {hiddenHandle("goal-b", "source", Position.Bottom)}
      {hiddenHandle("goal-l", "source", Position.Left)}
      <div className="rmn__goal-icon">R</div>
      <div className="rmn__goal-title">{data.title as string}</div>
      <div className="rmn__goal-sub">{data.summary as string}</div>
    </div>
  );
}

function BranchNode({ data }: NodeProps) {
  const color = data.color as string;
  return (
    <div className="rmn rmn--phase rag-mm__branch-node" style={{ borderColor: color }}>
      {hiddenHandle("branch-in", "target", Position.Left)}
      {hiddenHandle("branch-out", "source", Position.Right)}
      <div className="rmn__phase-num" style={{ background: color }}>{data.index as number}</div>
      <div className="rmn__phase-info">
        <div className="rmn__phase-title">{data.title as string}</div>
        <div className="rmn__phase-dur">{data.summary as string}</div>
      </div>
    </div>
  );
}

function TopicNode({ data }: NodeProps) {
  const color = data.color as string;
  const references = (data.references as string[]) || [];
  return (
    <div className="rmn rmn--topic rag-mm__topic-node" style={{ border: `1.5px solid ${color}` }}>
      {hiddenHandle("topic-in", "target", Position.Left)}
      {hiddenHandle("topic-out", "source", Position.Right)}
      <div className="rmn__topic-title">{data.title as string}</div>
      <div className="rmn__topic-desc">{data.summary as string}</div>
      {references.length > 0 && (
        <div className="rmn__res-list">
          {references.slice(0, 2).map((item) => (
            <span key={item} className="rmn__res-badge" style={{ borderColor: `${color}66` }}>
              ref: {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = {
  goalNode: GoalNode,
  branchNode: BranchNode,
  topicNode: TopicNode,
};

function toCanvasNodes(items: MindmapItem[]): Node[] {
  const branches = items.filter((item) => item.type === "branch");
  const branchIndex = new Map(branches.map((branch, index) => [branch.id, index + 1]));

  return items.map((item) => ({
    id: item.id,
    type: item.type === "goal" ? "goalNode" : item.type === "branch" ? "branchNode" : "topicNode",
    position: item.position,
    data: {
      title: item.title,
      summary: item.summary,
      color: item.color,
      index: item.branchId ? branchIndex.get(item.branchId) ?? 1 : branchIndex.get(item.id) ?? 1,
      references: (item.referenceIds || []).map((refId) => REFERENCE_CARDS.find((ref) => ref.id === refId)?.title ?? refId),
    },
  }));
}

function toCanvasEdges(items: MindmapItem[]): Edge[] {
  const edges: Edge[] = [];
  items.forEach((item) => {
    if (item.type === "branch") {
      edges.push({
        id: `edge-goal-${item.id}`,
        source: "goal",
        target: item.id,
        type: "smoothstep",
        style: { stroke: item.color, strokeWidth: 2.4, opacity: 0.7 },
      });
    }
    if (item.type === "topic" && item.branchId) {
      const branch = items.find((candidate) => candidate.id === item.branchId);
      edges.push({
        id: `edge-${item.branchId}-${item.id}`,
        source: item.branchId,
        target: item.id,
        type: "smoothstep",
        style: { stroke: branch?.color || "#94a3b8", strokeWidth: 1.7, opacity: 0.66 },
      });
    }
  });
  return edges;
}

function byId<T extends { id: string }>(collection: T[], id: string) {
  return collection.find((item) => item.id === id) ?? null;
}

export function RagPresentationMindmap() {
  const [selectedId, setSelectedId] = useState<string>("goal");

  const initialNodes = useMemo(() => toCanvasNodes(MINDMAP_ITEMS), []);
  const edges = useMemo(() => toCanvasEdges(MINDMAP_ITEMS), []);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

  const selectedItem = byId(MINDMAP_ITEMS, selectedId) ?? MINDMAP_ITEMS[0];
  const selectedRefs = REFERENCE_CARDS.filter((ref) => selectedItem.referenceIds?.includes(ref.id));

  return (
    <section className="rag-mm">
      <div className="rag-mm__toolbar">
        <div>
          <div className="mini-label">Mindmap guiado</div>
          <h2>Mapa mental do deck</h2>
          <p>
            O centro mostra a tese. Os ramos seguem a narrativa do `.md`: acervo, papers, distincao conceitual,
            arquitetura e demo.
          </p>
        </div>
        <div className="rag-mm__toolbar-actions">
          <Link href="/learning-journey/presentation" className="rag-mm__link-btn">
            Abrir deck
          </Link>
          <Link href="/apresentacao" className="rag-mm__link-btn rag-mm__link-btn--ghost">
            Abrir apresentacao
          </Link>
        </div>
      </div>

      <div className="rag-mm__layout">
        <div className="rag-mm__canvas-shell">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.2}
            maxZoom={1.6}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => setSelectedId(node.id)}
          >
            <Background color="var(--border)" gap={24} />
            <Controls />
            <MiniMap nodeColor={(node) => (node.data?.color as string) || "#4f7df3"} maskColor="rgba(244,246,248,.82)" />
          </ReactFlow>
        </div>

        <aside className="rag-mm__detail">
          <div className="rag-mm__detail-head">
            <span className="mini-label">Selecionado</span>
            <h3>{selectedItem.title}</h3>
            <p>{selectedItem.summary}</p>
          </div>

          {selectedItem.bullets && selectedItem.bullets.length > 0 && (
            <div className="rag-mm__detail-block">
              <div className="rag-mm__detail-label">Pontos-chave</div>
              <ul className="rag-mm__list">
                {selectedItem.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rag-mm__detail-block">
            <div className="rag-mm__detail-label">Leitura operacional</div>
            <p className="rag-mm__detail-copy">
              {selectedItem.type === "goal"
                ? "Use o centro como frase de abertura: semantic search e grafo sao retrieval; RAG e a arquitetura que transforma retrieval em resposta grounded."
                : selectedItem.type === "branch"
                ? "Use este ramo como bloco narrativo principal. Ele organiza um pedaco da argumentacao do deck em termos de arquitetura e evidencias."
                : "Use este card para aprofundar um argumento pontual. O painel de referencias mostra quais artigos locais sustentam esse ponto."}
            </p>
          </div>

          <div className="rag-mm__detail-block">
            <div className="rag-mm__detail-label">Referencias vinculadas</div>
            {selectedRefs.length > 0 ? (
              <div className="rag-mm__ref-links">
                {selectedRefs.map((reference) => (
                  <a key={reference.id} href={`#ref-${reference.id}`} className="rag-mm__ref-chip">
                    {reference.title}
                  </a>
                ))}
              </div>
            ) : (
              <p className="rag-mm__detail-copy">Este node sintetiza a narrativa do `.md` e nao aponta para um paper unico.</p>
            )}
          </div>

          <div className="rag-mm__detail-block">
            <div className="rag-mm__detail-label">Atalhos</div>
            <div className="rag-mm__quick-links">
              <Link href="/mindmap" className="rag-mm__quick-link">Voltar ao mindmap do corpus</Link>
              <a href="#rag-refs" className="rag-mm__quick-link">Ir para referencias</a>
              <a href="#rag-branches" className="rag-mm__quick-link">Ir para ramos</a>
            </div>
          </div>
        </aside>
      </div>

      <section id="rag-branches" className="rag-mm__board">
        <div className="rag-mm__section-head">
          <div>
            <span className="mini-label">Ramos do mapa</span>
            <h3>Como o `.md` foi reagrupado</h3>
            <p>Cada ramo abaixo corresponde a um bloco da apresentacao e reaproveita a logica do roadmap: centro, fase e topicos.</p>
          </div>
          <div className="rag-mm__stats">
            <span>{MINDMAP_ITEMS.filter((item) => item.type === "branch").length} ramos</span>
            <span>{MINDMAP_ITEMS.filter((item) => item.type === "topic").length} topicos</span>
          </div>
        </div>
        <div className="rag-mm__branch-grid">
          {MINDMAP_ITEMS.filter((item) => item.type === "branch").map((branch) => {
            const topics = MINDMAP_ITEMS.filter((item) => item.branchId === branch.id);
            return (
              <article key={branch.id} className="rag-mm__branch-card">
                <div className="rag-mm__branch-top">
                  <span className="rag-mm__branch-dot" style={{ background: branch.color }} />
                  <strong>{branch.title}</strong>
                </div>
                <p>{branch.summary}</p>
                <div className="rag-mm__branch-topics">
                  {topics.map((topic) => (
                    <button key={topic.id} type="button" className="rag-mm__branch-topic" onClick={() => setSelectedId(topic.id)}>
                      {topic.title}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="rag-refs" className="rag-mm__board">
        <div className="rag-mm__section-head">
          <div>
            <span className="mini-label">Referencias</span>
            <h3>Artigos analisados e onde entram</h3>
            <p>As referencias abaixo estao ligadas aos nodes do mapa e trazem o caminho da metadata local usado na analise.</p>
          </div>
          <div className="rag-mm__stats">
            <span>{REFERENCE_CARDS.length} artigos</span>
            <span>acervo local + leitura aprofundada</span>
          </div>
        </div>
        <div className="rag-mm__refs-grid">
          {REFERENCE_CARDS.map((reference) => (
            <article key={reference.id} id={`ref-${reference.id}`} className="rag-mm__ref-card">
              <div className="rag-mm__ref-top">
                <span className="mini-label">{reference.year}</span>
                <span className="rag-mm__meta-path">{reference.metadataPath}</span>
              </div>
              <h4>{reference.title}</h4>
              <p>{reference.whyItMatters}</p>
              <div className="rag-mm__ref-links">
                {reference.linkedTopics.map((topic) => (
                  <button key={topic} type="button" className="rag-mm__ref-chip" onClick={() => {
                    const target = MINDMAP_ITEMS.find((item) => item.title === topic);
                    if (target) setSelectedId(target.id);
                  }}>
                    {topic}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <style>{`
        .rag-mm {
          display: grid;
          gap: 1rem;
        }
        .rag-mm__toolbar,
        .rag-mm__detail,
        .rag-mm__branch-card,
        .rag-mm__ref-card,
        .rag-mm__board {
          border: 1px solid var(--border);
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(246,248,251,.94));
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.07);
        }
        .rag-mm__toolbar {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.1rem 1.25rem;
        }
        .rag-mm__toolbar h2,
        .rag-mm__section-head h3,
        .rag-mm__detail h3,
        .rag-mm__ref-card h4 {
          margin: 0;
          color: var(--text);
        }
        .rag-mm__toolbar p,
        .rag-mm__detail p,
        .rag-mm__section-head p,
        .rag-mm__branch-card p,
        .rag-mm__ref-card p,
        .rag-mm__detail-copy {
          margin: .45rem 0 0;
          color: var(--text-secondary);
          line-height: 1.65;
          font-size: .92rem;
        }
        .rag-mm__toolbar-actions {
          display: flex;
          align-items: flex-start;
          gap: .6rem;
          flex-wrap: wrap;
        }
        .rag-mm__link-btn,
        .rag-mm__quick-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: .48rem .85rem;
          font-size: .82rem;
          font-weight: 700;
          text-decoration: none;
          border: 1px solid var(--primary);
          color: white;
          background: var(--primary);
        }
        .rag-mm__link-btn--ghost,
        .rag-mm__quick-link {
          color: var(--primary);
          background: rgba(79, 125, 243, 0.08);
        }
        .rag-mm__layout {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, .8fr);
          gap: 1rem;
        }
        .rag-mm__canvas-shell {
          height: 760px;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255,255,255,.9), rgba(245,247,250,.92)),
            linear-gradient(90deg, rgba(26,29,35,.04) 1px, transparent 1px),
            linear-gradient(rgba(26,29,35,.04) 1px, transparent 1px);
          background-size: auto, 28px 28px, 28px 28px;
        }
        .rag-mm__detail {
          padding: 1.15rem;
          display: grid;
          align-content: start;
          gap: 1rem;
        }
        .rag-mm__detail-head {
          display: grid;
          gap: .35rem;
        }
        .rag-mm__detail-block {
          display: grid;
          gap: .55rem;
          padding-top: .85rem;
          border-top: 1px solid var(--border-light);
        }
        .rag-mm__detail-label {
          text-transform: uppercase;
          letter-spacing: .12em;
          font-size: .72rem;
          font-weight: 700;
          color: var(--text-tertiary);
        }
        .rag-mm__list {
          margin: 0;
          padding-left: 1rem;
          display: grid;
          gap: .45rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }
        .rag-mm__quick-links,
        .rag-mm__ref-links {
          display: flex;
          flex-wrap: wrap;
          gap: .45rem;
        }
        .rag-mm__ref-chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid rgba(79, 125, 243, .22);
          background: rgba(79, 125, 243, .08);
          color: #2658c8;
          padding: .28rem .6rem;
          font-size: .74rem;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }
        .rag-mm__board {
          padding: 1.15rem;
          display: grid;
          gap: 1rem;
        }
        .rag-mm__section-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .rag-mm__stats {
          display: flex;
          gap: .55rem;
          flex-wrap: wrap;
          color: var(--text-secondary);
          font-size: .78rem;
          font-weight: 700;
        }
        .rag-mm__stats span {
          padding: .25rem .55rem;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.05);
        }
        .rag-mm__branch-grid,
        .rag-mm__refs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: .9rem;
        }
        .rag-mm__branch-card,
        .rag-mm__ref-card {
          padding: 1rem;
        }
        .rag-mm__branch-top,
        .rag-mm__ref-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .65rem;
        }
        .rag-mm__branch-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          display: inline-block;
        }
        .rag-mm__branch-topics {
          display: flex;
          flex-wrap: wrap;
          gap: .45rem;
          margin-top: .8rem;
        }
        .rag-mm__branch-topic {
          border: 1px solid var(--border);
          background: rgba(255,255,255,.8);
          color: var(--text);
          border-radius: 999px;
          padding: .28rem .58rem;
          font-size: .76rem;
          font-weight: 700;
          cursor: pointer;
        }
        .rag-mm__meta-path {
          font-family: var(--mono), monospace;
          font-size: .68rem;
          color: var(--text-tertiary);
          text-align: right;
        }
        .rmn {
          background: var(--surface);
          border-radius: 10px;
          padding: 10px 14px;
          cursor: pointer;
          transition: box-shadow 150ms ease, transform 150ms ease;
          font-family: inherit;
          box-shadow: 0 2px 6px rgba(0,0,0,.06);
        }
        .rmn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(0,0,0,.1);
        }
        .rmn--goal {
          min-width: 280px;
          max-width: 320px;
          text-align: center;
          border: 2px solid rgba(79, 125, 243, .18);
          background: linear-gradient(160deg, #fff8c8 0%, #fffef0 56%, #ffffff 100%);
        }
        .rmn__goal-icon { font-size: 1.4rem; margin-bottom: .3rem; }
        .rmn__goal-title { font-size: .88rem; font-weight: 800; line-height: 1.3; color: var(--text); }
        .rmn__goal-sub { font-size: .73rem; line-height: 1.5; color: var(--text-secondary); margin-top: .4rem; }
        .rmn--phase {
          display: flex;
          align-items: center;
          gap: .55rem;
          min-width: 190px;
          max-width: 250px;
          border: 2px solid;
          padding: 9px 12px;
        }
        .rmn__phase-num {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .rmn__phase-info { min-width: 0; }
        .rmn__phase-title { font-weight: 700; font-size: 11px; color: var(--text); line-height: 1.3; }
        .rmn__phase-dur { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; line-height: 1.4; }
        .rmn--topic {
          min-width: 220px;
          max-width: 250px;
        }
        .rmn__topic-title {
          font-weight: 700;
          font-size: 12px;
          color: var(--text);
          margin-bottom: 6px;
          line-height: 1.35;
        }
        .rmn__topic-desc {
          font-size: 11px;
          color: var(--text-secondary);
          margin-bottom: 8px;
          line-height: 1.45;
        }
        .rmn__res-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .rmn__res-badge {
          border: 1px solid var(--border);
          border-radius: 20px;
          font-size: 10px;
          padding: 2px 7px;
          font-weight: 700;
          color: var(--text-secondary);
          background: var(--bg);
          white-space: nowrap;
          max-width: 170px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 1120px) {
          .rag-mm__layout {
            grid-template-columns: 1fr;
          }
          .rag-mm__canvas-shell {
            height: 680px;
          }
        }
        @media (max-width: 720px) {
          .rag-mm__toolbar,
          .rag-mm__section-head {
            grid-template-columns: 1fr;
            display: grid;
          }
          .rag-mm__toolbar-actions {
            justify-content: flex-start;
          }
          .rag-mm__canvas-shell {
            height: 560px;
          }
        }
      `}</style>
    </section>
  );
}