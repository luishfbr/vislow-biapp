import { createProjectId, INITIAL_PACKAGE_VERSION } from '@vislow/config-schema';
import { CONTAINER_CANVAS, defaultPropsFor, roleFieldsOf } from './registry.js';
import { SPEC_VERSION, type DataRole, type SpecNode, type VisualSpec } from './spec.js';
import type { NodeKind, RoleKind } from './types.js';

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

/**
 * Papeis que um no novo deve ligar: o primeiro declarado de cada tipo exigido.
 *
 * Existe para o editor. `createNode` sozinho deixa o campo em branco de
 * proposito, e isso e certo como default do dominio — mas na tela significaria
 * que todo grafico nasce no estado vazio, com o usuario tendo de ligar dois
 * campos antes de ver qualquer coisa. Ligar no palpite obvio e reversivel; a
 * tela vazia so parece defeito.
 *
 * Sem papel do tipo certo declarado, o campo continua pendente — que ai e a
 * informacao correta.
 */
export function suggestRoleBindings(
  kind: NodeKind,
  roles: readonly DataRole[],
): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const field of roleFieldsOf(kind)) {
    const match = roles.find((role) => role.kind === field.roleKind);
    if (match) bindings[field.key] = match.name;
  }
  return bindings;
}

/**
 * Nome tecnico de um papel, derivado do rotulo.
 *
 * Precisa casar `ROLE_NAME_PATTERN` porque vira o `name` do `capabilities.json`.
 * Sem acento, sem separador: o Power BI le esse campo como identificador.
 */
function slugifyRoleName(label: string): string {
  const words = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);

  const camel = words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');

  // O padrao exige comecar com letra minuscula e ter ao menos 2 caracteres: um
  // rotulo so de digitos ou de emoji cairia fora sem este piso.
  const safe = /^[a-z]/.test(camel) ? camel : `campo${camel}`;
  return safe.slice(0, 30).padEnd(2, 'x');
}

/**
 * Cria um papel com nome unico e ESTAVEL.
 *
 * O `name` nasce do rotulo e nunca mais muda — mesma logica do `project.id`.
 * Deixar o usuario reescrever o `name` obrigaria a reescrever toda referencia na
 * arvore junto, e uma reescrita que falhasse pela metade produziria um visual
 * pedindo uma coluna que nenhum no le. O que o usuario edita e o `displayName`,
 * que e o que ele ve no Power BI.
 */
export function createRole(label: string, kind: RoleKind, existing: readonly DataRole[]): DataRole {
  const base = slugifyRoleName(label);
  const taken = new Set(existing.map((role) => role.name));

  let name = base;
  for (let suffix = 2; taken.has(name); suffix += 1) {
    name = `${base.slice(0, 28)}${String(suffix)}`;
  }

  return { name, displayName: label, kind };
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

  // A raiz de um projeto NOVO posiciona livremente; o default do descritor
  // continua sendo empilhar, para que projeto ja salvo nao mude sozinho. E aqui
  // que a diferenca aparece: quem comeca hoje comeca com uma prancheta, quem
  // comecou antes continua com a composicao que montou.
  const root = createNode('container');
  root.props.placement = CONTAINER_CANVAS;

  return {
    schemaVersion: SPEC_VERSION,
    project: {
      id: createProjectId(name),
      name,
      packageVersion: INITIAL_PACKAGE_VERSION,
    },
    dataRoles: DEFAULT_ROLES.map((role) => ({ ...role })),
    root,
  };
}
