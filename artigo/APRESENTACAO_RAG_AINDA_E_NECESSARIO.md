---
marp: true
paginate: true
title: RAG Ainda e Necessario?
description: Apresentacao tecnica em Markdown sobre RAG moderno, hybrid retrieval, graph retrieval e grounding.
---

# RAG Ainda e Necessario?

## Busca semantica, grafos e grounding em 2026

- Baseado no acervo local do repo
- Foco em arquitetura, retrieval e evidencias
- Tese: o naive RAG enfraqueceu, nao o grounding

---

# A pergunta certa

> Se ja temos busca semantica, hybrid retrieval, knowledge graph e GraphRAG, o RAG ainda e necessario?

- A pergunta parece simples, mas mistura camadas diferentes
- Busca semantica e grafo sao retrieval
- RAG e arquitetura de sistema

---

# Resposta curta

## Sim, RAG ainda e necessario

- O que ficou fraco foi o pipeline simplista: `embedding -> top-k -> prompt -> resposta`
- O que continua forte e necessario e o RAG como arquitetura de grounding
- Em 2026, isso normalmente significa:
  - dense + sparse
  - filtros por metadado
  - reranking
  - exact retrieval
  - graph retrieval
  - compression
  - evaluation

---

# O que o acervo local mostra

- `1308` PDFs em `scripts/article_scraper/results/downloads`
- `1078` arquivos de metadata em `scripts/article_scraper/results/metadata`
- `677` registros com sinais amplos de RAG, graph retrieval, hybrid retrieval ou evaluation

## Busca literal no metadata indexado

- `context engineering = 0`
- `semantic layer = 0`
- `GraphRAG = 1`
- `hybrid retrieval = 4`
- `agentic RAG = 6`
- `evaluation = 26`

---

# Leitura correta do acervo

- A base local e forte para:
  - RAG moderno
  - hybrid retrieval
  - evaluation
  - trust
  - graph-assisted retrieval
- A base local e mais fraca, por vocabulario explicito, para:
  - context engineering
  - semantic layers

## Consequencia

- O miolo tecnico da tese vem do acervo local
- A moldura conceitual mais recente vem dos dois textos externos selecionados

---

# Paper 1

## Gao et al. (2023)
## Retrieval-Augmented Generation for Large Language Models: A Survey

- Consolida `naive RAG`, `advanced RAG` e `modular RAG`
- Organiza RAG em `retrieval`, `generation` e `augmentation`
- Ajuda a mostrar que RAG e familia de arquiteturas, nao pipeline unico

## Mensagem principal

O proprio survey-base ja sugere que falar "RAG morreu" como categoria unica e conceitualmente fraco.

---

# Paper 2

## Blended RAG (2024)

- Dense + sparse + query blending melhoram fortemente o retriever
- O paper reporta `87%` de retriever accuracy em `TREC-COVID`
- O ganho de retrieval eleva o pipeline de RAG como um todo

## Mensagem principal

Retriever ruim derruba o sistema inteiro antes da geracao.

---

# Papers 3 e 4

## Engineering the RAG Stack (2025)
## A Systematic Review of Key RAG Systems (2025)

- Deslocam a conversa para arquitetura, metrics, governance e trust
- Trazem latency, privacy, security e integration overhead para o centro
- Tratam RAG como problema de sistema, nao apenas de resposta correta

## Mensagem principal

Em ambiente serio, RAG maduro e tambem plataforma, custo, risco e operacao.

---

# Paper 5

## BYOKG-RAG (2025)

- Mostra que graph retrieval nao e traversal cega
- Combina LLMs com graph tools, paths e queries OpenCypher
- Reporta `+4.5` pontos sobre o segundo melhor metodo de graph retrieval
- Generaliza melhor para `bring-your-own KGs`

## Mensagem principal

Quando a pergunta pede relacao explicita, similaridade textual sozinha nao basta.

---

# Paper 6

## TigerVector (2025)

- Integra vector search e graph query no mesmo banco de grafo
- Permite composicao entre busca vetorial e consulta relacional no mesmo substrate
- Mostra que advanced RAG tambem depende de infraestrutura

## Mensagem principal

GraphRAG maduro nao e apenas um truque de prompt. E tambem uma decisao de storage e query model.

---

# Paper 7

## FAIR-RAG (2025)

- Multi-hop nao fecha em `single-pass retrieval`
- O modulo `SEA` identifica lacunas de evidencia e gera novas queries
- Reporta `F1 = 0.453` no HotpotQA, com ganho absoluto de `8.3` pontos sobre baseline iterativo forte

## Mensagem principal

Perguntas complexas pedem iteracao e controle explicito de evidencia.

---

# O que os 7 papers convergem

1. O que morreu foi o naive RAG
2. Retriever continua decidindo mais do que gerador
3. Graph retrieval agrega quando a pergunta pede relacao explicita
4. RAG moderno e tambem infraestrutura, avaliacao e trust
5. Perguntas complexas pedem iteracao e controle de evidencia

---

# Onde entram os dois textos recentes

## Is RAG Dead?

- semantic layer
- metadata-aware retrieval
- provenance, coverage, recency
- explainability enterprise

## Context Engineering

- write, select, compress, isolate
- contexto demais em agentes
- contexto certo, quantidade certa, hora certa

---

# Tese consolidada

> RAG ainda e necessario quando o sistema precisa transformar evidencias em resposta final confiavel.

## O que mudou em 2026

- bom RAG agora e hibrido
- relacional
- comprimido
- observavel
- governado
- e, quando preciso, iterativo

---

# O que nao deve ser confundido

| Conceito | Papel |
|---|---|
| Busca lexical | encontra termos, IDs e trechos exatos |
| Busca semantica | encontra similaridade textual |
| Graph retrieval | encontra ligacoes e multi-hop |
| Hybrid retrieval | combina varios sinais de busca |
| RAG | transforma retrieval em resposta grounded |
| GraphRAG | usa grafo dentro do retrieval e da expansao de contexto |

---

# Quando busca semantica basta

- descoberta de documentos parecidos
- exploracao assistida por humano
- clustering e navegacao de corpus
- casos em que o humano vai ler e interpretar o material recuperado

## Limite

Ela perde forca quando a pergunta pede cadeia causal, comparacao, consolidacao ou resposta operacional final.

---

# Quando grafos agregam mais do que vetor puro

- multi-hop reasoning
- analise de impacto
- root-cause chains
- desambiguacao por entidade
- timeline e relacoes cruzadas

## Mensagem principal

Grafo entra quando o problema deixa de ser apenas parecido e passa a ser explicitamente ligado.

---

# Onde RAG continua sendo necessario

- sintese multi-documento
- resposta natural para usuario final
- justificativa com grounding
- transformacao de retrieval em decisao
- normalizacao da saida em JSON, resumo, checklist ou risco
- reducao de carga cognitiva

## Frase curta

Busca semantica encontra o que parece parecido. Grafo encontra o que esta ligado. RAG transforma isso em resposta utilizavel.

---

# O que morreu foi o RAG naive

## Fraco

- retriever vetorial unico
- top-k fixo
- sem metadado
- sem exact retrieval
- sem grafo
- sem avaliacao

## Forte

- hybrid retrieval
- graph-assisted retrieval
- reranking
- contextual compression
- corrective retrieval
- evidence-first generation

---

# Modelos para comparar na fala

1. `semantic_only`
2. `graph_only`
3. `hybrid_retrieval`
4. `hybrid_graphrag`

## Ideia central

A pergunta certa define o grau de retrieval e generation necessario.

---

# Arquitetura recomendada

```text
query understanding
-> dense / sparse / graph / exact retrieval
-> fusion + rerank
-> compression
-> prompt final com evidencia
-> LLM
-> resposta grounded + fonte + justificativa
```

## Mensagem principal

RAG moderno e pipeline de retrieval governado, nao top-k vetorial sozinho.

---

# Demonstracao sugerida

## Quatro perguntas boas

1. similaridade
2. relacional
3. sintese operacional
4. exata de documento

## O que a demo local ja mostrou

- em `support`, `hybrid_graphrag` fechou melhor a resposta operacional
- em `chain`, grafo e hybrid_graphrag recuperaram melhor a cadeia relacional

---

# Fechamento

> RAG ainda e necessario quando a necessidade real nao e apenas recuperar informacao, mas transformar evidencias recuperadas por semantic search, lexical search e graph retrieval em uma resposta final confiavel, explicavel e acionavel.

## Frase final

GraphRAG, hybrid retrieval, compression, reranking e evaluation sao sinais de maturidade da camada de retrieval dentro de arquiteturas modernas de grounding.
