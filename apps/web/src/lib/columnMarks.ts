import { COLUMN_TYPE_LABEL, COLUMN_TYPES, isNumericType, type ColumnType } from '@vislow/config-schema';

/**
 * Vocabulario de tela dos tipos de coluna.
 *
 * Mora aqui porque e a unica coisa desta lista que so o EDITOR usa. O
 * `COLUMN_TYPE_LABEL` vem do `config-schema` (o codegen tambem precisa saber o
 * nome do tipo), e os rotulos de valor de token e de select mudaram de casa no
 * Sprint B — foram para `component-registry/src/labels.ts`, porque o painel de
 * formatacao do visual gerado precisa exatamente dos mesmos.
 */

/**
 * Sinal do tipo, em monoespaçada.
 *
 * E emprestado do painel de campos do Power BI, que marca cada coluna do modelo
 * com um sigilo do tipo dela. A coluna da tabela de exemplo VAI VIRAR um desses
 * campos, entao usar o mesmo vocabulario e o que liga as duas telas na cabeca do
 * usuario — nao e enfeite.
 *
 * Texto e nao icone porque nao ha biblioteca de icones no projeto, e porque um
 * `R$` diz mais rapido "moeda" do que qualquer desenho de 12px.
 */
export const COLUMN_MARK: Record<ColumnType, string> = {
  text: 'abc',
  integer: '#',
  decimal: '#,0',
  percent: '%',
  currency: 'R$',
  date: 'dd/mm',
  boolean: 's/n',
};

/** Opcoes do seletor de tipo, na ordem do catalogo. */
export const COLUMN_TYPE_OPTIONS = COLUMN_TYPES.map((type) => ({
  value: type,
  label: COLUMN_TYPE_LABEL[type],
}));

/**
 * O que o Power BI vai aceitar neste campo, em portugues.
 *
 * Aparece ao lado do seletor de tipo porque `requiredTypes` e uma restricao de
 * VERDADE: uma coluna declarada como inteiro recusa uma coluna decimal do modelo
 * do usuario, e sem este aviso ele descobriria isso so no Desktop, sem nenhuma
 * pista de que a causa foi uma escolha feita aqui.
 */
export function acceptsHint(type: ColumnType): string {
  switch (type) {
    case 'text':
      return 'Só aceita colunas de texto.';
    case 'integer':
      return 'Só aceita números inteiros — decimais serão recusados.';
    case 'date':
      return 'Só aceita colunas de data.';
    case 'boolean':
      return 'Só aceita colunas verdadeiro/falso.';
    case 'decimal':
    case 'percent':
    case 'currency':
      return 'Aceita qualquer coluna numérica.';
  }
}

/** Alinhamento da celula. Numero a direita e a convencao que a planilha usa
 * para dizer "isto e numero" sem escrever nada. */
export function cellAlignment(type: ColumnType): string {
  return isNumericType(type) ? 'text-right' : 'text-left';
}
