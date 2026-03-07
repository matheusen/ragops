from __future__ import annotations

from jira_issue_rag.shared.models import RetrievedEvidence

try:
    from sentence_transformers import CrossEncoder as _CrossEncoderClass
    _CROSS_ENCODER: _CrossEncoderClass | None = _CrossEncoderClass("cross-encoder/ms-marco-MiniLM-L-6-v2")
except Exception:
    _CROSS_ENCODER = None


class Reranker:
    def __init__(self) -> None:
        self._cross_encoder = _CROSS_ENCODER

    def rerank(self, query: str, evidence: list[RetrievedEvidence]) -> list[RetrievedEvidence]:
        if self._cross_encoder is not None:
            return self._rerank_cross_encoder(query, evidence)
        return self._rerank_heuristic(query, evidence)

    def _rerank_cross_encoder(self, query: str, evidence: list[RetrievedEvidence]) -> list[RetrievedEvidence]:
        pairs = [[query, item.content] for item in evidence]
        scores: list[float] = self._cross_encoder.predict(pairs).tolist()  # type: ignore[union-attr]
        ranked: list[RetrievedEvidence] = []
        for item, score in zip(evidence, scores):
            updated = item.model_copy()
            updated.final_score = round(float(score), 4)
            ranked.append(updated)
        return sorted(ranked, key=lambda item: item.final_score, reverse=True)

    def _rerank_heuristic(self, query: str, evidence: list[RetrievedEvidence]) -> list[RetrievedEvidence]:
        query_tokens = set(self._tokenize(query))
        ranked: list[RetrievedEvidence] = []
        for item in evidence:
            boost = 0.0
            content_tokens = set(self._tokenize(item.content))
            if item.metadata.get("backend") == "qdrant":
                boost += 0.06
            if item.metadata.get("category") == "policy":
                boost -= 0.03
            exact_overlap = len(query_tokens & content_tokens)
            boost += min(exact_overlap * 0.015, 0.12)
            if any(token in item.content for token in ("PAY-", "req_", "Exception", "timeout")):
                boost += 0.04
            if item.metadata.get("category") == "artifact":
                boost += 0.03
            updated = item.model_copy()
            updated.final_score = round(updated.final_score + boost, 4)
            ranked.append(updated)
        return sorted(ranked, key=lambda item: item.final_score, reverse=True)

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        token = []
        tokens = []
        for char in text.lower():
            if char.isalnum() or char in {"-", "_", "/", ".", ":"}:
                token.append(char)
                continue
            if token:
                tokens.append("".join(token))
                token = []
        if token:
            tokens.append("".join(token))
        return tokens
