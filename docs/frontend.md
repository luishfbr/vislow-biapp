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
| Classe utilitária escrita na hora | String literal completa no mapa de `visual-kit/src/tokens.ts`; variante com o prefixo **antes** (`pbi:focus:ring-2`) |
| Família tipográfica característica | Só no editor. O `visual-kit` **não tem token de família** — a face vem do host. Precisar de uma é feature de schema primeiro, nunca webfont externa: o visual roda offline e contra orçamento de 1 MB |
| Micro-interação com estado | No `visual-kit`, sem hooks — classe, ou cálculo no render |
| Wrapper clicável para seleção | Em container que empilha, não: quebra a medida do `ResponsiveContainer` (ADR-14). Em canvas, a camada é filha `absolute` e está fora do fluxo (ADR-18) |

### 1.2 O que a auditoria não dispensa

O `web-design-guidelines` cobre UI genérica da web. Ele **não sabe** o que o Power BI exige:

- **Alto contraste** — ver [3.2](#32-alto-contraste-html-usa-a-variável-svg-lê-o-quadro).
- **Teclado nos gráficos** — sobreposição de botões, não `tabIndex` no SVG. Ver [3.3](#33-teclado-é-uma-sobreposição-de-botões).
- **O estado vazio e o de erro.** O visual nunca renderiza em branco (RN-04). Um design que só previu o caminho
  feliz está incompleto, por mais bonito que esteja.

## 2. O editor (`apps/web`)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  [Vislow]   Nome do visual: [__________]   v1.0.0.0   [ Baixar .pbiviz ]      │
├──────────────────┬────────────────────────────────────┬───────────────────────┤
│  COMPONENTES     │        PREVIEW (visual-kit)        │  PROPRIEDADES         │
│  COMPOSIÇÃO ↑↓✕  │  render ao vivo com sampleFrame    │  ┌ na raiz ────────┐  │
│  CAMPOS DO VISUAL│   prancheta em px, escalada        │  │ PRANCHETA       │  │
│  PROJETO         │                                    │  │ L 1280 ┃ A 720  │  │
│                  │   escala 62% · dados de exemplo    │  │ [16:9][4:3][1:1]│  │
│                  │                                    │  └─────────────────┘  │
│                  │                                    │  (do descritor)       │
└──────────────────┴────────────────────────────────────┴───────────────────────┘
```

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

**O controle mora nas propriedades da RAIZ** (`ArtboardField`), no mesmo lugar e pelo mesmo motivo que a
geometria: não vem do descritor e não é propriedade do componente. Os dois nunca aparecem juntos — a raiz não
tem pai, logo não tem caixa; quem tem caixa não é a raiz. **Só na raiz**: um container aninhado tem `rect`, e
oferecer a prancheta em cada container mostraria um único valor em vários lugares.

**A escala fica sob o preview, não no painel.** Ela descreve o painel e não o projeto — muda ao redimensionar a
janela, sem ninguém ter editado nada. Quem *muda* o tamanho é a prancheta; a escala só relata o que coube.

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
- **Nunca amplia.** Prancheta menor que o painel fica pequena — ampliar 100×100 até preencher faria um texto de
  12px parecer título, que é a mentira que declarar o tamanho existe para evitar.
- **O campo é opcional no schema.** Projeto salvo antes dele continua válido e recebe o default por
  `artboardOf(spec)` — nunca leia `project.artboard` direto, pelo mesmo motivo do `hostOf(frame)`.
- **`clampArtboard` prende, `validateSpec` reprova** — a mesma divisão do `clampRect`: quem chama o primeiro é
  um campo de formulário, e digitar 5000 quer dizer "o maior que der".

### 2.2 Estado

Store Zustand única com `spec`, `issues` e `selectedId`. Toda escrita passa por `commit`, que revalida com o
**mesmo `validateSpec` que a API aplica** e persiste com debounce. Não existe caminho que altere a árvore sem
revalidar — é o que garante que o botão de export só fique ativo com uma spec que a API aceitaria (RN-03).

**Seletor de zustand nunca constrói valor** (achado 52). O v5 compara com `Object.is`, então devolver um `Map`
ou objeto novo re-renderiza em loop e trava a aba. O que fica como seletor devolve **referência vinda do
estado**; a derivação que cria objeto vive em `lib/issues.ts` e é memoizada no componente.

**Nome de coluna é imutável** (ADR-13). O usuário edita `displayName`; o `name` nasce em `createColumn` e amarra as
referências da árvore e o `capabilities.json`.

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

- **Nós de HTML** (`Container`, `TextNode`, `KpiNode`): use `hcInk`, `hcSurface`, `hcAccent`, `hcLine` de
  `highContrast.ts`.
- **Gráficos**: resolva por `hostOf(frame).highContrast`. Todo descritor de gráfico tem campo de papel, então
  sempre tem o quadro.

### 3.3 Teclado é uma sobreposição de botões

Uma sobreposição `absolute` de `<button>` `sr-only`, **não `tabIndex` no SVG**. Absoluta porque um elemento a
mais na cadeia de flex quebra a medida do `ResponsiveContainer` (ADR-14); o grupo é `pointer-events-none` para
não roubar clique do gráfico. As setas movem o **foco do DOM**, não um índice em estado — é o que dá navegação
por setas sem hook.

**Classe com variante se confere no `dist/styles.css`, não no olho** (achado 54): `pbi:sr-only` e
`pbi:focus:not-sr-only` foram validadas compilando o CSS e lendo os seletores gerados antes de o componente ser
escrito.

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
- **O passo do teclado é o mesmo da grade do arrasto.** Duas constantes fariam o teclado desalinhar o que o
  mouse alinhou, com meia célula de erro invisível.

### 3.7 Classes Tailwind e cores

As regras que produzem falha silenciosa dentro do Power BI estão em [build-visual.md](build-visual.md) — leia
antes de mexer em `tokens.ts`. Em resumo: **string literal completa, sempre**; **prefixo antes da variante**; e
**cor nunca vira classe** (hex validado por `pattern`, aplicado por `style` inline, que é a exceção deliberada
que permite qualquer cor de marca sem quebrar a garantia de purge).

