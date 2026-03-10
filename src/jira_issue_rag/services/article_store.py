"""article_store.py
Pipeline completo para ingestão de artigos em PDF:

  1. Extrai texto + divide em chunks por parágrafo/seção
  2. Gera embeddings para cada chunk
  3. Indexa no Qdrant (coleção separada `articles`)
  4. Constrói grafo no Neo4j:
       (:Article {id, title, path, chunk_count})
       (:Topic   {name})
       (Article)-[:HAS_TOPIC]->(Topic)
       (Article)-[:SHARES_TOPIC {topic, weight}]->(Article)   ← calculado após ingestão

Graph schema — articles
-----------------------
Os nós de artigo são separados dos nós de Issue para não misturar
os dois domínios. A busca por artigos usa filtro `doc_type=article`
no Qdrant.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TYPE_CHECKING

import httpx

from jira_issue_rag.services.embeddings import EmbeddingService
from jira_issue_rag.shared.models import (
    ArticleBenchmarkResponse,
    ArticleBenchmarkScenarioResult,
    ArticleDistillation,
    ArticleEvidencePath,
    ArticleIngestResponse,
    ArticleRetrievalEvaluationExample,
    ArticleRetrievalEvaluationExampleResult,
    ArticleRetrievalEvaluationResponse,
    ArticleSearchResult,
    EvaluationMetric,
    GraphUsefulnessAssessment,
)

if TYPE_CHECKING:
    from jira_issue_rag.core.config import Settings


# ── Qdrant collection name (separada de issue_evidence) ──────────────────────
ARTICLE_COLLECTION = "articles"

# ── Regex helpers ─────────────────────────────────────────────────────────────
_SECTION_BREAK = re.compile(r"\n{2,}")          # blank line = paragraph break
_CAMEL_SPLIT   = re.compile(r"(?<=[a-z])(?=[A-Z])")
_ISO_DATE      = re.compile(r"\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b")
_DAY_MONTH_YEAR = re.compile(
    r"\b(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(20\d{2})\b"
)
_MONTH_YEAR = re.compile(r"\b([a-z]+)\s+de\s+(20\d{2})\b")
_YEAR_ONLY = re.compile(r"\b(19\d{2}|20\d{2})\b")
_VERSION_PATTERN = re.compile(r"\b(?:v|ver(?:sion)?)[\s._-]*(\d+(?:\.\d+)*)\b")
_MULTISPACE = re.compile(r"\s+")
_PAGE_BREAK = re.compile(r"\[\[PAGE_BREAK:(\d+)]]")
_ENTITY_PATTERN = re.compile(
    r"\b(?:[A-Z][A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*|[A-Z]{2,}))*\b"
)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_TOKEN_PATTERN = re.compile(r"[a-z0-9]{3,}")
_GRAPH_CONNECTORS = {
    "between", "across", "relationship", "connect", "connected", "chain", "hop",
    "bridge", "dependency", "depends", "influence", "influences", "causes",
    "compare", "versus", "timeline", "version", "conflict", "hidden", "rule",
    "exception", "aggregate", "count", "sum", "network", "path",
}
_NON_ENTITY_TERMS = {
    "GraphRAG", "RAG", "LLM", "PDF", "API", "JSON", "GitHub", "Medium",
    "Why", "The", "This", "That", "And", "Pressione", "Leia", "Conclusion",
    "Introducao", "Artigo", "Documento", "Mas", "Sem", "Ele", "Ela", "Cinco",
    "Existe", "Veja", "Leitura", "Pressione Enter",
}


@dataclass(frozen=True)
class _ChunkRecord:
    content: str
    chunk_kind: str = "text"
    page_number: int | None = None
    section_title: str | None = None
    page_span: str | None = None
    table_title: str | None = None
    figure_caption: str | None = None
    local_context: str | None = None
    global_context: str | None = None


@dataclass(frozen=True)
class _SearchFilters:
    collection: str
    tenant_id: str | None = None
    source_tags: tuple[str, ...] = ()
    source_contains: str | None = None

# ── Stopwords PT/EN mínimas para extração de tópicos ─────────────────────────
_STOPWORDS = {
    "de", "da", "do", "em", "para", "com", "por", "que", "uma", "um",
    "the", "of", "and", "in", "to", "a", "is", "for", "this", "that",
    "are", "with", "be", "as", "an", "at", "it", "or", "by", "on",
}

_MONTHS = {
    "january": 1,
    "janeiro": 1,
    "february": 2,
    "fevereiro": 2,
    "march": 3,
    "marco": 3,
    "april": 4,
    "abril": 4,
    "may": 5,
    "maio": 5,
    "june": 6,
    "junho": 6,
    "july": 7,
    "julho": 7,
    "august": 8,
    "agosto": 8,
    "september": 9,
    "setembro": 9,
    "october": 10,
    "outubro": 10,
    "november": 11,
    "novembro": 11,
    "december": 12,
    "dezembro": 12,
}


# ─────────────────────────────────────────────────────────────────────────────
class ArticleStore:
    def __init__(self, settings: "Settings") -> None:
        self.settings = settings
        self.embeddings = EmbeddingService(settings)

    def _ensure_article_tenant_scope(
        self,
        *,
        collection: str,
        tenant_id: str | None,
        operation: str,
    ) -> None:
        if not self.settings.article_collection_requires_tenant(collection):
            return
        if tenant_id and tenant_id.strip():
            return
        raise ValueError(
            f"tenant_id is required for article {operation} on multi-tenant collection '{collection}'."
        )

    # ── Public API ────────────────────────────────────────────────────────────

    def ingest(
        self,
        paths: list[str],
        titles: list[str] | None = None,
        collection: str = ARTICLE_COLLECTION,
        tenant_id: str | None = None,
        source_tags: list[str] | None = None,
        source_type: str | None = None,
    ) -> list[ArticleIngestResponse]:
        """Ingere uma lista de PDFs (ou txt/md). Retorna um relatório por arquivo."""
        self._ensure_article_tenant_scope(collection=collection, tenant_id=tenant_id, operation="ingest")
        results: list[ArticleIngestResponse] = []
        for i, raw_path in enumerate(paths):
            title = (titles or [])[i] if titles and i < len(titles) else None
            results.append(
                self._ingest_one(
                    Path(raw_path),
                    title=title,
                    collection=collection,
                    tenant_id=tenant_id,
                    source_tags=source_tags or [],
                    source_type=source_type,
                )
            )
        # Após ingerir todos, recalcula arestas SHARES_TOPIC no Neo4j
        if self.settings.enable_graphrag:
            self._refresh_shared_topics_edges(collection=collection)
            self._refresh_temporal_version_edges()
        return results

    def search(
        self,
        query: str,
        top_k: int = 8,
        collection: str = ARTICLE_COLLECTION,
        retrieval_policy: str = "auto",
        tenant_id: str | None = None,
        source_tags: list[str] | None = None,
        source_contains: str | None = None,
        exact_match_required: bool = False,
        enable_corrective_rag: bool = True,
    ) -> list[ArticleSearchResult]:
        """Busca adaptativa: usa retrieval vetorial por padrão e sobe o grafo quando vale a pena."""
        self._ensure_article_tenant_scope(collection=collection, tenant_id=tenant_id, operation="search")
        assessment = self.assess_graph_usefulness(query)
        filters = _SearchFilters(
            collection=collection,
            tenant_id=tenant_id,
            source_tags=tuple(sorted(set(source_tags or []))),
            source_contains=source_contains.strip() if source_contains else None,
        )
        resolved_policy = self._resolve_retrieval_policy(
            query=query,
            requested_policy=retrieval_policy,
            assessment=assessment,
            exact_match_required=exact_match_required,
        )
        results = self._run_search_policy(
            query=query,
            top_k=top_k,
            filters=filters,
            assessment=assessment,
            policy=resolved_policy,
        )
        if enable_corrective_rag and self._needs_corrective_pass(query, results, exact_match_required=exact_match_required):
            corrected = self._run_corrective_search(
                query=query,
                top_k=top_k,
                filters=filters,
                assessment=assessment,
            )
            if corrected:
                return corrected[:top_k]
        return results[:top_k]

    def related_articles(
        self,
        doc_id: str,
        limit: int = 5,
        tenant_id: str | None = None,
        collection: str = ARTICLE_COLLECTION,
    ) -> list[dict[str, Any]]:
        """Retorna artigos relacionados via grafo Neo4j (SHARES_TOPIC).
        Fallback: busca por tópicos do artigo no Qdrant caso Neo4j não esteja ativo.
        """
        self._ensure_article_tenant_scope(collection=collection, tenant_id=tenant_id, operation="related")
        if self.settings.enable_graphrag:
            return self._neo4j_related(doc_id, limit=limit, tenant_id=tenant_id, collection=collection)
        return self._qdrant_related(doc_id, limit=limit, tenant_id=tenant_id, collection=collection)

    def benchmark_query_modes(
        self,
        query: str,
        top_k: int = 6,
        collection: str = ARTICLE_COLLECTION,
        tenant_id: str | None = None,
        source_tags: list[str] | None = None,
        source_contains: str | None = None,
        exact_match_required: bool = False,
        enable_corrective_rag: bool = True,
    ) -> ArticleBenchmarkResponse:
        self._ensure_article_tenant_scope(collection=collection, tenant_id=tenant_id, operation="benchmark")
        assessment = self.assess_graph_usefulness(query)
        filters = _SearchFilters(
            collection=collection,
            tenant_id=tenant_id,
            source_tags=tuple(sorted(set(source_tags or []))),
            source_contains=source_contains.strip() if source_contains else None,
        )
        scenarios: list[ArticleBenchmarkScenarioResult] = []
        for label, runner in [
            ("dense", lambda: self._search_dense_only(query, top_k=top_k, filters=filters, assessment=assessment)),
            ("hybrid", lambda: self._search_qdrant(query, top_k=top_k, filters=filters, assessment=assessment)),
            ("graph", lambda: self._search_graph_entities(query, top_k=top_k, filters=filters, assessment=assessment)),
            ("exact-page", lambda: self._search_exact_page(query, top_k=top_k, filters=filters, assessment=assessment)),
            ("adaptive", lambda: self.search(query, top_k=top_k, collection=collection, tenant_id=tenant_id, source_tags=source_tags, source_contains=source_contains, exact_match_required=exact_match_required, enable_corrective_rag=False)),
            ("corrective", lambda: self._run_corrective_search(query=query, top_k=top_k, filters=filters, assessment=assessment) if enable_corrective_rag else []),
        ]:
            started = time.perf_counter()
            try:
                results = runner()
            except Exception:
                results = []
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            metrics = self._quality_proxies(query, results)
            scenarios.append(
                ArticleBenchmarkScenarioResult(
                    mode=label,
                    retrieval_mode=(results[0].retrieval_mode if results else label),
                    latency_ms=elapsed_ms,
                    result_count=len(results),
                    avg_score=metrics["avg_score"],
                    precision_proxy=metrics["precision_proxy"],
                    recall_proxy=metrics["recall_proxy"],
                    faithfulness_proxy=metrics["faithfulness_proxy"],
                    top_doc_ids=[item.doc_id for item in results[:top_k]],
                    top_titles=[item.title for item in results[:top_k]],
                )
            )
        return ArticleBenchmarkResponse(
            query=query,
            recommended_mode=self._resolve_retrieval_policy(
                query=query,
                requested_policy="auto",
                assessment=assessment,
                exact_match_required=exact_match_required,
            ),
            graph_usefulness=assessment,
            scenarios=scenarios,
            provider_options=self._provider_benchmark_options(),
        )

    def evaluate_retrieval(
        self,
        *,
        dataset_path: str | None = None,
        examples: list[ArticleRetrievalEvaluationExample] | None = None,
    ) -> ArticleRetrievalEvaluationResponse:
        loaded_examples = list(examples or [])
        if dataset_path:
            payload = Path(dataset_path).read_text(encoding="utf-8")
            loaded_examples = [
                ArticleRetrievalEvaluationExample.model_validate(item)
                for item in self._load_json_list(payload)
            ]

        results: list[ArticleRetrievalEvaluationExampleResult] = []
        doc_hits = 0
        page_hits = 0
        page_annotated = 0
        chunk_hits = 0
        chunk_annotated = 0
        term_hits = 0
        term_annotated = 0
        reciprocal_rank_total = 0.0
        avg_score_total = 0.0

        for example in loaded_examples:
            self._ensure_article_tenant_scope(
                collection=example.collection,
                tenant_id=example.tenant_id,
                operation="evaluate",
            )
            ranked = self.search(
                query=example.query,
                top_k=example.top_k,
                collection=example.collection,
                retrieval_policy=example.retrieval_policy,
                tenant_id=example.tenant_id,
                source_tags=example.source_tags,
                source_contains=example.source_contains,
                exact_match_required=example.exact_match_required,
                enable_corrective_rag=example.enable_corrective_rag,
            )
            doc_hit, reciprocal_rank = self._doc_match_metrics(example, ranked)
            page_hit = self._page_match(example, ranked)
            chunk_kind_hit = self._chunk_kind_match(example, ranked)
            must_include_terms_hit = self._required_terms_match(example, ranked)
            avg_score = round(sum(item.score for item in ranked[: min(5, len(ranked))]) / max(1, min(5, len(ranked))), 4)
            results.append(
                ArticleRetrievalEvaluationExampleResult(
                    query=example.query,
                    retrieval_policy=example.retrieval_policy,
                    result_count=len(ranked),
                    top_doc_ids=[item.doc_id for item in ranked[: example.top_k]],
                    top_titles=[item.title for item in ranked[: example.top_k]],
                    top_page_numbers=[item.page_number for item in ranked[: example.top_k] if item.page_number is not None],
                    top_chunk_kinds=[item.chunk_kind for item in ranked[: example.top_k]],
                    doc_hit=doc_hit,
                    page_hit=page_hit,
                    chunk_kind_hit=chunk_kind_hit,
                    must_include_terms_hit=must_include_terms_hit,
                    reciprocal_rank=reciprocal_rank,
                    avg_score=avg_score,
                )
            )
            doc_hits += int(doc_hit)
            reciprocal_rank_total += reciprocal_rank
            avg_score_total += avg_score
            if example.expected_page_numbers:
                page_annotated += 1
                page_hits += int(page_hit)
            if example.expected_chunk_kind:
                chunk_annotated += 1
                chunk_hits += int(chunk_kind_hit)
            if example.must_include_terms:
                term_annotated += 1
                term_hits += int(must_include_terms_hit)

        total = max(1, len(results))
        metrics = [
            EvaluationMetric(name="doc_hit_rate", value=doc_hits / total),
            EvaluationMetric(name="mrr", value=reciprocal_rank_total / total),
            EvaluationMetric(name="avg_top_score", value=avg_score_total / total),
        ]
        if page_annotated:
            metrics.append(EvaluationMetric(name="page_hit_rate", value=page_hits / page_annotated))
        if chunk_annotated:
            metrics.append(EvaluationMetric(name="chunk_kind_hit_rate", value=chunk_hits / chunk_annotated))
        if term_annotated:
            metrics.append(EvaluationMetric(name="must_include_terms_hit_rate", value=term_hits / term_annotated))

        return ArticleRetrievalEvaluationResponse(
            dataset_path=dataset_path,
            total_examples=len(results),
            metrics=metrics,
            examples=results,
        )

    def distill_for_small_model(
        self,
        query: str,
        results: list[ArticleSearchResult],
        assessment: GraphUsefulnessAssessment | None = None,
    ) -> ArticleDistillation:
        effective_assessment = assessment or self.assess_graph_usefulness(query)
        top_results = results[:4]
        key_entities = sorted({entity for item in top_results for entity in item.entities})[:10]
        key_topics = sorted({topic for item in top_results for topic in item.topics})[:10]
        evidence_paths = [path for item in top_results for path in item.evidence_paths][:4]
        bullets = [
            f"- Query intent: {effective_assessment.mode} ({effective_assessment.rationale})",
        ]
        if key_entities:
            bullets.append(f"- Entities: {', '.join(key_entities[:8])}")
        if key_topics:
            bullets.append(f"- Topics: {', '.join(key_topics[:8])}")
        for item in top_results:
            snippet = " ".join(item.content.split())[:260]
            bullets.append(
                f"- Evidence [{item.title} #{item.chunk_index}] score={item.score:.3f}: {snippet}"
            )
        if evidence_paths:
            for path in evidence_paths[:3]:
                bullets.append(f"- Path {path.relation}: {' -> '.join(path.nodes[:6])}")
        return ArticleDistillation(
            mode="small-model-graph-distilled",
            context_text="\n".join(bullets).strip(),
            key_entities=key_entities,
            key_topics=key_topics,
            evidence_paths=evidence_paths,
        )

    # ── Ingestão individual ───────────────────────────────────────────────────

    def _ingest_one(
        self,
        path: Path,
        title: str | None,
        collection: str,
        tenant_id: str | None = None,
        source_tags: list[str] | None = None,
        source_type: str | None = None,
    ) -> ArticleIngestResponse:
        doc_id = self._doc_id(path)
        title  = title or path.stem.replace("_", " ").replace("-", " ").title()
        source_tags = sorted(set(source_tags or []))

        raw_text = self._extract_text(path)
        if not raw_text.strip():
            return ArticleIngestResponse(
                doc_id=doc_id, title=title, path=str(path), collection=collection, tenant_id=tenant_id, source_tags=source_tags,
                chunks_indexed=0, topics=[], ok=False,
                error="Não foi possível extrair texto do arquivo.",
            )

        temporal_meta = self._extract_temporal_metadata(path=path, title=title, raw_text=raw_text)
        raw_chunk_records = self._chunk_document(raw_text)
        chunk_records, chunk_stats, chunk_warnings = self._optimize_chunk_records(raw_chunk_records)
        if not chunk_records:
            return ArticleIngestResponse(
                doc_id=doc_id, title=title, path=str(path), collection=collection, tenant_id=tenant_id, source_tags=source_tags,
                chunks_indexed=0, topics=[], ok=False,
                chunk_stats=chunk_stats,
                warnings=[*chunk_warnings, "Nenhum chunk válido restou após a validação do documento."],
                error="Chunking inválido ou texto insuficiente após deduplicação.",
            )
        chunks = [record.content for record in chunk_records]
        topics_per_chunk = [self._extract_topics(record.content) for record in chunk_records]
        entities_per_chunk = [self._extract_entities(record.content) for record in chunk_records]
        all_topics = sorted({t for ts in topics_per_chunk for t in ts})
        all_entities = sorted({entity for es in entities_per_chunk for entity in es})

        # ── Qdrant ─────────────────────────────────────────────────────
        indexed = 0
        if self._qdrant_available():
            self._ensure_collection(collection)
            texts         = chunks
            dense_vectors, _ = self.embeddings.embed_texts(texts)
            points: list[dict[str, Any]] = []
            for idx, (record, dense) in enumerate(zip(chunk_records, dense_vectors, strict=False)):
                chunk_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:chunk:{idx}"))
                sparse   = self._build_sparse_vector(record.content)
                points.append({
                    "id": chunk_id,
                    "vector": {"dense": dense, "text": sparse},
                    "payload": {
                        "doc_type":    "article",
                        "doc_id":      doc_id,
                        "collection":  collection,
                        "tenant_id":   tenant_id,
                        "source_tags": source_tags,
                        "source_type": source_type or path.suffix.lower().lstrip("."),
                        "title":       title,
                        "source_path": str(path),
                        "chunk_index": idx,
                        "content":     record.content,
                        "chunk_kind":  record.chunk_kind,
                        "page_number": record.page_number,
                        "section_title": record.section_title,
                        "page_span":   record.page_span,
                        "table_title": record.table_title,
                        "figure_caption": record.figure_caption,
                        "local_context": record.local_context,
                        "global_context": record.global_context,
                        "topics":      topics_per_chunk[idx],
                        "entities":    entities_per_chunk[idx],
                        "canonical_title": temporal_meta["canonical_title"],
                        "published_at": temporal_meta["published_at"],
                        "published_year": temporal_meta["published_year"],
                        "version_label": temporal_meta["version_label"],
                    },
                })
            self._qdrant(
                "PUT",
                f"/collections/{collection}/points?wait=true",
                json_body={"points": points},
            )
            indexed = len(points)

        # ── Neo4j ──────────────────────────────────────────────────────
        if self.settings.enable_graphrag:
            self._neo4j_index_article(
                doc_id=doc_id, title=title, path=str(path),
                topics=all_topics, chunk_count=len(chunks),
                chunks=chunk_records,
                entities_per_chunk=entities_per_chunk,
                temporal_meta=temporal_meta,
                collection=collection,
                tenant_id=tenant_id,
                source_tags=source_tags,
            )

        return ArticleIngestResponse(
            doc_id=doc_id, title=title, path=str(path), collection=collection, tenant_id=tenant_id, source_tags=source_tags,
            chunks_indexed=indexed,
            topics=sorted(set([*all_topics, *all_entities[:8]])),
            canonical_title=temporal_meta["canonical_title"],
            published_at=temporal_meta["published_at"],
            published_year=temporal_meta["published_year"],
            version_label=temporal_meta["version_label"],
            chunk_stats=chunk_stats,
            warnings=chunk_warnings,
            ok=True,
        )

    # ── Text extraction & chunking ────────────────────────────────────────────

    def _extract_text(self, path: Path) -> str:
        """5-pass extraction — da mais rica para fallback simples.

        Pass 0 — MonkeyOCR  (SRR paradigm: melhor para PDFs com tabelas, fórmulas,
                             multi-coluna, figuras. Requer sidecar local na URL
                             MONKEYOCR_API_URL, padrão http://localhost:8001)
        Pass 1 — Docling    (estrutura + tabelas + colunas + layout awareness)
        Pass 2 — pypdf      (camada de texto nativa, rápido, sem deps pesadas)
        Pass 3 — OCR local via Tesseract  (PDFs escaneados / imagens incorporadas)
        Pass 4 — sidecar    (arquivo .txt ao lado do PDF, ground truth manual)
        """
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            # ── Pass 0: MonkeyOCR sidecar (melhor qualidade) ──────────────────
            if self.settings.enable_monkeyocr_pdf_parser:
                text = self._monkeyocr(path)
                if text.strip():
                    return text

            # ── Pass 1: pypdf (mais estável para born-digital PDFs) ───────────
            text = ArticleStore._pypdf(path)
            if text.strip():
                return text

            # ── Pass 2: Docling ───────────────────────────────────────────────
            if self.settings.enable_docling_pdf_parser:
                text = ArticleStore._docling(path)
                if text.strip():
                    return text

            # ── Pass 3: OCR (Tesseract via pdf2image) ─────────────────────────
            if self.settings.enable_tesseract_pdf_ocr:
                text = ArticleStore._ocr_tesseract(path)
                if text.strip():
                    return text

        if suffix in {".txt", ".md"}:
            return path.read_text(encoding="utf-8", errors="replace")

        # ── Pass 4: sidecar ───────────────────────────────────────────────────
        for candidate in (Path(str(path) + ".txt"), path.with_suffix(".txt")):
            if candidate.exists():
                return candidate.read_text(encoding="utf-8", errors="replace")

        return ""

    def _monkeyocr(self, path: Path) -> str:
        """MonkeyOCR v1.5 via FastAPI sidecar local.

        Usa o paradigma SRR (Structure-Recognition-Relation): detecta primeiro os
        blocos de layout (onde?), depois classifica cada bloco (o quê?), depois
        prevê a relação de leitura (como está organizado?). É o melhor extrator
        disponível para artigos científicos com fórmulas LaTeX, tabelas complexas
        e layouts multi-coluna — supera Docling, Docling, Gemini 2.5-Pro e GPT-4o
        no OmniDocBench (Fev 2026).

        Para subir o sidecar:
            # Instala MonkeyOCR
            git clone https://github.com/Yuliang-Liu/MonkeyOCR
            cd MonkeyOCR && pip install -e .
            python tools/download_model.py -n MonkeyOCR-pro-1.2B   # 1.2B = ~4GB, roda em 8GB VRAM
            uvicorn api.main:app --port 8000                        # ou --port 7861 no Docker

        Endpoint usado: POST /parse  →  {success, output_dir, files}
        O markdown é lido do output_dir (mesmo host).

        Variável de ambiente:
            MONKEYOCR_API_URL  (padrão: http://localhost:8001)

        Retorna string vazia se o sidecar não estiver disponível (cascada para
        Docling automaticamente).
        """
        import os
        base_url = (
            self.settings.monkeyocr_api_url
            if self.settings.monkeyocr_api_url
            else os.environ.get("MONKEYOCR_API_URL", "http://localhost:8001")
        ).rstrip("/")
        try:
            with open(path, "rb") as fh:
                resp = httpx.post(
                    f"{base_url}/parse",
                    files={"file": (path.name, fh, "application/pdf")},
                    timeout=300.0,
                )
            if resp.status_code != 200:
                return ""
            data = resp.json()
            if not data.get("success"):
                return ""

            # MonkeyOCR /parse saves markdown to output_dir on disk (same machine).
            # Find the .md file and read it; fall back to .txt if no .md present.
            output_dir = data.get("output_dir")
            if output_dir and Path(output_dir).is_dir():
                md_files = sorted(Path(output_dir).glob("**/*.md"))
                if md_files:
                    parts = [f.read_text(encoding="utf-8", errors="replace") for f in md_files]
                    return "\n\n".join(parts).strip()
                txt_files = sorted(Path(output_dir).glob("**/*.txt"))
                if txt_files:
                    parts = [f.read_text(encoding="utf-8", errors="replace") for f in txt_files]
                    return "\n\n".join(parts).strip()

            # Inline content fallback (older API shape)
            for key in ("content", "markdown", "text"):
                val = data.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
            return ""
        except Exception:
            # sidecar não está rodando — fallback silencioso para Docling
            return ""

    @staticmethod
    def _docling(path: Path) -> str:
        """Docling: extrai Markdown estruturado preservando tabelas, colunas e cabeçalhos.
        É a melhor opção para artigos científicos com múltiplas colunas e figuras.
        Requer: pip install docling
        """
        try:
            from docling.document_converter import DocumentConverter  # type: ignore[import-untyped]
            converter = DocumentConverter()
            result = converter.convert(str(path))
            return result.document.export_to_markdown().strip()
        except Exception:
            return ""

    @staticmethod
    def _pypdf(path: Path) -> str:
        """pypdf: extrai a camada de texto nativa do PDF.
        Rápido e leve. Funciona bem em PDFs born-digital, falha em PDFs escaneados.
        Requer: pip install pypdf
        """
        try:
            from pypdf import PdfReader  # type: ignore[import-untyped]
            reader = PdfReader(str(path))
            parts = [
                f"[[PAGE_BREAK:{index + 1}]]\n{page.extract_text() or ''}"
                for index, page in enumerate(reader.pages)
            ]
            return "\n\n".join(parts).strip()
        except Exception:
            return ""

    @staticmethod
    def _ocr_tesseract(path: Path) -> str:
        """OCR via Tesseract + pdf2image.
        Usado quando o PDF é uma imagem escaneada (conteúdo em pixels, sem camada de texto).
        Requer: pip install pytesseract pdf2image  +  tesseract-ocr instalado no SO.
        """
        try:
            import pytesseract  # type: ignore[import-untyped]
            from pdf2image import convert_from_path  # type: ignore[import-untyped]
            images = convert_from_path(str(path), dpi=300)
            parts = [
                f"[[PAGE_BREAK:{index + 1}]]\n{pytesseract.image_to_string(img, lang='por+eng')}"
                for index, img in enumerate(images)
            ]
            return "\n\n".join(parts).strip()
        except Exception:
            return ""

    @classmethod
    def _chunk_document(cls, text: str, max_chars: int = 800, min_chars: int = 80) -> list[_ChunkRecord]:
        """Chunking orientado a página/seção com heurísticas de tabela/figura."""
        pages = cls._split_pages(text)
        records: list[_ChunkRecord] = []
        for page_number, page_text in pages:
            current_section: str | None = None
            buffer = ""
            buffer_section: str | None = None
            for para in [p.strip() for p in _SECTION_BREAK.split(page_text) if p.strip()]:
                raw_block = para.strip()
                block_lines = [line.strip() for line in raw_block.splitlines() if line.strip()]
                if block_lines and cls._looks_like_heading(block_lines[0]) and len(block_lines) > 1:
                    if buffer and len(buffer) >= min_chars:
                        records.extend(
                            cls._split_long_chunk(
                                buffer,
                                max_chars=max_chars,
                                chunk_kind="text",
                                page_number=page_number,
                                section_title=buffer_section,
                                page_span=cls._page_span(page_number),
                                global_context=cls._build_global_context(page_number, buffer_section),
                            )
                        )
                        buffer = ""
                    current_section = block_lines[0][:180]
                    raw_block = "\n".join(block_lines[1:]).strip()
                    if not raw_block:
                        continue

                multimodal_segments = cls._split_multimodal_blocks(raw_block)
                if len(multimodal_segments) > 1:
                    if buffer and len(buffer) >= min_chars:
                        records.extend(
                            cls._split_long_chunk(
                                buffer,
                                max_chars=max_chars,
                                chunk_kind="text",
                                page_number=page_number,
                                section_title=buffer_section,
                                page_span=cls._page_span(page_number),
                                global_context=cls._build_global_context(page_number, buffer_section),
                            )
                        )
                        buffer = ""
                    for segment in multimodal_segments:
                        segment_kind = cls._classify_chunk_kind(segment)
                        if segment_kind not in {"table", "figure"}:
                            segment_normalized = _MULTISPACE.sub(" ", segment).strip()
                            if not segment_normalized:
                                continue
                            next_buffer = (buffer + "\n\n" + segment_normalized).strip() if buffer else segment_normalized
                            if len(next_buffer) <= max_chars:
                                buffer = next_buffer
                                buffer_section = current_section
                                continue
                            if buffer and len(buffer) >= min_chars:
                                records.extend(
                                    cls._split_long_chunk(
                                        buffer,
                                        max_chars=max_chars,
                                        chunk_kind="text",
                                        page_number=page_number,
                                        section_title=buffer_section,
                                        page_span=cls._page_span(page_number),
                                        global_context=cls._build_global_context(page_number, buffer_section),
                                    )
                                )
                            buffer = segment_normalized
                            buffer_section = current_section
                            continue

                        table_title = cls._extract_table_title(segment, current_section) if segment_kind == "table" else None
                        figure_caption = cls._extract_figure_caption(segment, current_section) if segment_kind == "figure" else None
                        local_context = table_title or figure_caption or cls._extract_local_context(segment)
                        global_context = cls._build_global_context(page_number, current_section)
                        records.extend(
                            cls._split_long_chunk(
                                cls._normalize_structured_block(segment),
                                max_chars=max_chars,
                                chunk_kind=segment_kind,
                                page_number=page_number,
                                section_title=current_section,
                                page_span=cls._page_span(page_number),
                                table_title=table_title,
                                figure_caption=figure_caption,
                                local_context=local_context,
                                global_context=global_context,
                            )
                        )
                    continue

                normalized = _MULTISPACE.sub(" ", raw_block).strip()
                if not normalized:
                    continue
                if cls._looks_like_heading(normalized):
                    if buffer and len(buffer) >= min_chars:
                        records.extend(
                            cls._split_long_chunk(
                                buffer,
                                max_chars=max_chars,
                                chunk_kind="text",
                                page_number=page_number,
                                section_title=buffer_section,
                                page_span=cls._page_span(page_number),
                                global_context=cls._build_global_context(page_number, buffer_section),
                            )
                        )
                        buffer = ""
                    current_section = normalized[:180]
                    continue
                chunk_kind = cls._classify_chunk_kind(raw_block)
                if chunk_kind in {"table", "figure"}:
                    if buffer and len(buffer) >= min_chars:
                        records.extend(
                            cls._split_long_chunk(
                                buffer,
                                max_chars=max_chars,
                                chunk_kind="text",
                                page_number=page_number,
                                section_title=buffer_section,
                                page_span=cls._page_span(page_number),
                                global_context=cls._build_global_context(page_number, buffer_section),
                            )
                        )
                        buffer = ""
                    structured_block = cls._normalize_structured_block(raw_block)
                    table_title = cls._extract_table_title(structured_block, current_section) if chunk_kind == "table" else None
                    figure_caption = cls._extract_figure_caption(structured_block, current_section) if chunk_kind == "figure" else None
                    local_context = table_title or figure_caption or cls._extract_local_context(structured_block)
                    global_context = cls._build_global_context(page_number, current_section)
                    records.extend(
                        cls._split_long_chunk(
                            structured_block,
                            max_chars=max_chars,
                            chunk_kind=chunk_kind,
                            page_number=page_number,
                            section_title=current_section,
                            page_span=cls._page_span(page_number),
                            table_title=table_title,
                            figure_caption=figure_caption,
                            local_context=local_context,
                            global_context=global_context,
                        )
                    )
                    continue
                next_buffer = (buffer + "\n\n" + normalized).strip() if buffer else normalized
                if len(next_buffer) <= max_chars:
                    buffer = next_buffer
                    buffer_section = current_section
                    continue
                if buffer and len(buffer) >= min_chars:
                    records.extend(
                        cls._split_long_chunk(
                            buffer,
                            max_chars=max_chars,
                            chunk_kind="text",
                            page_number=page_number,
                            section_title=buffer_section,
                            page_span=cls._page_span(page_number),
                            global_context=cls._build_global_context(page_number, buffer_section),
                        )
                    )
                buffer = normalized
                buffer_section = current_section
            if buffer and len(buffer) >= min_chars:
                records.extend(
                    cls._split_long_chunk(
                        buffer,
                        max_chars=max_chars,
                        chunk_kind="text",
                        page_number=page_number,
                        section_title=buffer_section,
                        page_span=cls._page_span(page_number),
                        global_context=cls._build_global_context(page_number, buffer_section),
                    )
                )
        return records

    @classmethod
    def _optimize_chunk_records(
        cls,
        records: list[_ChunkRecord],
        *,
        min_chars: int = 80,
        max_chars: int = 800,
    ) -> tuple[list[_ChunkRecord], dict[str, Any], list[str]]:
        accepted: list[_ChunkRecord] = []
        exact_duplicates_removed = 0
        near_duplicates_removed = 0
        exact_seen: set[tuple[str, int | None, str | None, str]] = set()
        buckets: dict[tuple[int | None, str | None, str], list[_ChunkRecord]] = {}

        for record in records:
            normalized = cls._normalize_chunk_text(record.content)
            if len(normalized) < max(24, min_chars // 2):
                continue
            exact_key = (normalized, record.page_number, record.section_title, record.chunk_kind)
            if exact_key in exact_seen:
                exact_duplicates_removed += 1
                continue

            bucket_key = (record.page_number, record.section_title, record.chunk_kind)
            siblings = buckets.setdefault(bucket_key, [])
            if any(cls._is_near_duplicate(record, existing) for existing in siblings[-4:]):
                near_duplicates_removed += 1
                continue

            exact_seen.add(exact_key)
            siblings.append(record)
            accepted.append(record)

        high_overlap_pairs = 0
        for left, right in zip(accepted, accepted[1:], strict=False):
            if (
                left.page_number == right.page_number
                and left.section_title == right.section_title
                and left.chunk_kind == right.chunk_kind
                and cls._overlap_ratio(left.content, right.content) >= 0.72
            ):
                high_overlap_pairs += 1

        lengths = [len(item.content) for item in accepted]
        short_chunks = sum(1 for size in lengths if size < min_chars)
        long_chunks = sum(1 for size in lengths if size > max_chars)
        avg_chunk_chars = round(sum(lengths) / max(1, len(lengths)), 2)
        stats = {
            "raw_chunk_count": len(records),
            "deduped_chunk_count": len(accepted),
            "exact_duplicates_removed": exact_duplicates_removed,
            "near_duplicates_removed": near_duplicates_removed,
            "high_overlap_pairs": high_overlap_pairs,
            "short_chunks": short_chunks,
            "long_chunks": long_chunks,
            "avg_chunk_chars": avg_chunk_chars,
        }

        warnings: list[str] = []
        removed_ratio = (exact_duplicates_removed + near_duplicates_removed) / max(1, len(records))
        if removed_ratio >= 0.15:
            warnings.append(
                f"Deduplicação removeu {exact_duplicates_removed + near_duplicates_removed} chunks redundantes "
                f"de {len(records)} gerados."
            )
        if high_overlap_pairs >= max(2, len(accepted) // 6):
            warnings.append(
                f"Foram detectados {high_overlap_pairs} pares de chunks vizinhos com overlap alto; "
                "vale revisar o chunking deste documento."
            )
        if accepted and avg_chunk_chars < 220:
            warnings.append(
                f"O tamanho médio dos chunks ficou baixo ({avg_chunk_chars} chars), o que tende a prejudicar recall."
            )
        return accepted, stats, warnings

    @classmethod
    def _split_pages(cls, text: str) -> list[tuple[int | None, str]]:
        if not _PAGE_BREAK.search(text):
            return [(None, text)]
        pages: list[tuple[int | None, str]] = []
        parts = _PAGE_BREAK.split(text)
        prefix = parts[0].strip()
        if prefix:
            pages.append((None, prefix))
        for idx in range(1, len(parts), 2):
            page_number = int(parts[idx])
            page_text = parts[idx + 1].strip() if idx + 1 < len(parts) else ""
            if page_text:
                pages.append((page_number, page_text))
        return pages or [(None, text)]

    @classmethod
    def _split_long_chunk(
        cls,
        text: str,
        *,
        max_chars: int,
        chunk_kind: str,
        page_number: int | None,
        section_title: str | None,
        page_span: str | None = None,
        table_title: str | None = None,
        figure_caption: str | None = None,
        local_context: str | None = None,
        global_context: str | None = None,
    ) -> list[_ChunkRecord]:
        if len(text) <= max_chars:
            return [
                _ChunkRecord(
                    cls._compose_chunk_text(
                        text,
                        chunk_kind=chunk_kind,
                        table_title=table_title,
                        figure_caption=figure_caption,
                        local_context=local_context,
                        global_context=global_context,
                    ),
                    chunk_kind=chunk_kind,
                    page_number=page_number,
                    section_title=section_title,
                    page_span=page_span,
                    table_title=table_title,
                    figure_caption=figure_caption,
                    local_context=local_context,
                    global_context=global_context,
                )
            ]
        records: list[_ChunkRecord] = []
        if chunk_kind == "table":
            rows = [line.strip() for line in text.splitlines() if line.strip()]
            header = local_context or (rows[0] if rows else "")
            body_rows = rows[1:] if rows and header == rows[0] else rows
            sub_rows: list[str] = []
            for row in body_rows:
                candidate_rows = [*sub_rows, row]
                candidate_body = "\n".join(([header] if header else []) + candidate_rows).strip()
                candidate_text = cls._compose_chunk_text(
                    candidate_body,
                    chunk_kind=chunk_kind,
                    table_title=table_title,
                    figure_caption=figure_caption,
                    local_context=local_context,
                    global_context=global_context,
                )
                if len(candidate_text) <= max_chars or not sub_rows:
                    sub_rows = candidate_rows
                    continue
                flushed_body = "\n".join(([header] if header else []) + sub_rows).strip()
                records.append(
                    _ChunkRecord(
                        cls._compose_chunk_text(
                            flushed_body,
                            chunk_kind=chunk_kind,
                            table_title=table_title,
                            figure_caption=figure_caption,
                            local_context=local_context,
                            global_context=global_context,
                        ),
                        chunk_kind=chunk_kind,
                        page_number=page_number,
                        section_title=section_title,
                        page_span=page_span,
                        table_title=table_title,
                        figure_caption=figure_caption,
                        local_context=local_context,
                        global_context=global_context,
                    )
                )
                sub_rows = [row]
            if sub_rows:
                final_body = "\n".join(([header] if header else []) + sub_rows).strip()
                records.append(
                    _ChunkRecord(
                        cls._compose_chunk_text(
                            final_body,
                            chunk_kind=chunk_kind,
                            table_title=table_title,
                            figure_caption=figure_caption,
                            local_context=local_context,
                            global_context=global_context,
                        ),
                        chunk_kind=chunk_kind,
                        page_number=page_number,
                        section_title=section_title,
                        page_span=page_span,
                        table_title=table_title,
                        figure_caption=figure_caption,
                        local_context=local_context,
                        global_context=global_context,
                    )
                )
            return records

        sentences = re.split(r"(?<=[.!?])\s+", text)
        sub = ""
        for sent in sentences:
            candidate = (sub + " " + sent).strip() if sub else sent
            candidate_text = cls._compose_chunk_text(
                candidate,
                chunk_kind=chunk_kind,
                table_title=table_title,
                figure_caption=figure_caption,
                local_context=local_context,
                global_context=global_context,
            )
            if len(candidate_text) <= max_chars or not sub:
                sub = candidate
            else:
                records.append(
                    _ChunkRecord(
                        cls._compose_chunk_text(
                            sub,
                            chunk_kind=chunk_kind,
                            table_title=table_title,
                            figure_caption=figure_caption,
                            local_context=local_context,
                            global_context=global_context,
                        ),
                        chunk_kind=chunk_kind,
                        page_number=page_number,
                        section_title=section_title,
                        page_span=page_span,
                        table_title=table_title,
                        figure_caption=figure_caption,
                        local_context=local_context,
                        global_context=global_context,
                    )
                )
                sub = sent
        if sub:
            records.append(
                _ChunkRecord(
                    cls._compose_chunk_text(
                        sub,
                        chunk_kind=chunk_kind,
                        table_title=table_title,
                        figure_caption=figure_caption,
                        local_context=local_context,
                        global_context=global_context,
                    ),
                    chunk_kind=chunk_kind,
                    page_number=page_number,
                    section_title=section_title,
                    page_span=page_span,
                    table_title=table_title,
                    figure_caption=figure_caption,
                    local_context=local_context,
                    global_context=global_context,
                )
            )
        return records

    @staticmethod
    def _page_span(page_number: int | None) -> str | None:
        return str(page_number) if page_number is not None else None

    @classmethod
    def _build_global_context(cls, page_number: int | None, section_title: str | None) -> str | None:
        parts: list[str] = []
        if section_title:
            parts.append(f"section={section_title}")
        if page_number is not None:
            parts.append(f"page={page_number}")
        return " | ".join(parts) if parts else None

    @classmethod
    def _extract_local_context(cls, text: str) -> str | None:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if lines:
            return lines[0][:180]
        normalized = _MULTISPACE.sub(" ", text).strip()
        return normalized[:180] if normalized else None

    @classmethod
    def _split_multimodal_blocks(cls, text: str) -> list[str]:
        lines = [line.rstrip() for line in text.splitlines() if line.strip()]
        if not lines:
            return []
        markers = ("table ", "tabela ", "figure ", "fig.", "fig ", "screenshot", "captura", "imagem", "diagram", "chart")
        blocks: list[list[str]] = []
        current: list[str] = []
        for line in lines:
            lowered = cls._normalize_ascii(line)
            is_marker = lowered.startswith(markers)
            if is_marker and current:
                blocks.append(current)
                current = [line]
                continue
            current.append(line)
        if current:
            blocks.append(current)
        return ["\n".join(block).strip() for block in blocks if any(part.strip() for part in block)]

    @staticmethod
    def _normalize_structured_block(text: str) -> str:
        lines = [_MULTISPACE.sub(" ", line).strip() for line in text.splitlines() if line.strip()]
        return "\n".join(lines).strip()

    @classmethod
    def _extract_table_title(cls, text: str, current_section: str | None) -> str | None:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in lines[:2]:
            lowered = cls._normalize_ascii(line)
            if lowered.startswith(("table ", "tabela ")):
                return line[:180]
        if current_section and any(token in cls._normalize_ascii(current_section) for token in ("table", "tabela")):
            return current_section[:180]
        if lines:
            first = lines[0]
            if len(first) <= 180 and ("|" in first or "\t" in first or len(re.findall(r"\b\d+(?:[.,]\d+)?\b", first)) >= 2):
                return first[:180]
        return None

    @classmethod
    def _extract_figure_caption(cls, text: str, current_section: str | None) -> str | None:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in lines[:3]:
            lowered = cls._normalize_ascii(line)
            if lowered.startswith(("figure ", "fig.", "fig ", "screenshot", "captura", "imagem", "diagram", "chart")):
                return line[:180]
        if current_section and any(token in cls._normalize_ascii(current_section) for token in ("figure", "figura", "screenshot", "captura", "imagem")):
            return current_section[:180]
        return lines[0][:180] if lines else None

    @staticmethod
    def _compose_chunk_text(
        text: str,
        *,
        chunk_kind: str,
        table_title: str | None,
        figure_caption: str | None,
        local_context: str | None,
        global_context: str | None,
    ) -> str:
        prefix: list[str] = []
        used_context_values: set[str] = set()
        if chunk_kind == "table" and table_title:
            prefix.append(f"[table_title] {table_title}")
            used_context_values.add(table_title)
        elif chunk_kind == "figure" and figure_caption:
            prefix.append(f"[figure_caption] {figure_caption}")
            used_context_values.add(figure_caption)
        if local_context and local_context not in used_context_values:
            prefix.append(f"[local_context] {local_context}")
            used_context_values.add(local_context)
        if global_context:
            prefix.append(f"[global_context] {global_context}")
        body = text.strip()
        return "\n".join([*prefix, body]).strip()

    @classmethod
    def _normalize_chunk_text(cls, text: str) -> str:
        normalized = cls._normalize_ascii(text)
        normalized = _MULTISPACE.sub(" ", normalized).strip()
        return normalized

    @classmethod
    def _is_near_duplicate(cls, candidate: _ChunkRecord, existing: _ChunkRecord) -> bool:
        left = cls._normalize_chunk_text(candidate.content)
        right = cls._normalize_chunk_text(existing.content)
        if not left or not right:
            return False
        shorter, longer = sorted((left, right), key=len)
        length_ratio = len(shorter) / max(1, len(longer))
        if length_ratio >= 0.82 and shorter in longer:
            return True
        token_overlap = cls._overlap_ratio(left, right)
        return length_ratio >= 0.88 and token_overlap >= 0.9

    @classmethod
    def _overlap_ratio(cls, left: str, right: str) -> float:
        left_tokens = cls._token_set(left)
        right_tokens = cls._token_set(right)
        if not left_tokens or not right_tokens:
            return 0.0
        intersection = len(left_tokens & right_tokens)
        union = len(left_tokens | right_tokens)
        return intersection / max(1, union)

    @classmethod
    def _token_set(cls, text: str) -> set[str]:
        return set(_TOKEN_PATTERN.findall(cls._normalize_ascii(text)))

    @classmethod
    def _looks_like_heading(cls, text: str) -> bool:
        if len(text) > 120 or len(text.split()) > 14:
            return False
        if text.endswith((".", "!", "?", ";", ":")):
            return False
        lowered = cls._normalize_ascii(text)
        return bool(
            re.match(r"^(section|secao|capitulo|chapter|parte|part|appendix|anexo|\d+(\.\d+){0,3})\b", lowered)
            or (text == text.upper() and len(text) > 6)
            or sum(ch.isupper() for ch in text) >= max(2, len(text.split()) // 2)
        )

    @classmethod
    def _classify_chunk_kind(cls, text: str) -> str:
        lowered = cls._normalize_ascii(text)
        if (
            text.count("|") >= 4
            or text.count("\t") >= 2
            or len(re.findall(r"\b\d+(?:[.,]\d+)?\b", text)) >= 6
            or "table" in lowered
            or "tabela" in lowered
        ):
            return "table"
        if any(term in lowered for term in ("figure", "fig.", "screenshot", "captura", "imagem", "diagram", "chart")):
            return "figure"
        return "text"

    @staticmethod
    def _extract_topics(text: str, top_n: int = 8) -> list[str]:
        """Extrai palavras-chave de um chunk por frequência TF (simples, sem deps)."""
        tokens = re.findall(r"[a-zA-ZÀ-ÿ]{4,}", text.lower())
        freq: dict[str, int] = {}
        for tok in tokens:
            if tok not in _STOPWORDS:
                freq[tok] = freq.get(tok, 0) + 1
        ranked = sorted(freq, key=lambda k: freq[k], reverse=True)
        return ranked[:top_n]

    @classmethod
    def _extract_entities(cls, text: str, top_n: int = 10) -> list[str]:
        candidates: Counter[str] = Counter()
        for match in _ENTITY_PATTERN.finditer(text):
            entity = " ".join(match.group(0).split())
            if len(entity) < 3 or entity in _NON_ENTITY_TERMS:
                continue
            parts = entity.split()
            if len(parts) == 1:
                token = parts[0]
                if token[1:].islower() and not token.isupper():
                    continue
            elif any(part in _NON_ENTITY_TERMS for part in parts):
                continue
            normalized = cls._normalize_ascii(entity)
            if normalized in _STOPWORDS or normalized.isdigit():
                continue
            candidates[entity] += 1
        ranked = sorted(
            candidates.items(),
            key=lambda item: (-item[1], -len(item[0]), item[0]),
        )
        return [entity for entity, _ in ranked[:top_n]]

    @classmethod
    def assess_graph_usefulness(cls, query: str) -> GraphUsefulnessAssessment:
        entities = cls._extract_entities(query, top_n=8)
        lowered = cls._normalize_ascii(query)
        signals: list[str] = []
        score = 0.0
        connector_hits = sorted(token for token in _GRAPH_CONNECTORS if token in lowered)
        if len(entities) >= 2:
            score += 0.35
            signals.append(f"{len(entities)} named entities in query")
        if len(entities) >= 3:
            score += 0.15
        if connector_hits:
            score += min(0.35, 0.08 * len(connector_hits))
            signals.append("graph-oriented connectors: " + ", ".join(connector_hits[:5]))
        if "multi-hop" in lowered or "multi hop" in lowered:
            score += 0.2
            signals.append("explicit multi-hop reasoning requested")
        if any(term in lowered for term in ("version", "versao", "versoes", "timeline", "before", "after", "conflict", "conflit", "contradict")):
            score += 0.15
            signals.append("temporal or conflict reasoning requested")
        if any(term in lowered for term in ("count", "sum", "aggregate", "across", "all", "evidenc", "dispers", "hidden", "oculta")):
            score += 0.1
            signals.append("aggregation or corpus-wide reasoning requested")
        score = min(score, 1.0)
        if score >= 0.8:
            mode = "graph-multi-hop"
            rationale = "query likely needs chained evidence across multiple entities"
        elif score >= 0.6:
            mode = "graph-bridge"
            rationale = "query benefits from relation-aware bridging between entities and chunks"
        elif score >= 0.4:
            mode = "graph-local"
            rationale = "query has enough explicit entities for graph-local expansion"
        else:
            mode = "vector-global"
            rationale = "query is broad or single-hop, so hybrid vector search is cheaper and safer"
        if not signals:
            signals.append("no strong multi-hop signal detected")
        return GraphUsefulnessAssessment(
            mode=mode,
            score=round(score, 4),
            rationale=rationale,
            signals=signals,
        )

    @staticmethod
    def _doc_id(path: Path) -> str:
        return hashlib.sha1(str(path.resolve()).encode()).hexdigest()[:16]

    @staticmethod
    def _normalize_ascii(text: str) -> str:
        text = unicodedata.normalize("NFKD", text)
        text = "".join(ch for ch in text if not unicodedata.combining(ch))
        return text.lower()

    @classmethod
    def _extract_temporal_metadata(
        cls,
        *,
        path: Path,
        title: str,
        raw_text: str,
    ) -> dict[str, Any]:
        probe = cls._normalize_ascii(f"{title}\n{path.stem}\n{raw_text[:1800]}")
        published_at: str | None = None
        published_year: int | None = None

        if match := _ISO_DATE.search(probe):
            year, month, day = (int(part) for part in match.groups())
            published_at = f"{year:04d}-{month:02d}-{day:02d}"
            published_year = year
        elif match := _DAY_MONTH_YEAR.search(probe):
            day = int(match.group(1))
            month = _MONTHS.get(match.group(2))
            year = int(match.group(3))
            if month is not None:
                published_at = f"{year:04d}-{month:02d}-{day:02d}"
                published_year = year
        elif match := _MONTH_YEAR.search(probe):
            month = _MONTHS.get(match.group(1))
            year = int(match.group(2))
            if month is not None:
                published_at = f"{year:04d}-{month:02d}-01"
                published_year = year
        elif match := _YEAR_ONLY.search(probe):
            published_year = int(match.group(1))
            published_at = f"{published_year:04d}-01-01"

        version_label: str | None = None
        version_number: float | None = None
        if match := _VERSION_PATTERN.search(probe):
            version_label = f"v{match.group(1)}"
            try:
                version_number = float(match.group(1))
            except ValueError:
                version_number = None

        canonical_title = cls._canonicalize_title(title or path.stem)
        return {
            "canonical_title": canonical_title or None,
            "published_at": published_at,
            "published_year": published_year,
            "version_label": version_label,
            "version_number": version_number,
        }

    @classmethod
    def _canonicalize_title(cls, title: str) -> str:
        raw = title.replace("_", " | ")
        raw = re.split(r"\s[|]\s", raw, maxsplit=1)[0]
        normalized = cls._normalize_ascii(raw)
        normalized = re.sub(r"\b(por|by)\s+[a-z0-9].*$", " ", normalized)
        normalized = re.sub(r"\b(level up coding|medium)\b", " ", normalized)
        normalized = _VERSION_PATTERN.sub(" ", normalized)
        normalized = _ISO_DATE.sub(" ", normalized)
        normalized = _DAY_MONTH_YEAR.sub(" ", normalized)
        normalized = _MONTH_YEAR.sub(" ", normalized)
        normalized = _YEAR_ONLY.sub(" ", normalized)
        normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
        normalized = _MULTISPACE.sub(" ", normalized).strip()
        return normalized

    def retrieval_requires_human_review(
        self,
        query: str,
        results: list[ArticleSearchResult],
        *,
        exact_match_required: bool = False,
    ) -> bool:
        return self._needs_corrective_pass(query, results, exact_match_required=exact_match_required)

    @classmethod
    def _resolve_retrieval_policy(
        cls,
        *,
        query: str,
        requested_policy: str,
        assessment: GraphUsefulnessAssessment,
        exact_match_required: bool,
    ) -> str:
        policy = (requested_policy or "auto").strip().lower()
        if policy in {"adaptive", "auto"}:
            if exact_match_required or cls._looks_like_exact_query(query):
                return "exact-page"
            return assessment.mode
        if policy in {"vector", "vector-global", "hybrid"}:
            return "vector-global"
        if policy in {"graph", "graph-local", "graph-bridge", "graph-multi-hop"}:
            return policy
        if policy in {"exact", "exact-page", "page-level"}:
            return "exact-page"
        if policy == "corrective":
            return "corrective"
        return assessment.mode

    @classmethod
    def _looks_like_exact_query(cls, query: str) -> bool:
        lowered = cls._normalize_ascii(query)
        if "\"" in query or "'" in query:
            return True
        return any(
            term in lowered
            for term in (
                "exact", "literal", "verbatim", "page ", "pagina ", "section", "secao",
                "table", "tabela", "figure", "figura", "screenshot", "quote", "trecho exato",
            )
        ) or bool(re.search(r"\b[A-Z]{2,}-\d{2,}\b", query))

    @classmethod
    def _rewrite_query_variants(cls, query: str) -> list[str]:
        variants = [query.strip()]
        entities = cls._extract_entities(query, top_n=5)
        if entities:
            variants.append(" ".join(entities))
            variants.append(f"exact evidence for {' '.join(entities[:3])}")
        keywords = cls._extract_topics(query, top_n=6)
        if keywords:
            variants.append(" ".join(keywords))
        return list(dict.fromkeys(variant for variant in variants if variant))

    @classmethod
    def _needs_corrective_pass(
        cls,
        query: str,
        results: list[ArticleSearchResult],
        *,
        exact_match_required: bool,
    ) -> bool:
        if not results:
            return True
        top_score = results[0].score
        if exact_match_required and (results[0].retrieval_mode != "exact-page" or top_score < 0.7):
            return True
        entity_hits = cls._extract_entities(query, top_n=5)
        coverage = cls._query_coverage(query, results)
        if top_score < 0.28:
            return True
        if len(results) >= 2 and abs(results[0].score - results[1].score) < 0.03 and coverage < 0.45:
            return True
        if entity_hits and coverage < 0.35:
            return True
        return False

    @classmethod
    def _query_terms(cls, query: str) -> list[str]:
        tokens = re.findall(r"[a-zA-Z0-9_.:/-]{3,}", cls._normalize_ascii(query))
        return list(dict.fromkeys(token for token in tokens if token not in _STOPWORDS))

    @classmethod
    def _query_coverage(cls, query: str, results: list[ArticleSearchResult]) -> float:
        terms = cls._query_terms(query)[:8]
        if not terms or not results:
            return 0.0
        corpus = cls._normalize_ascii(" ".join(item.content for item in results[:3]))
        matched = sum(1 for term in terms if term in corpus)
        return round(matched / max(1, len(terms)), 4)

    def _run_search_policy(
        self,
        *,
        query: str,
        top_k: int,
        filters: _SearchFilters,
        assessment: GraphUsefulnessAssessment,
        policy: str,
    ) -> list[ArticleSearchResult]:
        if policy == "exact-page":
            return self._search_exact_page(query, top_k=top_k, filters=filters, assessment=assessment)
        if policy == "vector-global":
            vector_results = self._search_qdrant(query, top_k=top_k, filters=filters, assessment=assessment)
            if vector_results or not self.settings.enable_graphrag:
                return vector_results
            return self._search_graph_entities(query, top_k=top_k, filters=filters, assessment=assessment)
        if policy == "corrective":
            return self._run_corrective_search(query=query, top_k=top_k, filters=filters, assessment=assessment)

        graph_results = self._search_graph_entities(query, top_k=top_k, filters=filters, assessment=assessment)
        vector_results = self._search_qdrant(query, top_k=max(top_k, 4), filters=filters, assessment=assessment)
        if not graph_results:
            return vector_results[:top_k]
        return self._merge_ranked_results(
            graph_results,
            vector_results,
            top_k=top_k,
            retrieval_mode=policy,
            assessment=assessment,
        )

    def _run_corrective_search(
        self,
        *,
        query: str,
        top_k: int,
        filters: _SearchFilters,
        assessment: GraphUsefulnessAssessment,
    ) -> list[ArticleSearchResult]:
        merged: list[ArticleSearchResult] = []
        for variant in self._rewrite_query_variants(query):
            exact_results = self._search_exact_page(variant, top_k=max(top_k, 3), filters=filters, assessment=assessment)
            vector_results = self._search_qdrant(variant, top_k=max(top_k, 4), filters=filters, assessment=assessment)
            graph_results = self._search_graph_entities(variant, top_k=max(top_k, 3), filters=filters, assessment=assessment)
            variant_results = self._merge_ranked_results(
                exact_results + graph_results,
                vector_results,
                top_k=max(top_k, 6),
                retrieval_mode="corrective",
                assessment=assessment,
            )
            merged = self._merge_ranked_results(
                merged,
                variant_results,
                top_k=max(top_k, 8),
                retrieval_mode="corrective",
                assessment=assessment,
            )
        return merged[:top_k]

    def _quality_proxies(self, query: str, results: list[ArticleSearchResult]) -> dict[str, float]:
        if not results:
            return {
                "avg_score": 0.0,
                "precision_proxy": 0.0,
                "recall_proxy": 0.0,
                "faithfulness_proxy": 0.0,
            }
        top = results[: min(5, len(results))]
        avg_score = round(sum(item.score for item in top) / len(top), 4)
        coverage = self._query_coverage(query, top)
        faithfulness = round(
            sum(1 for item in top if coverage > 0 and self._normalize_ascii(query[:80]).split(" ")[0] in self._normalize_ascii(item.content))
            / len(top),
            4,
        )
        return {
            "avg_score": avg_score,
            "precision_proxy": min(1.0, round(avg_score, 4)),
            "recall_proxy": coverage,
            "faithfulness_proxy": faithfulness,
        }

    @staticmethod
    def _load_json_list(payload: str) -> list[dict[str, Any]]:
        loaded = json.loads(payload)
        if not isinstance(loaded, list):
            raise ValueError("Article retrieval dataset must be a JSON list.")
        return loaded

    @classmethod
    def _doc_match_metrics(
        cls,
        example: ArticleRetrievalEvaluationExample,
        results: list[ArticleSearchResult],
    ) -> tuple[bool, float]:
        for index, item in enumerate(results, start=1):
            if cls._matches_expected_document(example, item):
                return True, round(1.0 / index, 4)
        return False, 0.0

    @classmethod
    def _matches_expected_document(
        cls,
        example: ArticleRetrievalEvaluationExample,
        result: ArticleSearchResult,
    ) -> bool:
        if example.expected_doc_ids and result.doc_id in set(example.expected_doc_ids):
            return True
        if example.expected_title_contains:
            title = cls._normalize_ascii(result.title)
            if any(cls._normalize_ascii(term) in title for term in example.expected_title_contains):
                return True
        if example.expected_source_contains:
            source_path = cls._normalize_ascii(result.source_path)
            if any(cls._normalize_ascii(term) in source_path for term in example.expected_source_contains):
                return True
        return False

    @classmethod
    def _page_match(
        cls,
        example: ArticleRetrievalEvaluationExample,
        results: list[ArticleSearchResult],
    ) -> bool:
        if not example.expected_page_numbers:
            return False
        expected = set(example.expected_page_numbers)
        return any(item.page_number in expected for item in results if item.page_number is not None)

    @staticmethod
    def _chunk_kind_match(
        example: ArticleRetrievalEvaluationExample,
        results: list[ArticleSearchResult],
    ) -> bool:
        if not example.expected_chunk_kind:
            return False
        expected = example.expected_chunk_kind.strip().lower()
        return any(item.chunk_kind.strip().lower() == expected for item in results)

    @classmethod
    def _required_terms_match(
        cls,
        example: ArticleRetrievalEvaluationExample,
        results: list[ArticleSearchResult],
    ) -> bool:
        if not example.must_include_terms:
            return False
        haystack = cls._normalize_ascii(" ".join(item.content for item in results[: min(3, len(results))]))
        return all(cls._normalize_ascii(term) in haystack for term in example.must_include_terms)

    def _provider_benchmark_options(self) -> list[dict[str, Any]]:
        options = [
            ("openai", self.settings.openai_model, 900, "$$$", False),
            ("gemini", self.settings.gemini_model, 700, "$$", False),
            ("ollama", self.settings.ollama_model, 1400, "$", True),
            ("ollm", self.settings.ollm_model, 1800, "$", True),
            ("mock", self.settings.primary_model, 50, "free", True),
        ]
        return [
            {
                "provider": provider,
                "model": model,
                "estimated_latency_ms": latency,
                "estimated_relative_cost": cost,
                "local": local,
            }
            for provider, model, latency, cost, local in options
        ]

    # ── Retrieval helpers ────────────────────────────────────────────────────

    def _search_qdrant(
        self,
        query: str,
        *,
        top_k: int,
        filters: _SearchFilters,
        assessment: GraphUsefulnessAssessment,
    ) -> list[ArticleSearchResult]:
        if not self._qdrant_available():
            return []
        self._ensure_collection(filters.collection)
        dense_vector, _ = self.embeddings.embed_text(query)
        sparse_payload_body = self._build_sparse_vector(query)

        fused: dict[str, dict[str, Any]] = {}
        for mode, payload in [
            ("sparse", {"query": sparse_payload_body, "using": "text", "limit": top_k * 6, "with_payload": True}),
            ("dense", {"query": dense_vector, "using": "dense", "limit": top_k * 6, "with_payload": True}),
        ]:
            resp = self._qdrant(
                "POST",
                f"/collections/{filters.collection}/points/query",
                json_body=payload,
            )
            for pt in self._qdrant_points(resp):
                pid = str(pt.get("id"))
                score = float(pt.get("score", 0.0))
                payload_body = pt.get("payload", {})
                if not self._payload_matches_filters(payload_body, filters):
                    continue
                if pid not in fused:
                    fused[pid] = {"payload": payload_body, "sparse": 0.0, "dense": 0.0}
                fused[pid][mode] = score

        results: list[ArticleSearchResult] = []
        for pid, data in fused.items():
            final = round(0.5 * data["sparse"] + 0.5 * data["dense"], 4)
            results.append(
                self._result_from_payload(
                    chunk_id=pid,
                    payload=data["payload"],
                    score=final,
                    retrieval_mode="vector-global",
                    assessment=assessment,
                    evidence_paths=[],
                )
            )
        results.sort(key=lambda item: item.score, reverse=True)
        return results[:top_k]

    def _search_dense_only(
        self,
        query: str,
        *,
        top_k: int,
        filters: _SearchFilters,
        assessment: GraphUsefulnessAssessment,
    ) -> list[ArticleSearchResult]:
        if not self._qdrant_available():
            return []
        self._ensure_collection(filters.collection)
        dense_vector, _ = self.embeddings.embed_text(query)
        resp = self._qdrant(
            "POST",
            f"/collections/{filters.collection}/points/query",
            json_body={"query": dense_vector, "using": "dense", "limit": top_k * 6, "with_payload": True},
        )
        results: list[ArticleSearchResult] = []
        for pt in self._qdrant_points(resp):
            payload = pt.get("payload", {})
            if not self._payload_matches_filters(payload, filters):
                continue
            results.append(
                self._result_from_payload(
                    chunk_id=str(pt.get("id")),
                    payload=payload,
                    score=round(float(pt.get("score", 0.0)), 4),
                    retrieval_mode="dense",
                    assessment=assessment,
                    evidence_paths=[],
                )
            )
        results.sort(key=lambda item: item.score, reverse=True)
        return results[:top_k]

    def _search_exact_page(
        self,
        query: str,
        *,
        top_k: int,
        filters: _SearchFilters,
        assessment: GraphUsefulnessAssessment,
    ) -> list[ArticleSearchResult]:
        points = self._scroll_collection_points(filters.collection, limit=max(250, top_k * 80))
        phrases = [phrase.strip().lower() for phrase in re.findall(r"\"([^\"]+)\"", query) if phrase.strip()]
        terms = self._query_terms(query)[:10]
        results: list[ArticleSearchResult] = []
        for pt in points:
            payload = pt.get("payload", {})
            if not self._payload_matches_filters(payload, filters):
                continue
            haystack = self._normalize_ascii(
                f"{payload.get('title', '')}\n{payload.get('section_title', '')}\n{payload.get('content', '')}"
            )
            phrase_hits = sum(1 for phrase in phrases if self._normalize_ascii(phrase) in haystack)
            term_hits = sum(1 for term in terms if term in haystack)
            if not phrase_hits and not term_hits:
                continue
            exactness = min(1.0, 0.52 * phrase_hits + 0.08 * term_hits + (0.1 if payload.get("page_number") else 0.0))
            results.append(
                self._result_from_payload(
                    chunk_id=str(pt.get("id")),
                    payload=payload,
                    score=round(exactness, 4),
                    retrieval_mode="exact-page",
                    assessment=assessment,
                    evidence_paths=[],
                )
            )
        results.sort(key=lambda item: item.score, reverse=True)
        return results[:top_k]

    def _search_graph_entities(
        self,
        query: str,
        *,
        top_k: int,
        filters: _SearchFilters,
        assessment: GraphUsefulnessAssessment,
    ) -> list[ArticleSearchResult]:
        if not self.settings.enable_graphrag or not self.settings.neo4j_url:
            return []
        entities = self._extract_entities(query, top_n=8)
        if not entities:
            return []
        try:
            import neo4j as _neo4j  # type: ignore[import-untyped]
        except ImportError:
            return []

        entity_keys = [self._normalize_ascii(entity) for entity in entities]
        try:
            driver = _neo4j.GraphDatabase.driver(
                self.settings.neo4j_url,
                auth=(self.settings.neo4j_user, self.settings.neo4j_password),
            )
        except Exception:
            return []
        records: list[dict[str, Any]] = []
        try:
            with driver.session(database=self.settings.neo4j_database) as session:
                rows = session.run(
                    """
                    MATCH (e:Entity)
                    WHERE e.key IN $entity_keys
                    MATCH (e)<-[:MENTIONS_ENTITY]-(s:Sentence)<-[:HAS_SENTENCE]-(c:Chunk)<-[:HAS_CHUNK]-(a:Article)
                    WITH a, c,
                         collect(DISTINCT e.name) AS matched_entities,
                         collect(DISTINCT s.text)[0..2] AS matched_sentences,
                         count(DISTINCT e) AS entity_hits
                    RETURN a.id AS doc_id,
                           a.title AS title,
                           a.path AS source_path,
                           a.collection AS collection,
                           a.tenant_id AS tenant_id,
                           coalesce(a.source_tags, []) AS source_tags,
                           a.canonical_title AS canonical_title,
                           a.published_at AS published_at,
                           a.published_year AS published_year,
                           a.version_label AS version_label,
                           c.id AS chunk_id,
                           c.chunk_index AS chunk_index,
                           c.content AS content,
                           c.chunk_kind AS chunk_kind,
                           c.page_number AS page_number,
                           c.section_title AS section_title,
                           c.page_span AS page_span,
                           c.table_title AS table_title,
                           c.figure_caption AS figure_caption,
                           c.local_context AS local_context,
                           c.global_context AS global_context,
                           coalesce(c.topics, []) AS topics,
                           coalesce(c.entities, []) AS entities,
                           matched_entities,
                           matched_sentences,
                           entity_hits
                    ORDER BY entity_hits DESC, c.chunk_index ASC
                    LIMIT $limit
                    """,
                    entity_keys=entity_keys,
                    limit=max(top_k * 2, 6),
                )
                for row in rows:
                    row_data = dict(row)
                    matched_entities = list(row_data.get("matched_entities") or [])
                    chunk_entities = list(row_data.get("entities") or [])
                    bridge_entities = [entity for entity in chunk_entities if entity not in matched_entities][:1]
                    path_nodes = [*matched_entities[:2], *bridge_entities, row_data.get("title", "")]
                    summary_text = " | ".join((row_data.get("matched_sentences") or [])[:2])
                    path = ArticleEvidencePath(
                        path_id=f"path:{row_data.get('chunk_id')}",
                        relation=assessment.mode,
                        nodes=[node for node in path_nodes if node],
                        score=float(row_data.get("entity_hits", 0.0)),
                        summary=summary_text[:320],
                    )
                    payload = {
                        "doc_id": row_data.get("doc_id", ""),
                        "collection": row_data.get("collection", filters.collection),
                        "tenant_id": row_data.get("tenant_id"),
                        "source_tags": row_data.get("source_tags", []),
                        "title": row_data.get("title", ""),
                        "source_path": row_data.get("source_path", ""),
                        "chunk_index": row_data.get("chunk_index", 0),
                        "content": row_data.get("content", ""),
                        "chunk_kind": row_data.get("chunk_kind", "text"),
                        "page_number": row_data.get("page_number"),
                        "section_title": row_data.get("section_title"),
                        "page_span": row_data.get("page_span"),
                        "table_title": row_data.get("table_title"),
                        "figure_caption": row_data.get("figure_caption"),
                        "local_context": row_data.get("local_context"),
                        "global_context": row_data.get("global_context"),
                        "topics": row_data.get("topics", []),
                        "entities": row_data.get("entities", []),
                        "canonical_title": row_data.get("canonical_title"),
                        "published_at": row_data.get("published_at"),
                        "published_year": row_data.get("published_year"),
                        "version_label": row_data.get("version_label"),
                    }
                    records.append(
                        self._result_from_payload(
                            chunk_id=row_data.get("chunk_id", ""),
                            payload=payload,
                            score=round(float(row_data.get("entity_hits", 0.0)) + 0.25, 4),
                            retrieval_mode=assessment.mode,
                            assessment=assessment,
                            evidence_paths=[path],
                        )
                    )
        except Exception:
            return []
        finally:
            driver.close()
        records = [record for record in records if self._payload_matches_filters(record.model_dump(mode="json"), filters)]
        records.sort(key=lambda item: item.score, reverse=True)
        return records[:top_k]

    def _merge_ranked_results(
        self,
        primary: list[ArticleSearchResult],
        secondary: list[ArticleSearchResult],
        *,
        top_k: int,
        retrieval_mode: str,
        assessment: GraphUsefulnessAssessment,
    ) -> list[ArticleSearchResult]:
        merged: dict[str, ArticleSearchResult] = {}
        for item in [*primary, *secondary]:
            existing = merged.get(item.chunk_id)
            if existing is None:
                merged[item.chunk_id] = item.model_copy(
                    update={
                        "retrieval_mode": retrieval_mode,
                        "graph_usefulness": assessment,
                    }
                )
                continue
            combined_paths = [*existing.evidence_paths, *item.evidence_paths]
            combined_entities = sorted(set([*existing.entities, *item.entities]))
            combined_topics = sorted(set([*existing.topics, *item.topics]))
            merged[item.chunk_id] = existing.model_copy(
                update={
                    "score": round(max(existing.score, item.score) + 0.08, 4),
                    "entities": combined_entities,
                    "topics": combined_topics,
                    "evidence_paths": combined_paths[:4],
                    "retrieval_mode": retrieval_mode,
                    "graph_usefulness": assessment,
                }
            )
        results = list(merged.values())
        results.sort(key=lambda item: item.score, reverse=True)
        return results[:top_k]

    @staticmethod
    def _result_from_payload(
        *,
        chunk_id: str,
        payload: dict[str, Any],
        score: float,
        retrieval_mode: str,
        assessment: GraphUsefulnessAssessment,
        evidence_paths: list[ArticleEvidencePath],
    ) -> ArticleSearchResult:
        return ArticleSearchResult(
            chunk_id=chunk_id,
            doc_id=payload.get("doc_id", ""),
            title=payload.get("title", ""),
            chunk_index=int(payload.get("chunk_index", 0)),
            content=payload.get("content", ""),
            topics=list(payload.get("topics", [])),
            entities=list(payload.get("entities", [])),
            score=score,
            collection=payload.get("collection", ARTICLE_COLLECTION),
            tenant_id=payload.get("tenant_id"),
            source_tags=list(payload.get("source_tags", [])),
            source_path=payload.get("source_path", ""),
            canonical_title=payload.get("canonical_title"),
            published_at=payload.get("published_at"),
            published_year=payload.get("published_year"),
            version_label=payload.get("version_label"),
            chunk_kind=payload.get("chunk_kind", "text"),
            page_number=payload.get("page_number"),
            section_title=payload.get("section_title"),
            page_span=payload.get("page_span"),
            table_title=payload.get("table_title"),
            figure_caption=payload.get("figure_caption"),
            local_context=payload.get("local_context"),
            global_context=payload.get("global_context"),
            retrieval_mode=retrieval_mode,
            graph_usefulness=assessment,
            evidence_paths=evidence_paths,
        )

    # ── Qdrant helpers ────────────────────────────────────────────────────────

    def _qdrant_available(self) -> bool:
        return bool(
            self.settings.qdrant_url and self.settings.external_vector_store_enabled()
        )

    def _ensure_collection(self, collection: str) -> None:
        body: dict[str, Any] = {
            "vectors": {
                "dense": {"size": self.settings.embedding_dimension, "distance": "Cosine"},
            },
            "sparse_vectors": {"text": {}},
        }
        try:
            self._qdrant("PUT", f"/collections/{collection}", json_body=body)
        except httpx.HTTPStatusError as err:
            # 409 = already exists, ignore
            if err.response.status_code != 409:
                raise

    def _build_sparse_vector(self, text: str) -> dict[str, Any]:
        freq: dict[int, float] = {}
        for tok in re.findall(r"[a-z0-9_./:-]+", text.lower()):
            idx = int(hashlib.sha1(tok.encode()).hexdigest()[:8], 16) % (2**16)
            freq[idx] = freq.get(idx, 0.0) + 1.0
        indices = sorted(freq)
        return {"indices": indices, "values": [freq[i] for i in indices]}

    def _qdrant(
        self, method: str, path: str, json_body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        base = (self.settings.qdrant_url or "").rstrip("/")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.settings.qdrant_api_key:
            headers["api-key"] = self.settings.qdrant_api_key
        with httpx.Client(timeout=60.0) as client:
            resp = client.request(method, f"{base}{path}", headers=headers, json=json_body)
            resp.raise_for_status()
            return resp.json() if resp.content else {}

    @staticmethod
    def _qdrant_points(resp: dict[str, Any]) -> list[dict[str, Any]]:
        result = resp.get("result")
        if isinstance(result, dict):
            return result.get("points") or []
        if isinstance(result, list):
            return result
        return []

    def _scroll_collection_points(self, collection: str, limit: int = 500) -> list[dict[str, Any]]:
        if not self._qdrant_available():
            return []
        self._ensure_collection(collection)
        gathered: list[dict[str, Any]] = []
        offset: Any | None = None
        remaining = limit
        while remaining > 0:
            batch_size = min(100, remaining)
            body: dict[str, Any] = {"limit": batch_size, "with_payload": True}
            if offset is not None:
                body["offset"] = offset
            resp = self._qdrant("POST", f"/collections/{collection}/points/scroll", json_body=body)
            result = resp.get("result") or {}
            points = result.get("points") or []
            if not points:
                break
            gathered.extend(points)
            remaining -= len(points)
            offset = result.get("next_page_offset")
            if offset is None:
                break
        return gathered[:limit]

    @classmethod
    def _payload_matches_filters(cls, payload: dict[str, Any], filters: _SearchFilters) -> bool:
        if filters.tenant_id and payload.get("tenant_id") != filters.tenant_id:
            return False
        if filters.source_tags:
            payload_tags = {str(tag) for tag in payload.get("source_tags", [])}
            if not set(filters.source_tags).issubset(payload_tags):
                return False
        if filters.source_contains:
            haystack = cls._normalize_ascii(
                f"{payload.get('source_path', '')} {payload.get('title', '')} {payload.get('section_title', '')}"
            )
            if cls._normalize_ascii(filters.source_contains) not in haystack:
                return False
        return True

    # ── Neo4j helpers ─────────────────────────────────────────────────────────

    def _neo4j_index_article(
        self,
        doc_id: str,
        title: str,
        path: str,
        topics: list[str],
        chunk_count: int,
        chunks: list[_ChunkRecord],
        entities_per_chunk: list[list[str]],
        temporal_meta: dict[str, Any],
        collection: str,
        tenant_id: str | None,
        source_tags: list[str],
    ) -> None:
        try:
            import neo4j as _neo4j  # type: ignore[import-untyped]
        except ImportError:
            return
        s = self.settings
        driver = _neo4j.GraphDatabase.driver(s.neo4j_url, auth=(s.neo4j_user, s.neo4j_password))
        try:
            with driver.session(database=s.neo4j_database) as session:
                session.run(
                    """
                    MERGE (a:Article {id: $id})
                    SET a.title        = $title,
                        a.path         = $path,
                        a.collection   = $collection,
                        a.tenant_id    = $tenant_id,
                        a.source_tags  = $source_tags,
                        a.chunk_count  = $chunk_count,
                        a.canonical_title = $canonical_title,
                        a.published_at = $published_at,
                        a.published_year = $published_year,
                        a.version_label = $version_label,
                        a.version_number = $version_number
                    """,
                    id=doc_id,
                    title=title,
                    path=path,
                    collection=collection,
                    tenant_id=tenant_id,
                    source_tags=source_tags,
                    chunk_count=chunk_count,
                    canonical_title=temporal_meta.get("canonical_title"),
                    published_at=temporal_meta.get("published_at"),
                    published_year=temporal_meta.get("published_year"),
                    version_label=temporal_meta.get("version_label"),
                    version_number=temporal_meta.get("version_number"),
                )
                session.run(
                    """
                    MATCH (a:Article {id: $doc_id})-[r:HAS_CHUNK]->(:Chunk)
                    DELETE r
                    """,
                    doc_id=doc_id,
                )
                for topic in topics:
                    session.run(
                        """
                        MERGE (t:Topic {name: $name})
                        WITH t
                        MATCH (a:Article {id: $doc_id})
                        MERGE (a)-[:HAS_TOPIC]->(t)
                        """,
                        name=topic, doc_id=doc_id,
                    )
                for idx, chunk in enumerate(chunks):
                    chunk_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:chunk:{idx}"))
                    chunk_entities = entities_per_chunk[idx] if idx < len(entities_per_chunk) else []
                    chunk_topics = self._extract_topics(chunk.content)
                    session.run(
                        """
                        MATCH (a:Article {id: $doc_id})
                        MERGE (c:Chunk {id: $chunk_id})
                        SET c.content = $content,
                            c.chunk_index = $chunk_index,
                            c.chunk_kind = $chunk_kind,
                            c.page_number = $page_number,
                            c.section_title = $section_title,
                            c.page_span = $page_span,
                            c.table_title = $table_title,
                            c.figure_caption = $figure_caption,
                            c.local_context = $local_context,
                            c.global_context = $global_context,
                            c.topics = $topics,
                            c.entities = $entities
                        MERGE (a)-[:HAS_CHUNK]->(c)
                        """,
                        doc_id=doc_id,
                        chunk_id=chunk_id,
                        content=chunk.content,
                        chunk_index=idx,
                        chunk_kind=chunk.chunk_kind,
                        page_number=chunk.page_number,
                        section_title=chunk.section_title,
                        page_span=chunk.page_span,
                        table_title=chunk.table_title,
                        figure_caption=chunk.figure_caption,
                        local_context=chunk.local_context,
                        global_context=chunk.global_context,
                        topics=chunk_topics,
                        entities=chunk_entities,
                    )
                    sentences = [sentence.strip() for sentence in _SENTENCE_SPLIT.split(chunk.content) if sentence.strip()]
                    for sent_idx, sentence in enumerate(sentences):
                        sentence_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{chunk_id}:sentence:{sent_idx}"))
                        sentence_entities = self._extract_entities(sentence)
                        session.run(
                            """
                            MATCH (c:Chunk {id: $chunk_id})
                            MERGE (s:Sentence {id: $sentence_id})
                            SET s.text = $text,
                                s.sentence_index = $sentence_index
                            MERGE (c)-[:HAS_SENTENCE]->(s)
                            """,
                            chunk_id=chunk_id,
                            sentence_id=sentence_id,
                            text=sentence,
                            sentence_index=sent_idx,
                        )
                        for entity in sentence_entities:
                            session.run(
                                """
                                MATCH (s:Sentence {id: $sentence_id})
                                MERGE (e:Entity {key: $key})
                                SET e.name = $name
                                MERGE (s)-[:MENTIONS_ENTITY]->(e)
                                WITH e
                                MATCH (a:Article {id: $doc_id})
                                MERGE (a)-[:HAS_ENTITY]->(e)
                                """,
                                sentence_id=sentence_id,
                                doc_id=doc_id,
                                key=self._normalize_ascii(entity),
                                name=entity,
                            )
        finally:
            driver.close()

    def _refresh_temporal_version_edges(self) -> None:
        """Cria arestas temporais entre artigos da mesma família (mesmo título canônico)."""
        try:
            import neo4j as _neo4j  # type: ignore[import-untyped]
        except ImportError:
            return
        s = self.settings
        driver = _neo4j.GraphDatabase.driver(s.neo4j_url, auth=(s.neo4j_user, s.neo4j_password))
        try:
            with driver.session(database=s.neo4j_database) as session:
                session.run("MATCH ()-[r:EARLIER_VERSION_OF|LATER_VERSION_OF]->() DELETE r")
                session.run(
                    """
                    MATCH (older:Article), (newer:Article)
                    WHERE older.id <> newer.id
                      AND coalesce(older.canonical_title, '') <> ''
                      AND older.canonical_title = newer.canonical_title
                      AND (
                        (older.published_at IS NOT NULL AND newer.published_at IS NOT NULL AND older.published_at < newer.published_at)
                        OR (
                          older.published_at IS NULL AND newer.published_at IS NULL
                          AND older.published_year IS NOT NULL AND newer.published_year IS NOT NULL
                          AND older.published_year < newer.published_year
                        )
                        OR (
                          older.published_at IS NULL AND newer.published_at IS NULL
                          AND coalesce(older.published_year, 0) = coalesce(newer.published_year, 0)
                          AND older.version_number IS NOT NULL AND newer.version_number IS NOT NULL
                          AND older.version_number < newer.version_number
                        )
                      )
                    MERGE (older)-[r:EARLIER_VERSION_OF]->(newer)
                    SET r.weight = 1
                    MERGE (newer)-[r2:LATER_VERSION_OF]->(older)
                    SET r2.weight = 1
                    """
                )
        finally:
            driver.close()

    def _refresh_shared_topics_edges(self, collection: str = ARTICLE_COLLECTION) -> None:
        """Recria arestas SHARES_TOPIC entre artigos com tópicos em comum."""
        try:
            import neo4j as _neo4j  # type: ignore[import-untyped]
        except ImportError:
            return
        s = self.settings
        driver = _neo4j.GraphDatabase.driver(s.neo4j_url, auth=(s.neo4j_user, s.neo4j_password))
        try:
            with driver.session(database=s.neo4j_database) as session:
                # Remove arestas antigas e recria com peso atualizado
                session.run("MATCH ()-[r:SHARES_TOPIC]->() DELETE r")
                session.run(
                    """
                    MATCH (a:Article)-[:HAS_TOPIC]->(t:Topic)<-[:HAS_TOPIC]-(b:Article)
                    WHERE id(a) < id(b)
                      AND coalesce(a.collection, $collection) = $collection
                      AND coalesce(b.collection, $collection) = $collection
                    WITH a, b, count(t) AS shared_topics
                    WHERE shared_topics >= 2
                    MERGE (a)-[r:SHARES_TOPIC]->(b)
                    SET r.weight = shared_topics
                    MERGE (b)-[r2:SHARES_TOPIC]->(a)
                    SET r2.weight = shared_topics
                    """,
                    collection=collection,
                )
        finally:
            driver.close()

    def _neo4j_related(
        self,
        doc_id: str,
        limit: int,
        tenant_id: str | None,
        collection: str,
    ) -> list[dict[str, Any]]:
        try:
            import neo4j as _neo4j  # type: ignore[import-untyped]
        except ImportError:
            return []
        s = self.settings
        driver = _neo4j.GraphDatabase.driver(s.neo4j_url, auth=(s.neo4j_user, s.neo4j_password))
        merged: dict[str, dict[str, Any]] = {}
        try:
            with driver.session(database=s.neo4j_database) as session:
                topic_records = session.run(
                    """
                    MATCH (a:Article {id: $id})-[r:SHARES_TOPIC]->(b:Article)
                    WHERE coalesce(a.collection, $collection) = $collection
                      AND coalesce(b.collection, $collection) = $collection
                      AND ($tenant_id IS NULL OR coalesce(a.tenant_id, '') = $tenant_id)
                      AND ($tenant_id IS NULL OR coalesce(b.tenant_id, '') = $tenant_id)
                    RETURN b.id AS doc_id, b.title AS title, r.weight AS shared_topics,
                           b.published_at AS published_at, b.published_year AS published_year,
                           b.version_label AS version_label
                    ORDER BY r.weight DESC
                    LIMIT $limit
                    """,
                    id=doc_id,
                    limit=limit,
                    tenant_id=tenant_id,
                    collection=collection,
                )
                for rec in topic_records:
                    did = rec["doc_id"]
                    merged[did] = {
                        "doc_id": did,
                        "title": rec["title"],
                        "shared_topics": rec["shared_topics"],
                        "relation": "SHARES_TOPIC",
                        "published_at": rec["published_at"],
                        "published_year": rec["published_year"],
                        "version_label": rec["version_label"],
                    }

                temporal_records = session.run(
                    """
                    MATCH (a:Article {id: $id})-[r:EARLIER_VERSION_OF|LATER_VERSION_OF]->(b:Article)
                    WHERE coalesce(a.collection, $collection) = $collection
                      AND coalesce(b.collection, $collection) = $collection
                      AND ($tenant_id IS NULL OR coalesce(a.tenant_id, '') = $tenant_id)
                      AND ($tenant_id IS NULL OR coalesce(b.tenant_id, '') = $tenant_id)
                    RETURN b.id AS doc_id, b.title AS title, type(r) AS relation,
                           b.published_at AS published_at, b.published_year AS published_year,
                           b.version_label AS version_label
                    LIMIT $limit
                    """,
                    id=doc_id,
                    limit=limit,
                    tenant_id=tenant_id,
                    collection=collection,
                )
                for rec in temporal_records:
                    did = rec["doc_id"]
                    existing = merged.get(did)
                    if existing is None:
                        merged[did] = {
                            "doc_id": did,
                            "title": rec["title"],
                            "shared_topics": 0,
                            "relation": rec["relation"],
                            "published_at": rec["published_at"],
                            "published_year": rec["published_year"],
                            "version_label": rec["version_label"],
                        }
                        continue
                    if rec["relation"] not in str(existing["relation"]).split("+"):
                        existing["relation"] = f"{existing['relation']}+{rec['relation']}"
        finally:
            driver.close()
        results = list(merged.values())
        results.sort(
            key=lambda item: (
                0 if "VERSION" in str(item.get("relation", "")) else 1,
                -int(item.get("shared_topics", 0) or 0),
                str(item.get("title", "")),
            )
        )
        return results[:limit]

    def _qdrant_related(
        self,
        doc_id: str,
        limit: int,
        tenant_id: str | None,
        collection: str,
    ) -> list[dict[str, Any]]:
        """Fallback when Neo4j is off: agrupa por doc_id nos chunks mais similares."""
        if not self._qdrant_available():
            return []
        must_filters: list[dict[str, Any]] = [{"key": "doc_id", "match": {"value": doc_id}}]
        if tenant_id:
            must_filters.append({"key": "tenant_id", "match": {"value": tenant_id}})
        # Busca os chunks do próprio artigo e usa o primeiro como query
        anchor_resp = self._qdrant(
            "POST",
            f"/collections/{collection}/points/query",
            json_body={
                "filter": {"must": must_filters},
                "using":  "dense",
                "limit":  1,
                "with_payload": True,
                "with_vector": True,
            },
        )
        pts = self._qdrant_points(anchor_resp)
        if not pts:
            return []
        anchor_vector = pts[0].get("vector", {}).get("dense") or pts[0].get("vector")
        if not anchor_vector:
            return []
        similarity_filter: dict[str, Any] = {
            "must_not": [{"key": "doc_id", "match": {"value": doc_id}}],
        }
        if tenant_id:
            similarity_filter["must"] = [{"key": "tenant_id", "match": {"value": tenant_id}}]
        sim_resp = self._qdrant(
            "POST",
            f"/collections/{collection}/points/query",
            json_body={
                "query":  anchor_vector,
                "using":  "dense",
                "limit":  limit * 5,
                "with_payload": True,
                "filter": similarity_filter,
            },
        )
        seen: dict[str, float] = {}
        for pt in self._qdrant_points(sim_resp):
            pl  = pt.get("payload", {})
            did = pl.get("doc_id", "")
            sc  = float(pt.get("score", 0.0))
            if did and did not in seen:
                seen[did] = sc
        ranked = sorted(seen, key=lambda k: seen[k], reverse=True)[:limit]
        return [{"doc_id": d, "score": seen[d], "relation": "vector_similarity"} for d in ranked]
