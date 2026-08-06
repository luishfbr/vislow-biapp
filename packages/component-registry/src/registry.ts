import {
  INK,
  INK_MUTED,
  PAPER,
  PAPER_SUNK,
  RADIUS,
  RULE,
  SPACE,
  STROKE,
  TYPE_SCALE,
} from '@vislow/config-schema';
import type { FieldSpec, NodeDescriptor, NodeKind } from './types.js';

/**
 * O catalogo de componentes. FONTE UNICA de tres consumidores:
 *
 *   1. a paleta e o painel de propriedades do editor;
 *   2. o schema JSON que valida a arvore (gerado daqui — ver `schema.ts`);
 *   3. o codegen do backend, que emite JSX a partir dos descritores.
 *
 * Adicionar um tipo de no e uma entrada aqui. Nao ha lista de tipos duplicada em
 * lugar nenhum: o schema e derivado, entao nao ha como divergir.
 */

/**
 * As duas disposicoes de um container.
 *
 * Constantes, e nao strings soltas, porque o valor e comparado em cinco lugares
 * — descritor, `showWhen`, o proprio componente, o preview e o codegen — e um
 * erro de digitacao em qualquer um deles nao quebra nada: o container so volta a
 * empilhar em silencio.
 */
export const CONTAINER_STACK = 'stack';
export const CONTAINER_CANVAS = 'canvas';

/**
 * O juizo do KPI: subir e bom, descer e bom, ou nao ha juizo nenhum.
 *
 * Constantes pela mesma razao das disposicoes acima — o valor e comparado no
 * descritor, no `labels.ts` e dentro do `KpiCard`, e um erro de digitacao
 * qualquer nao quebra nada: o card so passa a pintar toda queda como problema.
 *
 * SEPARA DIRECAO DE JUIZO. A seta segue sempre o sinal aritmetico da variacao;
 * so a COR muda com a polaridade. Num KPI de custo, churn ou prazo, a seta
 * continua apontando para baixo e a queda e pintada com a cor de favoravel.
 */
export const POLARITY_HIGHER = 'higher';
export const POLARITY_LOWER = 'lower';
export const POLARITY_NEUTRAL = 'neutral';

/** Onde o rotulo fica em relacao ao numero. */
export const LABEL_ABOVE = 'above';
export const LABEL_BELOW = 'below';

/** Quais dos dois numeros da comparacao aparecem (RF-16 pede os dois). */
export const DELTA_BOTH = 'both';
export const DELTA_ABSOLUTE = 'absolute';
export const DELTA_PERCENT = 'percent';

/**
 * Por onde a Lista de Ranking ordena, e para que lado.
 *
 * `model` e "nao ordene": entrega na ordem em que o host mandou, que e a ordem
 * do proprio modelo semantico. Existe porque o autor do relatorio pode ja ter
 * ordenado a coluna no Power BI, e reordenar por cima disso apagaria a escolha
 * dele sem avisar.
 */
export const SORT_VALUE = 'value';
export const SORT_CATEGORY = 'category';
export const SORT_MODEL = 'model';
export const SORT_DESC = 'desc';
export const SORT_ASC = 'asc';

/**
 * Onde a barra de proporcao fica em relacao ao texto da linha.
 *
 * `behind` e o padrao, e e a tese do componente: a barra e um CAMPO TINGIDO
 * atras do texto, nao um grafico ao lado dele. Nenhuma largura e gasta numa
 * coluna separada, entao o rotulo fica com a linha inteira — que e exatamente
 * onde lista de ranking falha, no nome comprido. Lido de longe, e marca de
 * marcador sobre uma linha impressa, que e a regra "papel, nao tinta" aplicada.
 *
 * `beside` entrega o convencional para quem o quer; `none` deixa so a tabela.
 */
export const BAR_BEHIND = 'behind';
export const BAR_BESIDE = 'beside';
export const BAR_NONE = 'none';

/**
 * Contra o que a barra mede 100%.
 *
 * `max` compara cada linha com a MAIOR da lista — a primeira barra sempre enche,
 * e o que se le e a proporcao entre os itens. `total` compara com a soma, e o
 * que se le e a fatia de cada um no todo. Sao perguntas diferentes, e nenhuma
 * das duas e mais correta: por isso e campo, e nao decisao nossa.
 */
export const BASIS_MAX = 'max';
export const BASIS_TOTAL = 'total';

/**
 * Onde o numero fica na linha.
 *
 * `inline`/`stacked`, e nao `right`/`below`, de proposito: `VALUE_LABELS` e um
 * mapa PLANO por string de valor, e `below` ja significa "Abaixo do numero" no
 * `labelPosition` do KPI. Reusar a palavra poria o rotulo errado no dropdown do
 * Power BI — dentro do relatorio de outra pessoa, que e onde nao se conserta.
 */
export const VALUE_INLINE = 'inline';
export const VALUE_STACKED = 'stacked';

/**
 * Teto das medidas de moldura, em pixel.
 *
 * Nao e o tamanho da prancheta: espacamento de 200px ja e mais do que qualquer
 * composicao plausivel usa, e um teto folgado demais transforma um zero a mais
 * digitado por engano num componente que sumiu da tela sem explicacao.
 */
const LENGTH_MAX = 200;

/**
 * Campos de moldura, repetidos em todo no que desenha uma superficie.
 *
 * OS DEFAULTS CITAM `design.ts` — nao ha hex nem numero solto aqui. Ate a spec
 * 4.0.0 eram `#ffffff`, `#e2e8f0` e raio 8: o slate do Tailwind, escolhido por
 * estar a mao, e todo visual gerado nascia com cara de painel de SaaS.
 *
 * A borda nasce com UM PIXEL, e nao zero, e a sombra nasce em `none`. Essa e a
 * tese da linguagem visual escrita por extenso: um componente Vislow se separa
 * da tela do relatorio por TOM e por FIO, nunca por elevacao — e tom e fio
 * sobrevivem a impressao e a exportacao em PDF, onde sombra some ou suja.
 */
const SURFACE_FIELDS: FieldSpec[] = [
  { key: 'padding', label: 'Espacamento', kind: 'length', default: SPACE.lg, min: 0, max: LENGTH_MAX },
  { key: 'radius', label: 'Raio de borda', kind: 'length', default: RADIUS.md, min: 0, max: LENGTH_MAX },
  {
    // `borderWidth`, e nao `border`: o campo e uma MEDIDA, e `border: 2` se
    // leria como um enum cujo segundo valor foi escolhido. O nome mudou junto
    // com o tipo, para nao deixar um rastro do enum antigo num campo que ja nao
    // e enum.
    key: 'borderWidth',
    label: 'Espessura da borda',
    kind: 'length',
    default: STROKE.hairline,
    min: 0,
    max: 24,
  },
  { key: 'shadow', label: 'Sombra', kind: 'token', token: 'shadow', default: 'none' },
  { key: 'background', label: 'Cor de fundo', kind: 'color', default: PAPER },
  { key: 'borderColor', label: 'Cor da borda', kind: 'color', default: RULE },
];

/**
 * Faixa do tamanho de fonte, em pixel.
 *
 * O piso de 8 nao e arbitrario: abaixo disso o texto e ilegivel em qualquer
 * moldura, e oferecer o valor seria oferecer um jeito de esconder conteudo sem
 * perceber.
 */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;

/**
 * Carimba uma secao numa lista de campos.
 *
 * Existe porque `SURFACE_FIELDS` e COMPARTILHADO: `container` e `text` o usam sem
 * grupo nenhum — e e assim que os dois continuam desenhando exatamente como
 * desenhavam —, e so o KPI precisa dele numa secao. Carimbar na fonte poria
 * cabecalho nos tres.
 */
function grouped(group: string, fields: FieldSpec[]): FieldSpec[] {
  return fields.map((field) => ({ ...field, group }));
}

export const NODE_DESCRIPTORS: Record<NodeKind, NodeDescriptor> = {
  container: {
    kind: 'container',
    label: 'Container',
    hint: 'Agrupa outros componentes: empilhados, ou posicionados livremente.',
    keywords: ['grupo', 'caixa', 'secao', 'layout', 'empilhar', 'painel', 'canvas', 'prancheta'],
    shortcut: 'C',
    acceptsChildren: true,
    component: 'Container',
    fields: [
      {
        // `placement`, e nao `layout`: quando os graficos existiam, o de barras
        // tinha um campo `layout` que queria dizer ORIENTACAO. Dois campos de
        // mesmo nome e sentido diferente nao quebram compilacao — quebram a
        // leitura do fonte gerado, e um teste deste repo ja mediu o campo errado
        // por causa disso. O nome fica como esta para que a Fase 4 possa trazer
        // o `layout` de volta sem reabrir a colisao.
        key: 'placement',
        label: 'Disposicao',
        hint: 'Empilhar divide o espaco sozinho; livre da a cada filho a sua propria caixa.',
        // O codegen le esta chave para decidir se embrulha os filhos em
        // `CanvasSlot`. E a definicao de `structural`: a escolha ja foi gasta
        // quando o pacote foi gerado, entao ela nao vai ao painel do Power BI.
        structural: true,
        kind: 'select',
        options: [CONTAINER_STACK, CONTAINER_CANVAS],
        // `stack` e o default para que toda spec ja salva continue igual sem
        // migracao nenhuma: o campo ausente vira o comportamento de sempre.
        default: CONTAINER_STACK,
      },
      {
        key: 'direction',
        label: 'Direcao',
        kind: 'select',
        options: ['row', 'column'],
        default: 'column',
        showWhen: { key: 'placement', equals: CONTAINER_STACK },
      },
      {
        key: 'gap',
        label: 'Espaco entre itens',
        kind: 'length',
        default: SPACE.sm,
        min: 0,
        max: LENGTH_MAX,
        showWhen: { key: 'placement', equals: CONTAINER_STACK },
      },
      ...SURFACE_FIELDS,
    ],
  },

  /**
   * A caixa de texto. Onze campos, e a escolha nao foi so estetica: eles cobrem
   * os SEIS tipos de `FieldSpec` que um no pode declarar — `text`, `length`,
   * `token`, `color`, `boolean` e `select`. Um componente so exercita, ponta a
   * ponta, todo o caminho generico que o painel, o schema e o codegen percorrem;
   * o que passar aqui passa para qualquer componente futuro.
   */
  text: {
    kind: 'text',
    label: 'Texto',
    hint: 'Titulo, rotulo ou nota, dentro de uma caixa. Nao le dados do modelo.',
    keywords: ['titulo', 'rotulo', 'legenda', 'nota', 'paragrafo', 'cabecalho', 'caixa'],
    shortcut: 'T',
    acceptsChildren: false,
    component: 'TextBox',
    fields: [
      // 500, e nao os 200 de antes: a caixa passou a quebrar linha, e um teto de
      // 200 num campo que agora aceita paragrafo cortaria a frase no meio sem
      // dizer por que.
      { key: 'content', label: 'Conteudo', kind: 'text', default: 'Texto', maxLength: 500 },
      {
        key: 'fontSize',
        label: 'Tamanho',
        kind: 'length',
        default: TYPE_SCALE.title,
        min: FONT_SIZE_MIN,
        max: FONT_SIZE_MAX,
      },
      { key: 'fontWeight', label: 'Peso', kind: 'token', token: 'fontWeight', default: 'semibold' },
      { key: 'align', label: 'Alinhamento', kind: 'token', token: 'align', default: 'left' },
      {
        key: 'valign',
        label: 'Alinhamento vertical',
        hint: 'Onde o texto fica quando a caixa e mais alta que ele.',
        kind: 'token',
        token: 'valign',
        default: 'top',
      },
      { key: 'color', label: 'Cor do texto', kind: 'color', default: INK },
      {
        // Interruptor, e nao uma cor "transparente": `COLOR_PATTERN` so aceita
        // `#rrggbb`, e abrir o padrao para oito digitos mudaria a validacao de
        // TODA cor do produto por causa deste caso. O interruptor ainda diz
        // melhor: desligar o fundo nao apaga a cor ja escolhida.
        key: 'showBackground',
        label: 'Fundo',
        kind: 'boolean',
        default: false,
      },
      {
        key: 'background',
        label: 'Cor de fundo',
        kind: 'color',
        default: PAPER,
        showWhen: { key: 'showBackground', equals: 'true' },
      },
      {
        key: 'padding',
        label: 'Espacamento',
        kind: 'length',
        default: SPACE.sm,
        min: 0,
        max: LENGTH_MAX,
      },
      {
        key: 'radius',
        label: 'Raio de borda',
        kind: 'length',
        default: RADIUS.md,
        min: 0,
        max: LENGTH_MAX,
      },
      {
        key: 'overflow',
        label: 'Quando nao cabe',
        hint: 'Quebrar em varias linhas, ou cortar com reticencias numa linha so.',
        kind: 'select',
        options: ['wrap', 'truncate'],
        default: 'wrap',
      },
    ],
  },

  /**
   * O KPI Card (RF-16). O PRIMEIRO no a consumir dados desde a poda da spec
   * 5.0.0 — e portanto o que devolve o poco de campos ao visual gerado.
   *
   * Consequencia de declarar papel, e ela e ampla: `consumesData('kpi')` passa a
   * ser verdadeiro, `usedRoles` para de devolver vazio, o `capabilities.json`
   * volta a ter `dataRoles`, `requiredTypes` e `dataViewMappings`, e os testes que
   * afirmavam o estado sem dados falham por construcao. Isso e desenhado: era o
   * lembrete combinado de descongelar a quarentena.
   *
   * SO MEDIDAS, nenhum agrupamento. Um card de numero unico nao tem marca para
   * clicar, e so coluna vinda de `categories` gera selection id — entao
   * cross-filter (RF-18) e truncamento (RF-25) continuam sem sujeito. Declarar um
   * papel de categoria que nao desenha nada, so para produzir identidade, seria
   * um campo no poco que existe para satisfazer teste.
   *
   * Vinte e sete campos, contra os onze do `text`, porque o controle e POR LINHA:
   * valor, rotulo e variacao tem tamanho, peso e cor independentes. E por isso
   * que `group` nasceu — os dois paineis desenham secao, e nao um paredao.
   */
  kpi: {
    kind: 'kpi',
    label: 'KPI',
    hint: 'Um numero unico, com rotulo e comparacao opcional contra outra medida.',
    keywords: ['numero', 'cartao', 'card', 'indicador', 'metrica', 'total', 'meta', 'variacao'],
    shortcut: 'K',
    acceptsChildren: false,
    component: 'KpiCard',
    fields: [
      ...grouped('Dados', [
        {
          key: 'valueRole',
          label: 'Valor',
          hint: 'A medida que o card mostra. Sem ela o visual pede o campo em vez de desenhar.',
          kind: 'role',
          roleKind: 'measure',
        },
        {
          // OPCIONAL: nasce com `''` e o schema aceita a string vazia. Sem a
          // bandeira o no nasceria invalido por falta de um campo que a maioria
          // dos KPIs nunca liga, e o export ficaria bloqueado sem motivo.
          key: 'compareRole',
          label: 'Comparar com',
          hint: 'Meta, periodo anterior ou orcamento. Vazio esconde a linha de variacao.',
          kind: 'role',
          roleKind: 'measure',
          optional: true,
        },
        {
          key: 'polarity',
          label: 'Sentido',
          hint: 'Em custo ou churn, cair e bom. A seta segue o sinal; so a cor muda.',
          kind: 'select',
          options: [POLARITY_HIGHER, POLARITY_LOWER, POLARITY_NEUTRAL],
          default: POLARITY_HIGHER,
        },
      ]),

      ...grouped('Valor', [
        {
          key: 'valueFontSize',
          label: 'Tamanho',
          // `figure` e o degrau da escala descrito como "um numero sozinho, que e
          // para ser lido do outro lado da sala". E literalmente este campo.
          kind: 'length',
          default: TYPE_SCALE.figure,
          min: FONT_SIZE_MIN,
          max: FONT_SIZE_MAX,
        },
        { key: 'valueWeight', label: 'Peso', kind: 'token', token: 'fontWeight', default: 'semibold' },
        { key: 'valueColor', label: 'Cor', kind: 'color', default: INK },
      ]),

      ...grouped('Rotulo', [
        {
          key: 'label',
          label: 'Texto',
          hint: 'Vazio usa o nome do campo que o consumidor arrastou.',
          kind: 'text',
          default: '',
          maxLength: 60,
        },
        {
          key: 'labelPosition',
          label: 'Posicao',
          kind: 'select',
          options: [LABEL_ABOVE, LABEL_BELOW],
          default: LABEL_BELOW,
        },
        {
          key: 'labelFontSize',
          label: 'Tamanho',
          kind: 'length',
          default: TYPE_SCALE.label,
          min: FONT_SIZE_MIN,
          max: FONT_SIZE_MAX,
        },
        { key: 'labelWeight', label: 'Peso', kind: 'token', token: 'fontWeight', default: 'normal' },
        { key: 'labelColor', label: 'Cor', kind: 'color', default: INK_MUTED },
      ]),

      ...grouped('Variacao', [
        {
          key: 'deltaMode',
          label: 'Mostrar',
          hint: 'A diferenca absoluta, o percentual, ou os dois.',
          kind: 'select',
          options: [DELTA_BOTH, DELTA_ABSOLUTE, DELTA_PERCENT],
          default: DELTA_BOTH,
        },
        {
          key: 'compareLabel',
          label: 'Legenda',
          hint: 'Vazio usa o nome do campo de comparacao.',
          kind: 'text',
          default: '',
          maxLength: 40,
        },
        {
          key: 'deltaFontSize',
          label: 'Tamanho',
          kind: 'length',
          default: TYPE_SCALE.label,
          min: FONT_SIZE_MIN,
          max: FONT_SIZE_MAX,
        },
        { key: 'deltaWeight', label: 'Peso', kind: 'token', token: 'fontWeight', default: 'medium' },
        {
          // AS DUAS NASCEM ACROMATICAS, e nao verde e vermelha. Numa ferramenta de
          // composicao a cor e do autor do relatorio: `design.ts` nao tem um unico
          // valor cromatico, e um default verde o obrigaria a ter dois. A direcao
          // nao depende da cor — a seta e o sinal a carregam sozinhos, que e o que
          // faz o card funcionar em daltonismo, em alto contraste e impresso.
          key: 'upColor',
          label: 'Cor quando favoravel',
          kind: 'color',
          default: INK_MUTED,
        },
        { key: 'downColor', label: 'Cor quando desfavoravel', kind: 'color', default: INK_MUTED },
        {
          // O fio que separa a variacao do numero. E a regra "tom e fio, nunca
          // elevacao" aplicada a uma decisao de CONTEUDO: a comparacao e outra
          // afirmacao que o valor, e o fio diz isso sem gastar cor.
          key: 'showRule',
          label: 'Fio acima',
          kind: 'boolean',
          default: true,
        },
      ]),

      ...grouped('Layout', [
        // `left` e nao `center`: cards de KPI vivem em fila, e o olho compara uma
        // coluna de numeros alinhados a esquerda muito mais rapido do que uma
        // coluna centralizada, em que cada numero comeca num lugar diferente.
        { key: 'align', label: 'Alinhamento', kind: 'token', token: 'align', default: 'left' },
        {
          key: 'valign',
          label: 'Alinhamento vertical',
          hint: 'Onde o bloco fica quando a caixa e mais alta que ele.',
          kind: 'token',
          token: 'valign',
          default: 'middle',
        },
        {
          key: 'gap',
          label: 'Espaco entre linhas',
          kind: 'length',
          default: SPACE.xs,
          min: 0,
          max: LENGTH_MAX,
        },
      ]),

      ...grouped('Superficie', SURFACE_FIELDS),
    ],
  },

  /**
   * A Lista de Ranking (Top-N). O PRIMEIRO no do catalogo a declarar papel de
   * AGRUPAMENTO — e e so isso que faltava para meia duzia de capacidades
   * saírem do congelador.
   *
   * O que este unico campo destrava, sem uma linha de codigo nova em nenhum dos
   * lugares abaixo: `usedRoles` passa a devolver um papel `Grouping`, o
   * `capabilities.json` ganha `categorical.categories` e o
   * `dataReductionAlgorithm`, o host passa a entregar `categories`,
   * `buildIdentities` para de devolver `{}`, `isSelected` para de ser sempre
   * falso e `truncationOf` para de ser sempre ausente. Tudo isso ja existia
   * escrito e sem nenhum chamador desde o Sprint 6 — a cadeia estava inteira e
   * morta, e o elo que faltava era o primeiro.
   *
   * ===================== POR QUE UMA LISTA, E NAO UM GRAFICO ==================
   * Estrear selecao num grafico de barras somaria dois riscos numa sprint so:
   * matematica de eixo, tick, grade e colisao de rotulo de um lado; identidade,
   * esmaecimento e teclado do outro. A lista e 100% `div` — sem SVG, entao o
   * alto contraste continua funcionando por `var()`, que em atributo de
   * apresentacao de SVG nao funciona. E cada linha ja e um alvo com rotulo de
   * TEXTO, entao `role="button"` e `aria-label` saem corretos sem inventar nada.
   * ============================================================================
   *
   * Trinta e dois campos, na mesma logica dos vinte e sete do KPI: as partes que
   * COMPETEM visualmente — rotulo, numero, barra e o estado esmaecido — tem cada
   * uma tamanho, peso e cor proprios. Sem isso o autor nao consegue fazer o
   * numero recuar para o rotulo dominar, que e a decisao de design mais
   * frequente numa lista.
   */
  ranking: {
    kind: 'ranking',
    label: 'Lista de Ranking',
    hint: 'Categorias em ordem, com barra de proporcao. Clicar numa linha filtra o relatorio.',
    keywords: [
      'lista',
      'ranking',
      'top',
      'classificacao',
      'barra',
      'proporcao',
      'maiores',
      'tabela',
      'categoria',
    ],
    shortcut: 'L',
    acceptsChildren: false,
    component: 'RankingList',
    fields: [
      ...grouped('Dados', [
        {
          // O ELO QUE FALTAVA. Unico campo `roleKind: 'grouping'` do catalogo.
          key: 'categoryRole',
          label: 'Categoria',
          hint: 'A coluna que vira uma linha. E por ela que o clique filtra o relatorio.',
          kind: 'role',
          roleKind: 'grouping',
        },
        {
          key: 'valueRole',
          label: 'Valor',
          hint: 'A medida que ordena a lista e desenha a barra.',
          kind: 'role',
          roleKind: 'measure',
        },
        {
          key: 'sortMode',
          label: 'Ordenar por',
          hint: 'Pelo modelo entrega na ordem que o Power BI mandou, sem reordenar.',
          kind: 'select',
          options: [SORT_VALUE, SORT_CATEGORY, SORT_MODEL],
          default: SORT_VALUE,
        },
        {
          key: 'sortDirection',
          label: 'Sentido',
          kind: 'select',
          options: [SORT_DESC, SORT_ASC],
          default: SORT_DESC,
          showWhen: { key: 'sortMode', equals: SORT_VALUE },
        },
        {
          /*
           * `number`, e nao `length`: e uma CONTAGEM, nao uma medida de tela. Um
           * campo com sufixo "px" e teto 50 se leria como cinquenta pixels de
           * coisa nenhuma.
           *
           * O teto de 50 nao e o do host — o `dataReductionAlgorithm` corta em
           * 1000, e o aviso de truncamento fala desse numero. Este e o teto do
           * que uma lista LEGIVEL comporta: acima disso o visual vira uma tabela
           * rolavel, que e outro componente e nao este.
           */
          key: 'maxRows',
          label: 'Quantas linhas',
          hint: 'As demais ficam de fora da lista, mas continuam na conta do total.',
          kind: 'number',
          default: 10,
          min: 1,
          max: 50,
        },
      ]),

      ...grouped('Linha', [
        {
          // Zero, com fio ligado: a lista nasce lendo como TABELA IMPRESSA, e nao
          // como uma pilha de cartoes. Fio e o dispositivo de separacao do
          // sistema; faixa zebrada exigiria uma segunda cor de fundo, e fio exige
          // uma cor so.
          key: 'rowGap',
          label: 'Espaco entre linhas',
          kind: 'length',
          default: 0,
          min: 0,
          max: LENGTH_MAX,
        },
        {
          key: 'rowPadding',
          label: 'Espacamento interno',
          kind: 'length',
          default: SPACE.sm,
          min: 0,
          max: LENGTH_MAX,
        },
        { key: 'showDivider', label: 'Fio entre linhas', kind: 'boolean', default: true },
        {
          key: 'dividerColor',
          label: 'Cor do fio',
          kind: 'color',
          default: RULE,
          showWhen: { key: 'showDivider', equals: 'true' },
        },
      ]),

      ...grouped('Rotulo', [
        {
          key: 'labelFontSize',
          label: 'Tamanho',
          kind: 'length',
          default: TYPE_SCALE.body,
          min: FONT_SIZE_MIN,
          max: FONT_SIZE_MAX,
        },
        {
          key: 'labelWeight',
          label: 'Peso',
          kind: 'token',
          token: 'fontWeight',
          default: 'medium',
        },
        { key: 'labelColor', label: 'Cor', kind: 'color', default: INK },
        {
          // `truncate` por padrao, ao contrario da Caixa de Texto: uma linha de
          // ranking que quebra em duas desalinha a coluna de numeros ao lado, e
          // e justamente o alinhamento dela que faz a lista ser varrivel. O nome
          // inteiro continua no balao do tooltip.
          key: 'labelOverflow',
          label: 'Quando nao cabe',
          kind: 'select',
          options: ['wrap', 'truncate'],
          default: 'truncate',
        },
      ]),

      ...grouped('Valor', [
        {
          // MESMO tamanho do rotulo, de proposito. O numero ganha enfase por
          // PESO, e nao por escala: as duas colunas continuam lendo como uma
          // linha so, em vez de dois tamanhos competindo dentro dela.
          key: 'valueFontSize',
          label: 'Tamanho',
          kind: 'length',
          default: TYPE_SCALE.body,
          min: FONT_SIZE_MIN,
          max: FONT_SIZE_MAX,
        },
        {
          key: 'valueWeight',
          label: 'Peso',
          kind: 'token',
          token: 'fontWeight',
          default: 'semibold',
        },
        { key: 'valueColor', label: 'Cor', kind: 'color', default: INK },
        {
          key: 'valuePosition',
          label: 'Posicao',
          hint: 'Na mesma linha do rotulo, ou abaixo dele.',
          kind: 'select',
          options: [VALUE_INLINE, VALUE_STACKED],
          default: VALUE_INLINE,
        },
      ]),

      ...grouped('Barra', [
        {
          key: 'barMode',
          label: 'Barra',
          hint: 'Atras do texto ela nao gasta largura, e o rotulo fica com a linha inteira.',
          kind: 'select',
          options: [BAR_BEHIND, BAR_BESIDE, BAR_NONE],
          default: BAR_BEHIND,
        },
        {
          key: 'barBasis',
          label: 'Medir contra',
          hint: 'O maior da lista mostra proporcao entre itens; a soma mostra fatia do todo.',
          kind: 'select',
          options: [BASIS_MAX, BASIS_TOTAL],
          default: BASIS_MAX,
        },
        {
          /*
           * `RULE`, e nao `PAPER_SUNK`.
           *
           * A barra e a marca de dados do componente, e `PAPER_SUNK` sobre
           * `PAPER` e diferenca pequena demais: o componente nasceria parecendo
           * quebrado, que e uma primeira impressao que nao se recupera. `RULE`
           * sobre `PAPER` e tinta VISIVEL e ainda assim acromatica, e `INK`
           * sobre `RULE` passa folgado de 7:1 — o que importa porque no modo
           * padrao o texto fica POR CIMA dela.
           */
          key: 'barColor',
          label: 'Cor da barra',
          kind: 'color',
          default: RULE,
        },
        {
          key: 'barTrackColor',
          label: 'Cor do trilho',
          hint: 'O que fica atras da barra, na parte que ela nao preenche.',
          kind: 'color',
          default: PAPER_SUNK,
        },
        {
          // So no modo ao lado: atras do texto a barra ocupa a altura da linha
          // inteira, e uma altura declarada ali seria um controle que nao faz
          // nada — o mesmo motivo pelo qual `direction` some num container que
          // posiciona livremente.
          key: 'barHeight',
          label: 'Altura da barra',
          kind: 'length',
          default: SPACE.sm,
          min: 1,
          max: LENGTH_MAX,
          showWhen: { key: 'barMode', equals: BAR_BESIDE },
        },
        {
          key: 'barRadius',
          label: 'Raio da barra',
          kind: 'length',
          default: RADIUS.sm,
          min: 0,
          max: LENGTH_MAX,
        },
      ]),

      ...grouped('Selecao', [
        {
          /*
           * 32 pontos percentuais. Nao 50, que fica papa e continua competindo;
           * nao 15, em que a linha some e se perde a FORMA do ranking.
           *
           * Em 32 o que esta fora da selecao continua legivel como estrutura:
           * voce ainda ve a distribuicao de onde filtrou. Para um instrumento de
           * filtro cruzado isso e o comportamento honesto — esconder o contexto
           * que o proprio usuario acabou de tirar da conta e o esconde de si
           * mesmo.
           */
          key: 'dimOpacity',
          label: 'Opacidade do que sai da selecao',
          hint: 'Em pontos percentuais. Vale quando ha selecao em qualquer visual da pagina.',
          kind: 'number',
          default: 32,
          min: 0,
          max: 100,
        },
        {
          // A linha selecionada ganha um FIO NA MARGEM, e nao um fundo: fundo
          // brigaria com o campo tingido da barra, que no modo padrao ocupa a
          // linha inteira. Marca de margem e o vocabulario da lista impressa, e
          // compoe com a barra em vez de disputar com ela.
          key: 'selectedColor',
          label: 'Cor da marca de selecao',
          kind: 'color',
          default: INK,
        },
        {
          key: 'hoverBackground',
          label: 'Cor ao passar o mouse',
          kind: 'color',
          default: PAPER_SUNK,
        },
      ]),

      ...grouped('Superficie', SURFACE_FIELDS),
    ],
  },
};

export const NODE_KINDS = Object.keys(NODE_DESCRIPTORS) as NodeKind[];

export function descriptorFor(kind: NodeKind): NodeDescriptor {
  return NODE_DESCRIPTORS[kind];
}

/** Papeis de dados que um no consome, na ordem em que aparecem nos campos. */
export function roleFieldsOf(kind: NodeKind): Extract<FieldSpec, { kind: 'role' }>[] {
  return NODE_DESCRIPTORS[kind].fields.filter(
    (field): field is Extract<FieldSpec, { kind: 'role' }> => field.kind === 'role',
  );
}

/**
 * O campo pode ser publicado no painel de formatacao do visual gerado?
 *
 * Duas exclusoes, e as duas sao por natureza do campo, nao por gosto:
 *
 *   - `structural`, porque o codegen ja consumiu a escolha para decidir a forma
 *     da arvore (ver `FieldBase.structural`);
 *   - `role`, porque campo de papel nao e formatacao: e a ligacao com uma coluna
 *     do modelo, e quem a troca e o poco de campos do Power BI, nao um slice.
 *
 * FONTE UNICA dos tres consumidores de sempre — o painel do editor, que decide
 * onde desenhar o alternador; o `validateSpec`, que reprova chave publicada que
 * nao poderia ser; e o codegen, que emite o `objects` do capabilities.
 */
export function isExposable(field: FieldSpec): boolean {
  return field.kind !== 'role' && field.structural !== true;
}

/** Campos publicaveis de um tipo de no, na ordem do descritor. */
export function exposableFields(kind: NodeKind): FieldSpec[] {
  return NODE_DESCRIPTORS[kind].fields.filter(isExposable);
}

/**
 * O no le o `DataFrame`?
 *
 * Vive AQUI porque tem dois consumidores que precisam concordar: o codegen, que
 * decide se emite `frame={frame}` no JSX gerado, e o preview do editor, que
 * decide se passa a prop `frame`. Cada um com a sua copia da regra e a
 * divergencia mais barata de introduzir e mais cara de achar — o preview
 * desenharia dados e o pacote entregue cairia no estado vazio.
 *
 * VOLTOU A MORDER na spec 5.2.0. Entre a poda da 5.0.0 e o KPI Card isto
 * devolvia `false` sempre, e o `capabilities` gerado saia com `dataRoles: []` —
 * o visual nao tinha poco de campos no Power BI. Com o `kpi` no catalogo,
 * `container` e `text` continuam devolvendo `false` e uma arvore so deles gera o
 * mesmo pacote de antes, byte a byte.
 */
export function consumesData(kind: NodeKind): boolean {
  return roleFieldsOf(kind).length > 0;
}

/**
 * Props default de um tipo de no.
 *
 * Campo de papel OBRIGATORIO nao entra: ele referencia um papel que o usuario
 * declarou no projeto, e nao ha default sensato — quem cria o no escolhe. A
 * ausencia e o mecanismo, nao um efeito colateral: o no nasce reprovado pelo
 * schema, o painel e a arvore apontam a pendencia e o export fica bloqueado
 * (RF-12) ate a medida ser ligada. Um KPI exportavel sem medida entregaria um
 * pacote que so sabe mostrar o estado vazio.
 *
 * Campo de papel OPCIONAL entra como `''` — "declarado, nao ligado". Sem isso o
 * no nasceria pendente por causa de um campo que a maioria dos KPIs nunca liga.
 */
export function defaultPropsFor(kind: NodeKind): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const field of NODE_DESCRIPTORS[kind].fields) {
    if (field.kind !== 'role') props[field.key] = field.default;
    else if (field.optional === true) props[field.key] = '';
  }
  return props;
}
