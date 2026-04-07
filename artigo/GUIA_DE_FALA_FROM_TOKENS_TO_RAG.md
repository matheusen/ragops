# Guia de Fala — From Tokens to RAG

Este arquivo complementa o deck do dashboard com uma explicacao detalhada, slide por slide, para voce apresentar o material ao time sem depender so dos bullets curtos da tela.

## Como usar este guia

- Use os bullets do slide como ancora visual e este texto como guia oral.
- Nao tente ler tudo. Use cada bloco como base para explicar com naturalidade.
- Quando o time demonstrar maturidade tecnica maior, aprofunde formula, trade-off e exemplos.
- Quando o publico estiver mais executivo, fique na tese, no risco e no impacto pratico.

---

## Slide 01 — From Tokens to RAG

**Objetivo:** abrir a apresentacao com a tese central e alinhar a expectativa da audiencia.

**Explicacao detalhada dos itens:**

1. O objetivo aqui nao e decorar siglas. O objetivo e entender a cadeia tecnica que vai do texto bruto ate um sistema com resposta util, citavel e operacional. Se o time memorizar nomes sem entender a relacao entre eles, a apresentacao nao cumpriu o papel.
2. LLM e apenas uma parte da historia. Antes dele, existe tokenizacao e arquitetura. Depois dele, existem prompt engineering, retrieval, avaliacao e governanca. O problema real em producao nunca e resolvido so pelo modelo.
3. A pergunta final da apresentacao e pratica: como isso vira arquitetura real para um time de software? Esse slide ja prepara o publico para sair da teoria e chegar em produto, risco, custo e qualidade.

**Transicao sugerida:** "Antes de falar de tokens ou de RAG, a gente precisa separar os niveis da conversa. Senao tudo vira a mesma sigla com nomes diferentes."

---

## Slide 02 — O que realmente importa

**Objetivo:** apresentar a mensagem central da aula.

**Explicacao detalhada dos itens:**

1. Tokenizacao define como o texto entra, quanto custa e quanto contexto cabe. O erro aqui parece pequeno, mas pode distorcer custo, tamanho de prompt e qualidade do retrieval.
2. Transformer define como as relacoes entre tokens viram contexto. Sem entender isso, a equipe tende a tratar o modelo como caixa magica, quando na verdade ele e uma pilha de transformacoes matematicas.
3. Prompting, retrieval e grounding definem se a resposta sera util e confiavel. Dois sistemas com o mesmo modelo podem ter qualidade final totalmente diferente por causa dessa camada.
4. Validacao e avaliacao definem se o sistema pode ser usado em ambiente real. Sem metricas, sem rastreabilidade e sem observabilidade, voce so tem uma demo bonita.

**Transicao sugerida:** "Com essa tese em mente, vamos montar o mapa da aula para o time entender o caminho inteiro."

---

## Slide 03 — A narrativa em 5 atos

**Objetivo:** dar visao de sequencia e reduzir sensacao de conteudo fragmentado.

**Explicacao detalhada dos itens:**

1. O primeiro ato organiza a evolucao historica e corrige a confusao conceitual entre campo, mecanismo, arquitetura, modelo e sistema.
2. O segundo ato mostra a entrada do texto no modelo: tokenizacao, IDs, embeddings e pipeline interno.
3. O terceiro ato abre a caixa do Transformer, explica prompting e mostra por que o LLM puro falha em contexto corporativo.
4. O quarto ato entra em RAG: pipeline, tipos de arquitetura e tecnicas que mexem na qualidade.
5. O quinto ato fecha com falhas reais, metricas de producao e o que isso muda no papel do desenvolvedor.

**Transicao sugerida:** "Agora que o mapa esta claro, vamos corrigir a primeira grande confusao: nem tudo que a equipe chama de IA esta no mesmo nivel conceitual."

---

## Slide 04 — Separar os niveis

**Objetivo:** impedir que o time misture IA, LLM, Transformer e RAG como se fossem sinonimos.

**Explicacao detalhada dos itens:**

1. IA e o campo amplo. Machine learning e deep learning sao familias dentro desse campo. Isso e importante porque LLM nao substitui tudo o que veio antes; ele herda parte dessa linha evolutiva.
2. Attention e mecanismo. Transformer e a arquitetura que organiza esse mecanismo com outras pecas, como MLP, residual connection e normalization.
3. LLM e modelo em escala. RAG ja e arquitetura de sistema. Essa diferenca explica por que um modelo pode ser excelente e o sistema final ainda assim falhar.
4. Agentes entram por cima disso tudo como camada de orquestracao e decisao. Eles nao anulam RAG; muitas vezes usam RAG como parte da propria estrategia.

**Transicao sugerida:** "Com os niveis separados, a pergunta seguinte e historica: como chegamos tecnicamente ate esse ponto?"

---

## Slide 05 — Antes do Transformer

**Objetivo:** mostrar a progressao historica ate o surgimento do Transformer.

**Explicacao detalhada dos itens:**

1. IA simbolica era forte em explicabilidade, mas fraca em adaptacao. Cada novo dominio exigia regras novas escritas manualmente.
2. Machine learning classico trocou regras fixas por aprendizado com dados, mas ainda dependia demais de feature engineering manual.
3. Deep learning melhorou representacao e tirou muito trabalho manual de features, especialmente em imagem, audio e texto.
4. RNNs e LSTMs levaram esses modelos para sequencias, mas ficaram presos a treino sequencial e perda de contexto em sequencias longas.

**Transicao sugerida:** "Esse ultimo gargalo e o que prepara o terreno para attention e, depois, para Transformer."

---

## Slide 06 — A virada moderna

**Objetivo:** mostrar como attention, Transformer, LLM, RAG e agentes se encaixam numa mesma linha.

**Explicacao detalhada dos itens:**

1. Attention resolve o problema de relevancia contextual em sequencias longas melhor do que RNNs sozinhas, mas ainda vivia dentro de arquiteturas sequenciais.
2. Transformer remove recorrencia e ganha paralelizacao real, alem de tratar dependencias longas de forma muito mais eficiente.
3. LLMs escalam essa arquitetura com volume massivo de dados e parametros, o que produz capacidades emergentes de geracao e raciocinio superficial.
4. RAG entra porque o LLM continua com conhecimento congelado e baixa auditabilidade. Agentes entram quando o sistema precisa decidir como, quando e onde buscar ou agir.

**Transicao sugerida:** "Depois dessa evolucao, a pergunta natural e: qual e a unidade minima que entra nesse modelo?"

---

## Slide 07 — O que e um token

**Objetivo:** mostrar que o modelo nao recebe texto como humano.

**Explicacao detalhada dos itens:**

1. Token nao e necessariamente palavra inteira. Em muitos casos, o tokenizer quebra termos em partes menores para equilibrar vocabulos e eficiencia.
2. Custo, latencia e limite de contexto sao medidos em tokens. Esse ponto parece operacional, mas e central para projeto de sistema.
3. Dois modelos podem dividir o mesmo texto de formas diferentes. Por isso, contar palavras nao e boa aproximacao para contar custo.
4. O fluxo basico e sempre o mesmo: texto bruto, tokenizacao, IDs numericos, embeddings e entrada no modelo.

**Transicao sugerida:** "Mas por que os modelos modernos quase sempre usam subpalavras em vez de palavras inteiras?"

---

## Slide 08 — BPE e SentencePiece

**Objetivo:** dar base canonica para tokenizacao por subpalavras.

**Explicacao detalhada dos itens:**

1. Subpalavras resolvem um compromisso tecnico. Se o vocabulario for so de palavras inteiras, ele explode. Se for so por caractere, a sequencia fica longa demais.
2. Sennrich, Haddow e Birch (2016) ajudam a explicar por que BPE virou base para tratar palavras raras e gerar subunidades reutilizaveis.
3. Kudo e Richardson (2018) ajudam a explicar por que SentencePiece se tornou padrao pratico em pipelines modernos, inclusive quando nao se quer depender de segmentacao previa por idioma.
4. Esse slide e importante porque termos tecnicos, siglas e palavras raras costumam consumir bem mais tokens do que a intuicao humana sugere. Isso afeta custo e contexto.

**Transicao sugerida:** "Agora que o texto foi quebrado em tokens, vamos abrir a caixa do que acontece quando esse token entra no modelo."

---

## Slide 09 — Quando o token entra

**Objetivo:** apresentar a pilha computacional interna do LLM em alto nivel.

**Explicacao detalhada dos itens:**

1. O token primeiro vira ID, e o ID vira embedding. Esse embedding e uma representacao vetorial densa que o modelo consegue manipular matematicamente.
2. Depois entra a informacao posicional, porque sem ordem o modelo nao distingue "A matou B" de "B matou A".
3. Os vetores atravessam blocos Transformer que recalculam contexto varias vezes via self-attention e MLP.
4. No final, o modelo produz logits, aplica estrategia de decoding e escolhe o proximo token.

**Transicao sugerida:** "Aqui vale uma pausa importante: a palavra camada aparece em dois sentidos diferentes e isso costuma confundir bastante."

---

## Slide 10 — Dois sentidos de camada

**Objetivo:** separar historia da IA de arquitetura interna do modelo.

**Explicacao detalhada dos itens:**

1. As camadas conceituais contam a historia da area: IA, machine learning, deep learning, attention, Transformer, LLM, RAG e agentes.
2. As camadas computacionais contam a execucao do modelo: tokens, embeddings, posicao, blocos Transformer, logits e decoding.
3. Se a equipe mistura essas duas coisas, ela fala de evolucao historica como se fosse bloco interno do modelo, e vice-versa.

**Transicao sugerida:** "Feita essa separacao, agora podemos abrir o bloco tecnico mais importante: o Transformer."

---

## Slide 11 — Attention nao e Transformer

**Objetivo:** separar mecanismo, operacao e arquitetura.

**Explicacao detalhada dos itens:**

1. Attention e a ideia geral de medir relevancia entre elementos de uma sequencia.
2. Self-attention e a operacao em que cada token compara sua relacao com outros tokens da mesma sequencia.
3. Multi-head attention faz isso varias vezes em paralelo para capturar tipos diferentes de relacao.
4. Transformer e a arquitetura completa que empilha isso com outras transformacoes.

**Transicao sugerida:** "Se attention e o mecanismo, a formula central do Transformer aparece exatamente aqui."

---

## Slide 12 — A formula central

**Objetivo:** dar leitura intuitiva da formula de attention.

**Explicacao detalhada dos itens:**

1. `QK^T` mede similaridade entre tokens. Em termos intuitivos, pergunta: de quem este token deveria prestar atencao?
2. A divisao por `sqrt(d_k)` evita que os valores crescam demais e destruam a estabilidade do softmax.
3. O softmax transforma scores em pesos. Assim, o modelo escolhe quanto cada token influencia o outro.
4. O `V` carrega o conteudo que sera realmente combinado. Ou seja, Q e K escolhem, V entrega o material.
5. Multi-head permite varias leituras paralelas da mesma sequencia: uma pode captar sintaxe, outra semantica, outra pista posicional.

**Transicao sugerida:** "Mas o Transformer nao serve sempre para a mesma funcao. A familia encoder e a familia decoder cumprem papeis diferentes."

---

## Slide 13 — Encoder vs decoder

**Objetivo:** explicar por que buscar e gerar costumam usar modelos diferentes.

**Explicacao detalhada dos itens:**

1. Encoder e bidirecional. Ele le a frase inteira e produz representacao boa para comparacao semantica. Por isso e comum em embeddings e retrieval.
2. Decoder e causal. Ele gera token por token olhando para o contexto anterior. Por isso domina em chat e geracao de texto.
3. Em RAG, o retriever normalmente depende de representacoes de encoder, enquanto a resposta final costuma depender de um decoder.
4. Essa separacao ajuda o time a entender por que nem toda "IA" do pipeline e o mesmo tipo de modelo.

**Transicao sugerida:** "Entendido o motor do modelo, falta uma pergunta pratica: como o usuario influencia o comportamento desse motor?"

---

## Slide 14 — Como falar com o LLM

**Objetivo:** introduzir prompt engineering como interface, nao como truque.

**Explicacao detalhada dos itens:**

1. Role system define comportamento, restricoes e formato esperado. E o lugar onde se diz, por exemplo, se o modelo deve citar fontes ou responder em JSON.
2. Role user carrega a pergunta principal e o que o usuario realmente quer.
3. Role assistant, em contexto conversacional, ajuda a manter historico e coerencia de interacao.
4. Se a instrucao for vaga, o modelo responde de forma vaga. O prompt nao e detalhe cosmetico; ele condiciona a saida.

**Transicao sugerida:** "Alem de roles, existem tecnicas e parametros que mudam bastante o comportamento do modelo."

---

## Slide 15 — Tecnicas e parametros

**Objetivo:** explicar few-shot, zero-shot e decoding como alavancas praticas.

**Explicacao detalhada dos itens:**

1. Zero-shot funciona quando a tarefa ja esta clara e o modelo tem conhecimento suficiente para inferir o formato ou criterio.
2. Few-shot melhora muito quando formato, tom ou criterio importam. Um exemplo curto pode corrigir bastante a saida.
3. Temperature alta aumenta diversidade, mas piora tarefa factual. Top-p e top-k ajustam como o modelo escolhe candidatos plausiveis.
4. No RAG, o prompt final nao e so pergunta. Ele combina instrucao do sistema, contexto recuperado e pergunta do usuario.

**Transicao sugerida:** "Mesmo com prompting bem feito, ainda existe um limite duro: o LLM puro continua sem grounding automatico."

---

## Slide 16 — Por que LLM puro falha

**Objetivo:** mostrar que fluidez nao equivale a confiabilidade.

**Explicacao detalhada dos itens:**

1. O modelo pode estar desatualizado e nao tem mecanismo interno de verificar isso sozinho.
2. Ele nao conhece automaticamente base interna da empresa, politica recente ou documento novo so porque voce deseja.
3. Sem evidencia externa, uma resposta errada pode soar tao segura quanto uma certa.
4. Auditabilidade, rastreabilidade e grounding nao surgem da fluidez do modelo; precisam de arquitetura de sistema.

**Transicao sugerida:** "Esse problema deixa de ser teorico quando olhamos dados empiricos."

---

## Slide 17 — Os dados do problema

**Objetivo:** usar DyKnow para tornar o risco concreto.

**Explicacao detalhada dos itens:**

1. O estudo com 24 LLMs e fatos sensiveis ao tempo mostra que o problema nao e opiniao, e medivel.
2. GPT-4 foi o melhor do grupo, mas ainda assim manteve 13% de respostas desatualizadas. Isso ja e alto demais para varias situacoes corporativas.
3. ChatGPT e Llama-3 ficaram em torno de 57% de respostas corretas, o que mostra que fluidez nao garante atualidade.
4. GPT-2 ter 42% de respostas desatualizadas ajuda a mostrar como o problema piora em modelos mais fracos ou antigos.

**Transicao sugerida:** "Se o problema do LLM puro e falta de evidencia atualizavel, o passo seguinte e conectar o modelo a uma memoria externa."

---

## Slide 18 — O que e RAG

**Objetivo:** definir RAG como arquitetura de grounding.

**Explicacao detalhada dos itens:**

1. RAG combina retrieval e generation. Primeiro o sistema busca, depois o modelo responde com base nessa evidencia.
2. O ganho principal nao e so responder melhor; e responder com mais atualidade, mais aderencia ao dominio e mais auditabilidade.
3. RAG nao elimina erro. Se a busca trouxer contexto ruim, a resposta continua ruim, so que agora com aparencia de fundamento.
4. Por isso e importante enfatizar que RAG e arquitetura de sistema, nao habilidade escondida do modelo.

**Transicao sugerida:** "Mas nem toda necessidade pede RAG. A pergunta certa e quando usar RAG, fine-tuning ou so o modelo base."

---

## Slide 19 — RAG, fine-tuning ou base

**Objetivo:** dar criterio de decisao tecnica e de produto.

**Explicacao detalhada dos itens:**

1. Modelo base serve bem para exploracao e tarefas gerais, quando o custo de setup precisa ser baixo e a exigencia de rastreabilidade tambem.
2. Fine-tuning faz sentido quando o dominio e altamente especifico e relativamente estavel, e quando existe budget para treino e manutencao.
3. RAG faz sentido quando o dado muda, quando a resposta precisa ser citavel ou quando a empresa precisa combinar varias fontes.
4. Em muitos casos, a solucao real mistura as abordagens: fine-tuning para especializacao, RAG para grounding e atualizacao.

**Transicao sugerida:** "Escolhido RAG, a proxima pergunta e operacional: como os dados entram no sistema?"

---

## Slide 20 — Fluxo de indexacao

**Objetivo:** mostrar que indexacao e mais do que upload de documento.

**Explicacao detalhada dos itens:**

1. O sistema pode ingerir PDF, web, wiki, ticket, codigo, FAQ e runbook. A variedade de fonte ja muda o tipo de problema tecnico.
2. Parsing, limpeza e chunking transformam dado bruto em unidades recuperaveis. Essa etapa decide o que o retriever podera ou nao podera encontrar depois.
3. Metadados sao fundamentais para restringir contexto por projeto, data, documento ou dominio.
4. Embeddings e indice vetorial transformam esse corpus em memoria pesquisavel.

**Transicao sugerida:** "Depois da indexacao, entramos na segunda metade da historia: o momento da consulta."

---

## Slide 21 — Fluxo de consulta

**Objetivo:** explicar o caminho da pergunta ate a resposta.

**Explicacao detalhada dos itens:**

1. A pergunta pode passar por transformacao antes mesmo da busca. Em sistemas mais maduros, query rewriting melhora bastante a cobertura.
2. A query vira embedding, dispara retrieval e, em muitos casos, passa por reranking para ordenar melhor a evidencia.
3. O sistema monta um contexto final que inclui instrucao, fontes e pergunta. Isso ja e etapa de sistema, nao do modelo.
4. O LLM so entra depois, recebendo tudo como novos tokens de entrada para gerar a resposta final.

**Transicao sugerida:** "Nem todo pipeline RAG tem a mesma sofisticacao. Por isso faz sentido falar em niveis de maturidade."

---

## Slide 22 — Tipos de RAG

**Objetivo:** mostrar RAG como familia de arquiteturas, nao tecnica unica.

**Explicacao detalhada dos itens:**

1. Naive RAG serve bem para MVP e ensino da ideia-base, mas falha rapido quando a colecao cresce ou a pergunta fica ambigua.
2. Advanced RAG adiciona query rewriting, hybrid search, reranking e filtros para atacar a fase de retrieval com mais criterio.
3. Modular RAG separa fluxos por tipo de fonte, tipo de pergunta e fallback. Isso ja aproxima a arquitetura de um sistema real.
4. Corrective e agentic RAG medem a qualidade da busca, tentam corrigir a rota e, no caso agentic, decidem como e onde buscar.

**Transicao sugerida:** "So que o nome do tipo importa menos do que as tecnicas que realmente puxam a qualidade do sistema."

---

## Slide 23 — O que mais move qualidade

**Objetivo:** enfatizar que qualidade de RAG nasce majoritariamente na cadeia de retrieval.

**Explicacao detalhada dos itens:**

1. Chunking ruim pode cortar uma tabela no meio ou diluir um conceito em um bloco grande demais. Isso contamina a busca desde a origem.
2. Embedding ruim devolve candidatos ruins e nenhuma etapa posterior corrige completamente esse estrago.
3. Hybrid retrieval costuma ser mais robusto porque combina semantica, termo exato e restricao estrutural.
4. Metadata filtering, contextual compression e citation grounding melhoram contexto e auditabilidade ao mesmo tempo.
5. Evaluation precisa olhar retrieval, contexto e resposta. Medir so o texto final e insuficiente.

**Transicao sugerida:** "Depois das tecnicas, a equipe sempre pergunta por stack. Aqui o ponto e nao confundir ferramenta com arquitetura."

---

## Slide 24 — Frameworks e stack

**Objetivo:** conectar teoria com implementacao sem virar discussao de hype.

**Explicacao detalhada dos itens:**

1. LangChain costuma entrar bem quando a conversa e sobre orquestracao, chains, tools e agentes.
2. LlamaIndex costuma entrar forte quando a conversa e sobre ingestao, indices, retrieval e citation workflows.
3. Haystack aparece como opcao open source robusta para pipelines de producao.
4. Bancos como Qdrant, Pinecone, Weaviate, Milvus e pgvector entram com trade-offs de custo, operacao, filtros e latencia.
5. A decisao correta sempre parte do problema de retrieval e do custo operacional aceitavel, nao do nome mais popular do momento.

**Transicao sugerida:** "Com a stack em mente, falta uma explicacao simples e importante: como exatamente o LLM usa o RAG?"

---

## Slide 25 — Como o LLM usa o RAG

**Objetivo:** remover a ideia errada de que o modelo consulta a base sozinho.

**Explicacao detalhada dos itens:**

1. O sistema externo recebe a pergunta e busca evidencias no corpus indexado.
2. Esses trechos viram novos tokens de entrada dentro do prompt final.
3. A ordem dos chunks, a delimitacao das fontes e a instrucao dada ao modelo mudam fortemente a resposta.
4. O modelo nao sabe se o contexto veio de wiki, runbook ou banco vetorial. Para ele, tudo isso chega como sequencia de tokens.

**Transicao sugerida:** "Se o contexto entra como token, entao um contexto ruim ou mal montado tambem vai contaminar a resposta. E aqui entram as falhas do RAG."

---

## Slide 26 — Quatro modos de falha

**Objetivo:** mostrar que RAG falha em lugares diferentes da cadeia.

**Explicacao detalhada dos itens:**

1. Falha de recuperacao acontece quando o sistema nao acha o que precisava.
2. Falha de selecao acontece quando acha algo util, mas escolhe mal entre os candidatos.
3. Falha de composicao acontece quando os chunks corretos sao montados de forma insuficiente ou confusa.
4. Falha de geracao acontece quando o modelo extrapola alem do que a evidencia permite.

**Transicao sugerida:** "Essas categorias ficam mais fortes quando a gente mostra exemplos concretos."

---

## Slide 27 — Tres falhas concretas

**Objetivo:** aterrar a teoria em cenarios reconheciveis para o time.

**Explicacao detalhada dos itens:**

1. Chunking ruim cortando tabela de ferias mostra que o erro pode nascer antes mesmo da busca. O sistema recupera algo parcialmente certo, mas insuficiente.
2. Retrieval sem filtro por projeto mostra como similaridade semantica pura pode trazer o contexto de outro sistema, outro squad ou outro ambiente.
3. O caso de "avalia a possibilidade" virar "ja migrou" mostra que, mesmo com contexto relevante, o modelo pode extrapolar e inventar conclusao.

**Transicao sugerida:** "Se o sistema pode falhar nesses pontos, a pergunta natural e o que medir em producao para perceber isso cedo."

---

## Slide 28 — O que medir em producao

**Objetivo:** reforcar cultura de medicao e confiabilidade.

**Explicacao detalhada dos itens:**

1. Taxa de resposta com fonte explicita ajuda a avaliar auditabilidade, nao so qualidade textual.
2. Taxa de evidencia util recuperada ajuda a medir se retrieval esta trazendo algo realmente aproveitavel para a pergunta.
3. Latencia fim a fim e custo por consulta importam porque RAG tambem e problema economico e operacional.
4. Faithfulness, groundedness e taxa de correcao humana ajudam a medir se o sistema responde bem ou so parece responder bem.

**Transicao sugerida:** "Com isso claro, a apresentacao pode fechar no que mais interessa para o time: o que muda no papel do desenvolvedor."

---

## Slide 29 — O que perde e ganha valor

**Objetivo:** conectar IA ao mercado e a engenharia de software real.

**Explicacao detalhada dos itens:**

1. Boilerplate repetitivo e sintaxe isolada perdem valor relativo porque a automacao acelera exatamente esse tipo de execucao mecanica.
2. Framing, arquitetura, trade-off e integracao ganham valor porque continuam exigindo entendimento de problema e de contexto real.
3. Qualidade sobe de importancia, nao desce. Quanto mais codigo e texto sao gerados automaticamente, maior a superficie de erro.
4. Seguranca, governanca e uso criterioso de IA diferenciam uma automacao util de um risco caro.

**Transicao sugerida:** "Essa mudanca de valor aparece de forma diferente em cada etapa da carreira."

---

## Slide 30 — Junior, pleno e senior

**Objetivo:** traduzir a mudanca de valor em roadmap de carreira.

**Explicacao detalhada dos itens:**

1. Junior precisa construir base tecnica e aprender a usar IA sem terceirizar o proprio entendimento. O risco aqui e virar operador passivo de prompt.
2. Pleno cresce quando assume fluxo de ponta a ponta, integra sistemas e mede qualidade de automacao.
3. Senior ou staff cresce quando decide arquitetura, custo, risco, governanca e estrategia de plataforma.
4. Em todos os niveis, velocidade de aprendizagem com rigor tecnico virou vantagem real.

**Transicao sugerida:** "Para fechar, vale ancorar tudo isso nas telas do proprio produto."

---

## Slide 31 — Conceitos no produto

**Objetivo:** transformar teoria em capacidade pratica do time.

**Explicacao detalhada dos itens:**

1. Prompts mostram que comportamento depende de instrucao, formato e contexto, nao so do modelo.
2. Ingest mostra a etapa em que documentos viram chunks, embeddings e memoria pesquisavel.
3. Flow e run mostram a orquestracao do pipeline RAG e o momento em que contexto vira resposta.
4. Results e settings mostram que sistema com IA precisa de avaliacao, configuracao, risco e governanca.
5. Roadmap mostra como essa narrativa tecnica pode virar capacitacao concreta do time.

**Transicao sugerida:** "Com tudo isso na mesa, a gente fecha com a sintese que eu quero que o time leve embora."

---

## Slide 32 — A sintese para o time

**Objetivo:** condensar a apresentacao numa unica mensagem de arquitetura.

**Explicacao detalhada dos itens:**

1. Tokenizacao explica como o texto entra no modelo e como custo e contexto comecam a ser definidos.
2. Transformer explica como relacoes entre tokens viram contexto por meio de self-attention.
3. Prompt engineering e RAG explicam como o contexto recuperado passa a influenciar a geracao final.
4. Falhas reais mostram que confiabilidade nao nasce do modelo sozinho; nasce de engenharia, medicao e governanca.
5. O desenvolvedor relevante e aquele que combina software engineering, criterio tecnico e uso competente de IA para entregar sistema real.

**Fechamento sugerido:** "Se eu tivesse que resumir em uma frase: o LLM e o motor de geracao, mas o valor real aparece quando o time domina a cadeia inteira, do token ao RAG."
