from __future__ import annotations

from abc import ABC, abstractmethod

from jira_issue_rag.shared.models import DecisionResult, JudgeInput


class LLMProvider(ABC):
    provider_name: str
    model_name: str

    @abstractmethod
    def judge_issue(self, judge_input: JudgeInput) -> DecisionResult:
        raise NotImplementedError

    def run_prompt(self, system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
        raise NotImplementedError

    def is_available(self) -> bool:
        return True
