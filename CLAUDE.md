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

## Planejamento: todo plano passa pelo `grilling`

**Antes de apresentar qualquer plano de implementação** — feature nova, refatoração, sprint, mudança de
arquitetura —, invoque a skill **`grilling`** (`.claude/skills/grilling/`) e conduza a entrevista com ela: uma
pergunta por vez, cada uma com a sua recomendação, descendo a árvore de decisão até o entendimento comum. Só
depois escreva o plano. Fato que dá para descobrir lendo o repo você descobre sozinho; **decisão é do usuário**.

Vale também quando o plano nasce dentro do plan mode: o `grilling` vem **antes** do `ExitPlanMode`, nunca
depois. O usuário pode disparar a mesma coisa à mão com `/grill-me`.

O `grilling` decide **o que** construir. As duas skills de frontend abaixo decidem **como a UI fica** — quando a
feature mexe em UI, os três rodam, nesta ordem: `grilling` → `frontend-design` → código → `web-design-guidelines`.

## Frontend: as duas skills são obrigatórias

**Toda feature que cria ou reformula UI** — em `apps/web` **ou** em `packages/visual-kit` — usa as duas skills
de `.claude/skills/`, nesta ordem: **`frontend-design` antes** da primeira linha de JSX (plano de direção
visual), **`web-design-guidelines` depois**, sobre o diff (auditoria, achados em `arquivo:linha`). Design depois
do código é retrabalho: a estrutura do JSX já congelou o layout.

Não é polimento opcional — tem item próprio no Definition of Done. **As invariantes deste repo vencem qualquer
sugestão da skill**; a tabela de precedência está em [docs/frontend.md](docs/frontend.md).

## Invariantes que valem em qualquer arquivo

As específicas de área estão nos docs acima. Estas seis quebram código em qualquer lugar do repo:

- **Classe do `visual-kit` é string literal completa, e leva o prefixo `vsl-`.** Interpolação produz um nome que
  não existe no `styles.css`, e navegador nenhum reclama de classe inexistente: o estilo some dentro do Power BI
  sem erro. **Cor e medida são as exceções**: valor livre, aplicado por `style` inline, nunca por classe.
  (O prefixo era `pbi:` até a spec 4.0.0, quando o kit ainda usava Tailwind — com ele morreu a regra de que o
  prefixo vinha antes da variante.)
- **O CSS do kit é escrito à mão** (`packages/visual-kit/src/styles.css`) e só contém escolha-entre-alternativas.
  Valor mora em `packages/config-schema/src/design.ts`; estrutura, no CSS. Os dois nunca falam da mesma coisa,
  e é isso que os impede de divergir. `scripts/check-css.mjs` confere nos **dois** sentidos: classe usada sem
  regra, e regra sem uso.
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
de build, editor de composição, paridade de interatividade, faxina do caminho antigo, migração para Turborepo,
o **canvas de posicionamento livre** (ADR-18), o **kit autoral** (spec 5.0.0) e o **KPI Card** (spec 5.2.0).
Pacote **95,2 KB**, `content.js` **292,4 KB**.

**O catálogo tem TRÊS componentes desde 2026-08-06** (spec 5.2.0): `container`, `text` e `kpi`. Entre
2026-08-05 e essa data foram só dois — a poda da 5.0.0 tirou o KPI e os quatro gráficos, e o Recharts saiu
com eles (daí a queda de 62% no `content.js`, que o KPI não desfez: ele custou 4,3 KB). Remoção de schema
exige major (RN-12), e **não há migração 4→5**: `migrate.ts` foi apagado e a chave do `localStorage` pulou
para `vislow:project:v5`, então o projeto antigo continua no navegador e nunca mais é lido. Nada é descartado
em silêncio porque nada é tentado. A 5.2.0 é aditiva e **não** mexe nessa chave.

**O poço de campos VOLTOU com o KPI.** Ele é o único nó que consome dados, e declara **dois papéis de
medida**: `valueRole` (obrigatório) e `compareRole` (opcional). Uma árvore só de `container` e `text` continua
gerando o pacote de antes, com `dataRoles: []`.

**O que isso descongelou e o que continua congelado**, e vale saber antes de procurar teste que não existe:
`dataRoles`, `requiredTypes`, a proibição de `min`, o estado vazio (RF-20), o tooltip nativo (RF-19), o menu de
contexto (RF-24) e o teclado como *alcançável e rotulado* (RF-23 parcial) voltaram. **Filtro cruzado (RF-18) e
aviso de truncamento (RF-25) continuam sem sujeito** — os dois dependem de `column.category`, e um card de
número único não declara agrupamento nem tem marca para clicar. A quarentena restante está declarada em
`compiledVisual.e2e.test.ts`.

**Achado aberto (RF-17):** o `format` da coluna chega ao número, mas os **separadores saem em `en-US`** mesmo
com `host.locale` em pt-BR. O `formattingService` só conhece culturas se
`powerbi-visuals-utils-formattingutils/lib/globalize/globalize.cultures` for importado, e essa tabela pesa
1,17 MB — estouraria o `content.js`. Não é regressão do KPI: o caminho é o mesmo desde a spec 3.0.0, e ficou
invisível porque o teste da 4.x media `120`, abaixo de mil. Está documentado por extenso no e2e.

**A linguagem visual do kit é "papel, não tinta"** (`packages/config-schema/src/design.ts`). Nenhum valor dela
é cromático: numa ferramenta de composição a cor é do autor do relatório, e o que é nosso é o neutro exato em
que ele a põe. A rampa tem cast **verde**, não azul, e `PAPER` não é branco — um componente Vislow se separa da
tela do relatório por **tom e fio**, nunca por elevação, porque tom e fio sobrevivem a PDF e a impressão. A
assinatura é tipografia óptica: entrelinha e tracking **respondem ao `fontSize`** (`leadingFor`/`trackingFor` em
`visual-kit/src/tokens.ts`), sem controle nenhum a mais.

O container tem duas disposições: `stack` empilha como sempre, `canvas` dá a cada filho uma caixa em `%` do pai,
arrastável e redimensionável no preview. Raiz de projeto novo nasce canvas; spec já salva continua empilhando.

**O canvas trabalha como um editor de desenho** (desde 2026-08-04). Não há mais grade obrigatória — o valor é
livre em pixel e o encaixe é uma atração de 6px por aresta ou centro de irmão. Pressionar já seleciona **e**
arrasta no mesmo gesto; `Shift` tranca o eixo ou preserva a proporção, `Ctrl/⌘` solta do encaixe, `Alt` duplica
arrastando. Clicar no vazio **limpa a seleção** (`selectedId` é `string | null`) e o painel da direita passa a
falar do projeto. A câmera tem zoom de 10% a 400% e deslocamento (`lib/viewport.ts`). Duplo clique **entra** num
container aninhado; `Esc` sobe. Há desfazer e refazer, e **um arrasto é um passo**, não duzentos.

O preview desenha uma **prancheta de tamanho declarado** (`project.artboard`, 100×100 a 1920×1080, padrão
1280×720), em pixel real e reduzida por escala para caber no painel. **Ela é do editor e não vai para o pacote**
— um visual do Power BI não escolhe o próprio tamanho, e um teste do codegen reprova o build se ela vazar.

**Toda medida é pixel livre** (desde a spec 4.0.0). `padding`, `gap`, `radius`, `borderWidth` e `fontSize` são
`kind: 'length'` no registro — número inteiro, digitável, com arrasto no rótulo para ajustar. Chegam ao visual
compilado por `style` inline, como a cor. O catálogo de tokens ficou só com o que é escolha entre alternativas:
peso, alinhamento horizontal, alinhamento vertical e sombra.

**A Caixa de Texto tem onze campos, e a escolha não foi estética:** eles cobrem os **seis** tipos de
`FieldSpec` (`text`, `length`, `token`, `color`, `boolean`, `select`), então um componente só exercita ponta a
ponta todo o caminho genérico que o painel, o schema e o codegen percorrem. O que passar nela passa para
qualquer componente futuro.

**O KPI Card tem vinte e sete campos, em seis seções** (spec 5.2.0, RF-16). O controle é **por linha** — valor,
rótulo e variação têm tamanho, peso e cor independentes —, e é por isso que `FieldBase` ganhou `group`: os
**dois** painéis o leem, o do editor como cabeçalho de seção e o do Power BI como `FormattingGroup` de verdade.
Campo sem grupo cai num bloco inicial sem título, então `container` e `text` desenham exatamente como
desenhavam. Com `role`, o card cobre **sete dos oito** tipos de `FieldSpec`; só `number` segue dormente.

Três decisões do card que não são estéticas:

- **A direção nunca depende da cor.** Seta (`aria-hidden`) e sinal aritmético aparecem sempre. Cor sozinha não
  comunica direção para daltônicos, e em alto contraste as duas cores do autor podem virar a mesma.
- **`polarity` separa direção de juízo** (`higher`/`lower`/`neutral`). Num KPI de custo ou churn a queda é boa:
  a seta continua para baixo e a cor de favorável é que se aplica. As duas cores **nascem acromáticas**
  (`INK_MUTED`) — verde e vermelho por padrão exigiriam valor cromático em `design.ts`.
- **Base zero não vira `Infinity`**, e o denominador do percentual é `|base|`: com base negativa, dividir pelo
  número cru inverteria o sinal do percentual em relação ao da seta.

**`suggestRoleBindings` voltou** (`factory.ts`), e é o editor que a chama em `addNode`/`addNodeAt`: um KPI
nasce ligado à primeira medida livre, porque tela vazia parece defeito. Sem coluna do tipo certo o campo fica
pendente e o export trava — que aí é a informação correta (RF-12).

O projeto tem uma **tabela de dados de exemplo** (`spec.data`, spec 3.0.0): até 10 colunas e 50 linhas, cada
coluna com um tipo declarado (`text`, `integer`, `decimal`, `percent`, `currency`, `date`, `boolean`). **A
coluna É o campo** — não existe lista paralela de papéis. Do lado do editor ela formata o preview; do lado do
pacote ela vira um `dataRole` com `requiredTypes` (o Power BI recusa o arrasto do tipo errado) e
`conditions.max: 1`. **Nunca `min`** — já tentamos, e o host descarta todo arrasto em silêncio, porque uma
condição única com `min: 1` em todos os papéis descreve só o estado final. Quem responde por "falta campo" é o
`EmptyState` do visual. O papel agrupar/somar sai do tipo e é trocável — um "Ano" é inteiro e ainda assim
agrupa.

**Os VALORES da tabela não entram no pacote**, pela mesma regra da prancheta: dois testes reprovam o vazamento,
um no fonte gerado e outro no bundle compilado. O que viaja é só o esquema.

**O visual gerado tem painel de formatação desde 2026-08-06** (spec 5.1.0, RF-28, ADR-20) — e ele é **FECHADO
por padrão**. O nó ganhou `name` (apelido, que vira o título do card) e `exposed` (as chaves que o autor
publicou); cada nó publicado vira um `object` no `capabilities.json` com o **id do nó** como `objectName`, mais
`supportsEmptyDataView: true` — sem essa chave, com `dataRoles: []`, o painel aparece e o valor nunca chega ao
`update()`. O `getFormattingModel` é escrito à mão contra os tipos que **já vêm no `powerbi-visuals-api@5.11.1`**
(zero dependência nova no pacote, ADR-19 intacto) e mora **estático** em `visual-template/template/src/formatting.ts`,
ao lado do `interaction.ts`; o codegen emite só DADO, a tabela `FORMATTING`.

Duas consequências que valem saber antes de mexer:

- **Projeto que não publica nada gera o pacote de antes, byte a byte** — sem `objects`, sem
  `supportsEmptyDataView`, sem `getFormattingModel`, com JSX só de literais. Há teste afirmando isso.
- **Campo fechado sai literal no JSX e não tem por onde ler o `objects`**: ignorar override é propriedade
  estrutural, não verificação em runtime. `placement` nunca é publicável (`structural: true` no descritor) —
  é o codegen que o lê para decidir se embrulha os filhos em `CanvasSlot`.

**Próximo — o que resta da Fase 4:** matriz manual MT-01…MT-14 (incluindo o Service), E2E Playwright do editor
e a decisão sobre o separador de locale da RF-17 (o achado aberto acima). Filtro cruzado (RF-18) e truncamento
(RF-25) esperam o primeiro nó que declare papel de **agrupamento** — não há como devolvê-los com um card de
número único.

O detalhe de cada sprint está em [docs/history.md](docs/history.md); não é preciso lê-lo para trabalhar.
