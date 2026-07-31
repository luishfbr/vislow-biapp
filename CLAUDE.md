# Vislow — contexto para agentes

Plataforma low-code que gera visuais customizados do Power BI (`.pbiviz`) sem que o usuário instale nada.

## Leia antes de escrever código

1. **[docs/padroes-de-engenharia.md](docs/padroes-de-engenharia.md)** — como construir. Regras verificadas por CI.
2. **[docs/doc-mvp-lowcode-pbi.md](docs/doc-mvp-lowcode-pbi.md)** — o quê e por quê. Requisitos (`RF-xx`),
   regras (`RN-xx`), decisões (`ADR-xx`), riscos (`R-xx`). O **Anexo A** lista erros já pagos — não os repita.

## Comandos

**O monorepo roda sobre Turborepo.** A ordem de build vive no `turbo.json` e vale igual aqui e no CI — não há
mais sequência a decorar. Cada comando faz uma coisa por inteiro:

```bash
pnpm dev         # sobe TUDO: compila o que falta, prepara o template, API + editor com watch
pnpm build       # pacotes + apps + stage:vendor
pnpm verify      # build + typecheck + lint + suite rapida — rode antes de qualquer PR
pnpm check       # o verify MAIS o gate de aceite (compila um .pbiviz de verdade)
pnpm clean       # apaga dist/, vendor/, .next/ e o cache do turbo
```

O turbo cacheia: um `pnpm verify` sem mudanças volta em milissegundos (`>>> FULL TURBO`).

Os scripts `lint` e `test` da raiz são as **implementações** que o turbo invoca (`//#lint` e `//#test`) — chamá-las
direto pula a ordenação, e o lint com informação de tipos precisa dos `.d.ts` que o build emite. Use `pnpm verify`.

## Armadilhas que já custaram tempo

Todas descobertas empiricamente. Detalhes no Anexo A do doc de MVP.

- **Classe Tailwind construída por interpolação some sem erro** dentro do Power BI. O CSS é pré-compilado pelo
  CLI do Tailwind, que só enxerga o fonte do `visual-kit` — nunca a spec do usuário. Use sempre strings literais
  completas em `visual-kit/src/tokens.ts`.
- **Tailwind v4 usa prefixo de variante:** `pbi:flex`, não `pbi-flex`. **E o prefixo vem ANTES da variante:**
  `pbi:focus:ring-2`, nunca `focus:pbi:ring-2` — escrito ao contrário, o CLI não reconhece a classe, não gera
  regra nenhuma e não reclama (achado 54). Classe com variante se confere no `dist/styles.css`, não no olho.
- **Ajv:** importe `ajv/dist/2020.js`. O entrypoint padrão é draft-07 e falha só em runtime.
- **O campo `style` do `pbiviz.json` é ignorado.** O CSS entra pelo `import` no `visual.ts` — e o build reporta
  sucesso mesmo sem ele.
- **O GUID do visual é nome de variável JS no bundle**, não um UUID. Precisa casar `^[A-Za-z][A-Za-z0-9]*$`.
- **`innerHTML` é proibido** — pelo nosso ESLint e pelo lint oficial do `pbiviz`.
- **O visual nunca pode renderizar em branco.** Sempre dados, vazio ou erro legível. `try/catch` em volta de
  `root.render()` NÃO captura falhas de render do React — só um `ErrorBoundary` captura.
- **Discriminante de união é string (`kind`), nunca booleano.** A toolchain do `pbiviz` compila sem
  `strictNullChecks`, e sem ela o TypeScript não estreita união por discriminante booleano.
- **O `pnpm` estrito esconde dependências do webpack do `pbiviz`.** Ele resolve loaders e transitivas a partir do
  diretório do projeto — por isso o `package.json` do template declara `ts-loader`, `scheduler`, os utils do
  Power BI e as dependências internas do Ajv explicitamente.
- **Coordenadas do `tooltipService` são relativas ao elemento do visual**, não à viewport.
- **Props opcionais de React declaram `prop?: T | undefined`** — `exactOptionalPropertyTypes` está ligado e
  proíbe repassar `undefined` explícito para `prop?: T`.
- **`inspectPbiviz` vive em `@vislow/config-schema/packaging`, fora do `index.ts`.** O barril é importado por
  código que termina dentro do bundle do visual; reexportar levaria o JSZip junto, contra o orçamento de 1 MB.
- **O webpack do `pbiviz` usa `resolve.symlinks: false`, então dois symlinks para o mesmo pacote viram dois
  módulos.** Foi assim que o React entrou duas vezes no bundle e o dispatcher de hooks ficou `null` — só
  componentes com hook falhavam, o resto renderizava. Por isso `autoInstallPeers: false`, nenhum `react` nas
  `devDependencies` do `visual-kit` e vendorização por **cópia de diretório, nunca symlink**. **Não reintroduza**,
  e não adicione dependência duplicada entre pacotes que o template empacota.
- **`compiledVisual.e2e.test.ts` é o único teste que executa o artefato.** Se você mexer no bundle, na resolução
  de módulos ou nas dependências do template, é ele que pega o estrago.
- **O `visual-kit` não usa hooks** — regra de ESLint, não convenção. Hook é o único ponto sensível à duplicação
  do React no bundle (achado 39): elementos JSX atravessam cópias, hooks não. Use classe (ver `ErrorBoundary`) ou
  calcule no render.
- **Todo pacote carrega uma impressão digital de build** (o `buildId` que a API passa ao codegen, exibido no
  canto do visual e no card de erro). Ao diagnosticar qualquer coisa no Desktop, **peça o id primeiro** — sem
  ele, "importou o arquivo antigo" é indistinguível de "a correção não funciona", e isso já custou uma sessão
  inteira.

### Armadilhas da API de build (Sprint 4)

- **Nunca defina `NODE_ENV=production` no ambiente do worker.** O `npm ci` lê isso como `--omit=dev` e pula o
  `powerbi-visuals-tools`. O `npm ci` termina com sucesso e a falha aparece depois, como um `404` do registro
  tentando baixar um pacote chamado `pbiviz` — nada na mensagem aponta para a causa.
- **O `tsconfig.json` do template não aceita comentário.** O `powerbi-visuals-tools` lê o arquivo com
  `JSON.parse` cru. Toda explicação vai no `packages/visual-template/template/README.md`.
- **O template usa `moduleResolution: "bundler"`.** A resolução `node` ignora o campo `exports` e não acharia
  `@vislow/visual-kit/nodes`.
- **Os `@vislow/*` entram em `node_modules` DEPOIS do `npm ci`**, que apaga o diretório inteiro antes de
  instalar. Cópia de diretório, nunca symlink — symlink reintroduz o achado 39.
- **`@vislow/visual-kit/nodes` fica fora do barril** pelo mesmo motivo do `config-schema/packaging`: quem
  importa só o barril não deve pagar pelo Recharts (~575 KB) contra o orçamento de 1 MB.
- **A inspeção do artefato é portão, não teste** (ADR-11). O `pbiviz` já reportou sucesso produzindo pacote
  quebrado três vezes. Nada sai do worker sem passar por `inspectPbiviz`.
- **`compiledVisual.e2e.test.ts` é o gate de aceite** — e o único teste que executa o artefato. Se você mexer no
  codegen, no template ou nos nós do kit, é ele que pega o estrago. Rode `pnpm check`: o sufixo `.e2e.test.ts`
  o tira da suíte rápida, e a tarefa `test:build` do turbo prepara o template antes. Ele **não tem como se
  ignorar** — sem template, lança no carregamento.

### Armadilhas do editor de composição (Sprint 5)

- **Nada de lista de tipos ou de propriedades escrita à mão no editor.** Paleta, painel de propriedades, schema
  e codegen saem todos de `NODE_DESCRIPTORS`. Uma lista paralela é a quinta cópia do catálogo e a primeira a
  divergir.
- **A regra do `frame` é `consumesData()` no registro**, consultada pelo codegen e pelo preview. Não
  reimplemente `fields.some(f => f.kind === 'role')` num dos dois lados.
- **`lib/nodeComponents.ts` é o gêmeo por referência do que o codegen faz por texto.** `nodeComponents.test.ts`
  compara o nome da função com `descriptor.component` — é a única coisa ligando os dois caminhos.
- **Seletor de zustand nunca constrói valor.** O v5 compara com `Object.is`, então devolver um `Map` ou objeto
  novo re-renderiza em loop e trava a aba. Derivação que cria objeto vive em `lib/issues.ts`, memoizada no
  componente.
- **O preview não tem seleção por clique** (ADR-14). Um wrapper clicável entra na cadeia de flex que o
  `ResponsiveContainer` usa para medir altura e o preview deixa de valer como referência.
- **Nome de papel é imutável** (ADR-13). O usuário edita `displayName`; o `name` nasce em `createRole` e amarra
  as referências da árvore e o `capabilities.json`.
- **A união de nós no schema usa `if`/`then`, não `oneOf`.** Com `oneOf` o Ajv reporta o erro das sete
  variantes e o painel acusa campo de container num gráfico de barras.
- **`react-is` é peer do Recharts** e o repo usa `autoInstallPeers: false` — por isso `apps/web` o declara
  explicitamente. O `npm ci` do template instala peers sozinho, então o visual compilado esconde esse problema.
- **Testes `.tsx` do editor precisam do `oxc.jsx` no `vitest.config.ts`**: o `apps/web/tsconfig.json` usa
  `jsx: "preserve"` (exigência do Next) e o vitest lê o mesmo arquivo. Definir `esbuild.jsx` é ignorado em
  silêncio no Vite 8.
- **`react` no vitest vem por alias para a cópia do editor.** O `visual-kit` não pode declarar react (achado
  39), então sem o alias nenhum teste importa os componentes do fonte.

### Armadilhas da paridade de interatividade (Sprint 6)

- **Os serviços do host viajam dentro do `DataFrame`** (ADR-16), num `FrameHost`. Nunca leia `frame.host`
  direto — use `hostOf(frame)`, que devolve o `INERT_HOST` no preview. Um `?.` por chamada é uma chance por
  chamada de esquecer, e o esquecimento só quebra o editor.
- **Alto contraste: HTML usa variável CSS, SVG lê o quadro.** `var()` **não é substituído em atributo de
  apresentação** de SVG — `<rect fill="var(--x, red)">` não pinta (achado 55). Nos nós de HTML use `hcInk`,
  `hcSurface`, `hcAccent`, `hcLine`; nos gráficos resolva por `hostOf(frame).highContrast`.
- **O `FrameHost` tem discriminante `kind: 'host' | 'inert'`**, e é ele que decide o tooltip: no visual
  compilado o balão é o do host (RF-19); no preview fica o do Recharts, senão passar o mouse no editor não
  mostraria nada.
- **A navegação por teclado é uma sobreposição `absolute` de `<button>` `sr-only`**, não `tabIndex` no SVG.
  Absoluta porque um elemento a mais na cadeia de flex quebra a medida do `ResponsiveContainer` (ADR-14); o
  grupo é `pointer-events-none` para não roubar clique do gráfico. As setas movem o **foco do DOM**, não um
  índice em estado — é o que dá navegação por setas sem hook.
- **Mouse e teclado divergem por tipo de gráfico, de propósito.** Barra e pizza têm marca por ponto e usam
  `onClick` do `<Bar>`/`<Pie>`; linha e área usam o handler do gráfico e o `activeTooltipIndex`. Restrição do
  Recharts, não escolha.
- **Toda a conversa com o host é estática, em `visual-template/template/src/interaction.ts`.** O codegen só
  instancia e chama `readFrame`. Não mova implementação de seleção para o fonte gerado.
- **Um teste que MONTA componentes do `visual-kit` vive em `apps/web`, não no `visual-kit`** (achado 56): sem
  `react-dom` resolvível ali, o ESLint com tipos reprova o arquivo inteiro — e a "solução" óbvia é justamente a
  dependência proibida pelo achado 39.

### Armadilhas do Turborepo

- **Entrada `pacote#tarefa` SUBSTITUI a genérica** — não herda `dependsOn` nem `inputs`. Cada uma no
  `turbo.json` está escrita por inteiro por isso. Esquecer o `^build` numa delas é ordenação quebrada em
  silêncio.
- **Tarefa de raiz (`//#lint`, `//#test`) não tem `^`** e exige um script da raiz com o nome **exato**. Por isso
  `pnpm lint` e `pnpm test` são as implementações cruas, e não wrappers do turbo — o ponto de entrada é
  `pnpm verify`.
- **`build` e `build:css` do `visual-kit` são um passo só**, de propósito: escrevem no mesmo `dist/`, e duas
  tarefas com `outputs` sobrepostos produzem cache parcial. Os inputs também são os mesmos (`src/**`), então
  separar não granularia nada.
- **`dist/.tsbuildinfo` está listado à parte do `dist/**` nos `outputs`.** O estado perigoso é "tsbuildinfo
  restaurado, outputs ausentes": o `tsc` se acha atualizado, não emite nada, e a falha só aparece três tarefas
  depois como module-not-found. Caminho literal sempre casa; glob com dotfile não se confia sem prova.
- **`test:build` é `cache: false`.** Ele executa `npm ci` e `pbiviz` de verdade, contra estado que o hash não
  captura — um acerto de cache seria a volta do "passou sem ter rodado".
- **`@vislow/visual-template` declara `visual-kit` e `config-schema` em `devDependencies` sem importar
  nenhum dos dois.** Não remova por parecerem não usados: o `stage-vendor.mjs` lê o `dist/` das duas, e é essa
  aresta que faz o `^build` ordenar. Ficam em `devDependencies` porque o que chega ao visual é a cópia em
  `vendor/`, nunca esse `node_modules` — achado 39.
- **A guarda do CSS confere o CSS de saída, não o `tokens.ts`.** Uma classe pode ter segunda origem no fonte:
  `pbi:p-4` também aparece literal em `states.tsx`, então quebrar só o mapa de tokens não a remove do bundle.
  Ao escolher classe para a lista de `check-css.mjs`, prefira as que só o `tokens.ts` produz.

## Estado

**O pivô da ADR-08 está fechado.** Desde 2026-07-30 o ciclo completo funciona no Power BI Desktop: o usuário
compõe do zero no editor, a API compila um `.pbiviz` de verdade e o pacote importa e renderiza. O produto
prometido — o usuário **cria** o visual, não escolhe entre prontos — existe de ponta a ponta.

Desde 2026-07-31 o visual compilado também **filtra o relatório, mostra tooltip nativo, respeita alto contraste,
é navegável por teclado e abre o menu de contexto** — a paridade que o pivô tinha deixado para trás.

Gate de arquitetura **aprovado**. Fases 0 (fundação), 1 (Runtime Core) e 2 (editor web) **concluídas** — e
depois **substituídas** pelo pivô. O achado 39 (React duplicado) está fechado desde a Fase 3: a deduplicação
basta, e o `visual-kit` ficou sem hooks como defesa em profundidade.

**Pivô para compilação real por usuário** (ADR-08, reverte a ADR-01 e a ADR-05). Plano em `~/.claude/plans/`.

- **Sprint 2 (gate)** — aprovado: Recharts cabe com folga e `pbiviz package` roda headless.
- **Sprint 3 (registro)** — `@vislow/component-registry`: catálogo de componentes e schema da árvore derivado.
- **Sprint 4 (API de build)** — `@vislow/visual-kit/nodes`, `@vislow/codegen`, `@vislow/visual-template` e
  `@vislow/api`. Ciclo completo medido por HTTP com os sete tipos de nó: **pacote 224,1 KB, `content.js`
  762,6 KB, build em 11,8 s**. **Validado no Desktop em 2026-07-30** — o `.pbiviz` gerado pela API renderiza.
- **Sprint 5 (editor de composição)** — concluído no código em 2026-07-30. O editor deixou de escolher entre
  dois tipos prontos e passou a compor: paleta, árvore navegável, painel de propriedades e preview, todos
  derivados do registro; papéis de dados declarados pelo usuário; export chamando a API com progresso.
  Novos: `component-registry/tree.ts`, `visual-kit/nodes/mockFrame.ts` e `@vislow/build-contract`.
  Aposentados: `exportPbiviz.ts`, `AppearancePanel` e `CONTROL_GROUPS`. **Validado no Desktop em 2026-07-30**:
  o ciclo completo fecha — compor no editor, exportar pela API e importar no Power BI.
- **Sprint 6 (paridade de interatividade)** — concluído em 2026-07-31. O achado 53 está **fechado**:
  as seis capacidades voltaram ao caminho novo pelo desenho da ADR-16 — serviços do host dentro do `DataFrame`,
  alto contraste por variável CSS, teclado por sobreposição de botões. Novos:
  `visual-kit/src/highContrast.ts`, `visual-template/template/src/interaction.ts` e
  `apps/web/src/components/kitInteraction.test.tsx`. O gate de aceite passou a verificar o que o visual **pede
  ao host**, não só o que ele desenha. Pacote **221,1 KB**, `content.js` **751,3 KB**.
  **Validado no Desktop em 2026-07-31**: as seis funcionam num `.pbiviz` compilado pela API.

- **Faxina (2026-07-31)** — o caminho antigo foi aposentado, agora que o novo está aprovado no Desktop.
  Saíram: `packages/runtime` inteiro, `buildPbiviz`/`CONFIG_PLACEHOLDER`/`base64.ts` e os testes T-03…T-08
  originais, `BarChart`/`KpiCard`/`Frame`/`mock.ts` do `visual-kit` com `resolveColors`, `DataPoint`, `KpiDatum`
  e `RenderContext`, `apps/web/public/templates/` e os scripts `test:packaging`/`stage:template`.
  **`inspectPbiviz` sobrevive** — é o portão da ADR-11 — mais enxuto: sem extração de payload e sem "pacote
  base"; `PbivizBuildError` virou `PbivizInspectionError`. Nenhum comportamento do produto mudou; o gate de
  aceite ficou verde com as mesmas 16 assertivas e o pacote em **221,2 KB** / `content.js` **751,6 KB**.

- **Turborepo (2026-07-31)** — a ordem de build deixou de viver em três lugares que não conversavam (o solution
  file do `tsc`, a sequência de passos do CI e a memória de quem roda os comandos) e passou a viver no
  `turbo.json`. Cada pacote ganhou `build`/`typecheck`/`clean`; o `tsc -b` da raiz saiu. Quatro comandos de topo
  fazem cada coisa por inteiro: `pnpm dev`, `pnpm build`, `pnpm verify`, `pnpm check`.
  Ganhos medidos: `pnpm verify` de 12,4 s para **18 ms** em cache quente (`FULL TURBO`); a suíte rápida de
  16,3 s para **1,71 s**, porque o gate de aceite saiu dela. **O gate deixou de poder se ignorar** — o skip
  silencioso por template ausente virou falha no carregamento, e `VISLOW_REQUIRE_BUILD` deixou de existir.
  A guarda de CSS do ADR-02 saiu do bash inline do CI e virou `visual-kit/scripts/check-css.mjs`, passo do
  `build` — agora vale local também. O CI caiu de oito passos para dois, e os dois passos mortos que a faxina
  tinha deixado (`@vislow/runtime build:runtime` e `test:packaging`) saíram.
  Novos: `turbo.json`, `vitest.shared.ts`, `vitest.build.config.ts`,
  `packages/visual-kit/scripts/check-css.mjs`, `packages/codegen/src/projectIdentity.test.ts`.
  **Nenhum comportamento do produto mudou:** o gate passou com as mesmas 14 assertivas do artefato (mais as 2 de
  identidade, que voltaram para a suíte rápida) — 230 testes no total, o mesmo baseline.

- **Próximo: Fase 4** — KPI Card com comparação, matriz manual MT-01…MT-14 (incluindo o Service) e E2E
  Playwright do editor.

**Há um só caminho.** Não existe mais pacote base pré-compilado, patch no browser nem reescrita de identidade:
a spec vira código, o `pbiviz` compila e o portão inspeciona. Se você encontrar referência a `buildPbiviz`,
`CONFIG_PLACEHOLDER` ou "Runtime Core" fora das seções marcadas como histórico no doc de MVP (3.1–3.3, 8.2, 8.3
e 9), é resíduo.

```bash
# De uma árvore limpa, um comando. O turbo compila o que falta, prepara o
# template do worker e sobe os dois — API em :3001, editor em :3000.
pnpm dev
```

**O editor precisa da API para exportar** — o empacotamento no browser acabou. Isso não é mais um passo manual:
`@vislow/api#dev` declara `stage:vendor` e o build dos pacotes como dependências, então `pnpm dev` não consegue
subir o editor sem a API pronta atrás dele. A URL da API sai de `NEXT_PUBLIC_VISLOW_API_URL`, com
`http://localhost:3001` como padrão.

Editar um pacote **não** faz hot reload: só os apps estão em watch. Depois de mexer em `packages/`, rode
`pnpm build` (ou reinicie o `pnpm dev`).
