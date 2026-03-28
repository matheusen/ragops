from __future__ import annotations

import json as _json_mod
import shutil
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from jira_issue_rag.core.config import Settings, get_settings
from jira_issue_rag.services.workflow import ValidationWorkflow
from jira_issue_rag.services.flow_runner import (
    _build_article_runtime_payload,
    build_article_collection_title,
    build_article_prompt_packet,
    build_article_search_query,
    describe_flow,
    run_flow,
    write_article_analysis_audit,
)
from jira_issue_rag.services.article_store import ArticleStore
from jira_issue_rag.shared.models import (
    ArticlePromptUploadResponse,
    ArticleIngestRequest,
    ArticleIngestResponse,
    ArticleBenchmarkRequest,
    ArticleBenchmarkResponse,
    ArticleRetrievalEvaluationRequest,
    ArticleRetrievalEvaluationResponse,
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
    FlowRunResponse,
    FolderValidationRequest,
    HealthResponse,
    IndexIssueRequest,
    IndexResult,
    JiraFetchRequest,
    JiraFetchResponse,
    JiraValidationRequest,
    KnowledgeAskRequest,
    KnowledgeAskResponse,
    KnowledgeChunkResult,
    KnowledgeSearchResponse,
    KnowledgeDocNode,
    KnowledgeGraphEdge,
    KnowledgeGraphResponse,
    PromptExecutionRequest,
    PromptExecutionResponse,
    PromptInfoResponse,
    ReplayRequest,
    ReplayResponse,
    RoadmapConnection,
    RoadmapGenerateRequest,
    RoadmapGenerateResponse,
    RoadmapPhase,
    RoadmapTopicItem,
    ValidationExecutionResponse,
    ValidationResumeRequest,
    ValidationRequest,
    PdfPresignedResponse,
    PdfChunkItem,
    PdfChunksResponse,
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
        "\n\n**Providers disponíveis:** `mock`, `ollama`, `ollm`, `openai`, `gemini`"
    ),
)
def validate_issue(
    request: ValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    return workflow.validate_issue(request)


@router.post(
    "/validate/issue/interactive",
    response_model=ValidationExecutionResponse,
    tags=["validation"],
    summary="Validar issue com pause/resume humano",
    description=(
        "Executa a validação via LangGraph com suporte a `interrupt()/resume()`. "
        "Quando o policy loop exigir revisão humana, a resposta retorna `interrupted=true`, "
        "`thread_id` e o payload de contexto necessário para retomar a execução."
    ),
)
def validate_issue_interactive(
    request: ValidationRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> ValidationExecutionResponse:
    return workflow.validate_issue_interactive(request)


@router.post(
    "/validate/issue/interactive/resume",
    response_model=ValidationExecutionResponse,
    tags=["validation"],
    summary="Retomar validação interativa",
    description=(
        "Retoma uma thread interrompida do LangGraph usando o `thread_id` e um payload "
        "de revisão humana. O backend continua a partir do último checkpoint persistido."
    ),
)
def resume_issue_interactive(
    request: ValidationResumeRequest,
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> ValidationExecutionResponse:
    return workflow.resume_interactive_issue(request)


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
    issue_key: str | None = Form(None),
    summary: str | None = Form(None),
    description: str = Form(""),
    issue_type: str = Form("Bug"),
    priority: str | None = Form(None),
    provider: str | None = Form(None),
    prompt_name: str | None = Form(None),
    files: list[UploadFile] = File(...),
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> DecisionResult:
    import uuid
    from jira_issue_rag.shared.models import IssueCanonical

    tmpdir = tempfile.mkdtemp(prefix="ragflow_upload_")
    try:
        saved_names: list[str] = []
        for upload in files:
            fname = upload.filename or "file"
            dest = Path(tmpdir) / fname
            with dest.open("wb") as fh:
                shutil.copyfileobj(upload.file, fh)
            saved_names.append(fname)

        effective_key = (issue_key.upper().strip() if issue_key and issue_key.strip() else f"UPLOAD-{uuid.uuid4().hex[:6].upper()}")
        effective_summary = (summary.strip() if summary and summary.strip() else f"Upload: {', '.join(saved_names[:3])}{'...' if len(saved_names) > 3 else ''}")

        issue = IssueCanonical(
            issue_key=effective_key,
            summary=effective_summary,
            description=description,
            issue_type=issue_type,
            priority=priority or None,
        )
        req = FolderValidationRequest(
            issue=issue,
            folder_path=tmpdir,
            provider=provider or None,
            prompt_name=prompt_name or None,
        )
        return workflow.validate_folder(req)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@router.post(
    "/articles/analyze-upload",
    response_model=ArticlePromptUploadResponse,
    tags=["articles"],
    summary="Analisar artigo(s) enviados",
    description=(
        "Recebe um ou mais arquivos via multipart/form-data, extrai o texto e executa um prompt textual "
        "de análise de artigo. Ideal para PDFs, TXTs ou notas técnicas que não devem passar pelo pipeline de issue."
    ),
)
def analyze_article_upload(
    title: str | None = Form(None),
    provider: str | None = Form(None),
    prompt_name: str = Form("article_analysis"),
    search_query: str | None = Form(None),
    files: list[UploadFile] = File(...),
    workflow: ValidationWorkflow = Depends(get_workflow),
    store: ArticleStore = Depends(get_article_store),
    settings: Settings = Depends(get_settings),
) -> ArticlePromptUploadResponse:
    from types import SimpleNamespace

    tmpdir = tempfile.mkdtemp(prefix="ragflow_article_")
    try:
        saved_paths: list[Path] = []
        saved_names: list[str] = []
        source_documents: list[dict[str, object]] = []
        extraction_reports: list[dict[str, object]] = []
        for upload in files:
            fname = upload.filename or "file"
            dest = Path(tmpdir) / fname
            with dest.open("wb") as fh:
                shutil.copyfileobj(upload.file, fh)
            saved_paths.append(dest)
            saved_names.append(fname)
            extracted, extraction_report = store._extract_text_with_report(dest)
            extraction_reports.append(extraction_report)
            extracted = extracted.strip()
            if extracted:
                source_documents.append(
                    {
                        "file_name": fname,
                        "title": Path(fname).stem.replace("_", " ").replace("-", " ").strip(),
                        "text": extracted,
                        "char_count": len(extracted),
                    }
                )

        combined_text = "\n\n".join(str(doc["text"]) for doc in source_documents).strip()
        effective_title = build_article_collection_title(saved_names, title)
        ingest_titles = [effective_title] if len(saved_paths) == 1 else [path.stem.replace("_", " ").replace("-", " ").title() for path in saved_paths]
        ingest_results = store.ingest(
            paths=[str(path) for path in saved_paths],
            titles=ingest_titles,
            collection="articles",
        )
        upload_started = time.perf_counter()
        query_text = build_article_search_query(search_query, saved_names, effective_title)
        graph_assessment = store.assess_graph_usefulness(query_text) if query_text else None
        timings_ms: dict[str, float] = {}
        warnings: list[str] = []
        for result in ingest_results:
            warnings.extend(getattr(result, "warnings", []) or [])
            if getattr(result, "error", None):
                warnings.append(f"Ingest warning for {result.path}: {result.error}")
        missing_extractions = len(saved_names) - len(source_documents)
        if missing_extractions > 0:
            warnings.append(
                f"{missing_extractions} file(s) were uploaded but did not produce extracted text for the article corpus."
            )
        search_started = time.perf_counter()
        retrieval_top_k = min(max(6, len(saved_names) // 6), 10)
        article_search = store.search(query=query_text, top_k=retrieval_top_k) if query_text else []
        timings_ms["search"] = round((time.perf_counter() - search_started) * 1000, 2)
        if any(item.retrieval_mode == "corrective" for item in article_search):
            warnings.append("Corrective retrieval was triggered for this article query.")
        if query_text and store.retrieval_requires_human_review(query_text, article_search):
            warnings.append("Retrieval quality remained weak after routing; human review is recommended.")

        prompt_content = build_article_prompt_packet(
            title=effective_title,
            raw_content=combined_text,
            source_documents=source_documents,
            article_search=article_search,
            article_distillation=None,
        )

        prompt_started = time.perf_counter()
        try:
            prompt_execution = workflow.execute_prompt(
                PromptExecutionRequest(
                    prompt_name=prompt_name,
                    content=prompt_content,
                    provider=provider,
                    title=effective_title,
                    metadata={
                        "source_files": saved_names,
                        "source_path": str(saved_paths[0]) if len(saved_paths) == 1 else "",
                        "source_document_count": len(source_documents),
                        "source_documents": [
                            {
                                "file_name": str(doc["file_name"]),
                                "title": str(doc["title"]),
                                "char_count": int(doc["char_count"]),
                            }
                            for doc in source_documents
                        ],
                        "extraction_reports": extraction_reports,
                    },
                )
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        timings_ms["prompt"] = round((time.perf_counter() - prompt_started) * 1000, 2)
        timings_ms["total"] = round((time.perf_counter() - upload_started) * 1000, 2)
        runtime_payload = _build_article_runtime_payload(
            article_store=store,
            query_text=query_text,
            article_search=article_search,
            article_request=SimpleNamespace(
                title=effective_title,
                content=combined_text,
                metadata={
                    "source": str(saved_paths[0]) if len(saved_paths) == 1 else ", ".join(saved_names),
                    "source_files": saved_names,
                    "source_document_count": len(source_documents),
                    "source_documents": [
                        {
                            "file_name": str(doc["file_name"]),
                            "title": str(doc["title"]),
                            "char_count": int(doc["char_count"]),
                        }
                        for doc in source_documents
                    ],
                    "extraction_reports": extraction_reports,
                },
                prompt_name=prompt_name,
                collection="articles",
                retrieval_policy="auto",
                tenant_id=None,
                source_tags=[],
                source_contains=None,
                exact_match_required=False,
                enable_corrective_rag=True,
                top_k=retrieval_top_k,
                related_doc_id=None,
                related_limit=5,
                use_small_model_distillation=False,
            ),
            graph_assessment=graph_assessment,
            article_distillation=None,
            article_benchmark=None,
            prompt_result=prompt_execution,
            timings_ms=timings_ms,
            warnings=warnings,
            execution_path="run-upload",
        )

        audit_path = write_article_analysis_audit(
            settings=settings,
            article_request=SimpleNamespace(
                title=effective_title,
                content=combined_text,
                metadata={
                    "source": str(saved_paths[0]) if len(saved_paths) == 1 else ", ".join(saved_names),
                    "source_files": saved_names,
                    "source_document_count": len(source_documents),
                    "source_documents": [
                        {
                            "file_name": str(doc["file_name"]),
                            "title": str(doc["title"]),
                            "char_count": int(doc["char_count"]),
                            "excerpt": str(doc["text"])[:1600],
                        }
                        for doc in source_documents
                    ],
                    "extraction_reports": extraction_reports,
                },
                prompt_name=prompt_name,
                top_k=retrieval_top_k,
                related_doc_id=None,
                related_limit=5,
                collection="articles",
                retrieval_policy="auto",
                tenant_id=None,
                source_tags=[],
                source_contains=None,
                exact_match_required=False,
                enable_corrective_rag=True,
                use_small_model_distillation=False,
            ),
            prompt_result=prompt_execution,
            article_search=article_search,
            related_articles=[],
            query_text=query_text,
            warnings=warnings,
            runtime_summary={
                "flow_mode": "article-analysis",
                "execution_path": "run-upload",
                "configured_provider": provider or settings.default_provider,
                "configured_llm_model": prompt_execution.model,
                "embedding_model": (
                    settings.gemini_embedding_model
                    if (provider or settings.default_provider).lower() == "gemini"
                    else settings.openai_embedding_model
                ),
                "retrieval": {
                    "external": store._qdrant_available(),
                    "graphrag": False,
                    "cascade": False,
                },
                "agentic": {
                    "planner": False,
                    "query_rewriter": False,
                    "reflection_memory": False,
                    "policy_loop": False,
                    "temporal_graphrag": False,
                },
                "reranker": False,
                "distiller": "simple",
                "planner_mode": settings.planner_mode,
                "query_rewriter_mode": settings.query_rewriter_mode,
                "reflection_mode": settings.reflection_mode,
                "policy_mode": settings.policy_mode,
                "temporal_graphrag_mode": settings.temporal_graphrag_mode,
                "confidentiality": settings.confidentiality_mode,
                "langgraph": False,
                "monkeyocr": settings.enable_monkeyocr_pdf_parser,
                "dspy_active": False,
                "ragas_active": False,
                "supported_runtime_nodes": [
                    "article-upload",
                    "prompt-catalog",
                    *([ "article-search" ] if article_search else []),
                    *([ "qdrant" ] if store._qdrant_available() else []),
                ],
                "ignored_nodes": [],
                "warnings": [],
                **runtime_payload,
            },
            graph_assessment=graph_assessment,
        )
        audit_file = Path(audit_path)
        result_id = f"{audit_file.parent.name}__{audit_file.stem}"
        return ArticlePromptUploadResponse(
            title=effective_title,
            source_files=saved_names,
            prompt_execution=prompt_execution,
            article_search=article_search,
            result_id=result_id,
            runtime=runtime_payload,
            warnings=warnings,
        )
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
    try:
        return workflow.execute_prompt(request)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


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
    response_model=FlowRunResponse,
    tags=["canvas"],
    summary="Executar flow dinâmico com configuração do canvas",
    description=(
        "Executa o flow selecionado no **Pipeline Canvas** usando a configuração de nós exportada pelo dashboard. "
        "Cada nó ativo e sua variante escolhida são traduzidos em flags de runtime (`enable_reranker`, `default_provider`, modelos de embedding, etc.) "
        "sem necessidade de reiniciar o servidor. O dispatcher suporta cenários como `issue-validation` e `article-analysis`. "
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
) -> FlowRunResponse:
    return run_flow(
        nodes=request.nodes,
        request=request,
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
def describe_flow_endpoint(
    request: FlowDescribeRequest,
    settings: Settings = Depends(get_settings),
) -> FlowDescribeResponse:
    return FlowDescribeResponse(**describe_flow(request.nodes, base_settings=settings))


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
        tenant_id=request.tenant_id,
        source_tags=request.source_tags,
        source_type=request.source_type,
    )


@router.post(
    "/articles/search",
    response_model=list[ArticleSearchResult],
    tags=["articles"],
    summary="Buscar nos artigos (semântica híbrida)",
    description=(
        "Busca em todos os artigos indexados combinando BM25 esparso + embeddings densos "
        "com Reciprocal Rank Fusion. Retorna os chunks mais relevantes com doc_id, título, "
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
        retrieval_policy=request.retrieval_policy,
        tenant_id=request.tenant_id,
        source_tags=request.source_tags,
        source_contains=request.source_contains,
        exact_match_required=request.exact_match_required,
        enable_corrective_rag=request.enable_corrective_rag,
    )


@router.post(
    "/articles/benchmark",
    response_model=ArticleBenchmarkResponse,
    tags=["articles"],
    summary="Comparar modos de retrieval para artigos",
    description=(
        "Executa um benchmark operacional leve entre modos de retrieval para a query enviada. "
        "Retorna a recomendação do graph gate, tempos aproximados e os top docs por cenário "
        "para ajudar a decidir quando vale usar GraphRAG em vez de retrieval vetorial simples."
    ),
)
def benchmark_articles(
    request: ArticleBenchmarkRequest,
    store: ArticleStore = Depends(get_article_store),
) -> ArticleBenchmarkResponse:
    return store.benchmark_query_modes(
        query=request.query,
        top_k=request.top_k,
        collection=request.collection,
        tenant_id=request.tenant_id,
        source_tags=request.source_tags,
        source_contains=request.source_contains,
        exact_match_required=request.exact_match_required,
        enable_corrective_rag=request.enable_corrective_rag,
    )


@router.post(
    "/articles/evaluate",
    response_model=ArticleRetrievalEvaluationResponse,
    tags=["articles"],
    summary="Avaliar retrieval de artigos com dataset rotulado",
    description=(
        "Executa um benchmark reproduzível de retrieval para artigos a partir de um dataset JSON. "
        "Cada exemplo pode anotar documento esperado, página, tipo de chunk e termos obrigatórios."
    ),
)
def evaluate_articles(
    request: ArticleRetrievalEvaluationRequest,
    store: ArticleStore = Depends(get_article_store),
) -> ArticleRetrievalEvaluationResponse:
    return store.evaluate_retrieval(
        dataset_path=request.dataset_path,
        examples=request.examples,
    )


@router.post(
    "/articles/related/{doc_id}",
    response_model=list[dict],
    tags=["articles"],
    summary="Artigos relacionados por tópico",
    description=(
        "Retorna artigos com assuntos correlacionados ao `doc_id` informado.\n\n"
        "Com **Neo4j ativo**: navega arestas `SHARES_TOPIC` pesadas pelo número de tópicos em comum.\n\n"
        "Sem Neo4j: similaridade vetorial entre chunks (fallback Qdrant).\n\n"
        "O `doc_id` é retornado na resposta de `/articles/ingest` e n `/articles/search`."
    ),
)
def related_articles(
    doc_id: str,
    request: ArticleRelatedRequest,
    store: ArticleStore = Depends(get_article_store),
) -> list[dict]:
    return store.related_articles(
        doc_id=doc_id,
        limit=request.limit,
        tenant_id=request.tenant_id,
        collection=request.collection,
    )


# ---------------------------------------------------------------------------
# Knowledge Base — upload persistente, grafo e roadmap
# ---------------------------------------------------------------------------

@router.post(
    "/knowledge/upload",
    response_model=list[ArticleIngestResponse],
    tags=["knowledge"],
    summary="Upload de livros/PDFs para a base de conhecimento",
    description=(
        "Recebe múltiplos arquivos via multipart/form-data, salva em `data/knowledge/` "
        "e ingere no Qdrant (coleção `articles`). Ideal para construir uma base de conhecimento "
        "persistente de livros e PDFs para geração de roadmaps."
    ),
)
async def upload_knowledge_files(
    files: list[UploadFile] = File(...),
    store: ArticleStore = Depends(get_article_store),
    settings: Settings = Depends(get_settings),
) -> list[ArticleIngestResponse]:
    from pathlib import Path as _Path

    knowledge_dir = _Path("data/knowledge")
    knowledge_dir.mkdir(parents=True, exist_ok=True)

    saved_paths: list[str] = []
    titles: list[str] = []
    for upload in files:
        fname = upload.filename or "file"
        dest = knowledge_dir / fname
        with dest.open("wb") as fh:
            shutil.copyfileobj(upload.file, fh)
        saved_paths.append(str(dest))
        titles.append(_Path(fname).stem.replace("_", " ").replace("-", " ").title())

    return store.ingest(paths=saved_paths, titles=titles, collection="articles")


@router.get(
    "/knowledge/graph",
    response_model=KnowledgeGraphResponse,
    tags=["knowledge"],
    summary="Grafo da base de conhecimento",
    description=(
        "Retorna todos os documentos indexados no Qdrant como nós e as conexões entre eles "
        "baseadas em tópicos compartilhados. Use para renderizar o mindmap de conhecimento."
    ),
)
def knowledge_graph(
    settings: Settings = Depends(get_settings),
) -> KnowledgeGraphResponse:
    import httpx as _httpx
    from collections import defaultdict

    qdrant_url = (settings.qdrant_url or "http://localhost:6333").rstrip("/")
    all_points: list[dict] = []

    def _scroll_collection(client: "_httpx.Client", collection: str) -> None:
        offset = None
        while True:
            body: dict = {"limit": 250, "with_payload": True, "with_vector": False}
            if offset is not None:
                body["offset"] = offset
            resp = client.post(f"{qdrant_url}/collections/{collection}/points/scroll", json=body)
            if not resp.is_success:
                break
            data = resp.json()
            points = data.get("result", {}).get("points", [])
            all_points.extend(points)
            next_offset = data.get("result", {}).get("next_page_offset")
            if not next_offset or not points:
                break
            offset = next_offset

    try:
        with _httpx.Client(timeout=15.0) as client:
            _scroll_collection(client, "articles")
            _scroll_collection(client, "books")
    except Exception:
        pass

    # Group by doc_id
    doc_data: dict[str, dict] = defaultdict(lambda: {"title": "Unknown", "topics": set(), "chunk_count": 0, "source_path": "", "minio_key": None})
    for point in all_points:
        payload = point.get("payload", {})
        doc_id = payload.get("doc_id", "")
        if not doc_id:
            continue
        title = payload.get("title") or payload.get("canonical_title") or "Unknown"
        doc_data[doc_id]["title"] = title
        doc_data[doc_id]["topics"].update(payload.get("topics") or [])
        doc_data[doc_id]["chunk_count"] += 1
        if not doc_data[doc_id]["source_path"]:
            doc_data[doc_id]["source_path"] = payload.get("source_path", "")
        if not doc_data[doc_id]["minio_key"] and payload.get("minio_key"):
            doc_data[doc_id]["minio_key"] = payload["minio_key"]

    nodes = [
        KnowledgeDocNode(
            doc_id=doc_id,
            title=info["title"],
            topics=sorted(info["topics"]),
            chunk_count=info["chunk_count"],
            source_path=info["source_path"],
            minio_key=info.get("minio_key"),
        )
        for doc_id, info in doc_data.items()
    ]

    # Build edges from shared topics
    edges: list[KnowledgeGraphEdge] = []
    doc_ids = list(doc_data.keys())
    for i in range(len(doc_ids)):
        for j in range(i + 1, len(doc_ids)):
            a_topics = doc_data[doc_ids[i]]["topics"]
            b_topics = doc_data[doc_ids[j]]["topics"]
            shared = a_topics & b_topics
            if shared:
                max_topics = max(len(a_topics), len(b_topics), 1)
                edges.append(KnowledgeGraphEdge(
                    source=doc_ids[i],
                    target=doc_ids[j],
                    weight=round(len(shared) / max_topics, 3),
                    shared_topics=sorted(shared),
                ))

    # Build topic clusters
    topic_clusters: dict[str, list[str]] = defaultdict(list)
    for node in nodes:
        for topic in node.topics:
            topic_clusters[topic].append(node.doc_id)

    return KnowledgeGraphResponse(
        nodes=nodes,
        edges=edges,
        topic_clusters=dict(topic_clusters),
    )


# ── PDF — presigned URL e listagem de chunks com página ──────────────────────

def _get_minio(settings: Settings = Depends(get_settings)):
    from jira_issue_rag.services.minio_store import MinioStore
    return MinioStore(settings)


@router.get(
    "/pdf/{doc_id}/url",
    response_model=PdfPresignedResponse,
    tags=["knowledge"],
    summary="URL assinada para download do PDF original",
    description=(
        "Gera uma presigned URL temporária (padrão: 1 hora) para o PDF armazenado no MinIO. "
        "O frontend pode acrescentar `#page=N` para navegar ao ponto exato do chunk."
    ),
)
def pdf_presigned_url(
    doc_id: str,
    page: int | None = Query(default=None, description="Página destino — adicionada como fragment #page=N na URL"),
    expires: int = Query(default=3600, ge=60, le=86400),
    settings: Settings = Depends(get_settings),
    article_store: ArticleStore = Depends(get_article_store),
):
    from jira_issue_rag.services.minio_store import MinioStore
    minio = MinioStore(settings)

    # Busca o minio_key direto no Qdrant para o doc_id
    minio_key: str | None = None
    if settings.qdrant_url:
        try:
            resp = article_store._qdrant(
                "POST",
                f"/collections/articles/points/scroll",
                json_body={
                    "filter": {"must": [{"key": "doc_id", "match": {"value": doc_id}}]},
                    "limit": 1,
                    "with_payload": ["minio_key"],
                },
            )
            pts = (resp or {}).get("result", {}).get("points", [])
            if pts:
                minio_key = pts[0].get("payload", {}).get("minio_key")
        except Exception:
            pass

    if not minio_key:
        raise HTTPException(status_code=404, detail=f"PDF não encontrado no MinIO para doc_id={doc_id}")

    url = minio.pdf_url_at_page(minio_key, page=page, expires_seconds=expires)
    if not url:
        raise HTTPException(status_code=503, detail="MinIO indisponível")

    return PdfPresignedResponse(doc_id=doc_id, minio_key=minio_key, url=url, expires_seconds=expires)


@router.get(
    "/pdf/{doc_id}/chunks",
    response_model=PdfChunksResponse,
    tags=["knowledge"],
    summary="Lista chunks de um documento com número de página e URL do PDF",
    description=(
        "Retorna todos os chunks indexados para um documento, com `page_number`, preview de conteúdo "
        "e URL assinada apontando diretamente para a página exata no PDF original no MinIO."
    ),
)
def pdf_chunks(
    doc_id: str,
    collection: str = Query(default="articles"),
    settings: Settings = Depends(get_settings),
    article_store: ArticleStore = Depends(get_article_store),
):
    from jira_issue_rag.services.minio_store import MinioStore
    minio = MinioStore(settings)

    chunks: list[PdfChunkItem] = []
    title = doc_id
    minio_key: str | None = None

    if not settings.qdrant_url:
        raise HTTPException(status_code=503, detail="Qdrant não configurado")

    try:
        offset = None
        while True:
            body: dict = {
                "filter": {"must": [{"key": "doc_id", "match": {"value": doc_id}}]},
                "limit": 250,
                "with_payload": True,
            }
            if offset:
                body["offset"] = offset
            resp = article_store._qdrant("POST", f"/collections/{collection}/points/scroll", json_body=body)
            result = (resp or {}).get("result", {})
            pts = result.get("points", [])
            next_offset = result.get("next_page_offset")
            for pt in pts:
                p = pt.get("payload", {})
                if not minio_key and p.get("minio_key"):
                    minio_key = p["minio_key"]
                if p.get("title"):
                    title = p["title"]
                page_num = p.get("page_number")
                pdf_url = minio.pdf_url_at_page(minio_key, page=page_num) if minio_key else None
                chunks.append(PdfChunkItem(
                    chunk_id=pt.get("id", ""),
                    chunk_index=int(p.get("chunk_index", 0)),
                    chunk_kind=p.get("chunk_kind", "text"),
                    page_number=page_num,
                    section_title=p.get("section_title"),
                    content_preview=(p.get("content", "") or "")[:200],
                    pdf_url=pdf_url,
                ))
            if not next_offset:
                break
            offset = next_offset
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Sort by chunk_index
    chunks.sort(key=lambda c: c.chunk_index)

    # Back-fill pdf_url for chunks fetched before minio_key was found
    if minio_key:
        for c in chunks:
            if c.pdf_url is None:
                c.pdf_url = minio.pdf_url_at_page(minio_key, page=c.page_number)

    return PdfChunksResponse(doc_id=doc_id, title=title, minio_key=minio_key, chunks=chunks)


@router.post(
    "/roadmap/generate",
    response_model=RoadmapGenerateResponse,
    tags=["knowledge"],
    summary="Gerar roadmap de aprendizado/desenvolvimento",
    description=(
        "Busca os documentos mais relevantes da base de conhecimento para o objetivo informado "
        "e usa um LLM (OpenAI, Gemini ou Ollama) para gerar um roadmap estruturado em fases "
        "com tópicos, recursos e prerequisitos."
    ),
)
def generate_roadmap(
    request: RoadmapGenerateRequest,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> RoadmapGenerateResponse:
    import json as _json
    import httpx as _httpx
    from collections import defaultdict as _dd

    # ── 1. Catálogo completo: todos os docs únicos no Qdrant ──────────────────
    qdrant_url = (store.settings.qdrant_url or "http://localhost:6333").rstrip("/")
    catalog: dict[str, dict] = {}  # doc_id → {title, topics}

    def _scroll_into_catalog(client: "_httpx.Client", collection: str, extra_filter: dict | None = None) -> None:
        offset = None
        while True:
            body: dict = {"limit": 250, "with_payload": True, "with_vector": False}
            if extra_filter:
                body["filter"] = extra_filter
            if offset is not None:
                body["offset"] = offset
            resp = client.post(f"{qdrant_url}/collections/{collection}/points/scroll", json=body)
            if not resp.is_success:
                break
            data = resp.json()
            for pt in data.get("result", {}).get("points", []):
                pl = pt.get("payload", {})
                did = pl.get("doc_id", "")
                if not did:
                    continue
                if did not in catalog:
                    catalog[did] = {"title": pl.get("title") or did, "topics": set()}
                catalog[did]["topics"].update(pl.get("topics") or [])
            next_offset = data.get("result", {}).get("next_page_offset")
            if not next_offset or not data.get("result", {}).get("points"):
                break
            offset = next_offset

    try:
        with _httpx.Client(timeout=20.0) as _client:
            _scroll_into_catalog(_client, "articles", {"must": [{"key": "doc_type", "match": {"value": "article"}}]})
            _scroll_into_catalog(_client, "books")
    except Exception:
        pass

    # ── 2. Busca vetorial: chunks mais relevantes para o objetivo ─────────────
    query = request.context_query or request.goal
    top_k = max(request.top_k, 30)  # sempre pelo menos 30 chunks
    results_articles = store.search(query=query, top_k=top_k, collection="articles")
    results_books = store.search(query=query, top_k=top_k, collection="books")
    # Merge e deduplica por doc_id + prefixo do conteúdo, ordena por score
    _seen_chunks: set[str] = set()
    results = []
    for r in results_articles + results_books:
        _key = f"{r.doc_id}::{r.content[:80]}"
        if _key not in _seen_chunks:
            _seen_chunks.add(_key)
            results.append(r)
    results.sort(key=lambda r: r.score, reverse=True)
    results = results[:top_k]

    # ── 3. Monta contexto: catálogo + trechos relevantes ─────────────────────
    catalog_lines: list[str] = []
    for info in catalog.values():
        topics_str = ", ".join(sorted(info["topics"])[:8]) if info["topics"] else "sem tópicos"
        catalog_lines.append(f"- {info['title']} (tópicos: {topics_str})")

    chunk_parts: list[str] = []
    for r in results:
        snippet = r.content[:500].strip()
        chunk_parts.append(f"[{r.title}] {snippet}")

    context_text = ""
    if catalog_lines:
        context_text += "=== LIVROS/DOCUMENTOS DISPONÍVEIS NA BASE ===\n" + "\n".join(catalog_lines)
    if chunk_parts:
        context_text += "\n\n=== TRECHOS MAIS RELEVANTES ===\n" + "\n\n".join(chunk_parts)
    if not context_text.strip():
        context_text = "Nenhum documento disponivel na base de conhecimento."

    # Execute roadmap generation prompt
    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="roadmap_generate",
                content=context_text,
                provider=request.provider,
                title=request.goal,
                metadata={"goal": request.goal, "context_docs": len(results)},
            )
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    raw_output = exec_result.output_text.strip()

    # Parse JSON output
    phases: list[RoadmapPhase] = []
    connections: list[RoadmapConnection] = []
    title = request.goal
    goal = request.goal

    try:
        # Strip markdown code fences if present
        clean = raw_output
        if clean.startswith("```"):
            lines = clean.split("\n")
            clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        data = _json.loads(clean)
        title = data.get("title", request.goal)
        goal = data.get("goal", request.goal)
        for ph in data.get("phases", []):
            topics = [
                RoadmapTopicItem(
                    id=t.get("id", ""),
                    title=t.get("title", ""),
                    description=t.get("description", ""),
                    resources=t.get("resources", []),
                    prerequisites=t.get("prerequisites", []),
                )
                for t in ph.get("topics", [])
            ]
            phases.append(RoadmapPhase(
                id=ph.get("id", ""),
                title=ph.get("title", ""),
                duration=ph.get("duration", ""),
                description=ph.get("description", ""),
                topics=topics,
            ))
        for conn in data.get("connections", []):
            connections.append(RoadmapConnection(**{"from": conn.get("from", ""), "to": conn.get("to", ""), "label": conn.get("label", "")}))
    except Exception:
        pass

    # ── 4. Validação determinística das referências ───────────────────────────
    # Filtra resources de cada tópico para manter apenas títulos que existem
    # no catálogo da KB (correspondência parcial, case-insensitive).
    if catalog:
        catalog_titles_lower = [t.lower() for t in (info["title"] for info in catalog.values())]
        catalog_titles_orig  = [info["title"] for info in catalog.values()]
        for phase in phases:
            for topic in phase.topics:
                validated: list[str] = []
                for res in topic.resources:
                    res_l = res.lower()
                    # keep if any catalog title contains or is contained by the resource string
                    if any(res_l in ct or ct in res_l for ct in catalog_titles_lower):
                        # store the canonical catalog title (first match)
                        match = next(
                            (catalog_titles_orig[i] for i, ct in enumerate(catalog_titles_lower) if res_l in ct or ct in res_l),
                            res,
                        )
                        if match not in validated:
                            validated.append(match)
                topic.resources = validated

    return RoadmapGenerateResponse(
        title=title,
        goal=goal,
        phases=phases,
        connections=connections,
        provider=exec_result.provider,
        model=exec_result.model,
        context_docs_used=len(catalog) or len(results),
        raw_output=raw_output,
    )


# ---------------------------------------------------------------------------
# Roadmap — persistência no MongoDB + geração de exemplos Q&A
# ---------------------------------------------------------------------------

from jira_issue_rag.core.config import (
    MongoClient as _MongoClient,
    MONGODB_DB_NAME as _MONGO_DB,
    _resolve_mongodb_uri as _mongo_uri,
)

_ROADMAPS_COL   = "roadmaps"
_CHATS_COL      = "roadmap_chats"
_POSTS_COL      = "linkedin_posts"
_CRONS_COL      = "linkedin_crons"


def _roadmap_col():
    """Retorna a collection MongoDB de roadmaps."""
    uri = _mongo_uri()
    if not uri or _MongoClient is None:
        raise HTTPException(status_code=503, detail="MongoDB não disponível")
    client = _MongoClient(uri, serverSelectionTimeoutMS=3000)
    return client[_MONGO_DB][_ROADMAPS_COL]


def _chats_col():
    """Retorna a collection MongoDB de chats de roadmap."""
    uri = _mongo_uri()
    if not uri or _MongoClient is None:
        raise HTTPException(status_code=503, detail="MongoDB não disponível")
    client = _MongoClient(uri, serverSelectionTimeoutMS=3000)
    return client[_MONGO_DB][_CHATS_COL]


def _roadmap_graph() -> "RoadmapGraphService | None":
    """Retorna o serviço Neo4j de grafo de roadmap, ou None se não configurado."""
    from jira_issue_rag.core.config import get_settings as _gs
    from jira_issue_rag.services.roadmap_graph import RoadmapGraphService
    s = _gs()
    if not s.neo4j_url or not s.neo4j_password:
        return None
    try:
        return RoadmapGraphService(
            url=s.neo4j_url,
            user=s.neo4j_user,
            password=s.neo4j_password,
            database=s.neo4j_database,
        )
    except Exception:
        return None


def _posts_col():
    """Retorna a collection MongoDB de posts do LinkedIn."""
    uri = _mongo_uri()
    if not uri or _MongoClient is None:
        raise HTTPException(status_code=503, detail="MongoDB não disponível")
    client = _MongoClient(uri, serverSelectionTimeoutMS=3000)
    return client[_MONGO_DB][_POSTS_COL]


def _crons_col():
    """Retorna a collection MongoDB de crons do LinkedIn."""
    uri = _mongo_uri()
    if not uri or _MongoClient is None:
        raise HTTPException(status_code=503, detail="MongoDB não disponível")
    client = _MongoClient(uri, serverSelectionTimeoutMS=3000)
    return client[_MONGO_DB][_CRONS_COL]


def _strip_mongo_id(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _strip_json(raw: str) -> str:
    clean = raw.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return clean


@router.post(
    "/roadmap/save",
    tags=["knowledge"],
    summary="Salvar roadmap gerado no MongoDB",
)
def save_roadmap(roadmap: RoadmapGenerateResponse):
    col = _roadmap_col()
    rid = uuid.uuid4().hex[:10]
    payload = roadmap.model_dump(by_alias=True)
    payload["id"] = rid
    payload["created_at"] = datetime.now(timezone.utc).isoformat()
    payload["examples"] = {}          # {topic_id: {topic_title, generated_at, qa_pairs}}
    payload["node_positions"] = {}
    payload["expanded_nodes"] = []    # [{id, parent_id, title, description, color}]
    col.insert_one(payload)
    # Sync to Neo4j graph
    graph = _roadmap_graph()
    if graph:
        try:
            graph.sync_roadmap(payload)
        except Exception:
            pass
        finally:
            graph.close()
    return {"id": rid, "saved": True}


@router.get(
    "/roadmap/list",
    tags=["knowledge"],
    summary="Listar roadmaps salvos",
)
def list_roadmaps():
    col = _roadmap_col()
    docs = col.find(
        {},
        {"id": 1, "title": 1, "goal": 1, "provider": 1, "model": 1,
         "created_at": 1, "phases": 1},
        sort=[("created_at", -1)],
    )
    items = []
    for d in docs:
        phases = d.get("phases", [])
        items.append({
            "id": d.get("id", str(d.get("_id", ""))),
            "title": d.get("title", ""),
            "goal": d.get("goal", ""),
            "provider": d.get("provider", ""),
            "model": d.get("model", ""),
            "created_at": d.get("created_at", ""),
            "phase_count": len(phases),
            "topic_count": sum(len(p.get("topics", [])) for p in phases),
        })
    return {"roadmaps": items}


@router.get(
    "/roadmap/{roadmap_id}",
    tags=["knowledge"],
    summary="Carregar roadmap salvo",
)
def get_roadmap(roadmap_id: str):
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roadmap não encontrado")
    return _strip_mongo_id(doc)


@router.delete(
    "/roadmap/{roadmap_id}",
    tags=["knowledge"],
    summary="Deletar roadmap salvo",
)
def delete_roadmap(roadmap_id: str):
    col = _roadmap_col()
    col.delete_one({"id": roadmap_id})
    graph = _roadmap_graph()
    if graph:
        try:
            graph.delete_roadmap(roadmap_id)
        except Exception:
            pass
        finally:
            graph.close()
    return {"deleted": True}


@router.patch(
    "/roadmap/{roadmap_id}/positions",
    tags=["knowledge"],
    summary="Salvar posições dos nós do mindmap",
)
def update_roadmap_positions(roadmap_id: str, body: dict):
    col = _roadmap_col()
    col.update_one(
        {"id": roadmap_id},
        {"$set": {"node_positions": body.get("positions", {})}},
    )
    return {"saved": True}


@router.patch(
    "/roadmap/{roadmap_id}/expansions",
    tags=["knowledge"],
    summary="Salvar nós expandidos do mindmap",
)
def update_roadmap_expansions(roadmap_id: str, body: dict):
    col = _roadmap_col()
    col.update_one(
        {"id": roadmap_id},
        {"$set": {"expanded_nodes": body.get("expanded_nodes", [])}},
        upsert=False,
    )
    return {"saved": True}


@router.post(
    "/roadmap/{roadmap_id}/generate-examples",
    tags=["knowledge"],
    summary="Gerar exemplos Q&A para um tópico do roadmap",
)
def generate_topic_examples(
    roadmap_id: str,
    body: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    """
    Busca chunks relevantes na KB e usa LLM para gerar 5 pares Q&A sobre o tópico.
    Salva no MongoDB e retorna os pares gerados.
    """
    topic_id          = body.get("topic_id", "")
    topic_title       = body.get("topic_title", "")
    topic_description = body.get("topic_description", "")
    provider          = body.get("provider", "gemini")
    model             = body.get("model", None)
    append            = bool(body.get("append", False))

    if not topic_title:
        raise HTTPException(status_code=400, detail="topic_title é obrigatório")

    # Constrói query enriquecida com descrição para melhor recall
    search_query = f"{topic_title}. {topic_description}" if topic_description else topic_title

    # Busca chunks relevantes nas duas collections
    _SCORE_MIN = 0.45
    _r_art  = store.search(query=search_query, top_k=10, collection="articles")
    _r_book = store.search(query=search_query, top_k=10, collection="books")
    _seen: set[str] = set()
    all_results = []
    for r in _r_art + _r_book:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen:
            _seen.add(_k)
            all_results.append(r)
    all_results.sort(key=lambda r: r.score, reverse=True)
    relevant = [r for r in all_results if (r.score or 0.0) >= _SCORE_MIN]
    # fallback: se nenhum chunk passou o threshold, usa os 5 melhores
    if not relevant:
        relevant = all_results[:5]

    chunk_parts = [
        f"[{r.title}] (pág {r.page_number or '?'})\n{r.content[:600].strip()}"
        for r in relevant
    ]
    content = "\n\n".join(chunk_parts) if chunk_parts else "Sem conteúdo disponível na base."

    # Títulos reais dos documentos usados — para validação posterior
    valid_source_titles: set[str] = {r.title for r in relevant if r.title}

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="topic_examples",
                title=topic_title,
                content=content,
                provider=provider,
                model=model,
                metadata={"description": topic_description},
            )
        )
        raw = exec_result.output_text or ""
        parsed = _json_mod.loads(_strip_json(raw))
        qa_pairs = parsed.get("qa_pairs", [])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar exemplos: {exc}") from exc

    # Valida sources: remove títulos que não estão nos chunks reais usados
    for pair in qa_pairs:
        if isinstance(pair.get("sources"), list):
            pair["sources"] = [
                s for s in pair["sources"]
                if any(s.lower() in vt.lower() or vt.lower() in s.lower() for vt in valid_source_titles)
            ]

    col = _roadmap_col()

    # Se append=True, acumula os pares novos com os existentes
    if append:
        doc = col.find_one({"id": roadmap_id}) or {}
        existing_pairs = (doc.get("examples") or {}).get(topic_id, {}).get("qa_pairs", [])
        qa_pairs = existing_pairs + qa_pairs

    example_entry = {
        "topic_title": topic_title,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provider": exec_result.provider,
        "model": exec_result.model,
        "qa_pairs": qa_pairs,
    }
    col.update_one(
        {"id": roadmap_id},
        {"$set": {f"examples.{topic_id}": example_entry}},
        upsert=False,
    )

    return {
        "topic_id": topic_id,
        "topic_title": topic_title,
        "qa_pairs": qa_pairs,
        "provider": exec_result.provider,
        "model": exec_result.model,
    }


@router.post(
    "/roadmap/{roadmap_id}/generate-code-examples",
    tags=["knowledge"],
    summary="Gerar exemplos de código para um tópico do roadmap",
)
def generate_code_examples(
    roadmap_id: str,
    body: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    """Busca chunks relevantes na KB e usa LLM para gerar 3 exemplos de código sobre o tópico."""
    topic_id          = body.get("topic_id", "")
    topic_title       = body.get("topic_title", "")
    topic_description = body.get("topic_description", "")
    provider          = body.get("provider", "gemini")
    model             = body.get("model", None)

    if not topic_title:
        raise HTTPException(status_code=400, detail="topic_title é obrigatório")

    search_query = f"{topic_title}. {topic_description}" if topic_description else topic_title
    _r_art  = store.search(query=search_query, top_k=6, collection="articles")
    _r_book = store.search(query=search_query, top_k=6, collection="books")
    _seen2: set[str] = set()
    results = []
    for r in _r_art + _r_book:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen2:
            _seen2.add(_k)
            results.append(r)
    results.sort(key=lambda r: r.score, reverse=True)
    chunk_parts = [
        f"[{r.title}] (pág {r.page_number or '?'})\n{r.content[:600].strip()}"
        for r in results[:8]
    ]
    content = "\n\n".join(chunk_parts) if chunk_parts else "Sem conteúdo disponível na base."

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="topic_code_examples",
                title=topic_title,
                content=content,
                provider=provider,
                model=model,
                metadata={"description": topic_description},
            )
        )
        raw = exec_result.output_text or ""
        parsed = _json_mod.loads(_strip_json(raw))
        code_examples = parsed.get("code_examples", [])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar exemplos de código: {exc}") from exc

    code_entry = {
        "topic_title": topic_title,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provider": exec_result.provider,
        "model": exec_result.model,
        "code_examples": code_examples,
    }
    col = _roadmap_col()
    col.update_one(
        {"id": roadmap_id},
        {"$set": {f"code_examples.{topic_id}": code_entry}},
        upsert=False,
    )

    return {
        "topic_id": topic_id,
        "topic_title": topic_title,
        "code_examples": code_examples,
        "provider": exec_result.provider,
        "model": exec_result.model,
    }


@router.post(
    "/roadmap/{roadmap_id}/regenerate-qa-pair",
    tags=["knowledge"],
    summary="Regenerar um par Q&A específico de um tópico",
)
def regenerate_qa_pair(
    roadmap_id: str,
    body: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    """Gera um novo par Q&A e substitui o item no índice indicado."""
    topic_id          = body.get("topic_id", "")
    topic_title       = body.get("topic_title", "")
    topic_description = body.get("topic_description", "")
    pair_index        = int(body.get("pair_index", 0))
    provider          = body.get("provider", "gemini")
    model             = body.get("model", None)

    if not topic_title:
        raise HTTPException(status_code=400, detail="topic_title é obrigatório")

    search_query = f"{topic_title}. {topic_description}" if topic_description else topic_title
    _SCORE_MIN = 0.45
    _ra = store.search(query=search_query, top_k=8, collection="articles")
    _rb = store.search(query=search_query, top_k=8, collection="books")
    _seen3: set[str] = set()
    all_results = []
    for r in _ra + _rb:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen3:
            _seen3.add(_k); all_results.append(r)
    all_results.sort(key=lambda r: r.score, reverse=True)
    relevant = [r for r in all_results if (r.score or 0.0) >= _SCORE_MIN] or all_results[:5]
    valid_source_titles: set[str] = {r.title for r in relevant if r.title}

    chunk_parts = [
        f"[{r.title}] (pág {r.page_number or '?'})\n{r.content[:600].strip()}"
        for r in relevant
    ]
    content = "\n\n".join(chunk_parts) if chunk_parts else "Sem conteúdo disponível na base."

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="qa_single",
                title=topic_title,
                content=content,
                provider=provider,
                model=model,
                metadata={"description": topic_description},
            )
        )
        raw = exec_result.output_text or ""
        new_pair = _json_mod.loads(_strip_json(raw))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao regenerar par Q&A: {exc}") from exc

    # Valida sources
    if isinstance(new_pair.get("sources"), list):
        new_pair["sources"] = [
            s for s in new_pair["sources"]
            if any(s.lower() in vt.lower() or vt.lower() in s.lower() for vt in valid_source_titles)
        ]

    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id}) or {}
    qa_pairs: list = (doc.get("examples") or {}).get(topic_id, {}).get("qa_pairs", [])

    if pair_index < len(qa_pairs):
        qa_pairs[pair_index] = new_pair
    else:
        qa_pairs.append(new_pair)

    col.update_one(
        {"id": roadmap_id},
        {"$set": {f"examples.{topic_id}.qa_pairs": qa_pairs}},
        upsert=False,
    )

    return {"pair_index": pair_index, "new_pair": new_pair, "qa_pairs": qa_pairs}


@router.post(
    "/roadmap/{roadmap_id}/regenerate-code-example",
    tags=["knowledge"],
    summary="Regenerar um exemplo de código específico de um tópico",
)
def regenerate_code_example(
    roadmap_id: str,
    body: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    """Gera um novo exemplo de código e substitui o item no índice indicado."""
    topic_id          = body.get("topic_id", "")
    topic_title       = body.get("topic_title", "")
    topic_description = body.get("topic_description", "")
    example_index     = int(body.get("example_index", 0))
    provider          = body.get("provider", "gemini")
    model             = body.get("model", None)

    if not topic_title:
        raise HTTPException(status_code=400, detail="topic_title é obrigatório")

    search_query = f"{topic_title}. {topic_description}" if topic_description else topic_title
    _ra2 = store.search(query=search_query, top_k=6, collection="articles")
    _rb2 = store.search(query=search_query, top_k=6, collection="books")
    _seen4: set[str] = set()
    results = []
    for r in _ra2 + _rb2:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen4:
            _seen4.add(_k); results.append(r)
    results.sort(key=lambda r: r.score, reverse=True)
    chunk_parts = [
        f"[{r.title}] (pág {r.page_number or '?'})\n{r.content[:600].strip()}"
        for r in results[:8]
    ]
    content = "\n\n".join(chunk_parts) if chunk_parts else "Sem conteúdo disponível na base."

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="code_single",
                title=topic_title,
                content=content,
                provider=provider,
                model=model,
                metadata={"description": topic_description},
            )
        )
        raw = exec_result.output_text or ""
        new_example = _json_mod.loads(_strip_json(raw))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao regenerar código: {exc}") from exc

    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id}) or {}
    code_examples: list = (doc.get("code_examples") or {}).get(topic_id, {}).get("code_examples", [])

    if example_index < len(code_examples):
        code_examples[example_index] = new_example
    else:
        code_examples.append(new_example)

    col.update_one(
        {"id": roadmap_id},
        {"$set": {f"code_examples.{topic_id}.code_examples": code_examples}},
        upsert=False,
    )

    return {"example_index": example_index, "new_example": new_example, "code_examples": code_examples}


@router.post(
    "/roadmap/{roadmap_id}/code-interact",
    tags=["knowledge"],
    summary="Interagir com trecho de código selecionado (explicar / estender / novo arquivo)",
)
def code_interact(
    roadmap_id: str,
    body: dict,
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    """Ações interativas sobre um trecho de código: explain | extend | new_file."""
    action      = body.get("action", "explain")
    topic_title = body.get("topic_title", "")
    content     = body.get("content", "")   # full_code + snippet, pre-built by frontend
    provider    = body.get("provider", "gemini")
    model       = body.get("model", None)

    prompt_map = {
        "explain":  "code_explain",
        "extend":   "code_extend",
        "new_file": "code_new_file",
    }
    if action not in prompt_map:
        raise HTTPException(status_code=400, detail=f"Ação inválida: {action}")

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name=prompt_map[action],
                content=content,
                title=topic_title,
                provider=provider,
            )
        )
        raw = exec_result.output_text or ""
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro na interação: {exc}") from exc

    return {
        "action":   action,
        "output":   raw,
        "provider": exec_result.provider,
        "model":    exec_result.model,
    }


@router.post(
    "/roadmap/{roadmap_id}/review",
    tags=["knowledge"],
    summary="Revisar roadmap: corrige referências e melhora descrições via LLM",
)
def review_roadmap(
    roadmap_id: str,
    body: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    """Valida e corrige os resources de cada tópico com base no catálogo real da KB.

    Envia ao LLM apenas IDs + títulos + resources atuais (payload mínimo)
    e aplica as correções de volta nas fases sem reescrever o roadmap inteiro.
    """
    import httpx as _httpx

    provider = body.get("provider", "gemini")

    # Load roadmap
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roadmap não encontrado")
    existing_phases: list[dict] = doc.get("phases", [])

    # Build KB catalog via Qdrant scroll
    qdrant_url = (store.settings.qdrant_url or "http://localhost:6333").rstrip("/")
    catalog_titles: list[str] = []
    try:
        with _httpx.Client(timeout=30.0) as _client:
            offset = None
            seen: set[str] = set()
            while True:
                scroll_body: dict = {
                    "limit": 250, "with_payload": True, "with_vector": False,
                    "filter": {"must": [{"key": "doc_type", "match": {"value": "article"}}]},
                }
                if offset is not None:
                    scroll_body["offset"] = offset
                resp = _client.post(f"{qdrant_url}/collections/articles/points/scroll", json=scroll_body)
                if not resp.is_success:
                    break
                data = resp.json()
                for pt in data.get("result", {}).get("points", []):
                    pl = pt.get("payload", {})
                    did = pl.get("doc_id", "")
                    title = pl.get("title") or did
                    if did and did not in seen:
                        seen.add(did)
                        catalog_titles.append(title)
                next_offset = data.get("result", {}).get("next_page_offset")
                if not next_offset or not data.get("result", {}).get("points"):
                    break
                offset = next_offset
    except Exception:
        pass

    catalog_text = (
        "Nenhum documento disponível."
        if not catalog_titles
        else "\n".join(f"- {t}" for t in catalog_titles)
    )

    # Build lean topics list (only id + title + current resources — no descriptions)
    lean_topics: list[dict] = []
    for phase in existing_phases:
        for topic in phase.get("topics", []):
            lean_topics.append({
                "id":               topic.get("id", ""),
                "title":            topic.get("title", ""),
                "current_resources": topic.get("resources", []),
            })

    topics_json = _json_mod.dumps(lean_topics, ensure_ascii=False)

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="roadmap_validate_refs",
                content=catalog_text,
                title=doc.get("title", ""),
                provider=provider,
                metadata={"topics_json": topics_json},
            )
        )
        raw = exec_result.output_text or ""
        result = _json_mod.loads(_strip_json(raw))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro na revisão: {exc}") from exc

    # Apply updates: patch only the resources field per topic id
    updates_map: dict[str, list[str]] = {
        u["id"]: u["resources"]
        for u in result.get("updates", [])
        if "id" in u and "resources" in u
    }

    updated_phases = []
    for phase in existing_phases:
        updated_topics = []
        for topic in phase.get("topics", []):
            tid = topic.get("id", "")
            if tid in updates_map:
                topic = {**topic, "resources": updates_map[tid]}
            updated_topics.append(topic)
        updated_phases.append({**phase, "topics": updated_topics})

    col.update_one(
        {"id": roadmap_id},
        {"$set": {"phases": updated_phases, "reviewed_at": datetime.now(timezone.utc).isoformat()}},
    )

    updated_doc = col.find_one({"id": roadmap_id})
    return _strip_mongo_id(updated_doc)


@router.post(
    "/roadmap/{roadmap_id}/save-interaction",
    tags=["knowledge"],
    summary="Salvar interação (pergunta/resposta) vinculada ao roadmap",
)
def save_roadmap_interaction(roadmap_id: str, body: dict):
    """Persiste uma pergunta e resposta feita pelo usuário no painel de conhecimento."""
    col = _roadmap_col()
    interaction = {
        "asked_at": datetime.now(timezone.utc).isoformat(),
        "query":    body.get("query", ""),
        "answer":   body.get("answer", ""),
        "sources":  body.get("sources", []),
        "context":  body.get("context", ""),   # topicTitle
    }
    col.update_one(
        {"id": roadmap_id},
        {"$push": {"interactions": interaction}},
        upsert=False,
    )
    return {"saved": True}


@router.post(
    "/roadmap/{roadmap_id}/expand",
    tags=["knowledge"],
    summary="Expandir roadmap existente com novas fases via LLM",
)
def expand_roadmap(
    roadmap_id: str,
    body: dict,
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    """Carrega o roadmap, pede ao LLM novas fases e mescla no MongoDB sem perder as existentes."""
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roadmap não encontrado")

    expansion_request = body.get("expansion", "").strip()
    provider = body.get("provider", "gemini")
    model = body.get("model", None)

    if not expansion_request:
        raise HTTPException(status_code=400, detail="expansion é obrigatório")

    # Build context: summarise existing phases so the LLM doesn't repeat them
    existing_phases = doc.get("phases", [])
    phase_lines = []
    for p in existing_phases:
        topics_str = ", ".join(t.get("title", "") for t in p.get("topics", []))
        phase_lines.append(f"- Fase '{p.get('title', '')}' ({p.get('duration', '')}): {topics_str}")
    title_context = (
        f"Roadmap: {doc.get('title', doc.get('goal', ''))}\n\n"
        f"Fases existentes:\n" + "\n".join(phase_lines)
    )

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="roadmap_expand",
                title=title_context,
                content=expansion_request,
                provider=provider,
                model=model,
            )
        )
        raw = exec_result.output_text or ""
        parsed = _json_mod.loads(_strip_json(raw))
        new_phases = parsed.get("phases", [])
        new_connections = parsed.get("connections", [])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao expandir: {exc}") from exc

    if not new_phases:
        raise HTTPException(status_code=422, detail="LLM não retornou novas fases. Tente reformular a solicitação.")

    updated_phases = existing_phases + new_phases
    existing_conns = doc.get("connections", [])
    col.update_one(
        {"id": roadmap_id},
        {"$set": {"phases": updated_phases, "connections": existing_conns + new_connections}},
    )

    updated_doc = col.find_one({"id": roadmap_id})
    return _strip_mongo_id(updated_doc)


@router.patch(
    "/roadmap/{roadmap_id}/edit-node",
    tags=["knowledge"],
    summary="Editar campos de um tópico ou fase do roadmap",
)
def edit_roadmap_node(roadmap_id: str, body: dict):
    """Atualiza title/description/resources/duration de um nó identificado pelo id."""
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roadmap não encontrado")

    node_id = body.get("node_id", "")
    updates = body.get("updates", {})

    if not node_id:
        raise HTTPException(status_code=400, detail="node_id é obrigatório")

    phases = doc.get("phases", [])
    changed = False

    for phase in phases:
        if phase.get("id") == node_id:
            for f in ("title", "description", "duration"):
                if f in updates:
                    phase[f] = updates[f]
            changed = True
            break
        for topic in phase.get("topics", []):
            if topic.get("id") == node_id:
                for f in ("title", "description", "resources"):
                    if f in updates:
                        topic[f] = updates[f]
                changed = True
                break
        if changed:
            break

    if not changed:
        raise HTTPException(status_code=404, detail="Nó não encontrado no roadmap")

    col.update_one({"id": roadmap_id}, {"$set": {"phases": phases}})
    return {"updated": True}


@router.post(
    "/roadmap/{roadmap_id}/linkedin-post",
    tags=["knowledge"],
    summary="Gerar post LinkedIn com base no roadmap",
)
def generate_linkedin_post(
    roadmap_id: str,
    body: dict,
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roadmap não encontrado")

    provider      = body.get("provider", "gemini")
    topic_focus   = (body.get("topic_focus") or "").strip()
    custom_prompt = (body.get("custom_prompt") or "").strip()

    title  = doc.get("title", doc.get("goal", ""))
    phases = doc.get("phases", [])

    # If a specific topic is focused, extract its description for richer content
    focused_desc = ""
    for p in phases:
        for t in p.get("topics", []):
            if t.get("title", "") == topic_focus:
                focused_desc = t.get("description", "")
                break

    phase_lines = []
    for p in phases:
        topics = ", ".join(t.get("title", "") for t in p.get("topics", []))
        phase_lines.append(f"- {p.get('title', '')} ({p.get('duration', '')}): {topics}")
    roadmap_summary = "\n".join(phase_lines)

    if topic_focus:
        content_for_prompt = (
            f"Objetivo do roadmap: {doc.get('goal', '')}\n\n"
            f"Tópico em foco: {topic_focus}\n"
            f"{('Descrição: ' + focused_desc) if focused_desc else ''}\n\n"
            f"Roadmap completo:\n{roadmap_summary}"
        )
    else:
        content_for_prompt = f"{doc.get('goal', '')}\n\nFases:\n{roadmap_summary}"

    custom_instructions_text = (
        f"Instruções adicionais do autor: {custom_prompt}" if custom_prompt else ""
    )

    try:
        result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="linkedin_post",
                content=content_for_prompt,
                provider=provider,
                title=title,
                metadata={
                    "topic_focus": topic_focus or "roadmap completo",
                    "custom_instructions": custom_instructions_text,
                },
            )
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    post_text = result.output_text.strip()
    now = datetime.now(timezone.utc).isoformat()
    post_id = uuid.uuid4().hex[:10]

    posts = _posts_col()
    posts.insert_one({
        "id": post_id,
        "roadmap_id": roadmap_id,
        "roadmap_title": title,
        "content": post_text,
        "topic_focus": topic_focus or "Geral",
        "custom_prompt": custom_prompt,
        "provider": provider,
        "created_at": now,
    })

    return {"post": post_text, "post_id": post_id}


@router.get(
    "/roadmap/{roadmap_id}/linkedin-posts",
    tags=["knowledge"],
    summary="Listar posts LinkedIn salvos do roadmap",
)
def list_linkedin_posts(roadmap_id: str):
    posts = _posts_col()
    docs = posts.find({"roadmap_id": roadmap_id}, sort=[("created_at", -1)])
    return {"posts": [
        {
            "id": d.get("id", str(d["_id"])),
            "content": d.get("content", ""),
            "topic_focus": d.get("topic_focus", "Geral"),
            "custom_prompt": d.get("custom_prompt", ""),
            "provider": d.get("provider", ""),
            "created_at": d.get("created_at", ""),
        }
        for d in docs
    ]}


@router.get(
    "/linkedin-posts",
    tags=["knowledge"],
    summary="Listar todos os posts LinkedIn salvos",
)
def list_all_linkedin_posts():
    posts = _posts_col()
    docs = posts.find({}, sort=[("created_at", -1)], limit=100)
    return {"posts": [
        {
            "id": d.get("id", str(d["_id"])),
            "roadmap_id": d.get("roadmap_id", ""),
            "roadmap_title": d.get("roadmap_title", ""),
            "content": d.get("content", ""),
            "topic_focus": d.get("topic_focus", "Geral"),
            "custom_prompt": d.get("custom_prompt", ""),
            "provider": d.get("provider", ""),
            "created_at": d.get("created_at", ""),
        }
        for d in docs
    ]}


@router.delete(
    "/linkedin-posts/{post_id}",
    tags=["knowledge"],
    summary="Deletar post LinkedIn salvo",
)
def delete_linkedin_post(post_id: str):
    posts = _posts_col()
    posts.delete_one({"id": post_id})
    return {"ok": True}


# ── LinkedIn Cron Jobs ─────────────────────────────────────────────────────────

@router.post(
    "/roadmap/{roadmap_id}/linkedin-cron",
    tags=["knowledge"],
    summary="Criar agendamento automático de post LinkedIn",
)
def create_linkedin_cron(roadmap_id: str, body: dict):
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roadmap não encontrado")

    from jira_issue_rag.services.linkedin_scheduler import schedule_cron, next_run_from_schedule

    cron_id     = uuid.uuid4().hex[:10]
    schedule    = body.get("schedule", "weekly")   # daily | weekly | cron:<expr>
    prompt      = (body.get("prompt") or "").strip()
    topic_focus = (body.get("topic_focus") or "").strip()
    provider    = body.get("provider", "gemini")
    now         = datetime.now(timezone.utc).isoformat()

    cron_doc = {
        "id": cron_id,
        "roadmap_id": roadmap_id,
        "roadmap_title": doc.get("title", ""),
        "schedule": schedule,
        "prompt": prompt,
        "topic_focus": topic_focus,
        "provider": provider,
        "active": True,
        "next_run_at": next_run_from_schedule(schedule),
        "last_run_at": None,
        "created_at": now,
    }

    crons = _crons_col()
    crons.insert_one(cron_doc)

    # Register in live scheduler
    schedule_cron(cron_id, schedule)

    return {"id": cron_id, "ok": True}


@router.get(
    "/roadmap/{roadmap_id}/linkedin-crons",
    tags=["knowledge"],
    summary="Listar agendamentos de post LinkedIn do roadmap",
)
def list_linkedin_crons(roadmap_id: str):
    crons = _crons_col()
    docs = crons.find({"roadmap_id": roadmap_id}, sort=[("created_at", -1)])
    return {"crons": [
        {
            "id": d.get("id", str(d["_id"])),
            "schedule": d.get("schedule", ""),
            "prompt": d.get("prompt", ""),
            "topic_focus": d.get("topic_focus", ""),
            "provider": d.get("provider", ""),
            "active": d.get("active", True),
            "next_run_at": d.get("next_run_at"),
            "last_run_at": d.get("last_run_at"),
            "created_at": d.get("created_at", ""),
        }
        for d in docs
    ]}


@router.delete(
    "/linkedin-crons/{cron_id}",
    tags=["knowledge"],
    summary="Deletar agendamento de post LinkedIn",
)
def delete_linkedin_cron(cron_id: str):
    from jira_issue_rag.services.linkedin_scheduler import remove_cron
    crons = _crons_col()
    crons.delete_one({"id": cron_id})
    remove_cron(cron_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Knowledge Images — servir imagens extraídas de PDFs
# ---------------------------------------------------------------------------

@router.get(
    "/knowledge/image",
    tags=["knowledge"],
    summary="Servir imagem extraída de PDF",
    description=(
        "Retorna o arquivo de imagem salvo em `data/knowledge/images/` dado o caminho "
        "armazenado no campo `image_path` do chunk Qdrant. "
        "Use `?path=<caminho_absoluto>` para buscar a imagem."
    ),
)
def serve_knowledge_image(
    path: str = Query(..., description="Caminho absoluto do arquivo de imagem"),
) -> FileResponse:
    image_path = Path(path)
    if not image_path.exists():
        raise HTTPException(status_code=404, detail=f"Imagem não encontrada: {path}")
    # Segurança: apenas arquivos dentro de data/knowledge/images/
    try:
        image_path.resolve().relative_to(Path("data/knowledge/images").resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Acesso negado: caminho fora de data/knowledge/images/")
    suffix = image_path.suffix.lower()
    media_type_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif"}
    media_type = media_type_map.get(suffix, "application/octet-stream")
    return FileResponse(str(image_path), media_type=media_type)


@router.get(
    "/knowledge/images/{doc_id}",
    tags=["knowledge"],
    summary="Listar imagens de um documento",
    description="Retorna a lista de imagens extraídas e salvas para um `doc_id` específico.",
)
def list_knowledge_images(doc_id: str) -> list[dict]:
    images_dir = Path("data/knowledge/images") / doc_id
    if not images_dir.exists():
        return []
    _IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    return [
        {
            "filename": f.name,
            "path": str(f),
            "size_bytes": f.stat().st_size,
            "url": f"/api/v1/knowledge/image?path={f}",
        }
        for f in sorted(images_dir.iterdir())
        if f.suffix.lower() in _IMG_EXT
    ]


@router.get(
    "/knowledge/search",
    response_model=KnowledgeSearchResponse,
    tags=["knowledge"],
    summary="Buscar chunks na base de conhecimento",
    description="Busca vetorial híbrida (dense + BM25) nas coleções `articles` e `books`. Retorna chunks rankeados por relevância.",
)
def knowledge_search(
    q: str = Query(..., description="Consulta de busca ou pergunta"),
    top_k: int = Query(default=12, ge=1, le=50),
    store: ArticleStore = Depends(get_article_store),
) -> KnowledgeSearchResponse:
    r_articles = store.search(query=q, top_k=top_k, collection="articles")
    r_books = store.search(query=q, top_k=top_k, collection="books")
    _seen: set[str] = set()
    merged: list = []
    for r in r_articles + r_books:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen:
            _seen.add(_k)
            merged.append(r)
    merged.sort(key=lambda r: r.score, reverse=True)
    results = merged[:top_k]
    chunks = [
        KnowledgeChunkResult(
            title=r.title or "",
            doc_id=r.doc_id or "",
            page_number=r.page_number,
            section_title=r.section_title,
            content=r.content,
            score=r.score,
            chunk_index=r.chunk_index,
            chunk_kind=r.chunk_kind or "text",
            image_path=r.image_path,
            topics=r.topics or [],
            minio_key=r.minio_key,
            chunk_id=r.chunk_id,
        )
        for r in results
    ]
    return KnowledgeSearchResponse(query=q, results=chunks)


@router.post(
    "/knowledge/ask",
    response_model=KnowledgeAskResponse,
    tags=["knowledge"],
    summary="Perguntar à base de conhecimento (RAG)",
    description=(
        "Busca os chunks mais relevantes e usa um LLM para gerar uma resposta objetiva "
        "com citações das fontes. Retorna a resposta e a lista de fontes usadas."
    ),
)
def knowledge_ask(
    request: KnowledgeAskRequest,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
) -> KnowledgeAskResponse:
    r_articles = store.search(query=request.query, top_k=request.top_k, collection="articles")
    r_books = store.search(query=request.query, top_k=request.top_k, collection="books")
    _seen: set[str] = set()
    merged: list = []
    for r in r_articles + r_books:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen:
            _seen.add(_k)
            merged.append(r)
    merged.sort(key=lambda r: r.score, reverse=True)
    results = merged[:request.top_k]

    context_parts = [
        f"[{r.title}, pág {r.page_number or '?'}]\n{r.content[:600]}"
        for r in results
    ]
    context_text = "\n\n---\n\n".join(context_parts) if context_parts else "Nenhum documento disponível na base de conhecimento."

    answer = ""
    provider_used = request.provider
    model_used = ""
    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="knowledge_ask",
                content=context_text,
                provider=request.provider,
                title=request.query,
            )
        )
        answer = exec_result.output_text.strip()
        provider_used = exec_result.provider
        model_used = exec_result.model
    except Exception:
        answer = ""

    sources = [
        KnowledgeChunkResult(
            title=r.title or "",
            doc_id=r.doc_id or "",
            page_number=r.page_number,
            section_title=r.section_title,
            content=r.content,
            score=r.score,
            chunk_index=r.chunk_index,
            chunk_kind=r.chunk_kind or "text",
            image_path=r.image_path,
            topics=r.topics or [],
            minio_key=r.minio_key,
            chunk_id=r.chunk_id,
        )
        for r in results
    ]
    return KnowledgeAskResponse(
        query=request.query,
        answer=answer,
        sources=sources,
        provider=provider_used,
        model=model_used,
    )


# ── Topic expand ──────────────────────────────────────────────────────────────

@router.post(
    "/roadmap/expand-topic",
    tags=["knowledge"],
    summary="Expandir tópico em subtópicos/conceitos-chave",
)
def expand_topic(
    request: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    import json as _json

    topic_title: str = request.get("topic_title", "")
    topic_description: str = request.get("topic_description", "")
    roadmap_goal: str = request.get("roadmap_goal", "")
    provider: str = request.get("provider", "gemini")
    top_k: int = int(request.get("top_k", 8))

    # Busca contexto relevante nas duas collections
    r_articles = store.search(query=topic_title, top_k=top_k, collection="articles")
    r_books    = store.search(query=topic_title, top_k=top_k, collection="books")
    _seen: set[str] = set()
    merged = []
    for r in r_articles + r_books:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen:
            _seen.add(_k)
            merged.append(r)
    merged.sort(key=lambda r: r.score, reverse=True)
    context = "\n\n".join(f"[{r.title}] {r.content[:400]}" for r in merged[:top_k])

    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="expand_topic",
                content=context or "Sem contexto disponível na base.",
                provider=provider,
                title=topic_title,
                metadata={"title": topic_title, "description": topic_description, "roadmap_goal": roadmap_goal},
            )
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    raw = exec_result.output_text.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        data = _json.loads(raw)
        subtopics = data.get("subtopics", [])
    except Exception:
        raise HTTPException(status_code=502, detail=f"LLM retornou JSON inválido: {raw[:200]}")

    # Sync expanded subtopics to Neo4j
    if saved_id := request.get("roadmap_id", ""):
        graph = _roadmap_graph()
        if graph:
            try:
                for st in subtopics:
                    graph.sync_expanded_node(saved_id, {
                        "id": st.get("id", ""),
                        "parent_id": request.get("parent_topic_id", ""),
                        "title": st.get("title", ""),
                        "description": st.get("description", ""),
                        "color": request.get("color", ""),
                    })
            except Exception:
                pass
            finally:
                graph.close()

    return {"subtopics": subtopics}


# ── Code execution via Piston ─────────────────────────────────────────────────

@router.post(
    "/code/execute",
    tags=["knowledge"],
    summary="Executar código em sandbox (Piston)",
)
def code_execute(
    request: dict,
    settings: Settings = Depends(get_settings),
):
    import httpx as _httpx

    code: str = request.get("code", "")
    language: str = request.get("language", "java").lower()
    stdin: str = request.get("stdin", "")

    _lang_map = {
        "java": "java", "python": "python", "python3": "python",
        "javascript": "javascript", "js": "javascript",
        "typescript": "typescript", "ts": "typescript",
        "kotlin": "kotlin", "go": "go", "rust": "rust",
        "c": "c", "cpp": "c++", "c++": "c++", "bash": "bash", "sh": "bash",
    }
    runtime = _lang_map.get(language, language)
    piston_url = (getattr(settings, "piston_url", None) or "http://localhost:2000").rstrip("/")

    version = "*"
    try:
        with _httpx.Client(timeout=8.0) as client:
            rt_resp = client.get(f"{piston_url}/api/v2/runtimes")
            if rt_resp.is_success:
                for rt in rt_resp.json():
                    if rt.get("language") == runtime:
                        version = rt.get("version", "*")
                        break
    except Exception:
        pass

    filename = "Main.java" if runtime == "java" else f"main.{language}"
    payload = {
        "language": runtime, "version": version,
        "files": [{"name": filename, "content": code}],
        "stdin": stdin, "run_timeout": 10000, "compile_timeout": 15000,
    }

    try:
        with _httpx.Client(timeout=30.0) as client:
            resp = client.post(f"{piston_url}/api/v2/execute", json=payload)
            if not resp.is_success:
                raise HTTPException(status_code=502, detail=f"Piston error: {resp.text[:300]}")
            result = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Piston indisponível: {exc}") from exc

    run = result.get("run", {})
    compile_ = result.get("compile", {})
    return {
        "stdout": run.get("stdout", ""),
        "stderr": run.get("stderr", "") or compile_.get("stderr", ""),
        "exit_code": run.get("code", compile_.get("code", -1)),
        "language": runtime,
        "version": version,
    }


# ---------------------------------------------------------------------------
# Roadmap Chat — conversa com tutor sobre o roadmap
# ---------------------------------------------------------------------------

def _build_roadmap_context(doc: dict) -> str:
    """Serializa o roadmap completo (fases, tópicos e subtópicos expandidos) para o prompt."""
    lines = [
        f"Título: {doc.get('title', '')}",
        f"Objetivo: {doc.get('goal', '')}",
        "",
    ]

    # Index expanded nodes by parent_id for quick lookup
    expanded_by_parent: dict[str, list[dict]] = {}
    for exp in (doc.get("expanded_nodes") or []):
        pid = exp.get("parent_id", "")
        if pid:
            expanded_by_parent.setdefault(pid, []).append(exp)

    for phase in (doc.get("phases") or []):
        lines.append(f"Fase: {phase.get('title','')} ({phase.get('duration','')})")
        for topic in (phase.get("topics") or []):
            tid = topic.get("id", "")
            lines.append(f"  • {topic.get('title','')}: {topic.get('description','')}")
            for sub in expanded_by_parent.get(tid, []):
                lines.append(f"    ◦ {sub.get('title','')}: {sub.get('description','')}")
    return "\n".join(lines)


@router.post(
    "/roadmap/{roadmap_id}/chat",
    tags=["knowledge"],
    summary="Enviar mensagem ao tutor do roadmap",
)
def roadmap_chat(
    roadmap_id: str,
    body: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    message:      str  = body.get("message", "").strip()
    provider:     str  = body.get("provider", "gemini")
    node_context: dict = body.get("node_context") or {}

    if not message:
        raise HTTPException(status_code=400, detail="message é obrigatório")

    node_title = node_context.get("title", "")
    node_desc  = node_context.get("description", "")
    node_ctx_text = (
        f'[Falando sobre o tópico: "{node_title}"]\n{node_desc}'.strip()
        if node_title else ""
    )
    question_for_llm = f"{node_ctx_text}\n\n{message}".strip() if node_ctx_text else message

    # ── Carrega roadmap ────────────────────────────────────────────────────────
    col = _roadmap_col()
    roadmap_doc = col.find_one({"id": roadmap_id}) or {}
    roadmap_context = _build_roadmap_context(roadmap_doc)
    roadmap_goal = roadmap_doc.get("goal", "")

    # ── Carrega histórico da conversa ─────────────────────────────────────────
    chats = _chats_col()
    chat_doc = chats.find_one({"roadmap_id": roadmap_id}) or {}
    history: list[dict] = chat_doc.get("messages", [])

    # ── Contexto do grafo Neo4j ────────────────────────────────────────────────
    # Se há nó pinado: vizinhança detalhada do nó.
    # Se não há nó pinado: contexto estrutural completo do roadmap (todos os nós).
    graph_context = ""
    graph = _roadmap_graph()
    if graph:
        try:
            _nc_id = node_context.get("id", "")
            if _nc_id:
                graph_context = graph.get_node_neighbourhood(roadmap_id, _nc_id)
            else:
                graph_context = graph.get_full_roadmap_context(roadmap_id)
        except Exception:
            pass
        finally:
            graph.close()
    if graph_context and not node_title:
        # Full graph replaces the MongoDB-serialized context (more complete)
        roadmap_context = graph_context
    elif graph_context and node_title:
        question_for_llm = f"{graph_context}\n\n{question_for_llm}"

    # ── Busca contexto da KB (articles + books) ───────────────────────────────
    search_q = f"{roadmap_goal} {node_title} {message}"[:300]
    _ra = store.search(query=search_q, top_k=6, collection="articles")
    _rb = store.search(query=search_q, top_k=6, collection="books")
    _seen: set[str] = set()
    kb_results = []
    for r in _ra + _rb:
        _k = f"{r.doc_id}::{r.content[:80]}"
        if _k not in _seen:
            _seen.add(_k)
            kb_results.append(r)
    kb_results.sort(key=lambda r: r.score, reverse=True)
    content = "\n\n".join(
        f"[{r.title}]\n{r.content[:500].strip()}" for r in kb_results[:8]
    ) or "Sem contexto disponível na base."

    # ── Monta histórico em texto (últimas 10 trocas) ──────────────────────────
    history_text = "\n".join(
        f"{'Estudante' if m['role'] == 'user' else 'Tutor'}: {m['content']}"
        for m in history[-20:]
    ) or "(conversa nova)"

    # ── Chama LLM ─────────────────────────────────────────────────────────────
    try:
        exec_result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="roadmap_chat",
                content=content,
                provider=provider,
                title=message,
                metadata={
                    "roadmap_context": roadmap_context,
                    "history": history_text,
                    "question": question_for_llm,
                },
            )
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    response_text = exec_result.output_text.strip()
    now = datetime.now(timezone.utc).isoformat()

    # ── Salva histórico ───────────────────────────────────────────────────────
    new_messages = history + [
        {"role": "user",      "content": message,       "timestamp": now},
        {"role": "assistant", "content": response_text, "timestamp": now},
    ]
    chats.update_one(
        {"roadmap_id": roadmap_id},
        {"$set": {
            "roadmap_id": roadmap_id,
            "messages":   new_messages,
            "updated_at": now,
        }},
        upsert=True,
    )

    return {"response": response_text, "messages": new_messages}


@router.get(
    "/roadmap/{roadmap_id}/chat",
    tags=["knowledge"],
    summary="Buscar histórico do chat do roadmap",
)
def get_roadmap_chat(roadmap_id: str):
    chats = _chats_col()
    doc = chats.find_one({"roadmap_id": roadmap_id}) or {}
    return {"messages": doc.get("messages", [])}


@router.delete(
    "/roadmap/{roadmap_id}/chat",
    tags=["knowledge"],
    summary="Limpar histórico do chat do roadmap",
)
def clear_roadmap_chat(roadmap_id: str):
    chats = _chats_col()
    chats.update_one(
        {"roadmap_id": roadmap_id},
        {"$set": {"messages": [], "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@router.get(
    "/roadmap/{roadmap_id}/progress",
    tags=["knowledge"],
    summary="Retorna o progresso (checklist) do roadmap",
)
def get_roadmap_progress(roadmap_id: str):
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id}) or {}
    return {"progress": doc.get("progress", {})}


@router.patch(
    "/roadmap/{roadmap_id}/progress",
    tags=["knowledge"],
    summary="Salva o progresso (checklist) do roadmap",
)
def update_roadmap_progress(roadmap_id: str, body: dict):
    col = _roadmap_col()
    col.update_one(
        {"id": roadmap_id},
        {"$set": {"progress": body.get("progress", {})}},
        upsert=True,
    )
    return {"ok": True}


@router.get(
    "/settings/default-provider",
    tags=["settings"],
    summary="Retorna o provider LLM padrão configurado",
)
def get_default_provider(settings: Settings = Depends(get_settings)):
    return {"provider": settings.default_provider}


# ── IEEE Paper ────────────────────────────────────────────────────────────────

def _build_ieee_pdf(paper_text: str, title: str, authors: str) -> bytes:
    """Renders paper_text as a two-column IEEE-style PDF using reportlab."""
    import re as _re
    from io import BytesIO

    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer
    from reportlab.platypus.flowables import BalancedColumns

    buf = BytesIO()
    PAGE_W, _ = letter
    MARGIN = 0.75 * inch

    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )

    base = getSampleStyleSheet()

    S_TITLE = ParagraphStyle("IEEETitle", parent=base["Title"],
        fontSize=16, leading=20, spaceAfter=4,
        alignment=TA_CENTER, fontName="Times-Bold")
    S_AUTHOR = ParagraphStyle("IEEEAuthor", parent=base["Normal"],
        fontSize=10, leading=14, spaceAfter=10,
        alignment=TA_CENTER, fontName="Times-Italic")
    S_SECTION = ParagraphStyle("IEEESection", parent=base["Normal"],
        fontSize=10, leading=13, spaceBefore=10, spaceAfter=3,
        fontName="Times-Bold", alignment=TA_CENTER)
    S_SUBSECTION = ParagraphStyle("IEEESubsec", parent=base["Normal"],
        fontSize=9, leading=12, spaceBefore=6, spaceAfter=2,
        fontName="Times-BoldItalic", alignment=TA_LEFT)
    S_BODY = ParagraphStyle("IEEEBody", parent=base["Normal"],
        fontSize=9, leading=12, spaceAfter=4,
        fontName="Times-Roman", alignment=TA_JUSTIFY, firstLineIndent=18)
    S_BODY_NI = ParagraphStyle("IEEEBodyNI", parent=S_BODY, firstLineIndent=0)
    S_REF = ParagraphStyle("IEEERef", parent=base["Normal"],
        fontSize=8, leading=10, spaceAfter=3,
        fontName="Times-Roman", alignment=TA_LEFT,
        leftIndent=14, firstLineIndent=-14)
    S_KW = ParagraphStyle("IEEEKw", parent=base["Normal"],
        fontSize=9, leading=11, spaceAfter=6,
        fontName="Times-Italic", alignment=TA_JUSTIFY)

    story: list = []

    # ── Full-width title block ─────────────────────────────────────────────
    story.append(Paragraph(title or "IEEE Paper", S_TITLE))
    if authors:
        story.append(Paragraph(authors, S_AUTHOR))
    story.append(HRFlowable(width="100%", thickness=1,
                             color=colors.black, spaceAfter=6))

    # ── Parse paper text into column flowables ─────────────────────────────
    # Patterns
    sec_re  = _re.compile(
        r"^((?:[IVX]+)\.\s+\S.+|ABSTRACT|Abstract|KEYWORDS|Keywords|REFERENCES|References)",
        _re.IGNORECASE,
    )
    subsec_re = _re.compile(
        r"^([A-Z]\.|[0-9]+\))\s+\S.+",
    )
    ref_item_re = _re.compile(r"^\[\d+\]\s+")

    col_content: list = []
    in_refs = False
    in_keywords = False

    lines = paper_text.splitlines()
    i = 0

    def flush_para(buf_lines: list[str], is_refs: bool, is_kw: bool) -> None:
        text = " ".join(buf_lines).strip()
        if not text:
            return
        if is_refs:
            # Each [N] starts a new reference entry
            entries = _re.split(r"(?=\[\d+\])", text)
            for entry in entries:
                entry = entry.strip()
                if entry:
                    col_content.append(Paragraph(entry, S_REF))
        elif is_kw:
            col_content.append(Paragraph(text, S_KW))
        else:
            col_content.append(Paragraph(text, S_BODY))

    para_buf: list[str] = []

    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            flush_para(para_buf, in_refs, in_keywords)
            para_buf = []
            continue

        if sec_re.match(line):
            flush_para(para_buf, in_refs, in_keywords)
            para_buf = []
            in_keywords = bool(_re.match(r"^keywords", line, _re.IGNORECASE))
            in_refs = bool(_re.match(r"^references", line, _re.IGNORECASE))
            col_content.append(Spacer(1, 4))
            col_content.append(Paragraph(line.upper(), S_SECTION))
            continue

        if subsec_re.match(line):
            flush_para(para_buf, in_refs, in_keywords)
            para_buf = []
            col_content.append(Paragraph(line, S_SUBSECTION))
            continue

        # Reference items inline (e.g. [1] Smith, ...)
        if in_refs and ref_item_re.match(line):
            flush_para(para_buf, in_refs, in_keywords)
            para_buf = []
            para_buf.append(line)
            continue

        para_buf.append(line)

    flush_para(para_buf, in_refs, in_keywords)

    # ── Two-column layout ──────────────────────────────────────────────────
    try:
        story.append(BalancedColumns(
            col_content, nCols=2,
            needed=36, spaceBefore=0, spaceAfter=0,
        ))
    except Exception:
        story.extend(col_content)

    doc.build(story)
    return buf.getvalue()


def _ieee_collect_kb_sources(
    store: "ArticleStore",
    queries: list[str],
    top_k_per_query: int = 5,
    max_articles: int = 20,
    snippet_chars: int = 600,
) -> tuple[list[dict], str, str]:
    """
    Multi-query KB search that:
    - Runs one search per query string
    - Deduplicates by doc_id, keeping the richest chunks
    - Returns (articles_meta, kb_sources_text, reference_list_text)

    articles_meta entries: {ref_num, doc_id, title, year, source_path, global_context, snippets}
    kb_sources_text: labeled excerpts for the LLM prompt
    reference_list_text: numbered reference list for the LLM prompt
    """
    from collections import defaultdict

    # doc_id → {title, year, source_path, global_context, snippets: [str]}
    doc_map: dict[str, dict] = defaultdict(lambda: {
        "title": "", "year": None, "source_path": "", "global_context": "", "snippets": [],
    })

    for q in queries:
        try:
            results = store.search(query=q, top_k=top_k_per_query, collection="articles")
        except Exception:
            continue
        for r in results:
            # ArticleSearchResult may be a model instance or a dict
            def _get(obj: object, key: str, default: object = "") -> object:
                if hasattr(obj, key):
                    return getattr(obj, key) or default
                if isinstance(obj, dict):
                    return obj.get(key) or default
                return default

            doc_id = str(_get(r, "doc_id", ""))
            if not doc_id:
                continue
            entry = doc_map[doc_id]
            if not entry["title"]:
                entry["title"] = str(_get(r, "canonical_title") or _get(r, "title") or doc_id)
            if not entry["year"]:
                entry["year"] = _get(r, "published_year", None)
            if not entry["source_path"]:
                entry["source_path"] = str(_get(r, "source_path", ""))
            if not entry["global_context"]:
                gc = str(_get(r, "global_context", ""))
                if gc:
                    entry["global_context"] = gc[:300]

            snippet = str(_get(r, "content", "") or _get(r, "text", ""))
            section = str(_get(r, "section_title", ""))
            if snippet and len(entry["snippets"]) < 4:
                label = f"[{section}] " if section else ""
                entry["snippets"].append(f"{label}{snippet[:snippet_chars]}")

        if len(doc_map) >= max_articles:
            break

    # Trim to max_articles, sorted by number of snippets (richest first)
    ranked = sorted(doc_map.items(), key=lambda kv: len(kv[1]["snippets"]), reverse=True)
    ranked = ranked[:max_articles]

    articles_meta = []
    kb_sources_lines: list[str] = []
    ref_list_lines: list[str] = []

    for ref_num, (doc_id, info) in enumerate(ranked, start=1):
        title  = info["title"] or doc_id
        year   = info["year"] or "n.d."
        src    = info["source_path"]
        # Derive a short source label from file path
        src_label = src.split("/")[-1].split("\\")[-1].replace(".pdf", "").replace("_", " ") if src else "Knowledge Base"

        articles_meta.append({
            "ref_num": ref_num, "doc_id": doc_id, "title": title,
            "year": year, "source_path": src, "snippets": info["snippets"],
        })

        # KB sources block for prompt
        combined_snippets = "\n  ".join(info["snippets"]) if info["snippets"] else info["global_context"] or "(no excerpt)"
        kb_sources_lines.append(
            f"--- Source [{ref_num}]: {title} ({year}) ---\n  {combined_snippets}"
        )

        # IEEE reference entry
        ref_list_lines.append(
            f"[{ref_num}] \"{title},\" {src_label}, {year}."
        )

    kb_sources_text  = "\n\n".join(kb_sources_lines) if kb_sources_lines else "No knowledge base sources found."
    reference_list_text = "\n".join(ref_list_lines) if ref_list_lines else "No references found."

    return articles_meta, kb_sources_text, reference_list_text


@router.post(
    "/roadmap/{roadmap_id}/ieee-paper",
    tags=["knowledge"],
    summary="Gera um artigo IEEE em PDF com base no roadmap e na KB",
)
def generate_ieee_paper(
    roadmap_id: str,
    body: dict,
    store: ArticleStore = Depends(get_article_store),
    workflow: ValidationWorkflow = Depends(get_workflow),
):
    col = _roadmap_col()
    doc = col.find_one({"id": roadmap_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Roadmap não encontrado")

    provider      = body.get("provider", "gemini")
    authors       = (body.get("authors") or "").strip()
    custom_prompt = (body.get("custom_prompt") or "").strip()
    paper_title   = (body.get("paper_title") or "").strip()
    language      = body.get("language", "en")  # "en" or "pt"

    roadmap_title = doc.get("title", doc.get("goal", ""))
    goal          = doc.get("goal", roadmap_title)
    phases        = doc.get("phases", [])

    if not paper_title:
        paper_title = roadmap_title

    # ── Build roadmap summary ──────────────────────────────────────────────
    phase_lines: list[str] = []
    all_topic_titles: list[str] = []
    for p in phases:
        topic_list = p.get("topics", [])
        t_names = "; ".join(t.get("title", "") for t in topic_list)
        phase_lines.append(
            f"Phase: {p.get('title', '')} ({p.get('duration', '')})\n  Topics: {t_names}"
        )
        for t in topic_list:
            all_topic_titles.append(t.get("title", ""))
            if t.get("description"):
                phase_lines.append(f"  - {t['title']}: {t['description'][:250]}")

    roadmap_summary = "\n".join(phase_lines)

    # ── Multi-query KB search ──────────────────────────────────────────────
    # One query per topic + one general goal query → richest possible coverage
    search_queries: list[str] = [goal]
    for tt in all_topic_titles[:15]:   # cap to avoid excessive queries
        if tt:
            search_queries.append(f"{tt} {goal[:60]}")

    _, kb_sources_text, reference_list_text = _ieee_collect_kb_sources(
        store=store,
        queries=search_queries,
        top_k_per_query=6,
        max_articles=20,
        snippet_chars=700,
    )

    # ── Call LLM ──────────────────────────────────────────────────────────
    try:
        result = workflow.execute_prompt(
            PromptExecutionRequest(
                prompt_name="ieee_paper",
                content=goal,
                provider=provider,
                title=paper_title,
                metadata={
                    "authors": authors or "Anonymous",
                    "goal": goal,
                    "kb_sources": kb_sources_text,
                    "roadmap_summary": roadmap_summary,
                    "reference_list": reference_list_text,
                    "custom_instructions": custom_prompt or "None",
                    "language": "Brazilian Portuguese (pt-BR)" if language == "pt" else "English",
                },
            )
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    paper_text = result.output_text.strip()

    # ── Generate PDF ───────────────────────────────────────────────────────
    try:
        pdf_bytes = _build_ieee_pdf(paper_text, paper_title, authors or "Anonymous")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}") from exc

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.write(pdf_bytes)
    tmp.close()

    safe_title = "".join(c if c.isalnum() or c in "_ -" else "_" for c in paper_title)[:60]
    filename = f"ieee_{safe_title}.pdf"

    return FileResponse(
        tmp.name,
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

