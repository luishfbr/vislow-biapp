# Vislow — Especificação de Engenharia do MVP
### Plataforma Low-Code para Geração de Visuais Customizados do Power BI

| | |
|---|---|
| **Documento** | Especificação de Produto e Arquitetura — MVP |
| **Versão** | 2.0 |
| **Data** | 2026-07-29 |
| **Status** | Aprovado para implementação |
| **Repositório** | `vislow-biapp` |

> **Sobre esta versão.** A v1.0 deste documento era um rascunho de arquitetura. A revisão de engenharia
> identificou três defeitos que invalidavam parte do desenho (leitura de `config.json` em runtime, colisão de
> GUID entre visuais gerados, e classes Tailwind cruas num runtime pré-compilado). Esta versão corrige os três,
> adiciona requisitos rastreáveis, regras de negócio, riscos e estratégia de qualidade, e passa a ser a **fonte
> única da verdade** do MVP. O histórico de mudanças está no [Anexo A](#anexo-a--histórico-de-decisões-e-correções).

---

## Sumário

1. [Contexto e Visão do Produto](#1-contexto-e-visão-do-produto)
2. [Objetivos e Métricas de Sucesso](#2-objetivos-e-métricas-de-sucesso)
3. [Arquitetura](#3-arquitetura)
4. [Requisitos Funcionais](#4-requisitos-funcionais)
5. [Requisitos Não Funcionais](#5-requisitos-não-funcionais)
6. [Regras de Negócio](#6-regras-de-negócio)
7. [Contrato de Configuração (JSON Schema)](#7-contrato-de-configuração-json-schema)
8. [Especificação do Pacote e do Algoritmo de Export](#8-especificação-do-pacote-e-do-algoritmo-de-export)
9. [Especificação do Runtime Core](#9-especificação-do-runtime-core)
10. [Especificação do Aplicativo Web](#10-especificação-do-aplicativo-web)
11. [Estrutura do Repositório](#11-estrutura-do-repositório)
12. [Estratégia de Qualidade](#12-estratégia-de-qualidade)
13. [Segurança e Privacidade](#13-segurança-e-privacidade)
14. [Riscos e Mitigações](#14-riscos-e-mitigações)
15. [Roadmap de Execução](#15-roadmap-de-execução)
16. [Pós-MVP](#16-pós-mvp)
17. [Glossário](#17-glossário)
- [Anexo A — Histórico de Decisões e Correções](#anexo-a--histórico-de-decisões-e-correções)

---

## 1. Contexto e Visão do Produto

### 1.1 Problema

Criar um visual customizado para o Power BI exige hoje: instalar Node.js, instalar a CLI `pbiviz`, gerar e
confiar num certificado local, escrever TypeScript e React, entender o modelo de `DataView` da API de visuais e
compilar o pacote. É uma barreira de horas ou dias para um analista de BI — perfil que representa a maioria de
quem *quer* um visual diferente e a minoria de quem consegue produzi-lo.

O resultado prático é que relatórios ficam presos à biblioteca nativa do Power BI, e visuais de terceiros do
AppSource raramente atendem à identidade visual da empresa.

### 1.2 Proposta de Valor

O Vislow entrega, em minutos e sem instalar nada, um arquivo `.pbiviz` **real e funcional** — importável no
Power BI Desktop, que lê os dados do modelo e se comporta como qualquer outro visual (cross-filter, tooltip,
redimensionamento). O usuário customiza a aparência numa interface visual; a plataforma monta o pacote.

### 1.3 Personas

| ID | Persona | Contexto | Necessidade principal |
|---|---|---|---|
| P-01 | **Analista de BI** (persona primária) | Constrói relatórios diariamente. Não programa. Frequentemente sem permissão de admin na máquina. | Um visual com a cara da empresa, sem depender de TI ou de dev. |
| P-02 | **Desenvolvedor de BI** | Conhece `pbiviz`. Já criou visuais. | Acelerar o trabalho repetitivo de estilização; partir de uma base pronta. |
| P-03 | **Designer / Time de Marca** | Dono do design system. Não usa Power BI. | Garantir que os relatórios respeitem cor, tipografia e espaçamento da marca. |

### 1.4 Fora de Escopo do MVP

Registrado explicitamente para evitar expansão silenciosa de escopo:

- Autenticação, contas de usuário e colaboração multiusuário.
- Qualquer backend ou banco de dados. O MVP é inteiramente client-side.
- Publicação no AppSource ou marketplace próprio.
- Editor de código livre (Monaco), CSS arbitrário ou JavaScript do usuário.
- Galeria de templates prontos.
- Importação de temas corporativos do Power BI (`.json` de tema).
- Tipos de visual além de **Barras** e **KPI Card**.
- Localização da interface (o MVP é somente em português).

### 1.5 Premissa de Fronteira do Produto

> Decisão de produto tomada em 2026-07-29, após a validação do gate.

**A responsabilidade do Vislow termina na entrega de um `.pbiviz` válido e funcional.**

O que acontece depois — se o administrador do Power BI permite importar visuais de arquivo naquele tenant — é
configuração do ambiente do usuário, não do produto. Nenhuma decisão de arquitetura, nenhuma linha de código e
nenhum modo de export nosso altera esse resultado; nem mesmo um backend com `pbiviz package` mudaria algo, já
que a política avalia o *tipo* de visual, não como ele foi produzido.

Consequências práticas:

- O pré-requisito é **informado** ao usuário no momento do download ([RF-13](#44-export-do-pacote)), como
  cortesia e para reduzir suporte — não como mitigação, porque não há o que mitigar.
- A métrica [M-02](#22-métricas-de-sucesso) mede o ciclo **em ambientes onde a importação é permitida**. Bloqueio
  por política não conta como falha do produto.
- Isso **não** é desculpa para falha nossa: um `.pbiviz` que o Power BI recusa por estar malformado é defeito de
  severidade máxima e continua coberto por [T-03…T-08](#123-testes-de-empacotamento) e
  [MT-01](#124-matriz-de-teste-manual-no-power-bi). A fronteira separa o pacote *inválido* (nosso) do ambiente
  *restrito* (do usuário).

Validado empiricamente: o pacote gerado importa e renderiza no Power BI Desktop.

---

## 2. Objetivos e Métricas de Sucesso

### 2.1 Objetivo do MVP

Validar, com usuários reais, que **um analista de BI sem ambiente de desenvolvimento consegue produzir e usar um
visual customizado funcional no Power BI Desktop**, e que a arquitetura de runtime pré-compilado + configuração
embutida sustenta esse fluxo sem infraestrutura de servidor.

### 2.2 Métricas de Sucesso

O MVP é considerado bem-sucedido se, com um piloto de **5 usuários do perfil P-01**:

| ID | Métrica | Meta |
|---|---|---|
| M-01 | Tempo do primeiro acesso até o visual renderizando no Power BI Desktop, sem ajuda | < 10 min (mediana) |
| M-02 | Taxa de sucesso do ciclo export → import → renderização, **em ambientes onde a importação de visuais de arquivo é permitida** ([1.5](#15-premissa-de-fronteira-do-produto)) | ≥ 95% das tentativas |
| M-03 | Ocorrências de tela branca / visual quebrado no Power BI | 0 |
| M-04 | Usuários que declaram que usariam o visual gerado em um relatório real | ≥ 4 de 5 |
| M-05 | Divergência visual percebida entre o preview e o resultado no Power BI | Nenhuma reportada como bloqueante |

M-01 e M-02 são as métricas de decisão. M-03 é critério de qualidade não negociável (ver [RN-04](#6-regras-de-negócio)).

---

## 3. Arquitetura

### 3.1 O que "build" significa neste projeto

Este é o ponto mais importante do documento e a origem da maior confusão possível sobre o produto.

O `.pbiviz` entregue ao usuário é **um visual do Power BI real e compilado** — não uma simulação, não um mockup,
não um preview exportado. Concretamente:

- O `base-runtime.pbiviz` é produzido pela **CLI oficial `pbiviz` da Microsoft**, com compilação TypeScript e
  bundle webpack reais, exatamente como qualquer visual customizado publicado no AppSource.
- O export do aplicativo web **não compila nada**. Ele abre esse pacote já compilado, substitui um literal de
  string dentro do JavaScript e reescreve a identidade do pacote (GUID e nome).
- O arquivo resultante importa normalmente no Power BI Desktop, lê `DataViews` reais do modelo do usuário, faz
  cross-filter real, exibe tooltip nativo e responde a redimensionamento.

A diferença em relação a um backend que rodasse `pbiviz package` por usuário **não é "real vs. falso"** — é
apenas *onde* a compilação acontece: uma vez, na nossa esteira de CI, em vez de uma vez por export.

**O limite honesto dessa escolha:** o usuário escolhe entre os tipos de visual que o Runtime Core já sabe
renderizar. Um tipo novo (rosca, mapa de calor) é um release nosso do runtime, não algo que o usuário produz
sozinho. Esse limite é o preço de não ter servidor, fila, sandbox de execução e 30–60s de latência por export.

✅ **Esta seção deixou de ser argumento e passou a ser fato em 2026-07-29.** O [gate da Fase 1](#15-roadmap-de-execução)
foi executado e aprovado: dois pacotes gerados por patch foram importados no Power BI Desktop, cada um exibindo
a própria configuração, coexistindo no mesmo relatório. Detalhes no [Anexo A.4](#a4-achados-do-spike-de-validação-2026-07-29).

### 3.2 Princípio: Runtime Core + Configuração Embutida

Em vez de gerar código novo a cada visual, existe **um** visual pré-compilado — o *Runtime Core* — que sabe
renderizar um conjunto de tipos e é parametrizado por um documento JSON de configuração.

- **Aplicativo Web (editor):** produz e valida uma especificação declarativa em JSON.
- **Runtime Core (dentro do Power BI):** lê essa especificação e a combina com os dados do modelo para renderizar.

### 3.3 Fluxo de Funcionamento

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      APLICATIVO WEB (EDITOR LOW-CODE)                     │
│                                                                           │
│   [Painel de Controles]  ──▶  [Estado Zustand]  ──▶  [Preview ao vivo]    │
│    tokens de estilo,             VisualConfig          renderizado pelo   │
│    título, rótulos                (validado)           MESMO visual-kit   │
│                                       │                                   │
│                                       ▼                                   │
│                            VisualConfig (JSON)                            │
└───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  base64 ──▶ patch no bundle (JSZip, no browser)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         PACOTE .pbiviz GERADO                             │
│                                                                           │
│   package.json                       ◀── GUID, nome e versão reescritos   │
│   assets/icon.png                                                         │
│   resources/{novoGuid}.pbiviz.json   ◀── arquivo RENOMEADO                │
│       ├── visual { guid, name, displayName, version }  ◀── reescritos     │
│       ├── capabilities { ... }                                            │
│       └── content                                                         │
│             ├── js   ◀── placeholder da config substituído + GUID trocado │
│             ├── css                                                       │
│             └── iconBase64                                                │
└───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  "Importar visual de um arquivo"
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                            POWER BI DESKTOP                               │
│                                                                           │
│   1. Runtime Core inicializa e decodifica a config embutida               │
│   2. Recebe update(options) com o DataView do modelo do usuário           │
│   3. Mapeia tokens ▶ classes/estilos e DataView ▶ view model              │
│   4. Renderiza a árvore React dentro do iframe sandbox                    │
└───────────────────────────────────────────────────────────────────────────┘
```

> **Correção em relação à v1.0.** O diagrama anterior mostrava um `config.json` avulso dentro do pacote, lido
> pelo runtime em tempo de execução. **Isso é impossível** — ver [3.4](#34-restrições-impostas-pelo-ambiente-do-power-bi).

### 3.4 Restrições Impostas pelo Ambiente do Power BI

Todo o desenho decorre destas restrições, verificadas na documentação da Microsoft:

| ID | Restrição | Consequência de projeto |
|---|---|---|
| C-01 | Visuais rodam em `<iframe sandbox="allow-scripts">` **sem domínio de origem**. | Sem `fetch` de caminho relativo, sem `localStorage`, sem acesso a arquivos do próprio pacote. A config **tem** de estar dentro do JavaScript. |
| C-02 | Apenas `content.js`, `content.css` e `content.iconBase64` (strings dentro de `resources/{guid}.pbiviz.json`) chegam ao runtime. Outros arquivos do zip são ignorados. | Não existe "arquivo de configuração" no pacote. |
| C-03 | O **GUID é a identidade** do visual. Dois pacotes com o mesmo GUID são o mesmo visual; o segundo import sobrescreve o primeiro. | Cada export precisa de GUID e nome únicos ([RN-01](#6-regras-de-negócio)). |
| C-04 | O pacote `.pbiviz` tem limite rígido de **2 MB**. | Orçamento de bundle verificado em CI ([RNF-05](#5-requisitos-não-funcionais)). |
| C-05 | Importar visual de arquivo exige a política de tenant de visuais do SDK habilitada. | Pré-requisito documentado e validado com usuário real na semana 1 ([R-04](#14-riscos-e-mitigações)). |
| C-06 | O único canal de dados é `update(options)`, com `dataViews` e `dataViewMappings` declarados em `capabilities.json`. | O app web **não tem acesso ao modelo** do usuário e não pode mapear campos ([RN-02](#6-regras-de-negócio)). |
| C-07 | Tailwind CSS purga classes ausentes do código-fonte em tempo de build. | Nenhuma classe pode ser escolhida depois da compilação ([ADR-02](#35-decisões-de-arquitetura-adr)). |

### 3.5 Decisões de Arquitetura (ADR)

| ADR | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| **ADR-01** | Config embutida via substituição de um placeholder base64 dentro de `content.js`, no browser. | Único caminho compatível com C-01/C-02 sem servidor. Export em segundos. | `resources/config.json` (impossível). Backend rodando `pbiviz package` (infra, fila, 30–60s, sandbox de execução). |
| **ADR-02** | O config descreve **design tokens semânticos**; o runtime mapeia token → classe/estilo. | Resolve C-07 por construção: todas as classes existem literalmente no código do runtime. Schema estável e validável por enum. | Classes Tailwind cruas + safelist compartilhada — frágil, falha em silêncio, acopla o schema ao Tailwind. |
| **ADR-03** | GUID, nome e `displayName` reescritos a cada export. | Sem isso, C-03 faz cada visual novo sobrescrever o anterior. | GUID fixo — quebra no primeiro uso real. |
| **ADR-04** | Um pacote `visual-kit` com os componentes React, consumido tanto pelo runtime quanto pelo preview web. | Garante WYSIWYG por construção: preview e visual final são o mesmo componente. | Componentes duplicados — divergem em semanas. |
| **ADR-05** | Zero backend no MVP. | Custo zero, sem superfície de ataque, sem dados do usuário em trânsito. | API de build. |
| **ADR-06** | ~~Tailwind v3.4~~ → **Tailwind v4.3**, com o CSS **pré-compilado pelo CLI** e importado como CSS puro pelo runtime. | **Revisado em 2026-07-29 após validação empírica.** A v4 funciona: `prefix(pbi)` gera `pbi:flex` e o preflight sai importando só as camadas `theme` e `utilities`. Decisivo: o `pbiviz` **não traz PostCSS** (só `less-loader`/`css-loader`), então pré-compilar dispensa plugar Tailwind no webpack dele — e isso valeria para a v3 também. | Tailwind v3.4 (motivo original do ADR já não se sustenta); PostCSS dentro do webpack do `pbiviz`. |
| **ADR-07** | Config transportada em **base64** dentro do literal de string. | Elimina qualquer problema de escaping de aspas, quebras de linha e barras invertidas ao injetar em JS minificado. | JSON cru no literal — quebra com aspas no título do usuário. |

---

## 4. Requisitos Funcionais

Convenção: cada requisito tem um critério de aceite verificável. `[P0]` = obrigatório no MVP.

### 4.1 Editor

**RF-01 `[P0]` — Seleção do tipo de visual**
O usuário escolhe entre **Barras** e **KPI Card**.
*Dado* o editor aberto, *quando* o usuário troca o tipo, *então* o preview passa a renderizar o novo tipo em
menos de 100 ms e os controles do painel se ajustam ao conjunto de tokens daquele tipo, preservando os tokens
comuns (cor de destaque, superfície, espaçamento, raio, tipografia).

**RF-02 `[P0]` — Customização por tokens de estilo**
Controles para: cor de destaque, cor de superfície, cor de texto, espaçamento, raio de borda, escala
tipográfica, peso de fonte, alinhamento, sombra, borda, exibição de linhas de grade e exibição de rótulos de
valor.
*Dado* qualquer controle, *quando* alterado, *então* o `VisualConfig` no estado é atualizado, revalidado contra
o schema e o preview reflete a mudança — sem recarregar a página.

**RF-03 `[P0]` — Título e rótulos**
Editar o texto do título, alternar sua exibição e definir seu alinhamento.
*Dado* um título com aspas, acentos ou emoji, *quando* exportado, *então* o texto aparece íntegro no Power BI
(cobre o risco de escaping, mitigado por ADR-07).

**RF-04 `[P0]` — Nomear o projeto**
O nome do visual é obrigatório e origina o nome do arquivo, o `displayName` no Power BI e o slug do GUID.
*Dado* um nome fora de 3–50 caracteres, *quando* o usuário tenta exportar, *então* o export é bloqueado com
mensagem explicando a regra ([RN-06](#6-regras-de-negócio)).

### 4.2 Preview

**RF-05 `[P0]` — Preview fiel ao resultado final**
O preview renderiza usando os **mesmos componentes** do `visual-kit` que o runtime usa ([ADR-04](#35-decisões-de-arquitetura-adr)).
*Dado* uma config qualquer, *quando* comparados preview e visual importado no Power BI com os mesmos dados,
*então* a renderização é visualmente idêntica salvo pelos dados.

**RF-06 `[P0]` — Dados de exemplo**
O preview usa um dataset mock fixo e realista (categorias com nomes longos e curtos, valores negativos, zero e
ordens de grandeza diferentes).
*Dado* o preview, *quando* renderizado, *então* nenhum dado do modelo do usuário é envolvido ([RN-02](#6-regras-de-negócio)).

**RF-07 `[P1]` — Simulação de dimensões**
Alternar o preview entre proporções comuns de visual no canvas do Power BI.

### 4.3 Projeto

**RF-08 `[P0]` — Persistência local**
O projeto em edição é salvo automaticamente em `localStorage` e restaurado ao reabrir a aba.

**RF-09 `[P0]` — Exportar e importar a configuração**
Baixar o `VisualConfig` como `.json` e carregá-lo de volta.
*Dado* um config exportado, *quando* reimportado, *então* o editor volta ao estado exato — incluindo a
identidade do projeto ([RN-01](#6-regras-de-negócio)).

**RF-10 `[P1]` — Reexportar mantendo identidade**
Reexportar um projeto já exportado reusa o mesmo GUID e incrementa a versão, de modo que o import no Power BI
**atualiza** o visual existente em vez de duplicá-lo.

### 4.4 Export do Pacote

**RF-11 `[P0]` — Gerar o arquivo `.pbiviz`**
*Dado* um config válido, *quando* o usuário clica em "Baixar .pbiviz", *então* o download inicia em menos de
3 segundos com um pacote válido, de identidade única, importável no Power BI Desktop.

**RF-12 `[P0]` — Bloqueio por validação**
*Dado* um config que falha na validação do JSON Schema, *quando* o usuário tenta exportar, *então* o export é
impedido e os campos inválidos são apontados na interface ([RN-03](#6-regras-de-negócio)).

**RF-13 `[P0]` — Instruções de importação**
Após o download, exibir o passo a passo de importação no Power BI Desktop e o aviso sobre o pré-requisito de
política de tenant ([C-05](#34-restrições-impostas-pelo-ambiente-do-power-bi)).

### 4.5 Runtime Core

**RF-14 `[P0]` — Carregar a configuração embutida**
Na inicialização, o runtime decodifica a config do placeholder base64 e a valida.
*Dado* uma config ausente, corrompida ou inválida, *quando* o visual inicializa, *então* ele renderiza um card
de erro legível com um código de diagnóstico — nunca uma tela branca ([RN-04](#6-regras-de-negócio)).

**RF-15 `[P0]` — Renderizar Gráfico de Barras**
Barras verticais a partir das roles `Category` e `Measure`, com os tokens aplicados.

**RF-16 `[P0]` — Renderizar KPI Card**
Valor principal formatado, rótulo e, quando a role opcional de comparação estiver preenchida, variação absoluta
e percentual com indicação de direção.

**RF-17 `[P0]` — Formatação numérica correta**
Números formatados via `valueFormatter` dos utilitários oficiais, respeitando o `format` da medida no modelo e o
`host.locale`.
*Dado* uma medida formatada como moeda em pt-BR, *quando* renderizada, *então* aparece como `R$ 1.234,57` — não
como `1234.5678`.

**RF-18 `[P0]` — Cross-filter (seleção)**
Clicar em uma barra filtra os demais visuais do relatório; `Ctrl`+clique acumula seleção; clicar fora limpa.
Itens não selecionados recebem esmaecimento. O estado de seleção sobrevive a atualizações vindas de outros
visuais (`registerOnSelectCallback`).

**RF-19 `[P0]` — Tooltip nativo**
Ao passar o mouse, exibir o tooltip do Power BI com categoria e valor formatado.

**RF-20 `[P0]` — Estado vazio**
Quando as roles obrigatórias não estão preenchidas, exibir uma orientação de quais campos arrastar — não um
gráfico vazio nem um erro.

**RF-21 `[P0]` — Modo de alto contraste**
Respeitar `host.colorPalette.isHighContrast`, usando `foreground`, `background` e `foregroundSelected` no lugar
dos tokens de cor da config.

**RF-22 `[P0]` — Responsividade**
Reagir a `update` de redimensionamento sem recriar a árvore React, com rótulos degradando graciosamente (elipse,
rotação ou omissão) em larguras pequenas.

**RF-23 `[P1]` — Navegação por teclado**
`Tab` entra no gráfico, setas navegam entre itens, `Enter`/`Espaço` seleciona, com indicador de foco visível.

**RF-24 `[P1]` — Menu de contexto**
Clique com o botão direito abre o menu de contexto nativo do Power BI (drill, exportar dados).

**RF-25 `[P0]` — Aviso de truncamento**
Quando o `dataReductionAlgorithm` truncar o conjunto, exibir aviso discreto de que nem todas as categorias estão
representadas ([RN-10](#6-regras-de-negócio)).

### 4.6 Correção de Escopo Herdada da v1.0

A v1.0 previa um bloco `bindings` no config e um painel "Mapeamento de Campos (Roles)" na barra lateral do
editor. **Ambos são inviáveis** e foram removidos.

O aplicativo web não tem — e não pode ter — acesso ao modelo semântico do usuário ([C-06](#34-restrições-impostas-pelo-ambiente-do-power-bi)).
As *data roles* são fixas, declaradas no `capabilities.json` do runtime, e o usuário arrasta os campos para elas
**dentro do Power BI**, no painel de campos. O que o config pode carregar são apenas rótulos de apresentação
(por exemplo, como chamar o eixo na legenda ou no tooltip) — nunca a ligação a uma coluna real.

---

## 5. Requisitos Não Funcionais

| ID | Categoria | Requisito | Como é verificado |
|---|---|---|---|
| **RNF-01** | Desempenho (editor) | Preview atualiza em < 100 ms (p95) após alteração de um controle. | Medição no E2E Playwright com `performance.mark`. |
| **RNF-02** | Desempenho (export) | Geração do `.pbiviz` em < 3 s (p95) em hardware de escritório. | Teste de empacotamento cronometrado em CI. |
| **RNF-03** | Desempenho (runtime) | Render inicial < 200 ms para 1.000 categorias; resize sem *layout thrashing*. | Teste manual com dataset de carga (ver [12.4](#124-matriz-de-teste-manual-no-power-bi)). |
| **RNF-04** | Tamanho | Bundle JS do runtime < 1 MB minificado. | Orçamento no CI; build falha se estourar. |
| **RNF-05** | Tamanho | Pacote `.pbiviz` final < 2 MB. Limite rígido do Power BI ([C-04](#34-restrições-impostas-pelo-ambiente-do-power-bi)). | Assertiva no teste de empacotamento. |
| **RNF-06** | Compatibilidade | Power BI Desktop na versão atual e nas 2 anteriores; `apiVersion` fixada explicitamente no `pbiviz.json`. | Matriz de teste manual. |
| **RNF-07** | Compatibilidade | Editor funcional em Chrome e Edge (2 últimas versões). | E2E em ambos. |
| **RNF-08** | Robustez | O runtime **nunca** renderiza tela branca. Toda falha vira um card de erro com código ([RN-04](#6-regras-de-negócio)). | `ErrorBoundary` + testes de config corrompida. |
| **RNF-09** | Acessibilidade | Contraste mínimo AA nos defaults; foco visível; suporte a alto contraste; navegação por teclado. | Revisão manual + axe no editor. |
| **RNF-10** | Manutenibilidade | Schema, tokens e componentes vivem em pacotes compartilhados; nenhuma duplicação entre runtime e editor. | Revisão de código; ausência de componentes duplicados. |
| **RNF-11** | Observabilidade | Erros de export logados no console com código estável; card de erro do runtime exibe código de diagnóstico. | Inspeção manual. |
| **RNF-12** | Privacidade | Nenhum dado do usuário sai do navegador. Sem telemetria no MVP. | Ausência de chamadas de rede além do fetch do template. |
| **RNF-13** | Reprodutibilidade | Build do runtime determinístico; versões de `powerbi-visuals-tools` e Tailwind fixadas (sem `^`). | Lockfile versionado. |

---

## 6. Regras de Negócio

| ID | Regra | Justificativa |
|---|---|---|
| **RN-01** | Cada **novo** projeto exportado recebe GUID e nome de plugin únicos. Reexportar o **mesmo** projeto reusa o GUID e incrementa a versão. | C-03. Projetos distintos precisam coexistir; reexports do mesmo projeto devem atualizar, não duplicar. |
| **RN-02** | Nenhum dado do modelo do Power BI trafega para o aplicativo web. O preview usa exclusivamente dados mock. | C-06 e privacidade. O app não tem como acessar o modelo, e não deveria. |
| **RN-03** | Um `VisualConfig` que falhe na validação contra o JSON Schema **não pode ser exportado**. | Impede que uma config quebrada só se manifeste dentro do Power BI. |
| **RN-04** | O runtime sempre renderiza um de três estados: **dados**, **vazio** ou **erro**. Tela branca é defeito de severidade máxima. | Um visual em branco no relatório é indistinguível de um bug do Power BI e destrói a confiança no produto. |
| **RN-05** | Somente valores do catálogo de tokens são aceitos. Os enums do schema são fechados. | ADR-02. É o que garante que toda classe exista no CSS compilado. |
| **RN-06** | O nome do visual é obrigatório, de 3 a 50 caracteres. O identificador derivado casa com `^[A-Za-z][A-Za-z0-9]*$` e alimenta GUID, `name` e nome do arquivo. | O GUID não é um UUID: é um **identificador JavaScript** usado como nome de variável dentro do bundle (verificado no spike — ver [8.4](#84-geração-da-identidade)). |
| **RN-07** | A versão do pacote segue o formato de 4 componentes `major.minor.patch.build` exigido pelo Power BI. Primeiro export: `1.0.0.0`. | Requisito do formato `pbiviz`. |
| **RN-08** | A interface **informa** que importar visual de arquivo depende de política habilitada pelo administrador do Power BI, e não trata isso como erro do produto. | C-05 e [1.5](#15-premissa-de-fronteira-do-produto). Está fora da fronteira do produto: informamos para reduzir suporte, não porque haja algo a mitigar. |
| **RN-09** | O runtime compara o `schemaVersion` da config com o que suporta. *Major* divergente → card de erro. *Minor/patch* → renderiza aplicando defaults aos campos desconhecidos. | Permite evoluir o schema de forma aditiva sem quebrar pacotes já distribuídos. |
| **RN-10** | O visual processa no máximo 1.000 categorias (`dataReductionAlgorithm.top.count`). Truncamento é sinalizado ao usuário. | Desempenho (RNF-03) e limite prático de legibilidade. |
| **RN-11** | O config nunca é interpretado como HTML, CSS ou JavaScript. Proibido `dangerouslySetInnerHTML` e `innerHTML` no `visual-kit` e no runtime. | Segurança ([13](#13-segurança-e-privacidade)). **Não é só disciplina nossa:** o lint oficial do `pbiviz` aplica `powerbi-visuals/no-inner-outer-html` e **falha o build** — confirmado no spike. |
| **RN-12** | Alterações do schema no MVP são **somente aditivas**. Remover ou renomear campo exige bump de *major* e função de migração. | RN-09 depende disso. |

---

## 7. Contrato de Configuração (JSON Schema)

### 7.1 Princípio

O `VisualConfig` é a **fonte única da verdade** trocada entre o editor e o runtime. Ele descreve **intenção de
design** (tokens semânticos), não implementação (classes CSS). Vive em `packages/config-schema` e é consumido
pelos dois lados.

### 7.2 Catálogo de Tokens

Escalas fechadas. Todo valor abaixo tem uma classe correspondente escrita **literalmente** no mapa do
`visual-kit`, o que faz o Tailwind enxergá-la em build time ([ADR-02](#35-decisões-de-arquitetura-adr)).

| Token | Valores |
|---|---|
| `spacing` | `none` · `xs` · `sm` · `md` · `lg` · `xl` |
| `radius` | `none` · `sm` · `md` · `lg` · `xl` · `full` |
| `fontSize` | `xs` · `sm` · `base` · `lg` · `xl` · `2xl` · `4xl` |
| `fontWeight` | `normal` · `medium` · `semibold` · `bold` |
| `align` | `left` · `center` · `right` |
| `shadow` | `none` · `sm` · `md` · `lg` |
| `border` | `none` · `thin` · `medium` |

Cores são exceção deliberada: aceitam hex `#RRGGBB` livre, validado por `pattern`, e são aplicadas via `style`
inline ou variável CSS — nunca via classe. Isso permite qualquer cor de marca sem violar RN-05.

### 7.3 Exemplo de Configuração

```json
{
  "schemaVersion": "1.0.0",
  "project": {
    "id": "vislowA1b2c3d4",
    "name": "Desempenho por Região",
    "packageVersion": "1.0.0.0"
  },
  "chartType": "bar",
  "layout": {
    "padding": "md",
    "radius": "xl",
    "shadow": "sm",
    "border": "thin",
    "surfaceColor": "#ffffff",
    "borderColor": "#e2e8f0"
  },
  "header": {
    "show": true,
    "text": "Desempenho de Vendas por Região",
    "fontSize": "lg",
    "fontWeight": "bold",
    "align": "left",
    "textColor": "#1e293b"
  },
  "bar": {
    "accentColor": "#3b82f6",
    "barRadius": "md",
    "showGridLines": true,
    "gridColor": "#f1f5f9",
    "showValueLabels": true,
    "valueLabelColor": "#475569",
    "valueLabelSize": "xs",
    "categoryLabelColor": "#64748b"
  },
  "labels": {
    "categoryAxis": "Região",
    "valueAxis": "Vendas"
  }
}
```

> **Correção em relação à v1.0.** O rascunho colocava `"$schema": "https://json-schema.org/draft/2020-12/schema"`
> dentro do documento de *instância*. Essa URL identifica o dialeto de um *schema*, não de um dado. Documentos de
> instância não a carregam. O campo foi substituído por `schemaVersion`, que é o que efetivamente governa a
> compatibilidade ([RN-09](#6-regras-de-negócio)).
>
> O bloco `bindings` foi removido — ver [4.6](#46-correção-de-escopo-herdada-da-v10).

### 7.4 Esboço do Schema

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vislow.app/schemas/visual-config/1.0.0.json",
  "title": "VisualConfig",
  "type": "object",
  "required": ["schemaVersion", "project", "chartType", "layout", "header"],
  "additionalProperties": false,
  "$defs": {
    "color":      { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
    "spacing":    { "enum": ["none", "xs", "sm", "md", "lg", "xl"] },
    "radius":     { "enum": ["none", "sm", "md", "lg", "xl", "full"] },
    "fontSize":   { "enum": ["xs", "sm", "base", "lg", "xl", "2xl", "4xl"] },
    "fontWeight": { "enum": ["normal", "medium", "semibold", "bold"] },
    "align":      { "enum": ["left", "center", "right"] },
    "shadow":     { "enum": ["none", "sm", "md", "lg"] },
    "border":     { "enum": ["none", "thin", "medium"] }
  },
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "project": {
      "type": "object",
      "required": ["id", "name", "packageVersion"],
      "additionalProperties": false,
      "properties": {
        "id":             { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9]{7,63}$" },
        "name":           { "type": "string", "minLength": 3, "maxLength": 50 },
        "packageVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+\\.\\d+$" }
      }
    },
    "chartType": { "enum": ["bar", "kpi"] }
    // layout, header, bar, kpi, labels — análogos, todos com additionalProperties: false
  },
  "allOf": [
    { "if":   { "properties": { "chartType": { "const": "bar" } } },
      "then": { "required": ["bar"] } },
    { "if":   { "properties": { "chartType": { "const": "kpi" } } },
      "then": { "required": ["kpi"] } }
  ]
}
```

`additionalProperties: false` em todo objeto é intencional: é a fronteira que faz [RN-05](#6-regras-de-negócio)
valer e impede que um config de versão futura passe silenciosamente por um runtime antigo.

### 7.5 Versionamento e Migração

- `schemaVersion` segue semver. Mudanças no MVP são **aditivas** ([RN-12](#6-regras-de-negócio)).
- O runtime declara a faixa que suporta e aplica [RN-09](#6-regras-de-negócio).
- Migrações vivem em `packages/config-schema/src/migrations/`, uma função por transição de *major*, com fixtures
  de entrada e saída em teste.

---

## 8. Especificação do Pacote e do Algoritmo de Export

### 8.1 Estrutura Real do `.pbiviz`

✅ **Verificado empiricamente** no spike da Fase 1, com `powerbi-visuals-tools` 7.2.1 (`apiVersion` 5.11.0).
O que está abaixo é observação, não hipótese.

Um `.pbiviz` é um ZIP com **apenas três entradas**:

```
{guid}.{version}.pbiviz  (ZIP)
├── package.json
│     ├── version                          "1.0.0.0"
│     ├── author { name, email }            ← obrigatório, senão o build falha
│     ├── resources [ { resourceId: "rId0", sourceType: 5, file: "resources/{guid}.pbiviz.json" } ]
│     ├── visual { name, displayName, guid, visualClassName, version, description, supportUrl, gitHubUrl }
│     └── metadata { pbivizjson: { resourceId: "rId0" } }
├── resources/                              (entrada de diretório, vazia)
└── resources/{guid}.pbiviz.json            TUDO que o Power BI executa
      ├── visual { name, displayName, guid, visualClassName, version, ... }
      ├── author, apiVersion, style, stringResources, assets, externalJS, visualEntryPoint
      ├── capabilities  { dataRoles, dataViewMappings, objects }
      └── content
            ├── js           ← bundle compilado, como string
            ├── css          ← CSS compilado, como string
            └── iconBase64   ← o ícone, embutido
```

> **Correção em relação à v1.0.** A v1.0 descrevia o pacote como contendo `pbiviz.json`, `capabilities.json`,
> `config.json` e `bundle.js` soltos na raiz. Essa é a estrutura do **projeto-fonte** durante o desenvolvimento,
> não do **pacote distribuído**. No pacote, capabilities e código estão *dentro* de `resources/{guid}.pbiviz.json`.
>
> **Correções da própria v2.0, feitas pelo spike:** (a) **não existe `assets/icon.png`** no ZIP — o ícone é a
> string `content.iconBase64`; (b) o `package.json` tem um bloco `metadata.pbivizjson.resourceId` que liga ao
> `resourceId` em `resources[]`, e não apenas o caminho do arquivo.

### 8.2 Contrato de Placeholder

✅ **Verificado no spike:** o token sobreviveu à minificação com **exatamente 1 ocorrência**, e o minificador
preservou a checagem sem dobrar a constante.

O código-fonte do runtime contém exatamente uma ocorrência do token:

```ts
// packages/runtime/src/embeddedConfig.ts
const VISLOW_CONFIG_B64 = "__VISLOW_CONFIG_B64__";

// Base64 padrão (A-Za-z0-9+/=) NUNCA contém "_"; o placeholder é cheio deles.
const IS_PATCHED = VISLOW_CONFIG_B64.indexOf("_") === -1;

function decodeUtf8Base64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);          // UTF-8 correto: acentos e emoji
}

export function readEmbeddedConfig(): unknown | null {
  if (!IS_PATCHED) return null;                    // pacote base, ainda não patcheado
  return JSON.parse(decodeUtf8Base64(VISLOW_CONFIG_B64));
}
```

Quatro detalhes que são requisitos, não estilo:

1. **Base64** ([ADR-07](#35-decisões-de-arquitetura-adr)) evita todo problema de escaping ao injetar em um
   literal de string dentro de JS minificado. Verificado com um título contendo aspas, acento e emoji
   simultaneamente ([RF-03](#41-editor)).
2. A detecção usa **a ausência de `_`**, não uma comparação com o token. Comparar contra `"__VISLOW" +
   "_CONFIG_B64__"` seria pior: o minificador pode dobrar a concatenação e **criar uma segunda ocorrência
   literal** do placeholder no bundle, quebrando a assertiva de ocorrência única e fazendo o patch substituir a
   ocorrência errada. A checagem por `indexOf` não tem esse risco. Saída real do minificador:
   `const i="__VISLOW_CONFIG_B64__",r=-1===i.indexOf("_")`.
3. A decodificação usa `TextDecoder`, não o par `escape`/`unescape` (obsoletos e incorretos fora de Latin-1).
4. O passo de build **falha** se o token não aparecer **exatamente uma vez** no `content.js` empacotado. Esta é
   a mitigação de [R-01](#14-riscos-e-mitigações).

### 8.3 Algoritmo de Export

✅ **Validado no spike.** O código abaixo é o algoritmo que efetivamente gerou dois pacotes importados com
sucesso no Power BI Desktop, com 27 assertivas automatizadas passando.

```ts
// packages/config-schema/src/packaging/buildPbiviz.ts (executável em browser e em Node)
import JSZip from 'jszip';

export async function buildPbiviz(template: ArrayBuffer, config: VisualConfig): Promise<Blob> {
  const zip = await JSZip.loadAsync(template);

  // 1. Identidade atual do pacote base
  const pkg = JSON.parse(await zip.file('package.json')!.async('string'));
  const oldGuid = pkg.visual.guid;
  const oldName = pkg.visual.name;

  // 2. Nova identidade, derivada do projeto (RN-01, RN-06)
  const newGuid = config.project.id;   // ex.: "VendasporRegiao2026E4535402BCA2...
  const newName = newGuid;             // no pacote base, name === guid
  const version = config.project.packageVersion;

  // 3. Recurso principal — localizado pelo package.json, não por caminho montado à mão
  const resPath: string = pkg.resources.find(r => r.file.endsWith('.pbiviz.json')).file;
  const res = JSON.parse(await zip.file(resPath)!.async('string'));

  // 4. Injeta a config no bundle (ADR-01/ADR-07)
  assertOccursOnce(res.content.js, '__VISLOW_CONFIG_B64__');
  const payload = toBase64Utf8(JSON.stringify(config));
  res.content.js = res.content.js.replace('__VISLOW_CONFIG_B64__', payload);

  // 5. Reescreve a identidade dentro do bundle — ADR-03.
  //    O GUID é NOME DE VARIÁVEL JS aqui, não só metadado (ver 8.4).
  //    Ordem: GUID primeiro (mais específico), depois o nome residual — como
  //    guid = nome + hex, inverter a ordem corromperia os GUIDs.
  res.content.js = replaceAll(res.content.js, oldGuid, newGuid);
  if (oldName !== oldGuid) res.content.js = replaceAll(res.content.js, oldName, newName);

  // 6. Reescreve os metadados do recurso
  res.visual.guid        = newGuid;
  res.visual.name        = newName;
  res.visual.displayName = config.project.name;
  res.visual.version     = version;

  // 7. Renomeia o recurso e atualiza a referência (passo mais fácil de esquecer)
  zip.remove(resPath);
  zip.file(`resources/${newGuid}.pbiviz.json`, JSON.stringify(res));

  // 8. Atualiza o package.json. `metadata.pbivizjson.resourceId` aponta para o
  //    resourceId, não para o caminho — por isso só o campo `file` muda.
  pkg.visual.guid        = newGuid;
  pkg.visual.name        = newName;
  pkg.visual.displayName = config.project.name;
  pkg.visual.version     = version;
  pkg.version            = version;
  pkg.resources = pkg.resources.map((r: any) =>
    r.file === resPath ? { ...r, file: `resources/${newGuid}.pbiviz.json` } : r);
  zip.file('package.json', JSON.stringify(pkg));

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
```

Nome do arquivo baixado: `{guid}.{packageVersion}.pbiviz`, seguindo a convenção da CLI oficial.

**Notas de implementação de força total:**

- O passo 7 é o mais fácil de errar e o mais silencioso: se o arquivo não for renomeado *ou* a referência em
  `package.json` não for atualizada, o Power BI recusa o import com uma mensagem genérica. Coberto por
  [T-03](#123-testes-de-empacotamento).
- No passo 5 a **ordem é obrigatória**, não preferência. Como o GUID começa pelo nome do visual
  (`vislowSpike` + 32 hex), substituir o nome antes do GUID corromperia todas as ocorrências do GUID. No pacote
  base do spike, o GUID aparecia 4× e o nome 5× no `content.js`.
- O `replaceAll` do passo 5 roda **depois** da injeção da config (passo 4), para o caso improvável de o GUID
  antigo aparecer dentro do payload base64.

### 8.4 Geração da Identidade

> ⚠️ **Corrigido pelo spike.** A hipótese original (`slug` + 8 caracteres base36) estava errada em dois pontos.
> Primeiro, a convenção real da CLI oficial é `{nome}{32 hex maiúsculos}` — o scaffold gerou
> `vislowSpike629BE43A5D854EF08EE114A6CAB537A8`. Segundo, e mais importante: **o GUID é usado como nome de
> variável JavaScript no bundle** (`var vislowSpike629BE43A5D854EF08EE114A6CAB537A8;(()=>{...`), não apenas como
> metadado. Ele precisa, portanto, ser um **identificador JS válido** — restrição que não constava do documento.

```
slug   = normaliza(nome do projeto) → NFD, remove diacríticos, mantém [A-Za-z0-9], máx. 40 chars
         se não começar por letra, prefixa "v"; se vazio, usa "vislow"
sufixo = 16 bytes de crypto aleatórios → 32 hex maiúsculos
id     = slug + sufixo
```

Invariantes verificadas em teste ([T-06d](#123-testes-de-empacotamento)):

- casa com `^[A-Za-z][A-Za-z0-9]*$` — identificador JS válido e `[RN-06](#6-regras-de-negócio)` satisfeita;
- 32 hex de entropia tornam a colisão entre projetos irrelevante na prática ([T-07](#123-testes-de-empacotamento));
- acentos e espaços do nome do usuário são removidos, não transliterados para caracteres inválidos.

O `id` é gerado **uma vez**, na criação do projeto, e persiste no config. É isso que faz [RF-10](#43-projeto)
funcionar: reexportar reusa o `id` e apenas incrementa `packageVersion`.

---

## 9. Especificação do Runtime Core

### 9.1 `capabilities.json`

```json
{
  "dataRoles": [
    { "displayName": "Categoria / Eixo", "name": "category", "kind": "Grouping" },
    { "displayName": "Valor",            "name": "measure",  "kind": "Measure" },
    { "displayName": "Valor de Comparação (opcional)", "name": "target", "kind": "Measure" }
  ],
  "dataViewMappings": [
    {
      "conditions": [
        { "category": { "max": 1 }, "measure": { "max": 1 }, "target": { "max": 1 } }
      ],
      "categorical": {
        "categories": {
          "for": { "in": "category" },
          "dataReductionAlgorithm": { "top": { "count": 1000 } }
        },
        "values": {
          "select": [
            { "bind": { "to": "measure" } },
            { "bind": { "to": "target" } }
          ]
        }
      }
    }
  ],
  "supportsHighlight": true,
  "supportsKeyboardFocus": true,
  "objects": {}
}
```

Diferenças em relação à v1.0 e por quê:

- `top: { count: 1000 }` explícito, em vez de `top: {}` — torna [RN-10](#6-regras-de-negócio) verificável em vez
  de depender de um default não documentado.
- `conditions` declaradas: sem elas, o Power BI aceita múltiplas medidas e o view model recebe formas que o
  runtime não trata.
- Role `target` opcional, exigida por [RF-16](#45-runtime-core).
- `objects` **vazio**: o painel de formatação do Power BI não é usado no MVP. Toda a configuração vem embutida
  ([ADR-01](#35-decisões-de-arquitetura-adr)). A propriedade `jsonConfig` do rascunho v1.0 foi removida — expor
  o JSON cru num campo de texto do painel de formatação seria um caminho paralelo de configuração, sem validação
  e sem preview.

### 9.2 Ciclo de Vida

```
constructor(options)
  ├── lê a config embutida  (RF-14) → em falha, estado de erro
  ├── guarda host, selectionManager, tooltipService, colorPalette
  └── monta o root React uma única vez

update(options)
  ├── classifica: sem dados → estado vazio (RF-20)
  ├── mapeia DataView → ViewModel (categorias, valores, selectionIds, formatador)
  ├── resolve tokens → props de estilo, sobrepondo por alto contraste (RF-21)
  └── re-renderiza  (sem desmontar — RF-22)
```

### 9.3 Isolamento de CSS

✅ **Validado no spike.** Tailwind **v4.3**, configurado em CSS e **pré-compilado pelo CLI**
([ADR-06](#35-decisões-de-arquitetura-adr) revisado):

```css
/* packages/visual-kit/src/styles.css */
@layer theme, utilities;

@import 'tailwindcss/theme.css'     layer(theme)     prefix(pbi);
@import 'tailwindcss/utilities.css' layer(utilities) prefix(pbi);

@source './**/*.{ts,tsx}';
```

```jsonc
// build: gera CSS puro, sem PostCSS no webpack do pbiviz
"build:css": "tailwindcss -i ./src/styles.css -o ./dist/styles.css --minify"
```

Três consequências práticas, todas verificadas:

1. **O prefixo da v4 é uma variante:** `pbi:flex`, não `pbi-flex`. O mapa de tokens usa essa forma.
2. **Sem preflight por construção** — importamos `theme` e `utilities`, nunca `base`. Não há `corePlugins` a
   desligar.
3. **O runtime importa o CSS gerado a partir do `visual.ts`**, e não pelo campo `style` do `pbiviz.json` — que é
   silenciosamente ignorado (ver [A.4](#a4-achados-do-spike-de-validação-2026-07-29), achado 20).

> **Correção em relação à v1.0.** A v1.0 justificava o prefixo dizendo que ele evita "que o Tailwind desconfigure
> o DOM nativo do Power BI". Isso não procede: o visual roda em um iframe sandbox ([C-01](#34-restrições-impostas-pelo-ambiente-do-power-bi)),
> e nenhum CSS dele alcança o DOM do host. A justificativa correta, e o motivo de manter a configuração, é
> **evitar colisão com os estilos que o host injeta dentro do iframe** e impedir que o preflight redefina esses
> estilos. O `content` inclui o `visual-kit` porque é lá que as classes literais dos tokens vivem.

### 9.4 Componente de Exemplo (Barras)

```tsx
// packages/visual-kit/src/BarChart.tsx — consumido pelo runtime E pelo preview (ADR-04)
import React, { useMemo } from 'react';
import {
  spacingClass, radiusClass, radiusTopClass, shadowClass,
  borderClass, fontSizeClass, fontWeightClass, alignClass,
} from './tokens';
import type { VisualConfig } from '@vislow/config-schema';

export interface DataPoint {
  category: string;
  value: number;
  formattedValue: string;
  selected: boolean;
}

export const BarChart: React.FC<{
  config: VisualConfig;
  data: DataPoint[];
  onSelect?: (index: number, multi: boolean) => void;
}> = ({ config, data, onSelect }) => {
  const { layout, header, bar } = config;

  // Calculado UMA vez por render, fora do laço.
  const maxValue = useMemo(
    () => data.reduce((m, d) => Math.max(m, d.value), 0),
    [data],
  );
  const hasSelection = data.some(d => d.selected);

  return (
    <div
      className={`pbi-w-full pbi-h-full pbi-flex pbi-flex-col
                  ${spacingClass(layout.padding)} ${radiusClass(layout.radius)}
                  ${shadowClass(layout.shadow)} ${borderClass(layout.border)}`}
      style={{ backgroundColor: layout.surfaceColor, borderColor: layout.borderColor }}
    >
      {header.show && (
        <h2
          className={`pbi-mb-4 pbi-truncate ${fontSizeClass(header.fontSize)}
                      ${fontWeightClass(header.fontWeight)} ${alignClass(header.align)}`}
          style={{ color: header.textColor }}
        >
          {header.text}
        </h2>
      )}

      <div className="pbi-flex-1 pbi-flex pbi-items-end pbi-gap-2" role="list">
        {data.map((d, i) => (
          <div
            key={i}
            role="listitem"
            tabIndex={0}
            aria-label={`${d.category}: ${d.formattedValue}`}
            onClick={e => onSelect?.(i, e.ctrlKey || e.metaKey)}
            className="pbi-flex-1 pbi-flex pbi-flex-col pbi-items-center pbi-justify-end
                       pbi-h-full pbi-cursor-pointer focus:pbi-outline focus:pbi-outline-2"
            style={{ opacity: hasSelection && !d.selected ? 0.35 : 1 }}
          >
            {bar.showValueLabels && (
              <span className="pbi-text-xs pbi-mb-1" style={{ color: bar.valueLabelColor }}>
                {d.formattedValue}
              </span>
            )}
            <div
              className={`pbi-w-full pbi-transition-all ${radiusTopClass(bar.barRadius)}`}
              style={{
                height: `${maxValue > 0 ? (d.value / maxValue) * 100 : 0}%`,
                backgroundColor: bar.accentColor,
              }}
            />
            <span
              className="pbi-text-xs pbi-mt-2 pbi-truncate pbi-w-full pbi-text-center"
              style={{ color: bar.categoryLabelColor }}
            >
              {d.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

Mudanças em relação ao exemplo da v1.0, todas com consequência real:

- `Math.max(...data.map(...))` estava **dentro** do `.map`, recalculando o máximo a cada barra — O(n²), e com
  risco de estourar a pilha em `Math.max(...)` com muitos argumentos. Agora é um `reduce` memoizado.
- Valores exibidos usam `formattedValue`, não o número cru ([RF-17](#45-runtime-core)).
- Seleção, esmaecimento, `tabIndex` e `aria-label` incorporados ([RF-18](#45-runtime-core), [RF-23](#45-runtime-core)).
- Tokens resolvidos por funções de mapeamento — as classes vivem como **strings literais completas** dentro de
  `tokens.ts`, nunca interpoladas, que é o que permite ao Tailwind enxergá-las ([ADR-02](#35-decisões-de-arquitetura-adr)).

---

## 10. Especificação do Aplicativo Web

### 10.1 Layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  [Vislow]   Nome do visual: [__________]   v1.0.0.0   [ Baixar .pbiviz ]      │
├──────────────────┬────────────────────────────────────┬───────────────────────┤
│  TIPO DE VISUAL  │        PREVIEW (visual-kit)        │      APARÊNCIA        │
│                  │                                    │                       │
│  ▸ Barras        │   ┌──────────────────────────┐     │  Cores                │
│  ▸ KPI Card      │   │                          │     │   destaque, superfície│
│                  │   │   render ao vivo com     │     │   texto, grade        │
│  PROJETO         │   │   dados de exemplo       │     │  Layout               │
│   salvar/abrir   │   │                          │     │   espaçamento, raio,  │
│   exportar json  │   └──────────────────────────┘     │   sombra, borda       │
│   importar json  │        [ 16:9 ] [ 4:3 ] [ 1:1 ]    │  Título               │
│                  │                                    │  Rótulos              │
└──────────────────┴────────────────────────────────────┴───────────────────────┘
```

O painel direito é gerado a partir do **catálogo de tokens** ([7.2](#72-catálogo-de-tokens)), não escrito à mão
por propriedade. Adicionar um token ao schema faz o controle aparecer.

### 10.2 Estado

Store Zustand única contendo `config: VisualConfig`, `validation: ValidationResult` e `exportState`. Toda escrita
passa por um setter que revalida contra o schema. O `localStorage` é atualizado com *debounce* ([RF-08](#43-projeto)).

### 10.3 Fluxo de Export

```
clique
  → valida (RF-12) — inválido: aponta os campos e para
  → fetch('/templates/base-runtime.pbiviz')  [cacheado]
  → buildPbiviz(template, config)            [§8.3]
  → saveAs(blob, `${slug}.${versao}.pbiviz`)
  → exibe as instruções de importação (RF-13)
```

Estados de erro tratados explicitamente: template indisponível (rede), placeholder ausente no template (build
corrompido), falha do JSZip. Cada um com mensagem própria e código ([RNF-11](#5-requisitos-não-funcionais)).

---

## 11. Estrutura do Repositório

Monorepo com pnpm workspaces:

```
vislow-biapp/
├── packages/
│   ├── config-schema/        JSON Schema, tipos TS, validador Ajv, defaults,
│   │                         migrações e buildPbiviz()  (isomórfico)
│   ├── visual-kit/           componentes React, mapa token→classe, preset Tailwind
│   └── runtime/              projeto pbiviz  →  dist/base-runtime.pbiviz
├── apps/
│   └── web/                  editor Next.js  →  public/templates/base-runtime.pbiviz
└── docs/
    └── doc-mvp-lowcode-pbi.md
```

Dependências: `runtime` → `visual-kit` → `config-schema`; `web` → todos os três.

O `visual-kit` é o coração da garantia de WYSIWYG ([ADR-04](#35-decisões-de-arquitetura-adr)): preview e visual
final não são "parecidos", são **o mesmo componente**. E como o mapa token → classe usa strings literais
completas, o Tailwind as encontra em build time — o problema de purge desaparece por construção, não por
disciplina.

O `base-runtime.pbiviz` é um artefato de build do CI, copiado para `apps/web/public/templates/`. Nunca é
versionado no Git.

---

## 12. Estratégia de Qualidade

### 12.1 Testes Unitários (Vitest)

| ID | Alvo |
|---|---|
| T-01 | `config-schema`: validação (aceite e rejeição), defaults, migrações, geração de identidade ([8.4](#84-geração-da-identidade)) |
| T-02 | `visual-kit`: mapa token → classe cobre **todo** valor de **todo** enum do schema; snapshots de render |

T-02 é o guardião de [RN-05](#6-regras-de-negócio): um token no schema sem classe correspondente falha o teste.

### 12.2 Testes de Contrato

Fixtures *golden* de `VisualConfig` (mínimo, completo, limites, caracteres especiais) validadas contra o schema
e renderizadas em snapshot. Um config que renderiza no editor tem de renderizar no runtime.

### 12.3 Testes de Empacotamento

Executam `buildPbiviz` em Node sobre o `base-runtime.pbiviz` recém-construído. São os testes mais importantes do
projeto — cobrem exatamente o que o usuário quer garantir.

| ID | Assertiva | Protege |
|---|---|---|
| T-03 | Zip reabre; `resources/{novoGuid}.pbiviz.json` existe; o antigo não; `package.json.resources` aponta para o novo | [8.3](#83-algoritmo-de-export) passo 7 |
| T-04 | O placeholder aparece **exatamente uma vez** no template e **zero vezes** no pacote gerado | [R-01](#14-riscos-e-mitigações) |
| T-05 | A config decodificada do pacote gerado é *deep-equal* à config de entrada, incluindo aspas, acentos e emoji | [RF-03](#41-editor), [ADR-07](#35-decisões-de-arquitetura-adr) |
| T-06 | GUID antigo ausente em `content.js`, no recurso e no `package.json` | [ADR-03](#35-decisões-de-arquitetura-adr), [R-02](#14-riscos-e-mitigações) |
| T-07 | Dois exports de projetos distintos produzem GUIDs distintos; dois exports do mesmo projeto, o mesmo GUID | [RN-01](#6-regras-de-negócio) |
| T-08 | Pacote < 2 MB e `content.js` < 1 MB | [RNF-04](#5-requisitos-não-funcionais), [RNF-05](#5-requisitos-não-funcionais) |

### 12.4 Matriz de Teste Manual no Power BI

Executada a cada fase, em Power BI Desktop **e** no Service.

| # | Caso | Critério |
|---|---|---|
| MT-01 | Importar o `.pbiviz` gerado | Importa sem erro e aparece no painel de visualizações |
| MT-02 | Arrastar campos para as roles | Renderiza com dados reais |
| MT-03 | **Dois visuais gerados no mesmo relatório** | Coexistem, cada um com sua config ([RN-01](#6-regras-de-negócio)) |
| MT-04 | Reexportar e reimportar o mesmo projeto | **Atualiza** o visual existente, não duplica ([RF-10](#43-projeto)) |
| MT-05 | Clicar numa barra | Filtra os demais visuais; `Ctrl`+clique acumula ([RF-18](#45-runtime-core)) |
| MT-06 | Hover | Tooltip nativo com valor formatado ([RF-19](#45-runtime-core)) |
| MT-07 | Medida em moeda / percentual | Formatação por locale correta ([RF-17](#45-runtime-core)) |
| MT-08 | Redimensionar de mínimo a tela cheia | Sem quebra de layout ([RF-22](#45-runtime-core)) |
| MT-09 | Remover todos os campos | Estado vazio orientativo ([RF-20](#45-runtime-core)) |
| MT-10 | Tema escuro e alto contraste do Power BI | Legível ([RF-21](#45-runtime-core)) |
| MT-11 | Dataset com 1.000+ categorias | < 200 ms e aviso de truncamento ([RNF-03](#5-requisitos-não-funcionais), [RF-25](#45-runtime-core)) |
| MT-12 | Pacote com config corrompida à mão | Card de erro, **nunca** tela branca ([RN-04](#6-regras-de-negócio)) |
| MT-13 | Título com aspas, acentos e emoji | Texto íntegro ([RF-03](#41-editor)) |
| MT-14 | Publicar o relatório no Power BI Service | Renderiza igual ao Desktop |

### 12.5 E2E do Editor (Playwright)

Editar → ver preview mudar → exportar → abrir o zip baixado e validar sua estrutura. Cobre [RNF-01](#5-requisitos-não-funcionais)
e [RNF-02](#5-requisitos-não-funcionais) com medição de tempo.

### 12.6 Pipeline de CI

```
lint → typecheck → unitários → build visual-kit → build runtime (pbiviz package)
     → assertiva do placeholder → testes de empacotamento → orçamento de tamanho
     → build web → E2E
```

O build do runtime **falha** se o placeholder não aparecer exatamente uma vez ([8.2](#82-contrato-de-placeholder)).

---

## 13. Segurança e Privacidade

- **Sem servidor, sem dados.** Tudo roda no navegador. Nenhum dado do modelo do Power BI, credencial ou PII
  chega a nós — o app nem sequer tem acesso ao modelo ([C-06](#34-restrições-impostas-pelo-ambiente-do-power-bi),
  [RN-02](#6-regras-de-negócio)).
- **Gerar no cliente é a opção mais segura.** O arquivo é montado no navegador do usuário e baixado direto. Não
  há upload, artefato hospedado nem intermediário. Um backend de build seria estritamente pior neste quesito:
  acrescentaria um serviço executando código a pedido de terceiros.
- **Config nunca vira código.** [RN-11](#6-regras-de-negócio): proibido `dangerouslySetInnerHTML`. Cores passam
  por `pattern` de hex; todos os demais campos são enums fechados. Essa é a fronteira de confiança, e ela é
  aplicada tanto na exportação (editor) quanto na leitura (runtime) — defesa em profundidade, já que o pacote
  pode ser editado à mão entre os dois pontos.
- **Distribuição.** O visual gerado é de arquivo, ou seja, uso organizacional. Publicar no AppSource exigiria
  revisão de código pela Microsoft e GUID estável — fora do escopo ([1.4](#14-fora-de-escopo-do-mvp)).
- **Dependência de política de tenant.** [RN-08](#6-regras-de-negócio). É uma decisão do administrador do
  Power BI, fora do nosso controle, e a causa mais provável de falha percebida.

---

## 14. Riscos e Mitigações

| ID | Risco | Impacto | Prob. | Mitigação | Sinal de detecção |
|---|---|---|---|---|---|
| **R-01** | ~~O minificador altera ou duplica o placeholder no bundle.~~ **FECHADO** pelo spike: 1 ocorrência exata após minificação. | Alto | ~~Média~~ | Detecção por ausência de `_`, não por comparação ([8.2](#82-contrato-de-placeholder)); assertiva de ocorrência única no build; T-04. | CI falha no build do runtime. |
| **R-02** | ~~A reescrita de GUID quebra o registro do plugin e o Power BI recusa o import.~~ **FECHADO** pelo spike: dois pacotes importados e coexistindo. | **Crítico** | ~~Média~~ | Gate da Fase 1 (aprovado); T-06; MT-01/MT-03 permanecem como regressão. | Import falha no gate. |
| **R-03** | A Microsoft muda o formato interno do `.pbiviz`. | Alto | Baixa | `powerbi-visuals-tools` fixado sem `^`; testes de empacotamento rodam contra o pacote recém-construído, detectando a mudança na hora do upgrade. | CI falha ao atualizar a dependência. |
| ~~**R-04**~~ | ~~Política de tenant bloqueia visuais customizados no ambiente do usuário.~~ **RECLASSIFICADO em 2026-07-29: não é risco, é premissa.** Ver [1.5](#15-premissa-de-fronteira-do-produto). | — | — | Nenhuma. Está fora da fronteira do produto: nenhuma decisão de engenharia nossa altera esse resultado. O produto informa o pré-requisito ([RF-13](#44-export-do-pacote)) e encerra sua responsabilidade na entrega do arquivo. | — |
| **R-05** | Bundle estoura o limite de 2 MB ao crescer o catálogo de tipos. | Médio | Baixa | Orçamento no CI (T-08); React em modo produção; sem bibliotecas de gráfico pesadas. | CI falha. |
| **R-06** | Preview diverge do resultado no Power BI. | Alto | Baixa | `visual-kit` compartilhado ([ADR-04](#35-decisões-de-arquitetura-adr)); MT-01/MT-02 comparados ao preview. | Relato no piloto (M-05). |
| **R-07** | Upgrade acidental para Tailwind v4 quebra prefixo e preflight. | Médio | Média | Versão fixada ([ADR-06](#35-decisões-de-arquitetura-adr)); snapshots de classe em T-02. | Snapshots quebram. |
| ~~**R-08**~~ | ~~Dois tipos de visual no MVP são otimistas para o prazo.~~ **FECHADO:** ambos entregues na Fase 1. | Médio | ~~Média~~ | — | — |
| **R-09** | O `pbiviz` já avisa que `getFormattingModel` (painel de formatação) **será obrigatório** em versão futura. Hoje não bloqueia. | Médio | Alta | Implementar na Fase 4, mesmo que o painel fique vazio. Fixar `powerbi-visuals-tools` evita a mudança chegar sem aviso ([RNF-13](#5-requisitos-não-funcionais)). | O build reporta o aviso a cada empacotamento. |

---

## 15. Roadmap de Execução

> **Nota.** A v1.0 deste documento trazia todas as tarefas marcadas como concluídas, embora nada tivesse sido
> implementado. Nenhuma caixa abaixo está marcada — este é o estado real do projeto.

**Estimativa total: ~6 semanas.** A v1.0 estimava 4, sem prever interatividade, formatação numérica,
acessibilidade, testes nem tratamento de erro.

### Fase 0 — Fundação — ✅ **CONCLUÍDA em 2026-07-29**

- [x] Monorepo pnpm com *project references* do TypeScript e ordem topológica de build.
- [x] `config-schema`: JSON Schema v1.0.0 (draft 2020-12), tipos TS, validador Ajv, defaults, geração de
      identidade, compatibilidade de schema.
- [x] `visual-kit`: mapa token → classe (Tailwind v4, prefixo `pbi:`) e fonte CSS pré-compilável.
- [x] ESLint `strictTypeChecked` com [RN-11](#6-regras-de-negócio) aplicada por regra de lint em todo o monorepo.
- [x] CI: typecheck → lint → testes → build → **guarda de CSS** (verifica que as classes do mapa de tokens
      chegam ao artefato, e que o preflight não vazou).
- [x] [`docs/padroes-de-engenharia.md`](padroes-de-engenharia.md) e `CLAUDE.md`.

**DoD:** ✅ 36 testes passando, incluindo T-01 e T-02; `pnpm verify` limpo a partir do zero.

**Nota de estimativa:** a fase levou algumas horas em vez dos ~3 dias previstos, porque o gate já havia
eliminado a incerteza de arquitetura. É o retorno do investimento no spike.

### Fase 1 — Runtime Core + **Gate de Validação** — ✅ **CONCLUÍDA em 2026-07-29**

- [x] Projeto `pbiviz` com React 19, TypeScript e Tailwind v4 prefixado.
- [x] Contrato de placeholder e assertiva de ocorrência única no build.
- [x] `capabilities.json` de [9.1](#91-capabilitiesjson); mapeamento `DataView` → view model.
- [x] Barras com tokens, formatação por `valueFormatter` (RF-17), seleção (RF-18), tooltip nativo (RF-19),
      menu de contexto (RF-24), navegação por teclado (RF-23), alto contraste (RF-21).
- [x] **KPI Card (RF-16), antecipado da Fase 4** — o `visual-kit` já estava montado e o custo marginal era baixo.
- [x] Estados vazio (RF-20), de erro (RF-14) e aviso de truncamento (RF-25); `ErrorBoundary` real.
- [x] Guardas de empacotamento no CI: 11 assertivas sobre o `.pbiviz` gerado.
- [x] Validado no Power BI Desktop com dados reais.

**Métricas do artefato:** pacote 131 KB (orçamento 2 MB) · bundle JS 413 KB (orçamento 1 MB).

**Pendência conhecida, não bloqueante:** o `pbiviz` avisa que o painel de formatação (`getFormattingModel`) será
exigido no futuro. Não impede o empacotamento nem a importação. Tratar na Fase 4 ([R-09](#14-riscos-e-mitigações)).

#### 🚦 Gate obrigatório — ✅ **APROVADO em 2026-07-29**

Executado **antes** da Fase 0, não ao fim da Fase 1: o gate não dependia de nada do monorepo, e adiá-lo só
atrasaria a descoberta. Código descartável em `spike/`.

- [x] Compilar um visual `pbiviz` mínimo com o placeholder (`powerbi-visuals-tools` 7.2.1, `apiVersion` 5.11.0).
- [x] **Reconhecimento primeiro:** extrair e registrar a estrutura real do ZIP antes de escrever o patch.
- [x] Aplicar o patch fora do app (`spike/patch.mjs`), gerando dois pacotes com GUIDs distintos.
- [x] Verificação automatizada: **27 assertivas, 0 falhas** (`spike/verify.mjs`) — embrião de T-03…T-08.
- [x] **Importar os dois no Power BI Desktop** → importam sem erro.
- [x] Cada visual exibe a própria config e os dois **coexistem no mesmo relatório** → ADR-03 provado.
- [x] Ajustar [8.1](#81-estrutura-real-do-pbiviz), [8.2](#82-contrato-de-placeholder), [8.3](#83-algoritmo-de-export)
      e [8.4](#84-geração-da-identidade) ao que foi observado.

**Consequência:** [ADR-01](#35-decisões-de-arquitetura-adr) e [ADR-03](#35-decisões-de-arquitetura-adr) estão
confirmados empiricamente; [R-01](#14-riscos-e-mitigações) e [R-02](#14-riscos-e-mitigações) estão fechados. O
custo real do gate foi de algumas horas, contra as 5 semanas de trabalho que ele protegia. Achados detalhados
no [Anexo A.4](#a4-achados-do-spike-de-validação-2026-07-29).

**Nenhuma pendência.** O que antes constava como R-04 — política de tenant — foi reclassificado como premissa
de fronteira do produto ([1.5](#15-premissa-de-fronteira-do-produto)), não como risco a gerenciar.

**DoD:** ✅ atingido.

### Fase 2 — Editor Web — ✅ **CONCLUÍDA em 2026-07-29**

- [x] Next.js 16 com `output: 'export'` (estático, zero backend) e o layout de [10.1](#101-layout).
- [x] Store Zustand com validação a cada escrita; persistência em `localStorage` com *debounce*.
- [x] Painel de controles **gerado** a partir do catálogo de tokens — nenhuma propriedade escrita à mão.
- [x] Preview ao vivo com os componentes do `visual-kit` e o dataset mock, com `ErrorBoundary`.
- [x] Exportar e importar o `config.json`; projeto novo gera identidade nova (RN-01).
- [x] Nome obrigatório com validação inline; export bloqueado por config inválida (RF-12/RN-03).

**DoD:** RF-01 a RF-09 implementados; `pnpm verify` e `next build` limpos.

**Pendente para a Fase 3:** o botão "Baixar .pbiviz" está no cabeçalho, desabilitado, aguardando `buildPbiviz`.

> **Validação incidental do ADR-06.** O editor tem o seu próprio Tailwind, sem prefixo, e importa o CSS do
> `visual-kit`, prefixado `pbi:`. Os dois convivem na mesma página sem colidir — que é exatamente a razão de o
> runtime usar prefixo, agora comprovada num cenário real em vez de hipotética.

### Fase 3 — Export e Integração (~1 semana)

- [ ] `buildPbiviz` em `config-schema`, isomórfico.
- [ ] Ligação com a interface, estados de erro e instruções de importação.
- [ ] Testes de empacotamento T-03 a T-08 no CI.
- [ ] Matriz manual MT-01 a MT-08.

**DoD:** ciclo completo editar → exportar → importar → renderizar funcionando; MT-03 e MT-04 aprovados.

### Fase 4 — KPI Card, Acessibilidade e Robustez (~1 semana)

- [ ] KPI Card (RF-16) com a role `target`.
- [ ] Alto contraste, navegação por teclado, menu de contexto, aviso de truncamento.
- [ ] Matriz manual completa (MT-01 a MT-14), incluindo o Service.
- [ ] E2E Playwright.

**DoD:** matriz completa aprovada; zero ocorrências de tela branca; métricas M-01 a M-05 mensuráveis no piloto.

---

## 16. Pós-MVP

Em ordem sugerida de valor por esforço:

1. **Novos tipos de visual** — linhas, área, rosca, tabela, mapa de calor. Cada um é um release do runtime.
2. **Galeria de templates** — presets de partida (minimalista, corporativo, escuro). Deliberadamente adiado: só
   faz sentido quando o catálogo de tokens estabilizar, senão cada mudança de schema quebraria todos os presets.
3. **Importação de tema do Power BI** — ler o `.json` de tema corporativo e derivar os tokens automaticamente.
   Atende diretamente a persona P-03.
4. **Contas e biblioteca na nuvem** — salvar, versionar e compartilhar projetos entre times. É o primeiro item
   que exige backend.
5. **Modo avançado** — editor Monaco sobre o config, com validação por schema. Reavaliar [RN-11](#6-regras-de-negócio)
   com cuidado antes.
6. **Compilação sob demanda** — backend rodando `pbiviz package` para gerar tipos que o runtime não conhece.
   É a alternativa descartada em [ADR-01](#35-decisões-de-arquitetura-adr); só vale se a demanda por tipos
   customizados superar o custo de infraestrutura e de sandbox de execução.

---

## 17. Glossário

| Termo | Definição |
|---|---|
| **`.pbiviz`** | Arquivo (ZIP) de um visual customizado do Power BI. Não confundir com **`.pbix`**, que é o arquivo de relatório. |
| **`pbiviz` (CLI)** | Ferramenta oficial da Microsoft que compila e empacota visuais customizados. |
| **Runtime Core** | O visual pré-compilado que interpreta o `VisualConfig`. Um só pacote base para todos os visuais gerados. |
| **`VisualConfig`** | Documento JSON que descreve o visual. Fonte única da verdade entre editor e runtime. |
| **Token** | Valor semântico de design (`padding: "md"`), independente da implementação em CSS. |
| **`DataView`** | Estrutura pela qual o Power BI entrega os dados ao visual, em `update(options)`. |
| **Data role** | "Poço" de campos declarado em `capabilities.json` para onde o usuário arrasta colunas dentro do Power BI. |
| **GUID** | Identificador alfanumérico único do visual. Determina se dois pacotes são o mesmo visual. |
| **`capabilities.json`** | Declara data roles, mapeamentos de dados e propriedades do painel de formatação. |
| **Cross-filter** | Filtrar os demais visuais do relatório ao selecionar um elemento. |
| **Preflight** | Reset de CSS do Tailwind, desligado aqui para não conflitar com os estilos injetados pelo host. |

---

## Anexo A — Histórico de Decisões e Correções

Correções aplicadas na v2.0 sobre o rascunho v1.0, com a razão de cada uma.

### A.1 Defeitos bloqueantes

| # | Defeito na v1.0 | Por que estava errado | Correção |
|---|---|---|---|
| 1 | Fluxo de export injetava `resources/config.json` no pacote, lido pelo runtime em execução. | O visual roda em `<iframe sandbox="allow-scripts">` sem domínio: não há `fetch` relativo, `localStorage` nem acesso ao próprio pacote. Somente `content.js`/`content.css` chegam ao runtime. O visual **nunca leria** esse arquivo. | Config embutida no bundle via placeholder base64 ([ADR-01](#35-decisões-de-arquitetura-adr), [8.2](#82-contrato-de-placeholder)). |
| 2 | GUID fixo, herdado do pacote base em todo export. | O GUID é a identidade do visual. O segundo visual importado sobrescreveria o primeiro, e todos os visuais no relatório passariam a usar a última config importada. | GUID e nome reescritos por export ([ADR-03](#35-decisões-de-arquitetura-adr), [8.3](#83-algoritmo-de-export)). |
| 3 | Config armazenava classes Tailwind cruas (`"bg-white"`, `"text-lg"`). | O Tailwind purga em build time as classes ausentes do código-fonte, e o runtime é compilado antes de o usuário escolher qualquer coisa. Toda classe fora do CSS já compilado falharia em silêncio. | Design tokens semânticos mapeados no runtime ([ADR-02](#35-decisões-de-arquitetura-adr), [7.2](#72-catálogo-de-tokens)). |

### A.2 Correções de escopo e de fato

| # | Item na v1.0 | Correção |
|---|---|---|
| 4 | Bloco `bindings` no config e painel "Mapeamento de Campos (Roles)" no editor. | Removidos. O app web não acessa o modelo do Power BI e não pode ligar campos; as roles são fixas e o mapeamento ocorre dentro do Power BI ([4.6](#46-correção-de-escopo-herdada-da-v10)). |
| 5 | Estrutura do pacote descrita como `pbiviz.json` + `capabilities.json` + `bundle.js` na raiz. | Essa é a estrutura do projeto-fonte, não do pacote. No pacote, tudo está em `resources/{guid}.pbiviz.json` ([8.1](#81-estrutura-real-do-pbiviz)). |
| 6 | Prefixo `pbi-` justificado como proteção do DOM do Power BI. | O iframe sandbox já garante esse isolamento. A justificativa correta é evitar colisão com os estilos injetados pelo host *dentro* do iframe ([9.3](#93-isolamento-de-css)). |
| 7 | `"$schema": "https://json-schema.org/draft/2020-12/schema"` dentro do documento de instância. | Essa URL identifica o dialeto de um schema, não de um dado. Substituída por `schemaVersion` ([7.3](#73-exemplo-de-configuração)). |
| 8 | `dataReductionAlgorithm: { "top": {} }`, sem `conditions`. | `count` explícito e `conditions` declaradas, tornando [RN-10](#6-regras-de-negócio) verificável ([9.1](#91-capabilitiesjson)). |
| 9 | `objects.configPanel.jsonConfig` no `capabilities.json`. | Removido. Seria um segundo caminho de configuração, sem validação nem preview. |
| 10 | `Math.max(...data.map(...))` **dentro** do `.map` do componente. | O(n²) e com risco de estourar a pilha em datasets grandes. Substituído por `reduce` memoizado ([9.4](#94-componente-de-exemplo-barras)). |
| 11 | Valores renderizados como número cru (`{row.value}`). | Exibiria `1234.5678` onde o modelo pede `R$ 1.234,57`. Formatação via `valueFormatter` ([RF-17](#45-runtime-core)). |
| 12 | Roadmap com todas as caixas marcadas `[x]`, com o repositório vazio. | Todas desmarcadas; estimativa revisada de 4 para ~6 semanas ([15](#15-roadmap-de-execução)). |

### A.3 Lacunas de engenharia preenchidas

Sem contrapartida na v1.0: métricas de sucesso mensuráveis · personas e escopo negativo explícito · requisitos
funcionais com critérios de aceite · RNFs quantificados · regras de negócio · versionamento e migração de schema ·
cross-filter, tooltip, formatação numérica, estados vazio e de erro, acessibilidade e alto contraste · estratégia
de testes com testes de empacotamento em CI · matriz de teste manual no Power BI · seção de segurança e
privacidade · registro de riscos com sinais de detecção · **gate de validação end-to-end na Fase 1**.

### A.4 Achados do spike de validação (2026-07-29)

O gate da Fase 1 foi executado antes da Fase 0 e **aprovado**. Achados que alteraram o documento:

| # | Achado | Onde estava errado | Correção |
|---|---|---|---|
| 13 | **O GUID é o nome de uma variável JavaScript** no bundle (`var vislowSpike629BE...;(()=>{`), com 4 ocorrências no `content.js`. | [8.4](#84-geração-da-identidade) tratava o GUID como metadado e propunha `slug` + 8 chars base36. | GUID passa a ser `{nome}{32 hex}` — convenção real da CLI — e precisa ser identificador JS válido ([RN-06](#6-regras-de-negócio), T-06d). |
| 14 | A ordem de substituição GUID→nome é **obrigatória**, não preferência: como `guid = nome + hex`, trocar o nome primeiro corromperia todos os GUIDs. | [8.3](#83-algoritmo-de-export) mencionava ordem sem explicar a consequência. | Justificativa registrada no passo 5. |
| 15 | Não existe `assets/icon.png` no ZIP; o ícone é `content.iconBase64`. O `package.json` tem `metadata.pbivizjson.resourceId`. | Diagrama de [8.1](#81-estrutura-real-do-pbiviz) mostrava `assets/` e omitia `metadata`. | Diagrama substituído pela estrutura observada. |
| 16 | O lint oficial do `pbiviz` aplica `powerbi-visuals/no-inner-outer-html` e **falha o build** com `innerHTML`. | [RN-11](#6-regras-de-negócio) tratava a proibição como disciplina interna. | RN-11 registra que a proibição é imposta pela toolchain. |
| 17 | O sentinela por concatenação (`"__VISLOW" + "_CONFIG_B64__"`) é perigoso: o minificador pode dobrá-lo e **criar uma segunda ocorrência literal** do placeholder. | [8.2](#82-contrato-de-placeholder) recomendava exatamente isso. | Detecção por ausência de `_` (base64 nunca contém underscore). Verificado na saída real do minificador. |
| 18 | `escape`/`unescape` são obsoletos e incorretos fora de Latin-1. | Exemplo de [8.2](#82-contrato-de-placeholder) usava `decodeURIComponent(escape(atob(...)))`. | `TextDecoder` sobre `Uint8Array`. Round-trip verificado com aspas, acento e emoji simultâneos. |
| 19 | `pbiviz package` exige `author.name`/`author.email` preenchidos, senão não gera o pacote. Também reporta ausência de `getFormattingModel` (não bloqueia o empacotamento). | Não documentado. | Registrado como pré-requisito do build do Runtime Core. |
| 20 | **O campo `style` do `pbiviz.json` é ignorado** — e o build reporta `Build completed successfully` mesmo assim, gerando um pacote **sem os estilos pretendidos**. O CSS entra pelo `import` no `visual.ts`. | Não documentado. Falha silenciosa clássica: pacote válido, visual sem estilo. | Guarda de CSS no CI verifica que as classes estão no artefato ([12.6](#126-pipeline-de-ci)). |
| 21 | O `powerbi-visuals-tools` **não traz PostCSS** (só `less-loader` e `css-loader`). | [ADR-06](#35-decisões-de-arquitetura-adr) supunha configurar Tailwind na toolchain. | CSS pré-compilado pelo CLI do Tailwind e importado como CSS puro. Dispensa PostCSS no webpack. |
| 22 | `powerbi-visuals-tools` 7.2.1 depende de `typescript ^5.9.3`. | Escolha de versão em aberto. | **TypeScript 5.9.3 em todo o monorepo.** O `visual-kit` é compilado pelo `ts-loader` do pbiviz; usar TS 7 nos demais pacotes criaria duas semânticas de tipo sobre código compartilhado. |
| 23 | O entrypoint padrão do Ajv é **draft-07** e não reconhece o dialeto 2020-12 declarado em `$schema` — falha só em runtime. | Não documentado. | Importar `ajv/dist/2020.js`. Coberto por teste. |

**Artefatos do spike** (código descartável, fora do futuro monorepo): `spike/vislowSpike/` — visual mínimo ·
`spike/patch.mjs` — embrião de `buildPbiviz()` · `spike/verify.mjs` — embrião de T-03…T-08, 27 assertivas.

### A.5 Achados da Fase 1 — Runtime Core (2026-07-29)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 24 | **O `node_modules` estrito do pnpm quebra a toolchain do `pbiviz`.** O webpack embutido resolve loaders e dependências transitivas a partir do diretório do *projeto*, não das próprias dependências. Falha com `Can't resolve 'ts-loader'`, depois `scheduler`, depois dependências internas do Ajv. | Build do runtime impossível. | Declarar explicitamente em `packages/runtime`: os loaders da toolchain, `scheduler`, os `powerbi-visuals-utils-*` e as dependências internas do Ajv. Preferido a `node-linker=hoisted`, que desligaria o isolamento em todo o monorepo. |
| 25 | **O `visualPlugin.ts` gerado pelo `pbiviz` não passa em `strictNullChecks`** (`VisualConstructorOptions \| undefined`). | Impossível compilar o runtime com `strict`. | Dois tsconfig: `tsconfig.json` lax para a toolchain, `tsconfig.check.json` estrito para o nosso código — ligado ao `pnpm typecheck` e ao ESLint. Rigor preservado onde importa. |
| 26 | **Sem `strictNullChecks`, o TypeScript não estreita união por discriminante booleano.** `if (r.valid)` deixava de dar acesso a `r.config`. | Erro de compilação em todo consumidor do runtime. | `ValidationResult` e `EmbeddedConfigResult` passaram a usar discriminante de **string** (`kind`), que estreita sob qualquer configuração de compilador. Vale como padrão para código que cruza a fronteira da toolchain. |
| 27 | O `valueFormatter` **distingue opção ausente de opção presente com `undefined`**. Pego por `exactOptionalPropertyTypes`. | Formatação numérica silenciosamente errada. | Montar o objeto de opções condicionalmente. |
| 28 | **`try/catch` em volta de `root.render()` não captura falhas de render do React.** No modo concorrente a fase de render é assíncrona, então a exceção ocorre fora do bloco — e o visual ficaria em branco. | Buraco direto na [RN-04](#6-regras-de-negócio), a regra mais importante do produto. | `ErrorBoundary` de verdade no `visual-kit`. O `try/catch` permanece, mas para falhas ao *montar* a árvore (mapeamento de `DataView`). São dois caminhos distintos e ambos são necessários. |
| 29 | As coordenadas do `tooltipService` são **relativas ao elemento do visual**, não à viewport. | Tooltip apareceria deslocado sempre que o visual não estivesse no canto superior esquerdo. | Subtrair `getBoundingClientRect()` antes de chamar `show`. |

### A.6 Achados da Fase 2 — Editor Web (2026-07-29)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 30 | **`exactOptionalPropertyTypes` conflita com props opcionais de React.** Repassar `hint={hint}` quando `hint` é `string \| undefined` é erro, porque `hint?: string` proíbe o valor `undefined` explícito. | Build do editor falha em qualquer componente que repasse prop opcional. | Props opcionais de componente declaram `prop?: T \| undefined`. É a acomodação padrão, e mantemos a flag ligada — ela já pagou dois bugs reais na Fase 1. |
| 31 | Os dois Tailwind — o do editor (sem prefixo) e o do `visual-kit` (`pbi:`) — **convivem na mesma página sem colidir**. | Confirma [ADR-06](#35-decisões-de-arquitetura-adr) num cenário real. | Nenhuma. Registrado como validação. |
| 32 | `next.config.ts` fica fora de qualquer `tsconfig` de pacote e o ESLint não conseguia analisá-lo. | Lint quebrado na raiz do app. | `tseslint.configs.base` no bloco de arquivos de configuração: traz o parser de TypeScript sem as regras que exigem informação de tipos. |
| 33 | Modelar `Field` com `token?: TokenKind` obrigava asserção não-nula no ponto de uso, e o lint (corretamente) reprovou. | Convenção não verificada pelo compilador. | União discriminada: `token` só existe, e é obrigatório, quando `kind === 'token'`. O compilador passa a garantir o que era convenção. |
