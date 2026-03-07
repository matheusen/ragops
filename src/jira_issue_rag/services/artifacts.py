from __future__ import annotations

import csv
import hashlib
import re
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None

from jira_issue_rag.shared.models import ArtifactFact, AttachmentFacts, ArtifactType


AMOUNT_PATTERN = re.compile(r"(?:R\$\s*)?(-?\d+[\.,]\d{2})")
ID_PATTERN = re.compile(r"\b(?:[A-Z]{2,10}-\d+|req_[A-Za-z0-9]+|trace[-_:]?[A-Za-z0-9]+|[A-Fa-f0-9]{8,})\b")
TIMESTAMP_PATTERN = re.compile(r"\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\b")


class ArtifactPipeline:
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
            extracted_text = self._extract_sidecar_text(path)
            facts = self._extract_text_facts(extracted_text)
            facts["image_filename"] = path.name
            confidence = 0.78 if extracted_text else 0.10
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
        if PdfReader is not None:
            try:
                reader = PdfReader(str(path))
                text_parts = [page.extract_text() or "" for page in reader.pages]
                return "\n".join(text_parts).strip()
            except Exception:
                pass
        return self._extract_sidecar_text(path)

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
