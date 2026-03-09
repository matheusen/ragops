from __future__ import annotations

import base64
import csv
import hashlib
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx
import pandas as pd

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None

from jira_issue_rag.shared.models import ArtifactFact, AttachmentFacts, ArtifactType

if TYPE_CHECKING:
    from jira_issue_rag.core.config import Settings


AMOUNT_PATTERN = re.compile(r"(?:R\$\s*)?(-?\d+[\.,]\d{2})")
ID_PATTERN = re.compile(r"\b(?:[A-Z]{2,10}-\d+|req_[A-Za-z0-9]+|trace[-_:]?[A-Za-z0-9]+|[A-Fa-f0-9]{8,})\b")
TIMESTAMP_PATTERN = re.compile(r"\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\b")


class ArtifactPipeline:
    def __init__(self, settings: "Settings | None" = None) -> None:
        self.settings = settings

    def process_paths(self, issue_key: str, artifact_paths: list[str]) -> AttachmentFacts:
        artifacts: list[ArtifactFact] = []
        missing_information: list[str] = []

        for raw_path in artifact_paths:
            path = Path(raw_path)
            if not path.exists():
                missing_information.append(f"artifact_missing:{path}")
                continue
            artifacts.append(self._process_single(path))

        contradictions = self._detect_contradictions(artifacts)
        missing_information.extend(self._detect_missing_information(artifacts))
        return AttachmentFacts(
            issue_key=issue_key,
            artifacts=artifacts,
            contradictions=contradictions,
            missing_information=sorted(set(missing_information)),
        )

    def process_folder(self, issue_key: str, folder_path: str) -> AttachmentFacts:
        paths = [str(path) for path in sorted(Path(folder_path).iterdir()) if path.is_file()]
        return self.process_paths(issue_key=issue_key, artifact_paths=paths)

    def _process_single(self, path: Path) -> ArtifactFact:
        artifact_type = self._detect_type(path)
        if artifact_type == "log" or artifact_type == "text":
            extracted_text = self._read_text(path)
            facts = self._extract_text_facts(extracted_text)
            confidence = 0.92 if extracted_text else 0.20
        elif artifact_type == "spreadsheet":
            extracted_text, facts = self._extract_spreadsheet(path)
            confidence = 0.95 if extracted_text else 0.30
        elif artifact_type == "pdf":
            extracted_text = self._extract_pdf_text(path)
            facts = self._extract_text_facts(extracted_text)
            confidence = 0.85 if extracted_text else 0.25
        elif artifact_type == "image":
            extracted_text = self._extract_image_vision(path)
            facts = self._extract_text_facts(extracted_text)
            facts["image_filename"] = path.name
            if not extracted_text:
                facts["vision_extraction_failed"] = True
            confidence = 0.82 if extracted_text else 0.10
        else:
            extracted_text = self._extract_sidecar_text(path)
            facts = self._extract_text_facts(extracted_text)
            confidence = 0.40 if extracted_text else 0.10

        facts.setdefault("artifact_name", path.name)
        return ArtifactFact(
            artifact_id=self._hash_bytes(path.read_bytes()),
            artifact_type=artifact_type,
            source_path=str(path),
            extracted_text=extracted_text,
            facts=facts,
            confidence=confidence,
        )

    @staticmethod
    def _detect_type(path: Path) -> ArtifactType:
        suffix = path.suffix.lower()
        if suffix in {".log"}:
            return "log"
        if suffix in {".txt", ".md", ".json"}:
            return "text"
        if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            return "image"
        if suffix in {".pdf"}:
            return "pdf"
        if suffix in {".csv", ".xlsx", ".xls"}:
            return "spreadsheet"
        return "unknown"

    @staticmethod
    def _hash_bytes(data: bytes) -> str:
        return "sha256:" + hashlib.sha256(data).hexdigest()

    def _extract_image_vision(self, path: Path) -> str:
        """Extract text/facts from an image via OpenAI or Gemini vision, with sidecar fallback."""
        # Sidecar .txt has priority (user-provided ground truth)
        sidecar = self._extract_sidecar_text(path)
        if sidecar.strip():
            return sidecar

        if not self.settings:
            return ""

        suffix = path.suffix.lower()
        mime_type = (
            "image/jpeg" if suffix in {".jpg", ".jpeg"}
            else "image/webp" if suffix == ".webp"
            else "image/png"
        )
        b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
        prompt = (
            "Extract all visible text, error messages, request IDs, timestamps, monetary amounts, "
            "and key facts from this screenshot. Return a structured plain-text summary."
        )

        # Try OpenAI vision first
        if (
            self.settings.allow_third_party_llm or not self.settings.confidentiality_mode
        ) and self.settings.openai_api_key:
            try:
                return self._vision_openai(b64, mime_type, prompt)
            except Exception:  # pragma: no cover
                pass

        # Try Gemini direct API key
        if self.settings.gemini_api_key:
            try:
                return self._vision_gemini_direct(b64, mime_type, prompt)
            except Exception:  # pragma: no cover
                pass

        return ""

    def _vision_openai(self, b64: str, mime_type: str, prompt: str) -> str:
        payload = {
            "model": self.settings.openai_model,  # type: ignore[union-attr]
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": f"data:{mime_type};base64,{b64}"},
                    ],
                }
            ],
        }
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {self.settings.openai_api_key}",  # type: ignore[union-attr]
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        if isinstance(data.get("output_text"), str) and data["output_text"].strip():
            return data["output_text"]
        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    return str(text)
        return ""

    def _vision_gemini_direct(self, b64: str, mime_type: str, prompt: str) -> str:
        model = self.settings.gemini_model  # type: ignore[union-attr]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": mime_type, "data": b64}},
                    ],
                }
            ],
            "generationConfig": {"responseMimeType": "text/plain"},
        }
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                url,
                params={"key": self.settings.gemini_api_key},  # type: ignore[union-attr]
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                text = part.get("text")
                if text:
                    return str(text)
        return ""

    @staticmethod
    def _read_text(path: Path) -> str:
        for encoding in ("utf-8", "latin-1", "cp1252"):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        return path.read_text(errors="ignore")

    def _extract_sidecar_text(self, path: Path) -> str:
        candidates = [Path(str(path) + ".txt"), path.with_suffix(".txt")]
        for candidate in candidates:
            if candidate.exists() and candidate.is_file():
                return self._read_text(candidate)
        return ""

    def _extract_pdf_text(self, path: Path) -> str:
        # 1st pass: pypdf (safe and fast for born-digital PDFs)
        text = self._extract_pdf_pypdf(path)
        if text.strip():
            return text

        # 2nd pass: Docling is opt-in because some Windows PDF/OCR stacks are unstable.
        if self.settings and self.settings.enable_docling_pdf_parser:
            text = self._extract_pdf_docling(path)
            if text.strip():
                return text

        # 3rd pass: OCR via Tesseract for scanned/image-only PDFs.
        if self.settings is None or self.settings.enable_tesseract_pdf_ocr:
            text = self._extract_pdf_tesseract(path)
            if text.strip():
                return text

        # 4th pass: sidecar .txt
        return self._extract_sidecar_text(path)

    @staticmethod
    def _extract_pdf_pypdf(path: Path) -> str:
        if PdfReader is None:
            return ""
        try:
            reader = PdfReader(str(path))
            text_parts = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(text_parts).strip()
        except Exception:
            return ""

    @staticmethod
    def _extract_pdf_docling(path: Path) -> str:
        try:
            from docling.document_converter import DocumentConverter  # type: ignore[import-untyped]
            converter = DocumentConverter()
            result = converter.convert(str(path))
            return result.document.export_to_markdown().strip()
        except Exception:
            return ""

    @staticmethod
    def _extract_pdf_tesseract(path: Path) -> str:
        try:
            import pytesseract  # type: ignore[import-untyped]
            from pdf2image import convert_from_path  # type: ignore[import-untyped]

            images = convert_from_path(str(path), dpi=300)
            parts = [pytesseract.image_to_string(img, lang="por+eng") for img in images]
            return "\n\n".join(parts).strip()
        except Exception:
            return ""

    def _extract_spreadsheet(self, path: Path) -> tuple[str, dict[str, Any]]:
        if path.suffix.lower() == ".csv":
            frame = pd.read_csv(path)
        else:
            frame = pd.read_excel(path)

        preview = frame.head(10).fillna("").to_csv(index=False)
        amount_columns = [column for column in frame.columns if "amount" in str(column).lower() or "valor" in str(column).lower()]

        sums: dict[str, float] = {}
        for column in amount_columns:
            numeric = pd.to_numeric(frame[column], errors="coerce")
            sums[str(column)] = float(numeric.fillna(0).sum())

        facts: dict[str, Any] = {
            "row_count": int(len(frame.index)),
            "columns": [str(column) for column in frame.columns],
            "amount_sums": sums,
        }
        if amount_columns:
            facts["total_amount"] = sum(sums.values())

        statuses = [column for column in frame.columns if "status" in str(column).lower()]
        if statuses:
            counts = frame[statuses[0]].astype(str).value_counts().to_dict()
            facts["status_counts"] = {str(key): int(value) for key, value in counts.items()}

        return preview, facts

    def _extract_text_facts(self, text: str) -> dict[str, Any]:
        ids = sorted(set(ID_PATTERN.findall(text)))
        timestamps = sorted(set(TIMESTAMP_PATTERN.findall(text)))
        amounts = [self._parse_amount(raw_amount) for raw_amount in AMOUNT_PATTERN.findall(text)]

        error_lines = []
        for line in text.splitlines():
            lowered = line.lower()
            if any(marker in lowered for marker in ("error", "exception", "failed", "timeout", "rollback")):
                error_lines.append(line.strip())
        return {
            "ids": ids[:20],
            "timestamps": timestamps[:20],
            "amounts": amounts[:20],
            "error_lines": error_lines[:10],
        }

    @staticmethod
    def _parse_amount(raw_amount: str) -> float:
        normalized = raw_amount.replace(".", "").replace(",", ".")
        return float(normalized)

    @staticmethod
    def _detect_contradictions(artifacts: list[ArtifactFact]) -> list[str]:
        combined = " ".join(artifact.extracted_text.lower() for artifact in artifacts)
        contradictions = []
        if any(marker in combined for marker in ("falha", "failed", "failure", "error")) and any(
            marker in combined for marker in ("captured", "completed", "success", "approved", "sucesso")
        ):
            contradictions.append("UI or artifact failure evidence conflicts with backend success evidence")

        for artifact in artifacts:
            amount_sums = artifact.facts.get("amount_sums") or {}
            status_counts = artifact.facts.get("status_counts") or {}
            if amount_sums and status_counts.get("captured", 0) and status_counts.get("failed", 0):
                contradictions.append("Spreadsheet contains both captured and failed payment rows")

        return sorted(set(contradictions))

    @staticmethod
    def _detect_missing_information(artifacts: list[ArtifactFact]) -> list[str]:
        missing = []
        for artifact in artifacts:
            if artifact.artifact_type in {"image", "pdf"} and not artifact.extracted_text:
                missing.append(f"ocr_or_parser_missing:{Path(artifact.source_path).name}")
        return missing
