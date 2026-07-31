import {
  CONTAINER_CANVAS,
  NODE_KINDS,
  SPEC_VERSION,
  createNode,
  defaultPropsFor,
  insertChild,
  roleFieldsOf,
  type DataRole,
  type SpecNode,
  type VisualSpec,
  type NodeKind,
} from '@vislow/component-registry';
import { INITIAL_PACKAGE_VERSION, createProjectId } from '@vislow/config-schema';

/**
 * Specs de teste, derivadas do REGISTRO — nunca escritas a mao.
 *
 * Um tipo de no adicionado ao registro passa a ser exercitado pelos testes de
 * codegen no mesmo commit em que passa a existir. Fixture escrita a mao viraria
 * a terceira lista de tipos do projeto (depois do registro e do schema) e
 * divergiria na primeira adicao — a mesma armadilha que a ADR-09 fecha para o
 * schema.
 */

export const TEST_ROLES: DataRole[] = [
  { name: 'categoria', displayName: 'Categoria', kind: 'grouping' },
  { name: 'valor', displayName: 'Valor', kind: 'measure' },
];

/** Liga todo campo de papel do tipo ao papel de teste do mesmo `roleKind`. */
export function nodeOf(kind: NodeKind): SpecNode {
  const bindings: Record<string, string> = {};
  for (const field of roleFieldsOf(kind)) {
    bindings[field.key] = field.roleKind === 'grouping' ? 'categoria' : 'valor';
  }
  return createNode(kind, bindings);
}

/** Projeto minimo com um unico no na raiz de um container. */
export function specWith(root: SpecNode, name = 'Teste de Codegen'): VisualSpec {
  return {
    schemaVersion: SPEC_VERSION,
    project: {
      // Fixo, nao aleatorio: o fonte gerado precisa ser comparavel entre rodadas.
      id: 'TesteDeCodegenA1B2C3D4E5F60718293A4B5C6D7E8F90',
      name,
      packageVersion: INITIAL_PACKAGE_VERSION,
    },
    dataRoles: TEST_ROLES.map((role) => ({ ...role })),
    root,
  };
}

/**
 * Container com um no de cada tipo folha dentro. O pior caso do orcamento.
 *
 * Id ALEATORIO, ao contrario das demais: e a fixture que o teste de build usa, e
 * a RN-01 exige que dois projetos novos nunca compartilhem GUID. Uma fixture de
 * id fixo esconderia justamente essa regressao.
 */
export function specWithEveryKind(name = 'Teste de Codegen'): VisualSpec {
  // POSICIONADO, porque e o que a raiz de um projeto novo faz. O portao compila
  // esta fixture de verdade: se ele empilhasse, nada no pipeline real exercitaria
  // o `CanvasSlot`, e a primeira vez que alguem visse um no posicionado dentro do
  // Power BI seria em producao. Cada tipo cai numa faixa — inclusive os graficos,
  // que passam a medir dentro de uma caixa absoluta e nao mais na cadeia de flex.
  let container = createNode('container');
  container.props.placement = CONTAINER_CANVAS;
  for (const kind of NODE_KINDS.filter((kind) => kind !== 'container')) {
    container = insertChild(container, container.id, nodeOf(kind)) ?? container;
  }
  return {
    ...specWith(container, name),
    project: {
      id: createProjectId(name),
      name,
      packageVersion: INITIAL_PACKAGE_VERSION,
    },
  };
}

/** Um container com um unico filho do tipo pedido. */
export function specWithKind(kind: NodeKind): VisualSpec {
  if (kind === 'container') {
    const outer = createNode('container');
    outer.children = [createNode('container')];
    return specWith(outer);
  }
  const container = createNode('container');
  container.children = [nodeOf(kind)];
  return specWith(container);
}

export { defaultPropsFor };
