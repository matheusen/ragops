"""distiller.py

Context distillation service implementing two strategies:

simple (default)
    Rule-based: takes the first sentence of each evidence item, extracts
    exact token quotes (IDs, amounts, timestamps, error names) via regex.
    Zero LLM cost.

refrag
    REFRAG-style compression (Meta, 2025): calls a lightweight LLM to
    rewrite each evidence chunk in compact form, then splices back the
    exact tokens that were preserved by the regex pass.

    Two-pass algorithm:
      1. Extract high-fidelity tokens (regex) — never paraphrase these.
      2. Send evidence + token list to LLM with the compression prompt.
      3. Rebuild DistilledContext from the compressed output.

    The compression LLM call uses DISTILLER_PROVIDER (defaults to the
    primary provider) so you can route it to a cheaper/faster model.
"""
from __future__ import annotations

import json
import re

from jira_issue_rag.core.config import Settings
from jira_issue_rag.shared.models import DistilledContext, RetrievedEvidence, RuleEvaluation

# Tokens that must be preserved verbatim — never paraphrased.
# Matches: issue keys, monetary amounts, ISO timestamps, exception class names,
# HTTP status codes, UUIDs, and typical version strings.
_PRESERVE_PATTERN = re.compile(
    r"[A-Z]{2,10}-\d+"                      # issue keys: PAY-1421
    r"|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})"  # amounts: 1.200,00 / 1,200.00
    r"|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"  # ISO datetime
    r"|[A-Za-z]+(?:Exception|Error|Fault)\b" # Java/Python exception names
    r"|\b[45]\d{2}\b"                        # HTTP status codes 4xx/5xx
    r"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"  # UUIDs
    r"|\bv\d+\.\d+(?:\.\d+)?\b"             # version strings v2.4.1
)

_REFRAG_SYSTEM = (
    "You are a context compression assistant. "
    "Your task: rewrite the provided evidence into the most compact form possible "
    "while preserving all meaning needed to judge a software issue. "
    "CRITICAL: every token listed under PRESERVE must appear verbatim in your output. "
    "Do NOT paraphrase numbers, IDs, timestamps, error names, or version strings. "
    "Return only the compressed evidence text, no preamble."
)

_REFRAG_USER_TEMPLATE = """\
EVIDENCE:
{evidence_text}

PRESERVE (copy these tokens exactly as-is):
{preserve_tokens}

Write the compressed version:"""


class DistillerService:
    """Stateless service — create once per workflow execution or share across requests."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def distill(
        self,
        retrieved_evidence: list[RetrievedEvidence],
        rules: RuleEvaluation,
    ) -> DistilledContext:
        if self.settings.distiller_mode == "refrag":
            return self._distill_refrag(retrieved_evidence, rules)
        return self._distill_simple(retrieved_evidence, rules)

    # ------------------------------------------------------------------
    # Strategy: simple (zero cost)
    # ------------------------------------------------------------------

    def _distill_simple(
        self,
        retrieved_evidence: list[RetrievedEvidence],
        rules: RuleEvaluation,
    ) -> DistilledContext:
        key_facts: list[str] = []
        preserved_quotes: list[str] = []

        for evidence in retrieved_evidence[:5]:
            sentences = [
                s.strip()
                for s in re.split(r"(?<=[.!?])\s+", evidence.content)
                if s.strip()
            ]
            if sentences:
                key_facts.append(f"{evidence.source}: {sentences[0][:220]}")
            preserved_quotes.extend(
                m.group(0) for m in _PRESERVE_PATTERN.finditer(evidence.content)
            )

        for contradiction in rules.contradictions:
            key_facts.append(f"contradiction: {contradiction}")

        return DistilledContext(
            key_facts=key_facts[:10],
            preserved_quotes=sorted(set(preserved_quotes))[:20],
            evidence=retrieved_evidence,
        )

    # ------------------------------------------------------------------
    # Strategy: refrag (LLM-based compression)
    # ------------------------------------------------------------------

    def _distill_refrag(
        self,
        retrieved_evidence: list[RetrievedEvidence],
        rules: RuleEvaluation,
    ) -> DistilledContext:
        top_evidence = retrieved_evidence[:6]
        preserved_quotes: list[str] = []
        key_facts: list[str] = []

        for evidence in top_evidence:
            # Pass 1: extract tokens that must never be paraphrased
            tokens = sorted({m.group(0) for m in _PRESERVE_PATTERN.finditer(evidence.content)})
            preserved_quotes.extend(tokens)

            compressed = self._compress_with_llm(evidence.content, tokens)
            key_facts.append(f"{evidence.source}: {compressed}")

        for contradiction in rules.contradictions:
            key_facts.append(f"contradiction: {contradiction}")

        return DistilledContext(
            key_facts=key_facts[:12],
            preserved_quotes=sorted(set(preserved_quotes))[:20],
            evidence=retrieved_evidence,
        )

    def _compress_with_llm(self, text: str, preserve_tokens: list[str]) -> str:
        """Call the distiller provider to compress *text* while preserving *preserve_tokens*."""
        provider = self._get_distiller_provider()
        if provider is None:
            # Fallback: first 200 chars
            return text[:200]

        user_prompt = _REFRAG_USER_TEMPLATE.format(
            evidence_text=text[:2000],
            preserve_tokens=json.dumps(preserve_tokens, ensure_ascii=False),
        )
        try:
            return provider.run_prompt(
                system_prompt=_REFRAG_SYSTEM,
                user_prompt=user_prompt,
                response_format="text",
            ).strip()
        except Exception:  # noqa: BLE001
            return text[:200]

    def _get_distiller_provider(self):  # type: ignore[return]
        """Return the distiller LLM provider, or None when mode is simple/unavailable."""
        from jira_issue_rag.providers.gemini_provider import GeminiProvider
        from jira_issue_rag.providers.mock_provider import MockProvider
        from jira_issue_rag.providers.ollama_provider import OllamaProvider
        from jira_issue_rag.providers.openai_provider import OpenAIProvider

        name = (self.settings.distiller_provider or self.settings.default_provider).lower()

        if not self.settings.allows_provider(name):
            return None

        if name == "openai":
            p = OpenAIProvider(
                api_key=self.settings.openai_api_key,
                model_name=self.settings.openai_model,
            )
        elif name == "gemini":
            p = GeminiProvider(settings=self.settings, model_name=self.settings.gemini_model)
        elif name == "ollama":
            p = OllamaProvider(
                base_url=self.settings.ollama_base_url,
                model_name=self.settings.ollama_model,
            )
        else:
            p = MockProvider(self.settings.primary_model)

        return p if p.is_available() else None
