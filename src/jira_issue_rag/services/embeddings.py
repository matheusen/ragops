from __future__ import annotations

import hashlib
import math

import httpx

from jira_issue_rag.core.config import Settings
from jira_issue_rag.providers.google_vertex_auth import GoogleVertexAuth


class EmbeddingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.vertex_auth = GoogleVertexAuth(settings)

    def embed_texts(self, texts: list[str]) -> tuple[list[list[float]], str]:
        cleaned = [text.strip() for text in texts]
        if not cleaned:
            return [], "local"
        if self.settings.allows_external_embeddings() and self.settings.openai_api_key:
            try:
                return self._embed_openai(cleaned), "openai"
            except httpx.HTTPError:
                pass
        if self.settings.allows_external_embeddings() and self.vertex_auth.is_available():
            try:
                return self._embed_gemini(cleaned), "gemini"
            except httpx.HTTPError:
                pass
        return [self._embed_local(text) for text in cleaned], "local"

    def embed_text(self, text: str) -> tuple[list[float], str]:
        vectors, backend = self.embed_texts([text])
        return (vectors[0] if vectors else self._embed_local(text), backend)

    def _embed_openai(self, texts: list[str]) -> list[list[float]]:
        payload = {
            "model": self.settings.openai_embedding_model,
            "input": texts,
            "dimensions": self.settings.embedding_dimension,
        }
        with httpx.Client(timeout=45.0) as client:
            response = client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {self.settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        return [self._coerce_dimension(item["embedding"]) for item in data.get("data", [])]

    def _embed_gemini(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        url = self.vertex_auth.build_predict_url(self.settings.gemini_embedding_model)
        headers = self.vertex_auth.build_headers()
        with httpx.Client(timeout=45.0) as client:
            for text in texts:
                response = client.post(
                    url,
                    headers=headers,
                    json={
                        "instances": [{"content": text}],
                        "parameters": {"outputDimensionality": self.settings.embedding_dimension},
                    },
                )
                response.raise_for_status()
                data = response.json()
                predictions = data.get("predictions", [])
                embedding = predictions[0].get("embeddings", {}) if predictions else {}
                vectors.append(self._coerce_dimension(embedding.get("values", [])))
        return vectors

    def _embed_local(self, text: str) -> list[float]:
        dimension = self.settings.embedding_dimension
        vector = [0.0] * dimension
        for token in self._tokenize(text):
            digest = hashlib.sha1(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % dimension
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            weight = 1.0 + (digest[5] / 255.0)
            vector[index] += sign * weight
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [round(value / norm, 8) for value in vector]

    def _coerce_dimension(self, vector: list[float]) -> list[float]:
        dimension = self.settings.embedding_dimension
        if len(vector) == dimension:
            return [float(value) for value in vector]
        if len(vector) > dimension:
            return [float(value) for value in vector[:dimension]]
        padded = [float(value) for value in vector]
        padded.extend([0.0] * (dimension - len(padded)))
        return padded

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        tokens: list[str] = []
        current: list[str] = []
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
