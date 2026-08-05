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
  // Sombra. Os degraus de MEDIDA sairam do catalogo na spec 4.0.0 — espacamento,
  // raio, espessura e tamanho de fonte viraram pixel livre, e um campo em pixel
  // nao tem rotulo para traduzir.
  none: 'Nenhuma',
  sm: 'Sutil',
  md: 'Media',
  lg: 'Forte',
  // Peso.
  normal: 'Normal',
  medium: 'Medio',
  semibold: 'Semi-negrito',
  bold: 'Negrito',
  // Alinhamento.
  left: 'Esquerda',
  center: 'Centro',
  right: 'Direita',
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
