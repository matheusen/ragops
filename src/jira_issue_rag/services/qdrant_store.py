from __future__ import annotations

import hashlib
import uuid
from typing import Any

import httpx

from jira_issue_rag.core.config import Settings
from jira_issue_rag.services.embeddings import EmbeddingService
from jira_issue_rag.shared.models import AttachmentFacts, IssueCanonical, RetrievedEvidence


class QdrantStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.embeddings = EmbeddingService(settings)

    def is_available(self) -> bool:
        return bool(self.settings.qdrant_url and self.settings.external_vector_store_enabled())

    def ensure_collection(self) -> None:
        if not self.is_available():
            return
        body: dict[str, Any] = {
            "vectors": {
                "dense": {
                    "size": self.settings.embedding_dimension,
                    "distance": "Cosine",
                }
            },
            "sparse_vectors": {
                "text": {}
            },
        }
        q_type = (self.settings.qdrant_quantization_type or "none").lower()
        if q_type == "scalar":
            body["quantization_config"] = {"scalar": {"type": "int8", "always_ram": True}}
        elif q_type == "binary":
            body["quantization_config"] = {"binary": {"always_ram": True}}
        self._request(
            "PUT",
            f"/collections/{self.settings.qdrant_collection}",
            json_body=body,
        )

    def index_issue_package(self, issue: IssueCanonical, attachment_facts: AttachmentFacts) -> int:
        if not self.is_available():
            return 0

        self.ensure_collection()
        documents = self._build_documents(issue, attachment_facts)
        dense_vectors, embedding_backend = self.embeddings.embed_texts([document["content"] for document in documents])
        points = []
        for document, dense_vector in zip(documents, dense_vectors, strict=False):
            sparse_vector = self._sparse_vector(document["content"])
            document["embedding_backend"] = embedding_backend
            points.append(
                {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, document["evidence_id"])),
                    "vector": {
                        "dense": dense_vector,
                        "text": sparse_vector,
                    },
                    "payload": document,
                }
            )

        self._request(
            "PUT",
            f"/collections/{self.settings.qdrant_collection}/points?wait=true",
            json_body={"points": points},
        )
        return len(points)

    def search(self, query_text: str, issue: IssueCanonical, limit: int = 6) -> list[RetrievedEvidence]:
        if not self.is_available() or not query_text.strip():
            return []

        self.ensure_collection()
        dense_vector, _ = self.embeddings.embed_text(query_text)
        sparse_payload = {
            "query": self._sparse_vector(query_text),
            "using": "text",
            "limit": limit,
            "with_payload": True,
        }
        dense_payload = {
            "query": dense_vector,
            "using": "dense",
            "limit": limit,
            "with_payload": True,
        }
        filters = self._build_filter(issue)
        if filters:
            sparse_payload["filter"] = filters
            dense_payload["filter"] = filters

        sparse_response = self._request(
            "POST",
            f"/collections/{self.settings.qdrant_collection}/points/query",
            json_body=sparse_payload,
        )
        dense_response = self._request(
            "POST",
            f"/collections/{self.settings.qdrant_collection}/points/query",
            json_body=dense_payload,
        )

        fused: dict[str, RetrievedEvidence] = {}
        for item in self._extract_points(sparse_response):
            point_payload = item.get("payload", {})
            score = float(item.get("score", 0.0))
            point_id = str(item.get("id"))
            fused[point_id] = RetrievedEvidence(
                evidence_id=point_id,
                source=str(point_payload.get("source", "qdrant")),
                content=str(point_payload.get("content", "")),
                metadata={
                    "category": point_payload.get("category", "qdrant"),
                    "issue_key": point_payload.get("issue_key"),
                    "backend": "qdrant",
                },
                sparse_score=score,
                dense_score=0.0,
                final_score=score,
            )
        for item in self._extract_points(dense_response):
            point_payload = item.get("payload", {})
            score = float(item.get("score", 0.0))
            point_id = str(item.get("id"))
            existing = fused.get(point_id)
            if existing is None:
                fused[point_id] = RetrievedEvidence(
                    evidence_id=point_id,
                    source=str(point_payload.get("source", "qdrant")),
                    content=str(point_payload.get("content", "")),
                    metadata={
                        "category": point_payload.get("category", "qdrant"),
                        "issue_key": point_payload.get("issue_key"),
                        "backend": "qdrant",
                    },
                    sparse_score=0.0,
                    dense_score=score,
                    final_score=score,
                )
                continue
            existing.dense_score = score
            existing.final_score = round(0.55 * existing.sparse_score + 0.45 * existing.dense_score, 4)
        return sorted(fused.values(), key=lambda item: item.final_score, reverse=True)

    def cascade_search(self, query_text: str, issue: IssueCanonical, limit: int = 6) -> list[RetrievedEvidence]:
        """
        Two-pass cascade retrieval:
          1. Quantized dense pass — retrieve (limit * overretrieve_factor) candidates
             with rescore=False (fast, approximate).
          2. Full-precision rescore pass — re-rank the short-list with rescore=True.
        Falls back to regular search when quantization is disabled.
        """
        if not self.is_available() or not query_text.strip():
            return []
        q_type = (self.settings.qdrant_quantization_type or "none").lower()
        if q_type == "none":
            return self.search(query_text, issue, limit=limit)

        self.ensure_collection()
        dense_vector, _ = self.embeddings.embed_text(query_text)
        filters = self._build_filter(issue)
        overretrieve = max(1, limit * self.settings.qdrant_cascade_overretrieve_factor)

        # ── Pass 1: quantized approximate retrieval ──────────────────────────
        p1_payload: dict[str, Any] = {
            "query": dense_vector,
            "using": "dense",
            "limit": overretrieve,
            "with_payload": True,
            "params": {"quantization": {"rescore": False, "oversampling": 2.0}},
        }
        if filters:
            p1_payload["filter"] = filters
        p1_response = self._request(
            "POST",
            f"/collections/{self.settings.qdrant_collection}/points/query",
            json_body=p1_payload,
        )
        candidates = self._extract_points(p1_response)
        candidate_ids = [str(c.get("id")) for c in candidates]
        if not candidate_ids:
            return []

        # ── Pass 2: full-precision rescore of the short-list ─────────────────
        p2_payload: dict[str, Any] = {
            "query": dense_vector,
            "using": "dense",
            "limit": limit,
            "with_payload": True,
            "filter": {"must": [{"has_id": candidate_ids}]},
            "params": {"quantization": {"rescore": self.settings.qdrant_quantization_rescore}},
        }
        p2_response = self._request(
            "POST",
            f"/collections/{self.settings.qdrant_collection}/points/query",
            json_body=p2_payload,
        )

        results: list[RetrievedEvidence] = []
        for item in self._extract_points(p2_response):
            point_payload = item.get("payload", {})
            score = float(item.get("score", 0.0))
            point_id = str(item.get("id"))
            results.append(
                RetrievedEvidence(
                    evidence_id=point_id,
                    source=str(point_payload.get("source", "qdrant:cascade")),
                    content=str(point_payload.get("content", "")),
                    metadata={
                        "category": point_payload.get("category", "qdrant"),
                        "issue_key": point_payload.get("issue_key"),
                        "backend": "qdrant:cascade",
                    },
                    sparse_score=0.0,
                    dense_score=score,
                    final_score=round(score, 4),
                )
            )
        return sorted(results, key=lambda x: x.final_score, reverse=True)[:limit]

    def _build_documents(self, issue: IssueCanonical, attachment_facts: AttachmentFacts) -> list[dict[str, Any]]:
        base_meta: dict[str, Any] = {
            "issue_key": issue.issue_key,
            "project": issue.project,
            "component": issue.component,
            "service": issue.service,
            "environment": issue.environment,
            "labels": issue.labels,
            "affected_version": issue.affected_version,
        }
        documents: list[dict[str, Any]] = [
            {
                **base_meta,
                "evidence_id": f"issue:{issue.issue_key}:summary",
                "source": f"jira:{issue.issue_key}:summary",
                "content": f"{issue.issue_key} {issue.summary}\n{issue.description}",
                "category": "issue",
            },
            {
                **base_meta,
                "evidence_id": f"issue:{issue.issue_key}:behavior",
                "source": f"jira:{issue.issue_key}:behavior",
                "content": f"Expected: {issue.expected_behavior}\nActual: {issue.actual_behavior}",
                "category": "issue",
            },
        ]
        for index, comment in enumerate(issue.comments, start=1):
            documents.append({
                **base_meta,
                "evidence_id": f"issue:{issue.issue_key}:comment:{index}",
                "source": f"jira:{issue.issue_key}:comment:{index}",
                "content": comment,
                "category": "comment",
            })
        for artifact in attachment_facts.artifacts:
            documents.append({
                **base_meta,
                "evidence_id": artifact.artifact_id,
                "source": f"artifact:{artifact.source_path}",
                "content": artifact.extracted_text or str(artifact.facts),
                "category": "artifact",
                "artifact_type": artifact.artifact_type,
            })
        return documents

    def _build_filter(self, issue: IssueCanonical) -> dict[str, Any] | None:
        must: list[dict[str, Any]] = []
        should: list[dict[str, Any]] = []
        if issue.project:
            must.append({"key": "project", "match": {"value": issue.project}})
        if issue.component:
            must.append({"key": "component", "match": {"value": issue.component}})
        if issue.environment:
            must.append({"key": "environment", "match": {"value": issue.environment}})
        if issue.service:
            must.append({"key": "service", "match": {"value": issue.service}})
        if issue.labels:
            should.append({"key": "labels", "match": {"any": issue.labels}})
        if issue.affected_version:
            should.append({"key": "affected_version", "match": {"value": issue.affected_version}})
        if not must and not should:
            return None
        result: dict[str, Any] = {}
        if must:
            result["must"] = must
        if should:
            result["should"] = should
        return result

    def _sparse_vector(self, text: str) -> dict[str, list[float] | list[int]]:
        frequencies: dict[int, float] = {}
        for token in self._tokenize(text):
            index = self._token_to_index(token)
            frequencies[index] = frequencies.get(index, 0.0) + 1.0
        indices = sorted(frequencies)
        values = [frequencies[index] for index in indices]
        return {"indices": indices, "values": values}

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        tokens = []
        current = []
        for char in text.lower():
            if char.isalnum() or char in {"-", "_", "/", ".", ":"}:
                current.append(char)
                continue
            if current:
                tokens.append("".join(current))
                current = []
        if current:
            tokens.append("".join(current))
        return tokens

    @staticmethod
    def _token_to_index(token: str) -> int:
        digest = hashlib.sha1(token.encode("utf-8")).hexdigest()
        return int(digest[:8], 16)

    def _request(self, method: str, path: str, json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        base_url = (self.settings.qdrant_url or "").rstrip("/")
        headers = {"Content-Type": "application/json"}
        if self.settings.qdrant_api_key:
            headers["api-key"] = self.settings.qdrant_api_key
        with httpx.Client(timeout=30.0) as client:
            response = client.request(method, f"{base_url}{path}", headers=headers, json=json_body)
            response.raise_for_status()
            return response.json() if response.content else {}

    @staticmethod
    def _extract_points(response: dict[str, Any]) -> list[dict[str, Any]]:
        result = response.get("result")
        if isinstance(result, dict):
            return result.get("points") or []
        if isinstance(result, list):
            return result
        return []
