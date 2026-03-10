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
    ready_for_dev_criteria_met: list[str] = Field(default_factory=list)
    ready_for_dev_blockers: list[str] = Field(default_factory=list)
    missing_items: list[str] = Field(default_factory=list)
    evidence_used: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    financial_impact_detected: bool = False
    confidence: float = 0.0
    requires_human_review: bool = False
    next_action: str = ""
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
    planner_quality_proxy: float = 0.0
    retrieval_diversity_proxy: float = 0.0
    loop_efficiency_proxy: float = 0.0
    trace_completeness: float = 0.0


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
    prompt_name: str | None = None

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


class ArticlePromptUploadResponse(BaseModel):
    title: str
    source_files: list[str] = Field(default_factory=list)
    prompt_execution: PromptExecutionResponse
    article_search: list["ArticleSearchResult"] = Field(default_factory=list)
    result_id: str | None = None
    runtime: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Pipeline Canvas — flow run
# ---------------------------------------------------------------------------

class FlowNodeState(BaseModel):
    """Minimal snapshot of one canvas node sent from the dashboard."""

    id: str
    active: bool = True
    selected_variant: str | None = None


class FlowArticleRunRequest(BaseModel):
    title: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    prompt_name: str = "article_analysis"
    provider: str | None = None
    search_query: str | None = None
    collection: str = "articles"
    retrieval_policy: str = "auto"
    tenant_id: str | None = None
    source_tags: list[str] = Field(default_factory=list)
    source_contains: str | None = None
    exact_match_required: bool = False
    enable_corrective_rag: bool = True
    top_k: int = Field(default=5, ge=1, le=12)
    related_doc_id: str | None = None
    related_limit: int = Field(default=5, ge=1, le=20)
    use_small_model_distillation: bool = True


class FlowRunRequest(BaseModel):
    nodes: list[FlowNodeState] = Field(
        description="Ordered list of active/inactive canvas nodes with their variant selections."
    )
    validation: ValidationRequest | None = None
    article: FlowArticleRunRequest | None = None


class FlowDescribeRequest(BaseModel):
    nodes: list[FlowNodeState]


class FlowDescribeResponse(BaseModel):
    flow_mode: str = "issue-validation"
    provider: str
    llm_model: str
    configured_provider: str
    configured_llm_model: str
    embedding_model: str
    retrieval: dict[str, bool]
    agentic: dict[str, bool]
    reranker: bool
    distiller: str
    planner_mode: str
    query_rewriter_mode: str
    reflection_mode: str
    policy_mode: str
    temporal_graphrag_mode: str
    confidentiality: bool
    langgraph: bool
    monkeyocr: bool
    dspy_active: bool
    ragas_active: bool
    supported_runtime_nodes: list[str] = Field(default_factory=list)
    ignored_nodes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class FlowDSPyOptimizationResult(BaseModel):
    active: bool = False
    optimizer: str | None = None
    provider: str | None = None
    triggered: bool = False
    skipped_reason: str | None = None
    dev_score: float | None = None
    exported_files: list[str] = Field(default_factory=list)
    history_file: str | None = None


class FlowRunResponse(BaseModel):
    flow_mode: str
    decision: DecisionResult | None = None
    prompt_execution: PromptExecutionResponse | None = None
    article_search: list["ArticleSearchResult"] = Field(default_factory=list)
    related_articles: list[dict[str, Any]] = Field(default_factory=list)
    article_graph_assessment: "GraphUsefulnessAssessment | None" = None
    article_distillation: "ArticleDistillation | None" = None
    article_benchmark: "ArticleBenchmarkResponse | None" = None
    runtime: dict[str, Any] = Field(default_factory=dict)
    dspy_optimization: FlowDSPyOptimizationResult | None = None
    warnings: list[str] = Field(default_factory=list)


class GraphInterruptInfo(BaseModel):
    interrupt_id: str
    value: dict[str, Any] = Field(default_factory=dict)


class ValidationExecutionResponse(BaseModel):
    thread_id: str
    interrupted: bool = False
    interrupts: list[GraphInterruptInfo] = Field(default_factory=list)
    decision: DecisionResult | None = None
    runtime: dict[str, Any] = Field(default_factory=dict)


class ValidationResumeRequest(BaseModel):
    thread_id: str
    resume: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Articles — ingestão e busca em PDFs
# ---------------------------------------------------------------------------

class ArticleChunk(BaseModel):
    chunk_id: str
    doc_id: str
    chunk_index: int
    content: str
    topics: list[str] = Field(default_factory=list)
    chunk_kind: str = "text"
    page_number: int | None = None
    section_title: str | None = None
    page_span: str | None = None
    table_title: str | None = None
    figure_caption: str | None = None
    local_context: str | None = None
    global_context: str | None = None


class ArticleIngestRequest(BaseModel):
    paths: list[str] = Field(description="Caminhos absolutos dos PDFs/TXTs a ingerir.")
    titles: list[str] | None = Field(
        default=None,
        description="Títulos opcionais, um por arquivo. Se omitido, usa o nome do arquivo.",
    )
    collection: str = Field(default="articles", description="Coleção Qdrant alvo.")
    tenant_id: str | None = None
    source_tags: list[str] = Field(default_factory=list)
    source_type: str | None = None


class ArticleIngestResponse(BaseModel):
    doc_id: str
    title: str
    path: str
    collection: str = "articles"
    tenant_id: str | None = None
    source_tags: list[str] = Field(default_factory=list)
    chunks_indexed: int
    topics: list[str] = Field(default_factory=list)
    canonical_title: str | None = None
    published_at: str | None = None
    published_year: int | None = None
    version_label: str | None = None
    extraction: dict[str, Any] = Field(default_factory=dict)
    chunk_stats: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    ok: bool = True
    error: str | None = None


class ArticleSearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=8, ge=1, le=50)
    collection: str = "articles"
    retrieval_policy: str = "auto"
    tenant_id: str | None = None
    source_tags: list[str] = Field(default_factory=list)
    source_contains: str | None = None
    exact_match_required: bool = False
    enable_corrective_rag: bool = True


class GraphUsefulnessAssessment(BaseModel):
    mode: Literal["vector-global", "graph-local", "graph-multi-hop", "graph-bridge"]
    score: float = 0.0
    rationale: str = ""
    signals: list[str] = Field(default_factory=list)


class ArticleEvidencePath(BaseModel):
    path_id: str
    relation: str
    nodes: list[str] = Field(default_factory=list)
    score: float = 0.0
    summary: str = ""


class ArticleDistillation(BaseModel):
    mode: str
    context_text: str
    key_entities: list[str] = Field(default_factory=list)
    key_topics: list[str] = Field(default_factory=list)
    evidence_paths: list[ArticleEvidencePath] = Field(default_factory=list)


class ArticleSearchResult(BaseModel):
    chunk_id: str
    doc_id: str
    title: str
    chunk_index: int
    content: str
    topics: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    score: float
    collection: str = "articles"
    tenant_id: str | None = None
    source_tags: list[str] = Field(default_factory=list)
    source_path: str = ""
    canonical_title: str | None = None
    published_at: str | None = None
    published_year: int | None = None
    version_label: str | None = None
    chunk_kind: str = "text"
    page_number: int | None = None
    section_title: str | None = None
    page_span: str | None = None
    table_title: str | None = None
    figure_caption: str | None = None
    local_context: str | None = None
    global_context: str | None = None
    retrieval_mode: str = "vector-global"
    graph_usefulness: GraphUsefulnessAssessment | None = None
    evidence_paths: list[ArticleEvidencePath] = Field(default_factory=list)


class ArticleRelatedRequest(BaseModel):
    limit: int = Field(default=5, ge=1, le=20)
    collection: str = "articles"
    tenant_id: str | None = None


class ArticleBenchmarkRequest(BaseModel):
    query: str
    top_k: int = Field(default=6, ge=1, le=20)
    collection: str = "articles"
    tenant_id: str | None = None
    source_tags: list[str] = Field(default_factory=list)
    source_contains: str | None = None
    exact_match_required: bool = False
    enable_corrective_rag: bool = True


class ArticleBenchmarkScenarioResult(BaseModel):
    mode: str
    retrieval_mode: str
    latency_ms: float = 0.0
    result_count: int = 0
    avg_score: float = 0.0
    precision_proxy: float = 0.0
    recall_proxy: float = 0.0
    faithfulness_proxy: float = 0.0
    top_doc_ids: list[str] = Field(default_factory=list)
    top_titles: list[str] = Field(default_factory=list)


class ProviderBenchmarkScenario(BaseModel):
    provider: str
    model: str
    estimated_latency_ms: int = 0
    estimated_relative_cost: str = ""
    local: bool = False


class ArticleBenchmarkResponse(BaseModel):
    query: str
    recommended_mode: str
    graph_usefulness: GraphUsefulnessAssessment
    scenarios: list[ArticleBenchmarkScenarioResult] = Field(default_factory=list)
    provider_options: list[ProviderBenchmarkScenario] = Field(default_factory=list)


class ArticleRetrievalEvaluationExample(BaseModel):
    query: str
    expected_doc_ids: list[str] = Field(default_factory=list)
    expected_title_contains: list[str] = Field(default_factory=list)
    expected_source_contains: list[str] = Field(default_factory=list)
    expected_page_numbers: list[int] = Field(default_factory=list)
    expected_chunk_kind: str | None = None
    must_include_terms: list[str] = Field(default_factory=list)
    collection: str = "articles"
    top_k: int = Field(default=8, ge=1, le=50)
    retrieval_policy: str = "auto"
    tenant_id: str | None = None
    source_tags: list[str] = Field(default_factory=list)
    source_contains: str | None = None
    exact_match_required: bool = False
    enable_corrective_rag: bool = True


class ArticleRetrievalEvaluationRequest(BaseModel):
    dataset_path: str | None = None
    examples: list[ArticleRetrievalEvaluationExample] = Field(default_factory=list)


class ArticleRetrievalEvaluationExampleResult(BaseModel):
    query: str
    retrieval_policy: str
    result_count: int = 0
    top_doc_ids: list[str] = Field(default_factory=list)
    top_titles: list[str] = Field(default_factory=list)
    top_page_numbers: list[int] = Field(default_factory=list)
    top_chunk_kinds: list[str] = Field(default_factory=list)
    doc_hit: bool = False
    page_hit: bool = False
    chunk_kind_hit: bool = False
    must_include_terms_hit: bool = False
    reciprocal_rank: float = 0.0
    avg_score: float = 0.0


class ArticleRetrievalEvaluationResponse(BaseModel):
    dataset_path: str | None = None
    total_examples: int = 0
    metrics: list[EvaluationMetric] = Field(default_factory=list)
    examples: list[ArticleRetrievalEvaluationExampleResult] = Field(default_factory=list)
