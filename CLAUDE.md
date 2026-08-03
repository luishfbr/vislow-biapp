# Vislow — contexto para agentes

Plataforma low-code que gera visuais customizados do Power BI (`.pbiviz`) sem que o usuário instale nada. O
usuário **compõe** uma árvore de componentes no editor; a API compila um projeto `pbiviz` de verdade e devolve o
pacote. **Há um só caminho** — não existe pacote base pré-compilado nem patch no browser.

## Qual doc ler

Não leia tudo. Leia o da tarefa:

| Vou mexer em… | Leia |
|---|---|
| editor, preview, qualquer JSX ou CSS | [docs/frontend.md](docs/frontend.md) |
| API de build, codegen, template | [docs/backend.md](docs/backend.md) |
| `pbiviz`, bundle, CSS compilado, o portão, o gate | [docs/build-visual.md](docs/build-visual.md) |
| decidir escopo, ou "o produto deve fazer isso?" | [docs/requirements.md](docs/requirements.md) |
| pacote novo, fronteira entre pacotes, ADR, risco | [docs/architecture.md](docs/architecture.md) |
| convenção, teste, turbo, abrir PR, Definition of Done | [docs/engineering.md](docs/engineering.md) |
| "por que isso ficou assim?" e nada acima responde | [docs/history.md](docs/history.md) |

`apps/web`, `apps/api` e `packages/visual-kit` têm um `CLAUDE.md` próprio com as invariantes daquele subtree.

## Comandos

```bash
pnpm dev         # sobe TUDO: compila o que falta, prepara o template, API :3001 + editor :3000
pnpm build       # pacotes + apps + stage:vendor + stage:deps
pnpm verify      # build + typecheck + lint + suíte rápida — rode antes de qualquer PR
pnpm check       # o verify MAIS o gate de aceite (compila um .pbiviz de verdade)
pnpm clean       # apaga dist/, vendor/, .next/ e o cache do turbo
```

A ordem vive no `turbo.json` e vale igual aqui e no CI (ADR-17). Os scripts `lint` e `test` da raiz são as
**implementações** que o turbo invoca — chamá-las direto pula a ordenação. Use `pnpm verify`.

**Editar um pacote não faz hot reload:** só os apps estão em watch. Depois de mexer em `packages/`, rode
`pnpm build` ou reinicie o `pnpm dev`.

**A build não usa a rede** (ADR-19). As dependências do visual gerado são instaladas uma vez por `stage:deps`,
em `packages/visual-template/deps/`, e cada build monta o `node_modules` por **hardlink** — nunca symlink, que
reintroduziria o achado 39. Passo novo que precise de rede está no lugar errado: vai para o preparo.

## Frontend: as duas skills são obrigatórias

**Toda feature que cria ou reformula UI** — em `apps/web` **ou** em `packages/visual-kit` — usa as duas skills
de `.claude/skills/`, nesta ordem: **`frontend-design` antes** da primeira linha de JSX (plano de direção
visual), **`web-design-guidelines` depois**, sobre o diff (auditoria, achados em `arquivo:linha`). Design depois
do código é retrabalho: a estrutura do JSX já congelou o layout.

Não é polimento opcional — tem item próprio no Definition of Done. **As invariantes deste repo vencem qualquer
sugestão da skill**; a tabela de precedência está em [docs/frontend.md](docs/frontend.md).

## Invariantes que valem em qualquer arquivo

As específicas de área estão nos docs acima. Estas seis quebram código em qualquer lugar do repo:

- **Classe Tailwind é string literal completa.** Interpolação some sem erro dentro do Power BI — o CSS é
  pré-compilado e só enxerga o fonte do `visual-kit`.
- **O prefixo vem ANTES da variante:** `pbi:focus:ring-2`, nunca `focus:pbi:ring-2`. Ao contrário, o CLI não
  gera regra nenhuma e não reclama. Classe com variante se confere no `dist/styles.css`, não no olho.
- **`innerHTML` é proibido** — pelo nosso ESLint e pelo lint oficial do `pbiviz`, que falha o build.
- **Discriminante de união é string (`kind`), nunca booleano.** A toolchain do `pbiviz` compila sem
  `strictNullChecks`, e sem ela o TypeScript não estreita união por discriminante booleano.
- **Props opcionais de React declaram `prop?: T | undefined`** — `exactOptionalPropertyTypes` está ligado.
- **Ao diagnosticar qualquer coisa no Power BI Desktop, estabeleça a procedência do pacote primeiro.** "Importou
  o arquivo antigo" é indistinguível de "a correção não funcionou" — isso já custou uma sessão inteira. Desde
  2026-08-03 **o `buildId` não é mais legível da tela**: o selo do canto foi removido a pedido, e ele só
  reaparece no card de erro de renderização. Confirme por fora — reexportar na hora, conferir a data do arquivo
  ou o `buildId` no `content.js` do zip — antes de concluir qualquer coisa.

**O padrão de falha desta toolchain é o silêncio.** `pbiviz package` já reportou sucesso produzindo pacote
quebrado três vezes. Quando escrever uma guarda, quebre o que ela protege de propósito e confirme que ela morde:
guarda que nunca falhou não é guarda verificada.

## Estado

O ciclo completo funciona no Power BI Desktop desde 2026-07-30: o usuário compõe do zero, a API compila um
`.pbiviz` de verdade, o pacote importa e renderiza. Desde 2026-07-31 o visual compilado também **filtra o
relatório, mostra tooltip nativo, respeita alto contraste, é navegável por teclado e abre o menu de contexto**.

Concluídos: fundação e primeiro editor (depois substituídos pelo pivô da ADR-08), registro de componentes, API
de build, editor de composição, paridade de interatividade, faxina do caminho antigo, migração para Turborepo e
o **canvas de posicionamento livre** (ADR-18). Pacote **221,1 KB**, `content.js` **751,3 KB**.

O container tem duas disposições: `stack` empilha como sempre, `canvas` dá a cada filho uma caixa em `%` do pai,
arrastável e redimensionável no preview. Raiz de projeto novo nasce canvas; spec já salva continua empilhando.

O preview desenha uma **prancheta de tamanho declarado** (`project.artboard`, 100×100 a 1920×1080, padrão
1280×720), em pixel real e reduzida por escala para caber no painel. **Ela é do editor e não vai para o pacote**
— um visual do Power BI não escolhe o próprio tamanho, e um teste do codegen reprova o build se ela vazar.

O projeto tem uma **tabela de dados de exemplo** (`spec.data`, spec 3.0.0): até 10 colunas e 50 linhas, cada
coluna com um tipo declarado (`text`, `integer`, `decimal`, `percent`, `currency`, `date`, `boolean`). **A
coluna É o campo** — não existe lista paralela de papéis. Do lado do editor ela formata o preview; do lado do
pacote ela vira um `dataRole` com `requiredTypes` (o Power BI recusa o arrasto do tipo errado) e
`conditions.min: 1` (o host segura o visual enquanto faltar campo). O papel agrupar/somar sai do tipo e é
trocável — um "Ano" é inteiro e ainda assim agrupa.

**Os VALORES da tabela não entram no pacote**, pela mesma regra da prancheta: dois testes reprovam o vazamento,
um no fonte gerado e outro no bundle compilado. O que viaja é só o esquema.

**Próximo — Fase 4:** KPI Card com comparação, matriz manual MT-01…MT-14 (incluindo o Service) e E2E Playwright
do editor.

O detalhe de cada sprint está em [docs/history.md](docs/history.md); não é preciso lê-lo para trabalhar.
