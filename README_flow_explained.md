# README Flow Explained

Este documento explica o fluxo real do app, as tecnicas envolvidas em cada etapa, o que entra e sai de cada componente, e por que esse desenho tende a ser melhor do que enviar todo o material bruto de uma vez para o LLM.

O objetivo aqui nao e vender complexidade. E separar:

- o que o pipeline realmente faz hoje
- onde ele agrega valor de verdade
- onde ele so adiciona custo operacional
- quando um fluxo simples "prompt + tudo no contexto" seria suficiente

## 1. Resposta curta

O app nao foi desenhado como um simples "prompt wrapper".

Ele segue o principio:

`facts first, judge later`

Na pratica isso significa:

1. estruturar a entrada antes da decisao
2. extrair sinais de anexos e documentos
3. detectar faltas e contradicoes por regra
4. recuperar so o contexto mais util
5. comprimir o contexto quando necessario
6. chamar o LLM somente no fim, com um pacote mais controlado

Contra a estrategia de "mandar tudo para o LLM", esse desenho tenta ganhar em:

- grounding
- auditabilidade
- repetibilidade
- custo previsivel
- menor ruido
- melhor suporte a anexos
- avaliacao offline

Ele perde em:

- simplicidade
- latencia
- manutencao
- numero de pontos de falha

Entao a pergunta correta nao e "o pipeline e melhor sempre?".

A pergunta correta e:

`em quais tipos de tarefa vale a pena pagar o custo da orquestracao para reduzir erro, ruido e opacidade?`

Para este app, a resposta atual e:

- `issue-validation`: sim, quase sempre
- `article-analysis`: sim, quando ha corpus, retrieval, comparacao entre documentos, page-level grounding ou colecao persistida; nao necessariamente quando e so um texto curto isolado

## 2. Os dois produtos dentro do mesmo app

Hoje o repositorio suporta dois modos de trabalho principais:

### 2.1 `issue-validation`

Objetivo:

- receber uma issue do Jira
- considerar texto de abertura, campos estruturados, comentarios e anexos
- validar se aquilo esta suficiente para seguir para desenvolvimento
- decidir entre algo como:
  - seguir para desenvolvimento
  - devolver pedindo mais informacao
  - nao tratar como bug
  - exigir revisao humana

Fluxo principal:

- `ValidationWorkflow`
- `IssueNormalizer`
- `ArtifactPipeline`
- `RulesEngine`
- `HybridRetriever`
- `DistillerService`
- `ProviderRouter`
- `AuditStore`

### 2.2 `article-analysis`

Objetivo:

- receber um artigo ou um corpus de artigos
- indexar o material
- montar uma query de busca
- recuperar trechos relevantes
- produzir analise comparativa, resumo tecnico e recomendacoes

Fluxo principal:

- `ArticleStore`
- `build_article_search_query`
- `assess_graph_usefulness`
- `search` com politica adaptativa
- `corrective RAG` opcional
- `distill_for_small_model` opcional
- `build_article_prompt_packet`
- `ProviderRouter`
- `AuditStore`

Importante: o app compartilha infraestrutura entre os dois dominios, mas os pipelines nao sao simetricos.

`issue-validation` e mais `prompt-centric + evidence-centric`.

`article-analysis` e mais `retrieval-centric + grounding-centric`.

## 3. O baseline alternativo: "mandar tudo de uma vez para o LLM"

Antes de defender o pipeline, vale definir o baseline de comparacao.

Essa abordagem seria algo como:

1. pegar texto da issue ou do artigo
2. juntar todos os campos e anexos convertidos para texto
3. colar tudo em um prompt grande
4. pedir a decisao final ao modelo

### 3.1 Vantagens reais dessa abordagem

- implementacao muito mais simples
- menos componentes para manter
- menos latencia de orquestracao
- menos risco de erro de integracao entre estagios
- pode funcionar surpreendentemente bem em casos pequenos e limpos

### 3.2 Limites reais dessa abordagem

- contexto cresce rapido demais
- anexos ruins ou ruidosos contaminam o julgamento
- o modelo precisa descobrir sozinho o que importa
- fica dificil reproduzir por que uma decisao saiu daquele jeito
- quase nao existe observabilidade por etapa
- retrieval externo, grafo e page-level grounding ficam subutilizados
- benchmarking vira "caixa preta"
- qualquer erro de parsing vira erro silencioso no prompt final

### 3.3 Em que casos o baseline ainda e aceitavel

- issue curta, sem anexo, com descricao excelente
- texto unico, sem necessidade de citacao precisa
- prototipo rapido
- etapa exploratoria antes de investir em pipeline
- workloads em que custo de engenharia importa mais do que auditabilidade

Ou seja: a alternativa nao e absurda. Ela so deixa de escalar bem quando o objetivo passa a ser decisao confiavel, explicavel e repetivel.

## 4. Principio central do app: preparar antes de julgar

O app tenta separar dois problemas que o baseline mistura:

### 4.1 Preparacao de evidencia

- padronizar a entrada
- extrair texto de formatos heterogeneos
- detectar faltas e contradicoes
- achar trechos relevantes
- comprimir o material

### 4.2 Julgamento final

- classificar
- recomendar proxima acao
- justificar
- gerar analise textual

Essa separacao e importante porque o LLM e bom em sintese, julgamento contextual e linguagem, mas nao necessariamente e o melhor lugar para:

- descobrir tudo do zero em um monte de texto sujo
- fazer roteamento operacional
- detectar se um anexo nem conseguiu ser lido
- medir cobertura de retrieval
- manter trilha de auditoria etapa por etapa

## 5. Fluxo profundo de `issue-validation`

## 5.1 Entrada

O fluxo de issue recebe, em essencia:

- texto inicial da issue
- campos estruturados do Jira
- comentarios
- metadata operacional
- anexos locais ou baixados do Jira

Saida esperada:

- um `DecisionResult` estruturado
- classificacao
- prontidao para desenvolvimento
- missing items
- bloqueadores
- contradicoes
- confidence
- revisao humana
- `next_action`
- racional
- auditoria completa

## 5.2 Etapa 1: normalizacao da issue

Componente:

- `IssueNormalizer`

O que entra:

- `IssueCanonical` ainda cru

O que faz:

- limpa campos textuais
- colapsa espacos e linhas em branco
- remove ruido estrutural simples
- tenta inferir `acceptance_criteria` e `reproduction_steps` a partir do texto quando estes nao vieram preenchidos

O que sai:

- `IssueCanonical` mais consistente

Beneficio versus mandar tudo direto ao LLM:

- reduz variacao de formato
- evita que o prompt dependa demais de como o usuario escreveu
- melhora consistencia da etapa seguinte

Trade-off:

- ganho moderado
- sozinho nao transforma qualidade de decisao

Se remover:

- o sistema ainda funciona
- mas perde regularidade e aumenta a ambiguidade estrutural

## 5.3 Etapa 2: processamento de anexos

Componente:

- `ArtifactPipeline`

O que entra:

- caminhos de arquivos
- logs
- txt/md/json
- PDFs
- planilhas
- imagens

O que faz:

- detecta tipo do arquivo
- extrai texto
- tenta OCR/vision para imagem
- extrai fatos como:
  - IDs
  - timestamps
  - amounts
  - linhas de erro
  - relatorio de extracao PDF
- calcula `confidence` por artefato
- registra `missing_information` quando algo nao existe ou nao foi lido
- detecta contradicoes basicas entre artefatos

O que sai:

- `AttachmentFacts`

Beneficio versus mandar tudo direto ao LLM:

- transforma multimodalidade em texto e fatos reaproveitaveis
- permite saber quando o app sequer conseguiu ler o anexo
- reduz dependencia de o LLM "notar" sozinho IDs, datas e erros
- habilita regras e retrieval em cima de fatos extraidos

Trade-off:

- parsing imperfeito
- OCR pode falhar
- adicionar mais extratores aumenta manutencao

Se remover:

- o sistema perde a maior parte do valor sobre anexos
- imagem vira quase opaca
- PDF vira blob de texto mal controlado
- fica muito mais proximo do baseline "manda tudo para o modelo e torce"

## 5.4 Etapa 3: regras deterministicas

Componente:

- `RulesEngine`

O que entra:

- `IssueCanonical`
- `AttachmentFacts`

O que faz:

- verifica campos obrigatorios para bug
- verifica `reproduction_steps`
- sinaliza `issue_type` fora de `bug`
- detecta faltas de informacao em anexos
- detecta contradicoes
- detecta vocabulario financeiro
- compara totais em planilhas
- compara totais entre planilha e log
- deriva `requires_human_review`

O que sai:

- `RuleEvaluation`

Beneficio versus mandar tudo direto ao LLM:

- move parte do julgamento para logica explicita e auditavel
- reduz chance de o modelo ignorar ausencias obvias
- protege casos sensiveis como financeiro
- cria sinal forte antes da geracao

Trade-off:

- regras podem envelhecer
- regras mal calibradas geram falso positivo
- nao cobrem tudo

Se remover:

- o LLM vira unico guardiao da qualidade
- cai a auditabilidade
- aumenta a variabilidade entre execucoes

## 5.5 Etapa 4: construcao de query de retrieval

Componente:

- `HybridRetriever.build_query`
- query variants opcionais

O que entra:

- issue
- attachment facts
- resultados das regras

O que faz:

- sintetiza uma query com:
  - issue key
  - summary
  - actual vs expected
  - labels
  - contradicoes
  - IDs e linhas de erro dos anexos
- opcionalmente cria variantes com metadata

O que sai:

- query principal
- variantes de query

Beneficio versus mandar tudo direto ao LLM:

- separa "material de busca" de "material de julgamento"
- retrieval nao precisa receber o prompt inteiro
- melhora precision para achar evidencias externas e historicas

Trade-off:

- query ruim puxa contexto ruim
- pode perder nuance se simplificar demais

## 5.6 Etapa 5: retrieval hibrido

Componente:

- `HybridRetriever`

O que entra:

- query
- issue
- attachment facts
- rule evaluation

O que faz:

- monta documentos internos:
  - resumo da issue
  - expected vs actual
  - comentarios
  - anexos extraidos
  - snippets de policy
- calcula score sparse e dense localmente
- combina isso com busca externa em Qdrant quando disponivel
- pode usar query fusion
- pode buscar vizinhanca no Neo4j
- pode adicionar resultados temporais
- passa por selecao diversa de top-k
- opcionalmente passa por reranker

O que sai:

- lista de `RetrievedEvidence`

Beneficio versus mandar tudo direto ao LLM:

- evita despejar tudo no prompt final
- traz historico ou evidencias externas relevantes
- faz o modelo receber mais sinal e menos massa
- melhora recall de coisas que nao cabem no prompt principal

Trade-off:

- retrieval errado induz decisao errada
- depende de indice externo para o melhor desempenho
- exige calibracao de top-k, variantes e score fusion

Se remover:

- o app perde memoria externa e seletividade
- anexos e comentarios continuam presentes, mas sem priorizacao real

## 5.7 Etapa 6: reranking

Componente:

- `Reranker`

O que entra:

- query
- evidencias candidatas

O que faz:

- reordena candidatos
- tenta subir os itens mais uteis para a decisao

O que sai:

- top-k mais preciso

Beneficio versus mandar tudo direto ao LLM:

- melhora qualidade do contexto sem aumentar tamanho
- ataca um problema especifico: "os chunks certos estao presentes, mas mal ordenados"

Trade-off:

- mais latencia
- beneficio depende da qualidade dos candidatos

Se remover:

- recall pode continuar bom, mas precision do topo tende a cair

## 5.8 Etapa 7: distillation

Componente:

- `DistillerService`

Modos:

- `simple`
- `refrag`

O que entra:

- retrieved evidence
- rule evaluation

O que faz:

- `simple`:
  - pega primeiras sentencas
  - preserva quotes e tokens criticos por regex
- `refrag`:
  - extrai tokens que nao podem ser parafraseados
  - usa um LLM menor ou mais barato para comprimir a evidencia
  - preserva IDs, valores, timestamps, exceptions, versoes

O que sai:

- `DistilledContext`

Beneficio versus mandar tudo direto ao LLM:

- reduz ruido
- controla token budget
- preserva detalhes sensiveis sem mandar chunks inteiros demais
- melhora robustez do prompt final

Trade-off:

- toda compressao pode perder nuance
- distillation com LLM cria custo e mais uma superficie de erro

Se remover:

- o prompt final fica maior e mais ruidoso
- modelos menores sofrem mais

## 5.9 Etapa 8: julgamento final por prompt + provider

Componente:

- `ProviderRouter`
- `PromptCatalog`
- prompts como `triage_test` e `judge_bug`

O que entra:

- `JudgeInput`
- prompt escolhido
- provider escolhido

O que faz:

- renderiza o prompt com o pacote estruturado
- executa no provider configurado
- espera um contrato de saida

No caso de `judge_bug`, o modelo recebe explicitamente:

- facts
- contradicoes
- completude
- distilled context
- rule evaluation

E devolve:

- classificacao
- readiness
- blockers
- missing items
- evidence_used
- contradictions
- confidence
- `requires_human_review`
- `next_action`
- rationale

Beneficio versus mandar tudo direto ao LLM:

- o modelo vira juiz de um pacote preparado, nao minerador de caos
- prompt mais estavel
- output mais contratual

Trade-off:

- a qualidade da decisao depende da qualidade de todas as etapas anteriores

## 5.10 Etapa 9: LangGraph opcional

Componente:

- `LangGraphValidationRunner`

Quando habilitado, o fluxo deixa de ser linear e ganha uma logica agentic:

1. normalize
2. rules
3. plan
4. rewrite
5. retrieve
6. distill
7. reflect
8. policy
9. judge

O que cada etapa extra agrega:

- `plan`: quebra a pesquisa em queries
- `rewrite`: reescreve query com estrategia especifica
- `reflect`: acumula notas de falha ou cobertura
- `policy`: decide continuar pesquisando ou julgar
- `interrupt`: permite revisao humana intermediaria

Beneficio versus mandar tudo direto ao LLM:

- reduz dependencia de um unico retrieval
- melhora casos dificeis e multi-hop
- cria trilha detalhada de tentativas

Trade-off:

- muito mais latencia
- muito mais complexidade
- retorno marginal ruim para casos simples

Observacao importante:

Para issue triage, isso e util quando a busca precisa ser iterativa. Para casos simples, pode ser excesso.

## 5.11 Etapa 10: auditoria e avaliacao

Componentes:

- `AuditStore`
- `GoldenDatasetEvaluator`

O que entra:

- issue
- attachment facts
- rules
- retrieved
- distilled
- decision
- runtime state

O que faz:

- grava a execucao completa em JSON
- permite replay
- permite comparacao de cenarios
- permite avaliacao em golden dataset

Beneficio versus mandar tudo direto ao LLM:

- observabilidade real
- explicabilidade operacional
- medicao offline
- capacidade de evoluir o sistema sem voar cego

Trade-off:

- armazenamento
- disciplina de schema

Sem isso:

- qualquer tuning de pipeline vira opiniao, nao engenharia

## 6. Fluxo profundo de `article-analysis`

O pipeline de artigos nao e apenas "colar PDF no prompt". Ele tenta separar ingestao, indexacao, roteamento de retrieval e so depois analise.

## 6.1 Entrada

O fluxo de artigo pode receber:

- titulo
- conteudo bruto
- metadata
- documentos-fonte
- query explicita opcional
- configuracao de retrieval

Saida esperada:

- analise textual
- trechos recuperados
- benchmark entre modos
- distillation opcional
- qualidade de grounding
- auditoria

## 6.2 Etapa 1: ingestao e chunking

Componente:

- `ArticleStore.ingest`

O que faz:

- le PDFs ou txt/md
- extrai texto
- divide em chunks
- preserva metadados como:
  - `chunk_kind`
  - `page_number`
  - `section_title`
  - `page_span`
  - `table_title`
  - `figure_caption`
- gera embeddings
- indexa em Qdrant
- cria grafo separado de artigos no Neo4j
- extrai topicos, entidades e relacoes temporais

Beneficio versus mandar tudo direto ao LLM:

- transforma um corpus em base pesquisavel
- habilita page-level grounding
- evita reprocessar o PDF inteiro a cada pergunta
- permite buscar so a parte relevante

Trade-off:

- custo de ingestao
- dependencia de infraestrutura
- precisa de estrategia de colecao e tenant

## 6.3 Etapa 2: avaliacao de utilidade do grafo

Componente:

- `assess_graph_usefulness`

O que faz:

- estima se a query parece pedir:
  - ligacoes entre entidades
  - relacoes entre versoes
  - multi-hop
  - ponte entre documentos
  - recuperacao mais literal

Beneficio versus mandar tudo direto ao LLM:

- evita usar grafo quando nao agrega
- evita usar vetor puro quando a pergunta e relacional

Trade-off:

- se o roteamento errar, a politica de busca pode ser subotima

## 6.4 Etapa 3: resolucao de politica de retrieval

Componente:

- `ArticleStore.search`

Politicas suportadas:

- `auto`
- `vector-global`
- `graph-local`
- `graph-bridge`
- `graph-multi-hop`
- `exact-page`
- `corrective`

O que isso significa:

- `vector-global`: busca semantica mais ampla
- `graph-local`: expande vizinhanca relacional curta
- `graph-bridge`: tenta conectar artigos ou topicos relacionados
- `graph-multi-hop`: segue caminhos mais longos no grafo
- `exact-page`: prioriza match literal/page-level
- `corrective`: segunda passada quando a primeira trouxe cobertura fraca

Beneficio versus mandar tudo direto ao LLM:

- separa tipo de pergunta de tipo de busca
- melhora precision para consultas com pagina, secao, tabela, versao ou relacao entre documentos

Trade-off:

- maior complexidade de tuning

## 6.5 Etapa 4: corrective RAG

Componente:

- `_needs_corrective_pass`
- `_run_corrective_search`

O que faz:

- mede se a primeira busca veio fraca
- reexecuta retrieval em modo corretivo quando necessario

Beneficio versus mandar tudo direto ao LLM:

- melhora cobertura quando o primeiro passe falha
- reduz falso negativo de retrieval

Trade-off:

- mais latencia
- risco de aumentar recall com perda de precision

## 6.6 Etapa 5: related articles

Componente:

- `related_articles`

O que faz:

- busca artigos relacionados via Neo4j
- se nao houver grafo, tenta fallback via Qdrant

Beneficio versus mandar tudo direto ao LLM:

- ajuda a contextualizar um documento dentro de um corpus
- permite enxergar convergencia e divergencia entre textos

Trade-off:

- so faz sentido quando existe corpus indexado

## 6.7 Etapa 6: benchmark de modos de retrieval

Componente:

- `benchmark_query_modes`

O que faz:

- roda e compara cenarios:
  - dense
  - hybrid
  - graph
  - exact-page
  - adaptive
  - corrective
- calcula proxies como:
  - `avg_score`
  - `precision_proxy`
  - `recall_proxy`
  - `faithfulness_proxy`

Beneficio versus mandar tudo direto ao LLM:

- permite avaliar a parte mais silenciosa do sistema: retrieval
- evita depender apenas da qualidade textual do resumo final

Trade-off:

- custo adicional de execucao

## 6.8 Etapa 7: distillation para modelo menor

Componente:

- `distill_for_small_model`

O que faz:

- resume o que foi recuperado
- destaca entidades, topicos e caminhos de evidencia

Beneficio versus mandar tudo direto ao LLM:

- ajuda quando o modelo final e pequeno
- reduz custo e ruido sem abandonar grounding

Trade-off:

- compressao pode ocultar nuance metodologica

## 6.9 Etapa 8: montagem do prompt packet

Componente:

- `build_article_prompt_packet`

O que entra:

- titulo
- conteudo bruto
- documentos-fonte
- resultados de retrieval
- distillation opcional

O que faz:

- monta um dossie estruturado
- mistura:
  - texto enviado
  - documentos-fonte
  - chunks recuperados
  - diagnosticos sinteticos
  - distillation

Beneficio versus mandar tudo direto ao LLM:

- o modelo recebe contexto organizado por papel
- permite combinar material bruto e grounding sem simplesmente despejar tudo

Trade-off:

- exige criterio de budget
- se o packet crescer demais, volta o problema do baseline

## 6.10 Etapa 9: prompt de analise

Componente:

- `article_analysis`

O que o prompt pede:

- resumo executivo
- ideias centrais
- riscos
- recomendacoes e proximos passos

Caracteristica importante:

- ele orienta o modelo a evitar introducao generica
- exige inferencias marcadas como inferencia
- prioriza comparacao de tecnicas e trade-offs

Beneficio versus mandar tudo direto ao LLM:

- padroniza o formato de saida
- reduz resposta generica de "AI slop"

## 6.11 Etapa 10: quality gate e auditoria

Componente:

- `_derive_article_quality_state`
- `write_article_analysis_audit`

O que faz:

- deriva `confidence`
- deriva `requires_human_review`
- classifica falhas como:
  - `retrieval_miss`
  - `citation_failure`
  - `low_coverage`
  - `grounding_failure`
- grava diagnosticos de retrieval
- grava benchmark
- grava distillation
- grava pagina, tipo de chunk e proxima acao

Beneficio versus mandar tudo direto ao LLM:

- permite dizer nao so "o resumo saiu", mas `quao grounded ele esta`
- melhora operacao e triagem de qualidade

## 6.12 Observacao importante sobre o runtime atual de artigos

No modo `article-analysis`, varios nos do canvas estao hoje marcados como ignorados no runtime principal, incluindo:

- `normalizer`
- `artifacts`
- `rules`
- `planner`
- `query-rewriter`
- `temporal-graphrag`
- `reranker`
- `distiller`
- `reflection-memory`
- `policy-loop`
- `result-norm`
- `audit`
- `dspy`
- `ragas`
- `monkeyocr`

Isso significa que o modo de artigos, hoje, e mais enxuto do que o canvas pode sugerir visualmente.

Entao, para ser tecnicamente honesto:

- `issue-validation` usa um pipeline mais completo
- `article-analysis` usa retrieval adaptativo, benchmark, distillation especifica do ArticleStore, prompt packet e auditoria; mas nao roda o mesmo conjunto de tecnicas agentic do fluxo de issue

## 7. Comparacao direta: pipeline atual vs "tudo no prompt"

| Criterio | Pipeline atual | Tudo no prompt |
|---|---|---|
| Simplicidade | baixa | alta |
| Custo de engenharia | alto | baixo |
| Suporte a anexos | alto | medio |
| Observabilidade | alta | baixa |
| Auditabilidade | alta | baixa |
| Controle de contexto | alto | baixo |
| Dependencia de prompt perfeito | menor | maior |
| Robustez a ruido | maior | menor |
| Latencia | maior | menor |
| Facilidade de prototipagem | menor | maior |
| Avaliacao offline | forte | fraca |
| Page-level grounding | forte em artigos | fraco |
| Escalabilidade para corpus | forte | fraca |

## 8. Beneficio especifico de cada tecnica contra o baseline

### 8.1 Normalizacao

Beneficio:

- menos ambiguidade estrutural

Sem ela:

- o LLM resolve formato junto com conteudo

### 8.2 Extracao de anexos

Beneficio:

- torna o nao textual utilizavel

Sem ela:

- imagem e PDF viram contexto fraco ou inacessivel

### 8.3 Regras

Beneficio:

- checkpoints explicitos antes do modelo

Sem ela:

- o LLM vira unico arbitro

### 8.4 Retrieval

Beneficio:

- escolhe o que merece entrar no contexto

Sem ele:

- o prompt final cresce e piora

### 8.5 Reranking

Beneficio:

- melhora o topo sem aumentar o tamanho

Sem ele:

- os bons trechos podem ficar enterrados

### 8.6 Distillation

Beneficio:

- comprime mantendo fatos essenciais

Sem ela:

- ruido e custo de token crescem

### 8.7 LangGraph

Beneficio:

- iteracao deliberada em casos dificeis

Sem ele:

- um unico retrieval decide tudo

### 8.8 Audit/Eval

Beneficio:

- transforma intuicao em engenharia mensuravel

Sem ele:

- tuning do sistema fica cego

## 9. Onde o pipeline realmente entrega mais valor

### 9.1 Em `issue-validation`

O pipeline vale muito porque a tarefa e decisional e operacional.

O produto nao quer apenas um texto bonito. Ele quer:

- decidir handoff para desenvolvimento
- justificar por que a issue nao esta pronta
- detectar ausencias
- sinalizar contradicoes
- escalar casos sensiveis

Para esse tipo de tarefa, mandar tudo direto ao LLM costuma falhar em tres pontos:

- tende a ser inconsistente
- nao separa falta de dado de falta de raciocinio
- e ruim de auditar

### 9.2 Em `article-analysis`

O pipeline vale mais quando:

- ha varios artigos
- o corpus ja foi ingerido
- existe necessidade de comparacao
- existe necessidade de page-level grounding
- a pergunta exige retrieval seletivo

Ele vale menos quando:

- ha so um texto curto
- nao existe colecao indexada
- a tarefa e apenas resumir um unico documento pequeno

Nesse caso, o baseline simples compete melhor.

## 10. O que o pipeline nao resolve sozinho

Importante: pipeline nao e vacina contra erro.

Ele ainda pode falhar por:

- extracao ruim de PDF ou imagem
- query mal formada
- retrieval fraco
- indice desatualizado
- regras incompletas
- prompt final mal calibrado
- LLM ruim ou instavel
- confianca derivada por proxy e nao por verdade rotulada

Ou seja:

o pipeline melhora o controle do problema, mas nao elimina a necessidade de avaliacao empirica.

## 11. Custo arquitetural que voce esta pagando

Ao escolher este desenho, o app esta assumindo conscientemente:

- mais servicos
- mais estados intermediarios
- mais schemas
- mais pontos de degradacao
- necessidade de auditoria consistente
- dependencia de storage externo quando retrieval avancado esta ligado

Essa complexidade so se justifica se o time realmente usar:

- replay
- comparacao de cenarios
- benchmark de retrieval
- quality gates
- melhoria continua do prompt e das regras

Se isso nao for usado, parte do pipeline vira custo sem retorno.

## 12. Leitura honesta do valor do sistema hoje

Se eu resumisse o valor tecnico do app em uma frase, seria:

`o app tenta transformar contexto bruto em pacote de decisao auditavel antes de pedir julgamento ao LLM.`

Esse e o beneficio principal versus "mandar tudo de uma vez".

Mais detalhadamente:

- para `issues`, o ganho principal e controle de decisao
- para `artigos`, o ganho principal e controle de grounding

## 13. Recomendacao pratica

Se o objetivo e continuar evoluindo o produto, a melhor leitura estrategica do pipeline e esta:

### 13.1 Para `issue-validation`

Trate o prompt principal como contrato de decisao, mas mantenha o pipeline de preparacao.

A melhor versao do produto nao e:

- "LLM decide tudo sozinho"

Nem e:

- "regras decidem tudo e o LLM so reescreve"

A melhor versao e:

- regras e extracao estruturam o caso
- retrieval traz evidencia adicional
- o LLM decide em cima de um pacote disciplinado

### 13.2 Para `article-analysis`

Use pipeline quando a tarefa pedir corpus, citacao, comparacao ou grounding.

Para resumo simples de documento unico, considere permitir um modo mais leve, quase baseline.

Isso reduz custo sem sacrificar o caso de uso mais sofisticado.

## 14. Conclusao final

Enviar tudo de uma vez para o LLM e melhor quando:

- a tarefa e pequena
- o risco e baixo
- a entrada ja esta limpa
- a auditabilidade nao importa tanto

O pipeline atual e melhor quando:

- ha anexos e formatos heterogeneos
- a decisao precisa ser justificavel
- retrieval e grounding importam
- o sistema precisa evoluir com benchmark e replay
- erros silenciosos sao caros

Entao o valor real do app nao esta apenas em "usar LLM".

O valor esta em:

- preparar
- selecionar
- comprimir
- julgar
- registrar
- medir

Esse conjunto e o que diferencia um fluxo de engenharia de um simples prompt grande.
