from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable

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
        query_variants = self._build_query_variants(query, issue, rules)
        documents = self._build_documents(issue, attachment_facts)
        external_results = self._search_external(query_variants, issue, top_k)
        # Neo4j GraphRAG neighbourhood results
        graph_results: list[RetrievedEvidence] = []
        if self.neo4j and self.neo4j.is_available():
            graph_results = self.neo4j.search_related(issue, limit=top_k // 2 or 4)
        temporal_results = self._build_temporal_results(issue) if self.settings and self.settings.enable_temporal_graphrag else []

        ranked: list[RetrievedEvidence] = []
        for evidence_id, source, content, metadata in documents:
            doc_tokens = self._tokenize(content)
            variant_scores = []
            for variant in query_variants:
                variant_tokens = self._tokenize(variant)
                sparse_score = self._sparse_score(variant_tokens, doc_tokens)
                dense_score = self._dense_score(variant_tokens, doc_tokens)
                variant_scores.append((sparse_score, dense_score, 0.6 * sparse_score + 0.4 * dense_score))
            sparse_score = max((score[0] for score in variant_scores), default=0.0)
            dense_score = max((score[1] for score in variant_scores), default=0.0)
            final_score = max((score[2] for score in variant_scores), default=0.0)
            if len([score for score in variant_scores if score[2] > 0.12]) > 1:
                final_score += 0.04
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
            ranked.append(reranked)

        for graph_ev in graph_results:
            ranked.append(graph_ev)

        for temporal_ev in temporal_results:
            ranked.append(temporal_ev)

        if self.reranker is None:
            return self._select_diverse_top_k(sorted(ranked, key=lambda item: item.final_score, reverse=True), top_k)
        reranked = self.reranker.rerank(query, ranked)
        return self._select_diverse_top_k(reranked, top_k)

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

    def _search_external(
        self,
        query_variants: list[str],
        issue: IssueCanonical,
        top_k: int,
    ) -> list[RetrievedEvidence]:
        if not self.qdrant:
            return []

        fused: dict[str, RetrievedEvidence] = {}
        reciprocal_scores: dict[str, float] = {}
        for variant in query_variants:
            if self.settings and self.settings.enable_cascade_retrieval:  # type: ignore[attr-defined]
                results = self.qdrant.cascade_search(variant, issue, limit=top_k)
            else:
                results = self.qdrant.search(variant, issue, limit=top_k)
            for rank, item in enumerate(results, start=1):
                previous = fused.get(item.evidence_id)
                reciprocal_scores[item.evidence_id] = reciprocal_scores.get(item.evidence_id, 0.0) + (1.0 / (rank + 50))
                if previous is None or item.final_score > previous.final_score:
                    fused[item.evidence_id] = item.model_copy(deep=True)

        ordered: list[RetrievedEvidence] = []
        for evidence_id, item in fused.items():
            tuned = item.model_copy(deep=True)
            tuned.final_score = round(max(tuned.final_score, reciprocal_scores.get(evidence_id, 0.0)), 4)
            ordered.append(tuned)
        return sorted(ordered, key=lambda item: item.final_score, reverse=True)[: max(top_k * 2, top_k)]

    def _build_query_variants(
        self,
        query: str,
        issue: IssueCanonical,
        rules: RuleEvaluation,
    ) -> list[str]:
        variants = [query]
        if self.settings and self.settings.enable_query_fusion:
            metadata_variant = " ".join(
                token
                for token in (
                    issue.issue_key,
                    issue.component,
                    issue.service,
                    issue.environment,
                    issue.affected_version,
                    *issue.labels[:3],
                )
                if token
            ).strip()
            if metadata_variant:
                variants.append(metadata_variant)
            if rules.contradictions:
                variants.append(f"{issue.issue_key} {' '.join(rules.contradictions[:2])}")
            if rules.missing_items:
                variants.append(f"{issue.issue_key} {' '.join(rules.missing_items[:3])}")

        unique_variants: list[str] = []
        seen: set[str] = set()
        limit = max(1, self.settings.retrieval_query_variants_limit) if self.settings else 3
        for variant in variants:
            normalized = " ".join(variant.split())
            if not normalized:
                continue
            lowered = normalized.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            unique_variants.append(normalized)
            if len(unique_variants) >= limit:
                break
        return unique_variants or [query]

    @staticmethod
    def _select_diverse_top_k(items: Iterable[RetrievedEvidence], top_k: int) -> list[RetrievedEvidence]:
        items = list(items)
        selected: list[RetrievedEvidence] = []
        used_sources: set[str] = set()
        used_categories: set[str] = set()
        for item in items:
            category = str(item.metadata.get("category", "unknown"))
            duplicate_source = item.source in used_sources
            duplicate_category = category in used_categories
            if len(selected) < top_k and (not duplicate_source or not duplicate_category):
                selected.append(item)
                used_sources.add(item.source)
                used_categories.add(category)
                continue
            if len(selected) >= top_k:
                break
        if len(selected) < top_k:
            for item in items:
                if item in selected:
                    continue
                selected.append(item)
                if len(selected) >= top_k:
                    break
        return selected[:top_k]

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
