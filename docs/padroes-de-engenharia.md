# Padrões de Engenharia — Vislow

| | |
|---|---|
| **Status** | Vigente a partir de 2026-07-29 |
| **Escopo** | Todo código do monorepo `vislow-biapp` |
| **Relação com o MVP** | Este documento diz **como** construir. O [doc de MVP](doc-mvp-lowcode-pbi.md) diz **o quê** e **por quê**. |

> **Como usar.** Toda feature nova — sem exceção — segue este documento. Ele não é sugestão: os pontos marcados
> como **regra** são verificados por CI e quebram o build. Quando uma regra atrapalhar, a saída é **mudar a
> regra aqui, com justificativa**, não contorná-la no código.

---

## Sumário

1. [Princípios](#1-princípios)
2. [Stack e versões](#2-stack-e-versões)
3. [Estrutura do monorepo](#3-estrutura-do-monorepo)
4. [Convenções de código](#4-convenções-de-código)
5. [Invariantes do domínio](#5-invariantes-do-domínio)
6. [Testes](#6-testes)
7. [Fluxo de trabalho de uma feature](#7-fluxo-de-trabalho-de-uma-feature)
8. [Git, commits e PRs](#8-git-commits-e-prs)
9. [Definition of Done](#9-definition-of-done)
10. [Como decidir e registrar](#10-como-decidir-e-registrar)

---

## 1. Princípios

Em ordem de precedência. Quando dois conflitarem, o de cima vence.

1. **O visual nunca quebra em branco.** Um visual em branco dentro de um relatório é indistinguível de um bug do
   Power BI e destrói a confiança no produto. Todo caminho de código do runtime termina em um de três estados:
   dados, vazio ou erro legível. ([RN-04](doc-mvp-lowcode-pbi.md))
2. **Falha silenciosa é o inimigo.** Este produto tem duas fronteiras onde erros somem sem sintoma: classes
   Tailwind que não existem no CSS compilado, e patches de pacote que "funcionam" mas geram um `.pbiviz`
   inválido. Toda salvaguarda existe para transformar esses silêncios em falha de CI. Preferimos quebrar o build
   a entregar algo que quebra na mão do usuário.
3. **Uma fonte da verdade por conceito.** O `VisualConfig` é definido em um lugar. Os componentes existem em um
   lugar e são usados pelos dois hosts. Duplicação diverge — sempre, e em semanas.
4. **O preview é o produto.** Se o preview mentir sobre o resultado, o editor inteiro perde o sentido. Isso é o
   que justifica o `visual-kit` compartilhado. ([ADR-04](doc-mvp-lowcode-pbi.md))
5. **Verificar em vez de supor.** O gate da Fase 1 corrigiu 7 pontos do documento que pareciam certos no papel.
   Quando uma decisão depende do comportamento real de uma ferramenta, a resposta é um spike, não uma discussão.
6. **Nenhum dado do usuário sai do navegador.** Não há servidor, e essa é uma escolha de segurança, não só de
   custo. ([RNF-12](doc-mvp-lowcode-pbi.md))

---

## 2. Stack e versões

**Regra: versões fixadas, sem `^` nem `~`.** Reprodutibilidade importa mais que atualização automática
([RNF-13](doc-mvp-lowcode-pbi.md)). Atualizar é um PR deliberado, com o CI provando que nada quebrou.

| Camada | Escolha | Versão | Por quê |
|---|---|---|---|
| Runtime JS | Node | ≥ 22.12 | LTS |
| Gerenciador | pnpm | 11.12 | Workspaces com resolução estrita |
| Linguagem | TypeScript | **5.9.3** | Imposto pela toolchain: `powerbi-visuals-tools` depende de `typescript ^5.9.3` e o `visual-kit` é compilado pelo `ts-loader` dela. TS 7 criaria duas semânticas de tipo sobre código compartilhado. |
| UI | React | 19.2.8 | |
| Estilo | Tailwind CSS | **4.3.3** | ADR-06 revisado após validação no spike. Prefixo em forma de variante: `pbi:flex`. |
| Editor | Next.js | 16.2.12 | |
| Estado | Zustand | 5.0.14 | |
| Validação | Ajv | 8.20.0 | **Usar `ajv/dist/2020.js`**, não o entrypoint padrão (draft-07). |
| Testes | Vitest | 4.1.10 | |
| Lint | ESLint + typescript-eslint | 10.8 / 8.65 | `strictTypeChecked` |
| Empacotamento | JSZip | 3.10.1 | |
| Toolchain PBI | powerbi-visuals-tools | 7.2.1 | |

### Restrições da toolchain do Power BI

Descobertas no spike e não negociáveis:

- **`pbiviz` não traz PostCSS** (só `less-loader` e `css-loader`). O CSS do Tailwind é **pré-compilado pelo CLI**
  e importado como CSS puro pelo `visual.ts`. Não tente plugar PostCSS no webpack dele.
- **O campo `style` do `pbiviz.json` é ignorado.** O CSS entra pelo `import` no `visual.ts`. Pior: o build
  reporta `Build completed successfully` mesmo sem o CSS — falha silenciosa clássica, coberta por assertiva.
- **`pbiviz package` exige `author.name` e `author.email`** preenchidos, senão não gera o pacote.
- **O lint do `pbiviz` proíbe `innerHTML`/`outerHTML`** e falha o build.

---

## 3. Estrutura do monorepo

```
packages/config-schema/     Fonte da verdade do VisualConfig: schema, tipos, validação,
                            defaults, identidade, migrações; e `packaging/inspectPbiviz`
packages/build-contract/    Contrato HTTP entre o editor e a API de build
packages/component-registry/ Catálogo de componentes; schema da árvore derivado dele
packages/visual-kit/        Componentes React + mapa token→classe + fonte Tailwind
packages/codegen/           Spec  →  fontes de um projeto pbiviz (visual.tsx, capabilities…)
packages/visual-template/   Projeto pbiviz base + vendorização dos @vislow/* para o worker
apps/api/                   API de build: spec entra, .pbiviz compilado sai
apps/web/                   Editor Next.js: compõe a árvore e chama a API
spike/                      Código descartável do gate. Fora do lint e dos testes.
```

**Regra: o grafo de dependências é acíclico e só aponta para baixo.**
`config-schema` ← {`build-contract`, `component-registry`, `visual-kit`} ← `codegen` ← {`api`, `web`}.
`config-schema` não importa nada do monorepo.

**Regra: `config-schema` e `visual-kit` são isomórficos** — rodam em Node e no browser. Nada de `fs`, `path`
ou API só de browser sem verificação: os dois são compilados para dentro do bundle do visual do Power BI, e
`inspectPbiviz` precisa rodar tanto no worker quanto num teste.

### Configuração de TypeScript

Cada pacote tem **dois** tsconfig, e a distinção importa:

| Arquivo | Papel |
|---|---|
| `tsconfig.json` | Editor e lint. Inclui os testes. `noEmit`. |
| `tsconfig.build.json` | Emissão. `composite: true`, exclui testes, alvo das *project references*. |

**Quem ordena a compilação é o Turborepo, não o `tsc -b`.** Cada pacote tem um script `build`
(`tsc -p tsconfig.build.json`), e a tarefa `build` do `turbo.json` declara `dependsOn: ["^build"]` — a ordem sai
do grafo de dependências do `package.json`. As `references` continuam nos `tsconfig.build.json` para o editor;
para o `tsc -p` elas ficam inertes, porque os imports são *bare specifiers* que o node resolve pelo campo
`exports` direto para o `.d.ts` já emitido.

`pnpm typecheck` roda o `tsconfig.json` (o de editor, com os testes) de cada pacote, também ordenado pelo turbo.

---

## 4. Convenções de código

### Regras verificadas por CI

| Regra | Onde é aplicada |
|---|---|
| `strict` do TypeScript, mais `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals` | `tsconfig.base.json` |
| `strictTypeChecked` + `stylisticTypeChecked` do typescript-eslint | `eslint.config.mjs` |
| `innerHTML`, `outerHTML` e `dangerouslySetInnerHTML` proibidos em todo o monorepo | `eslint.config.mjs` |
| `import type` explícito (`consistent-type-imports`) | `eslint.config.mjs` |
| `switch` exaustivo sobre uniões | `eslint.config.mjs` |

### Convenções não automatizáveis

- **Português sem acentos em identificadores e comentários de código.** Prosa em documentos usa acentuação
  normal. O motivo é evitar problemas de encoding no bundle que vai para dentro do Power BI.
- **Nomes de arquivo em `kebab-case`**, exceto componentes React, em `PascalCase`.
- **Comentário explica *por quê*, não *o quê*.** Se o comentário descreve o que a linha faz, ou a linha está
  ruim ou o comentário sobra. Comentário que registra uma armadilha descoberta na prática — como o campo `style`
  ignorado pelo `pbiviz` — vale ouro e deve citar a origem.
- **Sem abreviação em nome público.** `config`, não `cfg`. Locais curtos em escopo de 3 linhas são aceitáveis.
- **Erro tem contexto acionável.** `VisualConfig invalido — layout.padding: deve ser um dos valores permitidos`,
  não `Erro de validação`.

### Fronteiras de tipo

Dados vindos de fora — `JSON.parse`, `DataView` do Power BI, `localStorage`, arquivo importado — entram como
`unknown` e só viram tipo do domínio depois de passar por um validador. **Regra: `as` para contornar validação é
proibido.** A única asserção legítima é a que o próprio validador faz, depois de confirmar.

---

## 5. Invariantes do domínio

Estas são as regras que, se quebradas, causam falha silenciosa em produção. Cada uma tem um teste.

### 5.1 Classes Tailwind são strings literais completas

```ts
// ✅ correto — o Tailwind lê a classe no fonte e gera o CSS
export const SPACING_CLASS: Record<Spacing, string> = { md: 'pbi:p-4' };

// ❌ proibido — a classe não existe no fonte; o CSS não é gerado
const cls = `pbi:p-${size}`;
```

O runtime é compilado **antes** de o usuário escolher qualquer coisa. Uma classe construída dinamicamente não
existe no CSS compilado e **some sem erro** dentro do Power BI. Coberto pelo teste de cobertura de tokens
([T-02](doc-mvp-lowcode-pbi.md)), que também rejeita classes contendo `$`, `{`, `}` ou crase.

### 5.2 Todo token do catálogo tem classe mapeada

Adicionar um valor em `config-schema/src/tokens.ts` **obriga** a adicionar a classe em
`visual-kit/src/tokens.ts`. O teste falha de propósito quando isso não acontece — nos dois sentidos: token sem
classe, e classe órfã sem token.

### 5.3 Cores nunca viram classe

Cores são hex livre validado por `pattern` e aplicadas por `style` inline. É a exceção deliberada à
[RN-05](doc-mvp-lowcode-pbi.md) que permite qualquer cor de marca sem quebrar a garantia de purge.

### 5.4 O GUID é um identificador JavaScript

Não é UUID. Vira nome de variável dentro do bundle (`var VendasporRegiao...;(()=>{`). Precisa casar com
`^[A-Za-z][A-Za-z0-9]*$`. Ver [8.4](doc-mvp-lowcode-pbi.md).

### 5.5 O schema evolui só de forma aditiva

Dentro de uma major: só adicionar campos opcionais com default. Remover ou renomear exige bump de major **e**
função de migração. `additionalProperties: false` em todo objeto é a fronteira que faz isso valer.

### 5.6 Discriminante de união é string, nunca booleano

```ts
// ✅ estreita sob qualquer configuração de compilador
type Result = { kind: 'valid'; config: VisualConfig } | { kind: 'invalid'; issues: Issue[] };

// ❌ não estreita sem strictNullChecks — e o runtime é compilado sem ela
type Result = { valid: true; config: VisualConfig } | { valid: false; issues: Issue[] };
```

O Runtime Core é compilado pela toolchain do `pbiviz`, que **não suporta `strictNullChecks`** (o `visualPlugin.ts`
gerado por ela não passa). Sem essa flag, `if (r.valid)` deixa de dar acesso a `r.config` e o build quebra.
Vale para todo tipo que atravessa a fronteira da toolchain — na prática, tudo em `config-schema` e `visual-kit`.

### 5.7 O visual nunca fica em branco — e `try/catch` não basta

`try/catch` em volta de `root.render()` **não** captura falhas de render do React: no modo concorrente a fase de
render é assíncrona e a exceção ocorre fora do bloco. Só um **error boundary** captura. Os dois caminhos são
necessários e cobrem coisas diferentes:

| Mecanismo | Cobre |
|---|---|
| `try/catch` no `rerender()` | Falha ao **montar** a árvore: mapeamento de `DataView`, leitura de config |
| `<ErrorBoundary>` | Falha **dentro** do render de um componente |

### 5.8 Validação nos dois lados

O editor valida a spec antes de exportar; a API revalida antes de compilar e o portão (`inspectPbiviz`) confere
o artefato depois. Não é redundância: o editor é código do cliente e a API não pode confiar nele. Defesa em
profundidade.

---

## 6. Testes

### Pirâmide

| Nível | Ferramenta | O que cobre |
|---|---|---|
| Unitário | Vitest | Tokens, validação, defaults, identidade, migrações, formatadores |
| Contrato | Vitest | Fixtures *golden* de config validadas e renderizadas em snapshot |
| **Aceite** | Vitest + JSZip + jsdom | `compiledVisual.e2e.test.ts`: spec → `.pbiviz` compilado de verdade → `inspectPbiviz` → executa o bundle minificado num jsdom |
| E2E | Playwright | Editar → preview → exportar → validar o zip baixado |
| Manual | Power BI Desktop + Service | [Matriz MT-01…MT-14](doc-mvp-lowcode-pbi.md) |

**O teste de aceite é o mais importante do projeto.** É ele que prova que o artefato entregue ao usuário é
válido — e ele é o único que enxerga o que o webpack fez com o bundle.

**Ele não tem como se pular.** O sufixo `.e2e.test.ts` é convenção: tira o arquivo da suíte rápida
(`vitest.config.ts`) e o põe na do gate (`vitest.build.config.ts`), cuja tarefa no `turbo.json` declara
`stage:vendor` como dependência. Se o gate roda, o template está preparado; se não estiver, o arquivo lança no
carregamento em vez de avisar e passar verde. A tarefa também é `cache: false` — ela executa `npm ci` e
`pbiviz` de verdade, e um acerto de cache aqui seria a volta do "passou sem ter rodado".

### Regras

- **Todo bug corrigido ganha um teste que falharia antes da correção.** Sem exceção.
- **Teste nomeia a regra que protege.** `it('rejeita token fora do catalogo')`, com o ID (`RN-05`, `T-02`) no
  `describe`. Assim, ao quebrar, fica claro qual invariante foi violada.
- **Nada de mock do que é barato de verdade.** Validação, tokens e empacotamento rodam de verdade.
- **Teste de dado sensível a encoding usa o caso difícil**: título com aspas, acento e emoji ao mesmo tempo. Já
  pegou bug real.

---

## 7. Fluxo de trabalho de uma feature

1. **Localize a regra.** Toda feature deve mapear para um `RF-xx` do doc de MVP. Se não mapeia, ou o doc está
   incompleto — atualize-o primeiro — ou a feature está fora de escopo.
2. **Comece pelo `config-schema`** se a feature adiciona configuração: token, tipo, schema, default, teste.
3. **Depois o `visual-kit`**: classe mapeada e componente. Nunca o inverso — o schema é a fonte da verdade.
4. **Depois os hosts**: editor, codegen e template consomem, não redefinem.
5. **Teste em cada camada** antes de avançar para a próxima.
6. **Rode `pnpm verify`** (build + typecheck + lint + suíte rápida) antes de abrir PR. Se tocou no codegen, no
   template ou nos nós do kit, rode `pnpm check` — é o `verify` mais o gate de aceite.
7. **Se a feature toca o pacote `.pbiviz`, teste no Power BI Desktop de verdade.** O CI não substitui isso.

### Quando fizer um spike

Faça sempre que a decisão depender do comportamento real de uma ferramenta externa. Regras do spike:

- Vive em `spike/`, fora do lint e dos testes. É código para jogar fora.
- **Reconhecimento antes de implementação:** primeiro observe e registre a estrutura real, depois escreva
  código contra o que foi observado — nunca contra o que se supõe.
- Termina com achados escritos no documento afetado. Um spike sem documento não aconteceu.

---

## 8. Git, commits e PRs

- **Branch:** `feat/`, `fix/`, `docs/`, `chore/`, `spike/` + descrição curta em kebab-case.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/). Escopo é o pacote:
  `feat(config-schema): adiciona token de opacidade`.
- **Corpo do commit responde "por quê"**, não "o quê" — o diff já mostra o quê.
- **PR referencia os IDs** de requisito, regra ou risco que endereça.
- **PR que muda comportamento do pacote `.pbiviz` descreve o teste manual feito** no Power BI Desktop, com o
  resultado.

---

## 9. Definition of Done

Uma feature só está pronta quando **todos** os itens valem:

- [ ] `pnpm verify` passa (build, typecheck, lint, suíte rápida).
- [ ] Testes cobrem o caminho feliz **e** os modos de falha relevantes.
- [ ] Nenhuma invariante da [seção 5](#5-invariantes-do-domínio) foi contornada.
- [ ] Se toca configuração: schema, tipos, defaults e mapa de classes atualizados **juntos**.
- [ ] Se toca o pacote: testado no Power BI Desktop, com o resultado descrito no PR.
- [ ] Documentação atualizada quando a feature muda uma decisão registrada — incluindo ADRs e o Anexo A.
- [ ] Sem `TODO` órfão. Ou resolva, ou abra issue e referencie.

---

## 10. Como decidir e registrar

- **Decisão de arquitetura** vira um **ADR** na seção 3.5 do doc de MVP: decisão, motivo, alternativa
  descartada. ADR não se apaga — se for revertido, registra-se a reversão e a razão. Foi o que aconteceu com o
  ADR-06 (Tailwind v3 → v4) depois do spike.
- **Regra de negócio** vira um `RN-xx` na seção 6, com justificativa.
- **Risco** vira um `R-xx` na seção 14, **com sinal de detecção** — um risco que ninguém saberia dizer se
  ocorreu não é gerenciável.
- **Achado empírico que contraria o documento** vira linha no Anexo A. É o histórico que impede a equipe de
  reintroduzir um erro já pago.

### Uma opinião só

Quando houver divergência entre este documento, o doc de MVP e o código: **o código em produção é o fato, o doc
de MVP é a intenção, e este documento é o método**. Divergência é bug de documentação — corrija na hora,
enquanto o contexto está fresco. Não deixe as três fontes contarem histórias diferentes.
