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

## Estado

Gate de arquitetura **aprovado**. Fases 0 (fundação), 1 (Runtime Core) e 2 (editor web) **concluídas**.
O runtime foi validado no Power BI Desktop com dados reais: barras e KPI Card com cross-filter, tooltip nativo,
formatação por locale, alto contraste e estados vazio/erro. Pacote 131 KB.

**Fase 3 (export)** com o código concluído: `buildPbiviz` e `inspectPbiviz` em
`@vislow/config-schema/packaging`, botão do cabeçalho ligado com estados de erro, diálogo de instruções de
importação, e T-03…T-08 no CI. Falta a matriz manual MT-01…MT-08 no Power BI Desktop.

Próximo: **Fase 4** — KPI Card com a role `target`, acessibilidade e robustez.

```bash
pnpm dev                                        # editor em http://localhost:3000
pnpm verify                                     # typecheck + lint + testes
pnpm --filter @vislow/runtime build:runtime     # empacota + 11 guardas + copia o template para o editor
pnpm stage:template                             # só a copia, se o dist já existe
pnpm test:packaging                             # T-03…T-08 isolados
node packages/runtime/scripts/make-samples.mjs  # amostras para teste manual no Power BI
```

**O editor precisa do pacote base para exportar.** Ele busca `/templates/base-runtime.pbiviz`; rode
`pnpm --filter @vislow/runtime build:runtime` antes do `pnpm dev` numa árvore limpa.
