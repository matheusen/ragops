# Debito Tecnico Prioritario

Este documento transforma a visao atual do produto em backlog tecnico executavel.

Ele responde a esta pergunta:

`o que falta fazer para este app analisar melhor issues do Jira e artigos sem crescer em complexidade desgovernada?`

## Escopo real do produto

O app hoje tem `dois modos principais`, com necessidades tecnicas diferentes.

### `issue-validation`

Objetivo do produto:

- usar um `prompt principal de triagem` como contrato de decisao
- receber texto da issue, campos do Jira e anexos
- montar um `context packet` fiel e util
- pedir ao LLM uma decisao orientada por criterios de aceite

Saidas esperadas:

- seguir para desenvolvimento
- devolver pedindo mais informacoes
- cancelar / nao prosseguir

Neste modo, o centro de gravidade nao e retrieval sofisticado. E `qualidade do prompt principal + qualidade do contexto entregue ao LLM + auditabilidade da decisao`.

### `article-analysis`

Objetivo do produto:

- analisar artigo ou colecao de artigos
- recuperar contexto relevante do corpus
- explicar a resposta com grounding melhor
- operar com colecao, filtros, page-level e politicas de retrieval

Neste modo, o centro de gravidade e `retrieval + grounding + explicabilidade`.

## Tese central

O app ja tem bastante capacidade:

- prompt catalog
- fluxo de `issue-validation`
- fluxo de `article-analysis`
- retrieval hibrido
- exact-page
- corrective RAG
- GraphRAG seletivo
- LangGraph
- trilha de auditoria
- harness de avaliacao

O problema principal hoje nao e falta de feature. O problema e `governanca tecnica por modo de uso`.

Hoje os gargalos sao:

- em `issues`, o prompt principal ainda precisa virar contrato de qualidade mensuravel
- em `issues`, o contexto para o LLM ainda precisa ficar mais calibrado, explicavel e auditavel
- em `artigos`, o retrieval ainda precisa de benchmark mais forte, corpus mais curado e grounding mais visivel
- em ambos, warnings e sinais de qualidade ainda nao governam bem a UX final

## Evidencia local que justifica este backlog

- o runtime ja suporta `issue-validation` e `article-analysis`
- o app ja tem prompt de triagem e prompt de analise de artigo
- o dominio de artigos ja expone `collection`, `retrieval_policy`, `exact_match_required` e `enable_corrective_rag`
- existe avaliacao para `issues` via `POST /api/v1/evaluate/compare`
- existe avaliacao de retrieval para `artigos` via `POST /api/v1/articles/evaluate`
- o modo de artigos ja emite warnings como:
  - `Corrective retrieval was triggered for this article query.`
  - `Retrieval quality remained weak after routing; human review is recommended.`
- apesar disso, a decisao persistida de `article-analysis` ainda grava `confidence = 1.0` e `requires_human_review = false`, entao o sinal tecnico ainda nao virou politica real de UX
- o dashboard ja mostra warnings do runtime, mas ainda nao converte isso em estados fortes de confianca e abstencao

## Evidencia externa que sustenta as prioridades

- [artigos/ocaf008.pdf](artigos/ocaf008.pdf)
  - revisao sistematica e meta-analise em biomedicina
  - efeito agregado a favor de `LLM + RAG` sobre `LLM puro`
- [artigos/dietrich-stubbert-2025-evaluating-adherence-to-canadian-radiology-guidelines-for-incidental-hepatobiliary-findings.pdf](artigos/dietrich-stubbert-2025-evaluating-adherence-to-canadian-radiology-guidelines-for-incidental-hepatobiliary-findings.pdf)
  - aderencia subiu fortemente com RAG
- [artigos/3701228.pdf](artigos/3701228.pdf)
  - benchmark CRUD-RAG
  - mostra que avaliar so a resposta final e insuficiente
  - reforca medir pipeline, retrieval e base de conhecimento
- [artigos/Verification_and_Validation_of_LLM-RAG_for_Industrial_Automation.pdf](artigos/Verification_and_Validation_of_LLM-RAG_for_Industrial_Automation.pdf)
  - reforca classificacao de falha por tipo, nao apenas pass/fail
  - sustenta validacao continua e taxonomia graduada de falhas
- [artigos/btae560.pdf](artigos/btae560.pdf)
  - mostra valor de KG-RAG seletivo, compressao de contexto e proveniencia
- [artigos/hir-2024-30-4-355.pdf](artigos/hir-2024-30-4-355.pdf)
  - mostra ganho claro quando retrieval e julgamento final trabalham juntos
- [artigos/s00259-025-07101-9.pdf](artigos/s00259-025-07101-9.pdf)
  - mostra ganho de RAG para recuperar casos similares e melhorar completude e precisao
- https://docs.langchain.com/langsmith/evaluation-concepts
- https://microsoft.github.io/graphrag/query/overview/
- https://qdrant.tech/documentation/concepts/hybrid-queries/
- https://qdrant.tech/documentation/guides/quantization/
- https://arxiv.org/abs/2401.15884
- https://arxiv.org/abs/2310.11511

## Evidencia secundaria

Os artigos abaixo sao uteis como `casos aplicados` ou sinal de direcao, mas nao devem carregar o peso principal da justificativa tecnica do backlog:

- [artigos/1-s2.0-S0378778824009435-main.pdf](artigos/1-s2.0-S0378778824009435-main.pdf)
  - exemplo de sistema multi-source RAG
- [artigos/1-s2.0-S0957417425008139-main.pdf](artigos/1-s2.0-S0957417425008139-main.pdf)
  - exemplo de decision support com RAG em dominio clinico
- [artigos/Evaluating_RAG_Pipeline_in_Multimodal_LLM-based_Question_Answering_Systems.pdf](artigos/Evaluating_RAG_Pipeline_in_Multimodal_LLM-based_Question_Answering_Systems.pdf)
  - apoio lateral para benchmark multimodal
- [artigos/RAGFix_Enhancing_LLM_Code_Repair_Using_RAG_and_Stack_Overflow_Posts.pdf](artigos/RAGFix_Enhancing_LLM_Code_Repair_Using_RAG_and_Stack_Overflow_Posts.pdf)
  - exemplo de uso de RAG para melhorar tarefas ligadas a bugs e reparo de codigo

Os artigos abaixo estao mais distantes do problema central do produto atual e nao devem orientar prioridade:

- [artigos/1-s2.0-S1474034625009024-main.pdf](artigos/1-s2.0-S1474034625009024-main.pdf)
- [artigos/An_LLM-Driven_Chatbot_in_Higher_Education_for_Databases_and_Information_Systems.pdf](artigos/An_LLM-Driven_Chatbot_in_Higher_Education_for_Databases_and_Information_Systems.pdf)
- [artigos/Hybrid_RAG-Empowered_Multimodal_LLM_for_Secure_Data_Management_in_Internet_of_Medical_Things_A_Diffusion-Based_Contract_Approach.pdf](artigos/Hybrid_RAG-Empowered_Multimodal_LLM_for_Secure_Data_Management_in_Internet_of_Medical_Things_A_Diffusion-Based_Contract_Approach.pdf)
- [artigos/LLM-MM_End-to-End_Robust_Multimodal_Beam_Prediction_for_6G_V2X_Networks_via_MoE-LoRA_Adaptation.pdf](artigos/LLM-MM_End-to-End_Robust_Multimodal_Beam_Prediction_for_6G_V2X_Networks_via_MoE-LoRA_Adaptation.pdf)
- [artigos/LLM-Therapist_A_RAG-Based_Multimodal_Behavioral_Therapist_as_Healthcare_Assistant.pdf](artigos/LLM-Therapist_A_RAG-Based_Multimodal_Behavioral_Therapist_as_Healthcare_Assistant.pdf)
- [artigos/s41598-025-05892-3.pdf](artigos/s41598-025-05892-3.pdf)

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

### `P0.1` Contrato de decisao para `issue-validation`

Problema:

- o app ja tem prompt principal de triagem, mas ele ainda precisa virar contrato verificavel de produto

Trabalho:

- formalizar a saida esperada do modo `issue-validation`
- documentar claramente os estados:
  - `seguir para desenvolvimento`
  - `devolver pedindo mais informacoes`
  - `cancelar / nao prosseguir`
- alinhar prompt, schema de resposta, criterios de aceite e auditoria
- deixar explicito no audit por que a issue caiu em cada estado

Criterio de aceite:

- o prompt principal tem objetivo, diretrizes e criterios de aceite documentados
- a decisao final pode ser rastreada por campos e evidencias
- o dashboard consegue mostrar por que a issue foi aprovada, devolvida ou rejeitada

### `P0.2` Taxonomia de falhas na auditoria

Problema:

- warning generico nao ajuda a entender o que quebrou em `issues` ou `artigos`

Trabalho:

- classificar falhas na auditoria em tipos claros
- minimo recomendado:
  - `input_gap`
  - `attachment_extraction_failure`
  - `retrieval_miss`
  - `low_coverage`
  - `grounding_failure`
  - `reasoning_failure`
  - `citation_failure`
  - `human_review_required`

Criterio de aceite:

- toda execucao de `issue-validation` e `article-analysis` grava o tipo de falha dominante
- o dashboard consegue exibir esses sinais sem ler JSON bruto

### `P0.3` Confidence gating e abstencao

Problema:

- o sistema ja detecta sinais de fragilidade, mas esses sinais ainda nao governam a experiencia final

Trabalho:

- transformar warnings e sinais de qualidade em politica de UX
- quando cobertura estiver baixa ou input estiver incompleto:
  - reduzir confianca
  - pedir revisao humana
  - evitar tom conclusivo
  - destacar ausencia de evidencia suficiente

Criterio de aceite:

- a interface mostra estados distintos para `conclusao forte`, `conclusao parcial` e `revisao humana recomendada`
- `article-analysis` deixa de persistir `confidence = 1.0` de forma fixa
- `issue-validation` e `article-analysis` passam a expor estado de abstencao de forma consistente

### `P0.4` Context packet confiavel para `issue-validation`

Problema:

- o valor do modo de issues depende da qualidade do pacote de contexto enviado ao LLM

Trabalho:

- definir claramente o que sempre entra no prompt de triagem:
  - texto da abertura da issue
  - campos relevantes do Jira
  - anexos processados
  - fatos extraidos e contradicoes
  - trechos priorizados quando houver limite de token
- garantir que o contexto enviado seja fiel ao input original
- registrar no audit o que entrou bruto e o que entrou resumido

Criterio de aceite:

- existe especificacao versionada do `context packet` de issues
- cada execucao informa o que foi enviado ao LLM
- o sistema nao perde informacao importante de anexo sem deixar rastro

### `P0.5` Curadoria de corpus e isolamento por colecao para `article-analysis`

Problema:

- artigos laterais poluem recall e pioram explicabilidade

Trabalho:

- dividir o corpus em colecoes mais rigorosas
- promover filtros por tema, fonte, data e finalidade
- criar colecao principal para `core-rag`
- reduzir peso ou mover material lateral para colecoes separadas

Criterio de aceite:

- `article-analysis` opera por colecao com escopo explicito
- o dashboard deixa claro qual colecao alimentou a resposta

---

## `P1` - Alta prioridade

Estes itens aumentam qualidade real logo depois do bloco obrigatorio.

### `P1.1` Golden dataset forte para `issue-validation`

Problema:

- o modo de issues depende de um prompt de decisao e precisa de regressao forte orientada por produto

Trabalho:

- fortalecer dataset rotulado de `issue-validation`
- incluir casos de:
  - issue pronta para dev
  - issue incompleta
  - issue que deve ser cancelada
  - issue com anexos contraditorios
  - issue com risco alto e revisao humana

Criterio de aceite:

- existe dataset versionado em disco para o modo de issues
- `POST /api/v1/evaluate/compare` roda cenarios contra ele
- ha metricas por provider, LangGraph e configuracao de runtime

### `P1.2` Dataset proprio para retrieval de `article-analysis`

Problema:

- o modo de artigos ja tem retrieval adaptativo, mas ainda precisa de benchmark reproduzivel mais forte

Trabalho:

- criar dataset rotulado de retrieval para artigos
- incluir:
  - query
  - doc esperado
  - pagina esperada
  - tipo de chunk esperado
  - termos obrigatorios
- separar casos por tipo:
  - factual simples
  - comparativo
  - multi-hop
  - page-level
  - consulta que deve resultar em `human review`

Criterio de aceite:

- existe dataset versionado em disco
- `POST /api/v1/articles/evaluate` roda contra ele
- ha metricas por modo de retrieval

### `P1.3` Citacao page-level obrigatoria para afirmacoes fortes em artigos

Problema:

- a resposta pode soar segura demais sem apontar pagina, secao ou trecho

Trabalho:

- reforcar `exact-page`
- expor pagina, secao e tipo de chunk na UI
- exigir citacao forte para claims centrais

Criterio de aceite:

- principais afirmacoes em review de artigo exibem origem page-level quando disponivel

### `P1.4` Politica padrao de retrieval mais dura para `article-analysis`

Problema:

- o app suporta muitos modos, mas ainda precisa de um default mais opinativo e medido

Trabalho:

- consolidar default recomendado:
  - `vector-global` ou `hybrid`
  - `exact-page` quando houver pedido literal
  - `corrective` quando cobertura vier baixa
  - `GraphRAG` apenas em queries relacionais
- tornar a escolha do modo explicita no audit
- so depois avaliar se vale trazer `reranker` e `distillation` como parte forte do runtime de artigos

Criterio de aceite:

- existe configuracao default defendivel para `article-analysis`
- a auditoria mostra por que um modo foi escolhido

### `P1.5` Auditoria de chunking e deduplicacao

Problema:

- chunk ruim e duplicacao degradam recall e ranking

Trabalho:

- medir overlap e duplicacao de chunks
- identificar chunks muito curtos, muito longos ou redundantes
- ajustar heuristicas por tipo de documento

Criterio de aceite:

- existe relatorio simples de qualidade de chunking por colecao
- retrieval usa corpus menos duplicado

### `P1.6` Distillation e token budget como politica real

Problema:

- compressao de contexto ainda corre o risco de ser tratada como opcional e opaca

Trabalho:

- definir orcamento de contexto por tipo de tarefa
- separar politica de contexto para:
  - `issue-validation`
  - `article-analysis`
- registrar o quanto foi comprimido e o que ficou de fora

Criterio de aceite:

- cada run informa contexto bruto vs contexto final
- ha ganho de custo sem perda clara de qualidade

---

## `P2` - Escala, custo e operacao

### `P2.1` Comparacao continua em CI

Problema:

- mudancas em prompts, retrieval e runtime podem degradar o sistema silenciosamente

Trabalho:

- rodar `evaluate/compare` em CI para `issues`
- rodar `articles/evaluate` em CI para `artigos`
- publicar relatorios agregados

Criterio de aceite:

- regressao relevante bloqueia merge ou gera alerta explicito

### `P2.2` Semantic cache e context cache

Problema:

- repeticao de retrieval e montagem de contexto eleva custo e latencia

Trabalho:

- cachear respostas para perguntas equivalentes quando isso for seguro
- cachear pacotes de contexto recuperado
- separar estrategia de cache por modo

Criterio de aceite:

- consultas repetidas economizam chamadas e tempo

### `P2.3` DSPy apenas onde houver metrica estavel

Problema:

- otimizar prompt sem dataset confiavel vira automacao de ruina

Trabalho:

- restringir DSPy ao modo que tenha dataset e metrica clara
- manter foco principal em `issue-validation` enquanto o runtime de artigos ainda nao tiver compare end-to-end

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

1. `P0.1` Contrato de decisao para `issue-validation`
2. `P0.2` Taxonomia de falhas na auditoria
3. `P0.3` Confidence gating e abstencao
4. `P0.4` Context packet confiavel para `issue-validation`
5. `P0.5` Curadoria de corpus e isolamento por colecao
6. `P1.1` Golden dataset forte para `issue-validation`
7. `P1.2` Dataset proprio para retrieval de `article-analysis`
8. `P1.3` Citacao page-level obrigatoria
9. `P1.4` Politica padrao de retrieval
10. `P1.5` Auditoria de chunking e deduplicacao
11. `P1.6` Distillation e token budget
12. `P2.1` Compare em CI
13. `P2.2` Cache
14. `P2.3` DSPy seletivo

## O que nao fazer agora

- nao tratar `issues` e `artigos` como se tivessem o mesmo problema tecnico central
- nao expandir GraphRAG para todo caso de uso
- nao aumentar complexidade agentic sem dataset mais forte
- nao otimizar prompt cegamente sem metrica confiavel
- nao misturar mais corpus antes de resolver curadoria

## Resultado esperado quando este backlog for concluido

O sistema deve passar a ser:

- melhor em triagem de issues com base no prompt principal + contexto completo
- melhor em analise de artigos com grounding mais forte
- mais auditavel
- mais explicavel para o usuario
- menos sujeito a alucinacao silenciosa
- mais barato de operar em consultas repetidas
- mais seguro para evoluir sem regressao escondida
