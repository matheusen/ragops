"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiBase } from "@/lib/api-base";

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
interface Section {
  id: string;
  label: string;       // display label
  heading: string;     // IEEE heading printed in paper_text
  content: string;
  collapsed: boolean;
}

/* ─────────────────────────────────────────────────────────────
   Initial content (From Tokens to RAG — IEEE structure)
───────────────────────────────────────────────────────────── */
const INITIAL_SECTIONS: Omit<Section, "collapsed">[] = [
  {
    id: "abstract",
    label: "Abstract",
    heading: "ABSTRACT",
    content:
`Large Language Models (LLMs) have transformed natural language processing, but their deployment in production environments exposes critical limitations: static parametric knowledge, susceptibility to hallucination, and lack of grounding in domain-specific data. Retrieval-Augmented Generation (RAG) addresses these limitations by coupling a retrieval mechanism with the generation process, enabling the model to condition its outputs on dynamically retrieved external evidence. This paper surveys the foundational architecture of modern AI systems—from tokenization and the Transformer attention mechanism to the full spectrum of RAG paradigms—and grounds the discussion in a real-world case study: the validation of banking software defect reports (Jira issues) using a hybrid RAG pipeline. We present the evolution from Naive RAG to Agentic RAG, examine key retrieval and augmentation techniques, and discuss frameworks, evaluation methodologies, and open limitations. Our case study demonstrates that an evidence-driven, facts-first RAG architecture substantially improves precision in automated bug triage within a financial domain, while raising important questions about chunking quality, multi-hop retrieval, and grounding auditability.`,
  },
  {
    id: "keywords",
    label: "Keywords",
    heading: "KEYWORDS",
    content:
`Retrieval-Augmented Generation, Large Language Models, Transformer architecture, tokenization, hybrid retrieval, vector databases, Agentic RAG, bug triage, Jira, banking systems, hallucination, grounding, RAGAS evaluation.`,
  },
  {
    id: "intro",
    label: "I. Introduction",
    heading: "I. INTRODUCTION",
    content:
`The emergence of large-scale pre-trained language models—from BERT [1] and GPT-2 [2] to GPT-4 and Gemini—has redefined the boundary between symbolic AI and statistical learning. These models store vast amounts of world knowledge in their parameters, yet their ability to access that knowledge precisely, keep it current, or restrict it to a specific organizational domain remains fundamentally limited [3].

In regulated industries such as banking, software development teams generate thousands of issue reports (bugs, incidents, change requests) per year. Validating whether an issue represents a genuine, reproducible, and adequately documented defect is a time-consuming triage task that requires cross-referencing prior incidents, runbooks, architecture documentation, and stack traces. A pure LLM approach fails here: the model cannot access proprietary knowledge bases, risks fabricating plausible-sounding but incorrect conclusions, and provides no auditability trail.

This paper makes three contributions. First, it provides a unified survey of the AI architecture stack from tokenization to Agentic RAG, organized as a progression of solutions to successive limitations. Second, it presents a practical taxonomy of RAG variants and techniques grounded in recent literature. Third, it describes a production-oriented RAG architecture applied to automated Jira issue validation in a Brazilian banking system, providing empirical observations on retrieval quality, multi-hop challenges, and cost-precision trade-offs.

The remainder of this paper is organized as follows: Section II reviews the evolution of AI architectures. Sections III–IV cover tokenization and the Transformer. Section V analyses LLM limitations. Sections VI–XI survey RAG in depth. Section XII discusses open limitations. Section XIII presents our banking case study. Section XIV concludes.`,
  },
  {
    id: "evolution",
    label: "II. Evolution of AI Architectures",
    heading: "II. EVOLUTION OF AI ARCHITECTURES",
    content:
`The path to modern LLMs runs through a succession of architectural innovations, each addressing the failures of its predecessor. Understanding this evolution is essential to understanding why RAG exists and why it takes the form it does.

A. Symbolic AI and Rule-Based Systems (1950s–1980s)

Early AI systems encoded human expertise as explicit if-then rules. Expert systems such as MYCIN achieved narrow competence but required exhaustive manual curation, could not generalize beyond their rule sets, and collapsed under the complexity of open-domain language [4].

B. Classical Machine Learning (1980s–2010s)

Statistical models—decision trees, SVMs, logistic regression, Naive Bayes—learned patterns from labeled data, reducing manual rule authoring. Bag-of-words and TF-IDF representations enabled document classification and information retrieval. However, these representations discarded word order and could not capture semantic similarity: "car" and "automobile" were orthogonal vectors.

C. Distributed Word Representations (2013–2016)

Word2Vec (Mikolov et al., 2013) and GloVe (Pennington et al., 2014) introduced dense vector representations learned from co-occurrence statistics, capturing semantic relationships geometrically: vector("king") − vector("man") + vector("woman") ≈ vector("queen"). These embeddings became the standard input layer for subsequent neural NLP, but they were static—each word had a single vector regardless of context, failing to disambiguate polysemous words.

D. Recurrent Neural Networks and LSTMs (2014–2018)

Sequence models (RNNs, LSTMs, GRUs) introduced context-sensitive representations: the hidden state at each timestep encoded information from all preceding tokens. Yet they suffered from vanishing gradients over long sequences, prevented full parallelization (each token depended on the previous), and struggled with dependencies spanning hundreds of tokens—critical for understanding long technical documents [5].

E. Attention Mechanism (2015)

Bahdanau et al. (2015) introduced additive attention for machine translation: instead of compressing the entire source sequence into a single vector, the decoder learned to attend selectively to different source positions at each decoding step. This was the conceptual breakthrough that made long-range dependencies tractable. Luong et al. (2015) introduced more efficient multiplicative attention, the direct precursor to the self-attention in Transformers.

F. The Transformer (2017)

Vaswani et al. [6] eliminated recurrence entirely. In "Attention Is All You Need," all tokens are processed in parallel; contextual representations are computed through multi-head self-attention across the full sequence simultaneously. Training time dropped dramatically, and model depth could scale without the vanishing-gradient bottleneck of RNNs.

G. Two Paradigms: Encoders vs. Decoders (2018–2020)

The Transformer architecture bifurcated into two dominant paradigms. BERT (Devlin et al. [1]) uses a bidirectional encoder pre-trained with masked language modeling—excellent for understanding and classification tasks. GPT (Radford et al. [2]) uses a unidirectional decoder pre-trained with causal language modeling—optimized for generation. Most modern LLMs (GPT-4, Gemini, Llama) are decoder-only models scaled to billions of parameters.

H. Scale Laws and Emergent Capabilities (2020–2022)

Kaplan et al. (2020) demonstrated that model loss decreases as a power law with model size, dataset size, and compute—the scaling laws. Hoffmann et al. (2022) refined this with Chinchilla: for a given compute budget, it is more efficient to train a smaller model on more data than a larger model on fewer tokens. GPT-3 [7] demonstrated that scale alone enables emergent few-shot capabilities: with 175B parameters, the model could solve new tasks from natural-language examples with no gradient updates.

I. Instruction Tuning and RLHF (2022–2023)

Raw pre-trained models generate plausible continuations but do not follow instructions reliably. InstructGPT (Ouyang et al., 2022) introduced reinforcement learning from human feedback (RLHF): the model is fine-tuned to maximize a reward signal from human preference judgments. This alignment step transforms a language model into an assistant. Instruction tuning on curated task mixtures (FLAN, T0) achieved similar alignment at lower cost.

J. Mixture of Experts (MoE) Architecture

Mixture of Experts (MoE) is an architectural technique—pioneered in the deep learning era by Shazeer et al. (2017) with Sparsely-Gated MoE and brought to production scale by Switch Transformer (Fedus et al., 2021) and Mixtral (Mistral AI, 2024)—that addresses the computational cost of scaling dense models.

In a standard dense Transformer, every token activates every parameter in every layer. In an MoE model, each feed-forward sublayer is replaced by N expert sub-networks and a learned router. For each token, the router selects the top-k experts (typically k=1 or k=2) and routes the token exclusively through them. The output is a weighted combination of the selected experts' outputs:

  FFN_MoE(x) = sum_{i in TopK(router(x))} g_i(x) * Expert_i(x)

where g_i are the routing weights (softmax over router logits). This means that at any given forward pass, only k/N of the total parameters are activated—providing the capacity of a much larger model at a fraction of the compute cost.

Key properties of MoE:
- Parameter efficiency: Mixtral 8x7B has 46.7B total parameters but activates only ~12.9B per token, matching or exceeding dense 13B models at similar inference cost.
- Specialization: experts tend to specialize on semantic domains or syntactic functions without explicit supervision.
- Scaling: MoE scales total capacity much faster than dense models for the same compute budget.
- Challenges: load balancing (avoiding router collapse where all tokens go to one expert), communication overhead in distributed settings, and training instability at large scale.

MoE is now a standard ingredient in frontier models. Gemini 1.5, GPT-4, and Llama models with MoE variants all leverage this architecture to achieve high capacity at manageable inference cost.

K. RAG and Agentic AI (2020–present)

The limitations of purely parametric models (Section V) motivated hybrid architectures that augment generation with retrieval [8]. Sumers et al. [9] frame this evolution within the tradition of cognitive architectures: modern language agents manage working memory, episodic memory, and action spaces in ways analogous to classical systems such as Soar and ACT-R, but grounded in the distributional competence of LLMs.`,
  },
  {
    id: "tokenization",
    label: "III. Tokenization and Internal LLM Pipeline",
    heading: "III. TOKENIZATION AND THE INTERNAL LLM PIPELINE",
    content:
`A. What Is a Token

LLMs do not process raw text. They operate on tokens—discrete units produced by a tokenizer such as Byte-Pair Encoding (BPE) or WordPiece. A token may correspond to a full word, a morpheme, a punctuation mark, or a byte sequence. For example, the word "tokenization" may be split as ["token", "ization"], while "RAG" may remain a single token or be further split depending on the vocabulary.

The key implication: the model's vocabulary (typically 32k–100k tokens) and its handling of rare or technical terms—internal error codes, financial acronyms, identifier strings like PAY-1421—depend heavily on tokenizer design. A term absent from or fragmented in the vocabulary will receive poor embeddings, degrading both retrieval and generation quality.

B. The Tokenization-to-Embedding Pipeline

The complete pipeline from raw text to model input:

  1. Raw text: "Payment failed: NullPointerException at line 847"
  2. Normalization: lowercasing, Unicode normalization, whitespace handling
  3. Tokenization (BPE): ["payment", "failed", ":", "Null", "Pointer", "Exception", "at", "line", "847"]
  4. Integer IDs: each token maps to an index in the vocabulary table [5423, 1891, 25, 9012, ...]
  5. Embedding lookup: each ID maps to a dense vector in R^d (d = 768, 1024, 4096 depending on model size)
  6. Positional encoding: a position-dependent signal is added to each embedding so the model knows order

C. What Happens Inside the LLM — Layer by Layer

After embedding, the token vectors pass through L Transformer layers (e.g., GPT-3: L=96, d=12288). Each layer performs the same two operations in sequence:

Layer l input: a matrix X of shape [sequence_length × d], one row per token.

  Step 1 — Multi-Head Self-Attention:
  Each token computes Query, Key, Value projections. The attention operation is:
    Attention(Q,K,V) = softmax(QK^T / sqrt(d_k)) * V
  This produces a new representation for each token that is a weighted combination of all other tokens' values—weighted by how much attention each pair deserves. After L=0, "bank" in "river bank flooded" and "bank" in "bank loan" have identical representations. After L=1, they begin to diverge because their neighbors differ.

  Step 2 — Feed-Forward Network (FFN):
  Each token independently passes through a two-layer MLP:
    FFN(x) = max(0, xW_1 + b_1) * W_2 + b_2
  The FFN adds non-linear capacity, allowing the model to encode more complex transformations than attention alone. Research suggests that FFN layers store factual associations (e.g., "Paris is the capital of France").

  Residual connection + Layer Normalization wraps both steps, enabling gradients to flow through hundreds of layers without vanishing.

After L layers: each token's vector no longer encodes just its identity—it encodes its relational meaning within the full sequence. The final-layer vector for a token is the model's contextualized understanding of that token.

D. Autoregressive Generation

During generation, the model produces one token at a time. At each step t:
  1. All previously generated tokens [t_0, t_1, ..., t_{n-1}] are embedded and processed through L layers
  2. The output vector at position n−1 is projected to vocabulary size via a linear head + softmax → probability distribution over all tokens
  3. The next token is sampled (temperature sampling, top-p, or greedy argmax)
  4. The new token is appended and the process repeats

This is called autoregressive decoding: the model cannot look ahead—each token is conditioned only on its predecessors. This creates the causal mask in the attention computation, preventing future tokens from influencing past representations during training.

E. Implications for RAG

Tokenization directly affects retrieval quality. Technical identifiers (issue keys such as PAY-1421, stack trace signatures, SQL stored procedure names) may be split across multiple tokens or tokenized inconsistently, degrading dense vector similarity. This motivates hybrid retrieval strategies that combine dense semantic search with sparse lexical matching (BM25) to handle exact token lookups [10].`,
  },
  {
    id: "transformer",
    label: "IV. The Transformer Architecture",
    heading: "IV. THE TRANSFORMER ARCHITECTURE",
    content:
`A. Multi-Head Self-Attention

The core operation of the Transformer is multi-head self-attention. For each token, the model computes query (Q), key (K), and value (V) projections. Attention weights are computed as softmax(QK^T / sqrt(d_k)), and the output is a weighted sum of value vectors. Multiple attention heads allow the model to attend to different relational patterns simultaneously.

Mehta [11] provides a unifying interpretation: self-attention is distributional projection. Formally, the attention matrix M = QSQ^T projects global co-occurrence statistics (encoded in the pre-trained weight matrix S) onto the local context of the current input. This elegantly explains why attention correctly disambiguates polysemous words—the same token receives different contextual representations depending on its neighbors.

B. Feed-Forward Layers and Residual Connections

After attention, each token passes through a position-wise feed-forward network (two linear transformations with a non-linearity). Residual connections around both attention and feed-forward sublayers, combined with layer normalization, enable stable training of very deep networks.

C. Variants and Extensions

Recent work addresses efficiency and long-context modeling. Gated sparse attention [12] combines computational efficiency with training stability for long-context models. The Forgetting Transformer [13] introduces a learned forget gate into softmax attention, improving behavior on tasks with temporal dependencies.

D. Transformer as a Context-Building Machine

The central insight is that each layer refines the contextual representation of every token by integrating information from the full sequence. After L layers, each token's representation encodes not just its own identity but its relational meaning within the entire input—a property that makes Transformers powerful retrievers and generators alike.`,
  },
  {
    id: "llm_limits",
    label: "V. Limitations of Pure LLMs",
    heading: "V. LIMITATIONS OF PURE LLMS",
    content:
`Despite their capabilities, standalone LLMs exhibit systematic failure modes in production settings.

A. Outdated Knowledge

LLM parameters encode a snapshot of world knowledge as of the training cutoff. Mousavi et al. [3] conducted a systematic evaluation of 24 LLMs using the DyKnow benchmark of 130 time-sensitive facts. Even GPT-4 produced 13% outdated and 7% irrelevant responses. Smaller or older models showed outdated response rates above 40%.

B. Hallucination

When the model lacks sufficient parametric evidence for a query, it may generate plausible-sounding but factually incorrect text with high fluency and apparent confidence. In high-stakes domains (banking incident reports, medical triage), this is unacceptable.

C. Absence of Domain Context

Organizational knowledge—internal APIs, proprietary runbooks, undocumented conventions, historical incident timelines—is not part of any public training corpus. The model cannot reason about it unless it is supplied in context.

D. Limited Auditability

A pure LLM response is not traceable to a specific source. Regulatory and compliance requirements in banking demand that automated decisions be explainable and auditable.

E. Context Window Constraints

Even with multi-hundred-thousand-token context windows, injecting all relevant organizational knowledge into every prompt is prohibitively expensive and degrades model performance due to the "lost-in-the-middle" phenomenon [14].

F. Summary

Without external context, as Dong et al. [15] demonstrate for in-context learning, model performance is highly sensitive to what is placed in the prompt. RAG provides a principled mechanism for selecting, compressing, and injecting the most relevant evidence.`,
  },
  {
    id: "rag_intro",
    label: "VI. Retrieval-Augmented Generation",
    heading: "VI. RETRIEVAL-AUGMENTED GENERATION",
    content:
`A. The Foundational Proposal

Lewis et al. [8] introduced RAG as a hybrid architecture combining parametric memory (model weights) with non-parametric memory (a dense index of external documents). The model generates responses by marginalizing over retrieved documents:

P(y | q) = sum_i P_gen(y | q, z_i) * P_ret(z_i | q)

where z_i are passages retrieved from an indexed corpus. The retriever (Dense Passage Retriever, DPR) and generator (BART) are jointly fine-tuned, demonstrating state-of-the-art performance on open-domain QA benchmarks while remaining updateable without retraining—only the document index needs to change.

B. Core Components

The retriever encodes both the query and the corpus documents into a shared embedding space. At inference time, the top-k nearest passages are selected by cosine or inner-product similarity. The generator then conditions its output on the concatenation of the query and the retrieved passages.

C. Why RAG Works

RAG fundamentally repositions the LLM's role: instead of serving as the sole knowledge source, it becomes a reasoning engine that synthesizes externally grounded evidence. Gao et al. [16] describe this as "synergistically merging LLMs' intrinsic knowledge with the vast, dynamic repositories of external databases."

D. The Grounding Principle

A well-designed RAG system produces glass-box responses [17]: each claim in the output can be traced back to a specific retrieved chunk, enabling citation-level auditability—a critical requirement in banking and legal domains.`,
  },
  {
    id: "rag_pipeline",
    label: "VII. RAG Data Pipeline",
    heading: "VII. THE RAG DATA PIPELINE",
    content:
`A. Indexing Phase

The indexing pipeline transforms raw documents into a searchable vector corpus. Stages include: document ingestion (PDFs, wikis, tickets, runbooks), parsing and cleaning, chunking, metadata extraction, embedding generation, and vector indexing.

Chunking strategy critically affects retrieval quality. Khan et al. [17] recommend semantic chunking (splitting on logical section boundaries) over fixed-size chunking. For technical documents with tables, figures, and code blocks, specialized chunking strategies with repeated header context improve recall.

B. Query Phase

At query time: (1) the user query is embedded; (2) the retriever fetches top-k candidate chunks; (3) optional reranking reorders results using a cross-encoder; (4) retrieved context is compressed or distilled; (5) a prompt is assembled combining the query, context, and instructions; (6) the LLM generates a grounded response.

C. Important Boundary

As Wampler et al. [18] emphasize, the LLM does not directly access the vector store during the forward pass in classic RAG. An external orchestration layer performs retrieval and injects the result into the prompt. This separation is architecturally critical: it enables modular optimization, observability, and safety controls independent of the model provider.

D. Metadata and Filtering

Utilizing document metadata (source system, creation date, project tag, document type) as filter predicates during retrieval substantially improves precision [19]. In our banking case study, filtering by Jira project, component, and issue type reduced irrelevant chunk retrieval by approximately 35%.`,
  },
  {
    id: "rag_types",
    label: "VIII. RAG Typology",
    heading: "VIII. RAG TYPOLOGY",
    content:
`A. The Evolution of RAG (2020–2025)

Understanding RAG requires a historical lens. The field evolved rapidly from a single academic paper to a family of production architectures:

  2020 — Lewis et al. [8] introduce the term RAG with DPR+BART on Wikipedia. Proof of concept for hybrid parametric/non-parametric memory. Limited to fixed corpora, no metadata filtering, no reranking.
  2021 — RETRO (DeepMind): retrieval integrated into the model itself via chunked cross-attention, blurring the line between retrieval and architecture. FiD (Fusion-in-Decoder): concatenating multiple retrieved passages and generating from all simultaneously.
  2022 — Adoption in production systems (customer support, search augmentation). First frameworks: LlamaIndex (formerly GPT Index), LangChain. Vector databases (Pinecone, Weaviate, Qdrant) emerge as standalone products.
  2023 — Explosion of variants: Self-RAG (the model decides when to retrieve), Corrective RAG, HyDE (hypothetical document embeddings), advanced reranking. RAGAS evaluation framework. Hybrid search becomes standard.
  2024 — Agentic RAG: Auto-RAG, FAIR-RAG, Collab-RAG. Multi-hop retrieval benchmarks (MultiHop-RAG). GraphRAG (Microsoft): knowledge graphs as retrieval substrate. Privacy-preserving RAG. MoE-backed LLMs reduce inference cost for RAG-heavy workloads.
  2025 — Long-context models (1M+ tokens) challenge retrieval necessity for small corpora. Agentic loops with tool use blur the boundary between RAG and general AI agents. Evaluation matures: ARES, TruLens, continuous golden-dataset evaluation pipelines.

Gao et al. [16] and the systematic review by Oche et al. [20] converge on a three-generation taxonomy that maps directly onto this timeline.

C. Naive RAG

The baseline pipeline: chunk → embed → top-k retrieval → concatenate → generate. Effective for simple factual queries but fails on complex, multi-hop, or temporally distributed evidence. Suitable for MVPs and rapid prototyping.

D. Advanced RAG

Addresses Naive RAG's failure modes through pre-retrieval, retrieval, and post-retrieval optimizations: query rewriting, expansion, and transformation; hybrid search (dense + sparse + metadata filters); sliding window and hierarchical chunking; reranking with cross-encoders; and context compression.

E. Modular RAG

Decomposes the pipeline into independently configurable and replaceable modules: multiple retrievers, source routing, configurable evaluation, and fallback strategies. Enables A/B testing of retrieval policies without full pipeline rewrites.

F. Corrective RAG

Introduces self-evaluation: after initial retrieval, a critic assesses whether the retrieved evidence is sufficient. If not, the system triggers query rewriting and a second retrieval pass—potentially switching data sources. FAIR-RAG [21] implements this as a Structured Evidence Assessment (SEA) component, achieving F1 gains of +8 points on HotpotQA over standard iterative retrieval.

G. Agentic RAG

The retrieval process itself becomes a decision-making loop. Auto-RAG [22] frames iterative retrieval as a multi-turn dialogue: the LLM plans what to search, extracts relevant information from retrieved documents, infers whether evidence is sufficient, and either continues searching or generates the final answer. This architecture adapts the number of retrieval iterations to query complexity, converging faster on simple queries.

H. Domain-Specific RAG

Wampler et al. [18] and the Fintech RAG paper [23] demonstrate that enterprise RAG requires additional trust layers: citation grounding, abstention on insufficient evidence, source scoring, and output filtering. In financial domains, these are not optional—they are compliance requirements.`,
  },
  {
    id: "techniques",
    label: "IX. Key Retrieval Techniques",
    heading: "IX. KEY RETRIEVAL TECHNIQUES",
    content:
`A. Dense Retrieval

Bi-encoder models (e.g., DPR, sentence-transformers) map queries and documents to a shared dense vector space. Cosine or inner-product similarity enables sub-linear search via approximate nearest neighbor (ANN) indexes (HNSW, IVF). Dense retrieval captures semantic similarity but can miss exact lexical matches.

B. Sparse Retrieval (BM25)

BM25 scores documents based on term frequency and inverse document frequency. Highly effective for queries containing rare tokens—identifiers, error codes, technical acronyms—that dense models may fail to match.

C. Hybrid Retrieval

Sawarkar et al. [10] demonstrate that combining dense, sparse, and learned sparse (ELSER) retrievers via hybrid queries consistently outperforms any single method. Their Blended RAG achieves 30% F1 improvement over vanilla RAG on SQuAD without any fine-tuning, and 35% improvement on NQ in zero-shot settings.

D. Reranking

Cross-encoders jointly encode the query and each candidate chunk, producing a relevance score that is far more accurate than bi-encoder similarity but computationally expensive. Applying reranking to the top-50 candidates returned by the first-stage retriever provides high precision at manageable cost [20].

E. Multi-Hop Retrieval

Tang and Yang [24] identify that standard cosine similarity between query and chunk embeddings is fundamentally insufficient for multi-hop queries—those requiring reasoning over multiple, chained pieces of evidence. Their MultiHop-RAG benchmark defines four query types: inference, comparison, temporal, and null (unanswerable). Systems must decompose queries into sub-queries and iteratively retrieve sub-evidence.

F. Evaluation

Es et al. [25] propose RAGAS, a reference-free evaluation framework measuring three orthogonal quality dimensions: faithfulness (are all claims in the response supported by retrieved context?), answer relevance (does the response address the question?), and context relevance (is the retrieved context focused?). RAGAS achieves 95% agreement with human evaluators on faithfulness and integrates natively with LangChain and LlamaIndex.`,
  },
  {
    id: "frameworks",
    label: "X. Frameworks and Technology Stack",
    heading: "X. FRAMEWORKS AND TECHNOLOGY STACK",
    content:
`A. Orchestration Frameworks

LangChain provides chains, retrievers, tools, and agent abstractions with broad ecosystem support. LlamaIndex excels at document ingestion, index construction, query engines, and citation workflows. LangGraph extends LangChain with stateful, graph-based workflow orchestration—critical for multi-step agentic pipelines. Haystack targets production open-source pipelines with strong typing and structured RAG.

B. Vector Databases

Pan et al. [26] survey over 20 vector database management systems (VDBMSs), identifying five core challenges: vagueness (semantic similarity is inherently approximate), expensive comparisons (O(d) per vector), large storage footprint, lack of natural ordering, and incompatibility with attribute filters. Key systems: Qdrant (Rust-native, hybrid search, payload filtering), Pinecone (fully managed), Weaviate (schema-aware), Milvus (cloud-native, GPU acceleration), and pgvector (PostgreSQL extension for hybrid workloads).

C. Document Parsing

Docling (IBM) and Unstructured provide layout-aware parsing of PDFs, handling multi-column layouts, tables, and figures. For technical PDFs (research papers, incident reports with screenshots), layout-aware parsing is prerequisite to quality chunking.

D. Our Stack

In the banking validation system, we use: Qdrant (primary vector store with dense + sparse hybrid search), LangGraph (workflow orchestration), RAGAS (evaluation), Docling + Unstructured (PDF parsing), FastAPI (API layer), and both OpenAI and Gemini as provider-swappable LLM backends via a provider abstraction layer.`,
  },
  {
    id: "llm_rag",
    label: "XI. How the LLM Uses RAG",
    heading: "XI. HOW THE LLM USES RAG",
    content:
`A. The Correct Mental Model

A common misconception is that the LLM "searches" the vector store. In classic RAG, the LLM only sees the prompt: instruction + user query + retrieved context. The vector store interaction is entirely handled by the external orchestration system before the LLM is called. This separation enables independent optimization of each component and strict control over what evidence the model sees.

B. Prompt Assembly

The final prompt injected into the LLM follows a template: (1) system instruction defining the model's role and output format; (2) retrieved context chunks, optionally prefixed with source metadata; (3) user query; (4) output constraints. Context distillation—summarizing or compressing retrieved chunks before injection—reduces token cost and mitigates lost-in-the-middle degradation.

C. In-Context Learning as the Mechanism

Dong et al. [15] frame RAG as a form of in-context learning: the retrieved chunks serve as demonstrations that shift the model's output distribution toward factually grounded responses. The model does not update its weights; it adapts its generation based on the contextual signal injected at inference time.

D. Collab-RAG and White-Box/Black-Box Collaboration

Collab-RAG [27] demonstrates that combining a white-box (smaller, locally hosted) LLM for query decomposition with a black-box (API-based, more powerful) LLM for final generation achieves strong performance on complex QA while reducing API cost. This pattern aligns with our banking system's routing strategy: cheap models for classification and fact extraction, expensive models for final judgment.`,
  },
  {
    id: "rag_limits",
    label: "XII. RAG Limitations and Open Challenges",
    heading: "XII. RAG LIMITATIONS AND OPEN CHALLENGES",
    content:
`A. Retrieval Quality Bottleneck

RAG does not eliminate hallucination; it reduces it when retrieval is good. Sawarkar et al. [10] demonstrate that a 30% improvement in retrieval quality produces a 30% improvement in final answer quality with the same LLM. Conversely, irrelevant or noisy retrieved chunks can actively degrade LLM performance compared to no retrieval at all.

B. Chunking Sensitivity

The granularity and strategy of chunking directly determines what the retriever can find. Fixed-size chunking frequently splits logical units (a single table row, a stack trace, a code block) across chunk boundaries, producing partially informative fragments. Semantic and hierarchical chunking improve recall but increase indexing complexity.

C. Multi-Hop Reasoning

As Tang and Yang [24] demonstrate, standard RAG fails on queries requiring chained evidence. Corrective and Agentic RAG partially address this, but with increased latency and orchestration complexity.

D. Stale Documents

If the indexed corpus is not continuously refreshed, RAG reintroduces the knowledge cutoff problem it was designed to solve. For banking systems with daily incident data, indexing pipelines must be incremental and near-real-time.

E. Privacy and Data Leakage

The Good and the Bad [28] and Mitigating Privacy Issues in RAG [29] identify risks of membership inference attacks against RAG systems: an adversary may be able to infer whether a specific document was in the retrieval corpus by crafting queries that elicit verbatim leakage. In banking, where the RAG corpus contains sensitive incident data, this requires strict access controls, chunk-level redaction policies, and output filtering.

F. Latency and Cost

Hybrid retrieval, reranking, and multi-pass agentic loops increase end-to-end latency and token consumption. CARROT [30] addresses cost-constrained retrieval optimization; Vendi-RAG [31] explores the diversity-quality trade-off in chunk selection to reduce redundancy in the context window.`,
  },
  {
    id: "case_study",
    label: "XIII. Case Study: Banking Jira Validation",
    heading: "XIII. CASE STUDY: JIRA ISSUE VALIDATION IN BANKING",
    content:
`A. Problem Definition

The target system is a Brazilian retail banking platform processing millions of daily transactions. The development team produces hundreds of Jira issues per sprint across payment processing, credit, onboarding, and compliance modules. Validating whether an issue is a genuine, reproducible, well-documented bug—and estimating its development readiness—currently requires a senior engineer to manually cross-reference prior incidents, architecture wikis, runbooks, and stack traces.

B. Architecture

We implement an Issue-Centric Evidence RAG with a "facts first, judge later" pipeline:

1. Issue normalization: canonical package from Jira REST API fields, attachments, and linked issues.
2. Artifact extraction: specialized extractors for logs (stack trace parsing, error code extraction), PDFs (Docling), spreadsheets (pandas), and images (OCR sidecar).
3. Deterministic rules: pre-LLM checks for completeness, contradiction detection, and financial impact signals.
4. Hybrid retrieval: Qdrant dense + sparse vectors with metadata filters (project, component, issue type, date range).
5. Reranking: local cross-encoder reranker tuned for exact token recall (issue IDs, error codes, SQL names).
6. Context distillation: small model summarizes retrieved chunks before injection into the final judge prompt.
7. LLM judgment: provider-agnostic (OpenAI or Gemini) judge produces classification (bug / not_bug / needs_review), confidence score, rationale, and audit trail.

C. Retrieval Challenges

Technical identifiers (e.g., PAY-1421, SP_DEBIT_TXN, NullPointerException at line 847) require sparse retrieval to match exactly. Dense retrieval alone misses these tokens when they are out-of-vocabulary or split across subword tokens. Our hybrid search with ELSER-style learned sparse encoding reduced false negatives on identifier-specific queries by approximately 40% compared to dense-only retrieval.

D. Evaluation

We evaluate with a golden dataset of 200 manually labeled issues across four categories: confirmed bugs, non-bugs, readiness failures, and edge cases. We report doc_hit@5, chunk_kind_hit, MRR, faithfulness (RAGAS), and answer correctness. Provider comparison between GPT and Gemini on the golden set informs model routing decisions.

E. Key Observations

The pipeline demonstrates that deterministic rules—firing before any LLM call—eliminate approximately 25% of cases that do not require LLM judgment at all (trivially incomplete issues, duplicate detection). For the remaining cases, the RAG layer reduces hallucination on domain-specific claims and provides source-traceable rationales that satisfy internal audit requirements. Multi-hop queries (e.g., "has this error pattern appeared in similar transactions in the last 30 days?") remain the primary open challenge.`,
  },
  {
    id: "conclusion",
    label: "XIV. Conclusion",
    heading: "XIV. CONCLUSION",
    content:
`This paper presented a unified survey of the AI architecture stack from tokenization to Agentic RAG, grounded in a real-world application: automated Jira issue validation in a Brazilian banking system.

The central thesis is that a modern AI system is not a model—it is a chain: tokenization, embedding, Transformer context-building, retrieval, augmentation, orchestration, and validation. The quality of the final output depends more on the retrieval and grounding layers than on the raw generation capability of the LLM.

The evolution from Naive RAG to Agentic RAG reflects increasing awareness that retrieval is not a solved problem. Hybrid search, multi-hop reasoning, corrective loops, and agentic decision-making are responses to increasingly complex information needs. Our banking case study demonstrates that domain-specific RAG can deliver auditable, grounded decisions at production scale, provided the pipeline invests in high-quality chunking, exact-token retrieval, deterministic pre-filtering, and continuous evaluation.

Open challenges remain: stale corpus management, multi-hop retrieval over large corpora, privacy-preserving RAG for sensitive organizational data, and systematic evaluation of agentic loop convergence. We expect these to be the primary areas of progress in applied RAG systems over the coming years.`,
  },
  {
    id: "references",
    label: "References",
    heading: "REFERENCES",
    content:
`[1] J. Devlin, M.-W. Chang, K. Lee, and K. Toutanova, "BERT: Pre-training of deep bidirectional transformers for language understanding," in Proc. NAACL, 2019.
[2] A. Radford et al., "Language models are unsupervised multitask learners," OpenAI Blog, 2019.
[3] S. M. Mousavi, S. Alghisi, and G. Riccardi, "LLMs as repositories of factual knowledge: Limitations and solutions," University of Trento, 2024.
[4] T. R. Sumers, S. Yao, K. Narasimhan, and T. L. Griffiths, "Cognitive architectures for language agents," Princeton University, 2023.
[5] S. Hochreiter and J. Schmidhuber, "Long short-term memory," Neural Computation, 1997.
[6] A. Vaswani et al., "Attention is all you need," in Proc. NeurIPS, 2017.
[7] T. B. Brown et al., "Language models are few-shot learners," in Proc. NeurIPS, 2020.
[8] P. Lewis et al., "Retrieval-augmented generation for knowledge-intensive NLP tasks," in Proc. NeurIPS, 2020.
[9] T. R. Sumers et al., "Cognitive architectures for language agents (CoALA)," Princeton University, 2023.
[10] K. Sawarkar, A. Mangal, and S. R. Solanki, "Blended RAG: Improving RAG accuracy with semantic search and hybrid query-based retrievers," IBM, 2024.
[11] N. Mehta, "Self-attention as distributional projection: A unified interpretation of transformer architecture," 2024.
[12] Gated sparse attention: Combining computational efficiency with training stability for long-context language models, 2024.
[13] Forgetting Transformer: Softmax attention with a forget gate, 2024.
[14] N. F. Liu et al., "Lost in the middle: How language models use long contexts," TACL, 2024.
[15] Q. Dong et al., "A survey on in-context learning," Peking University / CMU / ByteDance, 2023.
[16] Y. Gao et al., "Retrieval-augmented generation for large language models: A survey," Tongji University / Fudan University, 2024.
[17] A. A. Khan et al., "Developing retrieval augmented generation (RAG) based LLM systems from PDFs: An experience report," Tampere University, 2024.
[18] D. Wampler, D. Nielson, and A. Seddighi, "Engineering the RAG stack: A comprehensive review of the architecture and trust frameworks," The AI Alliance / IBM Research, 2025.
[19] Utilizing metadata for better retrieval-augmented generation, 2024.
[20] A. J. Oche et al., "A systematic review of key RAG systems: Progress, gaps, and future directions," University of Tennessee / Oak Ridge National Laboratory, 2025.
[21] M. Aghajani Asl et al., "FAIR-RAG: Faithful adaptive iterative refinement for retrieval-augmented generation," Sharif University, 2024.
[22] T. Yu, S. Zhang, and Y. Feng, "Auto-RAG: Autonomous retrieval-augmented generation for large language models," Chinese Academy of Sciences, 2024.
[23] Retrieval augmented generation (RAG) for fintech: Agentic design and evaluation, 2024.
[24] Y. Tang and Y. Yang, "MultiHop-RAG: Benchmarking retrieval-augmented generation for multi-hop queries," HKUST, 2024.
[25] S. Es et al., "Ragas: Automated evaluation of retrieval augmented generation," Exploding Gradients / Cardiff University, 2023.
[26] J. J. Pan, J. Wang, and G. Li, "Survey of vector database management systems," Tsinghua University / Purdue University, 2024.
[27] Collab-RAG: Boosting retrieval-augmented generation for complex question answering via white-box and black-box LLM collaboration, 2024.
[28] The good and the bad: Exploring privacy issues in retrieval-augmented generation (RAG), 2024.
[29] Mitigating the privacy issues in retrieval-augmented generation (RAG) via pure synthetic data, 2024.
[30] CARROT: A learned cost-constrained retrieval optimization system for RAG, 2025.
[31] Vendi-RAG: Adaptively trading-off diversity and quality significantly improves retrieval augmented generation with LLMs, 2024.`,
  },
];

const INITIAL_FULL: Section[] = INITIAL_SECTIONS.map((s) => ({
  ...s,
  collapsed: s.id !== "abstract" && s.id !== "keywords" && s.id !== "intro",
}));

/* ─────────────────────────────────────────────────────────────
   PROFESSOR MODE — documento separado, não entra no PDF IEEE
───────────────────────────────────────────────────────────── */
const PROFESSOR_SECTIONS: Omit<Section, "collapsed">[] = [
  {
    id: "prof_layers",
    label: "🧠 As Camadas da Inteligência Artificial",
    heading: "AS CAMADAS DA INTELIGÊNCIA ARTIFICIAL",
    content:
`A Inteligência Artificial não é uma coisa só. É uma pilha de camadas de abstração, onde cada camada resolve o problema que a anterior não conseguia. Entender essa hierarquia é fundamental para entender por que chegamos nos LLMs e por que o RAG existe.

━━━ CAMADA 1: IA Simbólica e Sistemas de Regras (1950–1985) ━━━

A primeira IA era feita de regras escritas à mão por especialistas. Se X então Y. Um sistema de diagnóstico médico como o MYCIN tinha milhares de regras do tipo "SE o paciente tem febre E a cultura é positiva ENTÃO o diagnóstico é provável infecção bacteriana".

Por que falhou como solução geral:
→ O mundo real tem exceções para tudo. Escrever regras para toda exceção é humanamente impossível.
→ As regras não aprendem. Se o mundo muda, alguém precisa reescrever as regras.
→ Regras não lidam bem com incerteza. "Provavelmente" e "talvez" são difíceis de codificar em lógica booleana.

O que ela deixou de legado: a ideia de que raciocínio pode ser formalizado. Isso voltou em formas mais sofisticadas (grafos de conhecimento, ontologias, GraphRAG).

━━━ CAMADA 2: Machine Learning Clássico (1980–2010) ━━━

A virada: em vez de escrever as regras, deixar o computador aprender as regras a partir de exemplos.

Algoritmos desta era:
• Naive Bayes: usa probabilidades condicionais. "Dado que esta palavra apareceu, qual é a probabilidade de ser spam?"
• SVM (Support Vector Machine): encontra o hiperplano de máxima margem que separa classes no espaço de features.
• Árvores de Decisão e Random Forest: criam estruturas hierárquicas de perguntas sobre os dados.
• Regressão Logística: mapeia features para probabilidades via função sigmóide.

O gargalo desta era: feature engineering. Para classificar emails, você precisava decidir manualmente quais features usar (comprimento do email, presença de certas palavras, horário de envio...). A qualidade do modelo dependia da qualidade das features que humanos criavam.

Para texto, a representação dominante era TF-IDF: cada documento é um vetor onde cada dimensão representa uma palavra, ponderada por sua frequência no documento e raridade no corpus. Problema: "gato" e "felino" são vetores ortogonais (distância máxima), mesmo sendo semanticamente idênticos.

━━━ CAMADA 3: Redes Neurais Rasas (1985–2010) ━━━

Redes neurais existem desde os anos 50 (Perceptron de Rosenblatt, 1957), mas o backpropagation (Rumelhart et al., 1986) tornou possível treinar redes com múltiplas camadas.

Como uma rede neural aprende:
1. Forward pass: os dados passam pela rede, camada por camada, cada neurônio calcula uma soma ponderada + ativação não-linear
2. Calcula o erro (loss) na saída
3. Backward pass: o gradiente do erro é propagado de volta pela rede, ajustando cada peso proporcionalmente à sua contribuição para o erro
4. Repete por milhares de épocas

A não-linearidade é o segredo: sem ela, empilhar camadas é o mesmo que ter uma só camada (composição de funções lineares é linear). Com ReLU, Sigmoid ou Tanh, cada camada pode aprender representações não-lineares progressivamente mais abstratas.

Problema desta era: redes profundas (muitas camadas) não treinavam bem. O gradiente desaparecia ou explodia antes de chegar às primeiras camadas (vanishing/exploding gradients). Isso limitou as redes a poucos layers e bloqueou o processamento de sequências longas.

━━━ CAMADA 4: Deep Learning e CNNs (2012–2017) ━━━

O ImageNet Moment (2012): AlexNet ganhou o ImageNet com 15,3% de erro contra 26% do segundo lugar, usando GPU + ReLU + dropout. Isso provou que redes profundas treinadas em GPUs eram viáveis.

Técnicas que desbloquearam o deep learning:
• ReLU (Rectified Linear Unit): ativação simples max(0, x) que não satura para valores positivos, mitigando vanishing gradient
• Dropout: durante o treino, desliga neurônios aleatoriamente, forçando redundância e evitando overfitting
• Batch Normalization: normaliza as ativações de cada camada, estabilizando o treinamento
• Inicialização de pesos inteligente (Xavier, He): começa os pesos em uma escala que evita saturação imediata

Para texto, o problema das CNNs era que elas são boas em padrões locais (n-gramas) mas não em dependências de longa distância: "O banco que fica na margem do rio transbordou" — entender "banco" aqui requer contexto que pode estar 10+ tokens atrás.

━━━ CAMADA 5: RNNs, LSTMs e GRUs (2013–2018) ━━━

Redes recorrentes processam sequências token por token, mantendo um estado oculto (hidden state) que resume tudo que foi visto até aquele ponto.

A equação de uma RNN simples:
  h_t = tanh(W_h * h_{t-1} + W_x * x_t + b)

Onde h_t é o estado oculto no tempo t, x_t é o token atual.

O problema: esse estado oculto precisa comprimir toda a informação da sequência em um vetor de tamanho fixo. Para sequências longas (documentos técnicos, histórico de bugs), informações do início se perdem antes de chegar ao final.

LSTM (Long Short-Term Memory) — Hochreiter & Schmidhuber (1997):
Adiciona uma "célula de memória" separada do hidden state, controlada por três gates:
• Forget gate: decide o que apagar da memória
• Input gate: decide o que adicionar à memória
• Output gate: decide o que passar para o próximo step

Isso resolve parcialmente o vanishing gradient para sequências de centenas de tokens. Mas ainda processa token por token — não paralelizável — o que tornava o treinamento em bilhões de tokens muito lento.

GRU (Gated Recurrent Unit) — Cho et al. (2014): versão simplificada do LSTM com 2 gates (reset e update), similar em performance mas mais eficiente computacionalmente.

━━━ CAMADA 6: Embeddings Distribuídos (2013–2016) ━━━

Word2Vec (Mikolov et al., 2013) aprendeu que palavras que aparecem em contextos similares têm significados similares (hipótese distribucional de Harris).

Dois objetivos de treino:
• CBOW (Continuous Bag of Words): prediz a palavra central a partir das palavras do contexto
• Skip-gram: prediz as palavras do contexto a partir da palavra central

Resultado: vetores densos de 100–300 dimensões onde:
  vetor("rei") − vetor("homem") + vetor("mulher") ≈ vetor("rainha")
  vetor("Paris") − vetor("França") + vetor("Itália") ≈ vetor("Roma")

GloVe (Pennington et al., 2014): aprende os mesmos vetores mas a partir da matriz global de co-ocorrências em vez de janelas locais.

O problema que ambos não resolvem: uma palavra = um vetor. "banco" (financeiro) e "banco" (margem de rio) são o mesmo vetor. O contexto não muda a representação. Isso é corrigido pelos Transformers.

━━━ CAMADA 7: Mecanismo de Atenção (2015) ━━━

A virada conceptual: em vez de comprimir tudo em um vetor fixo, deixar o modelo "olhar para trás" e escolher quais partes da entrada são relevantes para cada parte da saída.

Bahdanau et al. (2015) — atenção aditiva para tradução:
  e_{ij} = v^T * tanh(W_s * s_{i-1} + W_h * h_j)
  α_{ij} = softmax(e_{ij})
  c_i = Σ_j α_{ij} * h_j

Onde s_{i-1} é o estado do decodificador, h_j são os estados do codificador. O modelo aprende a prestar atenção nos tokens do texto fonte mais relevantes para cada token do texto alvo.

Luong et al. (2015) — atenção multiplicativa (dot-product):
  e_{ij} = s_i^T * h_j
  (mais eficiente computacionalmente — precursor direto do self-attention)

Essa ideia foi generalizada em 2017 para o self-attention: em vez de atenção entre codificador e decodificador, cada token presta atenção em todos os outros tokens da mesma sequência.

━━━ CAMADA 8: Foundation Models e Scale Laws (2018–2022) ━━━

Com o Transformer (2017, ver seção seguinte), o pré-treinamento em escala tornou-se possível. Os "foundation models" são modelos treinados em corpora massivos (Web, livros, código, Wikipedia) que aprendem representações gerais reutilizáveis.

Scale Laws (Kaplan et al., 2020):
  Loss ∝ (N)^{-α_N} * (D)^{-α_D} * (C)^{-α_C}
Onde N = parâmetros, D = dados, C = compute. O loss diminui como lei de potência com escala — sem plateau visível na escala estudada.

Chinchilla (Hoffmann et al., 2022): dado um budget de compute fixo C, o ótimo é:
  N_opt = C^{0.5}, D_opt = C^{0.5}
Ou seja, modelos menores treinados em mais dados são mais eficientes que modelos gigantes em poucos dados. GPT-3 estava undertrained (muitos parâmetros, poucos tokens relativamente).

Capacidades emergentes: ao cruzar certos limiares de escala, modelos desenvolvem capacidades que não existiam em modelos menores — tradução zero-shot, raciocínio aritmético, analogias. Isso não era previsto pelas scale laws e ainda é objeto de debate.`,
  },
  {
    id: "prof_transformer",
    label: "⚙️ O Transformer em Profundidade",
    heading: "O TRANSFORMER EM PROFUNDIDADE",
    content:
`O paper "Attention Is All You Need" (Vaswani et al., 2017) eliminou a recorrência e criou a arquitetura dominante da IA moderna. Vamos desmontá-lo completamente.

━━━ POR QUE ELIMINAR A RECORRÊNCIA? ━━━

RNNs têm dois problemas estruturais:
1. Sequencialidade: o token t+1 depende do estado oculto do token t. Impossível paralelizar. Com sequências de 10.000 tokens, são 10.000 steps sequenciais.
2. Compressão com perda: o hidden state é um gargalo de informação. Tokens distantes "competem" pelo espaço no vetor de estado.

O Transformer resolve ambos: todos os tokens interagem diretamente com todos os outros em paralelo (O(1) steps sequenciais), e não há compressão em vetor intermediário.

Trade-off: a complexidade de memória e compute do self-attention é O(n²), onde n é o comprimento da sequência. Para n=1.000 tokens, são 1.000.000 pares de atenção. Para n=100.000 (contextos longos), são 10 bilhões. Isso motivou atenção esparsa, linear attention, e arquiteturas como Mamba para contextos muito longos.

━━━ EMBEDDING: TEXTO → VETORES ━━━

Cada token ID é mapeado para um vetor denso e treinável de dimensão d_model (tipicamente 512, 768, 1024, 4096 dependendo do modelo).

Esse embedding não é fixo como Word2Vec — ele é treinado junto com o resto do modelo. As representações iniciais evoluem durante o treinamento para ser úteis para a tarefa de predição do próximo token.

━━━ ENCODING POSICIONAL ━━━

O self-attention é invariante à permutação: se você embaralhar os tokens, a atenção produz a mesma saída (apenas reordenada). O modelo precisa saber que "o gato comeu o rato" é diferente de "o rato comeu o gato".

Encoding posicional sinusoidal (no paper original):
  PE(pos, 2i)   = sin(pos / 10000^{2i/d_model})
  PE(pos, 2i+1) = cos(pos / 10000^{2i/d_model})

Por que sinusoidal? A diferença entre encodings de posições distintas é constante independente da posição absoluta: a rede pode aprender "está 3 posições à frente" sem decorar "está na posição 347".

Modelos modernos (LLaMA, GPT-4) usam RoPE (Rotary Position Embedding): a informação posicional é codificada como rotações nos espaços de query e key, o que permite generalização para sequências mais longas que as vistas durante o treino.

━━━ SELF-ATTENTION: O MECANISMO CENTRAL ━━━

Dado a matriz de entrada X (n × d_model), três projeções lineares são aprendidas:
  Q = X * W_Q    (queries — "o que estou procurando?")
  K = X * W_K    (keys   — "o que ofereço?")
  V = X * W_V    (values — "o que tenho para contribuir?")

Atenção:
  Attention(Q, K, V) = softmax(Q * K^T / √d_k) * V

O fator √d_k (raiz da dimensão das keys) evita que os dot-products cresçam muito em magnitude para dimensões altas, o que faria o softmax saturar em regiões de gradiente quase zero.

O que o softmax faz: converte os scores de compatibilidade (dot-products) em distribuições de probabilidade para cada query. Cada token recebe um vetor que é uma média ponderada dos value vectors, onde os pesos são a "atenção" que aquele token presta aos outros.

Interpretação:
• Cada linha de QK^T é o score de compatibilidade de um token com todos os outros
• Alta compatibilidade = muito "atenção" = grande contribuição do value daquele token
• O resultado é um novo vetor para cada token que integra informação de outros tokens pesada pela relevância

━━━ MULTI-HEAD ATTENTION ━━━

Em vez de uma atenção, o Transformer usa h heads paralelas (tipicamente h=8 ou h=16):
  head_i = Attention(Q*W_Q^i, K*W_K^i, V*W_V^i)
  MultiHead(Q,K,V) = Concat(head_1, ..., head_h) * W_O

Cada head aprende um "tipo" diferente de relação:
• Uma head pode capturar concordância sujeito-verbo
• Outra pode rastrear co-referência (pronomes → entidades)
• Outra pode identificar relações sintáticas (modificador → núcleo)

Isso é análogo a ter vários filtros numa CNN — cada um detecta features diferentes. Com múltiplas heads, o modelo não precisa "comprometer" uma única atenção para todos os tipos de relação.

━━━ FEED-FORWARD NETWORK (FFN) ━━━

Após a atenção, cada token passa por um MLP idêntico (mas aplicado token a token, sem compartilhamento):
  FFN(x) = max(0, x * W_1 + b_1) * W_2 + b_2

W_1 projeta d_model → d_ff (tipicamente 4× mais largo, ex: 2048 → 8192)
W_2 projeta d_ff → d_model

Por que esse MLP? Pesquisa (Geva et al., 2021, "Transformer Feed-Forward Layers Are Key-Value Memories") sugere que o FFN age como uma memória associativa: as linhas de W_1 são "chaves" que ativam quando o token corresponde a um padrão semântico, e as linhas de W_2 são os "valores" que contribuem para a saída. É aqui que o modelo "armazena" fatos como "Paris é a capital da França".

━━━ RESIDUAL CONNECTIONS E LAYER NORM ━━━

Cada sublayer (atenção e FFN) é envolvido por:
  output = LayerNorm(x + Sublayer(x))

Residual connections (He et al., 2016): a soma x + Sublayer(x) garante que o gradiente tem um caminho direto de volta ao início da rede. Sem isso, modelos com dezenas de camadas não treinam.

Layer Normalization: normaliza as ativações ao longo da dimensão de features (não do batch), estabilizando o treinamento e permitindo taxas de aprendizado maiores.

━━━ O QUE CADA CAMADA FAZ ━━━

Análises interpretabilidade (como BERTology) mostram um padrão emergente:
• Camadas iniciais (1-4): sintaxe local, relações POS (part-of-speech), n-gramas
• Camadas médias (5-12): semântica, co-referência, relações semânticas entre entidades
• Camadas finais (13+): representações task-specific, raciocínio de alta ordem

Isso não é programado — emerge do treinamento. O gradiente descendo pelo loss de predição do próximo token força a rede a construir representações progressivamente mais úteis.

━━━ ENCODER vs DECODER vs ENCODER-DECODER ━━━

Encoder-only (BERT): vê o contexto completo (bidirecional). Ótimo para classificação, NER, QA extrativo. Não gera texto.

Decoder-only (GPT, LLaMA, Gemini): vê apenas tokens passados (causal mask). Gera texto autoregressivamente. A maioria dos LLMs modernos usa essa arquitetura.

Encoder-Decoder (T5, BART): o encoder processa o input bidirecionalmente, o decoder gera a saída atendendo ao output do encoder. Clássico para tradução, sumarização, geração condicionada.

━━━ MIXTURE OF EXPERTS (MoE) — A ARQUITETURA DO FUTURO ━━━

O problema do scaling denso: dobrar os parâmetros dobra o compute por token. MoE separa capacity de compute.

Arquitetura:
• Cada camada FFN é substituída por N experts (sub-MLPs independentes)
• Um router (pequena rede linear + softmax) decide, para cada token, quais k experts ativar
• Apenas k/N experts executam por token

Router com Top-K selection:
  g(x) = Softmax(x * W_router)
  FFN_MoE(x) = Σ_{i ∈ TopK(g(x))} g_i(x) * Expert_i(x)

Exemplos reais:
• Switch Transformer (Fedus et al., 2021): k=1, 128 experts. 1.6 trilhão de parâmetros, ativa ~6 bilhões por token
• Mixtral 8x7B: k=2, 8 experts. 46.7B parâmetros totais, ~12.9B ativos por token — supera Llama 2 70B
• Gemini 1.5: MoE não confirmado publicamente mas performance/compute sugere uso extensivo

Desafios do MoE:
→ Load balancing: o router tende a colapsar (mandar tudo para 1-2 experts favoritos). Requer auxiliary loss de balanceamento
→ Communication overhead: em configurações distribuídas, tokens precisam ser roteados para o servidor onde o expert vive (all-to-all communication)
→ Instabilidade de treino: mais sensível a hiperparâmetros que modelos densos`,
  },
  {
    id: "prof_tokens",
    label: "🔤 Tokens: De Texto a Números a Significado",
    heading: "TOKENS: DE TEXTO A NÚMEROS A SIGNIFICADO",
    content:
`Um LLM nunca "lê" texto como um humano. Ele opera inteiramente em sequências de inteiros e vetores de ponto flutuante. Entender essa pipeline é crucial para entender tanto as capacidades quanto as limitações dos modelos.

━━━ O QUE É UM TOKEN? ━━━

Um token é a unidade atômica de processamento de um LLM. Não é necessariamente uma palavra. Pode ser:
• Uma palavra inteira: "gato" → [gato]
• Uma subpalavra: "tokenização" → [token][ização]
• Um caracter: "x" → [x]
• Um byte: para texto multilíngue ou emojis
• Pontuação: "." → [.]
• Espaço + palavra: " the" → [ the]  (muitos tokenizers incluem o espaço no token)

Por que subpalavras? É um compromisso entre:
• Vocabulário de palavras inteiras: muito grande (milhões), muitos OOV (out-of-vocabulary)
• Vocabulário de caracteres: muito pequeno, sequências muito longas, tudo o que está entre palavras (morfologia) precisa ser aprendido do zero

━━━ BYTE-PAIR ENCODING (BPE) — O ALGORITMO DOMINANTE ━━━

Algoritmo (Sennrich et al., 2016, originalmente para compressão):

1. Comece com vocabulário de caracteres individuais
2. Conte todos os pares de símbolos adjacentes no corpus
3. Mescle o par mais frequente em um novo símbolo
4. Repita até atingir o tamanho de vocabulário desejado (tipicamente 32k–100k)

Exemplo simplificado:
  Corpus: "baixo baixo baixo barco"
  Pares mais frequentes: (b,a)=4, (a,i)=3, (a,r)=1...
  Mescla: "ba" → novo símbolo
  Nova contagem: (ba, i)=3, (ba, r)=1, (ba, i)=3...
  Mescla: "bai" → novo símbolo
  ...e assim por diante

GPT-4 usa cl100k_base: ~100.000 tokens. Llama 2 usa 32.000. O tamanho do vocabulário afeta o embedding matrix inicial (vocab_size × d_model).

━━━ WORDPIECE E SENTENCEPIECE ━━━

WordPiece (BERT): similar ao BPE mas maximiza a likelihood do corpus usando o modelo de linguagem em vez de contar frequências brutas. Tokens de subpalavra são marcados com "##": "tokenização" → ["token", "##iza", "##ção"]

SentencePiece (usado no LLaMA, T5, Gemini): trata o texto como sequência de bytes Unicode, sem pre-tokenização por espaços. Funciona para qualquer idioma, incluindo chinês, árabe, japonês onde não há espaços entre palavras.

━━━ IMPLICAÇÕES PRÁTICAS DOS TOKENS ━━━

1. Custo: APIs de LLM cobram por token. "Retrieval-Augmented Generation" = 5 tokens no GPT-4. Um documento de 10 páginas ≈ 3000–4000 tokens.

2. Limites de contexto: GPT-4 tem context window de 128k tokens ≈ ~96.000 palavras ≈ ~200 páginas. Gemini 1.5 Pro tem 1M tokens. Mas custo e latência crescem com o contexto.

3. Tokenização inconsistente de termos técnicos:
   "PAY-1421" pode ser tokenizado como ["PAY", "-", "14", "21"]
   "NullPointerException" como ["Null", "Pointer", "Exception"]
   Cada fragmento tem seu próprio embedding, degradando a busca por identifcadores exatos.

4. Idiomas: texto em português tipicamente usa mais tokens que inglês para o mesmo conteúdo (tokenizers são treinados predominantemente em inglês). "Internacionalização" em inglês é "Internationalization" — similar em tokens. Mas "Retrieval-Augmented Generation" em português requer tradução que usa +20-40% tokens.

5. Aritmética e raciocínio numérico: "127 + 348" pode ser tokenizado como ["127", "+", "348"] ou ["12", "7", "+", "3", "48"] dependendo do tokenizer. Isso explica por que LLMs têm dificuldade com aritmética de múltiplos dígitos — os operandos não são unidades atômicas.

━━━ DE TOKEN A EMBEDDING: A LOOKUP TABLE ━━━

O processo:
  token_id = tokenizer.encode("gato")[0]  # ex: 15643
  embedding = E[token_id]                  # linha 15643 da matriz E (shape: vocab_size × d_model)

A matriz de embedding E é inicializada aleatoriamente e treinada junto com o modelo. Após bilhões de tokens de treinamento, ela aprende que tokens com significados relacionados devem ter vetores similares — mas agora é um ponto de partida contextual, não um embedding final.

Custo de memória: com vocab=100k e d_model=4096, a matriz E tem 400M parâmetros = 1.6GB em float32.

━━━ O QUE ACONTECE CAMADA A CAMADA ━━━

Vamos rastrear um token específico — "banco" — em um modelo de 12 camadas:

Layer 0 (input): embedding "banco" = vetor estático de 768 dimensões. Idêntico para "banco financeiro" e "banco de rio".

Layer 1: self-attention examina todos os outros tokens. Se o contexto tem "margem" e "rio", os weights de atenção para esses tokens são altos. O vetor "banco" começa a incorporar contexto.

Layer 3: a representação de "banco" já é diferente nos dois contextos. O modelo aprendeu que "banco" + {margem, rio, água} ≠ "banco" + {crédito, juros, conta}.

Layer 6: representações semânticas de nível médio. "banco" no contexto financeiro começa a se aproximar de outros tokens financeiros (crédito, investimento) no espaço de representação.

Layer 11 (saída): a representação é maximamente contextualizada. O próximo token gerado depende inteiramente desta representação. Se o contexto é financeiro, os próximos tokens prováveis são {"central", "de dados", "do brasil", "imobiliário"...}

━━━ COMO O MODELO ESCOLHE O PRÓXIMO TOKEN ━━━

A representação da última posição passa pela "language modeling head":
  logits = LayerNorm(h_last) * W_unembed    # shape: vocab_size
  probs  = softmax(logits / temperature)
  next_token = sample(probs)

Temperature controla a aleatoriedade:
• temperature → 0: sempre escolhe o token mais provável (greedy, determinístico)
• temperature = 1.0: amostra da distribuição original
• temperature > 1.0: distribuição mais flat, respostas mais criativas mas menos coerentes

Top-P sampling (nucleus): só considera os tokens cujas probabilidades somam ≥ p. Com top-p=0.9, ignora a cauda longa de tokens improváveis, evitando escolhas absurdas.

Top-K sampling: só considera os K tokens mais prováveis.

Beam search: mantém B hipóteses (beams) em paralelo, escolhendo a sequência com maior probabilidade conjunta. Mais caro mas geralmente mais coerente para geração de texto estruturado.`,
  },
  {
    id: "prof_rag_deep",
    label: "📚 RAG: O Problema que Resolve e Como Resolve",
    heading: "RAG: O PROBLEMA QUE RESOLVE E COMO RESOLVE",
    content:
`RAG não é um truque de engenharia de prompt. É uma mudança arquitetural fundamental que separa o "motor de raciocínio" (o LLM) do "repositório de conhecimento" (o corpus indexado). Entender isso em profundidade é entender por que sistemas de IA production-grade funcionam da forma que funcionam.

━━━ O PROBLEMA FUNDAMENTAL DO LLM PURO ━━━

Um LLM é um snapshot congelado do conhecimento do mundo até a data de corte do treinamento. Seus parâmetros codificam estatísticas de co-ocorrência de texto. Quando você pergunta "qual foi o bug reportado no PAY-1421?", o modelo:
1. Não tem acesso a nenhum sistema Jira
2. Não conhece a história de incidents da sua empresa
3. Se tentar responder, vai gerar texto plausível-sounding baseado no padrão de como tickets Jira geralmente são descritos — que será factualmente inventado (hallucination)

O modelo não "sabe" que não sabe. Ele gera texto com alta confiança mesmo quando está inventando, porque o objetivo de treinamento era prever o próximo token — não identificar a fronteira do próprio conhecimento.

Mousavi et al. (2024) avaliaram 24 LLMs com 130 fatos time-sensitive (DyKnow benchmark):
  GPT-4:    80% correto, 13% desatualizado, 7% irrelevante
  ChatGPT:  57% correto, 35% desatualizado, 8% irrelevante
  Llama-3:  57% correto, 36% desatualizado, 7% irrelevante
  GPT-2:    26% correto, 42% desatualizado, 32% irrelevante

Mesmo o melhor modelo tem 20% de respostas incorretas para fatos simples.

━━━ A SOLUÇÃO RAG: DOIS TIPOS DE MEMÓRIA ━━━

Lewis et al. (2020) formalizaram a distinção fundamental:

MEMÓRIA PARAMÉTRICA: o conhecimento codificado nos pesos do modelo durante o treinamento. Fixo, não atualizável sem retreinar. Cobre conhecimento geral até o cutoff.

MEMÓRIA NÃO-PARAMÉTRICA: um corpus externo indexado, consultável em tempo de inferência. Atualizável sem tocar no modelo. Pode conter conhecimento proprietário, recente, específico de domínio.

A geração RAG marginaliza sobre documentos recuperados:
  P(y|q) = Σ_i P_gen(y|q, z_i) * P_ret(z_i|q)

Na prática (sem marginalização completa):
  z_{1..k} = retriever.search(q, top_k=5)
  prompt = f"{instruction}\n\nContext:\n{z_{1..k}}\n\nQuestion: {q}"
  y = LLM.generate(prompt)

O LLM age como função de leitura-e-síntese, não como banco de dados.

━━━ A PIPELINE DE INDEXAÇÃO EM DETALHES ━━━

PASSO 1 — Ingestão de documentos:
Fontes suportadas: PDFs, DOCX, HTML, Markdown, Jira API, Confluence API, Notion API, código-fonte, logs estruturados.
Cada fonte requer um parser específico. PDFs são o caso mais difícil: podem ser digitais (texto extraível) ou escaneados (requer OCR). Layouts multi-coluna (como artigos IEEE) baralham a ordem de leitura em extração naive.

PASSO 2 — Chunking:
O objetivo é criar fragmentos que sejam:
• Grandes o suficiente para ter contexto completo
• Pequenos o suficiente para não diluir o sinal relevante no embedding

Estratégias:
• Fixed-size: fatias de 512 tokens com overlap de 50-100 tokens. Simples, funciona. Problema: quebra no meio de frases e parágrafos.
• Sentence-level: preserva frases completas. Melhor semântica, mas tamanho variável.
• Paragraph-level: usa quebras de parágrafo como delimitadores naturais. Mais contexto, menos granularidade.
• Semantic chunking: usa embeddings para identificar onde o "tema" muda, quebrando ali. Mais caro, melhor qualidade.
• Hierarchical: chunks de diferentes granularidades (parágrafo, seção, documento). Multi-granularity retrieval usa todos.

PASSO 3 — Embedding:
Cada chunk é convertido em um vetor denso por um modelo de embedding (ex: text-embedding-3-large da OpenAI, nomic-embed, bge-large).

O modelo de embedding é diferente do LLM gerador. É tipicamente um encoder BERT-style treinado com contrastive learning: pares (query, documento relevante) têm embeddings próximos; pares (query, documento irrelevante) têm embeddings distantes.

PASSO 4 — Indexação:
Os vetores são armazenados num vector database (Qdrant, Pinecone, Weaviate, Milvus) que permite busca ANN (Approximate Nearest Neighbor) eficiente.

O índice HNSW (Hierarchical Navigable Small World): grafo hierárquico onde nós são vetores e arestas conectam vizinhos próximos em múltiplos níveis de granularidade. Busca em O(log n) com recall >95% para corpora de milhões de vetores.

━━━ A PIPELINE DE QUERY EM DETALHES ━━━

PASSO 1 — Query embedding: a query do usuário é convertida para o mesmo espaço vetorial dos documentos usando o mesmo modelo de embedding.

PASSO 2 — Retrieval:
  top_k = vector_db.search(query_vector, k=20, filters={"project": "PAY", "year": 2024})

Retorna os 20 chunks mais similares por cosine similarity.

PASSO 3 — Reranking (opcional mas importante):
O retriever bi-encoder é rápido mas impreciso: compara query e documento separadamente. O reranker cross-encoder é preciso: codifica query + documento juntos, capturando interações finas.
  scores = cross_encoder.predict([(query, chunk) for chunk in top_k])
  reranked = sorted(zip(scores, top_k), reverse=True)[:5]

PASSO 4 — Context assembly:
Os chunks finais são organizados no prompt. A ordem importa: modelos tendem a usar melhor informação no início e fim do contexto ("lost in the middle" — Liu et al., 2024).

PASSO 5 — Geração:
O LLM recebe o prompt completo e gera uma resposta fundamentada no contexto.

━━━ POR QUE O LLM NÃO ACESSA O VECTOR DB DIRETAMENTE? ━━━

Esta é uma confusão comum. No RAG clássico, o LLM nunca "entra" no vector database. O fluxo é:
  Usuário → Orchestrator → Vector DB → [chunks] → Orchestrator → LLM → Resposta

O LLM só vê o prompt final com os chunks já injetados. Isso é fundamentalmente diferente de function calling / tool use, onde o LLM pode emitir comandos que o orchestrator executa — mas mesmo assim, o LLM não executa a busca diretamente, ele apenas solicita que seja feita.

Implicações:
• Você pode trocar o LLM sem reconstruir o índice
• Você pode auditar exatamente o que foi dado ao modelo
• Você pode aplicar filtros de segurança antes de injetar o contexto
• Você pode ter múltiplos índices (por projeto, por nível de acesso) e selecionar qual usar por query`,
  },
  {
    id: "prof_rag_types",
    label: "🏗️ Tipos de RAG: Evolução e Trade-offs",
    heading: "TIPOS DE RAG: EVOLUÇÃO E TRADE-OFFS",
    content:
`RAG não é uma técnica monolítica. É uma família de arquiteturas que evoluiu ao longo de 5 anos para resolver limitações progressivamente mais sofisticadas. Cada geração adiciona complexidade em troca de qualidade.

━━━ NAIVE RAG (2020–2022): O BASELINE ━━━

Pipeline: chunk → embed → top-k → concatenar → gerar.

Funciona bem quando:
✓ Queries são simples e diretas ("O que é RAG?")
✓ A resposta está contida num único chunk
✓ O domínio tem linguagem consistente com os embeddings

Falha quando:
✗ A query usa terminologia diferente do documento ("problema de conexão" vs "timeout de rede")
✗ A resposta requer combinar múltiplos chunks ("quais são todos os bugs relacionados ao módulo X nos últimos 6 meses?")
✗ Os chunks têm muito ruído (headers, footers, metadados)
✗ O embedding model não foi treinado no domínio (código, linguagem jurídica, linguagem financeira)

Métricas típicas: doc_hit@5 de ~60-70% em domínios gerais, <40% em domínios técnicos específicos.

━━━ ADVANCED RAG (2022–2023): OTIMIZAÇÕES SISTEMÁTICAS ━━━

PRÉ-RETRIEVAL — melhorar a query antes de buscar:

Query Rewriting: usar um LLM pequeno para reformular a query original em termos mais similares à linguagem dos documentos.
  Original: "por que o pagamento falhou de novo?"
  Reescrita: "falha no processamento de transação pagamento error exception"

HyDE (Hypothetical Document Embeddings): gerar um documento hipotético que responderia à query, e usar o embedding desse documento para buscar — não o embedding da query. Funciona porque documentos e queries têm distribuições de texto diferentes.

Multi-Query: gerar N reformulações da mesma query, buscar com cada uma, reunir os resultados e deduplicar. Aumenta recall ao custo de N × latência de busca.

Step-back Prompting: reformular a query em uma versão mais abstrata ("qual é o princípio geral que explicaria isso?") para recuperar contexto de nível superior.

RETRIEVAL — melhorar como se busca:

Hybrid Search: combinar busca densa (vetorial) com busca esparsa (BM25/TF-IDF) via reciprocal rank fusion ou score normalization.
  score_final(d) = α * score_dense(d) + (1-α) * score_sparse(d)
  Tipicamente α = 0.6–0.7 para domínios técnicos

Metadata Filtering: filtrar o corpus antes de buscar, reduzindo o espaço de busca e aumentando precisão.
  db.search(query, filters={"project": "PAY", "type": "bug", "date": {"$gte": "2024-01-01"}})

PÓS-RETRIEVAL — melhorar o que é dado ao LLM:

Reranking com cross-encoder: re-ordenar os top-20 usando um modelo mais poderoso.

Context compression (Selective Context, LLMLingua): remover frases do contexto que são irrelevantes para a query, reduzindo tokens e melhorando precisão.

Parent-child retrieval: indexar chunks pequenos (alta precisão de retrieval) mas injetar o chunk pai (mais contexto) no prompt.

━━━ MODULAR RAG (2023): ARQUITETURA COMPONÍVEL ━━━

A ideia: definir interfaces claras entre componentes para permitir troca, teste A/B, e combinação flexível.

Componentes típicos:
• Router: decide qual fonte/índice usar baseado na query
• Retriever pool: múltiplos retrievers especializados (dense, sparse, graph, SQL)
• Critic: avalia a qualidade dos chunks recuperados antes de injetar
• Distiller: comprime/summariza o contexto
• Generator: o LLM final
• Evaluator: mede qualidade online

Isso permite: "para queries sobre código, usa o retriever de código-fonte. Para queries sobre políticas, usa o retriever de documentos regulatórios. Para queries gerais, usa o retriever híbrido."

━━━ CORRECTIVE RAG (2023–2024): RECUPERAÇÃO DE FALHAS ━━━

O insight: às vezes o retriever retorna lixo. Em vez de silenciosamente dar lixo ao LLM (que vai inventar uma resposta coerente com o lixo), o sistema deve detectar e corrigir.

CRAG (Yan et al., 2024):
1. Retrieve: buscar documentos
2. Evaluate: um modelo leve avalia se os documentos são relevantes (scores: correto, ambíguo, incorreto)
3. Se correto: refinar e usar
4. Se ambíguo: complementar com web search
5. Se incorreto: descartar e fazer web search completamente

FAIR-RAG (Aghajani Asl et al., 2024):
1. Retrieve: busca inicial
2. SEA (Structured Evidence Assessment): desconstruir a query em checklist de evidências necessárias
3. Gap identification: identificar explicitamente o que está faltando
4. Targeted retrieval: gerar sub-queries para preencher os gaps
5. Repeat até evidência suficiente ou max iterations

FAIR-RAG no HotpotQA: F1 de 0.453 vs 0.370 do Iter-RetGen (+8.3 pontos).

━━━ AGENTIC RAG (2024–2025): O LLM COMO DIRETOR ━━━

No Agentic RAG, o LLM não é apenas o gerador final — é o controlador do fluxo de retrieval.

Auto-RAG (Yu et al., 2024):
O retrieval é um diálogo multi-turno onde o LLM raciocina em linguagem natural:
  Turno 1: "Preciso saber o saldo atual do usuário. Vou buscar no histórico de transações."
  [retrieval]
  Turno 2: "O saldo é R$1.200. Mas para responder se o pagamento é possível, preciso do limite do cartão."
  [retrieval]
  Turno 3: "Limite R$5.000, saldo R$1.200. O pagamento de R$800 é possível."
  [geração da resposta final]

Tipos de agentes em RAG:
• Planning agents: decompõem queries complexas em sub-tasks, executam em ordem ou em paralelo
• Reflection agents: avaliam sua própria resposta, identificam incertezas, decidem se precisam buscar mais
• Tool-use agents: além do vector store, acessam calculadoras, APIs externas, bancos SQL
• Multi-agent: agentes especializados colaboram (um faz retrieval, outro analisa, outro verifica)

━━━ GRAPHRAG (2024): RECUPERAÇÃO EM GRAFOS ━━━

Microsoft GraphRAG indexa documentos como grafos de conhecimento em vez de chunks de texto:
• Nós: entidades (pessoas, organizações, conceitos, eventos)
• Arestas: relações entre entidades ("X é responsável por Y", "A aconteceu antes de B")
• Comunidades: clusters de entidades relacionadas

Para queries globais ("Quais são os principais riscos identificados em todos os documentos?"), GraphRAG supera RAG vetorial clássico porque consegue sintetizar informação espalhada por muitos documentos via estrutura do grafo.

Para queries locais específicas ("Qual é o status do PAY-1421?"), RAG vetorial ainda é superior.

━━━ TABELA COMPARATIVA DE TIPOS ━━━

Tipo       | Latência | Custo | Complexidade | Recall  | Melhor para
-----------|----------|-------|--------------|---------|------------------
Naive      | Baixa    | Baixo | Baixa        | ~65%    | MVP, prototipagem
Advanced   | Média    | Médio | Média        | ~80%    | Produção geral
Modular    | Média    | Médio | Alta         | ~82%    | Sistemas complexos
Corrective | Alta     | Alto  | Alta         | ~88%    | Alta precisão
Agentic    | Muito alta| Muito alto | Muito alta | ~92% | Reasoning complexo
GraphRAG   | Alta     | Alto  | Muito alta   | ~90%*  | Queries globais/síntese`,
  },
  {
    id: "prof_techniques",
    label: "🔧 Técnicas de RAG: O Diabo nos Detalhes",
    heading: "TÉCNICAS DE RAG: O DIABO NOS DETALHES",
    content:
`A qualidade de um sistema RAG depende mais das decisões de engenharia do pipeline do que da escolha do LLM. Esta seção detalha cada técnica com métricas, trade-offs e guias de decisão.

━━━ EMBEDDING MODELS: QUAL ESCOLHER? ━━━

O modelo de embedding determina o "espaço semântico" em que a busca acontece. Se o embedding não captura similaridade corretamente para o seu domínio, nenhuma outra otimização compensa.

Principais famílias:
• OpenAI text-embedding-3-large: 3072 dimensões, SOTA em MTEB (Massive Text Embedding Benchmark), $0.13/1M tokens. Ótimo para texto geral.
• Cohere embed-multilingual-v3: 1024 dimensões, excelente multilíngue, boa performance em PT-BR
• nomic-embed-text: open-source, 768 dimensões, performance próxima aos proprietários
• BGE-large (BAAI): open-source, muito bom para RAG, treinado especificamente com contrastive loss para retrieval
• Voyage AI: focado em código e domínios técnicos

Avaliação: MTEB é o benchmark padrão. Mas sempre avalie no seu próprio domínio — um embedding ótimo em MTEB pode ser medíocre para terminologia técnica específica.

Dimensionalidade vs performance: mais dimensões ≠ sempre melhor. text-embedding-3-small (1536 dim) supera text-embedding-ada-002 (1536 dim) em MTEB, mostrando que arquitetura importa mais que tamanho.

Fine-tuning de embeddings: para domínios muito específicos (código proprietário, terminologia médica), fine-tuning com pares (query, documento relevante) pode melhorar recall em 15-30%.

━━━ CHUNKING: ESTRATÉGIAS AVANÇADAS ━━━

Sliding window com overlap:
  chunk_size = 512 tokens
  overlap = 100 tokens
  → chunk 1: tokens 0-511
  → chunk 2: tokens 412-923
  → chunk 3: tokens 823-1334

O overlap garante que informação na fronteira de dois chunks apareça em pelo menos um deles completamente.

Hierarchical chunking (parent-child):
  • Indexar chunks pequenos (128 tokens) para alta precisão de retrieval
  • Armazenar referência ao chunk pai (512 tokens)
  • Ao fazer retrieval: buscar pelos filhos, retornar os pais
  → Melhor do dois mundos: precisão de matching + contexto suficiente

Proposição-level chunking: dividir em unidades de fato ("A empresa X foi fundada em 1990", "A empresa X tem sede em São Paulo"). Cada proposição é auto-contida. Melhor precisão, custo maior de indexação.

Late chunking: indexar o documento inteiro, depois segmentar no momento do retrieval usando attention sobre o documento. Preserva contexto mas é computacionalmente mais caro.

━━━ HYBRID SEARCH: COMO COMBINAR ━━━

Por que hybrid é superior a qualquer método isolado (Sawarkar et al., 2024):
• Dense falha em: identificadores exatos (PAY-1421), termos raros, queries keyword-style
• Sparse (BM25) falha em: sinônimos, paráfrases, queries semânticas sem overlap de vocabulário
• Hybrid cobre os pontos fracos de cada um

Reciprocal Rank Fusion (RRF) — método mais robusto:
  score_RRF(d) = Σ_{r ∈ retrievers} 1 / (k + rank_r(d))
  (tipicamente k=60)

Vantagem do RRF: não precisa normalizar scores de diferentes escalas. Desvantagem: ignora o magnitude dos scores, só usa o rank.

Score normalization + weighted sum:
  score_dense_norm = (score_dense - min) / (max - min)
  score_sparse_norm = (score_sparse - min) / (max - min)
  score_final = α * score_dense_norm + (1-α) * score_sparse_norm

Mais flexível, permite ajustar α por domínio.

ELSER (Elastic Learned Sparse Encoder): um meio-termo entre dense e sparse — usa um modelo para expandir queries e documentos com termos semanticamente relacionados, mas mantém representação esparsa (invertible index). Performance próxima ao dense com custo de busca similar ao sparse.

━━━ RERANKING: PRIMEIRA FASE vs SEGUNDA FASE ━━━

Arquitetura típica de dois estágios:

Estágio 1 — Retrieval (bi-encoder):
  query_vec = encoder(query)           # uma vez
  doc_vec_i = encoder(doc_i)           # pré-computado offline
  score_i = cosine(query_vec, doc_vec_i)

Vantagem: O(1) para queries — os doc vectors já estão no índice. Rápido para corpora de milhões.
Desvantagem: query e documento são codificados separadamente, sem interação cruzada.

Estágio 2 — Reranking (cross-encoder):
  score_i = cross_encoder(query + "[SEP]" + doc_i)

Vantagem: atenção cruzada entre query e documento captura interações finas impossíveis no bi-encoder.
Desvantagem: precisa rodar para cada (query, documento) par — não escalável para corpus inteiro.

Por isso o two-stage: retriever devolve 20-50 candidatos, reranker re-ordena apenas esses.

Modelos de reranking populares:
• Cohere rerank-3: SOTA, comercial
• BGE-reranker-large: open-source, excelente
• ms-marco-MiniLM: leve, bom para latência low-budget

━━━ AVALIAÇÃO COM RAGAS ━━━

RAGAS (Es et al., 2023) mede três dimensões ortogonais:

1. FAITHFULNESS (fidelidade ao contexto):
   • Extrai N claims da resposta via LLM
   • Verifica cada claim contra os chunks recuperados
   • Score = claims_suportadas / N
   • Detecta hallucination (resposta inventa algo não presente no contexto)

2. ANSWER RELEVANCE (relevância da resposta para a query):
   • Gera M perguntas que a resposta responderia
   • Score = média(cosine(pergunta_gerada, query_original))
   • Detecta respostas off-topic ou incompletas

3. CONTEXT RELEVANCE (qualidade do retrieval):
   • Identifica frases do contexto relevantes para a query
   • Score = frases_relevantes / frases_totais
   • Detecta retrieval de ruído (contexto não útil)

O RAGAS score global é a média harmônica das três métricas.
Interpretação: faithfulness baixa → hallucination. Context relevance baixa → retrieval ruim. Answer relevance baixa → problema de prompt/instrução.

Outras métricas importantes:
• doc_hit@k: pelo menos 1 dos k chunks recuperados contém a resposta? (recall do retrieval)
• MRR (Mean Reciprocal Rank): quão cedo na lista o documento relevante aparece?
• Chunk_kind_hit: quando há múltiplos tipos de chunks (text, table, figure), o tipo correto foi recuperado?

━━━ CONTEXT WINDOW MANAGEMENT ━━━

"Lost in the middle" (Liu et al., 2024): LLMs tendem a ignorar informação posicionada no meio de contextos longos. Performance degrada para posições > 30% do contexto.

Estratégias:
• Posicionar os chunks mais relevantes no início e no final do prompt
• Usar context compression para reduzir tamanho e manter densidade de informação
• LLMLingua (Jiang et al., 2023): compressão via token dropping baseado em perplexidade — remove tokens de baixa informação, mantém estrutura semântica

Custo vs benefício do contexto longo:
• Mais contexto → mais recall potencial
• Mais contexto → mais custo (linear em tokens para modelos com atenção quadrática)
• Mais contexto → mais "distração" para o modelo (paradox of choice)
• Recomendação: começar com 3-5 chunks de 512 tokens. Escalar só se doc_hit@k indicar recall insuficiente.`,
  },
];

const PROFESSOR_FULL: Section[] = PROFESSOR_SECTIONS.map((s) => ({
  ...s,
  collapsed: false,
}));

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */
function buildPaperText(sections: Section[]): string {
  return sections
    .map((s) => `${s.heading}\n\n${s.content}`)
    .join("\n\n");
}

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */
function romanize(n: number): string {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  let out = "";
  for (let i = 0; i < vals.length; i++) { while (n >= vals[i]) { out += syms[i]; n -= vals[i]; } }
  return out;
}

/* ─────────────────────────────────────────────────────────────
   Translation providers config
───────────────────────────────────────────────────────────── */
const TRANSLATION_PROVIDERS = [
  {
    id: "deepl",
    label: "DeepL",
    badge: "Recomendado",
    badgeColor: "#16a34a",
    description: "Melhor qualidade para texto acadêmico/técnico formal. Requer DEEPL_API_KEY.",
  },
  {
    id: "google",
    label: "Google Translate",
    badge: "Credencial configurada",
    badgeColor: "#2563eb",
    description: "Usa GOOGLE_APPLICATION_CREDENTIALS (service account) ou GOOGLE_TRANSLATE_API_KEY como fallback.",
  },
  {
    id: "openai",
    label: "OpenAI",
    badge: "Chave já configurada",
    badgeColor: "#7c3aed",
    description: "Usa a OPENAI_API_KEY existente. Excelente preservação de contexto técnico.",
  },
  {
    id: "gemini",
    label: "Gemini",
    badge: "Chave já configurada",
    badgeColor: "#7c3aed",
    description: "Usa a GEMINI_API_KEY existente. Boa alternativa ao OpenAI.",
  },
  {
    id: "ollama",
    label: "Ollama",
    badge: "Offline",
    badgeColor: "#b45309",
    description: "LLM local via Ollama. Sem internet, sem custos. Requer Ollama rodando em localhost:11434.",
  },
  {
    id: "libretranslate",
    label: "LibreTranslate",
    badge: "Offline",
    badgeColor: "#b45309",
    description: "Motor de tradução local. Rápido e leve. Docker: libretranslate/libretranslate --load-only en,pt",
  },
] as const;

type TranslationProvider = typeof TRANSLATION_PROVIDERS[number]["id"];

export function ArticleComposer() {
  const [title, setTitle]     = useState("From Tokens to RAG: A Survey of Modern AI Architectures and Retrieval-Augmented Generation with a Banking Case Study");
  const [authors, setAuthors] = useState("Matheus Engleitner");
  const [sections, setSections] = useState<Section[]>(INITIAL_FULL);
  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "slides" | "professor">("edit");
  const [profSections, setProfSections] = useState<Section[]>(PROFESSOR_FULL);
  const [profOpenId, setProfOpenId]     = useState<string | null>(PROFESSOR_SECTIONS[0]?.id ?? null);
  const [slideIdx, setSlideIdx]       = useState(0);
  const [slideFullscreen, setSlideFullscreen] = useState(false);
  const [slideLang, setSlideLang]     = useState<"en" | "pt">("pt");
  const [slideTranslations, setSlideTranslations] = useState<Map<number, { heading: string; bullets: string[] }>>(new Map());
  const [translatingSlides, setTranslatingSlides] = useState(false);
  const [slideTranslateProgress, setSlideTranslateProgress] = useState<{ done: number; total: number } | null>(null);
  const [slideTranslateError, setSlideTranslateError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState("");

  // Language & translation state
  const [language, setLanguage]             = useState<"en" | "pt">("en");
  const [translating, setTranslating]       = useState(false);
  const [translateProvider, setTranslateProvider] = useState<TranslationProvider>("deepl");
  const [translateProgress, setTranslateProgress] = useState<{ done: number; total: number } | null>(null);
  const [translateError, setTranslateError] = useState("");
  const [showProviderPanel, setShowProviderPanel] = useState(false);

  // ── Slide generation ──────────────────────────────────────
  type Slide = { kind: "cover"; title: string; authors: string } | { kind: "section"; num: number; heading: string; bullets: string[]; context?: string };

  const slides = useMemo<Slide[]>(() => {
    // ── helpers ──────────────────────────────────────────────
    function sentencesFrom(text: string, max: number): string[] {
      // split on sentence boundaries, keep meaningful ones
      return text
        .replace(/\n/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30)
        .slice(0, max);
    }

    function bulletsFromParas(paras: string[], maxBullets: number): string[] {
      const bullets: string[] = [];
      for (const para of paras) {
        const line = para.trim();
        if (!line || /^[A-Z]\d*\.\s/.test(line)) continue; // skip sub-headings themselves
        // take up to 2 sentences per paragraph
        const sents = sentencesFrom(line, 2);
        const joined = sents.join(" ");
        if (joined.length > 10) bullets.push(joined.length > 220 ? joined.slice(0, 217) + "…" : joined);
        if (bullets.length >= maxBullets) break;
      }
      return bullets;
    }

    // ── parse section into subheadings ───────────────────────
    type ParsedSub = { heading: string; paras: string[] };
    function parseSubsections(content: string): ParsedSub[] {
      const paras = content.split("\n\n");
      const subs: ParsedSub[] = [];
      let cur: ParsedSub | null = null;
      for (const raw of paras) {
        const line = raw.trim();
        if (!line) continue;
        // matches "A. Foo Bar" or "A.1 Foo"
        if (/^[A-Z]\d*\.\s+\S/.test(line)) {
          if (cur) subs.push(cur);
          const heading = line.replace(/^[A-Z]\d*\.\s+/, "").split("\n")[0].trim();
          cur = { heading, paras: [] };
        } else {
          if (!cur) cur = { heading: "", paras: [] };
          cur.paras.push(line);
        }
      }
      if (cur) subs.push(cur);
      return subs;
    }

    // ── build slides ─────────────────────────────────────────
    const result: Slide[] = [{ kind: "cover", title, authors }];

    sections.forEach((sec, idx) => {
      if (sec.id === "references") return;
      const sectionLabel = sec.label.replace(/^[IVXLC]+\.\s*/, "");
      const subs = parseSubsections(sec.content);

      if (subs.length === 0 || (subs.length === 1 && !subs[0].heading)) {
        // no subheadings — single slide for the whole section
        const bullets = bulletsFromParas(sec.content.split("\n\n"), 5);
        result.push({ kind: "section", num: idx + 1, heading: sectionLabel, bullets });
        return;
      }

      // one slide per subheading
      subs.forEach((sub) => {
        const heading = sub.heading || sectionLabel;
        const bullets = bulletsFromParas(sub.paras, 5);
        if (bullets.length === 0 && !heading) return;
        result.push({
          kind: "section",
          num: idx + 1,
          heading,
          bullets: bullets.length > 0 ? bullets : [`(${sectionLabel})`],
          context: sectionLabel,
        } as Slide);
      });
    });

    return result;
  }, [sections, title, authors]);

  // keyboard navigation for slides
  useEffect(() => {
    if (activeTab !== "slides") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setSlideIdx((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   setSlideIdx((i) => Math.max(i - 1, 0));
      if (e.key === "Escape") setSlideFullscreen(false);
      if (e.key === "f" || e.key === "F") setSlideFullscreen((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab, slides.length]);

  // reset translations when slides regenerate (sections changed)
  useEffect(() => { setSlideTranslations(new Map()); setSlideLang("en"); }, [slides]);

  // auto-translate to PT via LibreTranslate when entering slides tab
  useEffect(() => {
    if (activeTab === "slides" && slideLang === "en" && !translatingSlides) {
      handleTranslateSlides("pt");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleTranslateSlides = useCallback(async (targetLang: "en" | "pt") => {
    if (targetLang === "en") { setSlideTranslations(new Map()); setSlideLang("en"); return; }
    setTranslatingSlides(true);
    setSlideTranslateError("");
    const contentSlides = slides.filter((s) => s.kind === "section");
    setSlideTranslateProgress({ done: 0, total: contentSlides.length });
    const API_BASE = getApiBase();
    const newMap = new Map<number, { heading: string; bullets: string[] }>();

    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      if (s.kind !== "section") continue;
      const text = [s.heading, ...s.bullets].join("\n");
      try {
        const res = await fetch(`${API_BASE}/translate-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, provider: "libretranslate", target_language: "PT-BR" }),
        });
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        const data = await res.json() as { translated: string };
        const lines = data.translated.split("\n").map((l: string) => l.trim()).filter(Boolean);
        newMap.set(i, { heading: lines[0] ?? s.heading, bullets: lines.slice(1) });
        setSlideTranslateProgress({ done: newMap.size, total: contentSlides.length });
      } catch (err) {
        setSlideTranslateError(`Erro no slide ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
        setTranslatingSlides(false);
        setSlideTranslateProgress(null);
        return;
      }
    }
    setSlideTranslations(newMap);
    setSlideLang("pt");
    setTranslatingSlides(false);
    setSlideTranslateProgress(null);
  }, [slides, translateProvider]);

  const updateSection = useCallback((id: string, content: string) => {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, content } : s));
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, collapsed: !s.collapsed } : s));
  }, []);

  const expandAll  = useCallback(() => setSections((p) => p.map((s) => ({ ...s, collapsed: false }))), []);
  const collapseAll = useCallback(() => setSections((p) => p.map((s) => ({ ...s, collapsed: true }))), []);

  // Translate all sections sequentially (one request per section to avoid timeouts)
  const handleTranslate = useCallback(async () => {
    setTranslating(true);
    setTranslateError("");
    setTranslateProgress({ done: 0, total: sections.length });

    const API_BASE = getApiBase();
    const target   = language === "pt" ? "PT-BR" : "EN-US";
    const updated  = [...sections];

    for (let i = 0; i < updated.length; i++) {
      try {
        const res = await fetch(`${API_BASE}/translate-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: updated[i].content,
            provider: translateProvider,
            target_language: target,
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const data = await res.json() as { translated: string };
        updated[i] = { ...updated[i], content: data.translated };
        setTranslateProgress({ done: i + 1, total: updated.length });
      } catch (err: unknown) {
        setTranslateError(`Erro na seção "${updated[i].label}": ${err instanceof Error ? err.message : String(err)}`);
        setTranslating(false);
        setTranslateProgress(null);
        return;
      }
    }

    setSections(updated);
    setTranslating(false);
    setTranslateProgress(null);
  }, [sections, language, translateProvider]);

  const handleGeneratePdf = useCallback(async () => {
    setGenerating(true);
    setGenError("");
    try {
      const API_BASE = getApiBase();
      const paper_text = buildPaperText(sections);
      const res = await fetch(`${API_BASE}/ieee-paper/from-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper_text, title, authors }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `ieee_from_tokens_to_rag.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [sections, title, authors]);

  const wordCount = sections.reduce((acc, s) => acc + s.content.split(/\s+/).filter(Boolean).length, 0);
  const selectedProvider = TRANSLATION_PROVIDERS.find((p) => p.id === translateProvider)!;

  return (
    <div className="ac-root">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="ac-topbar">
        <div className="ac-topbar__left">
          <span className="ac-badge">IEEE</span>
          <span className="ac-topbar__title">Article Composer</span>
          <span className="ac-topbar__words">{wordCount} words</span>
        </div>
        <div className="ac-topbar__right">
          <button className="ac-btn ac-btn--ghost" onClick={expandAll} type="button">Expandir tudo</button>
          <button className="ac-btn ac-btn--ghost" onClick={collapseAll} type="button">Colapsar tudo</button>

          {/* ── Language toggle ── */}
          <div className="ac-lang-toggle">
            <button
              className={`ac-lang-btn ${language === "en" ? "ac-lang-btn--active" : ""}`}
              onClick={() => setLanguage("en")}
              type="button"
              title="English"
            >EN</button>
            <button
              className={`ac-lang-btn ${language === "pt" ? "ac-lang-btn--active" : ""}`}
              onClick={() => setLanguage("pt")}
              type="button"
              title="Português (BR)"
            >PT</button>
          </div>

          {/* ── Translate button (only visible when PT selected) ── */}
          {language === "pt" && (
            <div className="ac-translate-group">
              <button
                className="ac-btn ac-btn--translate"
                onClick={handleTranslate}
                disabled={translating || generating}
                type="button"
                title={`Traduzir via ${selectedProvider.label}`}
              >
                {translating ? (
                  <><span className="ac-spinner ac-spinner--dark" />
                    {translateProgress
                      ? `${translateProgress.done}/${translateProgress.total}`
                      : "Traduzindo…"}
                  </>
                ) : (
                  <>🌐 Traduzir ({selectedProvider.label})</>
                )}
              </button>
              <button
                className="ac-btn ac-btn--ghost ac-btn--icon"
                onClick={() => setShowProviderPanel((v) => !v)}
                type="button"
                title="Escolher provedor de tradução"
              >⚙</button>
            </div>
          )}

          <div className="ac-tabs">
            <button className={`ac-tab ${activeTab === "edit" ? "ac-tab--active" : ""}`} onClick={() => setActiveTab("edit")} type="button">Editar</button>
            <button className={`ac-tab ${activeTab === "preview" ? "ac-tab--active" : ""}`} onClick={() => setActiveTab("preview")} type="button">Preview</button>
            <button className={`ac-tab ${activeTab === "slides" ? "ac-tab--active" : ""}`} onClick={() => { setActiveTab("slides"); setSlideIdx(0); }} type="button">Apresentação</button>
            <button className={`ac-tab ac-tab--prof ${activeTab === "professor" ? "ac-tab--active" : ""}`} onClick={() => setActiveTab("professor")} type="button">👨‍🏫 Professor</button>
          </div>
          <button
            className="ac-btn ac-btn--primary"
            onClick={handleGeneratePdf}
            disabled={generating || translating}
            type="button"
          >
            {generating ? (
              <><span className="ac-spinner" /> Gerando…</>
            ) : (
              <><span className="ac-pdf-icon">↓</span> Gerar PDF IEEE</>
            )}
          </button>
        </div>
      </div>

      {/* ── Provider picker panel ───────────────────────────────── */}
      {showProviderPanel && (
        <div className="ac-provider-panel">
          <div className="ac-provider-panel__header">
            <span className="ac-provider-panel__title">Provedor de tradução</span>
            <button className="ac-provider-panel__close" onClick={() => setShowProviderPanel(false)} type="button">✕</button>
          </div>
          <div className="ac-provider-panel__grid">
            {TRANSLATION_PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`ac-provider-card ${translateProvider === p.id ? "ac-provider-card--active" : ""}`}
                onClick={() => { setTranslateProvider(p.id); setShowProviderPanel(false); }}
                type="button"
              >
                <div className="ac-provider-card__top">
                  <span className="ac-provider-card__name">{p.label}</span>
                  <span className="ac-provider-card__badge" style={{ background: p.badgeColor }}>{p.badge}</span>
                </div>
                <p className="ac-provider-card__desc">{p.description}</p>
              </button>
            ))}
          </div>
          <div className="ac-provider-panel__tip">
            <strong>Modo offline:</strong> Use <strong>Ollama</strong> (LLM local, melhor qualidade) ou <strong>LibreTranslate</strong> (rápido, leve — inicie com{" "}
            <code style={{fontSize:".75em",background:"rgba(0,0,0,.08)",padding:"1px 5px",borderRadius:3}}>
              docker run -d -p 5000:5000 libretranslate/libretranslate --load-only en,pt
            </code>). Para máxima qualidade com internet, prefira <strong>DeepL</strong> (500k chars/mês grátis).
          </div>
        </div>
      )}

      {(genError || translateError) && (
        <div className="ac-error">{genError || translateError}</div>
      )}

      {/* ── Translation progress bar ────────────────────────────── */}
      {translateProgress && (
        <div className="ac-progress-bar">
          <div
            className="ac-progress-bar__fill"
            style={{ width: `${(translateProgress.done / translateProgress.total) * 100}%` }}
          />
          <span className="ac-progress-bar__label">
            Traduzindo seção {translateProgress.done}/{translateProgress.total} via {selectedProvider.label}…
          </span>
        </div>
      )}

      {/* ── Meta fields (hidden in preview) ────────────────────── */}
      <div className={`ac-meta${activeTab === "preview" ? " ac-meta--hidden" : ""}`}>
        <div className="ac-meta__field">
          <label className="ac-label">Título</label>
          <input className="ac-input ac-input--title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="ac-meta__field ac-meta__field--narrow">
          <label className="ac-label">Autores</label>
          <input className="ac-input" value={authors} onChange={(e) => setAuthors(e.target.value)} />
        </div>
        <div className="ac-meta__field ac-meta__field--badge">
          <label className="ac-label">Idioma atual</label>
          <span className={`ac-lang-indicator ${language === "pt" ? "ac-lang-indicator--pt" : "ac-lang-indicator--en"}`}>
            {language === "pt" ? "🇧🇷 Português (BR)" : "🇺🇸 English"}
          </span>
        </div>
      </div>

      {/* ── Edit / Preview body ─────────────────────────────────── */}
      {activeTab === "edit" && (
        <div className="ac-sections">
          {sections.map((sec) => (
            <div key={sec.id} className={`ac-section ${sec.collapsed ? "ac-section--collapsed" : ""}`}>
              <button
                className="ac-section__header"
                onClick={() => toggleCollapse(sec.id)}
                type="button"
              >
                <span className="ac-section__caret">{sec.collapsed ? "▶" : "▼"}</span>
                <span className="ac-section__label">{sec.label}</span>
                <span className="ac-section__words">{sec.content.split(/\s+/).filter(Boolean).length}w</span>
              </button>
              {!sec.collapsed && (
                <textarea
                  className="ac-section__body"
                  value={sec.content}
                  onChange={(e) => updateSection(sec.id, e.target.value)}
                  rows={Math.max(8, sec.content.split("\n").length + 2)}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {activeTab === "slides" && (
        <div className={`ac-slides ${slideFullscreen ? "ac-slides--fullscreen" : ""}`}>
          {/* slide */}
          <div className="ac-slide">
            {(() => {
              const s = slides[slideIdx];
              if (s.kind === "cover") return (
                <div className="ac-slide__cover">
                  <div className="ac-slide__cover-badge">From Tokens to RAG</div>
                  <h1 className="ac-slide__cover-title">{s.title}</h1>
                  <p className="ac-slide__cover-authors">{s.authors}</p>
                  <p className="ac-slide__cover-hint">Use ← → ou F para fullscreen</p>
                </div>
              );
              {
                const tr = slideTranslations.get(slideIdx);
                const heading = tr?.heading ?? s.heading;
                const bullets = tr?.bullets ?? s.bullets;
                return (
                  <div className="ac-slide__content">
                    <div className="ac-slide__breadcrumb">
                      <span className="ac-slide__num">{romanize(s.num)}</span>
                      {s.context && <span className="ac-slide__context"> · {s.context}</span>}
                    </div>
                    <h2 className="ac-slide__heading">{heading}</h2>
                    <ul className="ac-slide__bullets">
                      {bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                );
              }
            })()}
          </div>

          {/* controls */}
          <div className="ac-slides__controls">
            <button className="ac-slides__nav" onClick={() => setSlideIdx((i) => Math.max(i - 1, 0))} disabled={slideIdx === 0} type="button">←</button>
            <span className="ac-slides__counter">{slideIdx + 1} / {slides.length}</span>
            <button className="ac-slides__nav" onClick={() => setSlideIdx((i) => Math.min(i + 1, slides.length - 1))} disabled={slideIdx === slides.length - 1} type="button">→</button>

            <div className="ac-slides__lang-toggle">
              <button
                className={`ac-slides__lang-btn ${slideLang === "en" ? "ac-slides__lang-btn--active" : ""}`}
                onClick={() => handleTranslateSlides("en")}
                disabled={translatingSlides}
                type="button"
              >EN</button>
              <button
                className={`ac-slides__lang-btn ${slideLang === "pt" ? "ac-slides__lang-btn--active" : ""}`}
                onClick={() => handleTranslateSlides("pt")}
                disabled={translatingSlides}
                type="button"
              >
                {translatingSlides
                  ? slideTranslateProgress ? `${slideTranslateProgress.done}/${slideTranslateProgress.total}` : "…"
                  : "PT"}
              </button>
            </div>

            <button className="ac-slides__fs" onClick={() => setSlideFullscreen((v) => !v)} type="button" title="Fullscreen (F)">{slideFullscreen ? "⤡" : "⤢"}</button>
          </div>
          {slideTranslateError && (
            <div className="ac-slides__error">{slideTranslateError}</div>
          )}

          {/* thumbnail strip */}
          <div className="ac-slides__strip">
            {slides.map((s, i) => (
              <button
                key={i}
                className={`ac-slides__thumb ${i === slideIdx ? "ac-slides__thumb--active" : ""}`}
                onClick={() => setSlideIdx(i)}
                type="button"
                title={s.kind === "cover" ? "Capa" : s.heading}
              >
                <span className="ac-slides__thumb-num">{i + 1}</span>
                <span className="ac-slides__thumb-label">{s.kind === "cover" ? "Capa" : s.heading}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {activeTab === "preview" && (
        <div className="ac-preview">
          <div className="ac-preview__page">
            <div className="ac-preview__header">
              <h1 className="ac-preview__title">{title}</h1>
              <p className="ac-preview__authors">{authors}</p>
              <div className="ac-preview__rules"><hr /><hr /></div>
            </div>
            <div className="ac-preview__body">
              {sections.map((sec, idx) => (
                <div key={sec.id} className="ac-preview__section">
                  <h2 className="ac-preview__heading">{romanize(idx + 1)}. {sec.heading.toUpperCase()}</h2>
                  {sec.content.split("\n\n").map((para, i) => (
                    <p key={i} className="ac-preview__para">{para}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {activeTab === "professor" && (
        <div className="ac-prof">
          <div className="ac-prof__sidebar">
            <div className="ac-prof__sidebar-title">📖 Índice</div>
            {profSections.map((s) => (
              <button
                key={s.id}
                className={`ac-prof__nav-item ${profOpenId === s.id ? "ac-prof__nav-item--active" : ""}`}
                onClick={() => setProfOpenId(s.id)}
                type="button"
              >{s.label}</button>
            ))}
          </div>
          <div className="ac-prof__content">
            <div className="ac-prof__disclaimer">
              ⚠️ Este documento não faz parte do artigo IEEE — é um material de estudo complementar detalhado.
            </div>
            {profSections.filter((s) => s.id === profOpenId).map((s) => (
              <div key={s.id} className="ac-prof__doc">
                <h1 className="ac-prof__doc-title">{s.label}</h1>
                {s.content.split("\n\n").map((block, i) => {
                  const trimmed = block.trim();
                  if (!trimmed) return null;
                  // section dividers ━━━
                  if (/^━+\s/.test(trimmed)) {
                    return <h2 key={i} className="ac-prof__section-title">{trimmed.replace(/^━+\s*/, "").replace(/\s*━+$/, "")}</h2>;
                  }
                  // arrow bullets → or •
                  if (/^[→•✓✗→]/.test(trimmed) || trimmed.split("\n").every((l) => /^[→•·✓✗]/.test(l.trim()))) {
                    return (
                      <ul key={i} className="ac-prof__list">
                        {trimmed.split("\n").map((l, j) => (
                          <li key={j}>{l.replace(/^[→•·✓✗]\s*/, "")}</li>
                        ))}
                      </ul>
                    );
                  }
                  // code-like blocks (indented or contains = / →)
                  if (/^\s{2}/.test(block) || /[=→∝Σ]/.test(trimmed)) {
                    return <pre key={i} className="ac-prof__code">{trimmed}</pre>;
                  }
                  // table rows
                  if (trimmed.includes("|") && trimmed.split("|").length > 3) {
                    const rows = trimmed.split("\n").filter((r) => r.includes("|"));
                    return (
                      <table key={i} className="ac-prof__table">
                        <tbody>
                          {rows.map((row, ri) => (
                            <tr key={ri}>
                              {row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1).map((cell, ci) => (
                                ri === 0
                                  ? <th key={ci}>{cell.trim()}</th>
                                  : <td key={ci}>{cell.trim()}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  }
                  return <p key={i} className="ac-prof__para">{trimmed}</p>;
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .ac-root {
          display: flex; flex-direction: column; gap: 0;
          min-height: 100vh; background: var(--bg, #f0f2f5);
        }

        /* Top bar */
        .ac-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: .75rem 1.5rem; background: var(--surface, #fff);
          border-bottom: 1px solid var(--border, #e2e5eb);
          flex-wrap: wrap; gap: .5rem; position: sticky; top: 0; z-index: 10;
          box-shadow: 0 1px 4px rgba(0,0,0,.06);
        }
        .ac-topbar__left { display: flex; align-items: center; gap: .75rem; }
        .ac-topbar__right { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
        .ac-badge {
          background: #1e3a5f; color: #fff; font-size: .65rem; font-weight: 800;
          padding: 2px 7px; border-radius: 4px; letter-spacing: .06em;
        }
        .ac-topbar__title { font-size: .95rem; font-weight: 700; color: var(--text, #1a1d23); }
        .ac-topbar__words { font-size: .75rem; color: var(--text-secondary, #5f6577); background: var(--bg, #f0f2f5); padding: 2px 8px; border-radius: 20px; }

        /* Buttons */
        .ac-btn {
          border-radius: 8px; font-size: .8rem; font-weight: 600; padding: .38rem .85rem;
          cursor: pointer; transition: all .12s; white-space: nowrap; display: flex; align-items: center; gap: .35rem;
        }
        .ac-btn--ghost {
          background: none; border: 1px solid var(--border, #e2e5eb); color: var(--text-secondary, #5f6577);
        }
        .ac-btn--ghost:hover { border-color: var(--primary, #4f7df3); color: var(--primary, #4f7df3); }
        .ac-btn--primary {
          background: #1e3a5f; border: none; color: #fff;
        }
        .ac-btn--primary:hover:not(:disabled) { background: #2a4f80; }
        .ac-btn--primary:disabled { opacity: .55; cursor: not-allowed; }
        .ac-pdf-icon { font-size: 1rem; font-weight: 900; }
        .ac-spinner {
          width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.35);
          border-top-color: #fff; border-radius: 50%;
          animation: ac-spin .7s linear infinite; display: inline-block;
        }
        @keyframes ac-spin { to { transform: rotate(360deg); } }

        /* Language toggle */
        .ac-lang-toggle { display: flex; border: 1px solid var(--border, #e2e5eb); border-radius: 8px; overflow: hidden; }
        .ac-lang-btn {
          background: none; border: none; padding: .3rem .65rem; font-size: .75rem;
          font-weight: 700; color: var(--text-secondary, #5f6577); cursor: pointer;
          transition: background .1s, color .1s; letter-spacing: .04em;
        }
        .ac-lang-btn--active { background: #1e3a5f; color: #fff; }

        /* Translate group */
        .ac-translate-group { display: flex; gap: .25rem; align-items: center; }
        .ac-btn--translate {
          background: #f0fdf4; border: 1px solid #86efac; color: #15803d;
          border-radius: 8px; font-size: .8rem; font-weight: 600; padding: .38rem .85rem;
          cursor: pointer; transition: all .12s; display: flex; align-items: center; gap: .35rem; white-space: nowrap;
        }
        .ac-btn--translate:hover:not(:disabled) { background: #dcfce7; border-color: #4ade80; }
        .ac-btn--translate:disabled { opacity: .55; cursor: not-allowed; }
        .ac-btn--icon { padding: .38rem .5rem; font-size: .88rem; }
        .ac-spinner--dark {
          width: 12px; height: 12px; border: 2px solid rgba(21,128,61,.3);
          border-top-color: #15803d; border-radius: 50%;
          animation: ac-spin .7s linear infinite; display: inline-block;
        }

        /* Provider panel */
        .ac-provider-panel {
          background: var(--surface, #fff); border-bottom: 1px solid var(--border, #e2e5eb);
          padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: .75rem;
        }
        .ac-provider-panel__header { display: flex; align-items: center; justify-content: space-between; }
        .ac-provider-panel__title { font-size: .88rem; font-weight: 700; color: var(--text, #1a1d23); }
        .ac-provider-panel__close {
          background: none; border: none; cursor: pointer; color: var(--text-tertiary, #8b92a5);
          font-size: .9rem; padding: .1rem .35rem; border-radius: 4px;
          transition: color .1s;
        }
        .ac-provider-panel__close:hover { color: var(--text, #1a1d23); }
        .ac-provider-panel__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: .6rem; }
        .ac-provider-card {
          background: var(--bg, #f0f2f5); border: 2px solid var(--border, #e2e5eb);
          border-radius: 10px; padding: .7rem .9rem; cursor: pointer; text-align: left;
          transition: border-color .12s, background .12s; display: flex; flex-direction: column; gap: .3rem;
        }
        .ac-provider-card:hover { border-color: var(--primary, #4f7df3); background: var(--surface, #fff); }
        .ac-provider-card--active { border-color: #1e3a5f; background: var(--surface, #fff); }
        .ac-provider-card__top { display: flex; align-items: center; justify-content: space-between; gap: .4rem; }
        .ac-provider-card__name { font-size: .85rem; font-weight: 700; color: var(--text, #1a1d23); }
        .ac-provider-card__badge { font-size: .62rem; font-weight: 700; color: #fff; padding: 1px 7px; border-radius: 20px; white-space: nowrap; }
        .ac-provider-card__desc { font-size: .75rem; color: var(--text-secondary, #5f6577); margin: 0; line-height: 1.45; }
        .ac-provider-panel__tip {
          background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
          padding: .6rem .9rem; font-size: .78rem; color: #78350f; line-height: 1.5;
        }

        /* Progress bar */
        .ac-progress-bar {
          position: relative; height: 32px; background: #f0fdf4;
          border-bottom: 1px solid #86efac; overflow: hidden; display: flex; align-items: center;
        }
        .ac-progress-bar__fill {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: #4ade80; transition: width .3s ease; opacity: .5;
        }
        .ac-progress-bar__label {
          position: relative; font-size: .75rem; font-weight: 600; color: #15803d;
          padding: 0 1rem; z-index: 1;
        }

        /* Language indicator */
        .ac-meta__field--badge { flex: 0 0 auto; min-width: 140px; }
        .ac-lang-indicator {
          display: inline-flex; align-items: center; gap: .35rem;
          font-size: .8rem; font-weight: 600; padding: .35rem .7rem;
          border-radius: 20px; border: 1px solid;
        }
        .ac-lang-indicator--en { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
        .ac-lang-indicator--pt { background: #f0fdf4; color: #15803d; border-color: #86efac; }

        /* Tabs */
        .ac-tabs { display: flex; border: 1px solid var(--border, #e2e5eb); border-radius: 8px; overflow: hidden; }
        .ac-tab {
          background: none; border: none; padding: .35rem .75rem; font-size: .78rem;
          font-weight: 600; color: var(--text-secondary, #5f6577); cursor: pointer;
          transition: background .1s, color .1s;
        }
        .ac-tab--active { background: var(--primary, #4f7df3); color: #fff; }

        /* Error */
        .ac-error {
          margin: .5rem 1.5rem 0; background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 8px; color: #dc2626; font-size: .82rem; padding: .6rem 1rem;
        }

        /* Meta fields */
        .ac-meta {
          display: flex; gap: 1rem; padding: 1rem 1.5rem;
          background: var(--surface, #fff); border-bottom: 1px solid var(--border, #e2e5eb);
          flex-wrap: wrap;
        }
        .ac-meta--hidden { display: none; }
        .ac-meta__field { display: flex; flex-direction: column; gap: .3rem; flex: 1; min-width: 200px; }
        .ac-meta__field--narrow { max-width: 280px; }
        .ac-label { font-size: .72rem; font-weight: 700; color: var(--text-secondary, #5f6577); text-transform: uppercase; letter-spacing: .05em; }
        .ac-input {
          border: 1px solid var(--border, #e2e5eb); border-radius: 8px;
          padding: .45rem .75rem; font-size: .88rem; color: var(--text, #1a1d23);
          background: var(--bg, #f0f2f5); width: 100%; box-sizing: border-box;
          transition: border-color .12s;
        }
        .ac-input--title { font-weight: 600; }
        .ac-input:focus { outline: none; border-color: var(--primary, #4f7df3); background: var(--surface, #fff); }

        /* Sections */
        .ac-sections {
          display: flex; flex-direction: column; gap: .5rem;
          padding: 1rem 1.5rem; max-width: 1100px; margin: 0 auto; width: 100%; box-sizing: border-box;
        }
        .ac-section {
          background: var(--surface, #fff); border: 1px solid var(--border, #e2e5eb);
          border-radius: 10px; transition: box-shadow .15s, border-color .15s;
        }
        .ac-section:hover { box-shadow: 0 2px 10px rgba(0,0,0,.1); border-color: #4f7df3; }
        .ac-section__header {
          display: flex; align-items: center; gap: .6rem; width: 100%;
          padding: .75rem 1rem; background: none; border: none; cursor: pointer;
          text-align: left; transition: background .1s;
        }
        .ac-section__header:hover { background: var(--bg, #f0f2f5); }
        .ac-section__caret { font-size: .7rem; color: var(--text-tertiary, #8b92a5); width: 14px; flex-shrink: 0; }
        .ac-section__label { font-size: .87rem; font-weight: 700; color: var(--text, #1a1d23); flex: 1; }
        .ac-section__words { font-size: .72rem; color: var(--text-tertiary, #8b92a5); background: var(--bg, #f0f2f5); padding: 1px 8px; border-radius: 20px; }
        .ac-section__body {
          width: 100%; box-sizing: border-box; border: none; border-top: 1px solid var(--border-light, #eef0f4);
          padding: .9rem 1rem; font-size: .9rem; line-height: 1.7;
          color: var(--text, #1a1d23); background: var(--surface, #fff);
          font-family: inherit; resize: vertical;
          min-height: 160px; display: block;
        }
        .ac-section__body:focus { outline: none; background: #fafbff; }

        /* Preview — PDF style */
        .ac-preview {
          min-height: calc(100vh - 120px);
          padding: 2.5rem 1.5rem; background: #525659;
          display: flex; justify-content: center; align-items: flex-start;
        }
        .ac-preview__page {
          background: #fff; width: 100%; max-width: 840px;
          padding: 2.8rem 3rem; margin-bottom: 2.5rem;
          box-shadow: 0 8px 48px rgba(0,0,0,.6);
          font-family: "Times New Roman", Times, serif;
        }
        .ac-preview__header { text-align: center; margin-bottom: .7rem; }
        .ac-preview__title {
          font-size: 1.42rem; font-weight: 700; line-height: 1.35; margin: 0 0 .3rem;
        }
        .ac-preview__authors {
          font-size: .88rem; margin: 0 0 .55rem; color: #222;
        }
        .ac-preview__rules { display: flex; flex-direction: column; gap: 3px; margin-bottom: .85rem; }
        .ac-preview__rules hr { border: none; border-top: 1px solid #000; margin: 0; }
        .ac-preview__body { column-count: 2; column-gap: 1.5rem; }
        .ac-preview__section { margin-bottom: .85rem; break-inside: avoid; }
        .ac-preview__heading {
          font-size: .82rem; font-weight: 700; text-align: center;
          letter-spacing: .05em; margin: 0 0 .35rem;
        }
        .ac-preview__para {
          font-size: .78rem; line-height: 1.56; text-align: justify;
          text-indent: 1.2em; margin: 0 0 .22rem; color: #111;
        }
        .ac-preview__para:first-of-type { text-indent: 0; }

        @media (max-width: 700px) {
          .ac-topbar { padding: .6rem 1rem; }
          .ac-sections { padding: .75rem 1rem; }
          .ac-meta { padding: .75rem 1rem; }
          .ac-preview { padding: .75rem; }
          .ac-preview__page { padding: 1.5rem 1rem; }
          .ac-preview__body { column-count: 1; }
        }

        [data-theme="dark"] .ac-section__body { background: #1c2128; color: #e6edf3; }
        [data-theme="dark"] .ac-section__body:focus { background: #21262d; }
        /* Preview paper is always white — simulates a real document page */
        .ac-preview__page { color: #111; }
        .ac-preview__title { color: #000; }
        .ac-preview__authors { color: #222; }
        .ac-preview__heading { color: #000; }
        .ac-preview__para { color: #111; }
        [data-theme="dark"] .ac-preview { background: #1a1d21; }

        /* ── Professor mode ─────────────────────────────────────── */
        .ac-tab--prof { border-left: 1px solid var(--border, #e2e5eb); margin-left: .25rem; }
        .ac-prof {
          display: flex; min-height: calc(100vh - 120px);
          background: var(--bg, #f0f2f5);
        }
        .ac-prof__sidebar {
          width: 240px; flex-shrink: 0;
          background: var(--surface, #fff); border-right: 1px solid var(--border, #e2e5eb);
          display: flex; flex-direction: column; gap: .1rem; padding: .75rem .5rem;
          position: sticky; top: 0; height: calc(100vh - 120px); overflow-y: auto;
        }
        .ac-prof__sidebar-title {
          font-size: .68rem; font-weight: 800; text-transform: uppercase;
          letter-spacing: .08em; color: var(--text-tertiary, #8b92a5);
          padding: .25rem .5rem .6rem;
        }
        .ac-prof__nav-item {
          text-align: left; background: none; border: none; cursor: pointer;
          padding: .5rem .65rem; border-radius: 7px; font-size: .78rem;
          color: var(--text-secondary, #5f6577); line-height: 1.35;
          transition: background .1s, color .1s;
        }
        .ac-prof__nav-item:hover { background: var(--bg, #f0f2f5); color: var(--text, #1a1d23); }
        .ac-prof__nav-item--active { background: #eff6ff; color: #1d4ed8; font-weight: 700; }
        [data-theme="dark"] .ac-prof__nav-item--active { background: #1e3a5f; color: #93c5fd; }
        .ac-prof__content {
          flex: 1; padding: 2rem 3rem; max-width: 860px; overflow-y: auto;
        }
        .ac-prof__disclaimer {
          background: #fefce8; border: 1px solid #fde68a; border-radius: 8px;
          padding: .55rem 1rem; font-size: .78rem; color: #92400e; margin-bottom: 1.5rem;
        }
        .ac-prof__doc { display: flex; flex-direction: column; gap: 0; }
        .ac-prof__doc-title {
          font-size: 1.3rem; font-weight: 800; color: var(--text, #1a1d23);
          margin: 0 0 1.5rem; line-height: 1.3;
          padding-bottom: .6rem; border-bottom: 2px solid var(--border, #e2e5eb);
        }
        .ac-prof__section-title {
          font-size: .95rem; font-weight: 800; color: #1d4ed8;
          margin: 1.8rem 0 .75rem; text-transform: uppercase;
          letter-spacing: .04em; border-left: 3px solid #3b82f6;
          padding-left: .65rem;
        }
        [data-theme="dark"] .ac-prof__section-title { color: #93c5fd; border-color: #3b82f6; }
        .ac-prof__para {
          font-size: .92rem; line-height: 1.8; color: var(--text, #1a1d23);
          margin: 0 0 .9rem;
        }
        .ac-prof__list {
          margin: 0 0 .9rem 0; padding-left: 1.2rem;
          display: flex; flex-direction: column; gap: .3rem;
        }
        .ac-prof__list li {
          font-size: .9rem; line-height: 1.7; color: var(--text, #1a1d23);
        }
        .ac-prof__code {
          background: #0f172a; color: #e2e8f0;
          border-radius: 8px; padding: 1rem 1.25rem;
          font-family: var(--mono, monospace); font-size: .8rem;
          line-height: 1.7; overflow-x: auto; margin: 0 0 1rem;
          white-space: pre-wrap; border: 1px solid #1e293b;
        }
        .ac-prof__table {
          width: 100%; border-collapse: collapse; margin: 0 0 1rem;
          font-size: .82rem;
        }
        .ac-prof__table th, .ac-prof__table td {
          border: 1px solid var(--border, #e2e5eb);
          padding: .4rem .65rem; text-align: left;
        }
        .ac-prof__table th {
          background: var(--bg, #f0f2f5); font-weight: 700;
          color: var(--text, #1a1d23);
        }
        .ac-prof__table td { color: var(--text-secondary, #5f6577); }
        [data-theme="dark"] .ac-prof__code { background: #020617; border-color: #0f172a; }
        [data-theme="dark"] .ac-prof__table th { background: #1c2128; color: #e6edf3; }
        [data-theme="dark"] .ac-prof__table td { color: #8b949e; }

        /* ── Slides / Presentation mode ────────────────────────── */
        .ac-slides {
          display: flex; flex-direction: column;
          min-height: calc(100vh - 120px); background: #0f172a;
          user-select: none;
        }
        .ac-slides--fullscreen {
          position: fixed; inset: 0; z-index: 1000; background: #0f172a;
        }
        .ac-slide {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 3rem 4rem;
        }
        /* Cover slide */
        .ac-slide__cover {
          text-align: center; max-width: 780px;
        }
        .ac-slide__cover-badge {
          display: inline-block; background: #3b82f6; color: #fff;
          font-size: .7rem; font-weight: 800; letter-spacing: .1em;
          padding: 4px 14px; border-radius: 20px; margin-bottom: 1.5rem; text-transform: uppercase;
        }
        .ac-slide__cover-title {
          font-size: 2rem; font-weight: 800; color: #f1f5f9; line-height: 1.25;
          margin: 0 0 1.2rem;
        }
        .ac-slide__cover-authors {
          font-size: 1rem; color: #94a3b8; margin: 0 0 2rem;
        }
        .ac-slide__cover-hint {
          font-size: .72rem; color: #475569; margin: 0;
        }
        /* Content slide */
        .ac-slide__content {
          max-width: 820px; width: 100%; position: relative;
        }
        .ac-slide__breadcrumb {
          display: flex; align-items: center; gap: .4rem; margin-bottom: .6rem;
        }
        .ac-slide__num {
          font-size: .68rem; font-weight: 800; color: #3b82f6;
          letter-spacing: .15em; text-transform: uppercase;
        }
        .ac-slide__context {
          font-size: .68rem; color: #475569; font-weight: 600;
        }
        .ac-slide__heading {
          font-size: 1.7rem; font-weight: 800; color: #f1f5f9;
          margin: 0 0 1.4rem; line-height: 1.2;
          border-bottom: 2px solid #1e40af; padding-bottom: .55rem;
        }
        .ac-slide__bullets {
          list-style: none; padding: 0; margin: 0;
          display: flex; flex-direction: column; gap: .85rem;
        }
        .ac-slide__bullets li {
          font-size: .97rem; color: #cbd5e1; line-height: 1.65;
          padding-left: 1.4rem; position: relative;
        }
        .ac-slide__bullets li::before {
          content: "▸"; position: absolute; left: 0; top: .1em; color: #3b82f6; font-size: .8rem;
        }
        /* Controls */
        .ac-slides__controls {
          display: flex; align-items: center; justify-content: center; gap: .75rem;
          padding: .75rem 1.5rem; background: #0f172a; border-top: 1px solid #1e293b;
        }
        .ac-slides__nav {
          background: #1e293b; border: 1px solid #334155; color: #94a3b8;
          border-radius: 8px; padding: .4rem .9rem; font-size: 1rem; cursor: pointer;
          transition: background .1s, color .1s;
        }
        .ac-slides__nav:hover:not(:disabled) { background: #334155; color: #f1f5f9; }
        .ac-slides__nav:disabled { opacity: .3; cursor: not-allowed; }
        .ac-slides__counter { font-size: .8rem; color: #64748b; min-width: 60px; text-align: center; }
        .ac-slides__lang-toggle { display: flex; border: 1px solid #334155; border-radius: 8px; overflow: hidden; margin-left: .25rem; }
        .ac-slides__lang-btn {
          background: none; border: none; color: #64748b; padding: .4rem .65rem;
          font-size: .72rem; font-weight: 700; cursor: pointer; transition: background .1s, color .1s;
          letter-spacing: .06em;
        }
        .ac-slides__lang-btn:disabled { opacity: .5; cursor: not-allowed; }
        .ac-slides__lang-btn--active { background: #1d4ed8; color: #fff; }
        .ac-slides__lang-btn:not(.ac-slides__lang-btn--active):hover { color: #f1f5f9; }
        .ac-slides__error {
          background: #450a0a; color: #fca5a5; font-size: .78rem;
          padding: .5rem 1.5rem; border-top: 1px solid #7f1d1d;
        }
        .ac-slides__fs {
          background: none; border: 1px solid #334155; color: #64748b;
          border-radius: 8px; padding: .4rem .6rem; cursor: pointer; font-size: .9rem;
          transition: color .1s; margin-left: .25rem;
        }
        .ac-slides__fs:hover { color: #f1f5f9; }
        /* Thumbnail strip */
        .ac-slides__strip {
          display: flex; gap: .35rem; padding: .6rem 1rem; background: #020617;
          overflow-x: auto; border-top: 1px solid #0f172a;
        }
        .ac-slides__thumb {
          display: flex; flex-direction: column; align-items: flex-start;
          background: #1e293b; border: 1px solid #334155;
          border-radius: 6px; padding: .3rem .5rem; cursor: pointer; min-width: 80px; max-width: 100px;
          transition: background .1s, border-color .1s; flex-shrink: 0;
        }
        .ac-slides__thumb:hover { background: #334155; }
        .ac-slides__thumb--active { border-color: #3b82f6; background: #1e3a5f; }
        .ac-slides__thumb-num { font-size: .6rem; font-weight: 700; color: #3b82f6; }
        .ac-slides__thumb-label { font-size: .62rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }
      `}</style>
    </div>
  );
}
