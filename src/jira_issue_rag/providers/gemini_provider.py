from __future__ import annotations

import json

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_fixed

from jira_issue_rag.core.config import Settings
from jira_issue_rag.providers.base import LLMProvider
from jira_issue_rag.providers.decision_contract import decision_response_schema, normalize_decision_data
from jira_issue_rag.providers.google_vertex_auth import GoogleVertexAuth
from jira_issue_rag.shared.models import DecisionResult, JudgeInput


class GeminiProvider(LLMProvider):
    provider_name = "gemini"

    def __init__(self, settings: Settings, model_name: str) -> None:
        self.settings = settings
        self.model_name = model_name
        self.vertex_auth = GoogleVertexAuth(settings)

    def is_available(self) -> bool:
        return self.vertex_auth.is_available()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(1),
        retry=retry_if_exception_type(httpx.HTTPError),
        reraise=True,
    )
    def judge_issue(self, judge_input: JudgeInput) -> DecisionResult:
        if not self.vertex_auth.is_available():
            raise RuntimeError("Vertex AI configuration for Gemini is not available")

        output_text = self.run_prompt(
            system_prompt=(
                "You are validating whether a Jira issue is a real bug, whether it is complete, "
                "and whether it is ready for development. Return only valid JSON."
            ),
            user_prompt=(
                "Validate if this Jira issue is a bug, complete, and ready for dev. "
                "Return only JSON with the target fields.\n\n"
                + judge_input.model_dump_json(indent=2)
            ),
            response_format="json",
        )
        decision_data = json.loads(output_text)
        normalized = normalize_decision_data(decision_data, judge_input)
        return DecisionResult.model_validate({**normalized, "provider": self.provider_name, "model": self.model_name})

    def run_prompt(self, system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
        if not self.vertex_auth.is_available():
            raise RuntimeError("Vertex AI configuration for Gemini is not available")

        payload = {
            "systemInstruction": {
                "parts": [
                    {
                        "text": system_prompt
                    }
                ]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": user_prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json" if response_format == "json" else "text/plain",
            },
        }
        if response_format == "json":
            payload["generationConfig"]["responseSchema"] = decision_response_schema()

        url = self.vertex_auth.build_generate_content_url(self.model_name)
        with httpx.Client(timeout=45.0) as client:
            response = client.post(url, headers=self.vertex_auth.build_headers(), json=payload)
            response.raise_for_status()
            data = response.json()

        return self._extract_output_text(data)

    @staticmethod
    def _extract_output_text(data: dict) -> str:
        for candidate in data.get("candidates", []):
            content = candidate.get("content", {})
            for part in content.get("parts", []):
                text = part.get("text")
                if text:
                    return text
        raise ValueError("Gemini response did not contain output text")
