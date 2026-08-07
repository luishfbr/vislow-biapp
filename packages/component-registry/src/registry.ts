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

// Constantes, e nao strings soltas: cada valor e comparado no descritor, no `showWhen`,
// no preview e no codegen. Ver docs/frontend.md.
export const CONTAINER_STACK = 'stack';
export const CONTAINER_CANVAS = 'canvas';

export const POLARITY_HIGHER = 'higher';
export const POLARITY_LOWER = 'lower';
export const POLARITY_NEUTRAL = 'neutral';

export const LABEL_ABOVE = 'above';
export const LABEL_BELOW = 'below';

export const DELTA_BOTH = 'both';
export const DELTA_ABSOLUTE = 'absolute';
export const DELTA_PERCENT = 'percent';

export const SORT_VALUE = 'value';
export const SORT_CATEGORY = 'category';
export const SORT_MODEL = 'model';
export const SORT_DESC = 'desc';
export const SORT_ASC = 'asc';

export const BAR_BEHIND = 'behind';
export const BAR_BESIDE = 'beside';
export const BAR_NONE = 'none';

export const BASIS_MAX = 'max';
export const BASIS_TOTAL = 'total';

export const VALUE_INLINE = 'inline';
export const VALUE_STACKED = 'stacked';

const LENGTH_MAX = 200;

const SURFACE_FIELDS: FieldSpec[] = [
  { key: 'padding', label: 'Espacamento', kind: 'length', default: SPACE.lg, min: 0, max: LENGTH_MAX },
  { key: 'radius', label: 'Raio de borda', kind: 'length', default: RADIUS.md, min: 0, max: LENGTH_MAX },
  {
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

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;

/** Carimba uma secao. `SURFACE_FIELDS` e compartilhado e `container`/`text` o usam SEM grupo. */
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
        key: 'placement',
        label: 'Disposicao',
        hint: 'Empilhar divide o espaco sozinho; livre da a cada filho a sua propria caixa.',
        structural: true,
        kind: 'select',
        options: [CONTAINER_STACK, CONTAINER_CANVAS],
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

  text: {
    kind: 'text',
    label: 'Texto',
    hint: 'Titulo, rotulo ou nota, dentro de uma caixa. Nao le dados do modelo.',
    keywords: ['titulo', 'rotulo', 'legenda', 'nota', 'paragrafo', 'cabecalho', 'caixa'],
    shortcut: 'T',
    acceptsChildren: false,
    component: 'TextBox',
    fields: [
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
          key: 'upColor',
          label: 'Cor quando favoravel',
          kind: 'color',
          default: INK_MUTED,
        },
        { key: 'downColor', label: 'Cor quando desfavoravel', kind: 'color', default: INK_MUTED },
        {
          key: 'showRule',
          label: 'Fio acima',
          kind: 'boolean',
          default: true,
        },
      ]),

      ...grouped('Layout', [
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
          key: 'labelOverflow',
          label: 'Quando nao cabe',
          kind: 'select',
          options: ['wrap', 'truncate'],
          default: 'truncate',
        },
      ]),

      ...grouped('Valor', [
        {
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
          key: 'dimOpacity',
          label: 'Opacidade do que sai da selecao',
          hint: 'Em pontos percentuais. Vale quando ha selecao em qualquer visual da pagina.',
          kind: 'number',
          default: 32,
          min: 0,
          max: 100,
        },
        {
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

export function roleFieldsOf(kind: NodeKind): Extract<FieldSpec, { kind: 'role' }>[] {
  return NODE_DESCRIPTORS[kind].fields.filter(
    (field): field is Extract<FieldSpec, { kind: 'role' }> => field.kind === 'role',
  );
}

/** Campo `structural` e campo de papel nunca sao publicaveis — ver docs/build-visual.md. */
export function isExposable(field: FieldSpec): boolean {
  return field.kind !== 'role' && field.structural !== true;
}

export function exposableFields(kind: NodeKind): FieldSpec[] {
  return NODE_DESCRIPTORS[kind].fields.filter(isExposable);
}

/** Aqui, e nao em cada consumidor: o codegen e o preview precisam concordar sobre quem le o `DataFrame`. */
export function consumesData(kind: NodeKind): boolean {
  return roleFieldsOf(kind).length > 0;
}

/** Campo de papel OBRIGATORIO nao entra: nao ha default sensato, e o no nasce pendente (RF-12). */
export function defaultPropsFor(kind: NodeKind): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const field of NODE_DESCRIPTORS[kind].fields) {
    if (field.kind !== 'role') props[field.key] = field.default;
    else if (field.optional === true) props[field.key] = '';
  }
  return props;
}
