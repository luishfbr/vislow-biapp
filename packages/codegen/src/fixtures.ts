import {
  ARTBOARD_MAX,
  CONTAINER_CANVAS,
  NODE_KINDS,
  SPEC_VERSION,
  createNode,
  defaultPropsFor,
  insertChild,
  suggestRoleBindings,
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
 *
 * DUAS medidas, e nao uma: o KPI Card tem dois campos de papel de medida, e com
 * uma coluna so os dois cairiam na mesma — a variacao seria sempre zero, e a
 * fixture exercitaria justamente o caso que menos importa.
 */
export const TEST_TABLE: SampleTable = {
  columns: [
    { name: 'categoria', displayName: 'Categoria', kind: 'grouping', type: 'text' },
    { name: 'valor', displayName: 'Valor', kind: 'measure', type: 'integer' },
    { name: 'meta', displayName: 'Meta', kind: 'measure', type: 'integer' },
  ],
  rows: [
    ['SENTINELA_DE_LINHA', 424242, 555777],
    ['SENTINELA_SEGUNDA_LINHA', 987654, 666888],
    // Celula vazia: o preview tem de aguentar, e a guarda tem de pular.
    [null, null, null],
  ],
};

/**
 * Um no do tipo pedido, com os campos de papel JA LIGADOS as colunas de teste.
 *
 * A ligacao e o que faz a fixture produzir um `capabilities.json` com
 * `dataRoles`. Entre a poda da 5.0.0 e o KPI Card nao havia o que ligar — nenhum
 * descritor declarava papel — e esta funcao era um `createNode` puro.
 *
 * Ligar tambem e o que mantem a fixture VALIDA: papel obrigatorio sem ligacao
 * reprova no schema de proposito (RF-12), e o portao de aceite compila esta spec
 * de verdade.
 *
 * Uma coluna por campo, sem repetir: os dois papeis de medida do KPI caem em
 * colunas diferentes, senao a variacao da fixture seria sempre zero.
 */
export function nodeOf(kind: NodeKind): SpecNode {
  return createNode(kind, suggestRoleBindings(kind, TEST_TABLE.columns));
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
  // Power BI seria em producao. Cada tipo cai numa faixa.
  // TODO tipo entra, inclusive o container — um container aninhado dentro de um
  // canvas e composicao legitima, e e o unico jeito de a fixture ter mais de um
  // filho posicionado agora que o catalogo tem dois tipos. O gate depende disso:
  // a assertiva de geometria compara VARIAS caixas, e com uma so ela passaria
  // por coincidencia.
  let container = createNode('container');
  container.props.placement = CONTAINER_CANVAS;
  for (const kind of NODE_KINDS) {
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
 * Um projeto com UMA coluna, do tipo pedido, ligada ao valor de um KPI.
 *
 * E a fixture da bateria que confere o `requiredTypes` de cada `ColumnType` no
 * `capabilities.json` — e a que prova que `date` fica de fora, porque o schema
 * oficial nao tem tipo temporal e o `pbiviz package` lanca.
 *
 * Saiu na spec 5.0.0 com os graficos, porque sem no que consumisse dados nao
 * havia o que ligar, e voltou com o KPI Card. O `kind` da coluna e `measure` em
 * todos os casos: quem varia aqui e o TIPO, e o papel-agrupar-ou-somar e outra
 * dimensao — um "Ano" e inteiro e ainda assim agrupa.
 */
export function specWithColumnType(type: ColumnType): VisualSpec {
  const kpi = createNode('kpi');
  kpi.props.valueRole = 'valor';

  const container = createNode('container');
  container.children = [kpi];

  return {
    ...specWith(container),
    data: {
      columns: [{ name: 'valor', displayName: 'Valor', kind: 'measure', type }],
      // Uma linha vazia: o schema exige ao menos uma, e `null` e celula valida em
      // qualquer tipo — o que esta fixture mede e o TIPO da coluna, nao o valor.
      rows: [[null]],
    },
  };
}

/**
 * Uma spec com campos PUBLICADOS no painel de formatacao do visual gerado.
 *
 * Escolhida para exercitar, num pacote so, os seis tipos de `FieldSpec` que
 * podem virar slice — `text`, `length`, `token`, `color`, `boolean`, `select` —
 * mais os tres casos que o codigo trata a parte:
 *
 *   1. um campo governado por `showWhen` cujo governante TAMBEM foi publicado
 *      (`background` sob `showBackground`): o consumidor liga o interruptor e o
 *      controle de cor aparece;
 *   2. um no publicado SEM apelido, que cai no rotulo do descritor;
 *   3. um no que nao publica nada, que nao pode ganhar card nenhum.
 */
export function specWithExposure(name = 'Teste de Publicacao'): VisualSpec {
  const titulo = nodeOf('text');
  titulo.props.content = 'Receita total';
  titulo.name = 'Titulo do painel';
  // Ordem embaralhada de proposito: quem impoe a ordem do descritor e o codegen,
  // e uma fixture ja ordenada esconderia a regressao.
  titulo.exposed = [
    'color',
    'content',
    'showBackground',
    'background',
    'overflow',
    'fontSize',
    'fontWeight',
  ];

  const nota = nodeOf('text');
  nota.props.content = 'Nota de rodape';

  let container = createNode('container');
  container.props.placement = CONTAINER_CANVAS;
  // Sem apelido: o card tem de se chamar "Container", e nao ficar sem titulo.
  container.exposed = ['padding'];
  for (const child of [titulo, nota]) {
    container = insertChild(container, container.id, child) ?? container;
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
