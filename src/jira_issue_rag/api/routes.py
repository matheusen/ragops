from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile

from jira_issue_rag.core.config import Settings, get_settings
from jira_issue_rag.services.workflow import ValidationWorkflow
from jira_issue_rag.services.flow_runner import describe_flow, run_flow
from jira_issue_rag.services.article_store import ArticleStore
from jira_issue_rag.shared.models import (
    ArticleIngestRequest,
    ArticleIngestResponse,
    ArticleRelatedRequest,
    ArticleSearchRequest,
    ArticleSearchResult,
    ComparisonRequest,
    ComparisonResponse,
    DecisionResult,
    EvaluationRequest,
    EvaluationResponse,
    FlowDescribeRequest,
    FlowDescribeResponse,
    FlowRunRequest,
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


def get_article_store(settings: Settings = Depends(get_settings)) -> ArticleStore:
    return ArticleStore(settings=settings)

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


@router.post(
    "/validate/upload",
    response_model=DecisionResult,
    tags=["validation"],
    summary="Validar com anexos enviados",
    description=(
        "Recebe múltiplos arquivos via multipart/form-data junto com os metadados da issue. "
        "Os arquivos são salvos num diretório temporário e o pipeline de validação é executado normalmente. "
        "Suporta .txt, .csv, .xlsx, .pdf e outros formatos suportados pelo pipeline."
    ),
)
def validate_upload(
    issue_key: str = Form(...),
    summary: str = Form(...),
    description: str = Form(""),
    issue_type: str = Form("Bug"),
    priority: str | None = Form(None),
    provider: str | None = Form(None),
    prompt_name: str | None = Form(None),
    files: list[UploadFile] = File(...),
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    from jira_issue_rag.shared.models import IssueCanonical

    tmpdir = tempfile.mkdtemp(prefix="ragflow_upload_")
    try:
        for upload in files:
            dest = Path(tmpdir) / (upload.filename or "file")
            with dest.open("wb") as fh:
                shutil.copyfileobj(upload.file, fh)

        issue = IssueCanonical(
            issue_key=issue_key.upper().strip(),
            summary=summary,
            description=description,
            issue_type=issue_type,
            priority=priority or None,
        )
        req = FolderValidationRequest(
            issue=issue,
            folder_path=tmpdir,
            provider=provider or None,
        )
        if prompt_name:
            req_dict = req.model_dump()
            req_dict["prompt_name"] = prompt_name
            # re-build with prompt_name if the model supports it
        return workflow.validate_folder(req)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


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


# ---------------------------------------------------------------------------
# Audit results — leitura dos arquivos de auditoria
# ---------------------------------------------------------------------------

@router.get(
    "/audit/results",
    tags=["audit"],
    summary="Listar todos os resultados de auditoria",
    description="Varre `data/audit/` e retorna um resumo de cada resultado ordenado do mais recente para o mais antigo.",
)
def list_audit_results(
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    import orjson

    base = settings.audit_dir
    entries: list[dict] = []
    if not base.exists():
        return entries
    for issue_dir in sorted(base.iterdir()):
        if not issue_dir.is_dir():
            continue
        for filepath in sorted(issue_dir.glob("*.json"), reverse=True):
            try:
                raw = orjson.loads(filepath.read_bytes())
                decision = raw.get("decision", {})
                issue = raw.get("issue", {})
                timestamp = filepath.stem
                entries.append({
                    "id": f"{issue_dir.name}__{timestamp}",
                    "issue_key": issue_dir.name,
                    "timestamp": timestamp,
                    "summary": issue.get("summary", ""),
                    "classification": decision.get("classification", ""),
                    "is_bug": decision.get("is_bug", False),
                    "is_complete": decision.get("is_complete", False),
                    "ready_for_dev": decision.get("ready_for_dev", False),
                    "confidence": decision.get("confidence", 0.0),
                    "provider": decision.get("provider", ""),
                    "requires_human_review": decision.get("requires_human_review", False),
                    "financial_impact_detected": decision.get("financial_impact_detected", False),
                    "generated_at": decision.get("generated_at", ""),
                })
            except Exception:
                continue
    entries.sort(key=lambda e: e["generated_at"], reverse=True)
    return entries


@router.get(
    "/audit/results/{issue_key}/{timestamp}",
    tags=["audit"],
    summary="Buscar resultado de auditoria completo",
    description="Retorna o JSON completo de uma auditoria específica, incluindo issue, artefatos, evidências recuperadas e decisão.",
)
def get_audit_result(
    issue_key: str,
    timestamp: str,
    settings: Settings = Depends(get_settings),
) -> dict:
    import orjson
    from fastapi import HTTPException

    filepath = settings.audit_dir / issue_key / f"{timestamp}.json"
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"Audit not found: {issue_key}/{timestamp}")
    return orjson.loads(filepath.read_bytes())


# ---------------------------------------------------------------------------
# Pipeline Canvas — run-flow endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/run-flow",
    response_model=DecisionResult,
    tags=["canvas"],
    summary="Executar validação com configuração do canvas",
    description=(
        "Executa o pipeline de validação usando a configuração de nós exportada pelo **Pipeline Canvas** do dashboard. "
        "Cada nó ativo e sua variante escolhida são traduzidos em flags de runtime (`enable_reranker`, `default_provider`, modelos de embedding, etc.) "
        "sem necessidade de reiniciar o servidor. "
        "\n\n**Exemplo mínimo de nodes:**\n"
        "```json\n"
        '[{\"id\":\"provider\",\"active\":true,\"selected_variant\":\"GPT-4o\"},'
        '{\"id\":\"reranker\",\"active\":true,\"selected_variant\":null},'
        '{\"id\":\"neo4j\",\"active\":false,\"selected_variant\":null}]\n'
        "```"
    ),
)
def run_flow_endpoint(
    request: FlowRunRequest,
    settings: Settings = Depends(get_settings),
) -> DecisionResult:
    return run_flow(
        nodes=request.nodes,
        request=request.validation,
        base_settings=settings,
    )


@router.post(
    "/run-flow/describe",
    response_model=FlowDescribeResponse,
    tags=["canvas"],
    summary="Descrever configuração do canvas (dry-run)",
    description=(
        "Recebe a lista de nós do canvas e retorna um resumo legível de qual provider, modelo LLM, "
        "modelo de embedding e flags de retrieval seriam usados — sem executar nenhuma validação. "
        "Use para mostrar ao usuário o que o fluxo faz antes de rodar."
    ),
)
def describe_flow_endpoint(request: FlowDescribeRequest) -> FlowDescribeResponse:
    return FlowDescribeResponse(**describe_flow(request.nodes))


# ---------------------------------------------------------------------------
# Articles — ingestão vetorial + grafo de tópicos
# ---------------------------------------------------------------------------

@router.post(
    "/articles/ingest",
    response_model=list[ArticleIngestResponse],
    tags=["articles"],
    summary="Ingerir artigos (PDFs / TXTs)",
    description=(
        "Processa uma lista de arquivos PDF ou texto plano: extrai texto, divide em chunks, "
        "gera embeddings e indexa no Qdrant.\n\n"
        "Se `ENABLE_GRAPHRAG=true`, cria nós `(:Article)` e `(:Topic)` no Neo4j e "
        "recalcula arestas `SHARES_TOPIC` entre artigos com 2+ tópicos em comum.\n\n"
        "**Exemplo mínimo:**\n"
        "```json\n"
        '{\"paths\": [\"/data/artigos/transformer_review.pdf\", \"/data/artigos/rag_survey.pdf\"]}\n'
        "```"
    ),
)
def ingest_articles(
    request: ArticleIngestRequest,
    store: ArticleStore = Depends(get_article_store),
) -> list[ArticleIngestResponse]:
    return store.ingest(
        paths=request.paths,
        titles=request.titles,
        collection=request.collection,
    )


@router.post(
    "/articles/search",
    response_model=list[ArticleSearchResult],
    tags=["articles"],
    summary="Buscar nos artigos (semântica híbrida)",
    description=(
        "Busca em todos os artigos indexados combinando BM25 esparso + embeddings densos "
        "com Reciprocal Rank Fusion. Retorna os chunks mais relevantes com doc\_id, título, "
        "trecho de texto e tópicos extraídos.\n\n"
        "Use o resultado como contexto para `POST /run-flow` passando os `content` dos chunks "
        "no campo `description` da issue."
    ),
)
def search_articles(
    request: ArticleSearchRequest,
    store: ArticleStore = Depends(get_article_store),
) -> list[ArticleSearchResult]:
    return store.search(
        query=request.query,
        top_k=request.top_k,
        collection=request.collection,
    )


@router.post(
    "/articles/related/{doc_id}",
    response_model=list[dict],
    tags=["articles"],
    summary="Artigos relacionados por tópico",
    description=(
        "Retorna artigos com assuntos correlacionados ao `doc_id` informado.\n\n"
        "Com **Neo4j ativo**: navega arestas `SHARES\_TOPIC` pesadas pelo número de tópicos em comum.\n\n"
        "Sem Neo4j: similaridade vetorial entre chunks (fallback Qdrant).\n\n"
        "O `doc_id` é retornado na resposta de `/articles/ingest` e n `/articles/search`."
    ),
)
def related_articles(
    doc_id: str,
    request: ArticleRelatedRequest,
    store: ArticleStore = Depends(get_article_store),
) -> list[dict]:
    return store.related_articles(doc_id=doc_id, limit=request.limit)

