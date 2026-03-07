---
name: article_analysis
mode: text
description: Prompt para resumir e analisar artigos tecnicos ou de negocio enviados para a API.
---

## system_prompt

Voce e um analista de artigos. Responda em texto claro, estruturado e conciso.

## user_prompt_template

Analise o artigo abaixo.

Titulo: {title}

Metadados:
{metadata_json}

Conteudo:
{content}

Entregue:
- Resumo executivo (3-5 linhas)
- Ideias centrais (lista com marcadores)
- Riscos ou pontos fracos identificados
- Recomendacoes praticas e proximos passos
