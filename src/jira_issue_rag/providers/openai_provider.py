from __future__ import annotations

import json

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_fixed

from jira_issue_rag.providers.base import LLMProvider
from jira_issue_rag.providers.decision_contract import decision_output_contract_text, normalize_decision_data
from jira_issue_rag.shared.models import DecisionResult, JudgeInput


class OpenAIProvider(LLMProvider):
    provider_name = "openai"

    def __init__(self, api_key: str | None, model_name: str) -> None:
        self.api_key = api_key
        self.model_name = model_name

    def is_available(self) -> bool:
        return bool(self.api_key)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(1),
        retry=retry_if_exception_type(httpx.HTTPError),
        reraise=True,
    )
    def judge_issue(self, judge_input: JudgeInput) -> DecisionResult:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")

        output_text = self.run_prompt(
            system_prompt=(
                "You are validating whether a Jira issue is a real bug, whether it is complete, "
                "and whether it is ready for development. "
                "Build an explicit readiness checklist, list blockers, and give a short next action. "
                + decision_output_contract_text()
            ),
            user_prompt=judge_input.model_dump_json(indent=2),
            response_format="json",
        )
        decision_data = json.loads(output_text)
        normalized = normalize_decision_data(decision_data, judge_input)
        return DecisionResult.model_validate({**normalized, "provider": self.provider_name, "model": self.model_name})

    def run_prompt(self, system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")

        payload = {
            "model": self.model_name,
            "input": [
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": system_prompt,
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": user_prompt}],
                },
            ],
        }

        with httpx.Client(timeout=45.0) as client:
            response = client.post(
                "https://api.openai.com/v1/responses",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        return self._extract_output_text(data)

    @staticmethod
    def _extract_output_text(data: dict) -> str:
        if isinstance(data.get("output_text"), str) and data["output_text"].strip():
            return data["output_text"]
        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    return text
        raise ValueError("OpenAI response did not contain output text")
