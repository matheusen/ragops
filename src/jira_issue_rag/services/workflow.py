from __future__ import annotations

from uuid import uuid4

from jira_issue_rag.core.config import Settings
from jira_issue_rag.services.artifacts import ArtifactPipeline
from jira_issue_rag.services.audit import AuditStore
from jira_issue_rag.services.decision import ProviderRouter
from jira_issue_rag.services.distiller import DistillerService
from jira_issue_rag.services.evaluation import GoldenDatasetEvaluator
from jira_issue_rag.services.jira import JiraClient
from jira_issue_rag.services.langgraph_workflow import LangGraphValidationRunner
from jira_issue_rag.services.normalization import IssueNormalizer
from jira_issue_rag.services.qdrant_store import QdrantStore
from jira_issue_rag.services.neo4j_store import Neo4jGraphStore
from jira_issue_rag.services.retrieval import HybridRetriever
from jira_issue_rag.services.rules import RulesEngine
from jira_issue_rag.shared.models import (
    ComparisonRequest,
    ComparisonResponse,
    DecisionResult,
    EvaluationRequest,
    EvaluationResponse,
    FolderValidationRequest,
    IndexIssueRequest,
    IndexResult,
    JiraFetchRequest,
    JiraFetchResponse,
    JiraValidationRequest,
    JudgeInput,
    PromptExecutionRequest,
    PromptExecutionResponse,
    PromptInfoResponse,
    ReplayRequest,
    ReplayResponse,
    ValidationExecutionResponse,
    ValidationResumeRequest,
    ValidationRequest,
)


class ValidationWorkflowCore:
    def __init__(self, settings: Settings) -> None:
        settings.enforce_runtime_policy()
        self.settings = settings
        self.normalizer = IssueNormalizer()
        self.artifacts = ArtifactPipeline(settings=settings)
        self.rules = RulesEngine()
        self.retriever = HybridRetriever(settings)
        self.distiller = DistillerService(settings)
        self.router = ProviderRouter(settings)
        self.audit = AuditStore(settings.audit_dir)
        self.jira = JiraClient(settings)
        self.qdrant = QdrantStore(settings)
        self.neo4j = Neo4jGraphStore(settings)


class ValidationWorkflow(ValidationWorkflowCore):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.graph_runner = LangGraphValidationRunner(self) if settings.enable_langgraph else None
        self.evaluator = GoldenDatasetEvaluator(self)

    def validate_issue(self, request: ValidationRequest) -> DecisionResult:
        attachment_facts = self.artifacts.process_paths(
            issue_key=request.issue.issue_key,
            artifact_paths=request.artifact_paths,
        )
        return self._run(
            issue=request.issue,
            attachment_facts=attachment_facts,
            provider=request.provider,
            prompt_name=request.prompt_name,
            thread_id=None,
            allow_interrupts=False,
        )

    def validate_issue_interactive(
        self,
        request: ValidationRequest,
        *,
        thread_id: str | None = None,
    ) -> ValidationExecutionResponse:
        attachment_facts = self.artifacts.process_paths(
            issue_key=request.issue.issue_key,
            artifact_paths=request.artifact_paths,
        )
        effective_thread_id = thread_id or f"{request.issue.issue_key}-{uuid4().hex[:8]}"
        state = self._run(
            issue=request.issue,
            attachment_facts=attachment_facts,
            provider=request.provider,
            prompt_name=request.prompt_name,
            thread_id=effective_thread_id,
            allow_interrupts=True,
        )
        return self._build_execution_response(effective_thread_id, state)

    def resume_interactive_issue(self, request: ValidationResumeRequest) -> ValidationExecutionResponse:
        if self.graph_runner is None:
            raise RuntimeError("Interactive resume requires LangGraph to be enabled.")
        state = self.graph_runner.resume(thread_id=request.thread_id, resume_value=request.resume)
        return self._build_execution_response(request.thread_id, state)

    def validate_folder(self, request: FolderValidationRequest) -> DecisionResult:
        attachment_facts = self.artifacts.process_folder(
            issue_key=request.issue.issue_key,
            folder_path=request.folder_path,
        )
        return self._run(
            issue=request.issue,
            attachment_facts=attachment_facts,
            provider=request.provider,
            prompt_name=request.prompt_name,
            thread_id=None,
            allow_interrupts=False,
        )

    def fetch_jira_issue(self, issue_key: str, request: JiraFetchRequest) -> JiraFetchResponse:
        issue = self.jira.fetch_issue(issue_key)
        downloaded_artifacts: list[str] = []
        if request.download_attachments:
            downloaded_artifacts = self.jira.download_attachments(issue, request.attachment_dir)
        return JiraFetchResponse(
            issue=issue,
            downloaded_artifacts=downloaded_artifacts,
            attachments_available=issue.attachments,
        )

    def validate_jira_issue(self, issue_key: str, request: JiraValidationRequest) -> DecisionResult:
        fetched = self.fetch_jira_issue(issue_key=issue_key, request=request)
        artifact_paths = list(request.artifact_paths)
        artifact_paths.extend(fetched.downloaded_artifacts)
        attachment_facts = self.artifacts.process_paths(
            issue_key=fetched.issue.issue_key,
            artifact_paths=artifact_paths,
        )
        return self._run(
            issue=fetched.issue,
            attachment_facts=attachment_facts,
            provider=request.provider,
            prompt_name=request.prompt_name,
            thread_id=None,
            allow_interrupts=False,
        )

    def execute_prompt(self, request: PromptExecutionRequest) -> PromptExecutionResponse:
        prompt_name, mode, provider, model, output_text = self.router.execute_prompt(
            prompt_name=request.prompt_name,
            content=request.content,
            provider_override=request.provider,
            title=request.title,
            metadata=request.metadata,
        )
        return PromptExecutionResponse(
            prompt_name=prompt_name,
            mode=mode,
            provider=provider,
            model=model,
            output_text=output_text,
        )

    def list_prompts(self) -> list[PromptInfoResponse]:
        return [PromptInfoResponse.model_validate(item) for item in self.router.list_prompts()]

    def index_issue(self, request: IndexIssueRequest) -> IndexResult:
        attachment_facts = self.artifacts.process_paths(
            issue_key=request.issue.issue_key,
            artifact_paths=request.artifact_paths,
        )
        count = self.qdrant.index_issue_package(request.issue, attachment_facts)
        return IndexResult(
            collection=self.settings.qdrant_collection,
            indexed_points=count,
            issue_key=request.issue.issue_key,
            backend="qdrant" if self.qdrant.is_available() else "disabled",
        )

    def index_jira_issue(self, issue_key: str, request: JiraFetchRequest) -> IndexResult:
        fetched = self.fetch_jira_issue(issue_key=issue_key, request=request)
        attachment_facts = self.artifacts.process_paths(
            issue_key=fetched.issue.issue_key,
            artifact_paths=fetched.downloaded_artifacts,
        )
        count = self.qdrant.index_issue_package(fetched.issue, attachment_facts)
        return IndexResult(
            collection=self.settings.qdrant_collection,
            indexed_points=count,
            issue_key=fetched.issue.issue_key,
            backend="qdrant" if self.qdrant.is_available() else "disabled",
        )

    def evaluate_golden_dataset(self, request: EvaluationRequest) -> EvaluationResponse:
        dataset_path = request.dataset_path or str(self.settings.golden_dataset_path)
        return self.evaluator.evaluate(
            dataset_path=dataset_path,
            provider=request.provider,
            use_ragas_style_metrics=request.use_ragas_style_metrics,
            use_ragas_runtime=request.use_ragas_runtime,
        )

    def compare_golden_dataset(self, request: ComparisonRequest) -> ComparisonResponse:
        dataset_path = request.dataset_path or str(self.settings.golden_dataset_path)
        return self.evaluator.compare_scenarios(
            dataset_path=dataset_path,
            scenarios=request.scenarios,
            use_ragas_style_metrics=request.use_ragas_style_metrics,
            use_ragas_runtime=request.use_ragas_runtime,
            write_report=request.write_report,
        )

    def replay_audit_dataset(self, request: ReplayRequest) -> ReplayResponse:
        audit_dir = request.audit_dir or str(self.settings.audit_dir)
        return self.evaluator.replay_audits(
            audit_dir=audit_dir,
            provider=request.provider,
            limit=request.limit,
        )

    def _run(
        self,
        issue,
        attachment_facts,
        provider: str | None,
        prompt_name: str | None,
        thread_id: str | None = None,
        allow_interrupts: bool = False,
    ):
        agentic_state: dict[str, object] = {}
        if self.graph_runner is not None:
            state = self.graph_runner.run(
                issue=issue,
                attachment_facts=attachment_facts,
                provider=provider,
                prompt_name=prompt_name,
                thread_id=thread_id,
            )
            if state.get("__interrupt__"):
                if allow_interrupts:
                    return state
                raise RuntimeError("The workflow paused for human review, but interrupts are disabled for this endpoint.")
            normalized_issue = state["issue"]
            rule_evaluation = state["rule_evaluation"]
            retrieved = state["retrieved"]
            distilled = state["distilled"]
            decision = state["decision"]
            agentic_state = {
                "plan_queries": state.get("plan_queries", []),
                "query_index": state.get("query_index", 0),
                "current_query": state.get("current_query"),
                "iteration_count": state.get("iteration_count", 0),
                "reflection_notes": state.get("reflection_notes", []),
                "policy_action": state.get("policy_action"),
            }
        else:
            normalized_issue = self.normalizer.normalize(issue)
            rule_evaluation = self.rules.evaluate(normalized_issue, attachment_facts)
            retrieved = self.retriever.search(normalized_issue, attachment_facts, rule_evaluation)
            distilled = self.distiller.distill(retrieved, rule_evaluation)

            judge_input = JudgeInput(
                issue=normalized_issue,
                attachment_facts=attachment_facts,
                rule_evaluation=rule_evaluation,
                retrieved_evidence=retrieved,
                distilled_context=distilled,
            )
            decision = self.router.judge(judge_input, provider_override=provider, prompt_name=prompt_name)
            state = {
                "issue": normalized_issue,
                "rule_evaluation": rule_evaluation,
                "retrieved": retrieved,
                "distilled": distilled,
                "decision": decision,
                "trace": [],
            }

        runtime_payload = self._build_runtime_payload(state, agentic_state)
        audit_path = self.audit.write(
            issue_key=normalized_issue.issue_key,
            payload={
                "issue": normalized_issue.model_dump(mode="json"),
                "attachment_facts": attachment_facts.model_dump(mode="json"),
                "rule_evaluation": rule_evaluation.model_dump(mode="json"),
                "retrieved": [item.model_dump(mode="json") for item in retrieved],
                "distilled": distilled.model_dump(mode="json"),
                "decision": decision.model_dump(mode="json"),
                "runtime": runtime_payload,
            },
        )
        decision.audit_path = audit_path
        if self.qdrant.is_available():
            self.qdrant.index_issue_package(normalized_issue, attachment_facts)
        if self.neo4j.is_available():
            self.neo4j.index_issue(normalized_issue)
        return decision

    def _build_execution_response(self, thread_id: str, state: dict) -> ValidationExecutionResponse:
        interrupts = [
            {
                "interrupt_id": getattr(item, "id", ""),
                "value": getattr(item, "value", {}) if isinstance(getattr(item, "value", {}), dict) else {"value": getattr(item, "value", None)},
            }
            for item in state.get("__interrupt__", [])
        ]
        decision = state.get("decision")
        runtime_payload = self._build_runtime_payload(state, {})
        if isinstance(decision, DecisionResult) and not decision.audit_path:
            normalized_issue = state["issue"]
            attachment_facts = state["attachment_facts"]
            rule_evaluation = state["rule_evaluation"]
            retrieved = state.get("retrieved", [])
            distilled = state["distilled"]
            audit_path = self.audit.write(
                issue_key=normalized_issue.issue_key,
                payload={
                    "issue": normalized_issue.model_dump(mode="json"),
                    "attachment_facts": attachment_facts.model_dump(mode="json"),
                    "rule_evaluation": rule_evaluation.model_dump(mode="json"),
                    "retrieved": [item.model_dump(mode="json") for item in retrieved],
                    "distilled": distilled.model_dump(mode="json"),
                    "decision": decision.model_dump(mode="json"),
                    "runtime": runtime_payload,
                },
            )
            decision.audit_path = audit_path
        return ValidationExecutionResponse(
            thread_id=thread_id,
            interrupted=bool(interrupts),
            interrupts=interrupts,
            decision=decision if isinstance(decision, DecisionResult) else None,
            runtime=runtime_payload,
        )

    def _build_runtime_payload(self, state: dict, agentic_state: dict[str, object]) -> dict[str, object]:
        trace = state.get("trace", [])
        runtime = {
            "langgraph": self.graph_runner is not None,
            "settings": {
                "enable_planner": self.settings.enable_planner,
                "enable_query_rewriter": self.settings.enable_query_rewriter,
                "enable_reflection_memory": self.settings.enable_reflection_memory,
                "enable_policy_loop": self.settings.enable_policy_loop,
                "enable_temporal_graphrag": self.settings.enable_temporal_graphrag,
                "enable_human_interrupts": self.settings.enable_human_interrupts,
                "planner_mode": self.settings.planner_mode,
                "query_rewriter_mode": self.settings.query_rewriter_mode,
                "reflection_mode": self.settings.reflection_mode,
                "policy_mode": self.settings.policy_mode,
                "temporal_graphrag_mode": self.settings.temporal_graphrag_mode,
                "distiller_mode": self.settings.distiller_mode,
            },
            "agentic_state": {
                "plan_queries": state.get("plan_queries", agentic_state.get("plan_queries", [])),
                "query_index": state.get("query_index", agentic_state.get("query_index", 0)),
                "current_query": state.get("current_query", agentic_state.get("current_query")),
                "iteration_count": state.get("iteration_count", agentic_state.get("iteration_count", 0)),
                "reflection_notes": state.get("reflection_notes", agentic_state.get("reflection_notes", [])),
                "policy_action": state.get("policy_action", agentic_state.get("policy_action")),
                "human_review": state.get("human_review"),
            },
            "trace": trace,
        }
        runtime["trace_grades"] = self._grade_trace(runtime, state)
        return runtime

    def _grade_trace(self, runtime: dict[str, object], state: dict) -> dict[str, float]:
        trace = runtime.get("trace", [])
        if not isinstance(trace, list):
            return {}
        executed_nodes = {
            str(entry.get("node"))
            for entry in trace
            if isinstance(entry, dict) and entry.get("node")
        }
        expected_nodes = {"normalize", "rules", "retrieve", "distill", "judge"}
        if self.settings.enable_planner:
            expected_nodes.add("plan")
        if self.settings.enable_query_rewriter:
            expected_nodes.add("rewrite")
        if self.settings.enable_reflection_memory:
            expected_nodes.add("reflect")
        if self.settings.enable_policy_loop:
            expected_nodes.add("policy")
        trace_completeness = len(executed_nodes & expected_nodes) / max(len(expected_nodes), 1)

        plan_queries = runtime.get("agentic_state", {}).get("plan_queries", []) if isinstance(runtime.get("agentic_state"), dict) else []
        planner_quality = min(len(plan_queries), 3) / 3 if self.settings.enable_planner else 1.0

        retrieved = state.get("retrieved", [])
        categories = {
            str(item.metadata.get("category", "unknown"))
            for item in retrieved
            if isinstance(item, object) and hasattr(item, "metadata")
        }
        retrieval_diversity = min(len(categories), 4) / 4 if retrieved else 0.0

        iterations = int(runtime.get("agentic_state", {}).get("iteration_count", 0)) if isinstance(runtime.get("agentic_state"), dict) else 0
        loop_efficiency = 1.0 if iterations <= 1 else min(len(retrieved) / max(iterations * 3, 1), 1.0)

        return {
            "trace_completeness": round(trace_completeness, 4),
            "planner_quality_proxy": round(planner_quality, 4),
            "retrieval_diversity_proxy": round(retrieval_diversity, 4),
            "loop_efficiency_proxy": round(loop_efficiency, 4),
        }
