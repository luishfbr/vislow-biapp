import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import capabilitiesSchema from 'powerbi-visuals-api/schema.capabilities.json';
import {
  ARTBOARD_MAX,
  NODE_DESCRIPTORS,
  NODE_KINDS,
  assertValidSpec,
  createNode,
  type NodeKind,
} from '@vislow/component-registry';
import { COLUMN_TYPES } from '@vislow/config-schema';
import { generateCapabilities } from './capabilities.js';
import { generatePbiviz } from './pbiviz.js';
import { generateVisualSource } from './visual.js';
import { generateProject } from './index.js';
import { jsString } from './literal.js';
import {
  TEST_TABLE,
  specWith,
  specWithColumnType,
  specWithEveryKind,
  specWithKind,
  nodeOf,
} from './fixtures.js';

const BUILD_ID = 'b1c2d3e4';

describe('emissao do visual.tsx', () => {
  it.each(NODE_KINDS)('o tipo "%s" emite o componente do registro', (kind: NodeKind) => {
    const source = generateVisualSource(assertValidSpec(specWithKind(kind)), BUILD_ID);
    const component = NODE_DESCRIPTORS[kind].component;

    expect(source).toContain(`<${component}`);
    // ADR-10: import NOMEADO do visual-kit, nunca JSX de Recharts cru.
    expect(source).toMatch(
      new RegExp(`import \\{[^}]*\\b${component}\\b[^}]*\\} from '@vislow/visual-kit/nodes'`),
    );
  });

  /**
   * O bundle so cabe em 1 MB porque o webpack consegue descartar os tipos nao
   * usados. Importar o catalogo inteiro (ou um `import *`) mataria o
   * tree-shaking em silencio — o build passaria e o pacote estouraria.
   */
  it('nao importa componente que a arvore nao usa', () => {
    const source = generateVisualSource(assertValidSpec(specWithKind('kpi')), BUILD_ID);
    expect(source).not.toContain('BarChartNode');
    expect(source).not.toContain('PieChartNode');
    expect(source).not.toContain('import *');
  });

  it('emite todos os campos do descritor, na ordem do descritor', () => {
    const source = generateVisualSource(assertValidSpec(specWithKind('barChart')), BUILD_ID);
    // Recortado no elemento: buscar no fonte inteiro faz a busca casar com o
    // campo de OUTRO no que tenha a mesma chave, e o teste passa a medir a ordem
    // de um elemento que nao e o testado.
    const element = source.slice(source.indexOf('<BarChartNode'));
    const keys = NODE_DESCRIPTORS.barChart.fields.map((field) => field.key);
    const positions = keys.map((key) => element.indexOf(`${key}=`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  describe('filhos posicionados', () => {
    /** Um KPI dentro de um container que posiciona, com caixa conhecida. */
    function positioned() {
      const container = createNode('container');
      container.props.placement = 'canvas';
      container.children = [
        { ...nodeOf('kpi'), rect: { x: 25, y: 10, w: 50, h: 40 } },
      ];
      return generateVisualSource(assertValidSpec(specWith(container)), BUILD_ID);
    }

    it('embrulha o filho num CanvasSlot com a caixa da spec', () => {
      const source = positioned();

      expect(source).toContain('<CanvasSlot');
      expect(source).toContain('x={25}');
      expect(source).toContain('y={10}');
      expect(source).toContain('w={50}');
      expect(source).toContain('h={40}');
      // O embrulho fica POR FORA do no, senao a caixa nao posiciona nada.
      expect(source.indexOf('<CanvasSlot')).toBeLessThan(source.indexOf('<KpiNode'));
    });

    it('importa o CanvasSlot pelo nome, como qualquer outro no', () => {
      // Import nomeado e o que sustenta o tree-shaking (ADR-10).
      expect(positioned()).toMatch(
        /import \{[^}]*\bCanvasSlot\b[^}]*\} from '@vislow\/visual-kit\/nodes'/,
      );
    });

    it('quem so empilha nao paga pelo CanvasSlot no bundle', () => {
      const source = generateVisualSource(assertValidSpec(specWithKind('kpi')), BUILD_ID);
      expect(source).not.toContain('CanvasSlot');
    });
  });

  it('so passa o quadro de dados a nos que declaram papel', () => {
    const withData = generateVisualSource(assertValidSpec(specWithKind('barChart')), BUILD_ID);
    expect(withData).toContain('frame={frame}');

    const textOnly = createNode('container');
    textOnly.children = [createNode('text')];
    const source = generateVisualSource(assertValidSpec(specWith(textOnly)), BUILD_ID);
    expect(source).not.toContain('frame={frame}');
  });

  it('e deterministico: a mesma spec gera o mesmo fonte', () => {
    const spec = assertValidSpec(specWithEveryKind());
    expect(generateVisualSource(spec, BUILD_ID)).toBe(generateVisualSource(spec, BUILD_ID));
  });

  it('carrega o CSS por import, nao pelo campo style do pbiviz.json', () => {
    const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);
    expect(source).toContain("import '@vislow/visual-kit/styles.css'");
  });

  it('envolve a arvore no ErrorBoundary e carimba o build (RN-04)', () => {
    const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);
    expect(source).toContain('<ErrorBoundary buildId={BUILD_ID}>');
    expect(source).toContain('<BuildStamp id={BUILD_ID} />');
    expect(source).toContain(jsString(BUILD_ID));
  });
});

/**
 * Sprint 6. O que o codegen emite para as seis capacidades e pouco de proposito:
 * ele LIGA a `Interaction`, que e estatica e vem do template. Um visual gerado
 * que trouxesse a implementacao da selecao no proprio fonte espalharia codigo
 * identico por todo pacote compilado — e a fronteira template/codegen existe
 * para o contrario disso.
 */
describe('paridade de interatividade no fonte gerado', () => {
  const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);

  it('a leitura do quadro passa pela Interaction, e nao mais direto', () => {
    expect(source).toContain("import { Interaction } from './interaction'");
    expect(source).toContain('this.interaction.readFrame(options, ROLES)');
    expect(source).not.toContain('readDataFrame');
  });

  /**
   * Selecao feita em OUTRO visual chega por callback, fora de um `update`. Sem
   * um `render` separado do `update`, o esmaecimento so responderia a cliques
   * no proprio visual — cross-filter num sentido so.
   */
  it('renderiza fora do update, para a selecao vinda de outro visual', () => {
    expect(source).toContain('private render(): void');
    expect(source).toMatch(/new Interaction\(options, \(\) => \{\s*this\.render\(\);/);
  });

  it('emite o aviso de truncamento (RF-25)', () => {
    expect(source).toContain('TruncationNotice');
    expect(source).toContain('frame.truncated &&');
  });

  /**
   * Uma arvore so de texto nao le dados, mas ainda precisa de menu de contexto
   * e alto contraste — os dois vem da `Interaction`, que so existe se o quadro
   * for lido. Por isso `EMPTY_FRAME` entra mesmo sem papel nenhum.
   */
  it('liga a interacao mesmo numa arvore que nao le dados', () => {
    const textOnly = createNode('container');
    textOnly.children = [createNode('text')];
    const semDados = generateVisualSource(assertValidSpec(specWith(textOnly)), BUILD_ID);

    expect(semDados).toContain('EMPTY_FRAME');
    expect(semDados).toContain('this.interaction.readFrame(options, ROLES)');
    // ...e continua sem passar o quadro para uma arvore que nao o consome.
    expect(semDados).not.toContain('frame={frame}');
  });
});

/**
 * RN-11 do lado do servidor. O texto do usuario e DADO: ele sai como literal de
 * string dentro de um container de expressao JSX e nunca como codigo.
 */
describe('texto do usuario nunca vira codigo (RN-11)', () => {
  const hostis = [
    'aspas "duplas" e \'simples\'',
    'barra invertida \\ e \\" combinadas',
    'quebra\nde linha',
    '</div><script>alert(1)</script>',
    '{expressao} e `template ${x}`',
    'acento, cedilha e emoji 🚀',
  ];

  it.each(hostis)('neutraliza %j num campo de texto', (content) => {
    const container = createNode('container');
    const text = createNode('text');
    text.props.content = content;
    container.children = [text];

    const source = generateVisualSource(assertValidSpec(specWith(container)), BUILD_ID);

    // Container de expressao com um literal dentro — nunca atributo cru.
    expect(source).toContain(`content={${jsString(content)}}`);
    expect(source).not.toContain('dangerouslySetInnerHTML');

    // O fechamento de tag e o que fecha um literal quando o bundle e servido
    // dentro de HTML pelo host. `<script>` sozinho e inofensivo; `</script>`
    // nao — e por isso que o escape e do `</`, nao do `<`.
    expect(source).not.toContain('</script>');

    // E o literal emitido volta a ser o texto original ao ser lido como JSON.
    expect(JSON.parse(jsString(content))).toBe(content);
  });

  it('neutraliza o nome do projeto no manifesto', () => {
    const manifest = generatePbiviz(assertValidSpec(specWith(createNode('container'), 'Vendas "2026" 🚀')));
    expect(manifest.visual.displayName).toBe('Vendas "2026" 🚀');
    // O nome interno e o GUID sao identificadores JS — nao carregam o texto cru.
    expect(manifest.visual.name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    expect(manifest.visual.guid).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });
});

describe('capabilities.json gerado', () => {
  it('declara exatamente os papeis que a arvore consome', () => {
    const container = createNode('container');
    container.children = [nodeOf('kpi')];
    const capabilities = generateCapabilities(assertValidSpec(specWith(container)));

    // O KPI so consome a medida. O papel "categoria", declarado no projeto mas
    // nao ligado, NAO pode virar campo — senao o visual pede uma coluna que
    // ninguem le.
    expect(capabilities.dataRoles.map((role) => role.name)).toEqual(['valor']);
    expect(capabilities.dataRoles[0]?.kind).toBe('Measure');
  });

  it('mapeia grouping e measure para os kinds do Power BI', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithKind('barChart')));
    expect(capabilities.dataRoles).toEqual([
      {
        displayName: 'Categoria',
        name: 'categoria',
        kind: 'Grouping',
        requiredTypes: [{ text: true }],
      },
      { displayName: 'Valor', name: 'valor', kind: 'Measure', requiredTypes: [{ integer: true }] },
    ]);
  });

  it('o tipo da coluna vira restricao de arrasto no host', () => {
    // Sem `requiredTypes`, o tipo declarado no editor nao valeria nada do lado
    // do Power BI: o usuario arrastaria uma coluna de texto para um campo que o
    // visual soma, e a soma sairia zero sem erro nenhum.
    const esperado: Record<string, Record<string, boolean>[] | undefined> = {
      text: [{ text: true }],
      integer: [{ integer: true }],
      // Percentual e moeda sao FORMATO, nao tipo: no modelo do Power BI os dois
      // sao numero, e exigir outra coisa recusaria justamente a coluna certa.
      decimal: [{ numeric: true }],
      percent: [{ numeric: true }],
      currency: [{ numeric: true }],
      // `date` fica SEM restricao, e nao e esquecimento: o `valueType` do schema
      // oficial nao tem nenhum tipo temporal, e a chave inventada reprova a
      // validacao do proprio `pbiviz package`. Ver o teste de schema abaixo.
      date: undefined,
      boolean: [{ bool: true }],
    };

    for (const type of COLUMN_TYPES) {
      const spec = assertValidSpec(specWithColumnType(type));
      const [role] = generateCapabilities(spec).dataRoles;
      expect(role?.requiredTypes, type).toEqual(esperado[type]);
    }
  });

  it('a condicao limita a um campo, e NAO exige minimo', () => {
    // Regressao de 2026-08-03, e a razao de `min` nao poder voltar: o host
    // valida contra as condicoes o estado que os pocos TERIAM depois do
    // arrasto. Uma condicao unica com `min: 1` em todos os papeis descreve so o
    // estado final — o estado com um campo posto e o resto vazio nao satisfaz
    // nada, e o drop e descartado em silencio. Resultado no Desktop: os pocos
    // aparecem com o nome certo e simplesmente nao aceitam coluna nenhuma,
    // para sempre. Quem responde por "falta campo" e o `EmptyState`.
    const capabilities = generateCapabilities(assertValidSpec(specWithKind('lineChart')));
    const [mapping] = capabilities.dataViewMappings as {
      conditions: Record<string, { min?: number; max: number }>[];
    }[];
    expect(mapping?.conditions[0]).toEqual({
      categoria: { max: 1 },
      valor: { max: 1 },
    });

    for (const condition of mapping?.conditions ?? []) {
      for (const [role, range] of Object.entries(condition)) {
        expect(range, role).not.toHaveProperty('min');
      }
    }
  });

  it('nao declara mapeamento quando a arvore nao le dados', () => {
    const container = createNode('container');
    container.children = [createNode('text')];
    const capabilities = generateCapabilities(assertValidSpec(specWith(container)));

    expect(capabilities.dataRoles).toEqual([]);
    expect(capabilities.dataViewMappings).toEqual([]);
  });
});

/**
 * O capabilities gerado contra o schema OFICIAL do host.
 *
 * Esta guarda existe porque a anterior nao existia, e por isso `requiredTypes:
 * [{ dateTime: true }]` ficou meses no codigo: o `valueType` do schema roda com
 * `additionalProperties: false` e nao tem NENHUM tipo temporal, entao toda build
 * de projeto com coluna de data morria em `Invalid capabilities` — a validacao e
 * do proprio `pbiviz package`, no `powerbi-visuals-webpack-plugin`.
 *
 * As opcoes do Ajv sao copiadas de `src/extractor/capabilities.js` do plugin. Se
 * divergirem, esta suite passa e a build real reprova — o pior dos dois mundos.
 */
describe('capabilities.json contra o schema oficial do powerbi-visuals-api', () => {
  const ajv = new Ajv({
    strict: false,
    allErrors: false,
    validateSchema: true,
    strictTuples: 'log',
  });
  const validate = ajv.compile(capabilitiesSchema);

  const explique = (): string =>
    (validate.errors ?? [])
      .map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`)
      .join('; ');

  it.each(COLUMN_TYPES)('o tipo de coluna "%s" gera capabilities validos', (type) => {
    const capabilities = generateCapabilities(assertValidSpec(specWithColumnType(type)));
    expect(validate(capabilities), explique()).toBe(true);
  });

  it('uma arvore com todos os tipos de no gera capabilities validos', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    expect(validate(capabilities), explique()).toBe(true);
  });

  it('a arvore que nao le dados gera capabilities validos', () => {
    const container = createNode('container');
    container.children = [createNode('text')];
    const capabilities = generateCapabilities(assertValidSpec(specWith(container)));
    expect(validate(capabilities), explique()).toBe(true);
  });

  it('o schema realmente recusa um tipo temporal — a guarda morde', () => {
    // Sem esta assercao, "os capabilities sao validos" poderia significar so que
    // o schema nao confere nada. Aqui esta a prova de que ele confere.
    const capabilities = generateCapabilities(assertValidSpec(specWithColumnType('date')));
    const [role] = capabilities.dataRoles;
    expect(role).toBeDefined();

    for (const inventado of [{ dateTime: true }, { date: true }, { temporal: true }]) {
      const quebrado = {
        ...capabilities,
        dataRoles: [{ ...role, requiredTypes: [inventado] }],
      };
      expect(validate(quebrado), JSON.stringify(inventado)).toBe(false);
    }
  });
});

describe('pbiviz.json gerado', () => {
  // A MESMA spec nas duas pontas: `specWithEveryKind` gera id aleatorio, porque
  // a RN-01 exige que dois projetos novos nunca compartilhem GUID.
  const spec = assertValidSpec(specWithEveryKind());
  const manifest = generatePbiviz(spec);

  /**
   * O GUID e NOME DE VARIAVEL JS no `visualPlugin.ts` que a toolchain gera, nao
   * um UUID. Um GUID que nao case com isso produz bundle que nem carrega.
   */
  it('o GUID e um identificador JS valido', () => {
    expect(manifest.visual.guid).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });

  it('a identidade nasce do projeto, sem reescrita posterior (ADR-08)', () => {
    expect(manifest.visual.guid).toBe(spec.project.id);
    expect(manifest.visual.version).toBe(spec.project.packageVersion);
    expect(manifest.version).toBe(spec.project.packageVersion);
  });

  it('aponta para o capabilities.json e para a classe do visual', () => {
    expect(manifest.capabilities).toBe('capabilities.json');
    expect(manifest.visual.visualClassName).toBe('Visual');
  });
});

describe('generateProject', () => {
  it('emite os tres arquivos que distinguem um visual de outro', () => {
    const files = generateProject(assertValidSpec(specWithEveryKind()), BUILD_ID);
    expect(files.map((file) => file.path).sort()).toEqual([
      'capabilities.json',
      'pbiviz.json',
      'src/visual.tsx',
    ]);
  });

  it('recusa spec invalida em vez de gerar fonte quebrado', () => {
    const container = createNode('container');
    // Papel nao declarado no projeto: passa pelo schema, morre na validacao
    // semantica. Gerar assim produziria um visual que pede um campo que o
    // capabilities.json nao declara.
    const chart = nodeOf('barChart');
    chart.props.measureRole = 'inexistente';
    container.children = [chart];

    expect(() => generateProject(specWith(container), BUILD_ID)).toThrow(/inexistente/);
  });

  it('a prancheta do editor NAO chega ao pacote', () => {
    // A prancheta e o alvo contra o qual a composicao e julgada no editor. Um
    // visual do Power BI nao escolhe o proprio tamanho — quem arrasta a moldura
    // e o autor do relatorio —, entao o dia em que 1920 aparecer no fonte
    // gerado, o visual passou a mentir sobre onde cabe. A fixture carrega a
    // prancheta de proposito; sem ela, este teste passaria por ausencia.
    const spec = assertValidSpec(specWithEveryKind());
    expect(spec.project.artboard).toEqual(ARTBOARD_MAX);

    for (const file of generateProject(spec, BUILD_ID)) {
      expect(file.contents, file.path).not.toMatch(/artboard/i);
      expect(file.contents, file.path).not.toContain(String(ARTBOARD_MAX.width));
      expect(file.contents, file.path).not.toContain(String(ARTBOARD_MAX.height));
    }
  });

  it('os valores da tabela de exemplo NAO chegam ao pacote', () => {
    // Mesma regra da prancheta, e pelo mesmo motivo: um visual do Power BI
    // mostra o modelo de quem o usa. Um pacote que carregasse os numeros que o
    // usuario digitou no editor mentiria sobre o que esta na tela — e ainda
    // levaria dado dele para dentro de um arquivo que ele distribui.
    //
    // O ESQUEMA da tabela vai (coluna, tipo, papel viram `capabilities.json`);
    // os VALORES ficam. A fixture carrega sentinelas de proposito; sem elas,
    // este teste passaria por ausencia.
    const spec = assertValidSpec(specWithEveryKind());
    expect(spec.data.rows).toEqual(TEST_TABLE.rows);

    for (const file of generateProject(spec, BUILD_ID)) {
      for (const row of spec.data.rows) {
        for (const cell of row) {
          if (cell === null) continue;
          expect(file.contents, `${file.path} vazou ${String(cell)}`).not.toContain(String(cell));
        }
      }
    }
  });

  it('o JSON emitido termina em quebra de linha', () => {
    const files = generateProject(assertValidSpec(specWithEveryKind()), BUILD_ID);
    for (const file of files.filter((f) => f.path.endsWith('.json'))) {
      expect(file.contents.endsWith('\n')).toBe(true);
      expect(() => JSON.parse(file.contents) as unknown).not.toThrow();
    }
  });
});
