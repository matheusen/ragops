from __future__ import annotations

from jira_issue_rag.core.config import Settings
from jira_issue_rag.services.artifacts import ArtifactPipeline
from jira_issue_rag.services.audit import AuditStore
from jira_issue_rag.services.decision import ProviderRouter
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
        return self._run(issue=request.issue, attachment_facts=attachment_facts, provider=request.provider, prompt_name=request.prompt_name)

    def validate_folder(self, request: FolderValidationRequest) -> DecisionResult:
        attachment_facts = self.artifacts.process_folder(
            issue_key=request.issue.issue_key,
            folder_path=request.folder_path,
        )
        return self._run(issue=request.issue, attachment_facts=attachment_facts, provider=request.provider, prompt_name=None)

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
        return self._run(issue=fetched.issue, attachment_facts=attachment_facts, provider=request.provider, prompt_name=request.prompt_name)

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

    def _run(self, issue, attachment_facts, provider: str | None, prompt_name: str | None) -> DecisionResult:
        if self.graph_runner is not None:
            state = self.graph_runner.run(issue=issue, attachment_facts=attachment_facts, provider=provider, prompt_name=prompt_name)
            normalized_issue = state["issue"]
            rule_evaluation = state["rule_evaluation"]
            retrieved = state["retrieved"]
            distilled = state["distilled"]
            decision = state["decision"]
        else:
            normalized_issue = self.normalizer.normalize(issue)
            rule_evaluation = self.rules.evaluate(normalized_issue, attachment_facts)
            retrieved = self.retriever.search(normalized_issue, attachment_facts, rule_evaluation)
            distilled = self.retriever.distill(retrieved, rule_evaluation)

            judge_input = JudgeInput(
                issue=normalized_issue,
                attachment_facts=attachment_facts,
                rule_evaluation=rule_evaluation,
                retrieved_evidence=retrieved,
                distilled_context=distilled,
            )
            decision = self.router.judge(judge_input, provider_override=provider, prompt_name=prompt_name)

        audit_path = self.audit.write(
            issue_key=normalized_issue.issue_key,
            payload={
                "issue": normalized_issue.model_dump(mode="json"),
                "attachment_facts": attachment_facts.model_dump(mode="json"),
                "rule_evaluation": rule_evaluation.model_dump(mode="json"),
                "retrieved": [item.model_dump(mode="json") for item in retrieved],
                "distilled": distilled.model_dump(mode="json"),
                "decision": decision.model_dump(mode="json"),
            },
        )
        decision.audit_path = audit_path
        if self.qdrant.is_available():
            self.qdrant.index_issue_package(normalized_issue, attachment_facts)
        if self.neo4j.is_available():
            self.neo4j.index_issue(normalized_issue)
        return decision
