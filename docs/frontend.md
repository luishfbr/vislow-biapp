# Frontend — o editor e os componentes que desenham

Duas superfícies que o usuário enxerga: **`apps/web`**, onde ele compõe, e **`packages/visual-kit`**, que
desenha tanto o preview quanto o visual compilado. Leia antes de escrever JSX ou CSS em qualquer uma das duas.

## 1. As duas skills são obrigatórias

**Toda feature que cria ou reformula UI passa pelas duas skills de `.claude/skills/`.** Não é polimento
opcional: tem item próprio no Definition of Done. O motivo é o princípio 4 da casa — *o preview é o produto*. Um
editor que parece formulário genérico não convence ninguém a compor um visual nele, e um visual que destoa do
relatório em volta é devolvido antes de qualquer bug.

| Skill | Quando | O que entrega |
|---|---|---|
| **`frontend-design`** | **Antes** da primeira linha de JSX ou CSS | Direção visual deliberada: paleta nomeada (4–6 hex), tipografia por papel, conceito de layout, elemento-assinatura — com o passo de autocrítica que rejeita o que sair templated |
| **`web-design-guidelines`** | **Depois**, sobre os arquivos do diff | Auditoria contra as Web Interface Guidelines (foco visível, semântica, estados, formulários, movimento, contraste), com achados em `arquivo:linha` |

**A ordem não é negociável:** plano de design → implementar seguindo o plano → auditar o diff → resolver cada
achado ou justificá-lo por escrito no PR. Design depois do código é retrabalho, porque a estrutura do JSX já
congelou as decisões de layout que a etapa 1 existia para tomar.

Instaladas por cópia, com origem e hash em [`skills-lock.json`](../skills-lock.json); atualização por
`npx skills update`, em PR próprio. `.claude/skills/` e `.agents/skills/` são a mesma coisa — **nunca edite uma
sem a outra**. O `web-design-guidelines` busca as regras pela rede a cada uso; sem rede ele falha, e isso é
problema a resolver, não dispensa da auditoria.

### 1.1 As invariantes deste repo vencem a skill

O `frontend-design` foi escrito para páginas livres. Este repo tem restrições que não são estéticas — são o
preço já pago por falhas silenciosas dentro do Power BI. **Quando colidirem, a invariante vence e a skill se
adapta.**

| A skill sugere | Aqui vira |
|---|---|
| Cor livre no CSS | Hex validado, aplicado por `style` inline — cor **nunca** vira classe |
| Classe utilitária escrita na hora | No editor, à vontade (Tailwind). No `visual-kit`, string literal completa no mapa de `src/tokens.ts`, prefixo `vsl-`, e a regra correspondente escrita à mão em `src/styles.css` — a guarda reprova classe sem regra **e** regra sem uso |
| Família tipográfica característica | O `visual-kit` **declara uma pilha** em `.vsl-text` desde a spec 5.0.0 — Aptos antes de Segoe UI, para não parecer visual nativo. Não é token e o usuário não escolhe: embarcar fonte não cabe no orçamento de 1 MB e a build não usa rede. Escolher a **ordem** da pilha é a única identidade tipográfica disponível |
| Paleta de acento para o visual | Não existe, e é uma posição: a linguagem do kit é **"papel, não tinta"** (`config-schema/src/design.ts`). Nenhum valor dela é cromático — numa ferramenta de composição a cor é do autor do relatório, e o que é nosso é o neutro exato em que ele a põe |
| Micro-interação com estado | No `visual-kit`, sem hooks — classe, ou cálculo no render |
| Wrapper clicável para seleção | Em container que empilha, não: quebra a medida do `ResponsiveContainer` (ADR-14). Em canvas, a camada é filha `absolute` e está fora do fluxo (ADR-18) |
| Componente pronto copiado da internet | Só no estilo `base-nova`. Os primitivos daqui são **Base UI, não Radix** — trecho Radix não compila, e o erro não aponta para a causa. Ver [1.3](#13-o-sistema-de-design-do-editor-componentsui) |
| Paleta escrita direto no componente | Token em `globals.css`. E o editor tem **três** estados de problema, não dois: `--warning` âmbar (campo pendente, o estado normal de quem está compondo) não é `--destructive` |

### 1.2 O que a auditoria não dispensa

O `web-design-guidelines` cobre UI genérica da web. Ele **não sabe** o que o Power BI exige:

- **Alto contraste** — ver [3.2](#32-alto-contraste-html-usa-a-variável-svg-lê-o-quadro).
- **Teclado nos gráficos** — sobreposição de botões, não `tabIndex` no SVG. Ver [3.3](#33-teclado-é-uma-sobreposição-de-botões).
- **O estado vazio e o de erro.** O visual nunca renderiza em branco (RN-04). Um design que só previu o caminho
  feliz está incompleto, por mais bonito que esteja.

### 1.3 O sistema de design do editor (`components/ui/**`)

O editor usa shadcn no estilo **`base-nova`**, que é construído sobre **`@base-ui/react`**. Isto vale só para
`apps/web`: o `visual-kit` continua sem dependência de UI e sem hooks (ver [3.1](#31-o-kit-não-usa-hooks)).

**Não existe Radix neste repositório** — `grep '@radix-ui' pnpm-lock.yaml` devolve zero. Quase todo exemplo de
shadcn que se acha na internet é da variante Radix, e as APIs divergem em silêncio:

| Radix (não use) | Base UI (é o que temos) |
|---|---|
| `asChild` | `render={<Componente />}` |
| `<X.Content>` | `<X.Positioner>` + `<X.Popup>` |
| `data-state="open"` | `data-open` |

- **Os arquivos de `apps/web/src/components/ui/**` são código de terceiro.** `shadcn add` e `shadcn diff` os
  reescrevem. Por isso o `eslint.config.mjs` tem um recorte só para eles — a folga fica na fronteira, não dentro
  dos arquivos. **O que não sai do recorte:** `no-restricted-properties` e `no-restricted-syntax`. A proibição de
  `innerHTML` (RN-11) não tem exceção por origem do código, e o lint oficial do `pbiviz` também não perdoa.
- **Editar um arquivo de `ui/` à mão perde a edição no próximo `shadcn diff`.** Divergência intencional mora num
  wrapper fora de `ui/`.
- **`components.json` diz `baseColor: "neutral"` e isso está desatualizado** — a rampa real foi reafinada à mão.
  Um `shadcn add` que reemita variável de CSS vai emitir a paleta errada: confira o diff de `globals.css` toda
  vez que rodar o CLI.
- **Ícone que depende do tema troca por CSS, nunca por JS.** O `ThemeToggle` usa `dark:hidden` e
  `hidden dark:block`. Ler `resolvedTheme` devolve `undefined` no servidor, e o preço é mismatch de hidratação ou
  um piscar atrás de um `mounted`.
- **`attribute="class"` no `ThemeProvider` é contrato com o `@custom-variant dark` do `globals.css`.** Mudar um
  sem o outro desliga o modo escuro inteiro, sem erro.
- **O par de `themeColor` em `layout.tsx` é hex literal, gêmeo manual de `--background`** — a `<meta>` é lida
  antes de existir CSS. Mudar a rampa exige mudar o par junto, e nenhum teste guarda isso.
- **Teste que monta popup do Base UI ou consumidor do next-themes precisa do stub de `window.matchMedia`.** O
  jsdom não implementa; sem o stub o componente simplesmente não monta, e a mensagem não diz o motivo. Precedente
  em `Header.test.tsx`.
- **Versão fixa, sem `^` nem `~`**, como todo o resto do repo (engineering.md §2).

## 2. O editor (`apps/web`)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Vislow │ ↖ │ ▭ ▤ ▦ T ⬤ ⊞ ⌾ │  Nome: [________]  │ ☀ ⋯ │ [ Baixar .pbiviz ]  │
├──────────────────┬────────────────────────────────────┬───────────────────────┤
│  COMPOSIÇÃO ↑↓✕  │        PREVIEW (visual-kit)        │  PROPRIEDADES         │
│  (camadas)       │  render ao vivo com sampleFrame    │  ┌ sem seleção ────┐  │
│╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│   prancheta em px, escalada        │  │ PRANCHETA       │  │
│  DADOS DE EXEMPLO│                                    │  │ L 1280 ┃ A 720  │  │
│  (campos)        │              ╭───────────────╮     │  │ [16:9][4:3][1:1]│  │
│                  │              │ − 62 % + ⛶   │     │  └─────────────────┘  │
├──────────────────┴──────────────╰───────────────╯─────┴───────────────────────┤
│ 7 componentes · 4 campos · 2 pendências      v1.0.0.0 · exportado 14:32        │
└───────────────────────────────────────────────────────────────────────────────┘
   ↕ arrastável         ↕ divisor arrastável              ↕ arrastável
```

**A regra do shell é uma só: esquerda = o que EXISTE, direita = o que está SELECIONADO** (ou o projeto, quando
`selectedId` é `null`). A paleta deixou de ser um painel e virou barra de ferramentas no topo — no modelo de
editor de desenho, uma ferramenta fica armada e o próximo arrasto na prancheta desenha a caixa.

**A barra do rodapé é do EDITOR e nunca do pacote.** Ela responde à pergunta do achado 40 — "o arquivo que
importei no Desktop veio desta tela?" — e não reintroduz o `BuildStamp`, que foi removido do visual compilado a
pedido em 2026-08-03. A hora do último export é de sessão, não persistida: um horário lido do `localStorage` no
dia seguinte responderia com confiança a pergunta errada.

**Mostrar/ocultar coluna mora na barra do topo** (`PanelToggles`), junto do seletor de tema — os dois mudam a
vista, não o projeto. A primeira versão flutuava em `absolute` sobre a área de trabalho e, com a coluna aberta,
cobria o conteúdo dela; ancorar na borda do canvas só mudaria o problema de lugar, porque na faixa estreita a
coluna aberta vira gaveta sobre o canvas. **Controle de vista que precisa de `absolute` para existir está no
lugar errado**, e `PanelToggles.test.tsx` reprova `absolute` e `z-` no componente.

**Três faixas de largura, declaradas em `app/page.tsx`:** ≥1280 acrescenta o rótulo do campo de nome; ≥1024 tem
as duas colunas ancoradas, arrastáveis e recolhíveis; ≥768 põe a prancheta em largura cheia e transforma coluna
aberta em **gaveta sobre** ela, recolhida por padrão; abaixo de 768 o editor não se oferece
(`SmallScreenNotice`). O painel de propriedades é instrumento de precisão — grade de duas colunas, arrasto de
4px por passo no rótulo, alças de 8px — e nada disso sobrevive a um alvo de toque de 44px sem virar outro
produto.

**A escolha coluna-ou-gaveta é a única responsividade em JavaScript** (`lib/useMediaQuery.ts`). O resto é
classe, e é assim que tem de ser. A exceção existe porque o grupo de painéis calcula largura em JS: se a coluna
é coluna ou gaveta é decisão de **estrutura**, e o CSS não tem como devolver essa resposta ao grupo.

**Nada nesta tela é escrito à mão por tipo ou por propriedade.** Paleta, painel e preview saem todos de
`NODE_DESCRIPTORS` (ADR-09) — a mesma fonte do schema e do codegen. Um tipo novo aparece nos três lugares no
commit em que passa a existir. **Uma lista paralela é a quinta cópia do catálogo e a primeira a divergir.**

- Onde o componente novo entra: **dentro** da seleção quando ela aceita filhos, senão logo **depois**, como
  irmão. A seleção passa a ser o nó novo.
- O marcador de pendência acende no nó **e em todos os seus ancestrais**: com a árvore recolhida, marcar só o nó
  defeituoso deixaria o export bloqueado sem indício de onde (RF-12).
- **`lib/nodeComponents.ts` é o gêmeo por referência do que o codegen faz por texto.**
  `nodeComponents.test.ts` compara o nome da função com `descriptor.component` — é a única coisa ligando os dois
  caminhos.

### 2.1 A prancheta

O preview desenha uma **prancheta de tamanho declarado** (`project.artboard`, 100×100 a 1920×1080, padrão
1280×720), reduzida por escala uniforme para caber no painel.

**O controle mora no painel do PROJETO** — o estado do painel da direita quando não há nada selecionado. Ele
nunca foi propriedade de um nó: não vem do descritor, não vai para o pacote, e é a moldura em que tudo é
desenhado. (Até 2026-08-04 ele ficava nas propriedades da raiz, porque não existia "nada selecionado" — a
seleção era `string` e caía na raiz.)

**A escala fica sob o preview, não no painel.** Ela descreve a câmera e não o projeto — muda ao redimensionar a
janela e ao girar a roda, sem ninguém ter editado nada. Quem *muda* o tamanho é a prancheta; a escala só relata
o que se está vendo.

- **Ela não vai para o pacote.** Um visual do Power BI não escolhe o próprio tamanho — quem arrasta a moldura é
  o autor do relatório, e o `visual.tsx` gerado continua `w-full h-full`. `codegen.test.ts` reprova o build se
  qualquer arquivo emitido mencionar a prancheta, e a fixture do gate carrega uma de propósito para que o teste
  não passe por ausência.
- **Por que declarar um tamanho, então.** A geometria dos nós é proporcional (`NodeRect`), mas a tipografia não:
  um texto de 12px ocupa metade de uma caixa de 25% numa prancheta de 640 e um oitavo dela numa de 1920. Sem
  tamanho, o preview desenhava uma proporção e o usuário adivinhava a escala — 1920×1080 e 640×360 saíam
  idênticos e produziam composições diferentes.
- **Px real, com escala por `transform`** — que **não** altera o tamanho de layout. Os gráficos continuam
  medindo a prancheta em pixel declarado, então o que o Recharts calcula no editor é o que ele calcularia numa
  moldura daquele tamanho.
- **O arrasto sobrevive à escala sem saber dela.** O `CanvasOverlay` divide o deslocamento do ponteiro pela caixa
  lida no `pointerdown`, e `getBoundingClientRect` já devolve a caixa **transformada**: as duas medidas vivem no
  mesmo espaço e a razão não muda.
- **O ENQUADRAMENTO nunca amplia** (`fitToPane` → `fitScale`, teto de 1). Prancheta menor que o painel fica
  pequena — ampliar 100×100 até preencher faria um texto de 12px parecer título, que é a mentira que declarar o
  tamanho existe para evitar. O **zoom** amplia até 400%, porque ali a ampliação é escolha visível e não efeito
  colateral do enquadramento.
- **O campo é opcional no schema.** Projeto salvo antes dele continua válido e recebe o default por
  `artboardOf(spec)` — nunca leia `project.artboard` direto, pelo mesmo motivo do `hostOf(frame)`.
- **`clampArtboard` prende, `validateSpec` reprova** — a mesma divisão do `clampRect`: quem chama o primeiro é
  um campo de formulário, e digitar 5000 quer dizer "o maior que der".

### 2.1.1 A câmera

`lib/viewport.ts` — `{ scale, tx, ty }`, escala de 10% a 400%, deslocamento em pixel de tela. Antes de
2026-08-04 não havia câmera: a escala era só "cabe no painel" e travava em 100%, então numa prancheta de 1920
nada podia ser inspecionado de perto e julgar um detalhe exigia exportar.

- **`zoomAt` mantém fixo o ponto sob o cursor.** É o que separa um zoom utilizável de um inútil — ampliando pelo
  centro, quem quer olhar um canto amplia e depois procura, a cada entalhe da roda.
- **No limite, a prancheta não desliza.** A roda continua girando depois de bater no teto; sem a guarda, cada
  entalhe extra recalcularia o deslocamento com escala igual e a prancheta sairia andando sob o cursor parado.
- **Ela é estado do PAINEL.** Não entra na spec nem no `localStorage`, pelo mesmo motivo que a escala nunca
  entrou — nem depois de o `useUiStore` passar a persistir largura e recolhimento de painel. Abrir o editor no
  enquadramento de ontem, num projeto cuja prancheta pode ter mudado de tamanho, responde à pergunta errada.
- **O enquadramento acontece na primeira medida — e de novo quando o SHELL muda de forma.** Reenquadrar a cada
  `resize` desfaria o zoom do usuário toda vez que ele abrisse o console ou encaixasse a aba, e essa parte não
  mudou. O que mudou, com os painéis recolhíveis (2026-08-04), é que recolher uma coluna devolve ~20% da largura
  de uma vez: manter o enquadramento anterior deixaria a prancheta encostada num canto com um vazio do outro
  lado — o usuário pediu espaço e recebeu espaço vazio.
  - **O gatilho é o `layoutEpoch` do `useUiStore`, um CONTADOR — nunca a medida do painel.** O painel muda de
    tamanho durante a animação inteira; reagir à medida reenquadraria a cada quadro. O contador sobe uma vez por
    gesto, e **só** em recolher/expandir: arrastar um divisor não o move, porque arrastar muda a largura e não a
    forma. `useUiStore.test.ts` guarda as duas metades dessa regra, incluindo a idempotência do `collapseBoth`
    — sem ela, cada travessia de breakpoint na faixa estreita desfaria o zoom.
- **`pane` fica fora das dependências do efeito de reenquadrar, de propósito.** Ele muda junto, um quadro
  depois, e incluí-lo dispararia o efeito uma segunda vez com a medida nova.
- **Ctrl/⌘+roda amplia; roda sozinha desloca.** A pinça do trackpad chega ao navegador como `wheel` com
  `ctrlKey` e não tem evento próprio — tratar tudo como zoom faria a rolagem de dois dedos ampliar sem parar.

### 2.2 Estado

Store Zustand única com `spec`, `issues` e `selectedId`. Toda escrita passa por `commit`, que revalida com o
**mesmo `validateSpec` que a API aplica** e persiste com debounce. Não existe caminho que altere a árvore sem
revalidar — é o que garante que o botão de export só fique ativo com uma spec que a API aceitaria (RN-03).

**Seletor de zustand nunca constrói valor** (achado 52). O v5 compara com `Object.is`, então devolver um `Map`
ou objeto novo re-renderiza em loop e trava a aba. O que fica como seletor devolve **referência vinda do
estado**; a derivação que cria objeto vive em `lib/issues.ts` e é memoizada no componente.

**Nome de coluna é imutável** (ADR-13). O usuário edita `displayName`; o `name` nasce em `createColumn` e amarra as
referências da árvore e o `capabilities.json`.

**Publicar um campo é uma edição** (spec 5.1.0). O painel de propriedades ganhou uma **calha** à esquerda, com
um alternador por campo: publicar quer dizer "este controle passa a existir no painel de formatação do Power BI".
Calha, e não um ícone depois do rótulo — a pergunta "o que o consumidor do relatório vai poder mexer?" se
responde percorrendo a coluna inteira, e alternadores depois de rótulos de larguras diferentes formariam uma
borda irregular. **Fechado é o padrão**, e a célula fica vazia no campo estrutural (`placement`).

As invariantes moram em `setFieldExposed`, no `component-registry`, e não aqui: a lista guarda a **ordem do
descritor** (é ela que vira a ordem dos slices no card) e **publicar o primeiro campo batiza o nó**. O store só
passa pelo `commit`, então publicar entra no histórico como qualquer outra edição. O **mesmo glifo** aparece na
árvore, no nó que publica alguma coisa — é a mesma informação vista de outro lugar, e é o único lugar em que dá
para ver o painel do consumidor sem abrir nó por nó.

Um projeto v1 no `localStorage` é migrado na hidratação preservando o `project.id` — sem ele, reexportar
duplicaria o visual em vez de atualizá-lo.

### 2.3 Export

```
clique → valida (inválido: aponta os campos na árvore e no painel, e para)
       → POST /builds { spec }           → 202 { buildId }
       → GET  /builds/:id [polling 1 s]  → fila (posição) / etapa do pipeline
       → GET  /builds/:id/artifact       → blob
       → saveAs + bump da versão + instruções de importação
```

As fases são nomeadas porque a espera passou a existir: ~12 s medidos, e "Gerando..." parado por doze segundos é
indistinguível de travado. O download só acontece após um estado **terminal** — pedir o artefato antes traz um
`409`, não um pacote.

**A tela inteira fica travada durante a build**, num `<dialog>` modal (`BuildProgressDialog`). Não é enfeite: a
spec já subiu, então continuar arrastando no canvas produz um pacote que não corresponde ao que está na tela, e
nada avisaria. O bloqueio vem do `showModal()` nativo — o resto da página sai do top layer e para de receber
clique, foco e Tab de uma vez —, e o que se **acrescenta** é o contrário do padrão dos outros diálogos: `Esc` e
clique no backdrop são recusados enquanto `busy`. Não há cancelar: o servidor compilaria de qualquer jeito.

**A barra tem cinco segmentos de larguras diferentes**, proporcionais ao custo medido de cada etapa
(`STEP_EXPECTED_MS` em `lib/buildProgress.ts` — os pesos são derivados dessa tabela por divisão, não de uma
segunda lista). Dentro da fatia da etapa atual a razão rasteja por uma curva que satura e **nunca alcança o
começo da fatia seguinte**, então a chegada da próxima etapa é sempre um avanço. A razão é **monotônica** por
`Math.max` com o quadro anterior: o poll é de 1 s e uma etapa que chega fora de ordem não pode fazer a barra
voltar. Essa aritmética mora fora do React e se testa lá, como a de `canvasGeometry.ts`.

Cada `BuildErrorCode` vira uma frase que diz o que fazer, num `switch` exaustivo por compilador sobre o tipo de
`@vislow/build-contract`: um código novo no servidor **quebra o build do editor** em vez de virar "erro
desconhecido" na tela. `ARTIFACT_REJECTED` é redigido como *reprovado na inspeção*, não como *falhou* — o
primeiro sugere reportar, o segundo sugere tentar de novo, e a ADR-11 significa que tentar de novo não ajuda.

### 2.4 Armadilhas do ambiente do editor

- **`react-is` é peer do Recharts** e o repo usa `autoInstallPeers: false`, então `apps/web` o declara
  explicitamente (achado 49). O `npm ci` do template instala peers sozinho — por isso o visual compilado esconde
  esse problema e só o editor quebra.
- **Testes `.tsx` precisam do `oxc.jsx` no `vitest.config.ts`** (achado 51): o `apps/web/tsconfig.json` usa
  `jsx: "preserve"` (exigência do Next) e o vitest lê o mesmo arquivo. Definir `esbuild.jsx` é aceito e
  **silenciosamente ignorado** no Vite 8.
- **`react` no vitest vem por alias para a cópia do editor** (achado 50). O kit não pode declarar react, então
  sem o alias nenhum teste importa os componentes a partir do fonte.

## 3. Os nós que desenham (`packages/visual-kit`)

O mesmo código roda no preview e dentro do Power BI (ADR-04, ADR-10). Tudo aqui é compilado para dentro do
bundle do visual, e é isso que explica cada restrição abaixo.

### 3.1 O kit não usa hooks

**Regra de ESLint, não convenção.** Hook é o único ponto sensível à duplicação do React no bundle (achado 39):
elementos JSX atravessam cópias sem problema — o `$$typeof` é um `Symbol.for`, global — mas hooks não. Use
classe (ver `ErrorBoundary`) ou calcule no render.

Pelo mesmo motivo o kit **não declara `react` nem em `devDependencies`**, e um teste que monte seus componentes
mora em `apps/web` (achado 56).

### 3.2 Alto contraste: HTML usa a variável, SVG lê o quadro

**`var()` não é substituído em atributo de apresentação de SVG** (achado 55). `<rect fill="var(--x, red)">` não
pinta em navegador nenhum — a substituição só acontece em propriedade CSS, e o Recharts emite `fill`/`stroke`
como atributo. Teria quebrado o alto contraste exatamente onde ele mais importa, e em silêncio.

- **Nós de HTML** (`Container`, `TextBox`, `KpiCard`): use `hcInk`, `hcSurface`, `hcAccent`, `hcLine` de
  `highContrast.ts`. `hcAccent` é para **marca de dados** — o número do KPI —, e `hcInk` para texto; as duas
  recebem o `foreground` do host hoje, e a distinção é o que sobrevive ao dia em que deixarem de receber.
- **Gráficos**: resolva por `hostOf(frame).highContrast`. Todo descritor de gráfico tem campo de papel, então
  sempre tem o quadro.

### 3.3 Teclado é uma sobreposição de botões

Uma sobreposição `absolute` de `<button>` `sr-only`, **não `tabIndex` no SVG**. Absoluta porque um elemento a
mais na cadeia de flex quebra a medida do `ResponsiveContainer` (ADR-14); o grupo é `pointer-events-none` para
não roubar clique do gráfico. As setas movem o **foco do DOM**, não um índice em estado — é o que dá navegação
por setas sem hook.

> **DORMENTE desde a spec 5.0.0, e o KPI Card NÃO a trouxe de volta.** A sobreposição é dos gráficos: ela
> existe para dar foco a cada ponto de uma série. O KPI é **um** elemento focalizável — `tabIndex={0}` mais
> `role="group"` no próprio card —, e sem papel de agrupamento não há identidade para `Enter` acionar. Esta
> seção descreve o desenho que volta com o primeiro nó de agrupamento; a quarentena correspondente está
> declarada em `compiledVisual.e2e.test.ts`.

### 3.4 Os serviços do host viajam no quadro

Nunca leia `frame.host` direto — **use `hostOf(frame)`**, que devolve o `INERT_HOST` no preview (ADR-16). Um
`?.` por chamada é uma chance por chamada de esquecer, e o esquecimento só quebra o editor.

O `FrameHost` tem discriminante `kind: 'host' | 'inert'`, e é ele que decide o tooltip: no visual compilado o
balão é o do host (RF-19); no preview fica o do Recharts, senão passar o mouse no editor não mostraria nada.

**Mouse e teclado divergem por tipo de gráfico, de propósito.** Barra e pizza têm marca por ponto e usam
`onClick` do `<Bar>`/`<Pie>`; linha e área usam o handler do gráfico e o `activeTooltipIndex`. Restrição do
Recharts, não escolha.

### 3.5 Seleção no preview: depende de quem posiciona

**Container que empilha:** sem seleção por clique (ADR-14). Um wrapper clicável entra na cadeia de flex que o
`ResponsiveContainer` usa para medir altura, e o preview deixa de valer como referência do resultado — que é
justamente o ponto do ADR-04. A seleção vive no painel de árvore.

**Container que posiciona (`placement: 'canvas'`):** tem seleção, arrasto e redimensionamento (ADR-18). O motivo
do ADR-14 era **medição**, e ele não se aplica: a camada de alças é filha `absolute` do container, está fora do
fluxo e não pode alterar a medida de irmão nenhum. Por viver **dentro** do container, ela herda o sistema de
coordenadas e desenha com os mesmos `%` da spec — sem `ref`, sem `ResizeObserver`, sem medir para desenhar.
Pixel só entra no gesto, lido uma vez no `pointerdown`.

O que a camada custa: ela cobre os gráficos, então o tooltip do Recharts **no preview** não aparece dentro de um
canvas. O tooltip do host, no visual compilado, não é afetado — nada da camada vai para o pacote.

### 3.6 Geometria

`rect` é `{ x, y, w, h }` em **% do pai**, irmão de `props` e não dentro dele: `props` espelha os campos do
descritor e o codegen despeja cada chave como atributo JSX, mas geometria é relação com o pai, não propriedade
do componente.

- **A invariante "filho de canvas tem caixa" vive nas operações de árvore** (`withPlacedChildren`), não no
  editor: não há caminho — inserir, mudar de pai, virar canvas — que produza filho sem geometria. O
  `validateSpec` cobre a spec que chega por importação, onde nenhuma operação passou.
- **`clampRect` prende, `validateSpec` reprova.** O chamador do primeiro é um arrasto, e passar da borda quer
  dizer "encosta na borda", nunca "cancela o gesto".
- **A matemática mora em `lib/canvasGeometry.ts`**, sem React. Encaixe, arrasto, redimensionamento e teclado se
  testam direto; no componente sobra o encanamento do gesto, que jsdom mal exercita.
- **NÃO EXISTE GRADE OBRIGATÓRIA** (desde 2026-08-04). Até então todo gesto era arredondado numa grade de 24×16
  células do pai: numa prancheta de 1280×720 o componente só pousava de 53px em 53px na horizontal e de 45 em 45
  na vertical, não havia como encostar uma caixa na outra, e o Alt — que soltava — era o inverso do que um
  editor de desenho faz. O valor livre é o **padrão**; o encaixe é uma atração curta por aresta ou centro de
  irmão, e só acontece quando a caixa chega perto.
- **A tolerância do encaixe é em PIXEL DE TELA** (`SNAP_PX = 6`), convertida para % pela caixa do container que
  o gesto já leu. Quem julga "está perto" é o olho, e o olho mede na tela: uma tolerância fixa em % do pai gruda
  com força diferente conforme o tamanho do container.
- **O passo do teclado é em pixel da prancheta** — 1px, 10px com Shift. "Uma seta anda um pixel" é uma promessa
  conferível; "uma seta anda 4,17% do pai", que era o passo da grade, não é promessa nenhuma.
- **Modificadores:** `Shift` tranca o eixo ao mover e preserva a proporção ao redimensionar; `Ctrl/⌘` solta do
  encaixe; `Alt` **duplica arrastando**. Alt mudou de significado quando ganhou a duplicação — é o que ele faz
  em todo editor de desenho, então quem trocou de lugar foi o escape do encaixe.
- **O painel fala PIXEL, a spec guarda `%`** (`lib/units.ts`). Ninguém compõe pensando em "37,5% do pai", mas a
  spec não pode virar pixel: um visual do Power BI não escolhe o próprio tamanho. O tamanho do pai vem do
  `ResizeObserver` da própria camada de manipulação, publicado numa fatia do store **fora da spec** — medida de
  tela não é do projeto, e passá-la pelo `commit` revalidaria tudo a cada pixel de resize.

### 3.6.1 Um nível de cada vez

A camada de manipulação entra **só no container em que o ponteiro está trabalhando** (`enteredId`; `null` é a
raiz). Antes, ela entrava em todo container que posiciona e as de dentro cobriam as de fora: clicar num
container aninhado sempre pegava um filho dele, e o próprio container só era selecionável pela árvore.

Um clique pega o container, **duplo clique entra**, `Esc` sobe — e sair seleciona o container de onde se saiu,
que é o nó que o usuário acabou de terminar de editar. Só dá para entrar em quem **posiciona**: num container
que empilha não há camada para mostrar depois de entrar, e o usuário ficaria num nível sem nada clicável.

### 3.6.2 Desfazer é um gesto, não um evento de ponteiro

`beginGesture`/`endGesture` delimitam um arrasto ou um *scrubbing*. Entre os dois a escrita é **transitória**:
aplica na tela, mas não empilha histórico, não revalida a spec inteira e não agenda gravação. Sem isso um único
arrasto empilharia duzentos passos — um por `pointermove` — e `Ctrl+Z` andaria um pixel de cada vez. É também o
que paga a dívida de performance que cada `pointermove` carregava desde que o canvas existe.

**Gesto que não mudou nada não empilha.** Um clique que só seleciona abre e fecha um gesto; gastar um passo ali
faria `Ctrl+Z` não fazer nada visível, e o usuário apertaria de novo achando que o atalho falhou — e aí perderia
a edição de verdade.

### 3.7 Classes Tailwind e cores

As regras que produzem falha silenciosa dentro do Power BI estão em [build-visual.md](build-visual.md) — leia
antes de mexer em `tokens.ts`. Em resumo: **string literal completa, sempre**; **prefixo antes da variante**; e
**cor nunca vira classe** (hex validado por `pattern`, aplicado por `style` inline, que é a exceção deliberada
que permite qualquer cor de marca sem quebrar a garantia de purge).

