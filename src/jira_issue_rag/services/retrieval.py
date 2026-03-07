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
    ) -> list[RetrievedEvidence]:
        query = self.build_query(issue, attachment_facts, rules)
        query_tokens = self._tokenize(query)
        documents = self._build_documents(issue, attachment_facts)
        external_results = self.qdrant.search(query, issue, limit=top_k) if self.qdrant else []

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
