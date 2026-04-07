# RAG Types Demo

Mini laboratorio para demonstrar, com o mesmo corpus e as mesmas perguntas, como quatro abordagens se comportam de forma diferente:

- `semantic_only`
- `graph_only`
- `hybrid_retrieval`
- `hybrid_graphrag`

O objetivo deste exemplo nao e reproduzir todo o runtime principal do repo. O objetivo e dar ao time uma demo curta e executavel que deixe clara a tese dos dois artigos analisados:

> o naive RAG enfraqueceu, mas retrieval com grounding continua central quando a aplicacao precisa sintetizar, explicar e justificar.

---

## O que esta incluso

- [corpus.json](corpus.json): corpus pequeno com documentos, entidades e arestas de grafo
- [rag_modes_demo.py](rag_modes_demo.py): script que roda os quatro modos sobre os mesmos cenarios

O corpus simula um problema de cobranca duplicada com:

- issue principal
- runbook
- changelog
- nota de arquitetura
- template de resposta para suporte
- um documento nao relacionado para mostrar ruido

---

## Como rodar

Da raiz do repo:

```powershell
python examples/rag_types_demo/rag_modes_demo.py
```

Para rodar um unico cenario:

```powershell
python examples/rag_types_demo/rag_modes_demo.py --scenario chain
python examples/rag_types_demo/rag_modes_demo.py --scenario support
python examples/rag_types_demo/rag_modes_demo.py --scenario similarity
```

---

## O que cada modo representa

### `semantic_only`

Simula um retriever orientado por similaridade textual / embeddings.

Bom para:

- encontrar materiais parecidos
- recuperar documentos proximos semanticamente

Fraco para:

- explicitar cadeia causal
- multi-hop
- transformar retrieval em resposta final

### `graph_only`

Simula um retriever relacional, orientado a entidades e arestas.

Bom para:

- seguir relacoes explicitas
- montar cadeias entre issue, componente e servico

Fraco para:

- perguntas sem entidade explicita
- texto livre
- sintese final para usuario

### `hybrid_retrieval`

Combina sinais semanticos, grafo e matching exato simples.

Bom para:

- melhorar cobertura
- reduzir pontos cegos de um unico modo de retrieval

Fraco para:

- ainda nao entregar resposta final pronta

### `hybrid_graphrag`

Usa o retrieval hibrido anterior e adiciona uma camada final de resposta grounded.

Bom para:

- mostrar por que retrieval e generation nao competem no mesmo nivel
- transformar evidencias em resposta operacional

---

## Cenarios incluidos

### `similarity`

Pergunta:

`Quais incidentes e documentos sao mais parecidos com um problema de cobranca duplicada apos retry?`

Licao esperada:

- semantic search vai bem
- graph only tende a ir mal porque a pergunta nao ancora em uma entidade explicita

### `chain`

Pergunta:

`Que cadeia conecta INC-481 ao servico impactado e ao componente suspeito?`

Licao esperada:

- graph retrieval vai melhor do que semantic search
- hybrid melhora cobertura
- GraphRAG transforma caminho em explicacao

### `support`

Pergunta:

`Qual resposta devo dar ao time de suporte sobre o problema de cobranca duplicada?`

Licao esperada:

- retrieval puro devolve materia-prima
- GraphRAG devolve uma resposta operacional grounded

---

## Como usar isso na apresentacao

O melhor jeito de apresentar essa demo e manter a mesma pergunta e alternar o modo de retrieval/resposta.

Sequencia recomendada:

1. rode `semantic_only`
2. mostre que ele acha coisas parecidas, mas nao fecha a cadeia nem a resposta final
3. rode `graph_only`
4. mostre que ele encontra ligacoes, mas nao cobre bem texto livre e sintese
5. rode `hybrid_retrieval`
6. mostre que cobertura e precisao melhoram
7. rode `hybrid_graphrag`
8. mostre que o salto final nao e de retrieval, e sim de transformar evidence retrieval em resposta grounded

---

## Tese didatica

Se o time sair da demo com uma unica frase, a frase correta e:

> Semantic search encontra semelhanca. Graph retrieval encontra relacoes. Hybrid retrieval melhora a cobertura. GraphRAG transforma tudo isso em uma resposta utilizavel.

---

## Relacao com os dois artigos analisados

Este exemplo foi desenhado para materializar duas teses:

1. **Is RAG Dead?**
   - naive RAG enfraqueceu
   - semantic layers, knowledge graphs e governanca de contexto ganham importancia

2. **Context Engineering**
   - retrieval e apenas uma parte do problema maior de selecionar, comprimir e isolar contexto ao longo da trajetoria de um agente

Por isso o exemplo nao compara apenas `RAG vs nao RAG`.
Ele compara tipos de retrieval e mostra onde a camada de generation grounded ainda agrega valor real.