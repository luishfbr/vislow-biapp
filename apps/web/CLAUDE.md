# apps/web — o editor de composição

Detalhe completo em [docs/frontend.md](../../docs/frontend.md). **UI aqui exige as duas skills** — plano com
`frontend-design` antes do JSX, auditoria com `web-design-guidelines` sobre o diff.

- **O catálogo tem QUATRO tipos: `container`, `text`, `kpi` e `ranking`.** Os quatro gráficos saíram na spec
  5.0.0, e com eles o Recharts; o KPI voltou na 5.2.0 e a **Lista de Ranking** na 5.3.0. Os dois consomem
  dados; só a Lista declara **agrupamento**, e é ela que devolveu o filtro cruzado ao produto. Não há migração
  4→5: a chave do `localStorage` é `vislow:project:v5` e a antiga nunca é lida — 5.2.0 e 5.3.0 são aditivas e
  não mexem nela.
- **O interruptor "Simular seleção" é do MÓVEL, e não é persistido.** Ele faz `previewHost` reportar a primeira
  linha do quadro como selecionada, para o autor **desenhar** o esmaecimento — que sem isso só aparece depois
  de exportar e importar no Desktop, porque `sampleFrame` não define `frame.host`. É interruptor e **não**
  clique na linha: pressionar um nó já seleciona e arrasta no mesmo gesto, e o `pointerEvents` do
  `CanvasOverlay` só libera os filhos do container *entrado* — o clique passaria em alguns níveis da árvore e
  não em outros, que é indistinguível de bug. E não há relatório para filtrar no editor: o clique prometeria
  um efeito inexistente. Não persiste pela mesma regra da câmera.
- **O controle só se desenha quando há marca selecionável** (`hasSelectableMarks`, derivado do registro — a
  pergunta é "algum nó declara papel de agrupamento?", nunca "existe um `ranking` aqui?"). Interruptor que não
  muda nada na tela é a mesma falha de `direction` num container que posiciona livremente.
- **Nó novo exige DUAS entradas escritas à mão, e as duas não compilam se faltarem:** `lib/nodeComponents.ts`
  (o componente) e `components/Toolbar.tsx` (o ícone). Os dois mapas são `Record<NodeKind, …>` exaustivos de
  propósito — não dá para derivar desenho de um `label`, mas dá para impedir que o tipo novo apareça sem um.
- **Nada de lista de tipos ou de propriedades escrita à mão.** Paleta, painel de propriedades, schema e codegen
  saem todos de `NODE_DESCRIPTORS`. Uma lista paralela é a quinta cópia do catálogo e a primeira a divergir.
- **`lib/nodeComponents.ts` é o gêmeo por referência do que o codegen faz por texto.** `nodeComponents.test.ts`
  compara o nome da função com `descriptor.component` — é a única coisa ligando os dois caminhos.
- **Durante a build, a tela inteira fica travada** — `BuildProgressDialog`, `<dialog>` com `showModal()`. A spec
  já subiu: editar depois disso produz um pacote que não corresponde à tela. Esc e clique no backdrop são
  recusados enquanto `busy`, ao contrário de todos os outros diálogos daqui. A aritmética da barra vive em
  `lib/buildProgress.ts`, sem React, e é **monotônica** — a barra não volta nem com resposta fora de ordem.
- **São DOIS stores, e a fronteira é dura.** `useEditorStore` guarda o projeto; `useUiStore` guarda o móvel
  (largura de painel, recolhido). Nada do móvel pode passar pelo `commit` — ele revalida a spec inteira e
  empilha um passo de desfazer, e `Ctrl+Z` depois de recolher um painel tem de desfazer a última **edição**.
- **O canvas reenquadra pelo `layoutEpoch`, nunca pela medida do painel.** O painel muda de tamanho durante a
  animação inteira; o contador sobe uma vez por gesto de recolher/expandir. Arrastar um divisor **não** o move:
  arrastar muda a largura, não a forma. Detalhe em docs/frontend.md §2.1.1.
- **O atalho de ferramenta mora no descritor (`shortcut`), como os `keywords`.** Um mapa de teclas em
  `apps/web` seria a lista paralela de sempre, e a primeira a esquecer o tipo de nó seguinte — que entraria na
  barra sem tecla, ou roubando a de outro. `registry.test.ts` reprova letra repetida e reprova quem tomar o `V`
  da ferramenta de seleção.
- **Ferramenta é tecla NUA, sem modificador.** `Ctrl+B` é negrito, `Ctrl+P` é imprimir: roubar qualquer uma
  custaria mais do que a ferramenta vale. E a guarda de quem está digitando vale para elas com mais razão —
  escrever "Barras" no nome do projeto não pode armar sete ferramentas pelo caminho.
- **A hierarquia se organiza por ARRASTO na Composicao.** `reparentNode` existia desde o Sprint 5 sem um único
  chamador. Terço do meio de um container vira filho; ponta e folha viram fresta. **O fio da fresta começa no
  recuo que o rótulo vai ter** — é o recuo que responde "em qual pai isto cai?". **Anel** para o alvo e **fundo**
  para o selecionado: durante o arrasto o nó em voo está selecionado, e o mesmo fundo nos dois seria
  indistinguível. As caixas saem do DOM **uma vez** no `pointerdown`, em coordenada de conteúdo, senão a rolagem
  automática as invalida. Detalhe em docs/frontend.md §2.5.
- **`reparentNodes` remove tudo antes de inserir qualquer coisa**, e é **tudo ou nada**. Intercalar faz cada
  remoção deslocar o destino das inserções seguintes, e um bloco reordenado dentro do próprio pai sai
  embaralhado — foi assim que a primeira versão errou.
- **`Ctrl+→` / `Ctrl+←` indentam e desindentam na linha focada.** Sem eles, trocar de pai existiria só no
  ponteiro: as setas do cabeçalho reordenam entre irmãos e nunca mudam de pai. O foco sobrevive porque as linhas
  são irmãs com `key` estável — há teste, verificado quebrando a `key` de propósito.
- **Botão direito abre o `NodeContextMenu`, na prancheta E na árvore.** Abrir **seleciona antes** — um menu que
  aparece sobre um nó e apaga outro é a pior falha possível ali. Na raiz o item fica cinza, **sem `title`**: item
  desabilitado é `pointer-events-none` e a dica nunca apareceria. No vazio da prancheta o menu do aplicativo não
  abre, e é lá que "Colar" entra quando existir.
- **`menuOpen` é do MÓVEL e existe para o `useEditorShortcuts` sair cedo.** Sem a guarda, `Esc` fecharia o menu e
  limparia a seleção no mesmo toque, e `Delete` apagaria duas vezes. Transitório, não persistido.
- **O `CanvasOverlay` não conhece store.** O menu entra por `menu`, um embrulho opcional que desce pelo
  `PreviewEdit`. Importar lá dentro acoplaria ao store a única camada que se testa com callbacks puros.
- **Ação que apaga o histórico confirma antes** (`ConfirmDialog`). `newProject` e `importSpec` zeram `past` e
  `future`: não há `Ctrl+Z` depois delas. Ação inofensiva **não** confirma — confirmação barata é o que ensina a
  clicar em "sim" sem ler, e é o que faz a confirmação cara deixar de proteger.
- **Diálogo novo usa o `DialogFrame`**, e continua sendo `<dialog>` nativo. Largura é tamanho nomeado e o teto
  de altura é obrigatório: não existe caso em que um diálogo deva poder ficar mais alto que a janela.
- **Seletor de zustand nunca constrói valor.** O v5 compara com `Object.is`, então devolver um `Map` ou objeto
  novo re-renderiza em loop e trava a aba. Derivação que cria objeto vive em `lib/issues.ts`, memoizada no
  componente.
- **Publicar um campo é uma edição, e a calha é da esquerda.** O painel de propriedades tem uma coluna de
  alternadores antes do rótulo — publicar põe o controle no painel de formatação do Power BI (spec 5.1.0).
  **Fechado é o padrão**; campo estrutural (`placement`) não ganha alternador e a célula fica vazia. As
  invariantes (ordem do descritor, batismo do nó na primeira publicação) moram em `setFieldExposed`, no
  registro; o store só passa pelo `commit`, então isso desfaz como qualquer outra edição.
- **A seleção é `selectedIds: readonly string[]`, e `selectedId` é um SELETOR derivado.** Lista vazia é estado
  de primeira classe — clicar no vazio da prancheta limpa a seleção e o painel da direita passa a falar do
  projeto (é lá que a prancheta mora agora, não mais nas propriedades da raiz). O editor abre nesse estado.
  Limpar usa **sempre** a constante `NO_SELECTION`: um `[]` literal novo re-renderiza todo assinante pela regra
  do `Object.is`. `selectSelectedId` devolve `null` com vários selecionados — escolher um deles como "o
  principal" faria o painel de propriedades editar em silêncio um dos três.
- **Com mais de um selecionado, todos são IRMÃOS** (`resolveSelection`, no store). Um nó sozinho pode ser
  qualquer nó da árvore, porque a árvore de composição sempre selecionou em qualquer profundidade; vários, não:
  `rect` é % **do pai imediato**, e arrastar nós de pais diferentes pelo mesmo delta os separaria na tela.
  Shift-clicar um nó de outro pai **troca** a seleção — ignorar em silêncio pareceria defeito.
- **O marquee vive na BANCADA, e em pixel de tela.** Arrastar no vazio com a ferramenta de seleção armada
  (`paletteKind === null`) desenha a banda; a raiz do `CanvasOverlay` continua `pointerEvents: 'none'`, senão o
  canvas vira um vidro sobre o preview e o pan com espaço segurado morre. As caixas dos nós saem do DOM pelo
  `data-node-id` que o overlay escreve — **lidas uma vez no `pointerdown`**, porque nada se move durante uma
  banda. Os dois lados já vêm transformados pela câmera, então zoom e deslocamento se cancelam sem conversão
  nenhuma, e a invariante "só irmãos do nível entrado" sai de graça: só esses nós existem no DOM do overlay.
  **A banda não passa pelo objeto `edit` memoizado** — mudá-lo por quadro remontaria a árvore inteira do preview.
- **Arrastar vários é UM delta, e o sujeito do encaixe é a CAIXA ENVOLVENTE** (`applyGroupMove`). Com N
  sujeitos, cada um acharia a própria aresta mais próxima e o bloco chegaria deformado; e o `clamp` prende a
  união, senão o primeiro nó a encostar na borda pararia enquanto os outros continuariam. `edgesOf` descarta
  **todos** os que se movem, não só o que está sob o ponteiro — deixá-los na lista faz o bloco encaixar em
  pedaços de si mesmo. A escrita é `setNodeRects`, em lote: N chamadas a `setRect` seriam N caminhadas por quadro.
- **Bloco não redimensiona.** Nem alça, nem `Ctrl+seta`, nem rótulo que prometa. `fontSize` e `padding` são
  pixel absoluto: a caixa escalaria e a tipografia não, e o resultado na tela não corresponderia ao gesto.
- **A camada de manipulação vale num nível de cada vez** (`enteredId`). Duplo clique entra num container
  aninhado, `Esc` sobe. Com todas as camadas ativas, a de dentro cobria a de fora e o container nunca era
  clicável.
- **Selecionar já entra no pai** (`hostOf`, no store). Toda escrita de `selectedIds` grava o `enteredId` junto,
  então um neto ganha alça sem duplo clique. Pai que **empilha** não muda o nível — lá não há camada. E
  **limpar a seleção não sobe**: o `Esc` é uma cascata de três passos, e o segundo não pode arrastar o terceiro.
- **Container novo nasce `canvas`.** Empilhado o filho não tem `rect` e não redimensiona, e era esse o caminho
  comum. Não é mudança de schema: a enum já tinha o valor e spec salva carrega o dela por extenso. Fixture de
  teste que depende de empilhar declara `CONTAINER_STACK` — herdar o default tira o sentido de toda asserção
  sobre a **ausência** do `CanvasSlot`.
- **A alça do filho de um `stack` mede o DOM, e o primeiro arrasto converte o pai** (`StackHandles`, montado na
  prancheta). Medir aqui não fere a ADR-18 — é pré-conversão, nunca durante o arrasto. Ela acha o elemento pelos
  **índices da spec**, o que exige que cada componente do kit renderize **um** elemento raiz (teste em
  `SpecPreview.test.tsx`); fica montada até o fim do gesto porque é a raiz dela que segura a captura do
  ponteiro; e é toda `aria-hidden` — o caminho com foco é o botão "Posicionar livremente" do painel. Detalhe em
  docs/frontend.md §3.6.3.
- **Um arrasto é UM passo de desfazer.** `beginGesture`/`endGesture` tornam a escrita transitória: sem histórico,
  sem `validateSpec`, sem gravação até o `pointerup`.
- **O painel fala pixel, a spec guarda `%`.** A conversão é `lib/units.ts`; o tamanho do pai vem do
  `ResizeObserver` da camada de manipulação, numa fatia do store **fora da spec** — medida de tela não passa
  pelo `commit`.
- **Não há ficha de "nó pendente" no preview, nem com o KPI de volta.** Até a 4.0.0 um nó com papel não ligado
  era trocado por uma ficha âmbar. Não é mais: quando o papel obrigatório falta, o KPI desenha o `EmptyState`
  — que é literalmente o que o Power BI mostraria, então o preview não mente. O outro caminho para o estado
  inválido é o campo hexadecimal, que grava a cada tecla (`#1e2` é inválido a caminho de `#1e293b`), e trocar o
  nó inteiro por uma ficha no meio da digitação é pior do que deixar o navegador ignorar uma cor que não
  entende. O erro continua sendo dito embaixo do campo, e continua bloqueando o export.
- **Não existe mais grade no canvas.** O encaixe é atração de 6px de tela por aresta de irmão; a tolerância se
  converte de pixel para `%` pela caixa do container, senão gruda com força diferente conforme o tamanho dele.
- **Seleção no preview depende de quem posiciona.** Container que empilha: nenhuma (ADR-14) — um wrapper
  clicável entra na cadeia de flex que o `ResponsiveContainer` usa para medir. Container em `placement:
  'canvas'`: tem seleção, arrasto e alças (ADR-18), porque a camada é filha `absolute`, está fora do fluxo e
  desenha com os mesmos `%` da spec, sem medir para desenhar.
- **A prancheta (`project.artboard`) é do EDITOR e não vai para o pacote.** O visual compilado continua
  `w-full h-full` — quem escolhe o tamanho é o autor do relatório. Leia por `artboardOf(spec)`, nunca
  `project.artboard` direto: o campo é opcional e o default vem de lá. O controle vive no painel do **projeto**
  — o estado do painel quando não há seleção —, e não mais nas propriedades da raiz.
- **A geometria (`rect`) é % do pai e mora fora de `props`** — `props` espelha o descritor, e o codegen despeja
  cada chave como atributo JSX; geometria é relação com o pai.
- **A matemática do canvas fica em `lib/canvasGeometry.ts`**, sem React, e é lá que ela se testa. No componente
  sobra o gesto, que jsdom não exercita.
- **A tabela de exemplo VOLTOU a produzir `dataRole` na spec 5.2.0.** Cada coluna é, ao mesmo tempo, o dado do
  preview e um campo do `capabilities.json` — mas só quando algum nó a LIGA: `usedRoles` filtra
  `spec.data.columns` pelo que a árvore referencia, então coluna criada e nunca usada não vira poço. Um projeto
  só de `container` e `text` continua saindo sem poço nenhum. Edição de coluna, linha e célula passa por
  `table.ts`; o store só delega.
- **`addNode` liga o papel no palpite óbvio** (`suggestRoleBindings`, no registro): um KPI nasce apontando para
  a primeira medida livre. Tela vazia parece defeito, e a escolha se desfaz em um clique no painel. Uma coluna
  por campo — os dois papéis de medida do KPI não caem na mesma, senão o card nasce comparando um número com
  ele mesmo.
- **Nome de coluna é imutável** (ADR-13). O usuário edita `displayName`; o `name` nasce em `createColumn` e
  amarra as referências da árvore e o `capabilities.json`.
- **Os valores da tabela não vão para o pacote**, como a prancheta. O que viaja é o esquema: coluna, tipo e
  papel. Dois testes reprovam o vazamento — um no fonte gerado, outro no bundle compilado.
- **Os primitivos de `components/ui/**` são Base UI, não Radix.** `render` no lugar de `asChild`,
  `Positioner`+`Popup` no lugar de `Content`, `data-open` no lugar de `data-state="open"`. Quase todo exemplo de
  shadcn na internet é Radix e não compila aqui. São código de terceiro, regerável por `shadcn diff`, com recorte
  próprio no ESLint — mas a proibição de `innerHTML` (RN-11) não sai do recorte. Detalhe em docs/frontend.md §1.3.
- **Ícone que depende do tema troca por CSS, nunca por JS.** `dark:hidden` e `hidden dark:block`; ler
  `resolvedTheme` devolve `undefined` no servidor e custa mismatch de hidratação ou um piscar atrás de `mounted`.
- **O lucide marca `aria-hidden` sozinho — e é justamente por isso que ícone com significado precisa ser
  declarado.** O `createLucideIcon` só omite o `aria-hidden` quando o ícone já traz uma prop de acessibilidade.
  Ícone decorativo dentro de um botão rotulado: não escreva nada, já está certo. Ícone que **é** a informação
  (o ponto de pendência na árvore) precisa de `role="img"` mais `aria-label`, senão desaparece em silêncio para
  o leitor de tela.
- **Ícone fora de um `Button` precisa de `size-*` explícito.** O lucide nasce em 24px e quem o encolhe para 16 é
  a regra `[&_svg:not([class*='size-'])]:size-4` da cva do `Button`. Num `<button>` cru — como o gatilho do
  `ProjectMenu` — não há essa regra, e o ícone entra gigante sem erro nenhum.
- **Teste que monta popup do Base UI ou consumidor do next-themes precisa do stub de `window.matchMedia`.** O
  jsdom não implementa, o componente não monta e a mensagem não diz o motivo. Precedente em `Header.test.tsx`.
- **Testes `.tsx` precisam do `oxc.jsx` no `vitest.config.ts`**: o `tsconfig.json` daqui usa `jsx: "preserve"`
  (exigência do Next) e o vitest lê o mesmo arquivo. Definir `esbuild.jsx` é ignorado em silêncio no Vite 8.
- **`react` no vitest vem por alias para a cópia do editor** — o `visual-kit` não pode declarar react.
- **Teste que monta componentes do `visual-kit` mora aqui**, não no kit (`SpecPreview.test.tsx`): sem
  `react-dom` resolvível lá, o ESLint com tipos reprova o arquivo inteiro. É por isso que a prova de que a
  caixa de texto embrulha cor e fundo em `var(--vislow-hc-*)` — o alto contraste do lado do HTML — vive no
  editor, e não no pacote que ela protege.
