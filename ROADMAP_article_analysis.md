# Roadmap: Article Analysis

## Objetivo

Melhorar a qualidade do `article-analysis` no `ragflow` com foco em:

- recall real de retrieval
- grounding em PDFs técnicos
- avaliação reproduzível
- operação mais observável e segura

## Fase 1

### 1. Deduplicação e validação de chunks

Objetivo:

- reduzir crowd-out no top-k
- evitar chunks quase idênticos competindo entre si
- estabilizar recall e contexto enviado ao modelo

Implementação:

- gerar fingerprint por chunk normalizado
- remover duplicatas exatas e near-duplicates
- validar overlap excessivo entre chunks vizinhos
- medir distribuição de tamanho e sinalizar chunking ruim

Critérios de sucesso:

- menos redundância por documento
- melhora em `recall_proxy`
- menor variância entre buscas equivalentes

### 2. Avaliação reproduzível de article retrieval

Objetivo:

- medir retrieval por corpus real em vez de feeling
- comparar políticas (`vector`, `graph`, `exact-page`, `corrective`)

Implementação:

- criar dataset pequeno com queries reais
- anotar `expected_doc_ids`, `expected_page_numbers`, `expected_chunk_kind`
- medir `doc_hit@k`, `page_hit@k`, `chunk_kind_hit`, `MRR`, `grounding proxy`

Critérios de sucesso:

- benchmark consistente por modo de retrieval
- base objetiva para escolher defaults e regressões

## Fase 2

### 3. Chunking multimodal para PDFs técnicos

Objetivo:

- melhorar recuperação de tabelas, figuras e screenshots

Implementação:

- estratégia dedicada para `table` e `figure`
- repetição de header em chunks de tabela
- contexto local + global para imagens e capturas
- metadados mais ricos (`table_title`, `figure_caption`, `page_span`)

### 4. Observabilidade operacional

Objetivo:

- explicar claramente o que aconteceu em cada execução

Implementação:

- tempo por etapa
- política resolvida
- fallback corretivo acionado ou não
- cobertura da query
- volume de chunks e orçamento de contexto

## Fase 3

### 5. Hardening do retrieval externo e multi-tenant

Objetivo:

- evitar mistura de corpus e vazamento de dados

Implementação:

- reforçar obrigatoriedade de `tenant_id` quando aplicável
- revisar filtros e isolamento de coleção
- endurecer uso de `QDRANT_API_KEY`
- reduzir risco de exposição indevida do vector store

## Ordem recomendada

1. Fase 1
2. Fase 2
3. Fase 3
