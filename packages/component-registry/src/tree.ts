import { NODE_DESCRIPTORS } from './registry.js';
import { RECT_MIN_SIZE, type NodeRect, type SpecNode } from './spec.js';

/**
 * Edicao da arvore — funcoes PURAS que devolvem uma raiz nova.
 *
 * Moram no registro, e nao no editor, por dois motivos:
 *
 *   1. sao as unicas operacoes que podem produzir uma arvore invalida (nó dentro
 *      de si mesmo, filho em folha, raiz removida), e a regra de "o que e valido"
 *      ja vive aqui, no descritor;
 *   2. sao testaveis sem React.
 *
 * CONVENCAO: toda mutacao devolve `null` quando a operacao e ilegal, em vez de
 * devolver a arvore intacta. Um no-op silencioso e indistinguivel de sucesso e ja
 * custou tempo neste projeto em outros lugares — aqui o chamador e obrigado a
 * tratar o caso.
 */

export function acceptsChildren(node: SpecNode): boolean {
  return NODE_DESCRIPTORS[node.kind].acceptsChildren;
}

export function findNode(root: SpecNode, id: string): SpecNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Cadeia da raiz ate o no, inclusive. Vazia quando o id nao existe.
 * O ultimo elemento e o proprio no; o penultimo e o pai.
 */
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

/** Ids do no e de toda a sua descendencia. Base da guarda de ciclo. */
export function subtreeIds(node: SpecNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children ?? []) {
    for (const id of subtreeIds(child)) ids.add(id);
  }
  return ids;
}

/**
 * Reescreve um no da arvore preservando o resto por identidade referencial.
 *
 * Devolve `null` quando o id nao esta neste ramo — e assim que o chamador
 * recursivo sabe onde continuar procurando, e assim que uma edicao com id
 * inexistente vira rejeicao em vez de arvore intacta.
 *
 * So os ancestrais do no alterado sao recriados; os ramos irmaos continuam sendo
 * o MESMO objeto. E o que permite ao React pular a re-renderizacao deles.
 */
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

/**
 * Insere `node` como filho de `parentId`, na posicao `index` (default: no fim).
 *
 * Rejeita quando o pai nao existe ou e uma folha — e a mesma regra que o schema
 * cobra depois, aplicada no momento em que o usuario clica.
 */
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
    return { ...target, children };
  });
}

/** Remove um no. Rejeita a raiz: uma arvore sem raiz nao e representavel. */
export function removeNode(root: SpecNode, id: string): SpecNode | null {
  if (root.id === id) return null;
  const parent = parentOf(root, id);
  if (!parent) return null;

  return replace(root, parent.id, (target) => ({
    ...target,
    children: (target.children ?? []).filter((child) => child.id !== id),
  }));
}

/**
 * Reordena um no entre os irmaos. `delta` e -1 (sobe) ou +1 (desce).
 * Rejeita quando ja esta na ponta — assim o botao desabilitado e a operacao
 * rejeitada concordam, em vez de o botao mentir.
 */
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

/**
 * Move um no para outro pai.
 *
 * A guarda que importa e a de CICLO: soltar um container dentro de um
 * descendente seu destacaria o ramo inteiro da arvore. O resultado nao seria um
 * erro — seria um pedaco do visual desaparecendo sem mensagem nenhuma.
 */
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
 * Apaga toda referencia a um papel na arvore.
 *
 * EXCECAO a convencao do modulo: devolve sempre uma raiz, nunca `null`. E uma
 * varredura, nao uma edicao dirigida — "nenhum no referenciava o papel" e
 * resultado legitimo, nao operacao ilegal.
 *
 * O campo fica AUSENTE em vez de vazio: e o mesmo estado de um no recem-criado,
 * que o schema reprova e o editor mostra como pendente. Deixar o nome do papel
 * apagado no prop produziria uma spec que pede uma coluna inexistente.
 */
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

/** Aplica valores de campo a um no. Nao valida: quem valida e `validateSpec`. */
export function setNodeProps(
  root: SpecNode,
  id: string,
  patch: Record<string, unknown>,
): SpecNode | null {
  return replace(root, id, (target) => ({ ...target, props: { ...target.props, ...patch } }));
}

/**
 * Prende uma caixa dentro do pai e arredonda para duas casas.
 *
 * PRENDER e nao rejeitar, porque o chamador e um arrasto: passar da borda quer
 * dizer "encosta na borda", nunca "cancela o movimento". A regra que REPROVA
 * caixa fora do pai continua em `validateSpec`, para a spec que chega por
 * importacao — la nao houve arrasto nenhum para prender.
 *
 * Arredondar nao e cosmetico: um arrasto produz `33.33333333333333`, e o codegen
 * despeja o numero literal no fonte gerado. Duas casas mantem o fonte legivel e
 * a diferenca visual e menor que um pixel em qualquer moldura plausivel.
 */
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

/** Move ou redimensiona um no dentro do pai. */
export function setNodeRect(root: SpecNode, id: string, rect: NodeRect): SpecNode | null {
  return replace(root, id, (target) => ({ ...target, rect: clampRect(rect) }));
}

/**
 * Onde a selecao deve cair depois de remover `id`.
 *
 * O irmao seguinte, senao o anterior, senao o pai. Deixar a selecao vazia faria
 * o painel de propriedades piscar para o estado vazio a cada exclusao.
 */
export function selectionAfterRemoval(root: SpecNode, id: string): string {
  const parent = parentOf(root, id);
  if (!parent) return root.id;

  const siblings = parent.children ?? [];
  const index = siblings.findIndex((child) => child.id === id);
  const next = siblings[index + 1] ?? siblings[index - 1];
  return next ? next.id : parent.id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
