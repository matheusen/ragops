from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path


STOPWORDS = {
    "a",
    "ao",
    "apos",
    "as",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "o",
    "os",
    "para",
    "por",
    "qual",
    "que",
    "sobre",
    "the",
    "to",
    "um",
    "uma",
}

SYNONYMS = {
    "cobranca": "charge",
    "charges": "charge",
    "charge": "charge",
    "duplicada": "duplicate",
    "duplicado": "duplicate",
    "duplicate": "duplicate",
    "duplicatas": "duplicate",
    "erro": "incident",
    "incidente": "incident",
    "incident": "incident",
    "retry": "retry",
    "replay": "retry",
    "suporte": "support",
    "support": "support",
    "servico": "service",
    "service": "service",
    "componente": "component",
    "component": "component",
    "cadeia": "chain",
    "conecta": "chain",
    "resposta": "response",
}


@dataclass(frozen=True)
class Document:
    id: str
    title: str
    kind: str
    text: str
    entities: tuple[str, ...]


@dataclass(frozen=True)
class Edge:
    source: str
    relation: str
    target: str


def normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9\-]+", normalize(text))
    canonical = []
    for token in tokens:
        if token in STOPWORDS:
            continue
        canonical.append(SYNONYMS.get(token, token))
    return canonical


class DemoRetriever:
    def __init__(self, corpus_path: Path) -> None:
        raw = json.loads(corpus_path.read_text(encoding="utf-8"))
        self.documents = [
            Document(
                id=item["id"],
                title=item["title"],
                kind=item["kind"],
                text=item["text"],
                entities=tuple(item["entities"]),
            )
            for item in raw["documents"]
        ]
        self.edges = [Edge(**item) for item in raw["graph_edges"]]
        self.scenarios = raw["scenarios"]
        self.adjacency = defaultdict(list)
        self.entity_to_docs = defaultdict(list)
        for edge in self.edges:
            self.adjacency[edge.source].append((edge.relation, edge.target))
            self.adjacency[edge.target].append((f"REV_{edge.relation}", edge.source))
        for doc in self.documents:
            for entity in doc.entities:
                self.entity_to_docs[entity].append(doc)

    def detect_entities(self, query: str) -> list[str]:
        lowered = query.lower()
        entities = []
        for entity in self.entity_to_docs:
            if entity.lower() in lowered:
                entities.append(entity)
        return entities

    def semantic_search(self, query: str, limit: int = 3) -> list[tuple[Document, float]]:
        query_tokens = tokenize(query)
        query_counts = defaultdict(int)
        for token in query_tokens:
            query_counts[token] += 1

        scored = []
        for doc in self.documents:
            doc_tokens = tokenize(doc.title + " " + doc.text)
            doc_counts = defaultdict(int)
            for token in doc_tokens:
                doc_counts[token] += 1

            overlap = sum(min(query_counts[token], doc_counts[token]) for token in query_counts)
            if not overlap:
                continue

            norm = math.sqrt(sum(v * v for v in query_counts.values())) * math.sqrt(sum(v * v for v in doc_counts.values()))
            cosine_like = overlap / norm if norm else 0.0
            entity_bonus = 0.1 * sum(1 for entity in doc.entities if entity.lower() in query.lower())
            score = cosine_like + entity_bonus
            scored.append((doc, round(score, 3)))

        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[:limit]

    def graph_search(self, query: str, hops: int = 2, limit: int = 3) -> tuple[list[tuple[Document, float]], list[str]]:
        seeds = self.detect_entities(query)
        if not seeds:
            return [], []

        queue = deque((seed, 0, [seed]) for seed in seeds)
        visited = set(seeds)
        reached = []
        doc_scores = defaultdict(float)

        while queue:
            node, depth, path = queue.popleft()
            reached.append(" -> ".join(path))
            for doc in self.entity_to_docs.get(node, []):
                doc_scores[doc] += max(0.4, 1.0 - depth * 0.2)

            if depth >= hops:
                continue

            for relation, neighbor in self.adjacency.get(node, []):
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                queue.append((neighbor, depth + 1, [*path, f"[{relation}]", neighbor]))

        scored = sorted(((doc, round(score, 3)) for doc, score in doc_scores.items()), key=lambda item: item[1], reverse=True)
        return scored[:limit], reached[:6]

    def hybrid_retrieval(self, query: str, limit: int = 4) -> tuple[list[tuple[Document, float]], list[str]]:
        semantic_hits = dict(self.semantic_search(query, limit=limit + 2))
        graph_hits, paths = self.graph_search(query, hops=3, limit=limit + 2)
        graph_scores = dict(graph_hits)

        combined = defaultdict(float)
        for doc, score in semantic_hits.items():
            combined[doc] += score * 0.65
        for doc, score in graph_scores.items():
            combined[doc] += score * 0.75

        lowered = normalize(query)
        for doc in self.documents:
            exact_matches = sum(1 for entity in doc.entities if normalize(entity) in lowered)
            if exact_matches:
                combined[doc] += exact_matches * 0.2

        ranked = sorted(((doc, round(score, 3)) for doc, score in combined.items()), key=lambda item: item[1], reverse=True)
        return ranked[:limit], paths

    def build_grounded_answer(self, query: str, retrieved: list[tuple[Document, float]], paths: list[str]) -> str:
        lowered = normalize(query)
        titles = ", ".join(doc.title for doc, _ in retrieved[:3])

        if "chain" in tokenize(query):
            path_line = paths[0] if paths else "Nenhuma cadeia explicita foi recuperada."
            return (
                "Resposta grounded: a issue INC-481 aparece ligada ao componente payments-api e ao servico ledger-sync. "
                f"A cadeia recuperada mais forte foi: {path_line}. "
                f"As evidencias principais vieram de: {titles}."
            )

        if "support" in tokenize(query) or "response" in tokenize(query):
            return (
                "Resposta grounded para suporte: reconhecer o incidente INC-481, pedir o identificador do pedido, "
                "evitar reembolso manual antes da reconciliacao do ledger e escalar para o on-call de payments-api. "
                f"Baseado em: {titles}."
            )

        return (
            "Resposta grounded: os materiais mais proximos do problema de cobranca duplicada apos retry apontam para "
            "o incidente INC-481, o runbook de mitigacao e a nota de mudanca de retry policy. "
            f"Baseado em: {titles}."
        )


def render_hits(title: str, hits: list[tuple[Document, float]], answer: str | None = None, paths: list[str] | None = None) -> str:
    lines = [f"\n=== {title} ==="]
    if not hits:
        lines.append("Nenhuma evidencia relevante encontrada.")
    else:
        lines.append("Evidencias recuperadas:")
        for doc, score in hits:
            lines.append(f"- {doc.id} ({doc.kind}) | score={score:.3f} | {doc.title}")
    if paths:
        lines.append("Cadeias / caminhos relevantes:")
        for path in paths[:3]:
            lines.append(f"- {path}")
    if answer:
        lines.append("Resposta:")
        lines.append(answer)
    return "\n".join(lines)


def run_demo(scenario_id: str | None = None) -> str:
    base_dir = Path(__file__).resolve().parent
    retriever = DemoRetriever(base_dir / "corpus.json")
    scenarios = retriever.scenarios
    if scenario_id:
        scenarios = [scenario for scenario in scenarios if scenario["id"] == scenario_id]
        if not scenarios:
            raise SystemExit(f"Scenario '{scenario_id}' nao encontrado.")

    output = []
    for scenario in scenarios:
        query = scenario["query"]
        output.append(f"\n################ Scenario: {scenario['id']} ################")
        output.append(f"Pergunta: {query}")
        output.append(f"Objetivo didatico: {scenario['goal']}")

        semantic_hits = retriever.semantic_search(query)
        output.append(render_hits("semantic_only", semantic_hits))

        graph_hits, graph_paths = retriever.graph_search(query)
        output.append(render_hits("graph_only", graph_hits, paths=graph_paths))

        hybrid_hits, hybrid_paths = retriever.hybrid_retrieval(query)
        output.append(render_hits("hybrid_retrieval", hybrid_hits, paths=hybrid_paths))

        graphrag_answer = retriever.build_grounded_answer(query, hybrid_hits, hybrid_paths)
        output.append(render_hits("hybrid_graphrag", hybrid_hits, answer=graphrag_answer, paths=hybrid_paths))

    return "\n".join(output).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare semantic search, graph retrieval, hybrid retrieval and hybrid GraphRAG on a small didactic corpus.")
    parser.add_argument("--scenario", help="Run only one scenario: similarity, chain or support.")
    args = parser.parse_args()
    print(run_demo(args.scenario))


if __name__ == "__main__":
    main()