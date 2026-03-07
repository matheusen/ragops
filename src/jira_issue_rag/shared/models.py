from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


ArtifactType = Literal["log", "image", "pdf", "spreadsheet", "text", "unknown"]


class IssueLink(BaseModel):
    link_type: str
    key: str
    relation: str | None = None


class AttachmentMeta(BaseModel):
    filename: str
    attachment_id: str | None = None
    path: str | None = None
    content_type: str | None = None
    content_url: str | None = None
    size_bytes: int | None = None


class ChangelogEvent(BaseModel):
    author: str | None = None
    field: str
    from_value: str | None = None
    to_value: str | None = None
    changed_at: datetime | None = None


class IssueCanonical(BaseModel):
    issue_key: str
    summary: str
    description: str = ""
    comments: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    reproduction_steps: list[str] = Field(default_factory=list)
    expected_behavior: str = ""
    actual_behavior: str = ""
    priority: str | None = None
    issue_type: str = "Bug"
    status: str | None = None
    project: str | None = None
    component: str | None = None
    service: str | None = None
    environment: str | None = None
    affected_version: str | None = None
    labels: list[str] = Field(default_factory=list)
    issue_links: list[IssueLink] = Field(default_factory=list)
    attachments: list[AttachmentMeta] = Field(default_factory=list)
    changelog: list[ChangelogEvent] = Field(default_factory=list)
    collected_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def normalize_issue_key(self) -> "IssueCanonical":
        self.issue_key = self.issue_key.upper().strip()
        return self


class ArtifactFact(BaseModel):
    artifact_id: str
    artifact_type: ArtifactType
    source_path: str
    extracted_text: str = ""
    facts: dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.0


class AttachmentFacts(BaseModel):
    issue_key: str
    artifacts: list[ArtifactFact] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


class RuleResult(BaseModel):
    rule_name: str
    severity: Literal["info", "warning", "critical"]
    message: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class RuleEvaluation(BaseModel):
    missing_items: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    financial_impact_detected: bool = False
    requires_human_review: bool = False
    results: list[RuleResult] = Field(default_factory=list)


class RetrievedEvidence(BaseModel):
    evidence_id: str
    source: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    sparse_score: float = 0.0
    dense_score: float = 0.0
    final_score: float = 0.0


class DistilledContext(BaseModel):
    key_facts: list[str] = Field(default_factory=list)
    preserved_quotes: list[str] = Field(default_factory=list)
    evidence: list[RetrievedEvidence] = Field(default_factory=list)


class JudgeInput(BaseModel):
    issue: IssueCanonical
    attachment_facts: AttachmentFacts
    rule_evaluation: RuleEvaluation
    retrieved_evidence: list[RetrievedEvidence] = Field(default_factory=list)
    distilled_context: DistilledContext = Field(default_factory=DistilledContext)


class DecisionResult(BaseModel):
    issue_key: str
    classification: Literal["bug", "not_bug", "needs_review"]
    is_bug: bool
    is_complete: bool
    ready_for_dev: bool
    missing_items: list[str] = Field(default_factory=list)
    evidence_used: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    financial_impact_detected: bool = False
    confidence: float = 0.0
    requires_human_review: bool = False
    provider: str = "mock"
    model: str = "mock-judge-v1"
    rationale: str = ""
    audit_path: str | None = None
    generated_at: datetime = Field(default_factory=utc_now)


class ValidationRequest(BaseModel):
    issue: IssueCanonical
    artifact_paths: list[str] = Field(default_factory=list)
    provider: str | None = None
    prompt_name: str | None = None


class JiraFetchRequest(BaseModel):
    download_attachments: bool = False
    attachment_dir: str | None = None

    @model_validator(mode="after")
    def normalize_attachment_dir(self) -> "JiraFetchRequest":
        if self.attachment_dir:
            self.attachment_dir = str(Path(self.attachment_dir))
        return self


class JiraValidationRequest(JiraFetchRequest):
    provider: str | None = None
    artifact_paths: list[str] = Field(default_factory=list)
    prompt_name: str | None = None


class IndexIssueRequest(BaseModel):
    issue: IssueCanonical
    artifact_paths: list[str] = Field(default_factory=list)


class IndexResult(BaseModel):
    collection: str
    indexed_points: int
    issue_key: str
    backend: str


class JiraFetchResponse(BaseModel):
    issue: IssueCanonical
    downloaded_artifacts: list[str] = Field(default_factory=list)
    attachments_available: list[AttachmentMeta] = Field(default_factory=list)


class EvaluationExample(BaseModel):
    issue: IssueCanonical
    artifact_paths: list[str] = Field(default_factory=list)
    expected_classification: Literal["bug", "not_bug", "needs_review"]
    expected_is_complete: bool
    expected_ready_for_dev: bool
    expected_missing_items: list[str] = Field(default_factory=list)
    expected_evidence_refs: list[str] = Field(default_factory=list)
    expected_contradictions: list[str] = Field(default_factory=list)


class EvaluationRequest(BaseModel):
    dataset_path: str | None = None
    provider: str | None = None
    use_ragas_style_metrics: bool = True
    use_ragas_runtime: bool = False


class EvaluationMetric(BaseModel):
    name: str
    value: float


class EvaluationExampleResult(BaseModel):
    issue_key: str
    expected_classification: str
    actual_classification: str
    expected_ready_for_dev: bool
    actual_ready_for_dev: bool
    expected_is_complete: bool
    actual_is_complete: bool
    missing_item_overlap: float
    confidence: float
    evidence_precision_proxy: float = 0.0
    evidence_recall_proxy: float = 0.0
    faithfulness_proxy: float = 0.0
    contradiction_alignment: float = 0.0


class EvaluationResponse(BaseModel):
    dataset_path: str
    total_examples: int
    metrics: list[EvaluationMetric] = Field(default_factory=list)
    examples: list[EvaluationExampleResult] = Field(default_factory=list)
    ragas_metrics: list[EvaluationMetric] = Field(default_factory=list)
    ragas_runtime_available: bool = False
    needs_improvement: bool = False


class ReplayRequest(BaseModel):
    audit_dir: str | None = None
    limit: int = 20
    provider: str | None = None


class ReplayExampleResult(BaseModel):
    issue_key: str
    baseline_classification: str
    replay_classification: str
    baseline_ready_for_dev: bool
    replay_ready_for_dev: bool
    baseline_is_complete: bool
    replay_is_complete: bool
    baseline_confidence: float
    replay_confidence: float
    classification_changed: bool
    readiness_changed: bool
    completeness_changed: bool


class ReplayResponse(BaseModel):
    audit_dir: str
    total_examples: int
    metrics: list[EvaluationMetric] = Field(default_factory=list)
    examples: list[ReplayExampleResult] = Field(default_factory=list)


class EvaluationScenario(BaseModel):
    name: str
    provider: str | None = None
    enable_reranker: bool = True
    enable_external_retrieval: bool = True
    enable_langgraph: bool = True


class ScenarioEvaluationResult(BaseModel):
    scenario: EvaluationScenario
    total_examples: int
    metrics: list[EvaluationMetric] = Field(default_factory=list)
    ragas_metrics: list[EvaluationMetric] = Field(default_factory=list)
    ragas_runtime_available: bool = False


class ComparisonRequest(BaseModel):
    dataset_path: str | None = None
    scenarios: list[EvaluationScenario] = Field(default_factory=list)
    use_ragas_style_metrics: bool = True
    use_ragas_runtime: bool = False
    write_report: bool = True


class ComparisonResponse(BaseModel):
    dataset_path: str
    scenarios: list[ScenarioEvaluationResult] = Field(default_factory=list)
    report_path: str | None = None


class FolderValidationRequest(BaseModel):
    issue: IssueCanonical
    folder_path: str
    provider: str | None = None

    @model_validator(mode="after")
    def normalize_folder_path(self) -> "FolderValidationRequest":
        self.folder_path = str(Path(self.folder_path))
        return self


class HealthResponse(BaseModel):
    status: str
    app_name: str
    environment: str


class PromptExecutionRequest(BaseModel):
    prompt_name: str
    content: str
    provider: str | None = None
    title: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PromptExecutionResponse(BaseModel):
    prompt_name: str
    mode: Literal["decision", "text"]
    provider: str
    model: str
    output_text: str


class PromptInfoResponse(BaseModel):
    name: str
    mode: Literal["decision", "text"]
    description: str = ""


# ---------------------------------------------------------------------------
# Pipeline Canvas — flow run
# ---------------------------------------------------------------------------

class FlowNodeState(BaseModel):
    """Minimal snapshot of one canvas node sent from the dashboard."""

    id: str
    """Node id as defined in NODE_CATALOG (e.g. 'provider', 'reranker')."""

    active: bool = True
    """Whether the node is toggled on (optional nodes can be disabled)."""

    selected_variant: str | None = None
    """Label of the chosen variant, e.g. 'GPT-4o', 'Hybrid BM25+Dense'."""


class FlowRunRequest(BaseModel):
    """Run a full validation using the pipeline configuration from the canvas."""

    nodes: list[FlowNodeState] = Field(
        description="Ordered list of active/inactive canvas nodes with their variant selections."
    )
    validation: ValidationRequest
    """The issue + artefact paths to validate."""


class FlowDescribeRequest(BaseModel):
    """Describe what a canvas configuration would do without running it."""

    nodes: list[FlowNodeState]


class FlowDescribeResponse(BaseModel):
    provider: str
    llm_model: str
    embedding_model: str
    retrieval: dict[str, bool]
    reranker: bool
    confidentiality: bool
    langgraph: bool
    dspy_active: bool
    ragas_active: bool


# ---------------------------------------------------------------------------
# Articles — ingestão e busca em PDFs
# ---------------------------------------------------------------------------

class ArticleChunk(BaseModel):
    chunk_id: str
    doc_id: str
    chunk_index: int
    content: str
    topics: list[str] = Field(default_factory=list)


class ArticleIngestRequest(BaseModel):
    paths: list[str] = Field(description="Caminhos absolutos dos PDFs/TXTs a ingerir.")
    titles: list[str] | None = Field(
        default=None,
        description="Títulos opcionais, um por arquivo. Se omitido, usa o nome do arquivo.",
    )
    collection: str = Field(default="articles", description="Coleção Qdrant alvo.")


class ArticleIngestResponse(BaseModel):
    doc_id: str
    title: str
    path: str
    chunks_indexed: int
    topics: list[str] = Field(default_factory=list)
    ok: bool = True
    error: str | None = None


class ArticleSearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=8, ge=1, le=50)
    collection: str = "articles"


class ArticleSearchResult(BaseModel):
    chunk_id: str
    doc_id: str
    title: str
    chunk_index: int
    content: str
    topics: list[str] = Field(default_factory=list)
    score: float
    source_path: str = ""


class ArticleRelatedRequest(BaseModel):
    limit: int = Field(default=5, ge=1, le=20)
