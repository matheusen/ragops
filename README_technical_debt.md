# Debito Tecnico Prioritario

Este documento transforma as conclusoes levantadas na analise do corpus e dos papers em um backlog tecnico executavel.

Ele existe para responder a uma pergunta simples:

`o que falta fazer para este app ficar mais preciso, confiavel, explicavel e pronto para evoluir sem acumular mais fragilidade?`

## Tese central

O app ja tem muitas tecnicas avancadas:

- retrieval hibrido
- reranking
- GraphRAG
- exact-page
- corrective RAG
- distillation
- LangGraph
- trilha de auditoria
- harness de avaliacao

O problema principal hoje nao e falta de feature. O problema e `governanca tecnica`:

- corpus ainda ruidoso
- avaliacao de `article-analysis` ainda fraca
- falhas de retrieval ainda aparecem como warning generico
- confianca ainda nao controla bem a experiencia do usuario
- o sistema ja consegue fazer muita coisa, mas ainda nao explica bem quando errou ou por que confiou

## Evidencia local que justifica este backlog

- a auditoria de `article-analysis` em `data/audit/ARTICLE-055B2D/20260310T232305Z.json` registrou:
  - `Corrective retrieval was triggered for this article query.`
  - `Retrieval quality remained weak after routing; human review is recommended.`
- o README principal ja documenta multiplos modos de retrieval, mas ainda falta transformar isso em politica padrao orientada por qualidade
- o corpus de artigos mistura material central com material lateral, o que aumenta risco de recall ruidoso

## Evidencia externa que sustenta as prioridades

- [artigos/ocaf008.pdf](artigos/ocaf008.pdf)
  - revisao sistematica e meta-analise em biomedicina
  - efeito agregado a favor de `LLM + RAG` sobre `LLM puro`
- [artigos/dietrich-stubbert-2025-evaluating-adherence-to-canadian-radiology-guidelines-for-incidental-hepatobiliary-findings.pdf](artigos/dietrich-stubbert-2025-evaluating-adherence-to-canadian-radiology-guidelines-for-incidental-hepatobiliary-findings.pdf)
  - aderencia subiu fortemente com RAG
- [artigos/3701228.pdf](artigos/3701228.pdf)
  - benchmark CRUD-RAG
  - mostra que avaliar so a resposta final e insuficiente
- [artigos/Verification_and_Validation_of_LLM-RAG_for_Industrial_Automation.pdf](artigos/Verification_and_Validation_of_LLM-RAG_for_Industrial_Automation.pdf)
  - reforca classificacao de falha por tipo, nao apenas pass/fail
- [artigos/btae560.pdf](artigos/btae560.pdf)
  - mostra valor de KG-RAG seletivo e compressao de contexto
- [artigos/hir-2024-30-4-355.pdf](artigos/hir-2024-30-4-355.pdf)
  - mostra ganho claro quando retrieval e julgamento final trabalham juntos
- https://docs.langchain.com/langsmith/evaluation-concepts
- https://microsoft.github.io/graphrag/query/overview/
- https://qdrant.tech/documentation/concepts/hybrid-queries/
- https://qdrant.tech/documentation/guides/quantization/
- https://arxiv.org/abs/2401.15884
- https://arxiv.org/abs/2310.11511

## Como a prioridade foi definida

Cada item abaixo considera:

1. impacto direto na qualidade da resposta
2. impacto na confianca do usuario
3. risco operacional atual
4. dependencia para outros avancos
5. qualidade da evidencia tecnica disponivel

---

## `P0` - Obrigatorio

Estes itens devem existir antes de expandir features ou complexidade.

### `P0.1` Golden dataset de `article-analysis`

Problema:

- hoje o modo de artigos tem retrieval sofisticado, mas ainda nao tem um dataset proprio suficientemente forte para medir regressao de qualidade

Trabalho:

- criar dataset rotulado de `article-analysis`
- incluir pergunta, resposta esperada, evidencias esperadas e paginas esperadas
- separar casos por tipo:
  - factual simples
  - comparativo
  - multi-hop
  - page-level
  - pergunta que deve virar `human review`

Criterio de aceite:

- existe um dataset versionado em disco
- `POST /api/v1/evaluate/compare` roda cenarios contra ele
- ha metricas por modo de retrieval e provider

### `P0.2` Taxonomia de falhas na auditoria

Problema:

- warning generico nao ajuda a entender o que quebrou

Trabalho:

- classificar falhas na auditoria em tipos claros
- minimo recomendado:
  - `retrieval_miss`
  - `low_coverage`
  - `grounding_failure`
  - `reasoning_failure`
  - `citation_failure`
  - `human_review_required`

Criterio de aceite:

- toda execucao de `article-analysis` e `issue-validation` grava o tipo de falha dominante
- o dashboard consegue exibir esses sinais sem ler JSON bruto

### `P0.3` Curadoria de corpus e isolamento por colecao

Problema:

- artigos laterais poluem recall e pioram explicabilidade

Trabalho:

- dividir o corpus em colecoes mais rigorosas
- promover filtros por tema, fonte, data e finalidade
- criar colecao principal para `core-rag`
- reduzir peso ou mover material lateral para colecoes separadas

Criterio de aceite:

- `article-analysis` passa a operar por colecao com escopo explicito
- o dashboard deixa claro qual colecao alimentou a resposta

### `P0.4` Confidence gating e abstencao

Problema:

- hoje o sistema ja sabe quando retrieval ficou fraco, mas isso ainda nao governa a UX final

Trabalho:

- transformar warnings em politica de experiencia
- quando cobertura estiver baixa:
  - reduzir confianca
  - pedir revisao humana
  - evitar tom conclusivo
  - destacar ausencia de evidencia suficiente

Criterio de aceite:

- a interface mostra estados distintos para `conclusao forte`, `conclusao parcial` e `revisao humana recomendada`

---

## `P1` - Alta prioridade

Estes itens aumentam qualidade real logo depois do bloco obrigatorio.

### `P1.1` Citacao page-level obrigatoria para afirmacoes fortes

Problema:

- a resposta pode soar segura demais sem apontar pagina, secao ou trecho

Trabalho:

- reforcar `exact-page`
- expor pagina, secao e tipo de chunk na UI
- exigir citacao forte para claims centrais

Criterio de aceite:

- principais afirmacoes em review de artigo exibem origem page-level quando disponivel

### `P1.2` Auditoria de chunking e deduplicacao

Problema:

- chunk ruim e duplicacao degradam recall e ranking

Trabalho:

- medir overlap e duplicacao de chunks
- identificar chunks muito curtos, muito longos ou redundantes
- ajustar heuristicas por tipo de documento

Criterio de aceite:

- existe relatorio simples de qualidade de chunking por colecao
- retrieval usa corpus menos duplicado

### `P1.3` Politica padrao de retrieval mais dura

Problema:

- o app suporta muitos modos, mas ainda precisa de um default mais opinativo

Trabalho:

- consolidar default recomendado:
  - `vector-global` ou `hybrid`
  - `reranker`
  - `distillation`
  - `exact-page` quando houver pedido literal
  - `corrective` quando cobertura vier baixa
  - `GraphRAG` apenas em queries relacionais

Criterio de aceite:

- existe configuracao default defendivel para `article-analysis`
- auditoria mostra por que um modo foi escolhido

### `P1.4` Distillation e token budget como politica real

Problema:

- compressao de contexto ainda corre o risco de ser tratada como opcional

Trabalho:

- definir orcamento de contexto por tipo de tarefa
- tornar distillation default em cenarios de corpus grande
- registrar o quanto foi comprimido

Criterio de aceite:

- cada run informa contexto bruto vs contexto final
- ha ganho de custo sem perda clara de qualidade

---

## `P2` - Escala, custo e operacao

### `P2.1` Semantic cache e context cache

Problema:

- repeticao de retrieval e contexto eleva custo e latencia

Trabalho:

- cachear respostas para perguntas equivalentes
- cachear pacotes de contexto recuperado

Criterio de aceite:

- perguntas repetidas economizam chamadas e tempo

### `P2.2` Comparacao continua em CI

Problema:

- mudancas em retrieval e prompts podem degradar o sistema silenciosamente

Trabalho:

- rodar `evaluate/compare` como parte de validacao tecnica
- publicar relatorios agregados

Criterio de aceite:

- regressao relevante bloqueia merge ou gera alerta explicito

### `P2.3` DSPy apenas onde houver metrica estavel

Problema:

- otimizar prompt sem dataset confiavel vira automacao de ruina

Trabalho:

- restringir DSPy a modulos com metrica clara
- evitar expandir para fluxos sem criterio de sucesso bem definido

Criterio de aceite:

- todo uso de DSPy tem objetivo, dataset e metrica documentados

---

## `P3` - Avancos opcionais

### `P3.1` Benchmark multimodal separado

Problema:

- tabela, figura e imagem exigem avaliacao propria

Trabalho:

- criar suite separada para documentos multimodais

### `P3.2` Pilotos seletivos de KG-RAG

Problema:

- GraphRAG e caro para usar em tudo

Trabalho:

- testar KG-RAG apenas em dominios com relacao explicita e alta densidade semantica

### `P3.3` Politicas mais fortes de abstencao

Problema:

- respostas elegantes podem continuar sendo fracas

Trabalho:

- endurecer linguagem de incerteza
- bloquear claim forte sem evidencia minima

---

## Ordem recomendada de execucao

1. `P0.1` Golden dataset de `article-analysis`
2. `P0.2` Taxonomia de falhas na auditoria
3. `P0.3` Curadoria de corpus e isolamento por colecao
4. `P0.4` Confidence gating e abstencao
5. `P1.1` Citacao page-level obrigatoria
6. `P1.2` Auditoria de chunking e deduplicacao
7. `P1.3` Politica padrao de retrieval
8. `P1.4` Distillation como politica real
9. `P2.1` Cache
10. `P2.2` Compare em CI
11. `P2.3` DSPy seletivo

## O que nao fazer agora

- nao expandir GraphRAG para todo caso de uso
- nao aumentar complexidade agentic sem dataset mais forte
- nao otimizar prompt cegamente sem metrica confiavel
- nao misturar mais corpus antes de resolver curadoria

## Resultado esperado quando este backlog for concluido

O sistema deve passar a ser:

- mais preciso
- mais auditavel
- mais explicavel para o usuario
- menos sujeito a alucinacao silenciosa
- mais barato de operar em consultas repetidas
- mais seguro para evoluir sem regressao escondida
