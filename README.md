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

## Requisitos

- **Python >= 3.12**
- **Node.js >= 20** (para o dashboard)

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]
copy .env.example .env
```

O comando acima instala apenas as dependencias base e as de desenvolvimento. Para habilitar funcionalidades adicionais, instale os extras conforme necessario:

| Extra | Comando | O que habilita |
|---|---|---|
| `providers` | `pip install -e ".[providers]"` | OpenAI e Gemini via Vertex AI |
| `retrieval` | `pip install -e ".[retrieval]"` | Qdrant client |
| `rerank` | `pip install -e ".[rerank]"` | Reranker local com sentence-transformers |
| `parsing` | `pip install -e ".[parsing]"` | Docling para PDFs complexos |
| `ocr` | `pip install -e ".[ocr]"` | pytesseract + pdf2image |
| `ocr-advanced` | `pip install -e ".[ocr-advanced]"` | MonkeyOCR v1.5 (sidecar HTTP) |
| `graphrag` | `pip install -e ".[graphrag]"` | Neo4j GraphRAG — grafo de issues |
| `eval` | `pip install -e ".[eval]"` | Metricas RAGAS |
| `optimization` | `pip install -e ".[optimization]"` | DSPy para otimizacao de prompts |

Para instalar tudo de uma vez:

```powershell
pip install -e ".[providers,retrieval,rerank,parsing,ocr,eval,dev]"
```

Se for usar Jira e Qdrant, preencha tambem `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`, `QDRANT_URL` e opcionalmente `QDRANT_API_KEY`.

O workflow usa LangGraph por padrao. Se quiser desligar e voltar ao fluxo direto, defina `ENABLE_LANGGRAPH=false`.

Por padrao o projeto sobe em modo confidencial: `CONFIDENTIALITY_MODE=true`. Nesse modo nenhum dado de issue, anexo ou contexto sai para OpenAI, Gemini ou Qdrant externo, mesmo que as chaves estejam configuradas. Para liberar explicitamente egress de terceiros, ajuste apenas o necessario:

- `ALLOW_THIRD_PARTY_LLM=true`
- `ALLOW_THIRD_PARTY_EMBEDDINGS=true`
- `ALLOW_EXTERNAL_VECTOR_STORE=true`

Se a exigencia for estrita, mantenha `DEFAULT_PROVIDER=mock` e deixe os tres flags acima como `false`.

## Rodar API

Execute a partir da raiz do repositório com o venv ativo:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn jira_issue_rag.main:app --reload --host 0.0.0.0 --port 8000
```

A API sobe em `http://localhost:8000`. Documentacao interativa disponivel em:

- Swagger UI: `http://localhost:8000/docs`
- Redoc: `http://localhost:8000/redoc`

## Rodar Dashboard

Interface Next.js 16 para acompanhar requisicoes, prompts, configuracoes e fluxo da aplicacao:

```powershell
cd dashboard
npm install
npm run dev
```

O dashboard le os prompts em `../prompts`, as trilhas em `../data/audit`, os relatorios em `../data/eval_reports` e a configuracao em `../.env`.

Opcionalmente, o dashboard pode persistir configuracoes em MongoDB. Para isso, adicione `MONGODB_URI` no `.env` do dashboard (`dashboard/.env.local`) ou no `.env` raiz:

```
MONGODB_URI=mongodb://localhost:27017
```

Sem `MONGODB_URI`, o dashboard usa o arquivo `.env` raiz como fallback automaticamente.

## Testes

Crie a pasta `tests/` antes de rodar pela primeira vez (o pytest a exige conforme configurado no `pyproject.toml`):

```powershell
mkdir tests
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

---

## Infraestrutura com Docker

O repositorio inclui um `docker-compose.yml` na raiz com todos os servicos externos usados pelo projeto.

### Subir tudo de uma vez (sem GPU)

```powershell
docker compose up -d
```

Isso sobe: Qdrant, Neo4j, MongoDB e Ollama. O MonkeyOCR fica em perfil separado por exigir GPU.

### Servicos individuais

```powershell
# Apenas Qdrant (vector store)
docker compose up qdrant -d

# Apenas Neo4j (GraphRAG)
docker compose up neo4j -d

# Apenas MongoDB (dashboard)
docker compose up mongodb -d

# Apenas Ollama (LLM local)
docker compose up ollama -d

# MonkeyOCR (requer GPU NVIDIA)
docker compose --profile gpu up monkeyocr -d
```

### Parar e limpar

```powershell
# Parar sem apagar volumes
docker compose down

# Parar e remover todos os dados (irreversivel)
docker compose down -v
```

---

## Qdrant — Vector Store

Usado para retrieval hibrido por dense vectors (embeddings semanticos) + sparse vectors (BM25-style).

### Subir

```powershell
docker compose up qdrant -d
# REST API e dashboard web: http://localhost:6333/dashboard
```

### Configuracao no `.env`

```
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=issue_evidence
QDRANT_API_KEY=                          # deixe vazio para instancia local sem auth
ALLOW_EXTERNAL_VECTOR_STORE=true         # necessario quando CONFIDENTIALITY_MODE=true
```

### Quantizacao (opcional)

Para reduzir uso de memoria sem perda significativa de qualidade:

```
# int8 — reduz VRAM em ~75%, recomendado para producao
QDRANT_QUANTIZATION_TYPE=scalar
QDRANT_QUANTIZATION_RESCORE=true

# binario — reducao extrema, aceita alguma perda de precisao
QDRANT_QUANTIZATION_TYPE=binary
```

### Cascade Retrieval (opcional)

Busca `N × factor` candidatos brutos, re-ranqueia e devolve os top-N mais relevantes.

```
ENABLE_CASCADE_RETRIEVAL=true
QDRANT_CASCADE_OVERRETRIEVE_FACTOR=4
```

### Dependencia Python

```powershell
pip install -e ".[retrieval]"
```

---

## Neo4j — GraphRAG

Store de grafo opcional que indexa issues e suas relacoes (duplicatas, root causes, componentes, erros) para enriquecer o contexto de retrieval com vizinhanca de profundidade 2.

### Subir

```powershell
docker compose up neo4j -d
# Browser: http://localhost:7474  (usuario: neo4j / senha: neo4j_change_me)
# Bolt:    bolt://localhost:7687
```

> **Altere a senha padrao** antes de usar em producao. Edite `NEO4J_AUTH` no `docker-compose.yml` e atualize `NEO4J_PASSWORD` no `.env`.

### Configuracao no `.env`

```
ENABLE_GRAPHRAG=true
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4j_change_me
NEO4J_DATABASE=neo4j
```

### Schema do grafo

Nodes criados automaticamente na indexacao:

- `(:Issue {key, summary, project, component, service, environment, issue_type})`
- `(:Component {name})`, `(:Service {name})`, `(:Environment {name})`
- `(:ErrorFingerprint {value})`

Relacionamentos:

- `(Issue)-[:LINKS_TO {relation}]->(Issue)` — duplicatas, blocked-by, root-cause
- `(Issue)-[:IN_COMPONENT]->(Component)`
- `(Issue)-[:USES_SERVICE]->(Service)`
- `(Issue)-[:REPRODUCED_IN]->(Environment)`
- `(Issue)-[:HAS_ERROR]->(ErrorFingerprint)`

### Dependencia Python

```powershell
pip install -e ".[graphrag]"
```

---

## MonkeyOCR v1.5 — Extracao de PDFs complexos

O paradigma SRR (Structure-Recognition-Relation) do MonkeyOCR detecta o layout do documento, classifica cada bloco (titulo, tabela, formula, figura) e infere a ordem de leitura correta. Supera Docling, Gemini 2.5-Pro e GPT-4o no benchmark OmniDocBench (Fev 2026) para documentos tecnico-cientificos com tabelas complexas, formulas LaTeX e multiplas colunas.

A extracao de PDF segue uma cadeia de 5 passagens — da mais rica ao fallback simples:

| Passagem | Tecnica | Requisito |
|---|---|---|
| 0 | **MonkeyOCR** | GPU NVIDIA ≥ 8 GB VRAM + sidecar rodando |
| 1 | **Docling** | `pip install -e ".[parsing]"` |
| 2 | **pypdf** | incluso na dependencia base |
| 3 | **Tesseract** | `pip install -e ".[ocr]"` + Tesseract instalado |
| 4 | **Sidecar .txt** | arquivo `documento.pdf.txt` ao lado do PDF |

Se o MonkeyOCR nao estiver rodando, o sistema passa automaticamente para a proxima passagem — nenhuma configuracao extra e necessaria.

### Subir com Docker (requer GPU NVIDIA)

Nao ha imagem pre-compilada no Docker Hub — o container e construido a partir do codigo-fonte clonado localmente.

**Passo 1 — clonar o repositorio MonkeyOCR (apenas uma vez):**

```powershell
# Na raiz do repositorio ragops
git clone https://github.com/Yuliang-Liu/MonkeyOCR monkeyocr-src
```

**Passo 2 — compilar e subir:**

```powershell
docker compose --profile gpu up monkeyocr --build -d
# API disponivel em: http://localhost:8001
```

O container usa o modelo `MonkeyOCR-pro-1.2B` (~4 GB VRAM). Para maior precisao em formulas e tabelas densas, troque por `MonkeyOCR-chat-8B` (~16 GB VRAM) no `docker-compose.yml`.

### Subir manualmente (sem Docker)

```bash
git clone https://github.com/Yuliang-Liu/MonkeyOCR
cd MonkeyOCR
pip install -e .
python tools/download_model.py -n MonkeyOCR-pro-1.2B
uvicorn api.main:app --host 0.0.0.0 --port 8001
```

### Configuracao no `.env`

```
MONKEYOCR_API_URL=http://localhost:8001
```

Deixe vazio ou nao defina a variavel para desativar e usar apenas as passagens seguintes.

### Dependencia Python

O extra `ocr-advanced` instala apenas o cliente HTTP (ja incluido na base). O modelo MonkeyOCR em si e instalado separadamente no sidecar.

```powershell
pip install -e ".[ocr-advanced]"
```

---

## Ollama — LLM 100% Local

Provider alternativo para rodar LLMs localmente sem nenhuma chave de API. Util para desenvolvimento offline, ambientes air-gapped ou para reduzir custo.

### Subir

```powershell
docker compose up ollama -d
# API: http://localhost:11434
```

### Baixar modelos

```powershell
# Dentro do container
docker exec -it ragops-ollama ollama pull llama3.1:8b    # recomendado para RAG
docker exec -it ragops-ollama ollama pull qwen2.5:7b    # alternativa eficiente
docker exec -it ragops-ollama ollama pull phi4:14b      # maior qualidade de raciocinio

# Listar modelos baixados
docker exec -it ragops-ollama ollama list
```

### Configuracao no `.env`

```
DEFAULT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Ollama e local → pode liberar sem risco
CONFIDENTIALITY_MODE=false
```

---

## Referencia de Variaveis de Ambiente

Copie `.env.example` para `.env` e ajuste conforme necessario. Abaixo um resumo das variaveis por categoria:

### Geral

| Variavel | Padrao | Descricao |
|---|---|---|
| `CONFIDENTIALITY_MODE` | `true` | Bloqueia egress para LLMs e vector stores externos |
| `DEFAULT_PROVIDER` | `mock` | Provider LLM: `mock`, `openai`, `gemini`, `ollama` |
| `ENABLE_LANGGRAPH` | `true` | Usa LangGraph como orquestrador; `false` = fluxo direto |
| `ENABLE_RERANKER` | `true` | Reranker local apos retrieval |
| `DISTILLER_MODE` | `simple` | Compressao de contexto: `simple` (regex) ou `refrag` (LLM) |

### Qdrant

| Variavel | Padrao | Descricao |
|---|---|---|
| `QDRANT_URL` | _(vazio)_ | Ex.: `http://localhost:6333` |
| `QDRANT_COLLECTION` | `issue_evidence` | Nome da colecao |
| `QDRANT_API_KEY` | _(vazio)_ | Apenas para instancias com auth |
| `QDRANT_QUANTIZATION_TYPE` | `none` | `scalar`, `binary` ou `none` |
| `ENABLE_CASCADE_RETRIEVAL` | `false` | Busca N×factor + re-rank |
| `ALLOW_EXTERNAL_VECTOR_STORE` | `false` | Necessario quando `CONFIDENTIALITY_MODE=true` |

### Neo4j

| Variavel | Padrao | Descricao |
|---|---|---|
| `ENABLE_GRAPHRAG` | `false` | Ativa GraphRAG |
| `NEO4J_URL` | _(vazio)_ | Ex.: `bolt://localhost:7687` |
| `NEO4J_USER` | `neo4j` | Usuario |
| `NEO4J_PASSWORD` | _(vazio)_ | Senha |
| `NEO4J_DATABASE` | `neo4j` | Nome do banco |

### MonkeyOCR

| Variavel | Padrao | Descricao |
|---|---|---|
| `MONKEYOCR_API_URL` | `http://localhost:8001` | URL do sidecar MonkeyOCR |

### Ollama

| Variavel | Padrao | Descricao |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | URL da API Ollama |
| `OLLAMA_MODEL` | `llama3.1:8b` | Modelo a usar |
