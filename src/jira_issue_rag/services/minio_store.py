"""minio_store.py
Serviço de armazenamento de PDFs originais no MinIO (S3-compatible).

Responsabilidades:
  - Upload de PDFs durante ingestão (preserva o original)
  - Geração de presigned URLs para visualização no frontend
  - URLs apontam para a página exata do chunk via fragment #page=N

Dependência opcional: `minio` (pip install minio)
Se não instalado, as operações retornam None silenciosamente para
não quebrar o pipeline principal.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import TYPE_CHECKING

try:
    from minio import Minio
    from minio.error import S3Error
    _MINIO_AVAILABLE = True
except ImportError:
    _MINIO_AVAILABLE = False

if TYPE_CHECKING:
    from jira_issue_rag.core.config import Settings

logger = logging.getLogger(__name__)


class MinioStore:
    """Cliente MinIO para upload e acesso a PDFs originais."""

    def __init__(self, settings: "Settings") -> None:
        self.settings = settings
        self._client: "Minio | None" = None

    # ── Setup ─────────────────────────────────────────────────────────────────

    def _get_client(self) -> "Minio | None":
        if not _MINIO_AVAILABLE:
            return None
        if self._client is not None:
            return self._client
        try:
            endpoint = self.settings.minio_endpoint
            # Remove esquema para o cliente Minio (espera host:port)
            endpoint_clean = endpoint.replace("https://", "").replace("http://", "")
            secure = endpoint.startswith("https://")
            self._client = Minio(
                endpoint=endpoint_clean,
                access_key=self.settings.minio_access_key,
                secret_key=self.settings.minio_secret_key,
                secure=secure,
            )
            # Garante que o bucket existe
            bucket = self.settings.minio_bucket
            if not self._client.bucket_exists(bucket):
                self._client.make_bucket(bucket)
                logger.info("Bucket MinIO criado: %s", bucket)
            return self._client
        except Exception as exc:
            logger.warning("MinIO indisponível (%s). PDFs não serão armazenados no MinIO.", exc)
            return None

    # ── Chave de objeto ───────────────────────────────────────────────────────

    @staticmethod
    def make_object_key(doc_id: str, filename: str) -> str:
        """Retorna a chave S3: pdfs/{doc_id}/{filename}"""
        safe_name = Path(filename).name
        return f"pdfs/{doc_id}/{safe_name}"

    @staticmethod
    def doc_id_from_path(path: Path) -> str:
        """Deriva um doc_id estável a partir do conteúdo do arquivo (SHA-256 dos primeiros 64 KB)."""
        h = hashlib.sha256()
        with path.open("rb") as f:
            h.update(f.read(65536))
        return h.hexdigest()[:24]

    # ── Upload ────────────────────────────────────────────────────────────────

    def upload_pdf(self, path: Path, doc_id: str) -> str | None:
        """Faz upload do PDF para MinIO e retorna a object key.

        Retorna None se o MinIO não estiver disponível ou o upload falhar.
        """
        client = self._get_client()
        if client is None:
            return None
        if not path.exists() or path.suffix.lower() != ".pdf":
            return None
        try:
            key = self.make_object_key(doc_id, path.name)
            bucket = self.settings.minio_bucket
            client.fput_object(
                bucket_name=bucket,
                object_name=key,
                file_path=str(path),
                content_type="application/pdf",
            )
            logger.info("PDF enviado para MinIO: %s/%s", bucket, key)
            return key
        except Exception as exc:
            logger.warning("Falha no upload do PDF %s para MinIO: %s", path.name, exc)
            return None

    # ── Presigned URL ─────────────────────────────────────────────────────────

    def presigned_url(self, object_key: str, expires_seconds: int = 3600) -> str | None:
        """Gera URL assinada temporária para download direto do PDF.

        O frontend pode acrescentar #page=N para navegar ao chunk.
        """
        client = self._get_client()
        if client is None or not object_key:
            return None
        try:
            from datetime import timedelta
            url = client.presigned_get_object(
                bucket_name=self.settings.minio_bucket,
                object_name=object_key,
                expires=timedelta(seconds=expires_seconds),
            )
            # Substitui o endpoint interno pelo público (para o browser acessar)
            internal = self.settings.minio_endpoint.rstrip("/")
            public = self.settings.minio_public_endpoint.rstrip("/")
            if internal != public:
                url = url.replace(internal, public, 1)
            return url
        except Exception as exc:
            logger.warning("Falha ao gerar presigned URL para %s: %s", object_key, exc)
            return None

    def pdf_url_at_page(self, object_key: str, page: int | None, expires_seconds: int = 3600) -> str | None:
        """Retorna URL assinada com fragment #page=N para abrir no ponto exato do chunk."""
        url = self.presigned_url(object_key, expires_seconds)
        if url and page:
            url = f"{url}#page={page}"
        return url

    # ── Verificação ───────────────────────────────────────────────────────────

    def object_exists(self, object_key: str) -> bool:
        """Verifica se o objeto existe no MinIO."""
        client = self._get_client()
        if client is None:
            return False
        try:
            client.stat_object(self.settings.minio_bucket, object_key)
            return True
        except Exception:
            return False
