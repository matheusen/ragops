export interface AiEvolutionStage {
  step: string;
  label: string;
  title: string;
  summary: string;
  pivot: string;
}

export interface LearningModule {
  id: string;
  shortLabel: string;
  title: string;
  summary: string;
  focus: string;
  keyQuestion: string;
  links?: Array<{ href: string; label: string }>;
}

export interface DeveloperValueCapability {
  title: string;
  summary: string;
  leverage: string;
}

export interface MarketShift {
  from: string;
  to: string;
}

export interface CareerStage {
  level: string;
  headline: string;
  goal: string;
  priorities: string[];
  marketValue: string;
}

export interface ConceptExample {
  concept: string;
  explanation: string;
  route: string;
  routeLabel: string;
  example: string;
}

export interface LearningPresentationSlide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: string[];
  highlight?: string;
  note?: string;
  speakerNotes?: string[];
  links?: Array<{ href: string; label: string }>;
}

export const aiEvolutionStages: AiEvolutionStage[] = [
  {
    step: "01",
    label: "Campo",
    title: "IA simbolica",
    summary: "Regras explicitas, logica e sistemas especialistas para tarefas bem delimitadas.",
    pivot: "Boa explicabilidade, pouca adaptacao a variacao real.",
  },
  {
    step: "02",
    label: "Aprendizado",
    title: "Machine learning",
    summary: "Modelos passam a aprender padroes a partir de dados em vez de depender so de regras manuais.",
    pivot: "Melhora generalizacao, mas exige feature engineering forte.",
  },
  {
    step: "03",
    label: "Representacao",
    title: "Deep learning",
    summary: "Redes neurais profundas aprendem representacoes mais ricas e reduzem parte do trabalho manual.",
    pivot: "Ganham capacidade, mas ainda sofrem em sequencias longas.",
  },
  {
    step: "04",
    label: "Sequencia",
    title: "RNNs e LSTMs",
    summary: "Modelos sequenciais melhoram memoria local para NLP, voz e series temporais.",
    pivot: "Dependencias longas e treino pouco paralelizavel viram gargalo.",
  },
  {
    step: "05",
    label: "Mecanismo",
    title: "Attention",
    summary: "Cada elemento passa a medir quais outros elementos importam mais para interpretar o contexto.",
    pivot: "Attention nao e o modelo inteiro; e a peca que destrava contexto seletivo.",
  },
  {
    step: "06",
    label: "Arquitetura",
    title: "Transformers",
    summary: "A arquitetura empilha self-attention, MLPs, residual connections e normalization em larga escala.",
    pivot: "Resolve paralelizacao e melhora tratamento de contexto longo.",
  },
  {
    step: "07",
    label: "Escala",
    title: "LLMs",
    summary: "Transformers treinados em volume massivo de dados viram foundation models capazes de gerar linguagem.",
    pivot: "Geram bem, mas nao trazem grounding automatico nem memoria atualizada.",
  },
  {
    step: "08",
    label: "Sistema",
    title: "RAG e agentes",
    summary: "O LLM e conectado a retrieval, memoria externa e orquestracao para responder com evidencia e acao.",
    pivot: "A qualidade final depende da cadeia inteira, nao so do modelo.",
  },
];

export const learningModules: LearningModule[] = [
  {
    id: "modulo-1",
    shortLabel: "M1",
    title: "Evolucao das arquiteturas",
    summary: "Da IA simbolica ao Transformer, destacando como cada etapa resolveu uma limitacao anterior.",
    focus: "Campo, paradigma, mecanismo e arquitetura.",
    keyQuestion: "Por que o Transformer aparece como resposta a gargalos de sequencia e escala?",
  },
  {
    id: "modulo-2",
    shortLabel: "M2",
    title: "O que e um token",
    summary: "Como texto bruto vira unidades processaveis, IDs e embeddings.",
    focus: "Tokenizacao, subpalavras e custo de contexto.",
    keyQuestion: "Por que o modelo nao trabalha com palavras como um humano?",
  },
  {
    id: "modulo-3",
    shortLabel: "M3",
    title: "O que acontece quando o token entra no LLM",
    summary: "A pilha interna do modelo, do embedding ao decoding autoregressivo.",
    focus: "Embeddings, posicao, blocos Transformer, logits e geracao.",
    keyQuestion: "Como o token vira contexto e depois previsao do proximo token?",
  },
  {
    id: "modulo-4",
    shortLabel: "M4",
    title: "Como o Transformer funciona",
    summary: "Separacao clara entre attention, self-attention, multi-head attention e arquitetura Transformer.",
    focus: "Q, K, V, MLP, residual connections e normalization.",
    keyQuestion: "Qual e a diferenca entre mecanismo de attention e arquitetura Transformer?",
  },
  {
    id: "modulo-5",
    shortLabel: "M5",
    title: "Limitacoes do LLM puro",
    summary: "Onde parametric memory, contexto finito e falta de grounding geram risco real.",
    focus: "Hallucination, cutoff, auditabilidade e contexto corporativo.",
    keyQuestion: "Por que fluidez nao garante verdade nem aderencia ao dominio?",
  },
  {
    id: "modulo-6",
    shortLabel: "M6",
    title: "O que e RAG",
    summary: "A entrada da memoria externa pesquisavel na cadeia de resposta do LLM.",
    focus: "Retriever, vector store, contexto recuperado e grounding.",
    keyQuestion: "Como o LLM passa a responder com apoio em evidencia externa?",
    links: [{ href: "/flow", label: "Open flow canvas" }],
  },
  {
    id: "modulo-7",
    shortLabel: "M7",
    title: "Como os dados entram e saem em um sistema com RAG",
    summary: "Do parsing e chunking ate retrieval, prompt final e resposta com fonte.",
    focus: "Indexacao, consulta, reranking e montagem de contexto.",
    keyQuestion: "Onde exatamente o sistema procura e onde exatamente o modelo escreve?",
    links: [{ href: "/ingest", label: "Open ingest" }, { href: "/run", label: "Open runtime" }],
  },
  {
    id: "modulo-8",
    shortLabel: "M8",
    title: "Tipos de RAG",
    summary: "Da versao naive ao agentic RAG, mostrando graus de maturidade arquitetural.",
    focus: "Naive, advanced, modular, corrective e agentic.",
    keyQuestion: "Quando um pipeline simples deixa de ser suficiente?",
  },
  {
    id: "modulo-9",
    shortLabel: "M9",
    title: "Tecnicas envolvidas no RAG",
    summary: "Os mecanismos que realmente movem a qualidade do sistema para cima ou para baixo.",
    focus: "Chunking, embeddings, hybrid retrieval, metadata, compression e evaluation.",
    keyQuestion: "Por que o retriever costuma ser mais decisivo que o gerador?",
  },
  {
    id: "modulo-10",
    shortLabel: "M10",
    title: "Frameworks e stack",
    summary: "Como a teoria vira implementacao com trade-offs de banco vetorial, framework e operacao.",
    focus: "LangChain, LlamaIndex, Haystack, vector DBs e operacao.",
    keyQuestion: "Como escolher stack pela necessidade de retrieval, e nao por hype?",
    links: [{ href: "/settings", label: "Open settings" }],
  },
  {
    id: "modulo-11",
    shortLabel: "M11",
    title: "Como o LLM usa o RAG",
    summary: "A passagem do contexto recuperado para o prompt e sua influencia direta na geracao.",
    focus: "Prompt assembly, ordering, delimitacao e condicionamento.",
    keyQuestion: "Como evidencia externa vira token de entrada para a resposta final?",
  },
  {
    id: "modulo-12",
    shortLabel: "M12",
    title: "Limitacoes do RAG",
    summary: "O sistema melhora confiabilidade, mas continua sujeito a falhas de retrieval, selecao e geracao.",
    focus: "Recall, conflito entre fontes, latencia, custo e privacidade.",
    keyQuestion: "Por que ter RAG nao equivale automaticamente a ter confiabilidade?",
    links: [{ href: "/results", label: "Open results" }],
  },
];

export const developerValueCapabilities: DeveloperValueCapability[] = [
  {
    title: "Problem framing",
    summary: "Transformar pedidos vagos em problemas claros, restricoes reais e criterio de sucesso mensuravel.",
    leverage: "IA acelera execucao; framing continua sendo decisivo para nao automatizar a coisa errada.",
  },
  {
    title: "Arquitetura e decomposicao",
    summary: "Definir limites de modulo, contratos, fluxos, dados, dependencias e pontos de falha.",
    leverage: "Quanto mais codigo e automatizado, mais valor fica em desenhar a estrutura certa.",
  },
  {
    title: "Integracao com sistemas reais",
    summary: "Conectar modelos, APIs, dados corporativos, auth, observabilidade e regras de negocio.",
    leverage: "O mercado paga por sistemas funcionando em contexto real, nao por demos isoladas.",
  },
  {
    title: "Validacao e qualidade",
    summary: "Testar, revisar, medir, comparar, detectar regressao e validar se a saida automatizada pode ser confiada.",
    leverage: "IA aumenta throughput, mas tambem aumenta a superficie de erro; qualidade sobe de importancia.",
  },
  {
    title: "Uso competente de IA",
    summary: "Saber quando usar copilots, agentes, RAG, scripts e automacoes, e quando nao usar.",
    leverage: "Relevancia nao vem de usar IA por moda, mas de usa-la com criterio economico e tecnico.",
  },
  {
    title: "Seguranca e governanca",
    summary: "Lidar com privacidade, compliance, auditoria, permissoes, proveniencia e risco operacional.",
    leverage: "Em ambientes serios, responsabilidade e controle diferenciam um sistema util de um risco caro.",
  },
  {
    title: "Comunicacao e decisao",
    summary: "Negociar trade-offs, alinhar produto, explicar limites e priorizar o que gera impacto real.",
    leverage: "Quem conecta tecnologia a decisao de negocio continua raro e valioso.",
  },
  {
    title: "Aprendizado continuo",
    summary: "Atualizar stack, modelos, padroes de avaliacao e ferramentas sem perder rigor tecnico.",
    leverage: "A janela de obsolescencia encurtou; velocidade de aprendizagem virou capacidade estrategica.",
  },
];

export const developerMarketShifts: MarketShift[] = [
  {
    from: "Escrever boilerplate manualmente",
    to: "Orquestrar, revisar e integrar geracao automatizada com qualidade",
  },
  {
    from: "Memorizar sintaxe como diferencial",
    to: "Entender arquitetura, trade-offs e failure modes",
  },
  {
    from: "Entregar codigo isolado",
    to: "Entregar sistema mensuravel, auditavel e operacional",
  },
  {
    from: "Ser apenas executor tecnico",
    to: "Ser tradutor entre negocio, dados, risco e implementacao",
  },
  {
    from: "Usar IA para produzir mais texto",
    to: "Usar IA para aumentar throughput com confiabilidade e criterio",
  },
  {
    from: "Trabalhar sem contexto de dominio",
    to: "Acoplar software ao contexto real da empresa e do usuario",
  },
];

export const developerCareerStages: CareerStage[] = [
  {
    level: "Junior",
    headline: "Sair de executor de tarefa para construtor confiavel",
    goal: "Ganhar fluencia com ferramentas de IA sem terceirizar entendimento tecnico basico.",
    priorities: [
      "Entender fundamentos de software engineering, debugging, testes e leitura de codigo",
      "Usar copilots para acelerar, mas sempre validar saida, dependencias e edge cases",
      "Aprender a quebrar problemas em passos claros e fazer perguntas melhores",
      "Ganhar contexto de produto e dominio em vez de focar so em sintaxe",
    ],
    marketValue: "O junior relevante entrega com consistencia, aprende rapido e nao vira um operador passivo de prompt.",
  },
  {
    level: "Pleno",
    headline: "Virar dono de fluxo, integracao e qualidade",
    goal: "Conseguir pegar um problema de ponta a ponta e transformar em solucao util, medida e integrada.",
    priorities: [
      "Projetar modulos, APIs, contratos e fluxos entre servicos e dados",
      "Integrar IA com sistemas reais, observabilidade, auth e operacao",
      "Criar validacao, avaliacao e comparacao para saidas automatizadas",
      "Escolher onde a automacao ajuda e onde precisa de controle humano",
    ],
    marketValue: "O pleno ganha valor quando deixa de ser so implementador e passa a responder por resultado tecnico de negocio.",
  },
  {
    level: "Senior / Staff",
    headline: "Operar no nivel de arquitetura, economia e governanca",
    goal: "Desenhar sistemas e organizacoes capazes de usar IA com impacto, confiabilidade e controle.",
    priorities: [
      "Definir arquitetura, trade-offs, custo, latencia, risco e estrategia de plataforma",
      "Conectar engenharia, produto, dados, seguranca e compliance",
      "Criar padroes de avaliacao, governanca, auditoria e rollout seguro",
      "Elevar o time com criterio tecnico, boas decisoes e capacidade de aprendizado continuo",
    ],
    marketValue: "O senior relevante organiza decisao e responsabilidade em volta da automacao, em vez de competir com ela na digitacao.",
  },
];

export const dashboardConceptExamples: ConceptExample[] = [
  {
    concept: "Prompting e condicionamento",
    explanation: "O modelo nao responde no vazio; ele depende do contexto e das instrucoes que entram no prompt final.",
    route: "/prompts",
    routeLabel: "Open prompts",
    example: "A biblioteca de prompts mostra como instrucoes, estrutura e reutilizacao mudam o comportamento do sistema.",
  },
  {
    concept: "Ingestao, chunking e metadados",
    explanation: "Antes do retrieval funcionar, o sistema precisa transformar dados brutos em unidades recuperaveis.",
    route: "/ingest",
    routeLabel: "Open ingest",
    example: "Essa rota representa a etapa em que documentos entram, sao processados e viram base pesquisavel.",
  },
  {
    concept: "Orquestracao do pipeline RAG",
    explanation: "RAG nao e uma feature magica do modelo; e um fluxo com etapas de sistema e pontos claros de decisao.",
    route: "/flow",
    routeLabel: "Open flow",
    example: "O canvas da pipeline deixa visivel onde entram planner, query rewriting, retrieval e politica de execucao.",
  },
  {
    concept: "Runtime e resposta gerada",
    explanation: "A execucao final junta contexto, modelo, ferramentas e regras de runtime para responder ao usuario.",
    route: "/run",
    routeLabel: "Open runtime",
    example: "A rota de run ajuda a mostrar onde o modelo efetivamente recebe contexto e produz a saida final.",
  },
  {
    concept: "Avaliacao e confiabilidade",
    explanation: "Sem comparacao, score e analise de evidencias, nao ha como dizer se o sistema esta realmente bom.",
    route: "/results",
    routeLabel: "Open results",
    example: "Os resultados e comparacoes mostram por que um sistema com IA precisa de medicao e nao apenas de fluidez textual.",
  },
  {
    concept: "Configuracao, risco e governanca",
    explanation: "Provider routing, storage, seguranca e configuracao sao parte do valor real de sistemas com IA em producao.",
    route: "/settings",
    routeLabel: "Open settings",
    example: "A tela de configuracao aproxima o time da discussao sobre controle operacional e responsabilidade.",
  },
  {
    concept: "Roadmap de aprendizado",
    explanation: "Os conceitos tecnicos so geram valor quando viram sequencia de aprendizagem e aplicacao no time.",
    route: "/roadmap",
    routeLabel: "Open roadmap",
    example: "O roadmap builder pode ser usado para transformar essa narrativa em trilha de capacitacao pratica.",
  },
];

export const learningJourneyPresentationSlides: LearningPresentationSlide[] = [
  {
    id: "cover",
    eyebrow: "Abertura",
    title: "RAG ainda e necessario?",
    subtitle: "Um deck tecnico ancorado no acervo local para separar retrieval, graph retrieval e grounding.",
    bullets: [
      "A pergunta certa nao e 'RAG vs semantic search'; e 'que combinacao de retrieval e generation esta pedindo esta pergunta?'.",
      "O deck foi refeito a partir do acervo local: 1308 PDFs, 1078 metadata e uma shortlist de sete papers-chave.",
      "A tese final e simples: o naive RAG enfraqueceu, mas o grounding com hybrid retrieval, grafo, compression e avaliacao continua central.",
    ],
    highlight: "O que morreu foi o top-k vetorial simplista, nao a arquitetura de grounding.",
    note: "Abra deixando claro que a apresentacao parte do acervo local e nao apenas de opinioes recentes sobre RAG.",
    speakerNotes: [
      "Abra dizendo que a pergunta nao e se semantic search matou o RAG, mas que tipo de retrieval e generation o sistema precisa para responder com evidencia.",
      "Explique que o deck agora esta ancorado em sete papers do acervo local, nao apenas em artigos de opiniao ou hype de mercado.",
      "Feche com a tese da apresentacao: o naive RAG perdeu forca, mas o grounding hibrido e relacional continua necessario.",
    ],
  },
  {
    id: "corpus",
    eyebrow: "Acervo local",
    title: "O que a base realmente mostra",
    subtitle: "A tese ficou mais forte depois de uma triagem ampla no corpus local do repo.",
    bullets: [
      "O corpus atual tem 1308 PDFs e 1078 arquivos de metadata analisaveis dentro do repo.",
      "A varredura ampla encontrou 677 registros com sinais de RAG, graph retrieval, hybrid retrieval ou evaluation.",
      "Na busca literal dos termos recentes, o corpus indexado mostra 0 ocorrencias explicitas de context engineering, 0 de semantic layer, 1 de GraphRAG, 4 de hybrid retrieval, 6 de agentic RAG e 26 de evaluation.",
      "Traducao pratica: o acervo local sustenta muito bem RAG moderno, hybrid retrieval, evaluation e graph-assisted retrieval, mas sustenta menos a moldura conceitual de context engineering por vocabulario explicito.",
    ],
    highlight: "O miolo tecnico vem do acervo local; a moldura conceitual mais recente vem dos dois textos externos selecionados.",
    speakerNotes: [
      "Use os numeros do acervo para mostrar que a tese nao esta sendo montada no vazio. Ha base local suficiente para defender hybrid retrieval, grafo e avaliacao.",
      "Tambem seja preciso: os termos context engineering e semantic layer quase nao aparecem no metadata indexado. Isso e uma lacuna real, nao um detalhe cosmetico.",
      "Feche dizendo que a apresentacao vai separar com honestidade o que vem do acervo local e o que vem dos dois textos recentes.",
    ],
  },
  {
    id: "answer",
    eyebrow: "Resposta curta",
    title: "O erro da pergunta rasa",
    subtitle: "Semantic search, grafo e RAG nao competem no mesmo nivel de abstracao.",
    bullets: [
      "Busca semantica e uma estrategia de retrieval baseada em embeddings e similaridade textual.",
      "Graph retrieval e uma estrategia de retrieval relacional, boa para multi-hop, dependencias e causalidade.",
      "Hybrid retrieval combina dense, sparse, metadados, grafo e exact retrieval para aumentar cobertura e precisao.",
      "RAG e a arquitetura que usa esses sinais de retrieval para montar contexto e gerar resposta final com grounding.",
    ],
    highlight: "Busca semantica e grafo sao retrieval. RAG e retrieval + generation + grounding.",
    speakerNotes: [
      "Explique que semantic search nao matou o RAG porque semantic search e um componente de retrieval, nao uma arquitetura final de resposta.",
      "Mostre que grafo tambem nao substitui automaticamente o RAG: ele melhora a recuperacao relacional, mas nao faz sozinho a sintese final orientada por evidencia.",
      "Feche com a frase de transicao: a pergunta certa nao e 'RAG ou nao RAG', e 'que retrieval eu preciso e quanto de generation eu quero por cima dele'.",
    ],
  },
  {
    id: "gao-survey",
    eyebrow: "Paper 1",
    title: "O survey que organiza a base",
    subtitle: "Gao et al. continuam sendo a melhor porta de entrada para explicar o que e RAG de forma rigorosa.",
    bullets: [
      "O paper consolida a taxonomia `naive RAG`, `advanced RAG` e `modular RAG`.",
      "Ele trata RAG como uma familia de arquiteturas, nao como um unico pipeline fixo com embeddings e top-k.",
      "A estrutura em retrieval, generation e augmentation ajuda a mostrar onde a arquitetura pode evoluir ou falhar.",
      "Esse survey sustenta a ideia de que falar 'RAG morreu' como categoria unica ja e conceitualmente fraco.",
    ],
    highlight: "RAG sempre foi familia de arquiteturas. O que muda em 2026 e o grau de maturidade do retrieval e da orquestracao.",
    speakerNotes: [
      "Use Gao et al. como ancora para dizer que RAG nunca foi apenas um top-k vetorial com prompt final. Essa simplificacao e que envelheceu mal.",
      "Mostre que a classificacao naive, advanced e modular abre espaco para falar de hybrid retrieval, routing, reranking e corrective loops como evolucao natural.",
      "Feche dizendo que a propria literatura base ja trata RAG como arquitetura mutavel, nao como dogma estatico.",
    ],
  },
  {
    id: "blended-rag",
    eyebrow: "Paper 2",
    title: "Hybrid retrieval ganha por engenharia, nao por moda",
    subtitle: "Blended RAG reforca que retriever ruim derruba o sistema inteiro antes da geracao.",
    bullets: [
      "O paper mostra que dense + sparse + query blending melhoram fortemente a camada de retrieval em colecoes maiores.",
      "O retriever chega a 87% de accuracy em TREC-COVID com a combinacao certa de semantic search e sparse encoder indices.",
      "O ganho de retrieval repercute no pipeline completo de RAG, inclusive acima de certos baselines de fine-tuning em Q&A.",
      "A mensagem para o time e objetiva: o ganho moderno de RAG vem muito mais do desenho do retriever do que de 'prompt magic'.",
    ],
    highlight: "Retriever continua decidindo mais do que gerador em boa parte dos cenarios reais.",
    speakerNotes: [
      "Use o paper para aterrar a conversa: quando a colecao cresce, retrieval ruim vira o gargalo dominante do sistema.",
      "Explique que dense sozinho nem sempre basta; sparse e query blending continuam tendo papel forte quando o usuario exige termo certo, documento certo ou contexto corporativo.",
      "Feche com a mensagem de engenharia: hybrid retrieval e um ganho estrutural, nao cosmetico.",
    ],
  },
  {
    id: "rag-stack",
    eyebrow: "Papers 3 e 4",
    title: "RAG maduro vira problema de arquitetura e trust",
    subtitle: "Engineering the RAG Stack e a Systematic Review de 2025 deslocam a conversa para deployment serio.",
    bullets: [
      "Os dois trabalhos convergem em taxonomia unificada, avaliacao quantitativa, privacy, security, latency e integration overhead.",
      "A literatura recente ja trata RAG como problema de arquitetura, metrics, governance e custo, nao so de acuracia bruta.",
      "A pergunta enterprise deixa de ser 'o modelo responde bem?' e passa a ser 'o sistema e confiavel, rastreavel, barato o suficiente e auditavel?'.",
      "Isso alinha o deck com o que interessa para um time real de software: deploy, observabilidade, risco e operacao.",
    ],
    highlight: "RAG moderno e tambem governance, privacy, metrics e platform decisions.",
    speakerNotes: [
      "Explique que esses dois papers mudam o centro da conversa: nao basta dizer que RAG melhora factualidade; agora e preciso mostrar trust, security, privacy, latency e deployment patterns.",
      "Use isso para justificar porque a arquitetura do sistema importa tanto quanto a escolha do modelo e do embedding.",
      "Feche dizendo que, para a equipe, essa e a diferenca entre demo e produto.",
    ],
  },
  {
    id: "byokg",
    eyebrow: "Paper 5",
    title: "Graph retrieval nao e traversal cega",
    subtitle: "BYOKG-RAG mostra por que graph retrieval serio precisa de varias estrategias e refinamento iterativo.",
    bullets: [
      "O framework combina LLMs com graph tools para gerar entidades, respostas candidatas, reasoning paths e queries OpenCypher.",
      "O contexto recuperado retroalimenta a propria recuperacao e melhora linking, retrieval e resposta final.",
      "O paper reporta ganho de 4.5 pontos sobre o segundo melhor metodo de graph retrieval e melhor generalizacao para KGs customizados.",
      "Isso sustenta a parte do deck que diferencia semantic search, graph retrieval e GraphRAG de verdade.",
    ],
    highlight: "Quando a pergunta pede relacao explicita, o retrieval relacional bem desenhado passa a valer mais do que mera similaridade textual.",
    speakerNotes: [
      "Use BYOKG-RAG para mostrar que GraphRAG bom nao significa apenas 'jogar o grafo no prompt'. Ha linking, path selection, graph query e refinamento.",
      "Explique que esse paper e valioso porque fala de bring-your-own KG, ou seja, de grafo customizado e nao de benchmark artificial perfeito.",
      "Feche com a mensagem: grafo agrega mais quando a pergunta pede entidades, caminhos e multi-hop.",
    ],
  },
  {
    id: "tigervector",
    eyebrow: "Paper 6",
    title: "Infraestrutura tambem decide o RAG moderno",
    subtitle: "TigerVector mostra que advanced RAG tambem e uma decisao de storage e query model.",
    bullets: [
      "TigerVector integra vector search e graph query no mesmo banco de grafo distribuido.",
      "O trabalho permite composicao entre resultados de busca vetorial e blocos de consulta em grafo na mesma linguagem de consulta.",
      "Os experimentos reportam desempenho comparavel ou melhor que Milvus e bem melhor que Neo4j e Amazon Neptune em vector search nesse contexto.",
      "A mensagem para o time e que GraphRAG maduro tambem depende de substrate de dados e nao apenas de prompt e rerank.",
    ],
    highlight: "Advanced RAG nao e so tecnica de retrieval. E tambem decisao de banco, query model e composicao entre dado estruturado e nao estruturado.",
    speakerNotes: [
      "Explique que este paper desloca a conversa para infraestrutura: onde o vetor mora, como ele conversa com o grafo e que tipo de query fica possivel depois disso.",
      "Mostre que isso interessa porque muita gente trata GraphRAG como camada logica, quando na pratica ele tambem e uma decisao de plataforma de dados.",
      "Feche dizendo que o tipo de storage limita o tipo de retrieval que o time consegue operacionalizar.",
    ],
  },
  {
    id: "fair-rag",
    eyebrow: "Paper 7",
    title: "Perguntas complexas pedem lacuna de evidencia",
    subtitle: "FAIR-RAG mostra por que multi-hop nao fecha em single-pass retrieval.",
    bullets: [
      "O modulo SEA decompone a pergunta, identifica o que ja esta coberto e explicita quais evidencias ainda faltam.",
      "Essas lacunas viram novas queries mais especificas, em vez de simplesmente aumentar top-k e torcer por recall.",
      "O paper reporta F1 de 0.453 no HotpotQA, com ganho absoluto de 8.3 pontos sobre o baseline iterativo mais forte.",
      "Isso sustenta corrective e agentic retrieval como necessidade tecnica, nao como enfeite arquitetural.",
    ],
    highlight: "Sem medir lacunas de evidencia, o sistema tende a propagar ruido com aparencia de fundamentacao.",
    speakerNotes: [
      "Use FAIR-RAG para explicar que multi-hop nao se resolve apenas aumentando contexto. O problema e fechar o que falta, nao acumular texto.",
      "Mostre que SEA torna explicito um principio importante de engenharia: o sistema precisa saber o que ainda nao sabe para buscar melhor.",
      "Feche dizendo que esse e o elo entre RAG moderno e context engineering: selecao e iteracao sobre lacunas de evidencia.",
    ],
  },
  {
    id: "recent-texts",
    eyebrow: "Moldura recente",
    title: "Onde entram os dois textos recentes",
    subtitle: "Eles nao substituem o acervo local; eles completam a moldura conceitual onde o metadata indexado ainda e mais fraco.",
    bullets: [
      "Is RAG Dead? adiciona semantic layers, metadata-aware retrieval, provenance, coverage, recency e explainability na conversa enterprise.",
      "Context Engineering adiciona write, select, compress e isolate como verbos para desenhar contexto em agentes.",
      "Os dois textos convergem com os sete papers do acervo num ponto: o que enfraqueceu foi o naive RAG, nao o grounding com retrieval.",
      "A leitura correta e: o miolo tecnico vem do acervo local; a moldura mais recente de contexto e orquestracao vem desses dois textos.",
    ],
    highlight: "O acervo local segura o corpo tecnico da tese; os dois textos recentes refinam o vocabulario de contexto e governanca.",
    speakerNotes: [
      "Seja transparente aqui: context engineering e semantic layers quase nao aparecem de forma literal no metadata indexado. Isso nao impede a tese, mas impede exagero.",
      "Explique que os dois textos recentes ajudam a nomear melhor problemas que os papers locais ja apontam por outros caminhos: lacuna de evidencia, governance, observabilidade e contexto demais.",
      "Feche dizendo que isso melhora a fala sem comprometer o rigor sobre a base local.",
    ],
  },
  {
    id: "comparison",
    eyebrow: "Comparacao",
    title: "Quatro modos para a mesma pergunta",
    subtitle: "A comparacao certa nao e so RAG vs nao RAG. E retrieval mode vs tipo de pergunta.",
    bullets: [
      "`semantic_only`: bom para similares, descoberta e exploracao de corpus.",
      "`graph_only`: bom para dependencias, caminhos, multi-hop e desambiguacao por entidade.",
      "`hybrid_retrieval`: bom para investigacao manual mais limpa, com dense + sparse + metadados + grafo quando necessario.",
      "`hybrid_graphrag`: bom quando o sistema precisa responder, justificar e reduzir carga cognitiva com evidencia consolidada.",
    ],
    highlight: "A pergunta certa define o grau de retrieval e generation necessario.",
    speakerNotes: [
      "Use este slide para desfazer o binario simplista. O problema nao e ser pro ou anti-RAG; o problema e escolher o modo certo para a pergunta certa.",
      "Mostre que retrieval puro pode bastar quando o humano vai interpretar os resultados, mas perde forca quando a tarefa exige resposta final pronta para consumo.",
      "Feche preparando a demo: vamos rodar a mesma pergunta em modos diferentes.",
    ],
  },
  {
    id: "demo",
    eyebrow: "Demonstracao",
    title: "O laboratorio local ja mostrou a diferenca",
    subtitle: "A mesma pergunta muda bastante de qualidade quando o retrieval muda.",
    bullets: [
      "No cenario `support`, `graph_only` nao trouxe evidencia operacional suficiente, enquanto `hybrid_graphrag` montou resposta grounded e acionavel.",
      "No cenario `chain`, `graph_only` e `hybrid_graphrag` recuperaram a cadeia relacional com mais precisao, enquanto `semantic_only` trouxe ruido.",
      "A demo mostra na pratica o que os papers sustentam: semantic search encontra similares, grafo encontra ligacoes e hybrid RAG transforma isso em resposta utilizavel.",
      "O objetivo da demo nao e vencer benchmark; e deixar claro para o time o efeito arquitetural de cada modo de retrieval.",
    ],
    highlight: "Trocar o modo de retrieval muda o tipo de evidencia que chega ao gerador e, portanto, muda a qualidade da resposta final.",
    speakerNotes: [
      "Relate rapidamente os dois cenarios ja observados no laboratorio local: support e chain. Isso ajuda a aterrissar o discurso em algo executado de fato dentro do repo.",
      "Mostre que semantic_only pode trazer ruido quando a pergunta pede relacao, e que graph_only pode ser insuficiente quando falta consolidacao em linguagem natural.",
      "Feche com a frase: a arquitetura de retrieval define a materia-prima que o gerador recebe.",
    ],
    links: [{ href: "/results", label: "Abrir resultados" }],
  },
  {
    id: "architecture",
    eyebrow: "Arquitetura",
    title: "O pipeline recomendado para 2026",
    subtitle: "RAG moderno e uma cadeia de retrieval governado, nao um retriever unico com prompt final.",
    bullets: [
      "`query understanding` decide se a pergunta pede dense, sparse, graph, exact retrieval ou combinacao deles.",
      "`fusion + rerank` limpam o recall bruto antes da montagem do contexto final.",
      "`compression / distillation` reduzem ruidao e ajudam a nao confundir o gerador com contexto demais.",
      "O LLM entra no fim, recebendo evidencia selecionada, ordenada e delimitada para responder com grounding.",
    ],
    highlight: "A geracao so e confiavel quando a camada de retrieval e selecao ja fez o trabalho certo antes.",
    speakerNotes: [
      "Explique o pipeline em ordem: entender a query, escolher os retrievers, fundir sinais, reranquear, comprimir e so depois gerar.",
      "Use esse slide para reforcar que semantic search, grafo e exact retrieval sao bracos da mesma camada, nao competidores de alto nivel contra o RAG.",
      "Feche dizendo que o sistema melhor costuma ser hibrido e orientado ao tipo de pergunta.",
    ],
    links: [{ href: "/flow", label: "Abrir fluxo" }, { href: "/run", label: "Abrir execucao" }],
  },
  {
    id: "metrics",
    eyebrow: "Avaliacao",
    title: "O que medir para nao virar demo bonita",
    subtitle: "RAG so merece confianca quando retrieval, evidencia e resposta sao medidos juntos.",
    bullets: [
      "Faithfulness e groundedness dizem se a resposta respeita o que a evidencia realmente sustenta.",
      "Provenance, coverage e recency dizem se a recuperacao foi suficiente, atual e rastreavel.",
      "Latencia, custo por consulta e taxa de respostas com fonte mostram se a arquitetura e operacionalmente viavel.",
      "Sem esse conjunto de metricas, o time confunde fluidez textual com confiabilidade do sistema.",
    ],
    highlight: "Demo boa nao substitui metricas boas.",
    speakerNotes: [
      "Use este slide para mostrar que RAG moderno nao e apenas retrieval melhor; e tambem avaliacao melhor.",
      "Explique que provenance, coverage e recency conversam diretamente com a tese dos dois textos recentes sobre explainability e governanca de contexto.",
      "Feche lembrando que um sistema com IA precisa ser medido como sistema, nao como chat convincente.",
    ],
    links: [{ href: "/results", label: "Abrir resultados" }],
  },
  {
    id: "close",
    eyebrow: "Fechamento",
    title: "A sintese para o time",
    subtitle: "O acervo local converge para uma leitura clara: retrieval ficou mais maduro, nao menos necessario.",
    bullets: [
      "Semantic search continua muito util para similares, descoberta e exploracao de corpus.",
      "Graph retrieval continua muito util para ligacoes, impacto, dependencia e multi-hop.",
      "Hybrid retrieval e corrective loops aparecem como resposta tecnica quando o corpus cresce e a pergunta fica mais dificil.",
      "RAG continua necessario quando o objetivo real nao e apenas encontrar informacao, mas transformar evidencia em resposta confiavel, explicavel e acionavel.",
    ],
    highlight: "GraphRAG, hybrid retrieval, compression, reranking e evaluation sao sinais de maturidade da camada de retrieval dentro de arquiteturas modernas de grounding.",
    note: "Feche chamando o time para olhar RAG como arquitetura de sistema e nao como slogan ou hype passageiro.",
    speakerNotes: [
      "Recapitule a tese final: o naive RAG enfraqueceu, mas o grounding com retrieval mais maduro continua necessario.",
      "Explique que semantic search, grafo, reranking, compression e evaluation entram como partes de uma arquitetura maior, nao como argumentos contra o RAG.",
      "Feche com a recomendacao pratica para o time: desenhar retrieval pelo tipo de pergunta e generation pelo nivel de responsabilidade da resposta.",
    ],
  },
];