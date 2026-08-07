# packages/visual-kit — os componentes que desenham

O mesmo código roda no preview do editor **e** dentro do Power BI (ADR-04). Tudo aqui termina no bundle do
visual, e é isso que explica cada restrição. Detalhe em [docs/frontend.md](../../docs/frontend.md) e
[docs/build-visual.md](../../docs/build-visual.md).

**UI aqui exige as duas skills** — `frontend-design` antes do JSX, `web-design-guidelines` sobre o diff.

- **Este pacote não usa hooks** — regra de ESLint, não convenção. Hook é o único ponto sensível à duplicação do
  React no bundle: elementos JSX atravessam cópias, hooks não. Use classe (ver `ErrorBoundary`) ou calcule no
  render.
- **Não declare `react`, nem em `devDependencies`.** Sem isso o webpack do `pbiviz` (`resolve.symlinks: false`)
  resolve duas cópias e o dispatcher de hooks fica `null`. Teste que monta estes componentes mora em `apps/web`.
- **O CSS é ESCRITO À MÃO** (`src/styles.css`), sem Tailwind, desde a spec 5.0.0. Só entra ali escolha entre
  alternativas — peso, alinhamento, sombra, direção, transbordo — e medida NOSSA que o usuário não escolhe (o
  tamanho dos avisos do kit). **Nenhuma cor**: a do usuário vai inline, e a dos avisos passa por `hcInk` para o
  alto contraste do host poder vencê-la. Valor mora em `config-schema/src/design.ts`; estrutura, aqui.
- **Classe é string literal completa** em `src/tokens.ts`, com prefixo `vsl-`. Interpolar produz um nome que não
  existe no CSS, e navegador nenhum reclama de classe inexistente: o estilo some dentro do Power BI, sem erro.
  (A regra do prefixo antes da variante morreu com o Tailwind — `pbi:` era prefixo de variante do v4.)
- **Cor e MEDIDA nunca viram classe:** hex validado e pixel livre, aplicados por `style` inline. Espaçamento,
  raio, espessura e tamanho de fonte deixaram de ser token na spec 4.0.0 — os componentes recebem `number` e o
  helper `px()` decide o que fazer com valor ausente ou impossível. O que sobrou em `tokens.ts` é peso,
  alinhamento nos dois eixos, sombra e direção.
- **`borderStyle: 'solid'` é EXPLÍCITO no `Container`.** O `border-style` default do CSS é `none` — a borda
  teria espessura e não desenharia nada. Enquanto era classe, o `border` do Tailwind cuidava disso sozinho; o
  `styles.css` escrito à mão não carrega reset nenhum, de propósito.
- **Alto contraste: HTML usa a variável CSS, SVG lê o quadro.** `var()` **não** é substituído em atributo de
  apresentação de SVG. Nos nós de HTML use `hcInk`/`hcSurface`/`hcAccent`/`hcLine`; num nó que desenhe SVG,
  resolva por `hostOf(frame).highContrast`. Hoje só existe a ponta HTML — a de SVG volta com os gráficos.
- **Nunca leia `frame.host` direto — use `hostOf(frame)`**, que devolve o `INERT_HOST` no preview (ADR-16).
- **`/nodes` fica fora do barril** — o barril carrega o que TODO consumidor precisa (tokens, alto contraste,
  estados, `VisualRoot`), e o editor importa isso sem querer a árvore de componentes junto. A razão original era
  manter o Recharts fora; ele saiu na 5.0.0 e a separação ficou pela razão que sobrou.
- **`nodes/frame.ts` e `nodes/sampleFrame.ts` voltaram a ter consumidor na spec 5.2.0.** `sumOf` é a agregação
  do `KpiCard`; **`seriesOf` ganhou o primeiro chamador na 5.3.0**, a `RankingList` — estava escrito e sem
  sujeito desde o Sprint 6. **`sumOf` ganhou o segundo chamador na 5.4.0**, o `GoalGauge`, que o usa duas
  vezes: uma para o realizado, outra para a meta.
- **O `KpiCard` é focalizável mas não acionável** (`tabIndex`, `role="group"`, `.vsl-kpi:focus-visible`). É
  `group` e não `button` de propósito: sem papel de agrupamento não há identidade para selecionar, e um
  `button` prometeria uma ação que não existe. **A linha da `RankingList` é `role="button"`** porque ali a ação
  existe — ela chama `hostOf(frame).select(...)` e filtra o relatório — e leva `aria-pressed`, porque
  selecionar é um **alternador**. Nos dois, o tooltip nativo sai no ponteiro **e** no foco: quem chega por
  `Tab` não tem coordenada de mouse.
- **Barra com texto POR CIMA inverte o par de alto contraste.** No modo `behind` da `RankingList`, o
  preenchimento usa `hcSurface` e a regra inferior usa `hcAccent`. O host dá **uma** cor de frente: barra em
  `accent` com texto em `ink` por cima faria o texto sumir dentro da barra. Ligado o modo, o campo colapsa
  para o fundo e sobra um sublinhado proporcional — dado codificado, texto legível. Barra **sem** texto por
  cima (`beside`) preenche com `hcAccent` normalmente.
- **Marca que cai DENTRO de uma barra é um VÃO, nunca um fio por cima.** É o entalhe da meta no `GoalGauge`.
  Em alto contraste o host dá uma cor de frente: fio em `hcLine` sobre preenchimento em `hcAccent` seria
  `foreground` sobre `foreground`, e a marca sumiria justo no caso que ela existe para provar (o valor passou
  da meta). O vão usa a cor do **trilho** — `hcSurface`, o fundo do host —, e fundo sobre frente contrasta por
  construção, impresso e em daltonismo. Mesma família do par invertido da `RankingList`, logo acima: quando
  duas coisas se sobrepõem, uma das duas tem de colapsar para o FUNDO.
- **Cor de estado que depende de `:hover` vai num ELEMENTO, não numa regra.** `:hover` não alcança `style`
  inline e o `styles.css` não pode conter cor. A saída é inverter: a cor do autor vai inline num elemento
  sobreposto (`aria-hidden`, `pointer-events: none`) e a regra só alterna a **opacidade** dele.
- **`hcSelected` (`--vislow-hc-selected`) ganhou o primeiro leitor na 5.3.0.** Não é `hcAccent`: em alto
  contraste o host distingue a marca comum (`foreground`) da selecionada (`foregroundSelected`), e é essa
  distinção que permite ver o que está filtrado num modo em que quase tudo colapsa para duas cores.
- **A cor do número passa por `hcAccent`, não `hcInk`.** O número é *marca de dados*, e é para isso que a
  variável existe; rótulo e legenda são texto e ficam em `hcInk`. As duas recebem o `foreground` do host hoje,
  e confundi-las apagaria a distinção no dia em que deixarem de receber.
- **A moldura mais externa é o `VisualRoot`, um COMPONENTE** — não uma string de classes repetida no preview e
  no codegen, que era como funcionava até a 4.0.0. Divergir ali daria ao preview uma moldura e ao pacote outra,
  e a diferença só apareceria dentro do Power BI.
- **`CanvasSlot` não é um nó** — não está no registro e o usuário não o adiciona. É o embrulho que preview e
  codegen colocam em volta de cada filho de um container em `placement: 'canvas'`, pela mesma função
  (`positionsChildren`). O `%` vai por `style` inline, como a cor, e o `overflow: hidden` da `.vsl-slot` é a
  política de transbordo: corta, nunca escorre sobre o vizinho.
- **A guarda de CSS (`scripts/check-css.mjs`) confere os DOIS sentidos:** toda classe `vsl-` usada no fonte tem
  regra, e toda regra tem uso. O segundo sentido é o que impede o arquivo de virar depósito — regra órfã não
  quebra nada, só viaja no bundle para sempre. Ela **ignora comentário**: o `tokens.ts` documenta a regra da
  classe literal com um exemplo do que não fazer, e sem isso a guarda lia o exemplo como uso real.
  (Até a 4.0.0 ela não podia conter nome de classe por extenso, porque o Tailwind varria o próprio script e
  gerava as regras a partir da lista de exigências — a guarda passava com o `tokens.ts` quebrado.)
- **`build` apaga o `dist/` antes de compilar.** Não é higiene: o `tsc` não remove o que sumiu do `src/`, e o
  `stage-vendor` copia o `dist/` inteiro para dentro do visual. Sem isso, `charts.js` e `KpiNode.js`
  sobreviveram no pacote depois de apagados — importando um `recharts` que já não estava instalado.
  `stage-vendor.mjs` tem a guarda que morde nesse caso.
