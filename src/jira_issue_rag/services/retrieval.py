from __future__ import annotations

import re
from collections import Counter

from jira_issue_rag.core.config import Settings
from jira_issue_rag.services.rerank import Reranker
from jira_issue_rag.shared.models import (
    AttachmentFacts,
    DistilledContext,
    IssueCanonical,
    RetrievedEvidence,
    RuleEvaluation,
)
from jira_issue_rag.services.qdrant_store import QdrantStore
from jira_issue_rag.services.neo4j_store import Neo4jGraphStore


TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_./:-]+")
QUOTE_PATTERN = re.compile(r"(?:[A-Z]{2,10}-\d+|\d+[\.,]\d{2}|\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}|[A-Za-z]+Exception)")


POLICY_SNIPPETS = [
    (
        "policy:bug-ready",
        "A bug should include expected behavior, actual behavior, reproduction steps, environment, and affected version before it is marked ready for development.",
    ),
    (
        "policy:financial-review",
        "Any issue with payment, refund, chargeback, or ledger mismatch must require human review unless deterministic checks fully reconcile the evidence.",
    ),
    (
        "policy:contradictions",
        "If one artifact shows failure and another shows success for the same flow, the issue must be escalated for review.",
    ),
]


class HybridRetriever:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings
        self.qdrant = QdrantStore(settings) if settings and settings.enable_external_retrieval else None
        self.neo4j = Neo4jGraphStore(settings) if settings and settings.enable_graphrag else None  # type: ignore[attr-defined]
        self.reranker = Reranker() if not settings or settings.enable_reranker else None

    def build_query(self, issue: IssueCanonical, attachment_facts: AttachmentFacts, rules: RuleEvaluation) -> str:
        parts = [
            issue.issue_key,
            issue.summary,
            issue.actual_behavior,
            issue.expected_behavior,
            " ".join(issue.labels),
            " ".join(rules.contradictions),
        ]
        for artifact in attachment_facts.artifacts:
            parts.extend(artifact.facts.get("ids", [])[:3])
            if artifact.facts.get("error_lines"):
                parts.append(" ".join(artifact.facts["error_lines"][:2]))
        return " ".join(part for part in parts if part).strip()

    def search(
        self,
        issue: IssueCanonical,
        attachment_facts: AttachmentFacts,
        rules: RuleEvaluation,
        top_k: int = 8,
        query_text_override: str | None = None,
    ) -> list[RetrievedEvidence]:
        query = (query_text_override or self.build_query(issue, attachment_facts, rules)).strip()
        query_tokens = self._tokenize(query)
        documents = self._build_documents(issue, attachment_facts)
        # Qdrant: cascade (quantized two-pass) or regular hybrid search
        if self.qdrant and self.settings and self.settings.enable_cascade_retrieval:  # type: ignore[attr-defined]
            external_results = self.qdrant.cascade_search(query, issue, limit=top_k)
        elif self.qdrant:
            external_results = self.qdrant.search(query, issue, limit=top_k)
        else:
            external_results = []
        # Neo4j GraphRAG neighbourhood results
        graph_results: list[RetrievedEvidence] = []
        if self.neo4j and self.neo4j.is_available():
            graph_results = self.neo4j.search_related(issue, limit=top_k // 2 or 4)
        temporal_results = self._build_temporal_results(issue) if self.settings and self.settings.enable_temporal_graphrag else []

        ranked: list[RetrievedEvidence] = []
        for evidence_id, source, content, metadata in documents:
            doc_tokens = self._tokenize(content)
            sparse_score = self._sparse_score(query_tokens, doc_tokens)
            dense_score = self._dense_score(query_tokens, doc_tokens)
            final_score = 0.6 * sparse_score + 0.4 * dense_score
            if issue.issue_key in content:
                final_score += 0.20
            if rules.financial_impact_detected and metadata.get("category") in {"artifact", "policy"}:
                final_score += 0.10
            ranked.append(
                RetrievedEvidence(
                    evidence_id=evidence_id,
                    source=source,
                    content=content,
                    metadata=metadata,
                    sparse_score=round(sparse_score, 4),
                    dense_score=round(dense_score, 4),
                    final_score=round(final_score, 4),
                )
            )

        for external in external_results:
            reranked = external.model_copy()
            doc_tokens = self._tokenize(reranked.content)
            reranked.dense_score = round(self._dense_score(query_tokens, doc_tokens), 4)
            reranked.final_score = round(max(reranked.final_score, 0.65 * reranked.sparse_score + 0.35 * reranked.dense_score), 4)
            ranked.append(reranked)

        for graph_ev in graph_results:
            ranked.append(graph_ev)

        for temporal_ev in temporal_results:
            ranked.append(temporal_ev)

        if self.reranker is None:
            return sorted(ranked, key=lambda item: item.final_score, reverse=True)[:top_k]
        reranked = self.reranker.rerank(query, ranked)
        return reranked[:top_k]

    def distill(self, retrieved_evidence: list[RetrievedEvidence], rules: RuleEvaluation) -> DistilledContext:
        key_facts: list[str] = []
        preserved_quotes: list[str] = []

        for evidence in retrieved_evidence[:5]:
            sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", evidence.content) if sentence.strip()]
            if sentences:
                key_facts.append(f"{evidence.source}: {sentences[0][:220]}")
            preserved_quotes.extend(match.group(0) for match in QUOTE_PATTERN.finditer(evidence.content))

        for contradiction in rules.contradictions:
            key_facts.append(f"contradiction: {contradiction}")

        return DistilledContext(
            key_facts=key_facts[:10],
            preserved_quotes=sorted(set(preserved_quotes))[:20],
            evidence=retrieved_evidence,
        )

    @staticmethod
    def _build_documents(
        issue: IssueCanonical,
        attachment_facts: AttachmentFacts,
    ) -> list[tuple[str, str, str, dict[str, str]]]:
        documents: list[tuple[str, str, str, dict[str, str]]] = [
            (
                "issue:summary",
                "issue.summary",
                f"{issue.issue_key} {issue.summary} {issue.description}",
                {"category": "issue"},
            ),
            (
                "issue:expected_actual",
                "issue.behavior",
                f"Expected: {issue.expected_behavior}\nActual: {issue.actual_behavior}",
                {"category": "issue"},
            ),
        ]

        for index, comment in enumerate(issue.comments, start=1):
            documents.append((f"issue:comment:{index}", f"issue.comment:{index}", comment, {"category": "comment"}))
        for artifact in attachment_facts.artifacts:
            documents.append(
                (
                    artifact.artifact_id,
                    f"attachment:{artifact.source_path}",
                    artifact.extracted_text or str(artifact.facts),
                    {"category": "artifact", "type": artifact.artifact_type},
                )
            )
        for evidence_id, content in POLICY_SNIPPETS:
            documents.append((evidence_id, evidence_id, content, {"category": "policy"}))
        return documents

    @staticmethod
    def _build_temporal_results(issue: IssueCanonical) -> list[RetrievedEvidence]:
        results: list[RetrievedEvidence] = []
        timeline = sorted(
            issue.changelog,
            key=lambda item: item.changed_at or issue.collected_at,
        )
        latest_change_at = timeline[-1].changed_at if timeline else None

        current_state = {
            "status": issue.status,
            "priority": issue.priority,
            "affected version": issue.affected_version,
            "component": issue.component,
            "service": issue.service,
            "environment": issue.environment,
        }
        for event in timeline:
            field_key = HybridRetriever._normalize_temporal_field(event.field)
            if field_key in current_state and event.to_value:
                current_state[field_key] = event.to_value

        current_parts = [f"issue={issue.issue_key}", f"collected_at={issue.collected_at.isoformat()}"]
        if latest_change_at:
            current_parts.append(f"latest_change_at={latest_change_at.isoformat()}")
        for field in ("status", "priority", "affected version", "component", "service", "environment"):
            value = current_state.get(field)
            if value:
                current_parts.append(f"{field}={value}")
        results.append(
            RetrievedEvidence(
                evidence_id=f"temporal:{issue.issue_key}:current-state",
                source=f"temporal:{issue.issue_key}:current-state",
                content="Current timeline-aware issue state: " + ", ".join(current_parts) + ".",
                metadata={
                    "category": "temporal",
                    "backend": "temporal",
                    "issue_key": issue.issue_key,
                    "temporal_kind": "current_state",
                },
                sparse_score=0.62,
                dense_score=0.0,
                final_score=0.62,
            )
        )

        if issue.affected_version:
            results.append(
                RetrievedEvidence(
                    evidence_id=f"temporal:{issue.issue_key}:version",
                    source=f"temporal:{issue.issue_key}:version",
                    content=f"Issue {issue.issue_key} references affected version {issue.affected_version}. Version-sensitive behaviour may require checking policy or rollout history.",
                    metadata={
                        "category": "temporal",
                        "backend": "temporal",
                        "issue_key": issue.issue_key,
                        "temporal_kind": "version",
                    },
                    sparse_score=0.58,
                    dense_score=0.0,
                    final_score=0.58,
                )
            )

        if timeline:
            chronology = " -> ".join(
                (
                    f"{(event.changed_at or issue.collected_at).isoformat()}: "
                    f"{event.field} {event.from_value or '-'} -> {event.to_value or '-'}"
                )
                for event in timeline[-4:]
            )
            results.append(
                RetrievedEvidence(
                    evidence_id=f"temporal:{issue.issue_key}:chronology",
                    source=f"temporal:{issue.issue_key}:chronology",
                    content=f"Recent issue chronology for {issue.issue_key}: {chronology}.",
                    metadata={
                        "category": "temporal",
                        "backend": "temporal",
                        "issue_key": issue.issue_key,
                        "temporal_kind": "chronology",
                    },
                    sparse_score=0.57,
                    dense_score=0.0,
                    final_score=0.57,
                )
            )

        for index, event in enumerate(reversed(timeline[-4:]), start=1):
            changed_at = event.changed_at.isoformat() if event.changed_at else "unknown"
            content = (
                f"Timeline event for {issue.issue_key}: field={event.field}, "
                f"from={event.from_value or '-'}, to={event.to_value or '-'}, changed_at={changed_at}."
            )
            results.append(
                RetrievedEvidence(
                    evidence_id=f"temporal:{issue.issue_key}:change:{index}",
                    source=f"temporal:{issue.issue_key}:change:{index}",
                    content=content,
                    metadata={
                        "category": "temporal",
                        "backend": "temporal",
                        "issue_key": issue.issue_key,
                        "temporal_kind": "change_event",
                        "field": event.field,
                    },
                    sparse_score=0.54,
                    dense_score=0.0,
                    final_score=0.54,
                )
            )

        return results

    @staticmethod
    def _normalize_temporal_field(field: str | None) -> str:
        if not field:
            return ""
        normalized = re.sub(r"\s+", " ", field.strip().lower())
        synonyms = {
            "fix version": "affected version",
            "fix versions": "affected version",
            "affected versions": "affected version",
            "components": "component",
            "services": "service",
            "environments": "environment",
        }
        return synonyms.get(normalized, normalized)

    @staticmethod
    def _tokenize(text: str) -> Counter[str]:
        return Counter(token.lower() for token in TOKEN_PATTERN.findall(text))

    @staticmethod
    def _sparse_score(query_tokens: Counter[str], doc_tokens: Counter[str]) -> float:
        if not query_tokens or not doc_tokens:
            return 0.0
        overlap = 0.0
        for token, frequency in query_tokens.items():
            overlap += min(frequency, doc_tokens.get(token, 0))
        return overlap / max(sum(query_tokens.values()), 1)

    @staticmethod
    def _dense_score(query_tokens: Counter[str], doc_tokens: Counter[str]) -> float:
        query_set = set(query_tokens)
        doc_set = set(doc_tokens)
        if not query_set or not doc_set:
            return 0.0
        return len(query_set & doc_set) / len(query_set | doc_set)
