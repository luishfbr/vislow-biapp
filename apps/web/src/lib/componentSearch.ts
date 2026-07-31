import { NODE_DESCRIPTORS, NODE_KINDS, type NodeKind } from '@vislow/component-registry';

/**
 * Busca do dialogo de componentes (RF-04).
 *
 * Funcao pura, fora do componente, porque e a unica parte disto que tem regra:
 * o que casa, o que nao casa e em que ordem aparece. Testada sem DOM.
 *
 * O que ela NAO faz: manter uma lista de componentes. Os candidatos saem de
 * `NODE_KINDS` e os termos de `NODE_DESCRIPTORS` — um tipo de no novo passa a
 * ser encontravel no mesmo commit em que passa a existir.
 */

/** Sem acento e sem caixa nos DOIS lados: "Area" tem de achar "área" e vice-versa. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Onde o termo casou, do mais forte para o mais fraco. E o que faz "bar" mostrar
 * Barras antes de Container — os dois contem "ar", mas so um COMECA com o termo.
 */
const NO_MATCH = 99;

function rankOf(kind: NodeKind, terms: string[]): number {
  const descriptor = NODE_DESCRIPTORS[kind];
  const label = fold(descriptor.label);
  const keywords = fold(descriptor.keywords.join(' '));
  const hint = fold(descriptor.hint);

  let best = NO_MATCH;
  for (const term of terms) {
    const rank = label.startsWith(term)
      ? 0
      : label.includes(term)
        ? 1
        : keywords.includes(term)
          ? 2
          : hint.includes(term)
            ? 3
            : NO_MATCH;

    // Conjuncao: dois termos restringem, nunca ampliam. "grafico tempo" devolve
    // linha e area, e nao os sete — que e o que a pessoa quis dizer ao digitar
    // a segunda palavra.
    if (rank === NO_MATCH) return NO_MATCH;
    best = Math.min(best, rank);
  }
  return best;
}

/**
 * Os tipos que casam a consulta, do mais relevante para o menos.
 *
 * Consulta vazia devolve o catalogo inteiro na ordem do registro — o dialogo
 * abre mostrando tudo, e a busca so entra em cena quando a pessoa digita.
 */
export function searchComponents(query: string): NodeKind[] {
  const terms = fold(query).split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return [...NODE_KINDS];

  return NODE_KINDS.map((kind) => ({ kind, rank: rankOf(kind, terms) }))
    .filter((match) => match.rank !== NO_MATCH)
    // `sort` do JS e estavel desde o ES2019: empate mantem a ordem do registro,
    // que e a ordem em que os componentes aparecem sem busca.
    .sort((a, b) => a.rank - b.rank)
    .map((match) => match.kind);
}
