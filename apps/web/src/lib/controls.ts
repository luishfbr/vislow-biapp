import { TOKEN_CATALOG, type TokenKind } from '@vislow/config-schema';

/**
 * Rotulagem dos controles do painel de propriedades.
 *
 * O painel em si nao e mais declarado aqui: depois do ADR-08 ele e GERADO dos
 * campos do descritor em `@vislow/component-registry`, que e a mesma fonte do
 * schema de validacao e do codegen. Uma tabela de controles neste arquivo seria
 * a quarta copia da lista de propriedades — e a primeira a divergir.
 *
 * O que sobra e o que o registro nao tem por que saber: como escrever "2xl" para
 * um humano.
 */

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

/** Rotulos dos `select` do registro, que nao passam pelo catalogo de tokens. */
const OPTION_LABELS: Record<string, string> = {
  row: 'Linha',
  column: 'Coluna',
  vertical: 'Vertical',
  horizontal: 'Horizontal',
};

export interface Option {
  value: string;
  label: string;
}

export function tokenOptions(kind: TokenKind): Option[] {
  return TOKEN_CATALOG[kind].map((value) => ({
    value,
    label: TOKEN_LABELS[value] ?? value,
  }));
}

export function selectOptions(values: readonly string[]): Option[] {
  return values.map((value) => ({ value, label: OPTION_LABELS[value] ?? value }));
}
