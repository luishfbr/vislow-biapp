import { createProjectId, INITIAL_PACKAGE_VERSION } from '@vislow/config-schema';
import { defaultPropsFor, roleFieldsOf } from './registry.js';
import { SPEC_VERSION, type DataRole, type SpecNode, type VisualSpec } from './spec.js';
import type { NodeKind } from './types.js';

let counter = 0;

/** Id curto e unico por sessao. Casa com NODE_ID_PATTERN. */
export function nextNodeId(kind: NodeKind): string {
  counter += 1;
  return `${kind}-${String(counter)}`;
}

/**
 * Cria um no com os defaults do descritor.
 *
 * ATENCAO: campos de papel NAO recebem default — nao ha escolha sensata, quem
 * cria o no decide. Um no com papel nao ligado e **invalido de proposito**: o
 * editor mostra o campo pendente e o export fica bloqueado, em vez de gerar um
 * visual que pede uma coluna que ninguem escolheu.
 */
export function createNode(
  kind: NodeKind,
  roleBindings: Record<string, string> = {},
): SpecNode {
  const props: Record<string, unknown> = { ...defaultPropsFor(kind) };
  for (const field of roleFieldsOf(kind)) {
    const bound = roleBindings[field.key];
    if (bound !== undefined) props[field.key] = bound;
  }

  const node: SpecNode = { id: nextNodeId(kind), kind, props };
  if (kind === 'container') node.children = [];
  return node;
}

/** Papeis iniciais de um projeto novo — o par minimo de um visual categorico. */
export const DEFAULT_ROLES: DataRole[] = [
  { name: 'categoria', displayName: 'Categoria', kind: 'grouping' },
  { name: 'valor', displayName: 'Valor', kind: 'measure' },
];

/**
 * Projeto novo: tela em branco de verdade — um container vazio e nada dentro.
 *
 * O `id` e gerado UMA vez aqui e nunca muda: e o que faz reexportar atualizar o
 * visual no Power BI em vez de duplicar (RN-01 / RF-10).
 */
export function createEmptySpec(name: string): VisualSpec {
  counter = 0;
  return {
    schemaVersion: SPEC_VERSION,
    project: {
      id: createProjectId(name),
      name,
      packageVersion: INITIAL_PACKAGE_VERSION,
    },
    dataRoles: DEFAULT_ROLES.map((role) => ({ ...role })),
    root: createNode('container'),
  };
}
