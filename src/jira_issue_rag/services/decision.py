from __future__ import annotations

import json

from jira_issue_rag.core.config import Settings
from jira_issue_rag.providers.base import LLMProvider
from jira_issue_rag.providers.decision_contract import normalize_decision_data
from jira_issue_rag.providers.gemini_provider import GeminiProvider
from jira_issue_rag.providers.mock_provider import MockProvider
from jira_issue_rag.providers.ollm_provider import OLLMProvider
from jira_issue_rag.providers.ollama_provider import OllamaProvider
from jira_issue_rag.providers.openai_provider import OpenAIProvider
from jira_issue_rag.services.prompt_catalog import PromptCatalog
from jira_issue_rag.shared.models import DecisionResult, JudgeInput


class ProviderRouter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.prompt_catalog = PromptCatalog(settings.prompts_dir)

    def judge(self, judge_input: JudgeInput, provider_override: str | None = None, prompt_name: str | None = None) -> DecisionResult:
        if self.settings.enable_modular_judge and prompt_name is None:
            return self._judge_modular(judge_input, provider_override)
        primary = self._get_provider(provider_override or self.settings.default_provider)
        if not primary.is_available():
            primary = MockProvider(self.settings.primary_model)

        primary_result = self._judge_with_prompt(primary, judge_input, prompt_name)

        if not self._needs_second_opinion(primary_result, judge_input):
            return primary_result

        secondary = self._get_provider(self.settings.secondary_provider)
        if not secondary.is_available() or secondary.provider_name == primary.provider_name:
            return primary_result

        secondary_result = self._judge_with_prompt(secondary, judge_input, prompt_name)
        if secondary_result.classification != primary_result.classification:
            primary_result.classification = "needs_review"
            primary_result.requires_human_review = True
            primary_result.confidence = round(min(primary_result.confidence, secondary_result.confidence) - 0.10, 4)
            primary_result.rationale += (
                f"; Secondary provider disagreement: {primary.provider_name}={primary_result.is_bug}, "
                f"{secondary.provider_name}={secondary_result.is_bug}"
            )
        return primary_result

    def _needs_second_opinion(self, result: DecisionResult, judge_input: JudgeInput) -> bool:
        if not self.settings.enable_second_opinion:
            return False
        return (
            result.requires_human_review
            or judge_input.rule_evaluation.financial_impact_detected
            or result.confidence < self.settings.second_opinion_confidence_threshold
        )

    def execute_prompt(
        self,
        prompt_name: str,
        content: str,
        provider_override: str | None = None,
        title: str | None = None,
        metadata: dict | None = None,
    ) -> tuple[str, str, str, str]:
        prompt = self.prompt_catalog.render(
            prompt_name,
            {
                "content": content,
                "title": title or "",
                "metadata_json": json.dumps(metadata or {}, indent=2, ensure_ascii=True),
                **(metadata or {}),  # allow {var} placeholders in templates
            },
        )
        provider = self._get_provider(provider_override or self.settings.default_provider)
        if not provider.is_available():
            provider = MockProvider(self.settings.primary_model)
        output_text = provider.run_prompt(
            system_prompt=prompt["system_prompt"],
            user_prompt=prompt["user_prompt"],
            response_format="json" if prompt["mode"] == "decision" else "text",
        )
        return prompt["name"], prompt["mode"], provider.provider_name, provider.model_name, output_text

    def list_prompts(self) -> list[dict[str, str]]:
        return self.prompt_catalog.list_prompts()

    # ------------------------------------------------------------------
    # Modular judge pipeline: facts → contradictions → completeness → judge
    # ------------------------------------------------------------------
    def _judge_modular(self, judge_input: JudgeInput, provider_override: str | None = None) -> DecisionResult:
        provider = self._get_provider(provider_override or self.settings.default_provider)
        if not provider.is_available():
            provider = MockProvider(self.settings.primary_model)

        # Step 1 – extract structured facts
        facts_prompt = self.prompt_catalog.render(
            "extract_issue_facts",
            {
                "issue_json": judge_input.issue.model_dump_json(indent=2),
                "attachment_facts_json": judge_input.attachment_facts.model_dump_json(indent=2),
                "rule_evaluation_json": judge_input.rule_evaluation.model_dump_json(indent=2),
            },
        )
        extracted_facts = provider.run_prompt(
            system_prompt=facts_prompt["system_prompt"],
            user_prompt=facts_prompt["user_prompt"],
            response_format="text",
        )

        # Step 2 – detect contradictions
        contradictions_prompt = self.prompt_catalog.render(
            "detect_contradictions",
            {
                "extracted_facts": extracted_facts,
                "retrieved_evidence_json": json.dumps(
                    [item.model_dump(mode="json") for item in judge_input.retrieved_evidence],
                    indent=2,
                    ensure_ascii=True,
                ),
                "rule_contradictions": "\n".join(judge_input.rule_evaluation.contradictions) or "None",
            },
        )
        contradictions_text = provider.run_prompt(
            system_prompt=contradictions_prompt["system_prompt"],
            user_prompt=contradictions_prompt["user_prompt"],
            response_format="text",
        )

        # Step 3 – check completeness
        completeness_prompt = self.prompt_catalog.render(
            "check_completeness",
            {
                "extracted_facts": extracted_facts,
                "contradictions_text": contradictions_text,
                "missing_items": "\n".join(judge_input.rule_evaluation.missing_items) or "None",
            },
        )
        completeness_text = provider.run_prompt(
            system_prompt=completeness_prompt["system_prompt"],
            user_prompt=completeness_prompt["user_prompt"],
            response_format="text",
        )

        # Step 4 – final judge
        judge_prompt = self.prompt_catalog.render(
            "judge_bug",
            {
                "extracted_facts": extracted_facts,
                "contradictions_text": contradictions_text,
                "completeness_text": completeness_text,
                "distilled_context_json": judge_input.distilled_context.model_dump_json(indent=2),
                "rule_evaluation_json": judge_input.rule_evaluation.model_dump_json(indent=2),
            },
        )
        output_text = provider.run_prompt(
            system_prompt=judge_prompt["system_prompt"],
            user_prompt=judge_prompt["user_prompt"],
            response_format="json",
        )
        decision_data = json.loads(output_text)
        normalized = normalize_decision_data(decision_data, judge_input)
        return DecisionResult.model_validate({**normalized, "provider": provider.provider_name, "model": provider.model_name})

    def _judge_with_prompt(self, provider: LLMProvider, judge_input: JudgeInput, prompt_name: str | None) -> DecisionResult:
        if not prompt_name or provider.provider_name == "mock":
            return provider.judge_issue(judge_input)
        prompt = self.prompt_catalog.render(
            prompt_name,
            {
                "judge_input_json": judge_input.model_dump_json(indent=2),
                "issue_json": judge_input.issue.model_dump_json(indent=2),
                "rule_evaluation_json": judge_input.rule_evaluation.model_dump_json(indent=2),
                "retrieved_evidence_json": json.dumps([item.model_dump(mode="json") for item in judge_input.retrieved_evidence], indent=2, ensure_ascii=True),
                "distilled_context_json": judge_input.distilled_context.model_dump_json(indent=2),
            },
        )
        if prompt["mode"] != "decision":
            raise ValueError(f"Prompt '{prompt_name}' is not a decision prompt")
        output_text = provider.run_prompt(
            system_prompt=prompt["system_prompt"],
            user_prompt=prompt["user_prompt"],
            response_format="json",
        )
        decision_data = json.loads(output_text)
        normalized = normalize_decision_data(decision_data, judge_input)
        return DecisionResult.model_validate({**normalized, "provider": provider.provider_name, "model": provider.model_name})

    def _get_provider(self, name: str) -> LLMProvider:
        lowered = name.lower()
        if not self.settings.allows_provider(lowered):
            return MockProvider(self.settings.primary_model)
        if lowered == "openai":
            return OpenAIProvider(api_key=self.settings.openai_api_key, model_name=self.settings.openai_model)
        if lowered == "gemini":
            return GeminiProvider(settings=self.settings, model_name=self.settings.gemini_model)
        if lowered == "ollama":
            return OllamaProvider(
                base_url=self.settings.ollama_base_url,
                model_name=self.settings.ollama_model,
                timeout_seconds=self.settings.ollama_timeout_seconds,
            )
        if lowered == "ollm":
            return OLLMProvider(
                model_name=self.settings.ollm_model,
                device=self.settings.ollm_device,
                models_dir=self.settings.ollm_models_dir,
                cache_dir=self.settings.ollm_cache_dir,
                force_download=self.settings.ollm_force_download,
                offload_layers=self.settings.ollm_offload_layers,
                max_new_tokens=self.settings.ollm_max_new_tokens,
            )
        return MockProvider(self.settings.primary_model)
