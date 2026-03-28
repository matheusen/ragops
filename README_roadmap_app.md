# README — Plataforma de Roadmaps Inteligentes para Aprendizado, Ensino e Geração de Paper IEEE

## 1. Visão do produto

Este produto é uma plataforma para transformar **livros, artigos, referências técnicas e conhecimento apoiado por LLMs** em um **roadmap estruturado de aprendizado**, com foco em:

- estudo guiado passo a passo
- checklist real de domínio
- consulta e organização de referências
- visão didática para ensinar outras pessoas
- geração de artefatos acadêmicos, incluindo **paper no formato IEEE**

A proposta central não é apenas gerar mapas visuais de tópicos, mas criar um sistema que converta conhecimento disperso em uma **jornada ensinável, verificável e apresentável**.

---

## 2. Proposta de valor

A plataforma deve resolver um problema real:

> Hoje existem conteúdos demais, caminhos demais e pouca estrutura real para aprender com profundidade, ensinar com clareza e consolidar isso em entregáveis concretos.

O produto se diferencia por unir cinco capacidades em um mesmo fluxo:

1. **Curadoria de conhecimento**
2. **Sequenciamento de aprendizado**
3. **Acompanhamento de domínio**
4. **Modo de ensino e apresentação**
5. **Geração de paper/artigo estruturado**

---

## 3. Posicionamento

Em vez de ser visto apenas como “um roadmap com IA”, o produto pode ser posicionado como:

### Opção 1
**Sistema Operacional de Aprendizagem Estruturada**

### Opção 2
**Knowledge-to-Mastery Engine**

### Opção 3
**Plataforma de domínio progressivo baseada em referências e IA**

Esse posicionamento é mais forte porque comunica que o app:

- organiza o conhecimento
- estrutura a progressão
- ajuda a validar aprendizado
- permite ensinar
- gera material final de alto valor

---

## 4. Objetivo principal do sistema

Permitir que um usuário:

- escolha um tema
- alimente o sistema com livros, artigos e referências
- gere um roadmap estruturado
- siga uma trilha com checklist real
- consulte referências com contexto
- transforme esse roadmap em modo de ensino
- transforme o roadmap em um paper IEEE ou artigo técnico

---

## 5. Problema atual que o produto resolve

### Principais dores do usuário

- não saber por onde começar em um tema complexo
- ter muitas referências, mas sem organização pedagógica
- estudar sem saber se realmente dominou o conteúdo
- dificuldade de transformar estudo em explicação para terceiros
- dificuldade de consolidar conhecimento em artigo ou paper
- roadmaps bonitos visualmente, mas pouco úteis no uso real

---

## 6. Princípio central de design

A maior mudança de qualidade do produto deve ser esta:

## De: roadmap de tópicos  
## Para: roadmap de competências

Ou seja, o sistema não deve listar apenas assuntos como:

- Álgebra Linear
- Probabilidade
- Redes Neurais
- RAG

Ele deve estruturar o aprendizado como capacidades reais, por exemplo:

- representar dados em espaços vetoriais
- interpretar incerteza e inferência probabilística
- treinar e avaliar modelos preditivos
- projetar pipelines de recuperação com grounding e avaliação

Isso torna a plataforma muito mais útil, prática e profissional.

---

## 7. Os 3 modos principais do produto

# 7.1. Modo Aprender

Foco em quem quer estudar.

Cada nó do roadmap precisa ir além do título do tópico e conter estrutura de aprendizagem real.

### Estrutura recomendada de cada card/nó

- título do tema
- objetivo de aprendizado
- pré-requisitos
- dificuldade
- tempo estimado
- tipo do conteúdo
- referências principais
- exercícios
- checklist de domínio
- dúvidas comuns
- evidências de proficiência

### Exemplo de card

**Tópico:** Probabilidade Condicional

**Você deve sair sabendo:**
- calcular P(A|B)
- diferenciar independência de dependência
- aplicar teorema de Bayes em exemplos básicos

**Pré-requisitos:**
- conjuntos
- operações com eventos
- probabilidade básica

**Referências:**
- livro X capítulo 3
- paper Y seção 2
- nota explicativa Z

**Prática:**
- 5 exercícios
- 1 mini caso aplicado

**Checklist de domínio:**
- sei calcular probabilidade condicional
- sei explicar Bayes em linguagem simples
- sei resolver problema básico sem consulta

Essa estrutura torna o roadmap realmente útil no dia a dia.

---

# 7.2. Modo Ensinar

Foco em quem quer explicar o conteúdo para outra pessoa.

Esse modo deve converter o roadmap em uma estrutura pedagógica.

### O que o sistema deve gerar nesse modo

- sequência didática
- blocos de ensino
- explicações simplificadas
- analogias
- erros comuns
- perguntas para fixação
- exemplos graduais
- plano de aula ou roteiro de mentoria

### Organização ideal do roadmap no modo de ensino

Em vez de mostrar dezenas de cards ao mesmo tempo, o sistema deve agrupar o conteúdo em:

- fundamentos
- construção conceitual
- aplicação prática
- integração dos tópicos
- projeto final

### Para cada bloco didático

- o que ensinar primeiro
- o que costuma gerar confusão
- como introduzir o tema
- exemplos concretos
- perguntas de revisão
- conexão com o próximo bloco

Esse modo pode ser um dos maiores diferenciais do produto.

---

# 7.3. Modo Apresentar

Foco em mostrar o roadmap de forma clara para professor, líder, aluno, cliente ou equipe.

O usuário precisa de uma visualização elegante e narrativa, e não apenas do canvas completo.

### Botão estratégico
**Gerar visão de apresentação**

### O sistema deve gerar automaticamente

- título do roadmap
- objetivo
- público-alvo
- duração estimada
- fases principais
- principais entregáveis
- resultados esperados
- bibliografia-base

### Formatos de apresentação sugeridos

#### A. Story View
Apresenta como narrativa:
- por que esse roadmap existe
- onde a jornada começa
- como evolui
- onde chega

#### B. Timeline View
Mostra a trilha por fases em ordem linear.

#### C. Curriculum View
Mostra uma estrutura parecida com grade curricular.

#### D. Executive Summary
Mostra uma visão resumida para decisores.

---

## 8. Estrutura ideal de módulos do produto

# 8.1. Roadmap Builder

Responsável por criar, editar e estruturar o roadmap.

### Funções
- geração automática por tema
- ajuste manual
- agrupamento por fases
- reordenação de tópicos
- definição de dependências
- detecção de lacunas
- adaptação por perfil e prazo

---

# 8.2. Reference Graph

Responsável por organizar referências como base viva do roadmap.

### Funções
- vincular livros, artigos, notas e links
- mostrar por que cada referência entrou
- marcar referências como básicas, avançadas ou práticas
- conectar referências a tópicos do roadmap
- exibir trechos importantes
- permitir anotações ao estilo Heptabase

### Classificação recomendada de referências

Cada referência deve ter um papel claro:

- base conceitual
- aprofundamento
- referência prática
- leitura rápida
- paper seminal
- paper moderno
- crítica ou contraponto

### Metadados importantes
- dificuldade
- tempo estimado de leitura
- relevância no roadmap
- motivo da inclusão
- tópicos cobertos

---

# 8.3. Learning Tracker

Responsável por progresso e checklist.

### Funções
- checklist por fase
- checklist por nó
- status de domínio
- progresso geral
- revisão programada
- sugestão do próximo passo

### Status recomendados para cada item
- não iniciado
- estudando
- praticando
- revisando
- dominado
- ensinado a alguém

Esse último status é muito forte porque ensinar é uma evidência real de domínio.

---

# 8.4. Teaching Studio

Responsável por transformar o roadmap em experiência de ensino.

### Funções
- gerar sequência didática
- criar plano de aula
- gerar roteiro de mentoria
- explicar nó por nível de profundidade
- criar perguntas de revisão
- montar visão de apresentação

---

# 8.5. Paper Studio

Responsável por converter o roadmap em paper/artigo.

### Funções
- gerar outline
- estruturar seções
- mapear referências por seção
- gerar paper IEEE
- revisar coerência argumentativa
- detectar lacunas na fundamentação
- exportar PDF

### Fluxo ideal
1. definir escopo
2. mapear base bibliográfica
3. estruturar outline
4. gerar seções
5. revisar referências
6. exportar paper final

---

## 9. Visualizações essenciais

O produto precisa trabalhar com níveis de zoom semântico.

### Nível 1 — Macro
Mostra apenas:
- fases
- blocos principais
- jornada geral

### Nível 2 — Médio
Mostra:
- módulos
- submódulos
- conexões importantes

### Nível 3 — Micro
Mostra:
- cards individuais
- checklist detalhado
- referências
- exercícios
- evidências de domínio

Isso reduz a sobrecarga cognitiva e melhora muito a usabilidade.

---

## 10. Melhorias diretas na interface atual

Com base no conceito mostrado, estas são as melhorias mais importantes.

### 10.1. Reduzir densidade cognitiva
Não mostrar tudo ao mesmo tempo por padrão.  
A visualização completa do grafo deve existir, mas o modo padrão deve ser mais guiado.

### 10.2. Tornar o checklist mais inteligente
Além do checkbox, incluir:
- progresso por fase
- progresso por tipo
- bloqueios
- próximas recomendações
- revisão pendente

### 10.3. Diferenciar tipos de nós visualmente
Exemplos de tipos:
- conceito
- fundamento matemático
- exercício
- projeto
- paper
- revisão
- ferramenta
- estudo de caso

### 10.4. Melhorar os cards
Cada card deve abrir um painel lateral ou modal com:
- definição
- intuição
- aplicação
- exercício
- referência
- erros comuns
- notas pessoais
- conexões com outros nós

### 10.5. Criar uma visualização orientada a apresentação
O canvas completo é ótimo para exploração, mas não é o melhor modo para apresentar a alguém.

---

## 11. Funcionalidades que deixariam o produto realmente forte

# 11.1. Teach this Roadmap
Converte o roadmap em material de ensino.

### Saídas possíveis
- plano de aula
- roteiro de mentoria
- explicação simplificada
- trilha para onboarding
- material de apresentação

---

# 11.2. Explain this Node
Ao clicar em um nó, o sistema pode gerar:

- explicação para iniciante
- explicação técnica
- analogia
- caso real
- exemplo prático
- exemplo com código
- erros comuns
- resumo para revisão

---

# 11.3. Build Project from Roadmap
Com base no roadmap, o sistema sugere projetos práticos.

### Exemplos de saída
- projeto simples
- projeto intermediário
- projeto de portfólio
- projeto com arquitetura real
- capstone final

---

# 11.4. Show Learning Gaps
Sistema detecta:
- tópicos sem base consolidada
- excesso de teoria sem prática
- dependências ignoradas
- sobrecarga de conteúdo para o prazo disponível
- lacunas entre objetivo e trilha atual

---

# 11.5. Presentation Mode
Um dos recursos mais importantes.

### Objetivo
Permitir apresentar o roadmap com clareza e estética.

### Recursos
- destaque progressivo das fases
- zoom guiado
- narrativa lateral
- resumo por etapa
- fullscreen
- exportação para PDF
- exportação para slide
- versão compartilhável por link

---

## 12. Estrutura ideal da experiência de apresentação

Se o usuário quiser mostrar o roadmap para alguém, o sistema deve gerar uma sequência como esta:

### Tela 1 — Visão geral
- nome do roadmap
- objetivo
- público-alvo
- duração
- total de fases
- total de tópicos
- bibliografia-base

### Tela 2 — Jornada
- Fase 1: fundamentos
- Fase 2: construção conceitual
- Fase 3: prática
- Fase 4: integração
- Fase 5: especialização

### Tela 3 — Dependências
Mapa simplificado mostrando apenas as relações mais relevantes.

### Tela 4 — Exemplo de aprofundamento
Mostra um card detalhado com:
- conceito
- referência
- exercício
- checklist
- resultado esperado

### Tela 5 — Resultado final
- o que o aluno saberá fazer
- quais projetos conseguirá construir
- qual paper/artigo poderá gerar
- próximos passos possíveis

Essa estrutura é muito mais convincente do que abrir diretamente um grafo gigante.

---

## 13. Fluxos reais de uso

# 13.1. Fluxo: aprender um tema do zero

### Exemplo
“Quero aprender IA aplicada a engenharia de software.”

### O sistema deve:
- perguntar objetivo
- perguntar nível atual
- perguntar tempo disponível
- perguntar foco desejado
- gerar trilha personalizada
- sugerir ritmo semanal
- acompanhar evolução

---

# 13.2. Fluxo: ensinar alguém

### Exemplo
“Quero ensinar fundamentos de IA para um engenheiro backend.”

### O sistema deve:
- reorganizar o roadmap em sequência didática
- simplificar blocos
- gerar exemplos
- sugerir analogias
- gerar plano de aula
- montar apresentação

---

# 13.3. Fluxo: produzir paper

### Exemplo
“Quero transformar esse roadmap em um paper IEEE.”

### O sistema deve:
- mapear o escopo
- agrupar referências
- estruturar outline
- gerar seções
- revisar coesão
- exportar PDF em formato IEEE

---

## 14. Recursos premium ou avançados

- geração de roadmap por objetivo e prazo
- múltiplos níveis de profundidade
- comparação entre dois roadmaps
- importação de bibliografia própria
- notas interligadas estilo Heptabase
- geração automática de quizzes
- flashcards automáticos
- detecção de redundância entre referências
- heatmap de cobertura de conhecimento
- ranking de referências por impacto didático
- exportação para PDF, slides e web page pública
- compartilhamento de “teaching boards”

---

## 15. Níveis de profundidade do roadmap

Cada tema pode ser oferecido em pelo menos três níveis:

### Essencial
Para quem quer base sólida e visão prática.

### Profissional
Para quem precisa aplicar em contexto real de trabalho.

### Especialista
Para quem quer pesquisa, arquitetura avançada e produção de conteúdo profundo.

Isso aumenta muito a utilidade do produto.

---

## 16. Modelo de dados conceitual sugerido

### Entidades principais

#### Roadmap
- id
- título
- descrição
- objetivo
- público-alvo
- nível
- duração estimada

#### Fase
- id
- roadmapId
- título
- descrição
- ordem

#### Node
- id
- faseId
- título
- tipo
- objetivo
- dificuldade
- tempo estimado
- status
- evidência de domínio

#### Dependency
- sourceNodeId
- targetNodeId
- tipo da dependência

#### Reference
- id
- título
- tipo
- autor
- ano
- dificuldade
- motivo da inclusão

#### NodeReference
- nodeId
- referenceId
- papel da referência naquele nó

#### ChecklistItem
- id
- nodeId
- descrição
- concluído
- tipo

#### Note
- id
- nodeId
- conteúdo
- tags

#### PaperDraft
- id
- roadmapId
- título
- idioma
- seções
- referências associadas

---

## 17. Heurísticas de UX importantes

- mostrar primeiro o essencial, depois o detalhe
- evitar telas super densas como padrão
- manter consistência visual entre roadmap, checklist e referências
- permitir foco em um subconjunto do mapa
- sempre responder “o que estudar agora?”
- sempre responder “por que esse tópico vem antes?”
- sempre responder “como provar que aprendi isso?”

---

## 18. Ideia de discurso para apresentar o produto

Você pode apresentar a solução assim:

> Esta plataforma organiza livros, artigos e conhecimento apoiado por LLMs em uma jornada estruturada de aprendizado. Em vez de apenas listar assuntos, ela constrói competências progressivas, conecta referências a objetivos reais, acompanha domínio por checklist e ainda transforma o conhecimento em material de ensino e paper IEEE.

Uma versão mais curta:

> O produto transforma conhecimento disperso em aprendizado estruturado, ensinável e apresentável.

---

## 19. Roadmap de evolução do produto

### Fase 1 — Base funcional
- gerar roadmap
- editar nós
- checklist
- referências por nó
- visualização em grafo

### Fase 2 — Inteligência pedagógica
- objetivos por nó
- pré-requisitos
- níveis de profundidade
- detecção de gaps
- sequência didática

### Fase 3 — Teaching Mode
- plano de aula
- modo apresentação
- visão executiva
- explicações por perfil

### Fase 4 — Paper Studio
- outline automático
- seções IEEE
- referências por seção
- export PDF

### Fase 5 — Diferenciais fortes
- notas conectadas
- quizzes
- flashcards
- capstone project
- compartilhamento público

---

## 20. Conclusão

O maior potencial do app está em unir:

- roadmap visual
- checklist de domínio
- curadoria de referências
- modo de ensino
- geração de paper

O produto fica realmente forte quando deixa de ser apenas um mapa bonito e passa a ser uma **plataforma de progressão de domínio**.

Esse é o ponto que pode fazer ele ser:
- útil de verdade
- bom para aprender
- bom para ensinar
- bom para apresentar
- bom para transformar conhecimento em produção real

---

## 21. Próximos passos recomendados

### Prioridade alta
1. criar o modo apresentação
2. enriquecer os cards com objetivo, prática e checklist
3. tornar o checklist mais inteligente
4. classificar referências por papel
5. criar modo ensinar

### Prioridade média
6. detector de gaps
7. níveis de profundidade
8. project builder
9. notas conectadas

### Prioridade avançada
10. paper studio completo
11. exportação para slides
12. visão pública compartilhável

---

## 22. Nome de possíveis modos do produto

### Para a visão de ensino
- Teaching View
- Curriculum View
- Explain Mode
- Lecture Mode

### Para a visão de apresentação
- Presentation View
- Story Mode
- Learning Journey
- Mastery Map

### Para a proposta geral do produto
- Knowledge Canvas
- Competency Atlas
- Scholar Board
- Mastery Engine

---

## 23. Resumo final em uma frase

> Uma plataforma para transformar referências e conhecimento apoiado por IA em trilhas estruturadas de aprendizado, ensino e produção acadêmica.

