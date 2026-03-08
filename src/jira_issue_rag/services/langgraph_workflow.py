from __future__ import annotations

from typing import Any, TypedDict

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from jira_issue_rag.shared.models import (
    AttachmentFacts,
    DecisionResult,
    DistilledContext,
    IssueCanonical,
    JudgeInput,
    RetrievedEvidence,
    RuleEvaluation,
)


class ValidationState(TypedDict, total=False):
    issue: IssueCanonical
    attachment_facts: AttachmentFacts
    provider: str | None
    prompt_name: str | None
    rule_evaluation: RuleEvaluation
    plan_queries: list[str]
    query_index: int
    current_query: str
    iteration_count: int
    latest_retrieved: list[RetrievedEvidence]
    retrieved: list[RetrievedEvidence]
    reflection_notes: list[str]
    distilled: DistilledContext
    judge_input: JudgeInput
    policy_action: str
    decision: DecisionResult


class LangGraphValidationRunner:
    def __init__(self, core: Any) -> None:
        self.core = core
        self._checkpointer = MemorySaver()
        graph = StateGraph(ValidationState)
        graph.add_node("normalize", self._normalize)
        graph.add_node("rules", self._rules)
        graph.add_node("plan", self._plan)
        graph.add_node("rewrite", self._rewrite)
        graph.add_node("retrieve", self._retrieve)
        graph.add_node("distill", self._distill)
        graph.add_node("reflect", self._reflect)
        graph.add_node("policy", self._policy)
        graph.add_node("judge", self._judge)
        graph.add_edge(START, "normalize")
        graph.add_edge("normalize", "rules")
        graph.add_edge("rules", "plan")
        graph.add_edge("plan", "rewrite")
        graph.add_edge("rewrite", "retrieve")
        graph.add_edge("retrieve", "distill")
        graph.add_edge("distill", "reflect")
        graph.add_edge("reflect", "policy")
        graph.add_conditional_edges(
            "policy",
            self._route_after_policy,
            {
                "rewrite": "rewrite",
                "judge": "judge",
            },
        )
        graph.add_edge("judge", END)
        self.graph = graph.compile(checkpointer=self._checkpointer)

    def run(
        self,
        issue: IssueCanonical,
        attachment_facts: AttachmentFacts,
        provider: str | None,
        prompt_name: str | None,
        thread_id: str | None = None,
    ) -> dict[str, Any]:
        config = {"configurable": {"thread_id": thread_id or issue.issue_key}}
        return self.graph.invoke(
            {
                "issue": issue,
                "attachment_facts": attachment_facts,
                "provider": provider,
                "prompt_name": prompt_name,
            },
            config=config,
        )

    def resume(self, thread_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        config = {"configurable": {"thread_id": thread_id}}
        return self.graph.invoke(patch, config=config)

    def get_state(self, thread_id: str) -> Any:
        config = {"configurable": {"thread_id": thread_id}}
        return self.graph.get_state(config)

    def _normalize(self, state: ValidationState) -> ValidationState:
        return {"issue": self.core.normalizer.normalize(state["issue"])}

    def _rules(self, state: ValidationState) -> ValidationState:
        rules = self.core.rules.evaluate(state["issue"], state["attachment_facts"])
        return {"rule_evaluation": rules}

    def _plan(self, state: ValidationState) -> ValidationState:
        queries = self._build_plan_queries(
            issue=state["issue"],
            attachment_facts=state["attachment_facts"],
            rules=state["rule_evaluation"],
        )
        return {
            "plan_queries": queries,
            "query_index": 0,
            "iteration_count": 0,
            "retrieved": [],
            "latest_retrieved": [],
            "reflection_notes": [],
            "policy_action": "judge",
        }

    def _rewrite(self, state: ValidationState) -> ValidationState:
        queries = state.get("plan_queries") or [
            self.core.retriever.build_query(state["issue"], state["attachment_facts"], state["rule_evaluation"])
        ]
        query_index = min(state.get("query_index", 0), len(queries) - 1)
        base_query = queries[query_index]
        return {"current_query": self._rewrite_query(base_query, state["issue"], state["rule_evaluation"])}

    def _retrieve(self, state: ValidationState) -> ValidationState:
        retrieved_now = self.core.retriever.search(
            state["issue"],
            state["attachment_facts"],
            state["rule_evaluation"],
            query_text_override=state.get("current_query"),
        )
        merged = self._merge_evidence(state.get("retrieved", []), retrieved_now)
        return {
            "latest_retrieved": retrieved_now,
            "retrieved": merged,
        }

    def _distill(self, state: ValidationState) -> ValidationState:
        distilled = self.core.distiller.distill(state.get("retrieved", []), state["rule_evaluation"])
        judge_input = JudgeInput(
            issue=state["issue"],
            attachment_facts=state["attachment_facts"],
            rule_evaluation=state["rule_evaluation"],
            retrieved_evidence=state.get("retrieved", []),
            distilled_context=distilled,
        )
        return {"distilled": distilled, "judge_input": judge_input}

    def _reflect(self, state: ValidationState) -> ValidationState:
        if not self.core.settings.enable_reflection_memory:
            return {}

        note = self._build_reflection_note(state)
        if not note:
            return {}

        notes = [*state.get("reflection_notes", []), note]
        distilled = state["distilled"].model_copy(deep=True)
        if note not in distilled.key_facts:
            distilled.key_facts = [*distilled.key_facts, note][:12]
        judge_input = state["judge_input"].model_copy(update={"distilled_context": distilled})
        return {
            "reflection_notes": notes,
            "distilled": distilled,
            "judge_input": judge_input,
        }

    def _policy(self, state: ValidationState) -> ValidationState:
        current_iteration = state.get("iteration_count", 0) + 1
        max_iterations = max(1, self.core.settings.max_planning_iterations)
        has_more_queries = state.get("query_index", 0) + 1 < len(state.get("plan_queries", []))

        if current_iteration >= max_iterations:
            return {"iteration_count": current_iteration, "policy_action": "judge"}

        if has_more_queries and self._should_continue(state):
            return {
                "iteration_count": current_iteration,
                "query_index": state.get("query_index", 0) + 1,
                "policy_action": "rewrite",
            }

        return {"iteration_count": current_iteration, "policy_action": "judge"}

    @staticmethod
    def _route_after_policy(state: ValidationState) -> str:
        return state.get("policy_action", "judge")

    def _judge(self, state: ValidationState) -> ValidationState:
        decision = self.core.router.judge(
            state["judge_input"],
            provider_override=state.get("provider"),
            prompt_name=state.get("prompt_name"),
        )
        return {"decision": decision}

    def _build_plan_queries(
        self,
        issue: IssueCanonical,
        attachment_facts: AttachmentFacts,
        rules: RuleEvaluation,
    ) -> list[str]:
        base_query = self.core.retriever.build_query(issue, attachment_facts, rules)
        if not self.core.settings.enable_planner:
            return [base_query]

        queries = [base_query]
        mode = self.core.settings.planner_mode

        if rules.contradictions:
            queries.append(f"{issue.issue_key} contradiction analysis {' '.join(rules.contradictions[:2])}")
        if rules.missing_items:
            queries.append(f"{issue.issue_key} missing information {' '.join(rules.missing_items[:4])}")
        if self.core.settings.enable_temporal_graphrag and (issue.affected_version or issue.changelog):
            queries.append(
                f"{issue.issue_key} version history timeline {issue.affected_version or ''} "
                f"{' '.join(event.field for event in issue.changelog[:3])}"
            )
        if self.core.settings.enable_graphrag:
            queries.append(
                f"{issue.issue_key} related issues component {issue.component or ''} service {issue.service or ''}"
            )
        if mode == "tool-aware" and attachment_facts.artifacts:
            artifact_names = [
                artifact.source_path.replace("\\", "/").split("/")[-1]
                for artifact in attachment_facts.artifacts[:3]
            ]
            queries.append(f"{issue.issue_key} artifact evidence {' '.join(artifact_names)}")

        unique_queries: list[str] = []
        seen: set[str] = set()
        for query in queries:
            normalized = " ".join(query.split())
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            unique_queries.append(normalized)
            if len(unique_queries) >= max(1, self.core.settings.max_planning_iterations):
                break
        return unique_queries or [base_query]

    def _rewrite_query(
        self,
        query: str,
        issue: IssueCanonical,
        rules: RuleEvaluation,
    ) -> str:
        if not self.core.settings.enable_query_rewriter:
            return query

        if self.core.settings.query_rewriter_mode == "hyde":
            return (
                f"Hypothesis for {issue.issue_key}: likely cause involves {issue.component or 'application logic'} "
                f"with expected={issue.expected_behavior or 'unspecified'} actual={issue.actual_behavior or 'unspecified'}. "
                f"Evidence query: {query}"
            )

        metadata_tokens = [
            issue.project,
            issue.component,
            issue.service,
            issue.environment,
            issue.affected_version,
            *issue.labels[:4],
            *rules.missing_items[:3],
        ]
        suffix = " ".join(token for token in metadata_tokens if token)
        return f"{query} {suffix}".strip()

    def _build_reflection_note(self, state: ValidationState) -> str:
        query = state.get("current_query", "")
        top_sources = [item.source for item in state.get("latest_retrieved", [])[:2]]
        distilled_facts = state["distilled"].key_facts[:2]
        compact_facts = " | ".join(distilled_facts) if distilled_facts else "no stable fact extracted"
        return (
            f"reflection[{state.get('query_index', 0) + 1}] query={query[:120]} "
            f"sources={', '.join(top_sources) if top_sources else 'none'} "
            f"facts={compact_facts[:220]}"
        )

    def _should_continue(self, state: ValidationState) -> bool:
        if not self.core.settings.enable_policy_loop:
            return False

        retrieved_count = len(state.get("retrieved", []))
        unresolved = bool(state["rule_evaluation"].contradictions or state["rule_evaluation"].missing_items)
        enough_evidence = retrieved_count >= 4
        if self.core.settings.policy_mode == "policy-agent":
            return unresolved or not enough_evidence or len(state.get("reflection_notes", [])) == 0
        return unresolved or not enough_evidence

    @staticmethod
    def _merge_evidence(
        existing: list[RetrievedEvidence],
        incoming: list[RetrievedEvidence],
    ) -> list[RetrievedEvidence]:
        merged: dict[str, RetrievedEvidence] = {
            item.evidence_id: item.model_copy(deep=True) for item in existing
        }
        for item in incoming:
            previous = merged.get(item.evidence_id)
            if previous is None or item.final_score > previous.final_score:
                merged[item.evidence_id] = item.model_copy(deep=True)
        return sorted(merged.values(), key=lambda item: item.final_score, reverse=True)
