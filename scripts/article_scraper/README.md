# Article Scraper

Busca artigos científicos em múltiplas fontes e salva metadados + PDFs localmente.

## Fontes suportadas

| Fonte            | Chave?           | VPN?  | Notas                              |
|------------------|------------------|-------|------------------------------------|
| **arXiv**        | Não              | Não   | Open access, API oficial           |
| **Semantic Scholar** | Opcional    | Não   | 200M+ papers, gratuito             |
| **IEEE Xplore**  | Sim (gratuita)   | Não   | 200 req/dia (free tier)            |
| **CrossRef**     | Não              | Não   | Metadados DOI, sem abstracts       |
| **Portal CAPES** | Não              | **Sim** | Requer Selenium + VPN universitária |

## Setup

```bash
cd scripts/article_scraper

# Criar venv
python -m venv .venv
.venv\Scripts\activate       # Windows
# source .venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

Se você for usar apenas `python scraper.py --mode direct`, o pacote `kafka-python` não é obrigatório. Ele só é necessário para `--mode producer` ou `python kafka_producer.py`.

## Configuração

Edite o `config.yaml`:

```yaml
# Adicione suas queries
queries:
  - query: "transformer models code generation"
    max_results: 50

# Habilite as fontes
sources:
  ieee:
    enabled: true
    api_key: "SUA_CHAVE_AQUI"   # developer.ieee.org (gratuito)

  semantic_scholar:
    enabled: true
    api_key: ""   # opcional, aumenta rate limit
```

### Chave IEEE (gratuita)
1. Acesse https://developer.ieee.org
2. Crie conta → "Get API Key"
3. Cole em `config.yaml` → `sources.ieee.api_key`

### Chave Semantic Scholar (opcional)
1. Acesse https://www.semanticscholar.org/product/api
2. Solicite chave gratuita (aumenta de 1 req/s para 10 req/s)

## Uso

```bash
# Busca completa com config.yaml
# Se kafka.enabled: true, roda como producer
# URLs/PDFs fora de publishers/repositórios confiáveis são descartados
python scraper.py

# Producer explícito
python scraper.py --mode producer

# Compat wrapper
python kafka_producer.py

# Consumer: consome do Kafka, baixa PDFs e salva no MongoDB
python kafka_consumer.py

# Modo direto antigo, sem Kafka
python scraper.py --mode direct

python scraper.py --mode direct --resume

# Query avulsa
python scraper.py --query "RAG retrieval augmented generation" --sources arxiv semantic_scholar

# Config personalizada
python scraper.py --config minha_busca.yaml

# Sem baixar PDFs
python scraper.py --no-download

# Ver o que já foi coletado
python scraper.py --list-existing

# Limite de resultados
python scraper.py --max 20
```
python rename_by_title.py

## Traduzir PDF para portugues

O utilitario `translate_pdf.py` traduz PDFs de artigos em ingles para portugues preservando o layout o maximo possivel:

- Mantem as paginas originais e as imagens intactas
- Remove apenas os blocos de texto detectados
- Reinsere a traducao nas mesmas caixas da pagina
- Funciona melhor com PDFs digitais, nao com PDF escaneado

Instalacao minima:

```bash
pip install -r requirements.txt
```

Melhor qualidade de traducao:

```bash
# Requer OPENAI_API_KEY no ambiente ou no .env
python translate_pdf.py --input .\results\downloads\paper.pdf
```

Escolhendo modelo/provider:

```bash
python translate_pdf.py --input .\paper.pdf --provider openai --model gpt-4.1-mini
```

Fallback local com modelo neural Hugging Face:

```bash
pip install transformers torch sentencepiece
python translate_pdf.py --input .\paper.pdf --provider nllb
```
python translate_pdf.py --input .\Transformers are Graph Neural Networks.pdf --provider nllb



Saida customizada:

```bash
python translate_pdf.py --input .\paper.pdf --output .\paper.ptbr.pdf
```

Observacoes:

- Para manter o texto original por baixo da traducao, use `--keep-original`
- PDFs escaneados exigem OCR antes; o script atua sobre texto vetorial extraido do PDF
- A preservacao de layout e alta, mas nao perfeita em blocos muito densos, tabelas complexas ou equacoes

## Estrutura de saída

```
results/
├── metadata/          ← um JSON por artigo (id, título, autores, abstract, DOI...)
│   ├── 10.1234_abc.json
│   └── ...
├── downloads/         ← PDFs (só open access por padrão)
│   ├── 10.1234_abc.pdf
│   └── ...
└── reports/           ← consolidado da execução
    ├── run_20240319_143022.json
    └── run_20240319_143022.csv
```

## Kafka + MongoDB

O fluxo assíncrono fica assim:

1. `kafka_producer.py` faz a busca nas fontes.
2. Cada artigo novo é salvo em `results/metadata/*.json`, persistido no MongoDB e publicado no tópico Kafka.
3. `kafka_consumer.py` consome o tópico, verifica se o PDF já existe na pasta e só baixa o que falta.
4. Cada PDF salvo localmente também é registrado no MongoDB/GridFS.

O scraper também sanitiza links e aceita apenas domínios científicos confiáveis, como `arxiv.org`, `doi.org`, `ieee.org`, `acm.org`, `springer.com`, `sciencedirect.com`, `core.ac.uk`, `dblp.org` e publishers acadêmicos equivalentes. Links sociais ou genéricos são descartados.

Hoje o entrypoint principal é `scraper.py`:

- `python scraper.py` usa `producer` por padrão quando `kafka.enabled: true`
- `python scraper.py --mode direct` mantém o fluxo antigo sem fila
- `python kafka_producer.py` é só um wrapper compatível

Configuração mínima no `config.yaml`:

```yaml
mongodb:
  enabled: true
  uri: "mongodb://localhost:27017"

kafka:
  bootstrap_servers:
    - "localhost:9092"
  topic: "article-scraper.articles"
```

Execução:

```bash
cd scripts/article_scraper

python kafka_consumer.py
python scraper.py
```

Se você quiser manter o modo antigo, use `python scraper.py --mode direct`.

## Portal CAPES (com VPN)

1. Conecte à VPN da universidade
2. No `config.yaml`, habilite:
   ```yaml
   sources:
     capes:
       enabled: true
       headless: false   # true = invisível, false = ver o browser
   ```
3. Execute: `python scraper.py --sources capes`

## Dicas

- **Incremental**: o scraper pula artigos já coletados por DOI — pode rodar várias vezes sem duplicar
- **Rate limit**: ajuste `execution.delay_between_requests` se receber erros 429
- **Apenas metadados**: `downloads.enabled: false` se não quiser PDFs
- **Ano mínimo**: `execution.min_year: 2020` filtra artigos antigos

---

## Artigos Recomendados para o Artigo "From Tokens to RAG"

Curadoria dos artigos mais relevantes da pasta `results/downloads/` organizados por módulo da apresentação "From Tokens to RAG" (ver `README_from_tokens_to_rag.md`).

### Mapeamento por Módulo

| Módulo | Artigos Recomendados |
|--------|---------------------|
| **M1 — Evolução das arquiteturas** | Cognitive Architectures for Language Agents |
| **M2/M3 — Tokens, embeddings e pipeline interno** | Self-Attention as Distributional Projection; Comparative Analysis of Word Embeddings |
| **M4 — Como o Transformer funciona** | Self-Attention as Distributional Projection; Gated Sparse Attention; Forgetting Transformer |
| **M5 — Limitações do LLM puro** | LLMs as Repositories of Factual Knowledge; A Survey on In-context Learning |
| **M6 — O que é RAG** | Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks; A Comprehensive Survey of RAG; Retrieval-Augmented Generation for Large Language Models: A Survey |
| **M7 — Pipeline de dados no RAG** | Engineering the RAG Stack; Developing RAG based LLM Systems from PDFs |
| **M8 — Tipos de RAG** | A Systematic Review of Key RAG Systems; FAIR-RAG; Auto-RAG; Retrieval Augmented Generation for Fintech: Agentic Design |
| **M9 — Técnicas envolvidas** | Blended RAG; MultiHop-RAG; Ragas: Automated Evaluation; Utilizing Metadata for Better RAG |
| **M10 — Frameworks e stack** | Survey of vector database management systems; RETA-LLM; TigerVector |
| **M11 — Como LLM usa o RAG** | RAG and Beyond: A Comprehensive Survey; Collab-RAG |
| **M12 — Limitações do RAG** | The Good and The Bad: Exploring Privacy Issues in RAG; Mitigating Privacy Issues in RAG; Enhancing Critical Thinking with AI |

### Top 10 — Prioridade Máxima

1. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (paper original)
2. Retrieval-Augmented Generation for Large Language Models: A Survey (survey principal)
3. Engineering the RAG Stack (arquitetura completa)
4. A Comprehensive Survey of RAG: Evolution, Current Landscape and Future Directions (evolução)
5. LLMs as Repositories of Factual Knowledge: Limitations and Solutions (limitações LLM)
6. Blended RAG (hybrid search)
7. Ragas: Automated Evaluation of RAG (avaliação)
8. Survey of vector database management systems (vector stores)
9. A Systematic Review of Key RAG Systems (taxonomia)
10. Developing RAG based LLM Systems from PDFs (case prático)

---

## Resumos Detalhados dos Artigos

### 1. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks

**Autores:** Patrick Lewis, Ethan Perez, Aleksandra Piktus, Fabio Petroni, Vladimir Karpukhin, Naman Goyal, Heinrich Küttler, Mike Lewis, Wen-tau Yih, Tim Rocktäschel, Sebastian Riedel, Douwe Kiela (Facebook AI Research / UCL / NYU)

**Relevância:** Módulo 6 — Paper original que cunhou o termo RAG.

**Resumo detalhado:**

Este é o paper seminal que introduziu o conceito de Retrieval-Augmented Generation (RAG). Os autores demonstram que modelos de linguagem pré-treinados armazenam conhecimento factual em seus parâmetros, mas têm capacidade limitada de acessar e manipular esse conhecimento com precisão. A proposta combina memória paramétrica (um modelo seq2seq pré-treinado como BART) com memória não-paramétrica (um índice vetorial denso do Wikipedia, acessado via um retriever neural pré-treinado — DPR).

**Arquitetura:**
- **Retriever:** Dense Passage Retriever (DPR) com dual-encoder contrastivo que calcula similaridade por produto interno: `score(q, d) = f_q(q)^T * f_d(d)`
- **Generator:** BART (seq2seq) que recebe a query + documentos recuperados
- **Duas formulações:** RAG-Sequence (condiciona nos mesmos documentos para toda a sequência gerada) e RAG-Token (pode usar documentos diferentes por token gerado)
- **Marginalização:** A geração final é `P(y|q, D1...Dk) = Σ P(y|q, Di) * P(Di|q)`, integrando os priors de relevância ao processo de decodificação

**Resultados principais:**
- Estado da arte em 3 benchmarks de QA open-domain (Natural Questions, TriviaQA, WebQuestions)
- Superou tanto modelos seq2seq paramétricos puros quanto arquiteturas de retrieve-and-extract específicas por tarefa
- Em tarefas de geração de linguagem, RAG gera texto mais específico, diverso e factual que modelos paramétricos puros
- O conhecimento pode ser atualizado simplesmente trocando o índice de documentos, sem retreinar o modelo

**Dados úteis para o artigo:**
- "Large pre-trained language models store factual knowledge in their parameters, but their ability to access and precisely manipulate knowledge is still limited"
- A distinção entre memória paramétrica (pesos do modelo) e não-paramétrica (corpus externo) é fundamental para entender por que RAG funciona
- O paper estabelece que RAG resolve simultaneamente: hallucination, proveniência de decisões e atualização de conhecimento

---

### 2. Retrieval-Augmented Generation for Large Language Models: A Survey

**Autores:** Yunfan Gao, Yun Xiong, Xinyu Gao et al. (Tongji University / Fudan University)

**Relevância:** Módulos 6, 8, 9 — Survey principal que define a taxonomia Naive/Advanced/Modular RAG.

**Resumo detalhado:**

Este survey é a referência mais completa para a taxonomia de RAG. Ele organiza os paradigmas de RAG em três gerações evolutivas e examina sistematicamente os componentes de retrieval, generation e augmentation.

**Taxonomia dos paradigmas RAG:**

1. **Naive RAG (Retrieve-Read):** Pipeline simples de indexação → retrieval → geração. Limitações: baixa precisão de retrieval, redundância/ruído nos chunks recuperados, "lost in the middle" (informação no meio do contexto é ignorada pelo LLM), hallucination quando o contexto é insuficiente.

2. **Advanced RAG:** Adiciona otimizações em três estágios:
   - **Pré-retrieval:** Otimização de índices, otimização de queries (query rewriting, expansão, transformação), sliding window, fine-grained segmentation
   - **Retrieval:** Hybrid search (dense + sparse), embedding fine-tuning
   - **Pós-retrieval:** Reranking (cross-encoders), compressão de contexto, filtragem

3. **Modular RAG:** Separa a pipeline em módulos combináveis e reutilizáveis: mútiplos retrievers, roteamento por fonte, pipelines configuráveis, avaliação integrada, fallbacks

**Técnicas de augmentation examinadas:**
- Augmentation stages: pré-treinamento, fine-tuning, inferência
- Augmentation sources: dados não estruturados, estruturados (KGs), gerados pelo próprio LLM
- Augmentation process: iterativo (múltiplas rodadas de retrieval), recursivo (decomposição em sub-queries), adaptativo (o modelo decide quando buscar)

**Métricas de avaliação:**
- Retrieval: Hit Rate, MRR, NDCG
- Geração: Faithfulness, Answer Relevance, Answer Correctness
- Framework de avaliação end-to-end: RAGAS, ARES, TruLens

**Dados úteis para o artigo:**
- "RAG synergistically merges LLMs' intrinsic knowledge with the vast, dynamic repositories of external databases"
- A evolução Naive → Advanced → Modular reflete níveis de maturidade arquitetural
- LLMs sofrem de hallucination, outdated knowledge e non-transparent reasoning — RAG endereça os três

---

### 3. A Comprehensive Survey of Retrieval-Augmented Generation (RAG): Evolution, Current Landscape and Future Directions

**Autores:** Shailja Gupta, Rajesh Ranjan, Surya Narayan Singh (Carnegie Mellon University / BIT Sindri)

**Relevância:** Módulos 1, 6, 8 — Traça a evolução do RAG desde os fundamentos até o estado da arte.

**Resumo detalhado:**

Este survey traça a história evolutiva completa do RAG. Começa explicando como NLP evoluiu de modelos seq2seq tradicionais (que sofrem com hallucination) até a combinação de retrieval + generation. O paper detalha que modelos como GPT e BERT geram texto fluente mas factualmente incorreto quando precisam de conhecimento além dos dados de treinamento — motivação central para o RAG.

**Contribuições principais:**
- Revisão dos componentes fundamentais: retriever (como informação é encontrada), generator (como respostas são criadas), e a integração entre eles
- O retriever tipicamente usa representações vetoriais densas para identificar documentos relevantes em datasets como Wikipedia ou bases proprietárias
- Após recuperação, documentos são passados ao módulo generativo (baseado em Transformer) para gerar respostas fundamentadas no conhecimento recuperado
- Aplicações cobertas: QA open-domain, agentes conversacionais, recomendações personalizadas

**Desafios identificados:**
- Escalabilidade: como manter retrieval eficiente com corpus de bilhões de documentos
- Bias: vieses nos dados de treinamento e no corpus de retrieval
- Ética: uso responsável em domínios sensíveis (saúde, jurídico)

**Dados úteis para o artigo:**
- "RAG integrates two key components: (i) a retrieval mechanism retrieving relevant documents from an external knowledge source, and (ii) a generation module processing this information to generate human-like text"
- "This methodology helps mitigate the hallucination problem and ensures that the generated text is more factual and contextually appropriate"
- Timeline de evolução de NLG mostra transição clara: modelos puros → RAG → sistemas multimodais

---

### 4. Engineering the RAG Stack: A Comprehensive Review of the Architecture and Trust Frameworks

**Autores:** Dean Wampler, Dave Nielson, Alireza Seddighi (The AI Alliance / IBM Research)

**Relevância:** Módulos 7, 8, 10 — Guia prático e detalhado da arquitetura RAG em produção.

**Resumo detalhado:**

Este é o paper mais completo sobre arquitetura RAG em produção. Baseado em revisão sistemática de 2018 a 2025, consolidando literatura acadêmica, relatórios industriais e guias de implementação. Foca em como construir sistemas RAG confiáveis, seguros e adaptáveis a domínios específicos.

**Taxonomia arquitetural em 5 dimensões:**

| Dimensão | Variantes | Impacto |
|----------|-----------|---------|
| **Retrieval** | Single-pass, Multi-hop, Iterativo | Afeta recall, profundidade de raciocínio, latência |
| **Fusion** | Early, Late, Marginal | Modula factualidade, coerência, supressão de hallucination |
| **Modality** | Mono-modal (texto), Multi-modal, Estruturado | Habilita flexibilidade de domínio e grounding factual |
| **Adaptivity** | Static pipeline, Agentic, Auto-configurável | Permite controle dinâmico, planejamento de retrieval, correção de erros |
| **Trust Layer** | Citation, Abstention, Source Filtering/Scoring | Melhora interpretabilidade, reduz hallucinations e bias |

**Pipeline canônico (DPR + BART/T5):**
- Dense Passage Retriever com bi-encoders + Generator seq2seq (BART ou T5)
- Marginalização sobre passagens recuperadas: probabilistic grounding
- Trade-offs documentados: DPR tem retrieval sublinear mas recall reduzido em queries lexicais; fusão por concatenação é simples mas limitada pelo context length; BART/T5 geram texto fluente mas são suscetíveis a hallucination

**Evolução para Agentic RAG:**
- Shift fundamental de pipelines determinísticos para sistemas com decision-making inteligente
- Agentes que adaptam dinamicamente com base na complexidade da query e resultados intermediários
- Exemplos: AutoRAG, ReAct-RAG, Self-RAG

**Dados úteis para o artigo:**
- "RAG systems offer substantial advantages over monolithic LLM structures: real-time access to updated corpora, plug-and-play modularity, and citation traceability"
- Organizações reportam economias significativas em custos de atualização de conhecimento vs retreinamento de modelos
- Tabela comparativa de modelos canônicos (DPR+BART, DPR+T5, FiD, Atlas, WebGPT) com forças/limitações de cada

---

### 5. Retrieval Augmented Generation (RAG) and Beyond: A Comprehensive Survey on How to Make your LLMs use External Data More Wisely

**Autores:** Siyun Zhao, Yuqing Yang, Zilong Wang et al. (Microsoft Research Asia)

**Relevância:** Módulos 6, 9, 11 — Classificação de queries por nível de complexidade e técnicas adequadas.

**Resumo detalhado:**

Este survey da Microsoft Research propõe uma categorização inovadora de tarefas RAG baseada no tipo de dado externo necessário e no foco principal da tarefa:

**4 níveis de queries:**
1. **Explicit Fact Queries:** Fatos diretamente recuperáveis (ex: "Qual é a capital da França?")
2. **Implicit Fact Queries:** Requerem inferência sobre fatos recuperados (ex: "Qual país europeu com mais de 60M habitantes tem PIB per capita acima de $40k?")
3. **Interpretable Rationale Queries:** Exigem raciocínio interpretável combinando múltiplas fontes
4. **Hidden Rationale Queries:** O padrão de raciocínio não é evidente e precisa ser descoberto

**Insight central:** "There is no one-size-fits-all solution for data-augmented LLM applications. Underperformance often arises from failure to correctly identify the core focus of a task."

**Dados úteis para o artigo:**
- Framework para decidir quando usar RAG vs fine-tuning vs modelo base
- Cada nível de query requer técnicas diferentes (retrieval simples para nível 1, decomposição + multi-hop para nível 3, agentes para nível 4)
- Reforça que a qualidade do RAG depende mais de como os dados são preparados e recuperados do que do modelo gerador em si

---

### 6. Blended RAG: Improving RAG Accuracy with Semantic Search and Hybrid Query-Based Retrievers

**Autores:** Kunal Sawarkar, Abhilasha Mangal, Shivam Raj Solanki (IBM)

**Relevância:** Módulo 9 — Demonstra como hybrid search supera busca por keyword e busca vetorial pura.

**Resumo detalhado:**

Paper prático da IBM que propõe o método "Blended RAG" combinando três tipos de busca com queries híbridas.

**3 estratégias de busca combinadas:**
1. **BM25 Index:** Busca por keyword clássica com fuzzy matching
2. **Dense Vector Index (KNN):** Sentence transformers + similaridade vetorial — captura relações semânticas profundas, vai além de keywords
3. **Sparse Encoder Index (ELSER):** Expande termos do documento e da query usando vocabulário aprendido — combina compreensão semântica com retrieval por similaridade

**Tipos de queries híbridas testadas:**
- Cross Fields, Most Fields, Best Fields, Phrase Prefix
- Cada combinação de índice + query type produz resultados diferentes por dataset

**Resultados quantitativos:**

| Dataset | Método anterior | Blended RAG | Melhoria |
|---------|----------------|-------------|----------|
| NQ (NDCG@10) | 0.633 (monoT5-3B) | **0.67** | +5.8% |
| TREC-COVID (NDCG@10) | 0.804 (COCO-DR Large) | **0.87** | +8.2% |
| SQuAD (F1) | 52.63 (RAG-end2end, fine-tuned) | **68.4** | +30% sem fine-tuning |
| NQ (EM) | 29.3 (PaLM540B, one-shot) | **42.63** | +35% zero-shot |

**Conclusão chave:** "Sparse Encoder com Best Fields" foi consistentemente o melhor retriever. A combinação de busca semântica com queries híbridas supera tanto busca por keyword quanto busca vetorial pura — e até supera fine-tuning em alguns casos.

**Trade-off importante:** Dense vectors geram índices de ~50GB para 5M docs (HotPotQA), enquanto sparse vectors ocupam apenas ~10.5GB. Dense é mais rápido para indexar mas mais lento para queries; sparse é o inverso.

**Dados úteis para o artigo:**
- Demonstração quantitativa de que hybrid search (Módulo 9) é superior a qualquer método isolado
- Blended RAG melhora F1 em 50% no SQuAD sem nenhum fine-tuning — prova que o retriever é mais importante que o generator
- Para empresas com grandes volumes de dados, sparse encoder + federated search é recomendado

---

### 7. Ragas: Automated Evaluation of Retrieval Augmented Generation

**Autores:** Shahul Es, Jithin James, Luis Espinosa-Anke, Steven Schockaert (Exploding Gradients / Cardiff University)

**Relevância:** Módulo 9 (avaliação) — Framework de avaliação reference-free para pipelines RAG.

**Resumo detalhado:**

RAGAS é o framework de avaliação mais adotado para sistemas RAG. Propõe métricas que não dependem de ground truth humano, permitindo ciclos de avaliação mais rápidos.

**3 dimensões de qualidade avaliadas:**

1. **Faithfulness (Fidelidade):** A resposta é fundamentada no contexto recuperado? O sistema:
   - Extrai claims/statements da resposta via LLM
   - Verifica cada statement contra o contexto: pode ser inferido? (sim/não)
   - Score = statements verificados / total de statements

2. **Answer Relevance (Relevância da resposta):** A resposta endereça a pergunta? O sistema:
   - Gera N perguntas potenciais a partir da resposta
   - Calcula similaridade de embedding (cosine) entre cada pergunta gerada e a pergunta original
   - Score = média das similaridades

3. **Context Relevance (Relevância do contexto):** O contexto recuperado é focado e útil? O sistema:
   - Extrai sentenças do contexto que são relevantes para responder a pergunta
   - Score = sentenças relevantes / total de sentenças no contexto

**Resultados de validação (WikiEval dataset):**

| Métrica | Ragas | GPT Score | GPT Ranking |
|---------|-------|-----------|-------------|
| Faithfulness | **0.95** | 0.72 | 0.54 |
| Answer Relevance | **0.78** | 0.52 | 0.40 |
| Context Relevance | **0.70** | 0.63 | 0.52 |

**Dados úteis para o artigo:**
- Framework prático e open-source para medir qualidade de RAG sem anotação humana
- Integração nativa com LlamaIndex e LangChain
- As 3 métricas mapeiam diretamente para os 3 problemas centrais: hallucination (faithfulness), resposta fora do escopo (answer relevance), e retrieval de ruído (context relevance)
- Validação mostra 95% de concordância com avaliadores humanos em faithfulness

---

### 8. A Systematic Review of Key Retrieval-Augmented Generation (RAG) Systems: Progress, Gaps, and Future Directions

**Autores:** Agada Joseph Oche, Ademola Glory Folashade, Tirthankar Ghosal, Arpan Biswas (University of Tennessee / Oak Ridge National Laboratory)

**Relevância:** Módulos 6, 8, 12 — Revisão sistemática ano a ano com gaps e direções futuras.

**Resumo detalhado:**

Revisão sistemática que acompanha a evolução do RAG desde 2017 até 2025, com análise ano a ano de marcos técnicos. Cobre desde os precursores do RAG em QA open-domain até implementações enterprise.

**Definição formal de RAG:**
- `P(y|x) = Σ P_ret(zi|x) * P_gen(y|x, zi)` para i=1..K
- Onde P_ret é a probabilidade de retrieval, P_gen é a probabilidade condicional de geração
- RAG mantém dois tipos de memória: paramétrica (pesos do modelo) e não-paramétrica (corpus externo via retrieval)

**Pipeline técnico detalhado (4 estágios):**
1. **Chunking:** Documentos segmentados em passagens menores — fine-grained chunks melhoram chance de recuperar fragmento altamente relevante
2. **Embedding:** Bi-encoder transformer produz vetores densos armazenados em vector index para busca por similaridade semântica
3. **Reranking:** Cross-encoder reavalia top-k candidatos com atenção cruzada query-documento — "substantially higher accuracy than single-stage retrievers alone"
4. **Generation:** Seq2seq (T5, BART) ou LLM gera resposta condicionada nos chunks top-N

**Marcos destacados:**
- 2020: Paper original RAG (Lewis et al.)
- 2022: RETRO (DeepMind) — 7.5B params + trilhões de tokens, melhora perplexidade com retrieval durante geração
- 2023: Centenas de publicações + adoção em sistemas comerciais (search engines, assistentes virtuais, customer support)
- 2024-2025: Agentic RAG, privacidade, hybrid retrieval, RAG para dados proprietários

**Dados úteis para o artigo:**
- Distinção clara entre memória paramétrica e não-paramétrica — conceito chave para explicar por que RAG funciona
- "RAG's outputs can be more accurate and factually correct compared to generation from a standalone LLM, especially for knowledge-intensive queries"
- "The knowledge in a RAG system can be easily updated by modifying the document index without retraining the generator"

---

### 9. Developing Retrieval Augmented Generation (RAG) based LLM Systems from PDFs: An Experience Report

**Autores:** Ayman Asad Khan, Md Toufique Hasan, Kai Kristian Kemell, Jussi Rasku, Pekka Abrahamsson (Tampere University)

**Relevância:** Módulo 7 — Guia prático end-to-end para construir RAG com PDFs.

**Resumo detalhado:**

Experience report focado no pipeline completo de implementação RAG usando PDFs como fonte primária. Compara duas abordagens: OpenAI Assistant API (GPT Series) vs modelos open-source (Llama).

**Pipeline end-to-end documentado:**
1. **Data Collection:** Aquisição de PDFs domain-specific
2. **Data Preprocessing:** Limpeza, normalização, segmentação em chunks
3. **Creating Vector Embeddings:** Transformação via modelos de embedding (BERT, Sentence Transformers) → armazenamento em Vector Store
4. **Retrieval:** Query → embedding → busca por similaridade no vector store → top-k chunks
5. **Augmentation:** Merge do conhecimento fixo do LLM + informação domain-specific recuperada on-demand
6. **Generation:** Context-infused prompt → LLM (GPT, T5 ou Llama) → resposta fundamentada
7. **Final Output:** Resposta com citações, minimizando hallucinations

**Framework de decisão (RAG vs Fine-tuning vs Base Model):**

| Fator | Fine-Tuning | RAG | Base Model |
|-------|-------------|-----|------------|
| Natureza da tarefa | Altamente especializada | Dinâmica, info em tempo real | Geral, prototipação |
| Dados | Estáticos, proprietários | Grandes bases atualizáveis | Não precisa de dados especializados |
| Recursos | Alto custo computacional | Infra complexa (vector DB + pipeline) | Baixo custo |
| Performance | Máxima precisão em domínio | Respostas com contexto + fontes | Velocidade e eficiência |

**Desafios com PDFs:**
- Layouts complexos (multi-coluna, headers, footers, imagens) degradam extração de texto
- PDFs escaneados requerem OCR, que introduz erros
- Elementos não-textuais (tabelas, gráficos) interrompem o fluxo linear
- Metadados e anotações dos PDFs podem ser aproveitados como features extras para retrieval

**Recomendações práticas:**
- Semantic chunking (dividir por seções/parágrafos lógicos) > chunking por tamanho fixo
- Dynamic chunk sizing conforme tipo de conteúdo
- Normalização de texto (lowercase, remoção de caracteres especiais) antes de indexar
- Extração de metadados do PDF para enriquecer o retrieval

**Dados úteis para o artigo:**
- Pipeline completo e prático que pode ser usado como exemplo real no Módulo 7
- Tabela de decisão RAG vs Fine-tuning vs Base Model é muito didática para apresentação
- "RAG creates glass-box models" — paradigma shift de black-box para explicabilidade

---

### 10. FAIR-RAG: Faithful Adaptive Iterative Refinement for Retrieval-Augmented Generation

**Autores:** Mohammad Aghajani Asl, Majid Asgari-Bidhendi, Behrooz Minaei-Bidgoli (Sharif University / Iran University)

**Relevância:** Módulo 8 (Corrective RAG) — Framework agentic com refinamento iterativo guiado por evidências.

**Resumo detalhado:**

FAIR-RAG transforma o pipeline RAG padrão em um processo de raciocínio dinâmico guiado por evidências, especialmente eficaz para queries multi-hop complexas.

**Arquitetura em 4 componentes:**
1. **Adaptive Routing:** Analisa complexidade da query → decide caminho ótimo (resposta direta vs pipeline completo)
2. **Iterative Refinement Cycle:** Loop que progressivamente constrói e valida o contexto
3. **Structured Evidence Assessment (SEA):** Mecanismo de gating analítico que:
   - Desconstrói a query em checklist de findings necessários
   - Audita sistematicamente a evidência acumulada
   - Identifica facts confirmados e **gaps informacionais explícitos**
4. **Adaptive Query Refinement:** Gera sub-queries direcionadas para preencher os gaps identificados

**O ciclo repete até que a evidência seja verificada como suficiente.**

**Resultados quantitativos (F1-score):**

| Benchmark | Standard RAG | Self-RAG | Iter-Retgen | **FAIR-RAG** | Melhoria |
|-----------|-------------|----------|-------------|-------------|----------|
| HotpotQA | — | — | 0.370 | **0.453** | +8.3 pts |
| 2WikiMultiHopQA | — | 0.251 | — | **0.320** | +6.9 pts |
| MusiQue | — | — | 0.190 | **0.264** | +7.4 pts |
| TriviaQA | — | — | — | **0.731** | SOTA |

**Dados úteis para o artigo:**
- Exemplo concreto de Corrective/Agentic RAG (Módulo 8) com resultados mensuráveis
- O conceito de "gap analysis" — identificar explicitamente o que falta na evidência — é inovação chave
- Performance melhora consistentemente com mais iterações (1→3: 0.398→0.447 no HotpotQA)
- Prova que RAG iterativo e adaptativo é significativamente superior ao retrieve-then-read simples

---

### 11. Auto-RAG: Autonomous Retrieval-Augmented Generation for Large Language Models

**Autores:** Tian Yu, Shaolei Zhang, Yang Feng (Chinese Academy of Sciences)

**Relevância:** Módulo 8 (Agentic RAG) — Modelo que decide autonomamente quando e o que buscar.

**Resumo detalhado:**

Auto-RAG é um modelo de iterative retrieval autônomo centrado nas capacidades de decision-making do LLM. Em vez de regras manuais ou few-shot prompting, o LLM aprende a raciocinar sobre quando buscar, o que buscar e quando parar.

**Processo de iterative retrieval como diálogo multi-turno:**
1. LLM recebe query do usuário
2. **Retrieval Planning:** LLM identifica explicitamente o conhecimento necessário
3. **Information Extraction:** Para cada documento recuperado, LLM extrai informação relevante (filtra ruído)
4. **Answer Inference:** Quando conhecimento suficiente é acumulado, LLM formula resposta final
5. Se retriever falha após T iterações, utiliza **conhecimento paramétrico** do próprio LLM como fallback

**Tipos de raciocínio no ciclo:**
- (1) Planejamento: o que preciso saber? → gera query refinada
- (2) Extração: o que nesse documento é útil? → resume/filtra
- (3) Inferência: tenho tudo? → se sim, responde; se não, volta ao passo 1

**Resultados:** Performance superior em 6 benchmarks (NQ, TriviaQA, WebQuestions, 2WikiMultihopQA, HotpotQA, PopQA). Auto-RAG ajusta automaticamente o número de iterações baseado na dificuldade da pergunta — queries simples terminam em 1 iteração, complexas usam até 5+.

**Dados úteis para o artigo:**
- Exemplo perfeito de Agentic RAG (Módulo 8): o LLM é o agente que controla o fluxo
- "Auto-RAG expresses the iterative retrieval process in natural language, enhancing interpretability"
- Diálogo multi-turno entre LLM e retriever é uma forma intuitiva de explicar Agentic RAG na apresentação

---

### 12. LLMs as Repositories of Factual Knowledge: Limitations and Solutions

**Autores:** Seyed Mahed Mousavi, Simone Alghisi, Giuseppe Riccardi (University of Trento)

**Relevância:** Módulo 5 — Estudo empírico das limitações de LLMs como repositórios de conhecimento factual.

**Resumo detalhado:**

Este paper investiga sistematicamente a confiabilidade de LLMs como repositórios de conhecimento factual, avaliando 24 LLMs state-of-the-art com o framework dinâmico DyKnow.

**Problema central:** LLMs são artefatos estáticos treinados em snapshots de dados fixos. Isso os torna propensos a:
- Respostas desatualizadas (outdated)
- Inconsistências quando a mesma entidade aparece com diferentes lexicalizações (CR7, Ronaldo, Cristiano)
- Conhecimento "fragmentado" entre snapshots de treinamento

**Avaliação com DyKnow (130 fatos time-sensitive):**

| Modelo (ano) | Correto | Desatualizado | Irrelevante |
|-------------|---------|---------------|-------------|
| GPT-2 (2019) | 26% | 42% | 32% |
| GPT-4 (2023) | **80%** | 13% | 7% |
| Llama-3 (2024) | 57% | 36% | 7% |
| T5 (2020) | 11% | 21% | **68%** |
| ChatGPT (2022) | 57% | 35% | 8% |

**Métodos de melhoria testados:**
- Knowledge editing (ROME, MEMIT, SERAC, IKE) — limitados, sofrem de catastrophic forgetting
- **RAG** — mais eficaz para atualizar conhecimento sem retrainer
- **ENAF (Entity-Aware Fine-tuning)** — abordagem neurossimbólica que melhora consistência

**Dados úteis para o artigo:**
- Tabela com 24 LLMs mostrando % de respostas corretas vs desatualizadas vs irrelevantes — dado fortíssimo para Módulo 5
- Mesmo GPT-4 tem 13% de respostas desatualizadas e 7% irrelevantes
- "Without external context, the model generates with fluency, but not necessarily with grounding" — frase chave
- RAG supera knowledge editing como solução para atualização de conhecimento

---

### 13. Survey of Vector Database Management Systems

**Autores:** James Jie Pan, Jianguo Wang, Guoliang Li (Tsinghua University / Purdue University)

**Relevância:** Módulo 10 — Survey completo de sistemas de gerenciamento de vector databases.

**Resumo detalhado:**

Survey abrangente que cobre mais de 20 VDBMSs comerciais produzidos nos últimos 5 anos, contextualizando dentro de 50+ anos de pesquisa em similarity search.

**5 obstáculos principais de vector data management:**
1. **Vagueness:** Queries vetoriais dependem de noção vaga de similaridade semântica (vs predicados booleanos precisos)
2. **Expensive Comparisons:** Comparação de similaridade é O(D) por vetor (vs O(1) para predicados de atributos)
3. **Large Size:** Vetores podem ocupar múltiplas páginas de dados, encarecendo leituras em disco
4. **Lack of Structure:** Vetores não têm ordem natural, dificultando design de índices eficientes
5. **Incompatibility with Attributes:** Combinar busca vetorial com filtros de atributos (hybrid queries) é desafiador

**Tipos de similaridade:**
- Inner Product, Cosine Similarity (mais usados em RAG)
- Minkowski (generalização da distância Euclidiana)
- Hamming (para vetores binários/quantizados)

**Técnicas de indexação:**
- **Table-based:** E2LSH, SPANN, IVFADC — fáceis de atualizar
- **Tree-based:** FLANN, RPTree, ANNOY — busca logarítmica
- **Graph-based:** KGraph, FANNG, HNSW — melhor performance empírica mas menor compreensão teórica

**Classificação de sistemas:**
- **Native:** Vearch, Milvus, Manu — otimizados especificamente para vetores
- **Extended:** AnalyticDB-V, PASE — adicionam capacidades vetoriais a sistemas existentes
- **Search engines/libraries:** Apache Lucene, Elasticsearch, Meta FAISS — foco em busca apenas

**Dados úteis para o artigo:**
- Survey completo que cobre Qdrant, Pinecone, Weaviate, Milvus, pgvector, Elasticsearch — todos mencionados no Módulo 10
- Explicação clara de por que busca vetorial é fundamentalmente diferente de busca estruturada
- Trade-offs entre native vs extended vs library são diretamente úteis para recomendações de stack

---

### 14. MultiHop-RAG: Benchmarking RAG for Multi-Hop Queries

**Autores:** Yixuan Tang, Yi Yang (HKUST)

**Relevância:** Módulo 9 — Benchmark que expõe fraquezas de RAG em queries complexas.

**Resumo detalhado:**

Paper que identifica que sistemas RAG existentes são inadequados para queries multi-hop (que exigem raciocínio sobre múltiplas peças de evidência). Apresenta o primeiro benchmark focado especificamente nesse tipo de query.

**4 tipos de multi-hop queries definidos:**
1. **Inference Query:** Resposta deduzida por raciocínio sobre evidências (ex: "Qual relatório discute o risco de supply chain da Apple?")
2. **Comparison Query:** Requer comparação entre evidências (ex: "Netflix ou Google teve maior receita em 2023?")
3. **Temporal Query:** Análise de informação temporal (ex: "Apple lançou o AirTag antes ou depois do iPad Pro 5?")
4. **Null Query:** Não pode ser respondida pelo corpus — testa se o LLM evita hallucination

**Resultados reveladores:**
- Embedding models tradicionais falham significativamente em recuperar evidência multi-hop
- Mesmo GPT-4 com contexto recuperado tem dificuldade em raciocinar sobre múltiplas evidências
- Cosine similarity padrão entre query e chunks é insuficiente para queries complexas

**Dados úteis para o artigo:**
- Taxonomia de queries multi-hop é excelente para o Módulo 9
- Evidencia uma limitação importante do RAG (Módulo 12): queries simples funcionam bem, mas multi-hop requer técnicas avançadas
- Null query é essencial para testar se o sistema sabe dizer "não sei" em vez de hallucinar

---

### 15. Self-Attention as Distributional Projection: A Unified Interpretation of Transformer Architecture

**Autores:** Nihal Mehta (Pesquisador independente)

**Relevância:** Módulo 4 — Interpretação matemática unificada de self-attention.

**Resumo detalhado:**

Paper que conecta self-attention à semântica distribucional, mostrando que a arquitetura Transformer emerge naturalmente de princípios matemáticos de projeção, não de escolha arbitrária de design.

**Framework progressivo:**
1. **Co-occurrence matrix S:** Matriz global que captura frequência de co-ocorrência entre tokens no corpus (base do GloVe)
2. **Context projection M = QSQ^T:** Projeta estatísticas globais no contexto local da sequência de entrada
3. **Q seleciona as linhas de S** (tokens presentes no input), **Q^T seleciona as colunas** (tokens com os quais interagem)
4. **Normalização por linha → pesos de atenção:** Emergem naturalmente como distribuições de probabilidade sobre parceiros contextuais

**Exemplo didático — desambiguação de "bank":**
- Input "river bank flooded" → a projeção amplifica associações geográficas (river-bank: 57%, bank-flooded: 43%) e suprime associações financeiras
- Input "bank loan" → a mesma projeção amplifica associações financeiras
- **O mecanismo de atenção realiza desambiguação contextual automaticamente**

**3 insights chave:**
1. **Projection Characterization:** Self-attention é a projeção de estatísticas de co-ocorrência globais em contexto local
2. **Asymmetric Extension:** O split query-key emerge naturalmente ao generalizar a projeção simétrica para relações linguísticas direcionais
3. **Unified Framework:** Positional encodings e multi-head attention são refinamentos estruturados do mesmo princípio de projeção

**Dados úteis para o artigo:**
- Explicação matematicamente rigorosa mas intuitiva de self-attention para o Módulo 4
- O exemplo "river bank flooded" vs "bank loan" é perfeito para uma apresentação
- "The Transformer architecture is not merely an empirically successful design, but rather the mathematical consequence of systematically extending distributional semantics"
- Query/Key/Value não são metáforas arbitrárias de information retrieval — emergem de princípios de projeção distribucional

---

### 16. A Survey on In-context Learning

**Autores:** Qingxiu Dong, Lei Li, Damai Dai et al. (Peking University / CMU / ByteDance)

**Relevância:** Módulos 3, 5 — Como LLMs aprendem a partir de exemplos no prompt sem atualizar parâmetros.

**Resumo detalhado:**

Survey abrangente sobre In-Context Learning (ICL), a capacidade emergente de LLMs de aprender tarefas a partir de poucos exemplos no contexto do prompt, sem atualizar parâmetros.

**Definição formal:** Dado um query x, exemplos de demonstração C = {I, s(x1,y1), ..., s(xk,yk)}, e candidatos Y, o LLM prevê: `ŷ = argmax_yj f_M(yj, C, x)`

**Taxonomia organizada em 3 eixos:**
1. **Training:** Pre-training orientado a ICL (reorganizar corpus por contextos relacionados), warmup (fine-tuning em múltiplas tarefas com demonstrações)
2. **Inference:** Seleção de demonstrações (unsupervised: KATE, similaridade; supervised: EPR, Q-learning), reformatação, ordenação, design de instruções, scoring functions
3. **Analysis:** Fatores influenciadores (dados de pré-treino, arquitetura, número de parâmetros), mecanismo de aprendizado (induction heads, gradient descent implícito)

**Vantagens do ICL:**
- Interface interpretável em linguagem natural para comunicar com LLMs
- Similar ao processo de decisão humano (aprender por analogia)
- Training-free → reduz drasticamente custos computacionais para adaptar a novas tarefas

**Dados úteis para o artigo:**
- ICL é o mecanismo fundamental pelo qual RAG funciona — o contexto recuperado são os "exemplos" que guiam a geração
- Explica por que colocar contexto relevante no prompt melhora respostas (Módulo 11)
- "ICL does not perform parameter updates. The model is expected to learn the pattern hidden in the demonstration"
- Performance é sensível a: template do prompt, seleção de exemplos, ordem dos exemplos, e modelo usado

---

### 17. Cognitive Architectures for Language Agents (CoALA)

**Autores:** Theodore Sumers, Shunyu Yao, Karthik Narasimhan, Thomas Griffiths (Princeton University)

**Relevância:** Módulos 1, 8 — Framework conceitual que conecta agentes de linguagem à história da IA cognitiva.

**Resumo detalhado:**

Paper que propõe um framework conceitual (CoALA) para organizar e projetar agentes de linguagem, conectando-os à tradição de ciência cognitiva e IA simbólica.

**Framework CoALA em 3 dimensões:**
1. **Memory:** Working memory (contexto atual, goals, resultados intermediários) + Long-term memory (procedural: produções/regras; semantic: fatos; episodic: experiências passadas)
2. **Action Space:** Ações internas (modificar memória, raciocinar) + Ações externas (interagir com ambiente, usar ferramentas, fazer retrieval)
3. **Decision-Making:** Loop interativo de planning → proposal/evaluation → execution

**Analogia histórica:** Production systems (Newell & Simon, 1972) → Cognitive architectures (Soar, ACT-R) → LLM-based agents. "Just as productions indicate possible ways to modify strings, LLMs define a distribution over changes or additions to text."

**Evolução:**
- **NLP clássico:** LLM como input→output (Figura 1A)
- **Language agents:** LLM em feedback loop com ambiente (Figura 1B)
- **Cognitive language agents:** LLM gerencia estado interno via reasoning, learning, memory (Figura 1C)

**Dados úteis para o artigo:**
- Conecta Agentic RAG (Módulo 8) à tradição histórica de IA — excelente para Módulo 1 (evolução)
- Framework memory + action + decision-making é muito didático
- "Language agents leverage commonsense priors present in LLMs to adapt to novel tasks, reducing dependence on human annotation"
- A transição NLP → agents → cognitive agents mapeia perfeitamente para a narrativa do artigo
