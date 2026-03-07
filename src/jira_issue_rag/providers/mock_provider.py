from __future__ import annotations

from jira_issue_rag.providers.base import LLMProvider
from jira_issue_rag.shared.models import DecisionResult, JudgeInput


class MockProvider(LLMProvider):
    provider_name = "mock"

    def __init__(self, model_name: str = "mock-judge-v1") -> None:
        self.model_name = model_name

    def judge_issue(self, judge_input: JudgeInput) -> DecisionResult:
        issue = judge_input.issue
        rules = judge_input.rule_evaluation
        evidence = judge_input.retrieved_evidence
        artifact_text = " ".join(artifact.extracted_text for artifact in judge_input.attachment_facts.artifacts).lower()

        failure_markers = ["error", "exception", "failed", "failure", "timeout", "rollback"]
        success_markers = ["captured", "completed", "success", "approved", "settled"]
        has_failure = any(marker in artifact_text or marker in issue.description.lower() for marker in failure_markers)
        has_success = any(marker in artifact_text for marker in success_markers)

        is_bug = issue.issue_type.lower() == "bug" or has_failure or bool(rules.contradictions)
        if rules.requires_human_review and has_failure and has_success:
            classification = "needs_review"
        else:
            classification = "bug" if is_bug else "not_bug"

        is_complete = not rules.missing_items
        ready_for_dev = is_bug and is_complete and not rules.requires_human_review

        confidence = 0.52
        confidence += min(len(evidence), 5) * 0.05
        confidence += min(len(judge_input.attachment_facts.artifacts), 4) * 0.04
        if rules.contradictions:
            confidence -= 0.08
        if rules.missing_items:
            confidence -= min(len(rules.missing_items), 4) * 0.05
        confidence = max(0.15, min(confidence, 0.96))

        rationale_parts = []
        if has_failure:
            rationale_parts.append("Failure evidence found in issue or artifacts")
        if has_success:
            rationale_parts.append("Backend success markers detected in evidence")
        if rules.missing_items:
            rationale_parts.append(f"Missing required fields: {', '.join(rules.missing_items)}")
        if rules.contradictions:
            rationale_parts.append(f"Contradictions: {', '.join(rules.contradictions)}")
        if not rationale_parts:
            rationale_parts.append("Heuristic review found no strong negative signals")

        return DecisionResult(
            issue_key=issue.issue_key,
            classification=classification,
            is_bug=is_bug,
            is_complete=is_complete,
            ready_for_dev=ready_for_dev,
            missing_items=rules.missing_items,
            evidence_used=[item.source for item in evidence[:5]],
            contradictions=rules.contradictions,
            financial_impact_detected=rules.financial_impact_detected,
            confidence=confidence,
            requires_human_review=rules.requires_human_review,
            provider=self.provider_name,
            model=self.model_name,
            rationale="; ".join(rationale_parts),
        )

    def run_prompt(self, system_prompt: str, user_prompt: str, response_format: str = "text") -> str:
        if response_format == "json":
            return "{}"
        excerpt = user_prompt.strip().replace("\n", " ")[:240]
        return f"Mock analysis based on selected prompt. Summary: {excerpt}"
