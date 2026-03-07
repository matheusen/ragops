from __future__ import annotations

from jira_issue_rag.shared.models import RetrievedEvidence


class Reranker:
    def rerank(self, query: str, evidence: list[RetrievedEvidence]) -> list[RetrievedEvidence]:
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
