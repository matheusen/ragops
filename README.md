# Jira Issue Validation RAG

Implementacao executavel do README de arquitetura em `README_advanced_jira_issue_rag_openai_gemini.md`.

Arquitetura detalhada da aplicacao: [README_architecture.md](README_architecture.md)

## O que existe aqui

- API FastAPI para validar issues e pacotes de evidencias
- pipeline "facts first, judge later"
- extratores para logs, imagens com sidecar OCR, PDFs e planilhas
- regras deterministicas para completude, contradicoes e impacto financeiro
- retrieval hibrido local com pontos de extensao para Qdrant
- adapters de provider para Mock, OpenAI e Gemini
- coleta real de issue no Jira Cloud via REST API
- indexacao e busca externa em Qdrant por dense+sparse vectors
- reranker local para reforcar precision em IDs, erros e artefatos
- orquestracao por LangGraph no workflow principal
- harness de avaliacao com golden dataset local
- trilha de auditoria em JSON para cada decisao
- testes de regressao do pipeline
- modo confidencial por padrao bloqueando envio para providers e vector stores de terceiros
- catalogo de prompts em disco com selecao por nome na API

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .[dev]
copy .env.example .env
```

Se for usar Jira e Qdrant, preencha tambem `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`, `QDRANT_URL` e opcionalmente `QDRANT_API_KEY`.

O workflow usa LangGraph por padrao. Se quiser desligar e voltar ao fluxo direto, defina `ENABLE_LANGGRAPH=false`.

Por padrao o projeto sobe em modo confidencial: `CONFIDENTIALITY_MODE=true`. Nesse modo nenhum dado de issue, anexo ou contexto sai para OpenAI, Gemini ou Qdrant externo, mesmo que as chaves estejam configuradas. Para liberar explicitamente egress de terceiros, ajuste apenas o necessario:

- `ALLOW_THIRD_PARTY_LLM=true`
- `ALLOW_THIRD_PARTY_EMBEDDINGS=true`
- `ALLOW_EXTERNAL_VECTOR_STORE=true`

Se a exigencia for estrita, mantenha `DEFAULT_PROVIDER=mock` e deixe os tres flags acima como `false`.

## Rodar API

```powershell
uvicorn jira_issue_rag.main:app --reload
```

## Rodar Dashboard

Interface Next.js 16 para acompanhar requisicoes, prompts, configuracoes e fluxo da aplicacao:

```powershell
cd dashboard
npm install
npm run dev
```

O dashboard le os prompts em `../prompts`, as trilhas em `../data/audit`, os relatorios em `../data/eval_reports` e a configuracao em `../.env`.

## Testes

```powershell
pytest
```

## Endpoint principal

`POST /api/v1/validate/issue`

Exemplo de payload:

```json
{
  "issue": {
    "issue_key": "PAY-1421",
    "summary": "PIX payment shows failure but customer may have been charged",
    "description": "Customer saw payment failed but ledger suggests capture succeeded.",
    "expected_behavior": "The UI should confirm a successful payment exactly once.",
    "actual_behavior": "The UI showed failure after authorization.",
    "priority": "High",
    "issue_type": "Bug",
    "status": "Triagem",
    "project": "PAY",
    "component": "checkout",
    "service": "payment-service",
    "environment": "prod",
    "affected_version": "2.4.1",
    "labels": ["pix", "financeiro"]
  },
  "artifact_paths": [
    "examples/input/PAY-1421/payment_logs.txt",
    "examples/input/PAY-1421/reconciliation.csv"
  ]
}
```

Voce pode selecionar um prompt de triagem salvo em `prompts/` passando `prompt_name`, por exemplo `triage_test`.

## Providers

- `mock`: caminho local deterministico para desenvolvimento e testes
- `openai`: usa Responses API via HTTP quando `OPENAI_API_KEY` estiver configurada
- `gemini`: usa Vertex AI via Google Cloud quando `GCP_PROJECT_ID` e credenciais Google estiverem configurados

Sem chave, o sistema cai automaticamente no provider `mock`.

## Prompts

Os prompts ficam na pasta `prompts/` e podem ser listados por `GET /api/v1/prompts`.

Prompts iniciais:

- `triage_test`: triagem estruturada de issue para o workflow de validacao
- `article_analysis`: analise textual de artigos pelo endpoint generico

Para executar um prompt genericamente:

- `POST /api/v1/prompts/execute`

Exemplo para analise de artigo:

```json
{
  "prompt_name": "article_analysis",
  "provider": "gemini",
  "title": "RAG architecture note",
  "metadata": {
    "source": "internal"
  },
  "content": "Article text goes here"
}
```

Para Gemini via Vertex AI, configure:

- `GCP_PROJECT_ID`
- `GCP_LOCATION` (ex.: `us-central1`)
- `GOOGLE_APPLICATION_CREDENTIALS` apontando para o arquivo JSON da service account

Se o JSON ja tiver `project_id`, `GCP_PROJECT_ID` pode ficar vazio. `GEMINI_API_KEY` fica legado e nao e usado no fluxo Vertex.

## Jira + Qdrant

Endpoints adicionais:

- `POST /api/v1/jira/fetch/{issue_key}` busca uma issue real do Jira Cloud e opcionalmente baixa anexos
- `POST /api/v1/jira/validate/{issue_key}` busca a issue no Jira, processa anexos baixados e executa o workflow completo
- `POST /api/v1/index/issue` indexa um pacote de issue no Qdrant
- `POST /api/v1/jira/index/{issue_key}` busca a issue no Jira e a indexa no Qdrant

Exemplo para validar issue real do Jira:

```json
{
  "download_attachments": true,
  "attachment_dir": "data/staging/PAY-1421",
  "provider": "mock",
  "artifact_paths": []
}
```

Com `QDRANT_URL` configurado, o workflow consulta o indice externo antes da decisao e indexa o pacote validado ao final.

## Avaliacao

Existem dois endpoints de avaliacao:

- `POST /api/v1/evaluate/golden` para replay contra dataset rotulado
- `POST /api/v1/evaluate/compare` para comparar cenarios de retriever, reranker, provider e LangGraph sem expor payload bruto no relatorio
- `POST /api/v1/evaluate/replay` para replay contra trilhas de auditoria geradas pelo proprio sistema

Existe um dataset exemplo em `examples/golden_dataset.json`.

Ele calcula:

- `classification_accuracy`
- `completeness_accuracy`
- `ready_for_dev_accuracy`
- `avg_missing_item_overlap`
- `avg_confidence`

E, quando `use_ragas_style_metrics=true`, tambem expone proxies operacionais no estilo RAGAS:

- `answer_correctness_proxy`
- `faithfulness_proxy`
- `context_precision_proxy`
- `context_recall_proxy`
- `contradiction_alignment`

O replay de auditoria calcula drift entre decisao baseline e decisao atual, incluindo:

- `classification_drift_rate`
- `ready_for_dev_drift_rate`
- `completeness_drift_rate`
- `avg_confidence_delta`

O endpoint de comparacao gera um JSON offline em `data/eval_reports` contendo apenas dataset, timestamp, cenarios e metricas agregadas.
