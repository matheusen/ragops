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
import re
import uuid
import unicodedata
from pathlib import Path
from typing import Any, TYPE_CHECKING

import httpx

from jira_issue_rag.services.embeddings import EmbeddingService
from jira_issue_rag.shared.models import ArticleIngestResponse, ArticleSearchResult

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

    # ── Public API ────────────────────────────────────────────────────────────

    def ingest(
        self,
        paths: list[str],
        titles: list[str] | None = None,
        collection: str = ARTICLE_COLLECTION,
    ) -> list[ArticleIngestResponse]:
        """Ingere uma lista de PDFs (ou txt/md). Retorna um relatório por arquivo."""
        results: list[ArticleIngestResponse] = []
        for i, raw_path in enumerate(paths):
            title = (titles or [])[i] if titles and i < len(titles) else None
            results.append(self._ingest_one(Path(raw_path), title=title, collection=collection))
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
    ) -> list[ArticleSearchResult]:
        """Busca semântica híbrida (BM25 + dense) nos artigos indexados."""
        if not self._qdrant_available():
            return []
        self._ensure_collection(collection)
        dense_vector, _ = self.embeddings.embed_text(query)
        sparse_payload_body = self._build_sparse_vector(query)

        fused: dict[str, dict[str, Any]] = {}
        for (mode, payload) in [
            ("sparse", {"query": sparse_payload_body, "using": "text",  "limit": top_k * 2, "with_payload": True}),
            ("dense",  {"query": dense_vector,         "using": "dense", "limit": top_k * 2, "with_payload": True}),
        ]:
            resp = self._qdrant(
                "POST",
                f"/collections/{collection}/points/query",
                json_body=payload,
            )
            for pt in self._qdrant_points(resp):
                pid   = str(pt.get("id"))
                score = float(pt.get("score", 0.0))
                pl    = pt.get("payload", {})
                if pid not in fused:
                    fused[pid] = {"payload": pl, "sparse": 0.0, "dense": 0.0}
                fused[pid][mode] = score

        results: list[ArticleSearchResult] = []
        for pid, data in fused.items():
            final = round(0.5 * data["sparse"] + 0.5 * data["dense"], 4)
            pl = data["payload"]
            results.append(ArticleSearchResult(
                chunk_id=pid,
                doc_id=pl.get("doc_id", ""),
                title=pl.get("title", ""),
                chunk_index=int(pl.get("chunk_index", 0)),
                content=pl.get("content", ""),
                topics=pl.get("topics", []),
                score=final,
                source_path=pl.get("source_path", ""),
                canonical_title=pl.get("canonical_title"),
                published_at=pl.get("published_at"),
                published_year=pl.get("published_year"),
                version_label=pl.get("version_label"),
            ))
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    def related_articles(
        self,
        doc_id: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Retorna artigos relacionados via grafo Neo4j (SHARES_TOPIC).
        Fallback: busca por tópicos do artigo no Qdrant caso Neo4j não esteja ativo.
        """
        if self.settings.enable_graphrag:
            return self._neo4j_related(doc_id, limit=limit)
        return self._qdrant_related(doc_id, limit=limit)

    # ── Ingestão individual ───────────────────────────────────────────────────

    def _ingest_one(
        self,
        path: Path,
        title: str | None,
        collection: str,
    ) -> ArticleIngestResponse:
        doc_id = self._doc_id(path)
        title  = title or path.stem.replace("_", " ").replace("-", " ").title()

        raw_text = self._extract_text(path)
        if not raw_text.strip():
            return ArticleIngestResponse(
                doc_id=doc_id, title=title, path=str(path),
                chunks_indexed=0, topics=[], ok=False,
                error="Não foi possível extrair texto do arquivo.",
            )

        temporal_meta = self._extract_temporal_metadata(path=path, title=title, raw_text=raw_text)
        chunks = self._chunk(raw_text)
        topics_per_chunk = [self._extract_topics(c) for c in chunks]
        all_topics = sorted({t for ts in topics_per_chunk for t in ts})

        # ── Qdrant ─────────────────────────────────────────────────────
        indexed = 0
        if self._qdrant_available():
            self._ensure_collection(collection)
            texts         = chunks
            dense_vectors, _ = self.embeddings.embed_texts(texts)
            points: list[dict[str, Any]] = []
            for idx, (chunk, dense) in enumerate(zip(chunks, dense_vectors, strict=False)):
                chunk_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{doc_id}:chunk:{idx}"))
                sparse   = self._build_sparse_vector(chunk)
                points.append({
                    "id": chunk_id,
                    "vector": {"dense": dense, "text": sparse},
                    "payload": {
                        "doc_type":    "article",
                        "doc_id":      doc_id,
                        "title":       title,
                        "source_path": str(path),
                        "chunk_index": idx,
                        "content":     chunk,
                        "topics":      topics_per_chunk[idx],
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
                temporal_meta=temporal_meta,
            )

        return ArticleIngestResponse(
            doc_id=doc_id, title=title, path=str(path),
            chunks_indexed=indexed,
            topics=all_topics,
            canonical_title=temporal_meta["canonical_title"],
            published_at=temporal_meta["published_at"],
            published_year=temporal_meta["published_year"],
            version_label=temporal_meta["version_label"],
            ok=True,
        )

    # ── Text extraction & chunking ────────────────────────────────────────────

    @staticmethod
    def _extract_text(path: Path) -> str:
        """5-pass extraction — da mais rica para fallback simples.

        Pass 0 — MonkeyOCR  (SRR paradigm: melhor para PDFs com tabelas, fórmulas,
                             multi-coluna, figuras. Requer sidecar local na porta
                             MONKEYOCR_API_URL, padrão http://localhost:8000)
        Pass 1 — Docling    (estrutura + tabelas + colunas + layout awareness)
        Pass 2 — pypdf      (camada de texto nativa, rápido, sem deps pesadas)
        Pass 3 — OCR local via Tesseract  (PDFs escaneados / imagens incorporadas)
        Pass 4 — sidecar    (arquivo .txt ao lado do PDF, ground truth manual)
        """
        suffix = path.suffix.lower()

        if suffix == ".pdf":
            # ── Pass 0: MonkeyOCR sidecar (melhor qualidade) ──────────────────
            text = ArticleStore._monkeyocr(path)
            if text.strip():
                return text

            # ── Pass 1: Docling ───────────────────────────────────────────────
            text = ArticleStore._docling(path)
            if text.strip():
                return text

            # ── Pass 2: pypdf (text-layer) ────────────────────────────────────
            text = ArticleStore._pypdf(path)
            if text.strip():
                return text

            # ── Pass 3: OCR (Tesseract via pdf2image) ─────────────────────────
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

    @staticmethod
    def _monkeyocr(path: Path) -> str:
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
            MONKEYOCR_API_URL  (padrão: http://localhost:8000)

        Retorna string vazia se o sidecar não estiver disponível (cascada para
        Docling automaticamente).
        """
        import os
        base_url = os.environ.get("MONKEYOCR_API_URL", "http://localhost:8000").rstrip("/")
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
            parts = [page.extract_text() or "" for page in reader.pages]
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
                pytesseract.image_to_string(img, lang="por+eng")
                for img in images
            ]
            return "\n\n".join(parts).strip()
        except Exception:
            return ""

    @staticmethod
    def _chunk(text: str, max_chars: int = 800, min_chars: int = 80) -> list[str]:
        """Divide em parágrafos; junta os muito curtos, parte os muito longos."""
        raw_paragraphs = [p.strip() for p in _SECTION_BREAK.split(text) if p.strip()]
        chunks: list[str] = []
        buffer = ""
        for para in raw_paragraphs:
            if len(buffer) + len(para) + 2 <= max_chars:
                buffer = (buffer + "\n\n" + para).strip() if buffer else para
            else:
                if buffer and len(buffer) >= min_chars:
                    chunks.append(buffer)
                buffer = para
        if buffer and len(buffer) >= min_chars:
            chunks.append(buffer)
        # Long paragraphs: split by sentence
        final: list[str] = []
        for chunk in chunks:
            if len(chunk) <= max_chars:
                final.append(chunk)
                continue
            sentences = re.split(r"(?<=[.!?])\s+", chunk)
            sub = ""
            for sent in sentences:
                if len(sub) + len(sent) + 1 <= max_chars:
                    sub = (sub + " " + sent).strip() if sub else sent
                else:
                    if sub:
                        final.append(sub)
                    sub = sent
            if sub:
                final.append(sub)
        return final

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

    # ── Neo4j helpers ─────────────────────────────────────────────────────────

    def _neo4j_index_article(
        self,
        doc_id: str,
        title: str,
        path: str,
        topics: list[str],
        chunk_count: int,
        temporal_meta: dict[str, Any],
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
                    chunk_count=chunk_count,
                    canonical_title=temporal_meta.get("canonical_title"),
                    published_at=temporal_meta.get("published_at"),
                    published_year=temporal_meta.get("published_year"),
                    version_label=temporal_meta.get("version_label"),
                    version_number=temporal_meta.get("version_number"),
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
                    WITH a, b, count(t) AS shared_topics
                    WHERE shared_topics >= 2
                    MERGE (a)-[r:SHARES_TOPIC]->(b)
                    SET r.weight = shared_topics
                    MERGE (b)-[r2:SHARES_TOPIC]->(a)
                    SET r2.weight = shared_topics
                    """
                )
        finally:
            driver.close()

    def _neo4j_related(self, doc_id: str, limit: int) -> list[dict[str, Any]]:
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
                    RETURN b.id AS doc_id, b.title AS title, r.weight AS shared_topics,
                           b.published_at AS published_at, b.published_year AS published_year,
                           b.version_label AS version_label
                    ORDER BY r.weight DESC
                    LIMIT $limit
                    """,
                    id=doc_id, limit=limit,
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
                    RETURN b.id AS doc_id, b.title AS title, type(r) AS relation,
                           b.published_at AS published_at, b.published_year AS published_year,
                           b.version_label AS version_label
                    LIMIT $limit
                    """,
                    id=doc_id, limit=limit,
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

    def _qdrant_related(self, doc_id: str, limit: int) -> list[dict[str, Any]]:
        """Fallback when Neo4j is off: agrupa por doc_id nos chunks mais similares."""
        if not self._qdrant_available():
            return []
        # Busca os chunks do próprio artigo e usa o primeiro como query
        anchor_resp = self._qdrant(
            "POST",
            f"/collections/{ARTICLE_COLLECTION}/points/query",
            json_body={
                "filter": {"must": [{"key": "doc_id", "match": {"value": doc_id}}]},
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
        sim_resp = self._qdrant(
            "POST",
            f"/collections/{ARTICLE_COLLECTION}/points/query",
            json_body={
                "query":  anchor_vector,
                "using":  "dense",
                "limit":  limit * 5,
                "with_payload": True,
                "filter": {"must_not": [{"key": "doc_id", "match": {"value": doc_id}}]},
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
