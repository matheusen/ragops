# Comandos Úteis do Projeto: Jira Issue Validation RAG

Este arquivo centraliza todos os comandos essenciais para configurar, testar e executar as diferentes partes do projeto.

## 1. Configuração Inicial e Ambiente Virtual

Antes de rodar a API ou testes, configure o ambiente virtual Python e instale as dependências:

```powershell
# Criar e ativar o ambiente virtual (Windows PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Criar arquivo .env a partir do template
copy .env.example .env

# Instalar dependências base e de desenvolvimento
pip install -e .[dev]

# Opcionalmente, instalar tudo (providers, vetores, OCR, graphrag, etc)
pip install -e ".[providers,retrieval,rerank,parsing,ocr,eval,dev]"
```

## 2. Infraestrutura (Docker)

O projeto depende de serviços como Qdrant (vetores), Neo4j (grafos), MongoDB e Ollama (LLM local).

```powershell
# Subir toda a infraestrutura padrão em background (sem GPU, exceto Ollama se configurado)
docker compose up -d

# Subir serviços específicos
docker compose up qdrant -d
docker compose up neo4j -d
docker compose up mongodb -d

# Parar serviços
docker compose down

# Parar serviços e apagar dados dos bancos (cuidado!)
docker compose down -v
```

### MonkeyOCR (Requer GPU NVIDIA)
Se precisar do MonkeyOCR para PDFs complexos:
```powershell
docker compose --profile gpu up monkeyocr --build -d
```

## 3. Rodar a API FastAPI (Backend)

Com o ambiente virtual ativado na raiz do repositório:

```powershell
# Iniciar servidor em modo de desenvolvimento (recarrega ao salvar arquivos)
python -m uvicorn jira_issue_rag.main:app --reload --host 0.0.0.0 --port 8004
```
- Swagger UI (Documentação da API): `http://localhost:8000/docs`
- Redoc: `http://localhost:8000/redoc`

## 4. Rodar o Dashboard Next.js (Frontend)

O dashboard interativo em Next.js para visualizar flows e auditorias:

```powershell
cd dashboard
npm install
npm run dev
```
Acesse no navegador: `http://localhost:3000`

## 5. Executar os Testes

O projeto utiliza `pytest` para testes unitários e de integração. 

```powershell
# Na raiz do projeto, com o .venv ativado
pytest
```

## 6. Exemplos de Uso via cURL (Smoke Tests)

Testar o upload e validação de uma issue local (provider mock):

```powershell
curl.exe -i -sS -X POST "http://localhost:8000/api/v1/validate/upload" `
  -F "issue_key=PAY-1421" `
  -F "summary=upload test" `
  -F "description=test" `
  -F "issue_type=Bug" `
  -F "provider=mock" `
  -F "files=@examples/input/PAY-1421/payment_logs.txt"
```
