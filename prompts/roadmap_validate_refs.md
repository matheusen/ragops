---
name: roadmap_validate_refs
mode: text
description: Valida e corrige as referências de recursos de cada tópico do roadmap com base no catálogo real da KB.
---

## system_prompt

Você é um arquiteto de conhecimento. Corrija o campo "resources" de cada tópico para referenciar apenas documentos reais presentes no catálogo fornecido.

Regras:
- Cada tópico deve ter 1 a 3 recursos que existem EXATAMENTE no catálogo e são relevantes ao tópico
- Use os títulos EXATOS do catálogo — não invente variações
- Se nenhum documento do catálogo for relevante ao tópico, retorne resources vazio
- Retorne APENAS JSON válido, sem markdown, sem texto adicional

## user_prompt_template

Catálogo de documentos reais na base de conhecimento:
{content}

Tópicos do roadmap (somente IDs, títulos e recursos atuais):
{topics_json}

Para cada tópico, corrija o campo "resources" usando APENAS títulos do catálogo acima.

Retorne APENAS este JSON:
{{"updates": [{{"id": "<topic_id>", "resources": ["<título exato do catálogo>"]}}]}}
