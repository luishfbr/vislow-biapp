import { CONTAINER_CANVAS, exposableFields, isExposable, NODE_DESCRIPTORS } from './registry.js';
import { NODE_NAME_MAX_LENGTH, RECT_MIN_SIZE, type NodeRect, type SpecNode } from './spec.js';

export function acceptsChildren(node: SpecNode): boolean {
  return NODE_DESCRIPTORS[node.kind].acceptsChildren;
}

/** Aqui, e nao em cada consumidor: preview e codegen decidem o embrulho com a MESMA funcao. */
export function positionsChildren(node: SpecNode): boolean {
  return acceptsChildren(node) && node.props.placement === CONTAINER_CANVAS;
}

export function bandRects(count: number, direction: unknown): NodeRect[] {
  if (count <= 0) return [];
  const size = 100 / count;
  return Array.from({ length: count }, (_, index) =>
    direction === 'row'
      ? clampRect({ x: index * size, y: 0, w: size, h: 100 })
      : clampRect({ x: 0, y: index * size, w: 100, h: size }),
  );
}

/** Em cascata: dois nos sobrepostos parecem um so, e o de baixo nunca aparece. */
function droppedRect(index: number): NodeRect {
  const offset = (index % 8) * 5;
  return clampRect({ x: 5 + offset, y: 5 + offset, w: 40, h: 30 });
}

/** A invariante "todo filho de canvas tem caixa" vive nas OPERACOES, nao no editor. */
function withPlacedChildren(container: SpecNode): SpecNode {
  if (!positionsChildren(container)) return container;

  const children = container.children ?? [];
  if (children.every((child) => child.rect)) return container;

  const converting = children.every((child) => !child.rect);
  const bands = converting ? bandRects(children.length, container.props.direction) : [];

  return {
    ...container,
    children: children.map((child, index) => ({
      ...child,
      rect: child.rect ?? bands[index] ?? droppedRect(index),
    })),
  };
}

export function findNode(root: SpecNode, id: string): SpecNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function ancestryOf(root: SpecNode, id: string): SpecNode[] {
  if (root.id === id) return [root];
  for (const child of root.children ?? []) {
    const chain = ancestryOf(child, id);
    if (chain.length > 0) return [root, ...chain];
  }
  return [];
}

export function parentOf(root: SpecNode, id: string): SpecNode | null {
  const chain = ancestryOf(root, id);
  return chain.length >= 2 ? (chain[chain.length - 2] ?? null) : null;
}

/** O caminho ate o no como INDICES de filho — e assim que a alca fantasma o acha no DOM. `null` = fora da arvore. */
export function indexPath(root: SpecNode, id: string): number[] | null {
  const chain = ancestryOf(root, id);
  if (chain.length === 0) return null;

  const path: number[] = [];
  for (const [step, node] of chain.slice(1).entries()) {
    const index = (chain[step]?.children ?? []).findIndex((child) => child.id === node.id);
    if (index < 0) return null;
    path.push(index);
  }
  return path;
}

export function subtreeIds(node: SpecNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children ?? []) {
    for (const id of subtreeIds(child)) ids.add(id);
  }
  return ids;
}

/** Preserva por identidade referencial os ramos que nao mudaram. `null` = id fora deste ramo. */
function replace(root: SpecNode, id: string, recipe: (node: SpecNode) => SpecNode): SpecNode | null {
  if (root.id === id) return recipe(root);
  if (!root.children) return null;

  for (const [index, child] of root.children.entries()) {
    const next = replace(child, id, recipe);
    if (!next) continue;

    const children = [...root.children];
    children[index] = next;
    return { ...root, children };
  }

  return null;
}

export function insertChild(
  root: SpecNode,
  parentId: string,
  node: SpecNode,
  index?: number,
): SpecNode | null {
  const parent = findNode(root, parentId);
  if (!parent || !acceptsChildren(parent)) return null;

  return replace(root, parentId, (target) => {
    const children = [...(target.children ?? [])];
    const at = index === undefined ? children.length : clamp(index, 0, children.length);
    children.splice(at, 0, node);
    return withPlacedChildren({ ...target, children });
  });
}

export function removeNode(root: SpecNode, id: string): SpecNode | null {
  if (root.id === id) return null;
  const parent = parentOf(root, id);
  if (!parent) return null;

  return replace(root, parent.id, (target) => ({
    ...target,
    children: (target.children ?? []).filter((child) => child.id !== id),
  }));
}

export function moveNode(root: SpecNode, id: string, delta: number): SpecNode | null {
  const parent = parentOf(root, id);
  if (!parent) return null;

  const siblings = parent.children ?? [];
  const from = siblings.findIndex((child) => child.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= siblings.length) return null;

  return replace(root, parent.id, (target) => {
    const children = [...(target.children ?? [])];
    const [moved] = children.splice(from, 1);
    if (moved) children.splice(to, 0, moved);
    return { ...target, children };
  });
}

/** A guarda que importa e a de CICLO: soltar um container num descendente destacaria o ramo da arvore. */
export function reparentNode(
  root: SpecNode,
  id: string,
  newParentId: string,
  index?: number,
): SpecNode | null {
  const node = findNode(root, id);
  const parent = findNode(root, newParentId);
  if (!node || !parent || !acceptsChildren(parent)) return null;
  if (subtreeIds(node).has(newParentId)) return null;

  const detached = removeNode(root, id);
  if (!detached) return null;
  return insertChild(detached, newParentId, node, index);
}

/**
 * Varios nos para o mesmo pai, na ordem dada. TUDO OU NADA — metade do bloco no
 * pai novo seria pior. `index` conta na lista ANTES das remocoes, a que se ve.
 */
export function reparentNodes(
  root: SpecNode,
  ids: readonly string[],
  newParentId: string,
  index?: number,
): SpecNode | null {
  const parent = findNode(root, newParentId);
  if (ids.length === 0 || !parent || !acceptsChildren(parent)) return null;

  const nodes: SpecNode[] = [];
  for (const id of ids) {
    const node = findNode(root, id);
    if (!node || subtreeIds(node).has(newParentId)) return null;
    nodes.push(node);
  }

  // Remover TUDO antes de inserir qualquer coisa: intercalar faria cada remocao
  // deslocar o destino das insercoes seguintes, e um bloco reordenado dentro do
  // proprio pai sairia embaralhado.
  let detached: SpecNode | null = root;
  for (const id of ids) detached = detached && removeNode(detached, id);
  if (!detached) return null;

  const moved = new Set(ids);
  const before = (parent.children ?? []).filter(
    (child, position) => moved.has(child.id) && index !== undefined && position < index,
  ).length;
  const at = index === undefined ? undefined : Math.max(index - before, 0);

  // No fim, em ordem; num indice fixo, ao contrario — inserir sempre na mesma
  // posicao empurra quem chegou antes, entao o ultimo a entrar fica na frente.
  let next: SpecNode | null = detached;
  for (const node of at === undefined ? nodes : [...nodes].reverse()) {
    next = next && insertChild(next, newParentId, node, at);
  }
  return next;
}

/** EXCECAO a convencao do modulo: devolve sempre uma raiz, nunca `null` — e varredura, nao edicao. */
export function unbindRole(root: SpecNode, roleName: string): SpecNode {
  const roleKeys = new Set(
    NODE_DESCRIPTORS[root.kind].fields
      .filter((field) => field.kind === 'role')
      .map((field) => field.key),
  );

  const props = Object.fromEntries(
    Object.entries(root.props).filter(
      ([key, value]) => !(roleKeys.has(key) && value === roleName),
    ),
  );

  const children = root.children?.map((child) => unbindRole(child, roleName));
  return children ? { ...root, props, children } : { ...root, props };
}

export function setNodeProps(
  root: SpecNode,
  id: string,
  patch: Record<string, unknown>,
): SpecNode | null {
  return replace(root, id, (target) =>
    withPlacedChildren({ ...target, props: { ...target.props, ...patch } }),
  );
}

export function titleOf(node: SpecNode): string {
  return node.name ?? NODE_DESCRIPTORS[node.kind].label;
}

export function suggestNodeName(node: SpecNode): string {
  const content = node.props.content;
  const text = typeof content === 'string' ? content.trim().replace(/\s+/g, ' ') : '';
  if (text === '') return NODE_DESCRIPTORS[node.kind].label;
  return text.slice(0, NODE_NAME_MAX_LENGTH);
}

export function setNodeName(root: SpecNode, id: string, name: string): SpecNode | null {
  const clean = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
  return replace(root, id, (target) => {
    const next: SpecNode = { ...target };
    if (clean === '') delete next.name;
    else next.name = clean;
    return next;
  });
}

export function setFieldExposed(
  root: SpecNode,
  id: string,
  key: string,
  exposed: boolean,
): SpecNode | null {
  const node = findNode(root, id);
  if (!node) return null;

  const field = NODE_DESCRIPTORS[node.kind].fields.find((candidate) => candidate.key === key);
  if (!field || !isExposable(field)) return null;

  return replace(root, id, (target) => {
    const current = new Set(target.exposed ?? []);
    if (exposed) current.add(key);
    else current.delete(key);

    const next: SpecNode = { ...target };
    const keys = exposableFields(target.kind)
      .map((candidate) => candidate.key)
      .filter((candidate) => current.has(candidate));

    if (keys.length === 0) delete next.exposed;
    else next.exposed = keys;

    if (keys.length > 0 && next.name === undefined) next.name = suggestNodeName(target);

    return next;
  });
}

/** PRENDE, nao rejeita: o chamador e um arrasto, e passar da borda quer dizer "ate a borda". */
export function clampRect(rect: NodeRect): NodeRect {
  const w = round2(clamp(rect.w, RECT_MIN_SIZE, 100));
  const h = round2(clamp(rect.h, RECT_MIN_SIZE, 100));
  return {
    x: round2(clamp(rect.x, 0, 100 - w)),
    y: round2(clamp(rect.y, 0, 100 - h)),
    w,
    h,
  };
}

export function setNodeRect(root: SpecNode, id: string, rect: NodeRect): SpecNode | null {
  return replace(root, id, (target) => ({ ...target, rect: clampRect(rect) }));
}

/** Uma caminhada so. Existe por CUSTO: N `setNodeRect` por evento de ponteiro sao N caminhadas por quadro. */
export function setNodeRects(
  root: SpecNode,
  entries: readonly { id: string; rect: NodeRect }[],
): SpecNode | null {
  if (entries.length === 0) return null;

  const wanted = new Map(entries.map((entry) => [entry.id, entry.rect]));
  let applied = 0;

  const rewrite = (node: SpecNode): SpecNode => {
    const rect = wanted.get(node.id);
    let next = node;
    if (rect !== undefined) {
      applied += 1;
      next = { ...node, rect: clampRect(rect) };
    }

    if (!node.children) return next;

    const children = node.children.map(rewrite);
    const changed = children.some((child, index) => child !== node.children?.[index]);
    return changed ? { ...next, children } : next;
  };

  const rewritten = rewrite(root);
  return applied === wanted.size ? rewritten : null;
}

/** O irmao seguinte, senao o anterior, senao o pai. Chame ANTES da remocao. */
export function selectionAfterRemoval(root: SpecNode, ids: readonly string[]): string {
  const first = ids[0];
  const parent = first === undefined ? null : parentOf(root, first);
  if (!parent) return root.id;

  const siblings = parent.children ?? [];
  const index = siblings.findIndex((child) => child.id === first);
  const removed = new Set(ids);
  const survives = (child: SpecNode): boolean => !removed.has(child.id);

  const next =
    siblings.slice(index + 1).find(survives) ??
    siblings.slice(0, Math.max(index, 0)).reverse().find(survives);

  return next ? next.id : parent.id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
