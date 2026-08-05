# Engenharia — como se constrói aqui

O método. Convenção, stack, testes, fluxo de PR e Definition of Done. O *quê* e o *porquê* do produto estão em
[requirements.md](requirements.md) e [architecture.md](architecture.md).

**Quando este documento, o código e a intenção divergirem:** o código em produção é o fato, os requisitos são a
intenção, este documento é o método. Divergência é bug de documentação — corrija na hora, enquanto o contexto
está fresco.

## 1. Princípios

Em ordem de precedência. Quando dois conflitarem, o de cima vence.

1. **O visual nunca quebra em branco.** Um visual em branco dentro de um relatório é indistinguível de um bug do
   Power BI e destrói a confiança no produto. Todo caminho termina em um de três estados: dados, vazio ou erro
   legível (RN-04).
2. **Falha silenciosa é o inimigo.** Este produto tem fronteiras onde erros somem sem sintoma: classes Tailwind
   ausentes do CSS compilado, e um `pbiviz package` que reporta sucesso produzindo pacote quebrado. Toda
   salvaguarda existe para transformar esses silêncios em falha de build. Preferimos quebrar o build a entregar
   algo que quebra na mão do usuário.
3. **Uma fonte da verdade por conceito.** O catálogo de componentes é definido em um lugar; os componentes
   existem em um lugar e são usados pelos dois hosts. Duplicação diverge — sempre, e em semanas.
4. **O preview é o produto.** Se o preview mentir sobre o resultado, o editor inteiro perde o sentido. É o que
   justifica o `visual-kit` compartilhado (ADR-04).
5. **Verificar em vez de supor.** O gate da Fase 1 corrigiu 7 pontos que pareciam certos no papel. Quando uma
   decisão depende do comportamento real de uma ferramenta, a resposta é um spike, não uma discussão.
6. **Nenhum dado do usuário sai do navegador.** Existe servidor desde a ADR-08, mas ele recebe a **spec** —
   descrição de UI — nunca dado do modelo do Power BI (RN-02, RNF-12). O que o servidor executa é a nossa
   toolchain sobre uma whitelist, nunca código do usuário (RN-11).

## 2. Stack e versões

**Regra: versões fixadas, sem `^` nem `~`.** Reprodutibilidade importa mais que atualização automática
(RNF-13). Atualizar é um PR deliberado, com o CI provando que nada quebrou.

| Camada | Escolha | Versão | Por quê |
|---|---|---|---|
| Runtime JS | Node | **≥ 22.13** | Piso do pnpm 11.12, não nosso: em 22.12 o `pnpm install` aborta antes de instalar. O CI pinna o piso de propósito — se o pnpm subir o requisito de novo, quebra lá, não na máquina de quem clona. |
| Gerenciador | pnpm | 11.12 | Workspaces com resolução estrita |
| Orquestração | Turborepo | — | A ordem de build vive no `turbo.json` (ADR-17) |
| Linguagem | TypeScript | **5.9.3** | Imposto pela toolchain: `powerbi-visuals-tools` depende de `typescript ^5.9.3` e o `visual-kit` é compilado pelo `ts-loader` dela. TS 7 criaria duas semânticas de tipo sobre código compartilhado. |
| UI | React | 19.2.8 | |
| Estilo (editor) | Tailwind CSS | **4.3.3** | Só em `apps/web`. O `visual-kit` tem CSS autoral, prefixo `vsl-` |
| Editor | Next.js | 16.2.12 | |
| Estado | Zustand | 5.0.14 | |
| Validação | Ajv | 8.20.0 | **Importe `ajv/dist/2020.js`**, não o entrypoint padrão — ele é draft-07, não reconhece o dialeto 2020-12 declarado em `$schema` e **falha só em runtime** (achado 23). |
| Gráficos | Recharts | — | ~575 KB; por isso `visual-kit/nodes` fica fora do barril |
| Testes | Vitest | 4.1.10 | |
| Lint | ESLint + typescript-eslint | 10.8 / 8.65 | `strictTypeChecked` |
| Empacotamento | JSZip | 3.10.1 | Só no `config-schema/packaging`, nunca no barril |
| Toolchain PBI | powerbi-visuals-tools | 7.2.1 | Ver [build-visual.md](build-visual.md) |

## 3. TypeScript e a ordem de build

Cada pacote tem **dois** tsconfig, e a distinção importa:

| Arquivo | Papel |
|---|---|
| `tsconfig.json` | Editor e lint. Inclui os testes. `noEmit`. |
| `tsconfig.build.json` | Emissão. `composite: true`, exclui testes. |

**Quem ordena a compilação é o Turborepo, não o `tsc -b`** (ADR-17). Cada pacote tem um script `build`
(`tsc -p tsconfig.build.json`), e a tarefa `build` do `turbo.json` declara `dependsOn: ["^build"]` — a ordem sai
do grafo do `package.json`.

Flags que já pagaram bugs reais e ficam ligadas: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`.

**Props opcionais de componente React declaram `prop?: T | undefined`** (achado 30). Com
`exactOptionalPropertyTypes`, repassar `hint={hint}` quando `hint` é `string | undefined` é erro, porque
`hint?: string` proíbe o valor `undefined` explícito. É a acomodação padrão — a flag fica.

**Discriminante de união é string (`kind`), nunca booleano** (achado 26):

```ts
// ✅ estreita sob qualquer configuração de compilador
type Result = { kind: 'valid'; spec: VisualSpec } | { kind: 'invalid'; issues: Issue[] };

// ❌ não estreita sem strictNullChecks — e a toolchain do pbiviz compila sem ela
type Result = { valid: true; spec: VisualSpec } | { valid: false; issues: Issue[] };
```

Vale para todo tipo que atravessa a fronteira da toolchain — na prática, tudo em `config-schema` e `visual-kit`.

**Dados vindos de fora** — `JSON.parse`, `DataView`, `localStorage`, arquivo importado — entram como `unknown` e
só viram tipo do domínio depois de um validador. **`as` para contornar validação é proibido.**

## 4. Convenções de código

Verificadas por CI: `strictTypeChecked` + `stylisticTypeChecked`; `innerHTML`/`outerHTML`/
`dangerouslySetInnerHTML` proibidos em todo o monorepo; `import type` explícito; `switch` exaustivo sobre
uniões.

Não automatizáveis, e por isso escritas:

- **Português sem acentos em identificadores e comentários de código.** Prosa em documentos usa acentuação
  normal. O motivo é evitar problemas de encoding no bundle que vai para dentro do Power BI.
- **Nomes de arquivo em `kebab-case`**, exceto componentes React, em `PascalCase`.
- **Comentário explica *por quê*, não *o quê*.** Comentário que registra uma armadilha descoberta na prática
  vale ouro e deve citar a origem.
- **Sem abreviação em nome público.** `config`, não `cfg`.
- **Erro tem contexto acionável.** `spec invalida — root.children[0].props.measureRole: papel nao ligado`, não
  `Erro de validação`.

## 5. Testes

| Nível | Ferramenta | O que cobre |
|---|---|---|
| Unitário | Vitest | Tokens, validação, defaults, identidade, migrações, formatadores |
| Contrato | Vitest | Fixtures *golden* de spec validadas e renderizadas em snapshot |
| **Aceite** | Vitest + JSZip + jsdom | `compiledVisual.e2e.test.ts` — ver [build-visual.md](build-visual.md) |
| E2E | Playwright | Editar → preview → exportar → validar o zip baixado. Cobre RNF-01 e RNF-02 com medição. |
| Manual | Power BI Desktop + Service | [Matriz MT-01…MT-14](#7-matriz-de-teste-manual) |

Dois testes ligam caminhos que nada mais liga, e por isso não se apagam:
`nodeComponents.test.ts` (o preview contra o codegen) e `tokens.test.ts` (o catálogo contra o mapa de classes,
nos dois sentidos — token sem classe e classe órfã).

### Regras

- **Todo bug corrigido ganha um teste que falharia antes da correção.** Sem exceção.
- **Teste nomeia a regra que protege.** `it('rejeita token fora do catalogo')`, com o ID (`RN-05`, `T-02`) no
  `describe`. Ao quebrar, fica claro qual invariante foi violada.
- **Nada de mock do que é barato de verdade.** Validação, tokens e empacotamento rodam de verdade.
- **Teste sensível a encoding usa o caso difícil**: título com aspas, acento e emoji ao mesmo tempo. Já pegou
  bug real.
- **Guarda que nunca falhou não é guarda verificada** (achado 57). Ao escrever uma, quebre o que ela protege de
  propósito e confirme que ela morde, com a mensagem certa.
- **Um teste que monta componentes do `visual-kit` vive em `apps/web`, não no kit** (achado 56). O kit não
  declara `react` nem em `devDependencies`, então o ESLint com tipos reprova o arquivo inteiro — e a "solução"
  óbvia é justamente a dependência proibida pelo achado 39.

## 6. Comandos e o Turborepo

```bash
pnpm dev         # sobe TUDO: compila o que falta, prepara o template, API + editor com watch
pnpm build       # pacotes + apps + stage:vendor
pnpm verify      # build + typecheck + lint + suíte rápida — rode antes de qualquer PR
pnpm check       # o verify MAIS o gate de aceite (compila um .pbiviz de verdade)
pnpm clean       # apaga dist/, vendor/, .next/ e o cache do turbo
```

Um `pnpm verify` sem mudanças volta em milissegundos (`>>> FULL TURBO`). **O CI é um comando**, o mesmo
`turbo run`, mais o gate: a ordem não está no workflow, está no `turbo.json`, e por isso vale igual na máquina.

Os scripts `lint` e `test` da raiz são as **implementações** que o turbo invoca (`//#lint`, `//#test`) —
chamá-las direto pula a ordenação, e o lint com informação de tipos precisa dos `.d.ts` que o build emite. Use
`pnpm verify`.

**Editar um pacote não faz hot reload:** só os apps estão em watch. Depois de mexer em `packages/`, rode
`pnpm build` ou reinicie o `pnpm dev`.

### Armadilhas do `turbo.json`

- **Entrada `pacote#tarefa` SUBSTITUI a genérica** — não herda `dependsOn` nem `inputs`. Cada uma está escrita
  por inteiro por isso. Esquecer o `^build` numa delas é ordenação quebrada em silêncio.
- **Tarefa de raiz (`//#lint`, `//#test`) não tem `^`** e exige um script da raiz com o nome **exato**.
- **`build` e `build:css` do `visual-kit` são um passo só**, de propósito: escrevem no mesmo `dist/`, e duas
  tarefas com `outputs` sobrepostos produzem cache parcial.
- **`dist/.tsbuildinfo` está listado à parte do `dist/**`** nos `outputs`. O estado perigoso é "tsbuildinfo
  restaurado, outputs ausentes": o `tsc` se acha atualizado, não emite nada, e a falha aparece três tarefas
  depois como module-not-found. Caminho literal sempre casa; glob com dotfile não se confia sem prova.
- **`test:build` é `cache: false`.** Ele executa o `pbiviz` de verdade, contra estado que o hash não captura —
  um acerto de cache seria a volta do "passou sem ter rodado" (achado 58).
- **`stage:deps` também é `cache: false`, mas pelo motivo oposto.** A store tem ~190 MB: empacotá-la e
  restaurá-la a cada acerto custaria mais que o passo que ela substitui. A idempotência é do próprio script,
  pelo stamp do `package-lock.json` — com a store em dia ele custa um hash e sai.
- **`@vislow/visual-template` declara `visual-kit` e `config-schema` em `devDependencies` sem importar nenhum
  dos dois.** Não remova por parecerem não usados: o `stage-vendor.mjs` lê o `dist/` das duas, e é essa aresta
  que faz o `^build` ordenar. Ficam em `devDependencies` porque o que chega ao visual é a cópia em `vendor/`.
- **Scripts `.mjs` de build precisam estar no alcance do ESLint** (achado 59). O bloco de configuração cobre
  `packages/*/scripts/**` — sem isso, `stage-vendor.mjs` e `check-css.mjs` rodam com zero regras e o
  `pnpm lint` verde não indica a lacuna.

## 7. Matriz de teste manual

Executada a cada fase, em Power BI Desktop **e** no Service. O CI não substitui isso.

| # | Caso | Critério |
|---|---|---|
| MT-01 | Importar o `.pbiviz` gerado | Importa sem erro e aparece no painel de visualizações |
| MT-02 | Arrastar campos para os papéis | Renderiza com dados reais |
| MT-03 | **Dois visuais gerados no mesmo relatório** | Coexistem, cada um com sua spec (RN-01) |
| MT-04 | Reexportar e reimportar o mesmo projeto | **Atualiza** o existente, não duplica (RF-10) |
| MT-05 | Clicar numa marca | Filtra os demais visuais; `Ctrl`+clique acumula (RF-18) |
| MT-06 | Hover | Tooltip nativo com valor formatado (RF-19) |
| MT-07 | Medida em moeda / percentual | Formatação por locale correta (RF-17) |
| MT-08 | Redimensionar de mínimo a tela cheia | Sem quebra de layout (RF-22) |
| MT-09 | Remover todos os campos | Estado vazio orientativo (RF-20) |
| MT-10 | Tema escuro e alto contraste do Power BI | Legível (RF-21) |
| MT-11 | Dataset com 1.000+ categorias | < 200 ms e aviso de truncamento (RNF-03, RF-25) |
| MT-12 | Pacote com spec corrompida à mão | Card de erro, **nunca** tela branca (RN-04) |
| MT-13 | Texto com aspas, acentos e emoji | Texto íntegro (RF-03) |
| MT-14 | Publicar o relatório no Power BI Service | Renderiza igual ao Desktop |

**Ao diagnosticar qualquer coisa no Desktop, peça o `buildId` primeiro** (achado 40). Sem ele, "importou o
arquivo antigo" é indistinguível de "a correção não funcionou" — e isso já custou uma sessão inteira.

## 8. Fluxo de uma feature

1. **Localize a regra.** Toda feature mapeia para um `RF-xx` de [requirements.md](requirements.md). Se não
   mapeia, ou o doc está incompleto — atualize-o primeiro — ou a feature está fora de escopo.
2. **Se tem UI, faça o plano de design antes do código** — skill `frontend-design`, ver
   [frontend.md](frontend.md). Vale para `apps/web` **e** para o `visual-kit`.
3. **Comece pelo registro** se a feature adiciona tipo de nó ou propriedade: descritor, schema derivado, teste.
4. **Depois o `visual-kit`**: classe mapeada e componente.
5. **Depois os hosts**: editor, codegen e template consomem, não redefinem.
6. **Teste em cada camada** antes de avançar.
7. **Se tem UI, audite o diff** com a skill `web-design-guidelines` e resolva os achados.
8. **Rode `pnpm verify`** antes de abrir PR. Se tocou no codegen, no template ou nos nós do kit, rode
   `pnpm check` — é o `verify` mais o gate de aceite.
9. **Se a feature toca o pacote `.pbiviz`, teste no Power BI Desktop de verdade.**

### Quando fizer um spike

Sempre que a decisão depender do comportamento real de uma ferramenta externa.

- Vive em `spike/`, fora do lint e dos testes. É código para jogar fora.
- **Reconhecimento antes de implementação:** primeiro observe e registre a estrutura real, depois escreva código
  contra o que foi observado — nunca contra o que se supõe.
- Termina com achados escritos no documento afetado. **Um spike sem documento não aconteceu.**

## 9. Git, commits e PRs

- **Branch:** `feat/`, `fix/`, `docs/`, `chore/`, `spike/` + descrição curta em kebab-case.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), escopo é o pacote —
  `feat(component-registry): adiciona no de tabela`.
- **Corpo do commit responde "por quê"**, não "o quê" — o diff já mostra o quê.
- **PR referencia os IDs** de requisito, regra ou risco que endereça.
- **PR que muda comportamento do `.pbiviz` descreve o teste manual feito** no Desktop, com o resultado e o
  `buildId`.
- **PR que mexe em UI resume o plano de design** e lista o que a auditoria apontou — corrigido ou justificado.

## 10. Definition of Done

Uma feature só está pronta quando **todos** valem:

- [ ] `pnpm verify` passa (build, typecheck, lint, suíte rápida).
- [ ] Testes cobrem o caminho feliz **e** os modos de falha relevantes.
- [ ] Nenhuma invariante foi contornada — as do domínio estão em [build-visual.md](build-visual.md) e
      [frontend.md](frontend.md).
- [ ] **Se cria ou reformula UI** (`apps/web` ou `visual-kit`): plano de design com o `frontend-design` **antes**
      do código, diff auditado com o `web-design-guidelines`, cada achado resolvido ou justificado no PR. Estado
      vazio e estado de erro desenhados, não só o caminho feliz.
- [ ] Se toca o catálogo: descritor, schema, defaults e mapa de classes atualizados **juntos**.
- [ ] Se toca o pacote: testado no Power BI Desktop, com o resultado e o `buildId` no PR.
- [ ] Documentação atualizada quando a feature muda uma decisão registrada.
- [ ] Sem `TODO` órfão. Ou resolva, ou abra issue e referencie.

## 11. Como decidir e registrar

- **Decisão de arquitetura** vira um **ADR** em [architecture.md](architecture.md): decisão, motivo,
  **alternativa descartada**. ADR não se apaga — se for revertido, registra-se a reversão e a razão.
- **Regra de negócio** vira um `RN-xx` em [requirements.md](requirements.md), com justificativa.
- **Risco** vira um `R-xx` em [architecture.md](architecture.md), **com sinal de detecção** — um risco que
  ninguém saberia dizer se ocorreu não é gerenciável.
- **Achado empírico que contraria o que estava escrito** vira uma regra no doc da área, no imperativo e com o
  porquê. O histórico numerado fica em [history.md](history.md) — é ele que impede reintroduzir um erro já pago.
