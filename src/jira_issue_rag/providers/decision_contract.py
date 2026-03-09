from __future__ import annotations

from jira_issue_rag.shared.models import JudgeInput


def decision_output_contract_text() -> str:
    return (
        "Return only valid JSON with these fields: "
        "issue_key, classification, is_bug, is_complete, ready_for_dev, "
        "ready_for_dev_criteria_met, ready_for_dev_blockers, missing_items, evidence_used, "
        "contradictions, financial_impact_detected, confidence, requires_human_review, "
        "next_action, rationale. "
        "Set ready_for_dev=true only when the issue is a bug, has no unresolved contradictions, "
        "and every mandatory checklist item is satisfied."
    )


def normalize_decision_data(decision_data: dict, judge_input: JudgeInput) -> dict:
    normalized = dict(decision_data)
    normalized.setdefault("issue_key", judge_input.issue.issue_key)

    is_bug = bool(normalized.get("is_bug", False))
    requires_human_review = bool(normalized.get("requires_human_review", False))
    classification = normalized.get("classification")
    if classification not in {"bug", "not_bug", "needs_review"}:
        classification = "needs_review" if requires_human_review else ("bug" if is_bug else "not_bug")
    normalized["classification"] = classification

    normalized["is_bug"] = is_bug
    normalized["is_complete"] = bool(normalized.get("is_complete", False))
    normalized["ready_for_dev"] = bool(normalized.get("ready_for_dev", False))
    normalized["ready_for_dev_criteria_met"] = [str(item) for item in normalized.get("ready_for_dev_criteria_met", [])]
    normalized["ready_for_dev_blockers"] = [str(item) for item in normalized.get("ready_for_dev_blockers", [])]
    normalized["missing_items"] = [str(item) for item in normalized.get("missing_items", [])]
    normalized["evidence_used"] = [str(item) for item in normalized.get("evidence_used", [])]
    normalized["contradictions"] = [str(item) for item in normalized.get("contradictions", [])]
    normalized["financial_impact_detected"] = bool(normalized.get("financial_impact_detected", False))
    normalized["confidence"] = float(normalized.get("confidence", 0.0))
    normalized["requires_human_review"] = requires_human_review
    normalized["next_action"] = str(normalized.get("next_action", ""))
    normalized["rationale"] = str(normalized.get("rationale", ""))
    return normalized


def decision_response_schema() -> dict:
    return {
        "type": "OBJECT",
        "required": [
            "issue_key",
            "classification",
            "is_bug",
            "is_complete",
            "ready_for_dev",
            "ready_for_dev_criteria_met",
            "ready_for_dev_blockers",
            "missing_items",
            "evidence_used",
            "contradictions",
            "financial_impact_detected",
            "confidence",
            "requires_human_review",
            "next_action",
            "rationale",
        ],
        "properties": {
            "issue_key": {"type": "STRING"},
            "classification": {"type": "STRING", "enum": ["bug", "not_bug", "needs_review"]},
            "is_bug": {"type": "BOOLEAN"},
            "is_complete": {"type": "BOOLEAN"},
            "ready_for_dev": {"type": "BOOLEAN"},
            "ready_for_dev_criteria_met": {"type": "ARRAY", "items": {"type": "STRING"}},
            "ready_for_dev_blockers": {"type": "ARRAY", "items": {"type": "STRING"}},
            "missing_items": {"type": "ARRAY", "items": {"type": "STRING"}},
            "evidence_used": {"type": "ARRAY", "items": {"type": "STRING"}},
            "contradictions": {"type": "ARRAY", "items": {"type": "STRING"}},
            "financial_impact_detected": {"type": "BOOLEAN"},
            "confidence": {"type": "NUMBER"},
            "requires_human_review": {"type": "BOOLEAN"},
            "next_action": {"type": "STRING"},
            "rationale": {"type": "STRING"},
        },
    }
