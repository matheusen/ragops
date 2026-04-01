# Article Scraper

Busca artigos científicos em múltiplas fontes e salva metadados + PDFs localmente.

## Fontes suportadas

| Fonte            | Chave?           | VPN?  | Notas                              |
|------------------|------------------|-------|------------------------------------|
| **arXiv**        | Não              | Não   | Open access, API oficial           |
| **Semantic Scholar** | Opcional    | Não   | 200M+ papers, gratuito             |
| **IEEE Xplore**  | Sim (gratuita)   | Não   | 200 req/dia (free tier)            |
| **CrossRef**     | Não              | Não   | Metadados DOI, sem abstracts       |
| **Portal CAPES** | Não              | **Sim** | Requer Selenium + VPN universitária |

## Setup

```bash
cd scripts/article_scraper

# Criar venv
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

## Configuração

Edite o `config.yaml`:

```yaml
# Adicione suas queries
queries:
  - query: "transformer models code generation"
    max_results: 50

# Habilite as fontes
sources:
  ieee:
    enabled: true
    api_key: "SUA_CHAVE_AQUI"   # developer.ieee.org (gratuito)

  semantic_scholar:
    enabled: true
    api_key: ""   # opcional, aumenta rate limit
```

### Chave IEEE (gratuita)
1. Acesse https://developer.ieee.org
2. Crie conta → "Get API Key"
3. Cole em `config.yaml` → `sources.ieee.api_key`

### Chave Semantic Scholar (opcional)
1. Acesse https://www.semanticscholar.org/product/api
2. Solicite chave gratuita (aumenta de 1 req/s para 10 req/s)

## Uso

```bash
# Busca completa com config.yaml
# Se kafka.enabled: true, roda como producer
# URLs/PDFs fora de publishers/repositórios confiáveis são descartados
python scraper.py

# Producer explícito
python scraper.py --mode producer

# Compat wrapper
python kafka_producer.py

# Consumer: consome do Kafka, baixa PDFs e salva no MongoDB
python kafka_consumer.py

# Modo direto antigo, sem Kafka
python scraper.py --mode direct

python scraper.py --mode direct --resume

# Query avulsa
python scraper.py --query "RAG retrieval augmented generation" --sources arxiv semantic_scholar

# Config personalizada
python scraper.py --config minha_busca.yaml

# Sem baixar PDFs
python scraper.py --no-download

# Ver o que já foi coletado
python scraper.py --list-existing

# Limite de resultados
python scraper.py --max 20
```
python rename_by_title.py

## Estrutura de saída

```
results/
├── metadata/          ← um JSON por artigo (id, título, autores, abstract, DOI...)
│   ├── 10.1234_abc.json
│   └── ...
├── downloads/         ← PDFs (só open access por padrão)
│   ├── 10.1234_abc.pdf
│   └── ...
└── reports/           ← consolidado da execução
    ├── run_20240319_143022.json
    └── run_20240319_143022.csv
```

## Kafka + MongoDB

O fluxo assíncrono fica assim:

1. `kafka_producer.py` faz a busca nas fontes.
2. Cada artigo novo é salvo em `results/metadata/*.json`, persistido no MongoDB e publicado no tópico Kafka.
3. `kafka_consumer.py` consome o tópico, verifica se o PDF já existe na pasta e só baixa o que falta.
4. Cada PDF salvo localmente também é registrado no MongoDB/GridFS.

O scraper também sanitiza links e aceita apenas domínios científicos confiáveis, como `arxiv.org`, `doi.org`, `ieee.org`, `acm.org`, `springer.com`, `sciencedirect.com`, `core.ac.uk`, `dblp.org` e publishers acadêmicos equivalentes. Links sociais ou genéricos são descartados.

Hoje o entrypoint principal é `scraper.py`:

- `python scraper.py` usa `producer` por padrão quando `kafka.enabled: true`
- `python scraper.py --mode direct` mantém o fluxo antigo sem fila
- `python kafka_producer.py` é só um wrapper compatível

Configuração mínima no `config.yaml`:

```yaml
mongodb:
  enabled: true
  uri: "mongodb://localhost:27017"

kafka:
  bootstrap_servers:
    - "localhost:9092"
  topic: "article-scraper.articles"
```

Execução:

```bash
cd scripts/article_scraper

python kafka_consumer.py
python scraper.py
```

Se você quiser manter o modo antigo, use `python scraper.py --mode direct`.

## Portal CAPES (com VPN)

1. Conecte à VPN da universidade
2. No `config.yaml`, habilite:
   ```yaml
   sources:
     capes:
       enabled: true
       headless: false   # true = invisível, false = ver o browser
   ```
3. Execute: `python scraper.py --sources capes`

## Dicas

- **Incremental**: o scraper pula artigos já coletados por DOI — pode rodar várias vezes sem duplicar
- **Rate limit**: ajuste `execution.delay_between_requests` se receber erros 429
- **Apenas metadados**: `downloads.enabled: false` se não quiser PDFs
- **Ano mínimo**: `execution.min_year: 2020` filtra artigos antigos
