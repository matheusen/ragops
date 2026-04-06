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
    eyebrow: "Alinhamento do time",
    title: "Do token ao RAG",
    subtitle: "Como a cadeia evolui e o que isso muda no papel do desenvolvedor.",
    bullets: [
      "LLM nao e sinonimo de IA; ele e uma etapa especifica dessa evolucao.",
      "Transformer nao e o sistema inteiro; e a arquitetura central mais comum dos LLMs atuais.",
      "RAG entra quando o modelo precisa responder com evidencia externa e contexto atualizavel.",
    ],
    highlight: "O modelo importa, mas o sistema inteiro e o que define valor real.",
    note: "Use esta abertura para alinhar vocabulário e impedir a confusao entre mecanismo, arquitetura, modelo e sistema.",
  },
  {
    id: "ladder",
    eyebrow: "Escada conceitual",
    title: "A escada correta",
    subtitle: "Campo, paradigma, mecanismo, arquitetura, modelo em escala e sistema nao ficam no mesmo nivel.",
    bullets: [
      "IA -> machine learning -> deep learning.",
      "Attention e mecanismo; Transformer e arquitetura.",
      "LLM e modelo treinado em escala; RAG e arquitetura de sistema.",
      "Agentes adicionam decisao, ferramenta e orquestracao sobre essa base.",
    ],
    highlight: "Sem separar os niveis, a equipe memoriza termos, mas nao entende o sistema.",
  },
  {
    id: "inside-llm",
    eyebrow: "Dentro do modelo",
    title: "O que acontece no LLM",
    subtitle: "O texto vira estrutura numerica e passa por uma pilha de transformacoes, nao por entendimento humano direto.",
    bullets: [
      "Texto -> tokenizacao -> IDs -> embeddings.",
      "A posicao entra para dar ordem a sequencia.",
      "Blocos Transformer recalculam contexto com self-attention e MLP.",
      "A saida vira logits e depois proximo token por decoding autoregressivo.",
    ],
    highlight: "O LLM nao le frases como pessoas; ele refina vetores de contexto camada por camada.",
  },
  {
    id: "why-rag",
    eyebrow: "Limite do sistema",
    title: "Por que LLM puro nao basta",
    subtitle: "Conhecimento parametrico e poderoso, mas insuficiente para contexto corporativo e resposta auditavel.",
    bullets: [
      "Pode estar desatualizado e nao sabe sozinho quando esta errado.",
      "Nao conhece automaticamente dados internos, politicas e fatos recentes.",
      "Sem evidencia externa, a resposta pode soar convincente e ainda assim estar errada.",
      "Auditabilidade, citacao e grounding viram requisitos de sistema, nao so de modelo.",
    ],
    highlight: "Fluencia sem grounding e um risco operacional, nao apenas uma limitacao academica.",
    links: [{ href: "/results", label: "Abrir resultados" }],
  },
  {
    id: "rag-pipeline",
    eyebrow: "Pipeline RAG",
    title: "O que o RAG muda",
    subtitle: "O sistema busca primeiro, depois o modelo escreve com base no contexto recuperado.",
    bullets: [
      "Documentos entram, viram chunks, embeddings e indice pesquisavel.",
      "A pergunta do usuario tambem vira representacao para retrieval.",
      "Retriever, reranker e metadados decidem qual evidencia sobe para o prompt.",
      "O LLM recebe esse material como tokens de entrada e gera a resposta final.",
    ],
    highlight: "RAG nao e uma magia no modelo; e uma cadeia de retrieval, montagem e geracao.",
    links: [
      { href: "/ingest", label: "Abrir ingestao" },
      { href: "/flow", label: "Abrir fluxo" },
      { href: "/run", label: "Abrir execucao" },
    ],
  },
  {
    id: "developer-value",
    eyebrow: "Relevancia profissional",
    title: "Onde o desenvolvedor gera valor",
    subtitle: "Quanto mais a IA automatiza execucao, mais valor sobe para julgamento, arquitetura e responsabilidade.",
    bullets: [
      "Framing de problema e entendimento de dominio.",
      "Arquitetura, decomposicao e integracao com sistemas reais.",
      "Validacao, testes, avaliacao e observabilidade.",
      "Seguranca, governanca, compliance e uso criterioso de IA.",
    ],
    highlight: "Relevancia profissional vem menos de digitar mais e mais de decidir melhor.",
  },
  {
    id: "career-roadmap",
    eyebrow: "Caminho de carreira",
    title: "Junior, pleno e senior",
    subtitle: "Cada nivel continua relevante, mas o foco de valor muda com a senioridade.",
    bullets: [
      "Junior: construir base tecnica e usar IA sem terceirizar entendimento.",
      "Pleno: assumir fluxo inteiro, integrar sistemas e medir qualidade.",
      "Senior: decidir arquitetura, risco, governanca, custo e estrategia.",
      "Em todos os niveis, velocidade de aprendizagem e criterio viram vantagem competitiva.",
    ],
    highlight: "A carreira nao encolhe com IA; ela sobe de nivel de abstracao.",
    links: [{ href: "/roadmap", label: "Abrir roadmap" }],
  },
  {
    id: "product-map",
    eyebrow: "No produto",
    title: "Onde ver isso no produto",
    subtitle: "A melhor forma de ensinar o time e ligar cada conceito a uma tela e a um comportamento real do sistema.",
    bullets: [
      "Prompts mostram condicionamento e instrucao.",
      "Ingest mostra parsing, chunking, embeddings e indexacao.",
      "Flow mostra orquestracao da pipeline RAG.",
      "Run, results e settings mostram execucao, avaliacao e governanca.",
    ],
    highlight: "Conceito que nao encosta em sistema real vira jargao; conceito ligado ao produto vira capacidade do time.",
    links: [
      { href: "/prompts", label: "Abrir prompts" },
      { href: "/apresentacao", label: "Abrir pagina da apresentacao" },
    ],
  },
];