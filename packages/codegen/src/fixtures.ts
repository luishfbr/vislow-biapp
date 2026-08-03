import {
  ARTBOARD_MAX,
  CONTAINER_CANVAS,
  NODE_KINDS,
  SPEC_VERSION,
  createNode,
  defaultPropsFor,
  insertChild,
  roleFieldsOf,
  KIND_FOR_TYPE,
  type DataColumn,
  type SampleTable,
  type SpecNode,
  type VisualSpec,
  type NodeKind,
} from '@vislow/component-registry';
import { INITIAL_PACKAGE_VERSION, createProjectId, type ColumnType } from '@vislow/config-schema';

/**
 * Specs de teste, derivadas do REGISTRO — nunca escritas a mao.
 *
 * Um tipo de no adicionado ao registro passa a ser exercitado pelos testes de
 * codegen no mesmo commit em que passa a existir. Fixture escrita a mao viraria
 * a terceira lista de tipos do projeto (depois do registro e do schema) e
 * divergiria na primeira adicao — a mesma armadilha que a ADR-09 fecha para o
 * schema.
 */

/**
 * A tabela de exemplo das fixtures.
 *
 * As LINHAS carregam sentinelas de proposito, porque e contra elas que a guarda
 * de vazamento morde. Sem valores distintivos aqui, o teste "os valores de
 * exemplo nao chegam ao pacote" passaria por AUSENCIA — o modo de falhar que
 * este repo ja registrou no teste da prancheta.
 *
 * TODA celula precisa ser distintiva o bastante para nao aparecer por acaso no
 * fonte gerado. Um `7` como valor de exemplo faz a guarda acusar vazamento em
 * qualquer arquivo que tenha o digito — e a primeira versao desta fixture tinha
 * um. Sentinela curta e guarda que grita sem motivo, que morre logo depois.
 *
 * Os tipos cobrem os dois extremos do `requiredTypes`: texto (o mais estreito
 * do lado do agrupamento) e inteiro (o mais estreito do lado da medida).
 */
export const TEST_TABLE: SampleTable = {
  columns: [
    { name: 'categoria', displayName: 'Categoria', kind: 'grouping', type: 'text' },
    { name: 'valor', displayName: 'Valor', kind: 'measure', type: 'integer' },
  ],
  rows: [
    ['SENTINELA_DE_LINHA', 424242],
    ['SENTINELA_SEGUNDA_LINHA', 987654],
    // Celula vazia: o preview tem de aguentar, e a guarda tem de pular.
    [null, null],
  ],
};

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
    data: {
      columns: TEST_TABLE.columns.map((column) => ({ ...column })),
      rows: TEST_TABLE.rows.map((row) => [...row]),
    },
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
      // COM prancheta, pelo mesmo motivo do `placement` acima: o portao compila
      // esta fixture de verdade, e sem o campo aqui nada no pipeline real
      // exercitaria uma spec que o editor de hoje produz. Um tamanho fora do
      // default de proposito — se algum dia ele vazar para o pacote, vaza
      // visivel.
      artboard: { ...ARTBOARD_MAX },
    },
  };
}

/**
 * Projeto cuja PRIMEIRA coluna e do tipo pedido, ligada num grafico.
 *
 * Duas colunas porque o grafico exige um agrupamento e uma medida: a testada e a
 * companheira do outro papel. Toda celula e vazia — `null` vale em qualquer
 * tipo, e aqui o que esta sob teste e o tipo declarado, nao o valor.
 */
export function specWithColumnType(type: ColumnType): VisualSpec {
  const kind = KIND_FOR_TYPE[type];
  const par: DataColumn =
    kind === 'grouping'
      ? { name: 'par', displayName: 'Par', kind: 'measure', type: 'decimal' }
      : { name: 'par', displayName: 'Par', kind: 'grouping', type: 'text' };

  const container = createNode('container');
  container.children = [
    createNode('barChart', {
      categoryRole: kind === 'grouping' ? 'alvo' : 'par',
      measureRole: kind === 'measure' ? 'alvo' : 'par',
    }),
  ];

  return {
    ...specWith(container),
    data: {
      columns: [{ name: 'alvo', displayName: 'Alvo', kind, type }, par],
      rows: [[null, null]],
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
