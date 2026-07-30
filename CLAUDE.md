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

## Estado

Gate de arquitetura **aprovado**. Fases 0 (fundação), 1 (Runtime Core) e 2 (editor web) **concluídas**.
O runtime foi validado no Power BI Desktop com dados reais: barras e KPI Card com cross-filter, tooltip nativo,
formatação por locale, alto contraste e estados vazio/erro. Pacote 131 KB.

Próximo: **Fase 3 — export** (`buildPbiviz` em `config-schema` + botão do cabeçalho + testes T-03…T-08).

```bash
pnpm dev                                        # editor em http://localhost:3000
pnpm verify                                     # typecheck + lint + testes
pnpm --filter @vislow/runtime build:runtime     # empacota + 11 guardas do .pbiviz
node packages/runtime/scripts/make-samples.mjs  # amostras para teste manual no Power BI
```
