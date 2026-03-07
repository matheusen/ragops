from __future__ import annotations

from fastapi import APIRouter, Depends

from jira_issue_rag.core.config import Settings, get_settings
from jira_issue_rag.services.workflow import ValidationWorkflow
from jira_issue_rag.shared.models import (
    ComparisonRequest,
    ComparisonResponse,
    DecisionResult,
    EvaluationRequest,
    EvaluationResponse,
    FolderValidationRequest,
    HealthResponse,
    IndexIssueRequest,
    IndexResult,
    JiraFetchRequest,
    JiraFetchResponse,
    JiraValidationRequest,
    PromptExecutionRequest,
    PromptExecutionResponse,
    PromptInfoResponse,
    ReplayRequest,
    ReplayResponse,
    ValidationRequest,
)

router = APIRouter()


def get_workflow(settings: Settings = Depends(get_settings)) -> ValidationWorkflow:
    return ValidationWorkflow(settings=settings)


@router.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", app_name=settings.app_name, environment=settings.app_env)


@router.post("/validate/issue", response_model=DecisionResult)
def validate_issue(
    request: ValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    return workflow.validate_issue(request)


@router.get("/prompts", response_model=list[PromptInfoResponse])
def list_prompts(
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> list[PromptInfoResponse]:
    return workflow.list_prompts()


@router.post("/prompts/execute", response_model=PromptExecutionResponse)
def execute_prompt(
    request: PromptExecutionRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> PromptExecutionResponse:
    return workflow.execute_prompt(request)


@router.post("/validate/folder", response_model=DecisionResult)
def validate_folder(
    request: FolderValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    return workflow.validate_folder(request)


@router.post("/jira/fetch/{issue_key}", response_model=JiraFetchResponse)
def fetch_jira_issue(
    issue_key: str,
    request: JiraFetchRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> JiraFetchResponse:
    return workflow.fetch_jira_issue(issue_key=issue_key, request=request)


@router.post("/jira/validate/{issue_key}", response_model=DecisionResult)
def validate_jira_issue(
    issue_key: str,
    request: JiraValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    return workflow.validate_jira_issue(issue_key=issue_key, request=request)


@router.post("/index/issue", response_model=IndexResult)
def index_issue(
    request: IndexIssueRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> IndexResult:
    return workflow.index_issue(request)


@router.post("/jira/index/{issue_key}", response_model=IndexResult)
def index_jira_issue(
    issue_key: str,
    request: JiraFetchRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> IndexResult:
    return workflow.index_jira_issue(issue_key=issue_key, request=request)


@router.post("/evaluate/golden", response_model=EvaluationResponse)
def evaluate_golden(
    request: EvaluationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> EvaluationResponse:
    return workflow.evaluate_golden_dataset(request)


@router.post("/evaluate/compare", response_model=ComparisonResponse)
def evaluate_compare(
    request: ComparisonRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> ComparisonResponse:
    return workflow.compare_golden_dataset(request)


@router.post("/evaluate/replay", response_model=ReplayResponse)
def evaluate_replay(
    request: ReplayRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> ReplayResponse:
    return workflow.replay_audit_dataset(request)

