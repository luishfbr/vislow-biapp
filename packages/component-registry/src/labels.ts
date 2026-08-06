import { TOKEN_CATALOG, type TokenKind } from '@vislow/config-schema';

/**
 * Como escrever para um humano o valor de um `token` ou de um `select`.
 *
 * Moravam em `apps/web/src/lib/controls.ts`, onde serviam so ao painel do
 * editor. Deixaram de poder morar la no Sprint B: o `getFormattingModel` do
 * visual gerado precisa dos MESMOS rotulos para os itens do dropdown dentro do
 * Power BI, e o codegen nao importa o editor. Duas copias divergiriam no dia em
 * que alguem renomeasse "Semi-negrito" — e a divergencia apareceria so dentro do
 * relatorio de outra pessoa.
 *
 * O que NAO mora aqui e o rotulo do CAMPO: esse e do descritor (`field.label`),
 * que ja e fonte unica. Aqui e so o VALOR.
 */
const VALUE_LABELS: Record<string, string> = {
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
  // Alinhamento horizontal.
  left: 'Esquerda',
  center: 'Centro',
  right: 'Direita',
  // Alinhamento vertical. Catalogo proprio (`valign`), e nao os tres de cima:
  // sao dois eixos independentes, e juntar os seis num catalogo so obrigaria
  // todo consumidor a saber quais valores servem para qual eixo.
  top: 'Topo',
  middle: 'Meio',
  bottom: 'Base',
  // Valores dos `select` do registro, que nao passam pelo catalogo de tokens.
  row: 'Linha',
  column: 'Coluna',
  wrap: 'Quebrar linha',
  truncate: 'Cortar com reticencias',
};

export interface ValueOption {
  value: string;
  label: string;
}

/** Rotulo de um valor. Sem entrada no mapa, o proprio valor — nunca vazio. */
export function labelForValue(value: string): string {
  return VALUE_LABELS[value] ?? value;
}

export function tokenOptions(kind: TokenKind): ValueOption[] {
  return TOKEN_CATALOG[kind].map((value) => ({ value, label: labelForValue(value) }));
}

export function selectOptions(values: readonly string[]): ValueOption[] {
  return values.map((value) => ({ value, label: labelForValue(value) }));
}
