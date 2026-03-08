# Tecnicas Existentes no App

Este documento resume as tecnicas realmente presentes no app hoje, separando o que ja roda no runtime principal do que ainda e mais experimental no canvas.

## Visao Geral

O app combina tres camadas principais:

- pipeline base de validacao de issue
- tecnicas de RAG, GraphRAG e retrieval hibrido
- tecnicas agentic, prompts e avaliacao offline

A arquitetura central segue a ideia de `facts first, judge later`: primeiro o sistema estrutura fatos, regras e evidencias; depois entrega contexto controlado ao juiz LLM.

## 1. Pipeline Base de Validacao

O fluxo principal de validacao esta em `src/jira_issue_rag/services/workflow.py`.

Etapas principais:

1. normalizacao da issue
2. processamento dos artefatos
3. regras deterministicas
4. retrieval de evidencias
5. distillation de contexto
6. julgamento por provider
7. auditoria da execucao

Tecnicas presentes nessa camada:

- normalizacao de issue Jira em estrutura canonica
- pipeline multimodal de artefatos
- decisao guiada por regras antes do LLM
- trilha de auditoria em JSON por execucao

## 2. Parsing e Extracao de Artefatos

O app processa diferentes tipos de evidencia:

- logs e textos
- PDFs
- planilhas
- imagens com OCR

Objetivo:

- transformar anexos brutos em fatos reaproveitaveis no retrieval e nas regras
- extrair IDs, linhas de erro, sinais de contradicao e contexto operacional

Essa camada sustenta o modelo `facts first, judge later`.

## 3. Regras Deterministicas

Antes de chamar o juiz LLM, o sistema roda verificacoes deterministicas sobre:

- completude da issue
- contradicoes entre evidencias
- impacto financeiro
- necessidade de revisao humana

Essa tecnica reduz alucinacao, melhora auditabilidade e impede que o LLM seja a unica fonte de decisao.

## 4. Retrieval Hibrido

O retrieval principal combina busca lexical e semantica.

Tecnicas existentes:

- sparse retrieval
- dense retrieval
- fusao de scores
- fallback local quando o store externo nao esta disponivel

No codigo, isso aparece principalmente em:

- `src/jira_issue_rag/services/retrieval.py`
- `src/jira_issue_rag/services/qdrant_store.py`

No canvas, essa tecnica aparece como `Hybrid BM25 + Dense`.

## 5. Cascade Retrieval

Quando habilitado, o app usa uma estrategia de two-pass retrieval no Qdrant:

1. over-retrieve inicial
2. refinamento posterior dos candidatos

Objetivo:

- aumentar recall sem perder muito precision
- recuperar evidencias fracas na primeira passada e ordenar melhor depois

## 6. Reranking

Depois do retrieval, o app pode reranquear as evidencias.

Tecnicas presentes:

- cross-encoder reranking quando runtime/dependencias permitem
- reranking heuristico como fallback

Objetivo:

- reforcar precision em IDs, mensagens de erro, sinais de log e artefatos mais relevantes

Arquivo principal:

- `src/jira_issue_rag/services/rerank.py`

## 7. Distillation de Contexto

O app nao entrega todas as evidencias cruas ao juiz. Antes disso, ele destila o contexto.

Modos existentes:

- `simple`
- `refrag`

Objetivo:

- reduzir ruido
- preservar fatos e quotes importantes
- comprimir contexto para julgamento mais controlado

Arquivo principal:

- `src/jira_issue_rag/services/distiller.py`

## 8. GraphRAG de Issues

O app ja possui GraphRAG com Neo4j para o dominio de issues.

Estruturas principais:

- `Issue`
- `Component`
- `Service`
- `Environment`
- `ErrorFingerprint`

Relacoes principais:

- links entre issues
- issue para componente
- issue para servico
- issue para ambiente
- issue para fingerprint de erro

Tecnicas de retrieval no grafo:

- busca por vizinhanca de profundidade 2
- busca por issues com erro compartilhado

Arquivo principal:

- `src/jira_issue_rag/services/neo4j_store.py`

## 9. GraphRAG de Artigos

Para o dominio de artigos, o app tem um grafo separado para nao misturar com o grafo de issues.

Estruturas principais:

- `Article`
- `Topic`

Relacoes principais:

- `HAS_TOPIC`
- `SHARES_TOPIC`

Objetivo:

- recuperar artigos relacionados
- conectar documentos por topicos comuns
- apoiar o modo `article-analysis`

Arquivo principal:

- `src/jira_issue_rag/services/article_store.py`

## 10. Temporal GraphRAG

O app agora tambem possui uma camada temporal real.

### Para issues

Tecnicas existentes:

- leitura temporal do changelog
- resumo do estado atual orientado por timeline
- cronologia recente da issue
- eventos temporais individuais
- persistencia de `collected_at` e `latest_change_at` no Neo4j

Objetivo:

- distinguir estado atual vs historico
- melhorar analise de mudancas de status, prioridade e versao
- dar base para consultas temporais futuras

### Para artigos

Tecnicas existentes:

- extracao best effort de `published_at`
- extracao de `published_year`
- `canonical_title`
- deteccao de `version_label`
- arestas `EARLIER_VERSION_OF` e `LATER_VERSION_OF`

Objetivo:

- conectar versoes do mesmo artigo ou documento
- detectar conhecimento mais atual
- preparar o app para comparacao de versoes

Arquivos principais:

- `src/jira_issue_rag/services/retrieval.py`
- `src/jira_issue_rag/services/article_store.py`
- `src/jira_issue_rag/services/neo4j_store.py`

## 11. Orquestracao Agentic com LangGraph

Quando `ENABLE_LANGGRAPH=true`, o app usa uma execucao mais agentic.

Tecnicas presentes:

- planner
- query rewriter
- reflection memory
- policy loop

Modos existentes:

- planner: `step-plan`, `tool-aware`
- query rewriter: `metadata-aware`, `hyde`
- reflection: `summary-log`, `evidence-ledger`
- temporal graph: `fact-graph`, `versioned-graph`

Objetivo:

- quebrar a busca em etapas
- refinar queries dinamicamente
- acumular memoria de tentativa
- decidir quando rodar novos ciclos de busca e politica

Arquivo principal:

- `src/jira_issue_rag/services/langgraph_workflow.py`

## 12. Prompt Catalog e Prompt-Driven Execution

O app separa engine de comportamento textual usando prompts versionados em disco.

Prompts conhecidos:

- `triage_test`
- `article_analysis`

Tecnicas existentes:

- catalogo local de prompts
- execucao generica por nome
- uso de prompt especifico por cenario

Arquivos principais:

- `src/jira_issue_rag/services/prompt_catalog.py`
- `src/jira_issue_rag/services/decision.py`

## 13. Multi-Provider Routing

O app suporta multiplos providers:

- `mock`
- `openai`
- `gemini`
- `ollama`

Tecnicas existentes:

- roteamento por provider
- fallback automatico para `mock`
- bloqueio por modo confidencial

Objetivo:

- permitir teste local
- alternar custo e latencia
- respeitar politica de confidencialidade

## 14. Article Analysis

O app possui um modo especifico de analise de artigos.

Tecnicas presentes:

- `PromptCatalog` para analise textual
- `ArticleStore` para ingestao e busca
- busca opcional no corpus antes de executar o prompt
- related articles via Qdrant ou Neo4j

Hoje esse modo esta integrado ao canvas por `flow-mode = article-analysis`.

## 15. Avaliacao Offline

O app ja tem uma camada solida de avaliacao.

Capacidades existentes:

- golden dataset evaluation
- comparacao de cenarios
- replay de auditoria
- metricas operacionais no estilo RAGAS
- medicao de drift

Objetivo:

- comparar combinacoes de retriever, provider e runtime
- medir regressao
- avaliar impacto de novas tecnicas sem depender de percepcao subjetiva

### 15.1 O Que E RAGAS

`RAGAS` e um framework de avaliacao para pipelines RAG.

Ele nao existe para responder ao usuario final. Ele existe para medir se o seu sistema RAG esta funcionando bem.

Na pratica, ele tenta responder perguntas como:

- a resposta final esta fiel ao contexto recuperado?
- o retrieval trouxe contexto relevante?
- o retrieval trouxe ruido demais?
- faltou contexto importante para responder bem?

As familias de metricas mais conhecidas sao:

- `faithfulness`: a resposta esta apoiada no contexto ou inventou fatos?
- `answer relevancy`: a resposta realmente responde a tarefa?
- `context precision`: o contexto recuperado foi util ou veio muito lixo junto?
- `context recall`: o retrieval encontrou o que era necessario ou deixou passar evidencia importante?

No seu app, existem dois niveis de uso:

- `RAGAS-style proxies`: metricas operacionais locais inspiradas em RAGAS
- `RAGAS runtime`: execucao opcional do pacote `ragas` quando ele esta instalado

Hoje, o backend calcula proxies como:

- `answer_correctness_proxy`
- `faithfulness_proxy`
- `context_precision_proxy`
- `context_recall_proxy`
- `contradiction_alignment`

Esses proxies sao uteis porque:

- custam pouco
- nao dependem de um runtime pesado
- ajudam a comparar cenarios rapidamente

Quando `use_ragas_runtime=true`, o app tambem tenta rodar a integracao real do pacote `ragas`. No estado atual do projeto, essa integracao esta focada em metricas non-LLM e comparacao offline, nao em governar a decisao online do `/run-flow`.

### 15.2 O Que Faz Sentido No Fluxo Real

Pelo codigo atual, `RAGAS` faz sentido principalmente como camada de avaliacao e regressao, nao como etapa obrigatoria do runtime principal.

Conclusao pratica:

- nao faz sentido colocar `RAGAS` bloqueando ou dirigindo a decisao principal do `/run-flow`
- faz sentido usar `RAGAS` para comparar cenarios, medir qualidade do retrieval e detectar regressao
- se quiser aproximar `RAGAS` do fluxo real, o melhor primeiro passo e expor scores leves de qualidade apos a execucao, sem transformar isso em gate da decisao

O que eu consideraria implementar no fluxo real, se voce quiser evoluir:

- `post-run quality signals` no audit e no response, por exemplo um score leve de grounding/context quality
- `warning flag` quando a resposta parecer pouco suportada pelas evidencias recuperadas
- comparacao offline automatica entre variantes de retriever, reranker e graph

O que eu nao implementaria agora:

- rodar o pacote completo `ragas` em toda execucao online
- usar `RAGAS` como gate duro para aceitar ou rejeitar a decisao
- acoplar latencia de avaliacao ao caminho critico do usuario

## 16. O Que Ja E Runtime Real

Estas tecnicas ja fazem parte do runtime principal:

- pipeline `facts first, judge later`
- parsing de artefatos
- regras deterministicas
- retrieval hibrido
- cascade retrieval
- reranking
- distillation
- GraphRAG com Neo4j
- Temporal GraphRAG
- LangGraph agentic
- PromptCatalog
- multi-provider routing
- avaliacao offline

## 17. O Que Ainda Esta Mais Exploratorio

No canvas existem elementos que hoje estao mais proximos de laboratorio do que do runtime central:

- `RAGAS`

`DSPy` deixou de ser apenas descritivo no `issue-validation`: quando o no esta ativo, o backend pode acionar o lab de otimizacao com DSPy 3 + GEPA, avaliar contra o golden dataset e exportar prompts otimizados de volta para `prompts/`.

`RAGAS` continua mais exploratorio no canvas: ele ja existe no backend de avaliacao offline, mas ainda nao altera de forma forte a execucao principal do `/run-flow` como os modulos de retrieval, graph, reranking, distillation e LangGraph.

## 18. Resumo Estrategico

Em termos práticos, o app hoje pode ser descrito assim:

- um sistema de validacao de issues guiado por fatos e regras
- com retrieval hibrido e opcionalmente GraphRAG
- com camada agentic via LangGraph
- com suporte a analise de artigos
- com trilha de auditoria e avaliacao offline

O diferencial atual nao esta em um unico modelo, e sim na combinacao entre:

- regras deterministicas
- retrieval controlado
- compressao de contexto
- grafo de relacionamento
- operacao temporal
- fallback seguro de providers

## 19. Precisao vs Custo

No app, a forma mais eficaz de aumentar a precisao nao e trocar diretamente para o provider mais caro. O ganho maior vem de melhorar a qualidade do contexto entregue ao provider.

### 19.1 O Que Mais Aumenta a Precisao

As maiores alavancas de precisao hoje sao:

- `regras deterministicas`: removem erros obvios, faltas e contradicoes antes do LLM
- `retrieval hibrido`: melhora cobertura semantica e keyword ao mesmo tempo
- `reranker`: sobe as evidencias mais relevantes e reduz ruido
- `distillation`: comprime o contexto e preserva os fatos importantes
- `GraphRAG`: adiciona contexto relacional entre issues, servicos e erros
- `Temporal GraphRAG`: melhora casos com historico, versao e ordem temporal
- `LangGraph agentic`: planner, rewriter e reflection ajudam em casos mais dificeis
- `prompt certo`: instrucoes mais alinhadas reduzem erro de interpretacao

Em termos praticos, a precisao sobe quando o provider recebe:

- menos ruido
- evidencias melhores
- contexto mais estruturado
- relacoes e historico quando isso importa

### 19.2 O Que Mais Reduz Custo Sem Perder Qualidade

As principais alavancas para baratear custo sem degradar o resultado sao:

- mandar menos tokens para o provider
- usar modelo mais barato por padrao
- reservar modelo caro para casos ambiguos ou de alto risco
- melhorar o retrieval para nao compensar contexto ruim com LLM caro

No app, isso normalmente significa:

- manter `reranker` ligado
- usar `distillation` para reduzir contexto
- usar `simple` por padrao e `refrag` apenas quando faz sentido
- usar `gpt-4o mini`, `gemini flash` ou `ollama` nos casos normais
- escalar para provider mais caro so quando houver baixa confianca, contradicao ou risco financeiro
- usar `DSPy 3 + GEPA` para melhorar prompts e extrair mais qualidade de modelos medianos

### 19.3 Melhor Combinacao Hoje

Se o objetivo for equilibrio entre qualidade e custo, a combinacao mais sensata no estado atual do app e:

- retrieval hibrido
- reranker
- distillation
- GraphRAG ou Temporal GraphRAG apenas quando o caso pedir relacao ou historico
- provider barato por padrao
- provider caro so em casos complexos

Em resumo:

- mais precisao = contexto melhor antes do provider
- menor custo = menos tokens, melhor contexto e roteamento inteligente de provider
