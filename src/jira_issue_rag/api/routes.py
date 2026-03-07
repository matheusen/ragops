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


@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["core"],
    summary="Health check",
    description="Retorna o status da aplicação, nome e ambiente. Use para verificar se o servidor está no ar.",
)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", app_name=settings.app_name, environment=settings.app_env)


@router.post(
    "/validate/issue",
    response_model=DecisionResult,
    tags=["validation"],
    summary="Validar issue (JSON)",
    description=(
        "Fluxo principal de validação. Recebe uma `IssueCanonical` e opcionalmente caminhos de artefatos. "
        "Executa o pipeline completo: recuperação vetorial → reranking → avaliação de regras → juiz LLM. "
        "\n\n**Providers disponíveis:** `mock`, `ollama`, `openai`, `gemini`"
    ),
)
def validate_issue(
    request: ValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    return workflow.validate_issue(request)


@router.post(
    "/validate/folder",
    response_model=DecisionResult,
    tags=["validation"],
    summary="Validar pasta de artefatos",
    description=(
        "Valida uma issue a partir de uma pasta local com artefatos (logs .txt, planilhas .csv/.xlsx, PDFs). "
        "Indexa os artefatos no pipeline antes da validação."
    ),
)
def validate_folder(
    request: FolderValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    return workflow.validate_folder(request)


@router.get(
    "/prompts",
    response_model=list[PromptInfoResponse],
    tags=["prompts"],
    summary="Listar prompts",
    description="Lista todos os prompts disponíveis em disco (arquivos `.md` na pasta `prompts/`). Retorna nome, modo e descrição.",
)
def list_prompts(
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> list[PromptInfoResponse]:
    return workflow.list_prompts()


@router.post(
    "/prompts/execute",
    response_model=PromptExecutionResponse,
    tags=["prompts"],
    summary="Executar prompt",
    description=(
        "Executa um prompt do catálogo de forma ad-hoc. "
        "Útil para testar prompts de análise de artigos, triagem ou qualquer modo `text`/`decision` "
        "sem precisar passar pelo pipeline completo de validação."
    ),
)
def execute_prompt(
    request: PromptExecutionRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> PromptExecutionResponse:
    return workflow.execute_prompt(request)


@router.post(
    "/jira/fetch/{issue_key}",
    response_model=JiraFetchResponse,
    tags=["jira"],
    summary="Buscar issue do Jira",
    description="Busca uma issue diretamente da API do Jira por `issue_key` (ex: `PAY-1421`). Requer `JIRA_BASE_URL`, `JIRA_USER_EMAIL` e `JIRA_API_TOKEN` no `.env`.",
)
def fetch_jira_issue(
    issue_key: str,
    request: JiraFetchRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> JiraFetchResponse:
    return workflow.fetch_jira_issue(issue_key=issue_key, request=request)


@router.post(
    "/jira/validate/{issue_key}",
    response_model=DecisionResult,
    tags=["jira"],
    summary="Buscar + validar issue do Jira",
    description="Combina `jira/fetch` e `validate/issue` em uma única chamada: busca a issue no Jira e executa o pipeline de validação completo.",
)
def validate_jira_issue(
    issue_key: str,
    request: JiraValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    return workflow.validate_jira_issue(issue_key=issue_key, request=request)


@router.post(
    "/index/issue",
    response_model=IndexResult,
    tags=["indexing"],
    summary="Indexar artefatos de issue",
    description="Indexa artefatos textuais (logs, planilhas, PDFs) no Qdrant para que fiquem disponíveis na recuperação vetorial das validações seguintes.",
)
def index_issue(
    request: IndexIssueRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> IndexResult:
    return workflow.index_issue(request)


@router.post(
    "/jira/index/{issue_key}",
    response_model=IndexResult,
    tags=["indexing"],
    summary="Buscar do Jira + indexar",
    description="Busca os anexos de uma issue do Jira e os indexa no Qdrant. Equivale a `jira/fetch` seguido de `index/issue`.",
)
def index_jira_issue(
    issue_key: str,
    request: JiraFetchRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> IndexResult:
    return workflow.index_jira_issue(issue_key=issue_key, request=request)


@router.post(
    "/evaluate/golden",
    response_model=EvaluationResponse,
    tags=["evaluation"],
    summary="Avaliar golden dataset",
    description=(
        "Executa o pipeline de validação contra o golden dataset e retorna métricas RAGAS-style: "
        "`classification_accuracy`, `faithfulness_proxy`, `context_precision_proxy`, etc. "
        "O campo `needs_improvement` indica se a acurácia ficou abaixo do `AUTO_IMPROVEMENT_THRESHOLD`."
    ),
)
def evaluate_golden(
    request: EvaluationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> EvaluationResponse:
    return workflow.evaluate_golden_dataset(request)


@router.post(
    "/evaluate/compare",
    response_model=ComparisonResponse,
    tags=["evaluation"],
    summary="Comparar cenários",
    description="Avalia múltiplos cenários (combinações de provider, reranker, Qdrant, etc.) sobre o golden dataset e gera relatório comparativo em disco.",
)
def evaluate_compare(
    request: ComparisonRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> ComparisonResponse:
    return workflow.compare_golden_dataset(request)


@router.post(
    "/evaluate/replay",
    response_model=ReplayResponse,
    tags=["evaluation"],
    summary="Replay de auditorias",
    description="Re-executa validações a partir dos arquivos de auditoria salvos em `data/audit/`. Útil para regredir resultados após mudanças de prompt ou provider.",
)
def evaluate_replay(
    request: ReplayRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> ReplayResponse:
    return workflow.replay_audit_dataset(request)

