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
  // Polaridade do KPI. Dizem o que e BOM, e nao o que e maior: "Subir e melhor"
  // se le sem manual, e "higher" no dropdown do Power BI nao.
  higher: 'Subir e melhor',
  lower: 'Cair e melhor',
  neutral: 'Sem juizo',
  // Posicao do rotulo do KPI.
  above: 'Acima do numero',
  below: 'Abaixo do numero',
  // O que a linha de variacao mostra.
  both: 'Diferenca e percentual',
  absolute: 'So a diferenca',
  percent: 'So o percentual',
  // Ordenacao da Lista de Ranking. "Como vem do modelo" e nao "Nenhuma": a lista
  // sempre sai em ALGUMA ordem, e dizer "nenhuma" sugeriria que ela vem embaralhada.
  value: 'Pelo valor',
  category: 'Pelo rotulo',
  model: 'Como vem do modelo',
  desc: 'Maior primeiro',
  asc: 'Menor primeiro',
  // Onde a barra fica. `none` ja existe la em cima, como "Nenhuma", e serve.
  behind: 'Atras do texto',
  beside: 'Ao lado do texto',
  // Contra o que a barra mede 100%.
  max: 'O maior da lista',
  total: 'A soma de todos',
  // Posicao do numero na linha. NAO reusa `right`/`below`: este mapa e plano por
  // string de valor, e `below` ja e "Abaixo do numero" no KPI — reusar poria o
  // rotulo errado no dropdown dentro do relatorio de outra pessoa.
  inline: 'Na mesma linha',
  stacked: 'Abaixo do rotulo',
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
