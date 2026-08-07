/**
 * A mira do arrasto na Composicao, sem React — modelo VSCode.
 *
 * Sobre a linha de um container, o terco do meio e "vira filho"; as pontas e a
 * linha de uma folha sao "entra nesta posicao". Detalhe em docs/frontend.md §2.5.
 */

import { acceptsChildren, type SpecNode } from '@vislow/component-registry';

export interface FlatRow {
  node: SpecNode;
  depth: number;
  parentId: string | null;
  index: number;
}

/** A arvore como LISTA: e nessa forma que a mira, o indicador e a geometria trabalham. */
export function flattenTree(
  node: SpecNode,
  depth = 0,
  parentId: string | null = null,
  index = 0,
): FlatRow[] {
  return [
    { node, depth, parentId, index },
    ...(node.children ?? []).flatMap((child, at) => flattenTree(child, depth + 1, node.id, at)),
  ];
}

export type DropTarget =
  | { kind: 'into'; parentId: string }
  | { kind: 'between'; parentId: string; index: number };

export interface RowBox {
  id: string;
  top: number;
  height: number;
  /** `null` na raiz — ela nunca e destino de "entre", porque nao tem irmao. */
  parentId: string | null;
  index: number;
  accepts: boolean;
}

/** Fatia do meio de um container. Fora dela, a linha vira fresta. */
const INTO_BAND = 1 / 3;

/**
 * Onde o rotulo do no VAI comecar depois de solto, em rem — e onde o fio comeca.
 * O recuo e a unica coisa que responde "em qual pai isto cai?".
 */
export function indentOf(depth: number): string {
  return `${String(depth * 0.75 + 0.5)}rem`;
}

/** O destino de `Ctrl+seta` na linha focada: indentar entra no irmao de cima, desindentar sobe um nivel. */
export function byIndent(
  rows: readonly FlatRow[],
  id: string,
  direction: 'in' | 'out',
): DropTarget | null {
  const at = rows.findIndex((row) => row.node.id === id);
  const row = rows[at];
  if (row?.parentId == null) return null;

  if (direction === 'out') {
    const parent = rows.find((candidate) => candidate.node.id === row.parentId);
    if (parent?.parentId == null) return null;
    return { kind: 'between', parentId: parent.parentId, index: parent.index + 1 };
  }

  const previous = rows
    .slice(0, at)
    .reverse()
    .find((candidate) => candidate.parentId === row.parentId);
  if (!previous || !acceptsChildren(previous.node)) return null;
  return { kind: 'into', parentId: previous.node.id };
}

export function rowAt(rows: readonly RowBox[], y: number): RowBox | undefined {
  return rows.find((row) => y >= row.top && y < row.top + row.height);
}

/**
 * `null` = nao ha destino valido sob o ponteiro. Recusar aqui, e nao no `reparentNode`,
 * e o que impede o indicador de prometer o que nao vai acontecer.
 */
export function targetAt(
  rows: readonly RowBox[],
  y: number,
  blocked: ReadonlySet<string>,
): DropTarget | null {
  const row = rowAt(rows, y);
  if (!row || blocked.has(row.id)) return null;

  const offset = (y - row.top) / row.height;

  if (row.accepts && offset >= INTO_BAND && offset < 1 - INTO_BAND) {
    return { kind: 'into', parentId: row.id };
  }

  // A raiz nao tem fresta: soltar acima dela nao tem pai para onde ir.
  if (row.parentId === null) return row.accepts ? { kind: 'into', parentId: row.id } : null;

  return { kind: 'between', parentId: row.parentId, index: offset < 0.5 ? row.index : row.index + 1 };
}

/**
 * Soltar onde ja esta. Sem isto o arrasto empilharia um passo de desfazer que
 * nao muda nada, e `Ctrl+Z` andaria sem efeito visivel.
 */
export function isNoOp(
  target: DropTarget,
  rows: readonly RowBox[],
  dragging: readonly string[],
): boolean {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const moving = dragging.flatMap((id) => byId.get(id) ?? []);
  if (moving.length === 0) return true;
  if (moving.some((row) => row.parentId !== target.parentId)) return false;

  if (target.kind === 'into') return true;

  // O bloco ja ocupa o intervalo que comeca no indice de destino.
  const indexes = moving.map((row) => row.index).sort((a, b) => a - b);
  const first = indexes[0] ?? 0;
  const contiguous = indexes.every((index, step) => index === first + step);
  return contiguous && (target.index === first || target.index === first + indexes.length);
}
