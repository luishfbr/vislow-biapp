# Vislow — contexto para agentes

Plataforma low-code que gera visuais customizados do Power BI (`.pbiviz`) sem que o usuário instale nada.

## Leia antes de escrever código

1. **[docs/padroes-de-engenharia.md](docs/padroes-de-engenharia.md)** — como construir. Regras verificadas por CI.
2. **[docs/doc-mvp-lowcode-pbi.md](docs/doc-mvp-lowcode-pbi.md)** — o quê e por quê. Requisitos (`RF-xx`),
   regras (`RN-xx`), decisões (`ADR-xx`), riscos (`R-xx`). O **Anexo A** lista erros já pagos — não os repita.

## Comandos

```bash
pnpm verify      # lint + typecheck + testes — rode antes de qualquer PR
pnpm test        # vitest
pnpm typecheck   # tsc -b (project references, ordem topologica)
pnpm build       # tsc -b + CSS do Tailwind
```

## Armadilhas que já custaram tempo

Todas descobertas empiricamente. Detalhes no Anexo A do doc de MVP.

- **Classe Tailwind construída por interpolação some sem erro** dentro do Power BI. O runtime é compilado antes
  de o usuário escolher qualquer coisa. Use sempre strings literais completas em `visual-kit/src/tokens.ts`.
- **Tailwind v4 usa prefixo de variante:** `pbi:flex`, não `pbi-flex`.
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
  diretório do projeto — por isso `packages/runtime` declara `ts-loader`, `scheduler`, os utils do Power BI e as
  dependências internas do Ajv explicitamente.
- **Coordenadas do `tooltipService` são relativas ao elemento do visual**, não à viewport.
- **Props opcionais de React declaram `prop?: T | undefined`** — `exactOptionalPropertyTypes` está ligado e
  proíbe repassar `undefined` explícito para `prop?: T`.
- **A reescrita de identidade no `.pbiviz` é UMA passada, com alternação de regex.** Duas passadas sequenciais
  (GUID, depois nome) duplicam o sufixo hex dentro dos GUIDs novos quando o slug do projeto coincide com o nome
  do pacote base — e `slugify("vislow Runtime")` produz exatamente esse slug.
- **Identidade primeiro, payload base64 depois.** Injetar antes é o que expõe o payload à reescrita.
- **`buildPbiviz` vive em `@vislow/config-schema/packaging`, fora do `index.ts`.** O Runtime Core importa o
  barril; reexportar levaria o JSZip para dentro do bundle do visual, contra o orçamento de 1 MB.
- **`Uint8Array` do TS 5.9 é genérico sobre `ArrayBufferLike`** e `BlobPart` só aceita `Uint8Array<ArrayBuffer>`.
- **O webpack do `pbiviz` usa `resolve.symlinks: false`, então dois symlinks para o mesmo pacote viram dois
  módulos.** Foi assim que o React entrou duas vezes no bundle e o dispatcher de hooks ficou `null` — só
  componentes com hook falhavam, o resto renderizava. Por isso `autoInstallPeers: false` e nenhum `react` nas
  `devDependencies` do `visual-kit`. **Não reintroduza**, e não adicione dependência duplicada entre pacotes que
  o runtime empacota.
- **Testes do runtime vivem em `packages/runtime/test/`, nunca em `src/`** — `src/` é compilado pela toolchain do
  `pbiviz`, cujo `tsconfig.json` lista os arquivos um a um.
- **`renderRealBundle.test.ts` é o único teste que executa o artefato.** Se você mexer no bundle, na resolução de
  módulos ou nas dependências do runtime, é ele que pega o estrago.
- **O `visual-kit` não usa hooks** — regra de ESLint, não convenção. Hook é o único ponto sensível à duplicação
  do React no bundle (achado 39): elementos JSX atravessam cópias, hooks não. Use classe (ver `ErrorBoundary`) ou
  calcule no render.
- **Todo pacote carrega uma impressão digital de build** (`stamp-build-id.mjs`, exibida no canto do visual e no
  card de erro). Ao diagnosticar qualquer coisa no Desktop, **peça o id primeiro** — sem ele, "importou o arquivo
  antigo" é indistinguível de "a correção não funciona", e isso já custou uma sessão inteira.

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
- **`@vislow/visual-kit/nodes` fica fora do barril** pelo mesmo motivo do `config-schema/packaging`: o Runtime
  Core importa o barril, e reexportar levaria o Recharts (~575 KB) para dentro do bundle dele.
- **A inspeção do artefato é portão, não teste** (ADR-11). O `pbiviz` já reportou sucesso produzindo pacote
  quebrado três vezes. Nada sai do worker sem passar por `inspectPbiviz`.
- **`compiledVisual.e2e.test.ts` é o gate de aceite** — herdeiro do `renderRealBundle`. Se você mexer no
  codegen, no template ou nos nós do kit, é ele que pega o estrago. Ele exige o template preparado
  (`pnpm build && pnpm stage:vendor`).

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

## Estado

**O pivô da ADR-08 está fechado.** Desde 2026-07-30 o ciclo completo funciona no Power BI Desktop: o usuário
compõe do zero no editor, a API compila um `.pbiviz` de verdade e o pacote importa e renderiza. O produto
prometido — o usuário **cria** o visual, não escolhe entre prontos — existe de ponta a ponta.

Gate de arquitetura **aprovado**. Fases 0 (fundação), 1 (Runtime Core) e 2 (editor web) **concluídas**.
O runtime foi validado no Power BI Desktop com dados reais: barras e KPI Card com cross-filter, tooltip nativo,
formatação por locale, alto contraste e estados vazio/erro. Pacote 131 KB.

**Fase 3 (export)** concluída no código e o ciclo completo **validado no Desktop em 2026-07-30**: pacote gerado
pelo editor importa, lê o modelo e renderiza barras com dados reais (MT-01 e MT-02 aprovados). O achado 39
(React duplicado) está fechado — a deduplicação basta, e o `visual-kit` ficou sem hooks como defesa em
profundidade.

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
- **Próximo: Sprint 6 (paridade de interatividade)** — o visual compilado renderiza dados corretamente, mas
  **não filtra, não mostra tooltip nativo, ignora alto contraste e não é navegável por teclado**. São seis
  capacidades que a Fase 1 já tinha aprovado no Desktop e que o pivô deixou para trás (achado 53). Vem antes do
  resto da Fase 4: a matriz MT-01…MT-14 tem cenários de cross-filter que hoje reprovariam.

**Ainda por aposentar:** `buildPbiviz`/`CONFIG_PLACEHOLDER` em `config-schema/packaging` e os testes T-03…T-08
não têm mais chamador desde o Sprint 5 — o editor não empacota no browser. `inspectPbiviz` **sobrevive**, é o
portão da ADR-11.

⚠️ **`packages/runtime` e os componentes `BarChart`/`KpiCard` do `visual-kit` NÃO podem ser apagados ainda**
(achado 53). Também estão sem chamador, mas são a única implementação de seis capacidades que o caminho novo
não tem — cross-filter, tooltip nativo, alto contraste, navegação por teclado, menu de contexto e aviso de
truncamento. Apagá-los destrói a referência antes de a portabilidade existir. Ver o Sprint 6 no doc de MVP.

```bash
# Numa árvore limpa, nesta ordem:
pnpm build && pnpm stage:vendor  # compila os pacotes, o CSS e prepara o template do worker
pnpm dev:api                     # API de build em http://localhost:3001
pnpm dev                         # editor em http://localhost:3000

pnpm verify                      # typecheck + lint + testes
pnpm test:build                  # gate de aceite: spec -> .pbiviz compilado -> render em jsdom

# Caminho antigo (Fase 3), sem chamador desde o Sprint 5 — ver "ainda por aposentar"
pnpm --filter @vislow/runtime build:runtime     # empacota + 11 guardas
pnpm test:packaging                             # T-03…T-08 isolados
node packages/runtime/scripts/make-samples.mjs  # amostras para teste manual no Power BI
```

**O editor precisa da API para exportar.** O empacotamento no browser acabou: `pnpm dev:api` tem de estar no
ar, com o template preparado (`pnpm build && pnpm stage:vendor`). A URL da API sai de
`NEXT_PUBLIC_VISLOW_API_URL`, com `http://localhost:3001` como padrão.
