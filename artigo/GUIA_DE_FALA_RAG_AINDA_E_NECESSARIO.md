# Guia de Fala — RAG Ainda e Necessario?

Este arquivo complementa o deck em [APRESENTACAO_RAG_AINDA_E_NECESSARIO.md](APRESENTACAO_RAG_AINDA_E_NECESSARIO.md) com uma explicacao detalhada, slide por slide, para voce apresentar o material ao time sem depender so dos bullets curtos da tela.

## Como usar este guia

- Use os bullets do slide como ancora visual e este texto como guia oral.
- Nao tente ler tudo. Use cada bloco como base para explicar com naturalidade.
- Quando o time demonstrar maturidade tecnica maior, aprofunde trade-off, benchmark e implicacao de arquitetura.
- Quando o publico estiver mais executivo, fique na tese, no risco, no custo e na mensagem pratica.

---

## Slide 01 — RAG Ainda e Necessario?

**Objetivo:** abrir a apresentacao com a pergunta principal, situar a audiencia e deixar claro que o foco e arquitetura, nao hype.

**Explicacao detalhada dos itens:**

1. Abra dizendo que a pergunta parece binaria, mas tecnicamente nao e. O problema nao e escolher entre ser pro ou contra RAG. O problema e entender qual tipo de retrieval e de generation a pergunta esta exigindo.
2. Explique que o deck foi ancorado no acervo local do repo. Isso e importante porque evita que a conversa fique baseada apenas em opiniao recente de blog ou post de mercado.
3. Deixe a tese inicial explicita: o que enfraqueceu foi o naive RAG, aquele pipeline simplista de embedding, top-k e resposta final. O que continua forte e necessario e o grounding com retrieval mais maduro.

**Transicao sugerida:** "Antes de responder, a gente precisa formular a pergunta do jeito certo. Senao mistura semantic search, grafo e RAG como se estivessem no mesmo nivel." 

---

## Slide 02 — A pergunta certa

**Objetivo:** mostrar que semantic search, grafo e RAG nao competem no mesmo plano conceitual.

**Explicacao detalhada dos itens:**

1. A primeira correcao e simples: busca semantica e retrieval; grafo tambem e retrieval. Ambos sao formas de encontrar contexto.
2. RAG nao e uma tecnica de busca. RAG e a arquitetura que pega sinais de retrieval e transforma isso em contexto para uma resposta gerada com grounding.
3. Isso explica por que dizer "semantic search matou o RAG" e conceitualmente fraco. Na pratica, semantic search costuma ser uma parte da camada de retrieval de um RAG mais maduro.

**Transicao sugerida:** "Com isso separado, da para responder de forma curta e direta: sim, RAG continua necessario, mas nao do jeito simplista que ficou popular." 

---

## Slide 03 — Resposta curta

**Objetivo:** entregar a resposta principal da apresentacao em uma versao curta e memoravel.

**Explicacao detalhada dos itens:**

1. Diga explicitamente que o naive RAG ficou fraco. A turma precisa ouvir isso cedo para nao pensar que a apresentacao esta defendendo um pipeline defasado.
2. Em seguida, mostre que RAG como arquitetura de grounding continua necessario quando ha necessidade de resposta final confiavel e baseada em evidencia externa.
3. Liste os componentes do RAG moderno como sinais de maturidade: dense, sparse, metadado, rerank, exact retrieval, grafo, compressao e avaliacao.

**Transicao sugerida:** "Agora que a resposta curta esta dada, vale mostrar o que a base local do repo realmente sustenta e onde ela ainda tem lacunas." 

---

## Slide 04 — O que o acervo local mostra

**Objetivo:** mostrar que a tese foi sustentada por uma triagem ampla do corpus local, e nao por uma amostra arbitraria.

**Explicacao detalhada dos itens:**

1. Use os numeros para dar concretude: 1308 PDFs e 1078 arquivos de metadata significam que havia massa suficiente para uma triagem ampla, mesmo sem leitura integral de todo PDF.
2. Explique que os 677 registros com sinais amplos mostram um acervo rico em RAG, graph retrieval, hybrid retrieval e evaluation.
3. Depois ressalte a parte importante: quando a busca e literal por termos mais novos, context engineering e semantic layer aparecem pouco ou nao aparecem. Isso evita exagero na fala.

**Transicao sugerida:** "Esses numeros levam a uma leitura mais honesta do corpus: ele e forte em alguns eixos e mais fraco em outros." 

---

## Slide 05 — Leitura correta do acervo

**Objetivo:** traduzir os numeros do corpus em uma interpretacao tecnica clara.

**Explicacao detalhada dos itens:**

1. Diga que o acervo local sustenta muito bem RAG moderno, hybrid retrieval, evaluation, trust e graph-assisted retrieval. Isso e a base do miolo tecnico da tese.
2. Diga tambem que o acervo e mais fraco, por vocabulario explicito, para context engineering e semantic layers. Isso nao invalida a tese, mas muda a forma correta de apresentacao.
3. A conclusao importante e separar o que vem do acervo local e o que vem da moldura conceitual recente dos dois textos externos.

**Transicao sugerida:** "Com essa honestidade metodologica, fica mais facil mostrar os papers do acervo que realmente seguram a tese." 

---

## Slide 06 — Paper 1

**Objetivo:** usar Gao et al. como survey-base para organizar o conceito de RAG.

**Explicacao detalhada dos itens:**

1. Explique que esse paper e importante porque organiza RAG em naive, advanced e modular. Isso ajuda a desmontar a ideia de que RAG e um unico pipeline fixo.
2. Mostre que o paper tambem separa retrieval, generation e augmentation, o que torna a conversa sobre arquitetura muito mais precisa.
3. Feche dizendo que, se o proprio survey-base trata RAG como familia de arquiteturas, entao dizer que "RAG morreu" como se fosse categoria unica ja nasce conceitualmente fraco.

**Transicao sugerida:** "Se Gao organiza o conceito, o proximo paper mostra onde o ganho pratico realmente aparece: na qualidade do retriever." 

---

## Slide 07 — Paper 2

**Objetivo:** mostrar que hybrid retrieval tem ganho estrutural real e nao apenas narrativo.

**Explicacao detalhada dos itens:**

1. Explique que Blended RAG mostra de forma objetiva que dense sozinho nao basta em varios cenarios de retrieval mais exigentes.
2. O numero de 87% em TREC-COVID ajuda a tornar o argumento memoravel. Ele mostra que o desenho do retriever importa fortemente.
3. A mensagem mais importante aqui e que o ganho moderno de RAG vem muito mais de retrieval melhor desenhado do que de mais prompt ou mais eloquencia do gerador.

**Transicao sugerida:** "Se o retriever melhora muito o pipeline, o passo seguinte e entender que a literatura recente ja trata RAG como problema de arquitetura, custo e trust." 

---

## Slide 08 — Papers 3 e 4

**Objetivo:** mostrar que a literatura de 2025 desloca o debate para system design, governance e operacao real.

**Explicacao detalhada dos itens:**

1. Explique que Engineering the RAG Stack consolida arquitetura, trust frameworks e criterios de deployment mais serio.
2. Mostre que a Systematic Review traz com clareza temas como latency, security, privacy, efficiency e integration overhead.
3. A conclusao para a equipe e que, em 2025 e 2026, RAG ja nao e avaliado apenas pela fluidez da resposta. Ele e avaliado como sistema: custo, risco, observabilidade e governanca.

**Transicao sugerida:** "Se arquitetura e trust entraram no centro, o proximo passo e olhar o que acontece quando a pergunta pede relacoes explicitas e nao apenas similaridade textual." 

---

## Slide 09 — Paper 5

**Objetivo:** defender graph retrieval como resposta tecnica para perguntas relacionais.

**Explicacao detalhada dos itens:**

1. Explique que BYOKG-RAG e valioso porque mostra retrieval relacional serio em grafos customizados, nao apenas em benchmark idealizado.
2. Ele combina LLMs com graph tools, reasoning paths e OpenCypher, mostrando que graph retrieval maduro vai muito alem de seguir arestas manualmente.
3. O ganho de 4.5 pontos sobre o segundo melhor metodo ajuda a sustentar o argumento de que grafo agrega muito quando a pergunta pede relacao explicita, multi-hop e desambiguacao.

**Transicao sugerida:** "Mas graph retrieval maduro nao e so algoritmo. Ele tambem depende da infraestrutura que sustenta grafo e vetor ao mesmo tempo." 

---

## Slide 10 — Paper 6

**Objetivo:** mostrar que advanced RAG tambem e uma decisao de plataforma de dados.

**Explicacao detalhada dos itens:**

1. Explique que TigerVector integra vector search e graph query dentro do mesmo banco de grafo distribuido.
2. Isso permite compor sinal vetorial e relacional dentro do mesmo substrate, o que interessa muito para arquiteturas reais de GraphRAG.
3. A mensagem importante e que GraphRAG maduro nao vive apenas no prompt ou na orquestracao. Ele tambem depende do storage, da linguagem de consulta e do modelo de dados.

**Transicao sugerida:** "Se retrieval relacional e infraestrutura resolvem um lado do problema, o outro lado aparece quando a pergunta e tao complexa que uma busca so nao fecha a evidencia." 

---

## Slide 11 — Paper 7

**Objetivo:** mostrar por que perguntas multi-hop pedem lacuna de evidencia e iteracao controlada.

**Explicacao detalhada dos itens:**

1. Explique que FAIR-RAG trata o problema de forma madura: nao basta aumentar top-k, e preciso saber o que ainda falta descobrir.
2. O modulo SEA decompoe a pergunta, mede o que foi coberto e transforma lacunas de evidencia em novas queries.
3. O ganho de 8.3 pontos em HotpotQA sustenta corrective e agentic retrieval como necessidade tecnica quando a tarefa fica mais dificil.

**Transicao sugerida:** "Juntando esses sete papers, a gente chega a um conjunto pequeno de conclusoes bem mais fortes do que um slogan sobre RAG." 

---

## Slide 12 — O que os 7 papers convergem

**Objetivo:** condensar a leitura do acervo local em um conjunto de conclusoes memoraveis.

**Explicacao detalhada dos itens:**

1. O que morreu foi o naive RAG, nao o grounding com retrieval.
2. Retriever continua decidindo mais do que o gerador em uma grande parte dos cenarios reais.
3. Graph retrieval agrega quando a pergunta pede ligacao explicita, nao apenas parecido.
4. RAG moderno e infraestrutura, avaliacao e trust.
5. Perguntas complexas pedem iteracao e controle de evidencia.

**Transicao sugerida:** "A partir daqui, da para mostrar como os dois textos recentes entram: nao como substitutos do acervo, mas como refinamento conceitual da fala." 

---

## Slide 13 — Onde entram os dois textos recentes

**Objetivo:** explicar o papel dos textos externos na narrativa sem sobrepor o acervo local.

**Explicacao detalhada dos itens:**

1. O texto *Is RAG Dead?* ajuda a nomear melhor semantic layers, metadata-aware retrieval, provenance, coverage e recency no contexto enterprise.
2. O texto *Context Engineering* ajuda a organizar a parte de agentes em write, select, compress e isolate.
3. O papel deles na apresentacao nao e substituir o acervo local. E completar a moldura conceitual onde o metadata indexado ainda e mais fraco por vocabulario explicito.

**Transicao sugerida:** "Depois desse cruzamento, a tese final fica mais precisa e mais defensavel." 

---

## Slide 14 — Tese consolidada

**Objetivo:** enunciar a tese final com o vocabulário correto depois da leitura cruzada.

**Explicacao detalhada dos itens:**

1. Diga a frase principal sem rodeio: RAG continua necessario quando o sistema precisa transformar evidencia em resposta final confiavel.
2. Explique que a definicao de bom RAG mudou: agora ele e hibrido, relacional, comprimido, observavel, governado e, quando preciso, iterativo.
3. Esse slide e o momento de consolidar a visao para a equipe antes de entrar nas comparacoes mais operacionais.

**Transicao sugerida:** "Com a tese fechada, vale limpar um ultimo mal-entendido: varios termos dessa conversa ainda sao confundidos como se fossem sinonimos." 

---

## Slide 15 — O que nao deve ser confundido

**Objetivo:** separar lexical, semantic, graph, hybrid, RAG e GraphRAG em papeis distintos.

**Explicacao detalhada dos itens:**

1. Busca lexical responde melhor quando a pergunta pede literalidade: termos, IDs, paginas, tabelas, codigos exatos.
2. Busca semantica responde melhor quando a pergunta pede similaridade textual.
3. Graph retrieval responde melhor quando a pergunta pede entidades, caminhos, relacoes ou multi-hop.
4. Hybrid retrieval combina esses sinais. RAG usa esse retrieval para montar contexto. GraphRAG usa o grafo dentro dessa camada de retrieval e expansao de contexto.

**Transicao sugerida:** "Com os termos separados, da para mostrar quando semantic search basta e quando ela deixa de bastar." 

---

## Slide 16 — Quando busca semantica basta

**Objetivo:** mostrar que nem todo problema precisa de RAG completo.

**Explicacao detalhada dos itens:**

1. Busca semantica vai muito bem em descoberta, similares, exploracao e clustering.
2. Ela tambem funciona muito bem quando o humano vai abrir e interpretar os resultados por conta propria.
3. O limite aparece quando a tarefa exige consolidacao, explicacao, comparacao entre varias fontes ou resposta operacional pronta para consumo.

**Transicao sugerida:** "Se a pergunta deixa de ser so parecido e passa a ser ligado, e o momento em que o grafo ganha mais valor." 

---

## Slide 17 — Quando grafos agregam mais do que vetor puro

**Objetivo:** mostrar os cenarios em que retrieval relacional tem vantagem clara.

**Explicacao detalhada dos itens:**

1. Multi-hop, analise de impacto, root-cause chains e timeline sao cenarios tipicos em que o grafo brilha.
2. Grafo tambem ajuda muito em desambiguacao por entidade quando varios nomes parecidos aparecem em contexto corporativo.
3. A frase-chave aqui e: grafo entra quando o problema deixa de ser apenas parecido e passa a ser explicitamente ligado.

**Transicao sugerida:** "Mesmo assim, encontrar melhor ainda nao equivale a responder melhor. E aqui que a camada de RAG continua entrando." 

---

## Slide 18 — Onde RAG continua sendo necessario

**Objetivo:** mostrar em que tipo de tarefa o sistema ainda precisa ir alem do retrieval puro.

**Explicacao detalhada dos itens:**

1. RAG continua necessario quando ha sintese multi-documento, resposta natural para usuario final e justificativa com grounding.
2. Ele tambem continua necessario quando retrieval precisa virar decisao operacional: classificar risco, sugerir proximo passo, montar resposta para suporte, resumir divergencias.
3. O ponto humano aqui e carga cognitiva. Muitas vezes o sistema precisa entregar algo utilizavel sem obrigar alguem a ler vinte chunks crus.

**Transicao sugerida:** "Com isso, fica mais facil dizer com clareza o que exatamente morreu: o naive RAG, nao a arquitetura de grounding." 

---

## Slide 19 — O que morreu foi o RAG naive

**Objetivo:** contrastar o pipeline que envelheceu mal com o que continua forte.

**Explicacao detalhada dos itens:**

1. Do lado fraco, mostre o retriever vetorial unico, top-k fixo, ausencia de metadado, ausencia de exact retrieval, ausencia de grafo e ausencia de avaliacao.
2. Do lado forte, mostre hybrid retrieval, graph-assisted retrieval, reranking, contextual compression, corrective retrieval e evidence-first generation.
3. A frase boa aqui e: o problema nao e RAG ou nao RAG. O problema e que camada de retrieval e que camada de generation a pergunta esta pedindo.

**Transicao sugerida:** "Para deixar isso mais pratico, vale comparar modos de arquitetura para a mesma pergunta." 

---

## Slide 20 — Modelos para comparar na fala

**Objetivo:** oferecer um mapa simples dos quatro modos que a demo usa.

**Explicacao detalhada dos itens:**

1. `semantic_only` representa similaridade textual.
2. `graph_only` representa ligacao explicita e multi-hop.
3. `hybrid_retrieval` representa retrieval melhorado sem obrigatoriamente gerar resposta final.
4. `hybrid_graphrag` representa retrieval mais generation grounded.

**Transicao sugerida:** "Se esses sao os modos, agora da para mostrar qual pipeline recomendado faz mais sentido para 2026." 

---

## Slide 21 — Arquitetura recomendada

**Objetivo:** mostrar o pipeline alvo que sintetiza a tese do deck.

**Explicacao detalhada dos itens:**

1. O primeiro passo e `query understanding`, porque perguntas diferentes pedem retrieval diferente.
2. Depois entram dense, sparse, graph e exact retrieval como bracos possiveis da mesma camada.
3. `fusion + rerank` limpam o recall bruto; `compression` reduz ruido; e so no fim o LLM recebe um contexto deliberadamente montado.
4. O resultado desejado e resposta grounded com fonte e justificativa.

**Transicao sugerida:** "Com a arquitetura montada, o jeito mais didatico de convencer o time e mostrar uma demo curta com as mesmas perguntas em modos diferentes." 

---

## Slide 22 — Demonstracao sugerida

**Objetivo:** transformar a tese em experimento simples e repetivel.

**Explicacao detalhada dos itens:**

1. Use quatro tipos de pergunta: similaridade, relacional, sintese operacional e exata de documento.
2. Explique que a demo local ja mostrou dois sinais importantes: em `support`, o `hybrid_graphrag` respondeu melhor operacionalmente; em `chain`, grafo e hybrid_graphrag recuperaram melhor a cadeia relacional.
3. O que a equipe deve ver nao e qual modo e campeao universal, e sim que modos diferentes entregam tipos diferentes de evidencia e de resposta.

**Transicao sugerida:** "Com isso, da para fechar a apresentacao numa frase simples e tecnicamente correta." 

---

## Slide 23 — Fechamento

**Objetivo:** encerrar com a formula final da tese e uma mensagem facil de reapresentar internamente.

**Explicacao detalhada dos itens:**

1. Repita a tese final inteira: RAG continua necessario quando o problema real nao e apenas recuperar informacao, mas transformar evidencia em resposta confiavel, explicavel e acionavel.
2. Diga a frase de encerramento em forma de resumo executivo: GraphRAG, hybrid retrieval, compression, reranking e evaluation sao sinais de maturidade da camada de retrieval dentro de arquiteturas modernas de grounding.
3. Se quiser fechar mais forte, diga que o debate de 2026 nao e mais sobre matar o RAG. E sobre projetar retrieval e generation com o nivel certo de responsabilidade para cada pergunta.

**Transicao sugerida:** "Se quisermos seguir daqui, o proximo passo nao e discutir slogans. E construir a camada de retrieval certa para as perguntas certas do nosso dominio." 
