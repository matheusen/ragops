from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from jira_issue_rag.api.routes import router
from jira_issue_rag.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "## Jira Issue Validation RAG\n\n"
        "Pipeline de validação de issues Jira orientado a evidências. "
        "Combina recuperação vetorial (Qdrant), grafo de conhecimento (Neo4j), "
        "reranking semântico e um juiz LLM modular para classificar bugs, "
        "verificar completude e avaliar prontidão para desenvolvimento.\n\n"
        "### Providers suportados\n"
        "| Provider | Requer API key | Funciona em CONFIDENTIALITY_MODE |\n"
        "|----------|---------------|----------------------------------|\n"
        "| `mock`   | Não           | ✅ Sim                           |\n"
        "| `ollama` | Não           | ✅ Sim                           |\n"
        "| `openai` | Sim           | ⛔ Não (a menos que ALLOW_THIRD_PARTY_LLM=true) |\n"
        "| `gemini` | Sim (Vertex)  | ⛔ Não (a menos que ALLOW_THIRD_PARTY_LLM=true) |\n\n"
        "### Links úteis\n"
        "- [Repositório](https://github.com/matheusen/ragflow)\n"
        "- [Dashboard Next.js](http://localhost:3000)\n"
    ),
    contact={"name": "Matheus", "url": "https://github.com/matheusen/ragflow"},
    license_info={"name": "MIT"},
    openapi_tags=[
        {
            "name": "core",
            "description": "Saúde e estado da aplicação.",
        },
        {
            "name": "validation",
            "description": "Validação de issues via LangGraph + LLM. Aceita issue em JSON, pasta de artefatos ou issue key do Jira.",
        },
        {
            "name": "jira",
            "description": "Integração com a API do Jira: busca, indexação e validação direta por issue key.",
        },
        {
            "name": "indexing",
            "description": "Indexação de artefatos no Qdrant para recuperação vetorial.",
        },
        {
            "name": "prompts",
            "description": "Catálogo de prompts em disco (.md). Listagem e execução ad-hoc.",
        },
        {
            "name": "evaluation",
            "description": "Avaliação de qualidade: golden dataset, comparação de cenários e replay de auditorias salvas.",
        },
    ],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix=settings.api_prefix)
