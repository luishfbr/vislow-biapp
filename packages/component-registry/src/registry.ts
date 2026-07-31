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

/** Campos de moldura, repetidos em todo no que desenha uma superficie. */
const SURFACE_FIELDS: FieldSpec[] = [
  { key: 'padding', label: 'Espacamento', kind: 'token', token: 'spacing', default: 'md' },
  { key: 'radius', label: 'Raio de borda', kind: 'token', token: 'radius', default: 'lg' },
  { key: 'border', label: 'Borda', kind: 'token', token: 'border', default: 'none' },
  { key: 'shadow', label: 'Sombra', kind: 'token', token: 'shadow', default: 'none' },
  { key: 'background', label: 'Cor de fundo', kind: 'color', default: '#ffffff' },
  { key: 'borderColor', label: 'Cor da borda', kind: 'color', default: '#e2e8f0' },
];

/** Campos comuns a todo no que le uma serie categoria/valor. */
const SERIES_FIELDS: FieldSpec[] = [
  { key: 'categoryRole', label: 'Categoria', kind: 'role', roleKind: 'grouping' },
  { key: 'measureRole', label: 'Valor', kind: 'role', roleKind: 'measure' },
];

const AXIS_FIELDS: FieldSpec[] = [
  { key: 'showGrid', label: 'Linhas de grade', kind: 'boolean', default: true },
  { key: 'showTooltip', label: 'Tooltip', kind: 'boolean', default: true },
  { key: 'showXAxis', label: 'Eixo horizontal', kind: 'boolean', default: true },
  { key: 'showYAxis', label: 'Eixo vertical', kind: 'boolean', default: true },
];

export const NODE_DESCRIPTORS: Record<NodeKind, NodeDescriptor> = {
  container: {
    kind: 'container',
    label: 'Container',
    hint: 'Agrupa e posiciona outros componentes em linha ou coluna.',
    keywords: ['grupo', 'caixa', 'secao', 'layout', 'empilhar', 'painel'],
    acceptsChildren: true,
    component: 'Container',
    fields: [
      {
        key: 'direction',
        label: 'Direcao',
        kind: 'select',
        options: ['row', 'column'],
        default: 'column',
      },
      { key: 'gap', label: 'Espaco entre itens', kind: 'token', token: 'spacing', default: 'sm' },
      ...SURFACE_FIELDS,
    ],
  },

  text: {
    kind: 'text',
    label: 'Texto',
    hint: 'Titulo, rotulo ou nota. Nao le dados do modelo.',
    keywords: ['titulo', 'rotulo', 'legenda', 'nota', 'paragrafo', 'cabecalho'],
    acceptsChildren: false,
    component: 'TextNode',
    fields: [
      { key: 'content', label: 'Conteudo', kind: 'text', default: 'Texto', maxLength: 200 },
      { key: 'fontSize', label: 'Tamanho', kind: 'token', token: 'fontSize', default: 'lg' },
      { key: 'fontWeight', label: 'Peso', kind: 'token', token: 'fontWeight', default: 'bold' },
      { key: 'align', label: 'Alinhamento', kind: 'token', token: 'align', default: 'left' },
      { key: 'color', label: 'Cor', kind: 'color', default: '#1e293b' },
    ],
  },

  kpi: {
    kind: 'kpi',
    label: 'KPI',
    hint: 'Destaca um numero unico, agregado da medida.',
    keywords: ['numero', 'cartao', 'card', 'indicador', 'metrica', 'total'],
    acceptsChildren: false,
    component: 'KpiNode',
    fields: [
      { key: 'measureRole', label: 'Valor', kind: 'role', roleKind: 'measure' },
      { key: 'label', label: 'Rotulo', kind: 'text', default: '', maxLength: 60 },
      { key: 'valueFontSize', label: 'Tamanho do valor', kind: 'token', token: 'fontSize', default: '4xl' },
      { key: 'valueColor', label: 'Cor do valor', kind: 'color', default: '#3b82f6' },
      { key: 'labelColor', label: 'Cor do rotulo', kind: 'color', default: '#64748b' },
    ],
  },

  barChart: {
    kind: 'barChart',
    label: 'Barras',
    hint: 'Compara valores entre categorias.',
    keywords: ['grafico', 'colunas', 'ranking', 'comparar', 'barra'],
    acceptsChildren: false,
    component: 'BarChartNode',
    fields: [
      ...SERIES_FIELDS,
      { key: 'color', label: 'Cor das barras', kind: 'color', default: '#3b82f6' },
      {
        key: 'layout',
        label: 'Orientacao',
        kind: 'select',
        options: ['vertical', 'horizontal'],
        default: 'vertical',
      },
      ...AXIS_FIELDS,
    ],
  },

  lineChart: {
    kind: 'lineChart',
    label: 'Linha',
    hint: 'Mostra evolucao ao longo de uma sequencia.',
    keywords: ['grafico', 'tempo', 'serie temporal', 'tendencia', 'evolucao'],
    acceptsChildren: false,
    component: 'LineChartNode',
    fields: [
      ...SERIES_FIELDS,
      { key: 'color', label: 'Cor da linha', kind: 'color', default: '#3b82f6' },
      { key: 'strokeWidth', label: 'Espessura', kind: 'number', default: 2, min: 1, max: 8 },
      { key: 'showDots', label: 'Marcadores', kind: 'boolean', default: true },
      ...AXIS_FIELDS,
    ],
  },

  areaChart: {
    kind: 'areaChart',
    label: 'Area',
    hint: 'Como linha, com enfase no volume acumulado.',
    keywords: ['grafico', 'tempo', 'volume', 'acumulado', 'tendencia'],
    acceptsChildren: false,
    component: 'AreaChartNode',
    fields: [
      ...SERIES_FIELDS,
      { key: 'color', label: 'Cor da area', kind: 'color', default: '#3b82f6' },
      { key: 'fillOpacity', label: 'Opacidade', kind: 'number', default: 30, min: 5, max: 100 },
      ...AXIS_FIELDS,
    ],
  },

  pieChart: {
    kind: 'pieChart',
    label: 'Pizza',
    hint: 'Composicao de um total. Use com poucas categorias.',
    keywords: ['grafico', 'rosca', 'donut', 'proporcao', 'participacao', 'fatia'],
    acceptsChildren: false,
    component: 'PieChartNode',
    fields: [
      ...SERIES_FIELDS,
      {
        key: 'innerRadius',
        label: 'Raio interno',
        kind: 'number',
        default: 0,
        min: 0,
        max: 80,
      },
      { key: 'showLegend', label: 'Legenda', kind: 'boolean', default: true },
      { key: 'showTooltip', label: 'Tooltip', kind: 'boolean', default: true },
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
 * O no le o `DataFrame`?
 *
 * Vive AQUI porque tem dois consumidores que precisam concordar: o codegen, que
 * decide se emite `frame={frame}` no JSX gerado, e o preview do editor, que
 * decide se passa a prop `frame`. Cada um com a sua copia da regra e a
 * divergencia mais barata de introduzir e mais cara de achar — o preview
 * desenharia dados e o pacote entregue cairia no estado vazio.
 */
export function consumesData(kind: NodeKind): boolean {
  return roleFieldsOf(kind).length > 0;
}

/**
 * Props default de um tipo de no.
 *
 * Campos de papel NAO entram: eles referenciam um papel que o usuario declarou
 * no projeto, e nao ha default sensato — quem cria o no escolhe.
 */
export function defaultPropsFor(kind: NodeKind): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const field of NODE_DESCRIPTORS[kind].fields) {
    if (field.kind !== 'role') props[field.key] = field.default;
  }
  return props;
}
