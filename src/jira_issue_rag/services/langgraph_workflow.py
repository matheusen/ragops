from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from jira_issue_rag.shared.models import AttachmentFacts, DecisionResult, DistilledContext, IssueCanonical, JudgeInput, RetrievedEvidence, RuleEvaluation


class ValidationState(TypedDict, total=False):
    issue: IssueCanonical
    attachment_facts: AttachmentFacts
    provider: str | None
    prompt_name: str | None
    rule_evaluation: RuleEvaluation
    retrieved: list[RetrievedEvidence]
    distilled: DistilledContext
    judge_input: JudgeInput
    decision: DecisionResult


class LangGraphValidationRunner:
    def __init__(self, core: Any) -> None:
        self.core = core
        graph = StateGraph(ValidationState)
        graph.add_node("normalize", self._normalize)
        graph.add_node("rules", self._rules)
        graph.add_node("retrieve", self._retrieve)
        graph.add_node("distill", self._distill)
        graph.add_node("judge", self._judge)
        graph.add_edge(START, "normalize")
        graph.add_edge("normalize", "rules")
        graph.add_edge("rules", "retrieve")
        graph.add_edge("retrieve", "distill")
        graph.add_edge("distill", "judge")
        graph.add_edge("judge", END)
        self.graph = graph.compile()

    def run(self, issue: IssueCanonical, attachment_facts: AttachmentFacts, provider: str | None, prompt_name: str | None) -> dict[str, Any]:
        return self.graph.invoke(
            {
                "issue": issue,
                "attachment_facts": attachment_facts,
                "provider": provider,
                "prompt_name": prompt_name,
            }
        )

    def _normalize(self, state: ValidationState) -> ValidationState:
        return {"issue": self.core.normalizer.normalize(state["issue"])}

    def _rules(self, state: ValidationState) -> ValidationState:
        rules = self.core.rules.evaluate(state["issue"], state["attachment_facts"])
        return {"rule_evaluation": rules}

    def _retrieve(self, state: ValidationState) -> ValidationState:
        retrieved = self.core.retriever.search(state["issue"], state["attachment_facts"], state["rule_evaluation"])
        return {"retrieved": retrieved}

    def _distill(self, state: ValidationState) -> ValidationState:
        distilled = self.core.retriever.distill(state["retrieved"], state["rule_evaluation"])
        judge_input = JudgeInput(
            issue=state["issue"],
            attachment_facts=state["attachment_facts"],
            rule_evaluation=state["rule_evaluation"],
            retrieved_evidence=state["retrieved"],
            distilled_context=distilled,
        )
        return {"distilled": distilled, "judge_input": judge_input}

    def _judge(self, state: ValidationState) -> ValidationState:
        decision = self.core.router.judge(
            state["judge_input"],
            provider_override=state.get("provider"),
            prompt_name=state.get("prompt_name"),
        )
        return {"decision": decision}
