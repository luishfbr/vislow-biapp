# apps/web — o editor de composição

Detalhe completo em [docs/frontend.md](../../docs/frontend.md). **UI aqui exige as duas skills** — plano com
`frontend-design` antes do JSX, auditoria com `web-design-guidelines` sobre o diff.

- **O catálogo tem DOIS tipos: `container` e `text`.** KPI e os quatro gráficos saíram na spec 5.0.0, e com eles
  o Recharts. Não há migração 4→5: a chave do `localStorage` é `vislow:project:v5` e a antiga nunca é lida.
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
- **Ação que apaga o histórico confirma antes** (`ConfirmDialog`). `newProject` e `importSpec` zeram `past` e
  `future`: não há `Ctrl+Z` depois delas. Ação inofensiva **não** confirma — confirmação barata é o que ensina a
  clicar em "sim" sem ler, e é o que faz a confirmação cara deixar de proteger.
- **Diálogo novo usa o `DialogFrame`**, e continua sendo `<dialog>` nativo. Largura é tamanho nomeado e o teto
  de altura é obrigatório: não existe caso em que um diálogo deva poder ficar mais alto que a janela.
- **Seletor de zustand nunca constrói valor.** O v5 compara com `Object.is`, então devolver um `Map` ou objeto
  novo re-renderiza em loop e trava a aba. Derivação que cria objeto vive em `lib/issues.ts`, memoizada no
  componente.
- **`selectedId` é `string | null`.** `null` é estado de primeira classe — clicar no vazio da prancheta limpa a
  seleção e o painel da direita passa a falar do projeto (é lá que a prancheta mora agora, não mais nas
  propriedades da raiz). O editor abre nesse estado.
- **A camada de manipulação vale num nível de cada vez** (`enteredId`). Duplo clique entra num container
  aninhado, `Esc` sobe. Com todas as camadas ativas, a de dentro cobria a de fora e o container nunca era
  clicável.
- **Um arrasto é UM passo de desfazer.** `beginGesture`/`endGesture` tornam a escrita transitória: sem histórico,
  sem `validateSpec`, sem gravação até o `pointerup`.
- **O painel fala pixel, a spec guarda `%`.** A conversão é `lib/units.ts`; o tamanho do pai vem do
  `ResizeObserver` da camada de manipulação, numa fatia do store **fora da spec** — medida de tela não passa
  pelo `commit`.
- **Não há mais estado de "campo pendente" no preview.** Todo nó nasce válido na spec 5.0.0: sem campo de papel
  no catálogo, nenhum nó nasce inválido. O estado ainda é alcançável — o campo hexadecimal grava a cada tecla, e
  `#1e2` é inválido no caminho para `#1e293b` —, mas trocar o nó inteiro por uma ficha no meio da digitação é
  pior do que deixar o navegador ignorar uma cor que não entende. O erro continua sendo dito embaixo do campo, e
  continua bloqueando o export.
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
- **A tabela de exemplo está DORMENTE na spec 5.0.0.** Cada coluna continua sendo, em desenho, o dado do preview
  e um `dataRole` do `capabilities.json` — mas nenhum nó consome dados desde a poda, então `usedRoles` devolve
  vazio e o pacote sai sem poço de campos. O DataPanel e o `table.ts` continuam de pé, e voltam a produzir
  `dataRole` com o KPI Card da Fase 4. Edição de coluna, linha e célula passa por `table.ts`; o store só delega.
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
