import type { SpecNode, VisualSpec } from '@vislow/component-registry';
import type { ValidationIssue } from '@vislow/config-schema';

/**
 * Traduz os problemas da spec de CAMINHO ESTRUTURAL para ID DE NO.
 *
 * O `validateSpec` reporta `root.children[2].props.measureRole`, que e o que
 * serve para depurar uma spec em JSON. Na tela o usuario ve uma arvore de nos
 * selecionaveis, entao alguem precisa fazer a ponte — e melhor que seja aqui,
 * uma vez, do que cada painel repetir o parsing do caminho.
 *
 * Nao e seletor de store de proposito: constroi Maps novos a cada chamada, e um
 * seletor assim re-renderiza em loop no zustand v5. Os componentes memoizam.
 */

export interface NodeIssues {
  /** Todos os problemas do no, incluindo os de campo. */
  all: ValidationIssue[];
  /** Problemas de um campo especifico, por `key` do descritor. */
  byField: Map<string, ValidationIssue[]>;
}

function push<K>(map: Map<K, ValidationIssue[]>, key: K, issue: ValidationIssue): void {
  const list = map.get(key);
  if (list) list.push(issue);
  else map.set(key, [issue]);
}

export function issuesByNode(
  spec: VisualSpec,
  issues: readonly ValidationIssue[],
): Map<string, NodeIssues> {
  const byPath = new Map<string, NodeIssues>();

  for (const issue of issues) {
    // `root.children[0].props.measureRole` -> no `root.children[0]`, campo
    // `measureRole`. Sem `.props.` o problema e do proprio no (id duplicado,
    // filho invalido) e nao pertence a campo nenhum.
    const match = /^(.*?)\.props\.([A-Za-z0-9]+)$/.exec(issue.path);
    // A geometria nao e campo do descritor, mas o caminho dela tambem termina
    // num sufixo. Sem descontar o `.rect` o problema nao casaria com no nenhum e
    // sumiria do mapa: o export ficaria bloqueado e a arvore, sem marcador —
    // exatamente o que a RF-12 proibe.
    const rect = /^(.*)\.rect$/.exec(issue.path);
    const nodePath = match?.[1] ?? rect?.[1] ?? issue.path;
    const field = match?.[2];

    const entry: NodeIssues = byPath.get(nodePath) ?? { all: [], byField: new Map() };
    entry.all.push(issue);
    if (field !== undefined) push(entry.byField, field, issue);
    byPath.set(nodePath, entry);
  }

  const byId = new Map<string, NodeIssues>();
  const visit = (node: SpecNode, path: string): void => {
    const found = byPath.get(path);
    if (found) byId.set(node.id, found);
    node.children?.forEach((child, index) => {
      visit(child, `${path}.children[${String(index)}]`);
    });
  };
  visit(spec.root, 'root');

  return byId;
}

/**
 * Ids de todo no com problema, incluindo os ANCESTRAIS.
 *
 * A arvore pode estar recolhida: marcar so o no defeituoso deixaria o usuario
 * com um export bloqueado e nenhum indicio visivel de onde.
 */
export function markedAncestors(spec: VisualSpec, faulty: ReadonlySet<string>): Set<string> {
  const marked = new Set<string>();
  const visit = (node: SpecNode): boolean => {
    const childHasIssue = (node.children ?? []).map(visit).some(Boolean);
    const own = faulty.has(node.id);
    if (childHasIssue) marked.add(node.id);
    return own || childHasIssue;
  };
  visit(spec.root);
  return marked;
}
