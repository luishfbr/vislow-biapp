import { TOKEN_CATALOG, type ChartType, type TokenKind } from '@vislow/config-schema';

/**
 * Declaracao dos controles do painel.
 *
 * O painel e GERADO a partir daqui, e nao escrito a mao propriedade por
 * propriedade. Adicionar um token ao schema e uma linha nesta tabela faz o
 * controle aparecer, ja com os valores validos vindos do catalogo — sem chance
 * de a UI oferecer um valor que o schema rejeita.
 */

export type FieldKind = 'token' | 'color' | 'boolean' | 'text';

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
}

/**
 * Uniao discriminada: `token` so existe — e e obrigatorio — quando o campo e do
 * tipo 'token'. Modelar assim elimina a assercao nao-nula no ponto de uso; o
 * compilador passa a garantir o que antes era convencao.
 */
export type Field =
  | (FieldBase & { kind: 'token'; token: TokenKind })
  | (FieldBase & { kind: 'color' | 'boolean' | 'text' });

export interface Group {
  title: string;
  /** Bloco do VisualConfig ao qual os campos pertencem. */
  section: 'layout' | 'header' | 'labels' | 'bar' | 'kpi';
  /** Quando ausente, o grupo vale para todos os tipos de visual. */
  onlyFor?: ChartType;
  fields: Field[];
}

export const CONTROL_GROUPS: Group[] = [
  {
    title: 'Titulo',
    section: 'header',
    fields: [
      { key: 'show', label: 'Exibir titulo', kind: 'boolean' },
      { key: 'text', label: 'Texto', kind: 'text' },
      { key: 'fontSize', label: 'Tamanho', kind: 'token', token: 'fontSize' },
      { key: 'fontWeight', label: 'Peso', kind: 'token', token: 'fontWeight' },
      { key: 'align', label: 'Alinhamento', kind: 'token', token: 'align' },
      { key: 'textColor', label: 'Cor do texto', kind: 'color' },
    ],
  },
  {
    title: 'Layout',
    section: 'layout',
    fields: [
      { key: 'padding', label: 'Espacamento', kind: 'token', token: 'spacing' },
      { key: 'radius', label: 'Raio de borda', kind: 'token', token: 'radius' },
      { key: 'shadow', label: 'Sombra', kind: 'token', token: 'shadow' },
      { key: 'border', label: 'Borda', kind: 'token', token: 'border' },
      { key: 'surfaceColor', label: 'Cor de fundo', kind: 'color' },
      { key: 'borderColor', label: 'Cor da borda', kind: 'color' },
    ],
  },
  {
    title: 'Barras',
    section: 'bar',
    onlyFor: 'bar',
    fields: [
      { key: 'accentColor', label: 'Cor das barras', kind: 'color' },
      { key: 'barRadius', label: 'Raio das barras', kind: 'token', token: 'radius' },
      { key: 'showGridLines', label: 'Linhas de grade', kind: 'boolean' },
      { key: 'gridColor', label: 'Cor da grade', kind: 'color' },
      { key: 'showValueLabels', label: 'Rotulos de valor', kind: 'boolean' },
      { key: 'valueLabelSize', label: 'Tamanho do rotulo', kind: 'token', token: 'fontSize' },
      { key: 'valueLabelColor', label: 'Cor do rotulo', kind: 'color' },
      { key: 'categoryLabelColor', label: 'Cor da categoria', kind: 'color' },
    ],
  },
  {
    title: 'KPI',
    section: 'kpi',
    onlyFor: 'kpi',
    fields: [
      { key: 'accentColor', label: 'Cor do valor', kind: 'color' },
      { key: 'valueFontSize', label: 'Tamanho do valor', kind: 'token', token: 'fontSize' },
      { key: 'labelFontSize', label: 'Tamanho do rotulo', kind: 'token', token: 'fontSize' },
      { key: 'labelColor', label: 'Cor do rotulo', kind: 'color' },
      { key: 'showComparison', label: 'Exibir comparacao', kind: 'boolean' },
      { key: 'positiveColor', label: 'Cor positiva', kind: 'color' },
      { key: 'negativeColor', label: 'Cor negativa', kind: 'color' },
    ],
  },
  {
    title: 'Rotulos dos eixos',
    section: 'labels',
    fields: [
      {
        key: 'categoryAxis',
        label: 'Eixo de categoria',
        kind: 'text',
        hint: 'Usado na acessibilidade e no tooltip. Nao liga campos do modelo.',
      },
      { key: 'valueAxis', label: 'Eixo de valor', kind: 'text' },
    ],
  },
];

/** Rotulo legivel para um valor de token. Sem isso a UI mostraria "2xl", "md". */
const TOKEN_LABELS: Record<string, string> = {
  none: 'Nenhum',
  xs: 'Minimo',
  sm: 'Pequeno',
  md: 'Medio',
  base: 'Padrao',
  lg: 'Grande',
  xl: 'Muito grande',
  '2xl': 'Enorme',
  '4xl': 'Gigante',
  full: 'Circular',
  normal: 'Normal',
  medium: 'Medio',
  semibold: 'Semi-negrito',
  bold: 'Negrito',
  left: 'Esquerda',
  center: 'Centro',
  right: 'Direita',
  thin: 'Fina',
};

export function tokenOptions(kind: TokenKind): { value: string; label: string }[] {
  return TOKEN_CATALOG[kind].map((value) => ({
    value,
    label: TOKEN_LABELS[value] ?? value,
  }));
}
