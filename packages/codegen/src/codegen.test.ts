import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import capabilitiesSchema from 'powerbi-visuals-api/schema.capabilities.json';
import {
  ARTBOARD_MAX,
  NODE_DESCRIPTORS,
  NODE_KINDS,
  assertValidSpec,
  consumesData,
  createNode,
  walk,
  type NodeKind,
  type VisualSpec,
} from '@vislow/component-registry';
import { COLUMN_TYPES, type ColumnType } from '@vislow/config-schema';
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
  specWithExposure,
  specWithKind,
  nodeOf,
} from './fixtures.js';

const BUILD_ID = 'b1c2d3e4';

interface ExposedObject {
  displayName: string;
  properties: Record<string, { displayName: string; type: Record<string, unknown> } | undefined>;
}

describe('emissao do visual.tsx', () => {
  it.each(NODE_KINDS)('o tipo "%s" emite o componente do registro', (kind: NodeKind) => {
    const source = generateVisualSource(assertValidSpec(specWithKind(kind)), BUILD_ID);
    const component = NODE_DESCRIPTORS[kind].component;

    expect(source).toContain(`<${component}`);
    expect(source).toMatch(
      new RegExp(`import \\{[^}]*\\b${component}\\b[^}]*\\} from '@vislow/visual-kit/nodes'`),
    );
  });

  it('nao importa componente que a arvore nao usa', () => {
    const source = generateVisualSource(assertValidSpec(specWithKind('text')), BUILD_ID);
    expect(source).not.toContain('CanvasSlot');
    expect(source).not.toContain('import *');
  });

  it('emite todos os campos do descritor, na ordem do descritor', () => {
    const source = generateVisualSource(assertValidSpec(specWithKind('text')), BUILD_ID);
    const element = source.slice(source.indexOf('<TextBox'));
    const keys = NODE_DESCRIPTORS.text.fields.map((field) => field.key);
    const positions = keys.map((key) => element.indexOf(`${key}=`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  describe('filhos posicionados', () => {
    function positioned() {
      const container = createNode('container');
      container.props.placement = 'canvas';
      container.children = [{ ...nodeOf('text'), rect: { x: 25, y: 10, w: 50, h: 40 } }];
      return generateVisualSource(assertValidSpec(specWith(container)), BUILD_ID);
    }

    it('embrulha o filho num CanvasSlot com a caixa da spec', () => {
      const source = positioned();

      expect(source).toContain('<CanvasSlot');
      expect(source).toContain('x={25}');
      expect(source).toContain('y={10}');
      expect(source).toContain('w={50}');
      expect(source).toContain('h={40}');
      expect(source.indexOf('<CanvasSlot')).toBeLessThan(source.indexOf('<TextBox'));
    });

    it('importa o CanvasSlot pelo nome, como qualquer outro no', () => {
      expect(positioned()).toMatch(
        /import \{[^}]*\bCanvasSlot\b[^}]*\} from '@vislow\/visual-kit\/nodes'/,
      );
    });

    it('quem so empilha nao paga pelo CanvasSlot no bundle', () => {
      const source = generateVisualSource(assertValidSpec(specWithKind('text')), BUILD_ID);
      expect(source).not.toContain('CanvasSlot');
    });
  });

  it('passa o quadro so a quem declara papel — e a regra vem do registro', () => {
    for (const kind of NODE_KINDS) {
      const source = generateVisualSource(assertValidSpec(specWithKind(kind)), BUILD_ID);
      if (consumesData(kind)) expect(source, kind).toContain('frame={frame}');
      else expect(source, kind).not.toContain('frame={frame}');
    }
  });

  it('o KPI e quem le dados; container e texto continuam sem quadro', () => {
    expect(consumesData('kpi')).toBe(true);
    expect(consumesData('container')).toBe(false);
    expect(consumesData('text')).toBe(false);
  });

  it('e deterministico: a mesma spec gera o mesmo fonte', () => {
    const spec = assertValidSpec(specWithEveryKind());
    expect(generateVisualSource(spec, BUILD_ID)).toBe(generateVisualSource(spec, BUILD_ID));
  });

  it('carrega o CSS por import, nao pelo campo style do pbiviz.json', () => {
    const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);
    expect(source).toContain("import '@vislow/visual-kit/styles.css'");
  });

  it('envolve a arvore no ErrorBoundary, que carrega o buildId (RN-04)', () => {
    const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);
    expect(source).toContain('<ErrorBoundary buildId={BUILD_ID}>');
    expect(source).toContain(jsString(BUILD_ID));
  });

  it('nao carimba o buildId no caminho de sucesso', () => {
    const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);
    expect(source).not.toContain('BuildStamp');
  });
});

describe('paridade de interatividade no fonte gerado', () => {
  const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);

  it('a leitura do quadro passa pela Interaction, e nao mais direto', () => {
    expect(source).toContain("import { Interaction } from './interaction'");
    expect(source).toContain('this.interaction.readFrame(options, ROLES)');
    expect(source).not.toContain('readDataFrame');
  });

  it('renderiza fora do update, para a selecao vinda de outro visual', () => {
    expect(source).toContain('private render(): void');
    expect(source).toMatch(/new Interaction\(options, \(\) => \{\s*this\.render\(\);/);
  });

  it('emite o aviso de truncamento (RF-25)', () => {
    expect(source).toContain('TruncationNotice');
    expect(source).toContain('frame.truncated &&');
  });

  it('liga a interacao mesmo numa arvore que nao le dados', () => {
    const textOnly = createNode('container');
    textOnly.children = [createNode('text')];
    const semDados = generateVisualSource(assertValidSpec(specWith(textOnly)), BUILD_ID);

    expect(semDados).toContain('EMPTY_FRAME');
    expect(semDados).toContain('this.interaction.readFrame(options, ROLES)');
    expect(semDados).not.toContain('frame={frame}');
  });
});

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

    expect(source).toContain(`content={${jsString(content)}}`);
    expect(source).not.toContain('dangerouslySetInnerHTML');

    expect(source).not.toContain('</script>');

    expect(JSON.parse(jsString(content))).toBe(content);
  });

  it('neutraliza o nome do projeto no manifesto', () => {
    const manifest = generatePbiviz(assertValidSpec(specWith(createNode('container'), 'Vendas "2026" 🚀')));
    expect(manifest.visual.displayName).toBe('Vendas "2026" 🚀');
    expect(manifest.visual.name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    expect(manifest.visual.guid).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });
});

describe('capabilities.json gerado', () => {

  it('declara exatamente os papeis que a arvore consome, e nada mais (ADR-12)', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    const names = capabilities.dataRoles.map((role) => role.name);

    expect(names).toContain('valor');
    expect(names).toContain('meta');
    expect(names).toContain('categoria');
  });

  it('coluna que a arvore nao liga fica FORA do poco de campos (ADR-12)', () => {
    const spec = specWithEveryKind();
    spec.data.columns.push({
      name: 'naoLigada',
      displayName: 'Nao ligada',
      kind: 'measure',
      type: 'decimal',
    });
    for (const row of spec.data.rows) row.push(1);

    const names = generateCapabilities(assertValidSpec(spec)).dataRoles.map((role) => role.name);
    expect(names).not.toContain('naoLigada');
  });

  it('a ordem dos papeis e a das colunas do projeto, nao a da arvore', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    expect(capabilities.dataRoles.map((role) => role.name)).toEqual([
      'categoria',
      'valor',
      'meta',
    ]);
  });

  it('mapeia cada papel para o kind do Power BI conforme o tipo da coluna', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    const kinds = Object.fromEntries(capabilities.dataRoles.map((role) => [role.name, role.kind]));

    expect(kinds).toEqual({ categoria: 'Grouping', valor: 'Measure', meta: 'Measure' });
  });

  it.each(COLUMN_TYPES)(
    'o tipo "%s" da coluna vira restricao de arrasto no host',
    (type: ColumnType) => {
      const capabilities = generateCapabilities(assertValidSpec(specWithColumnType(type)));
      const role = capabilities.dataRoles[0];
      expect(role).toBeDefined();

      // `date` fica DELIBERADAMENTE de fora: o `valueType` oficial nao tem tipo temporal.
      if (type === 'date') {
        expect(role?.requiredTypes).toBeUndefined();
        return;
      }

      const expected: Record<string, Record<string, boolean>[]> = {
        text: [{ text: true }],
        integer: [{ integer: true }],
        decimal: [{ numeric: true }],
        percent: [{ numeric: true }],
        currency: [{ numeric: true }],
        boolean: [{ bool: true }],
      };
      expect(role?.requiredTypes).toEqual(expected[type]);
    },
  );

  it('a condicao limita a um campo por papel, e NAO exige minimo', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    const mapping = capabilities.dataViewMappings[0] as {
      conditions: Record<string, Record<string, number>>[];
      categorical: Record<string, unknown>;
    };

    expect(mapping.conditions).toHaveLength(1);
    for (const [role, condition] of Object.entries(mapping.conditions[0] ?? {})) {
      expect(condition.max, role).toBe(1);
      expect(condition, role).not.toHaveProperty('min');
    }
    expect(JSON.stringify(capabilities.dataViewMappings)).not.toContain('"min"');
  });

  it('as medidas viram `values` e os agrupamentos viram `categories`', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    const mapping = capabilities.dataViewMappings[0] as {
      categorical: {
        values?: { select: { bind: { to: string } }[] };
        categories?: {
          select: { for: { in: string } }[];
          dataReductionAlgorithm: { top: { count: number } };
        };
      };
    };

    expect(mapping.categorical.values?.select).toEqual([
      { bind: { to: 'valor' } },
      { bind: { to: 'meta' } },
    ]);

    expect(mapping.categorical.categories?.select).toEqual([{ for: { in: 'categoria' } }]);
  });

  it('o corte do host e declarado, e bate com o que o visual anuncia', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    const mapping = capabilities.dataViewMappings[0] as {
      categorical: { categories?: { dataReductionAlgorithm: { top: { count: number } } } };
    };
    const declared = mapping.categorical.categories?.dataReductionAlgorithm.top.count;
    expect(declared).toBeDefined();

    const source = readFileSync(
      fileURLToPath(
        new URL('../../visual-template/template/src/dataFrame.ts', import.meta.url),
      ),
      'utf8',
    );
    // Duplicata vigiada: `CATEGORY_LIMIT` vive no codegen E no template, e este teste e o que os amarra.
    const match = /CATEGORY_LIMIT\s*=\s*(\d+)/.exec(source);
    expect(match, 'CATEGORY_LIMIT sumiu do template').not.toBeNull();
    expect(Number(match?.[1])).toBe(declared);
  });

  it('uma arvore so de container e texto continua sem pedir campo nenhum', () => {
    for (const kind of NODE_KINDS.filter((candidate) => !consumesData(candidate))) {
      const capabilities = generateCapabilities(assertValidSpec(specWithKind(kind)));
      expect(capabilities.dataRoles, kind).toEqual([]);
      expect(capabilities.dataViewMappings, kind).toEqual([]);
    }
  });
});

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
    const base = generateCapabilities(assertValidSpec(specWithEveryKind()));

    for (const inventado of [{ dateTime: true }, { date: true }, { temporal: true }]) {
      const quebrado = {
        ...base,
        dataRoles: [
          { displayName: 'Data', name: 'data', kind: 'Grouping', requiredTypes: [inventado] },
        ],
      };
      expect(validate(quebrado), JSON.stringify(inventado)).toBe(false);
    }
  });
});

describe('pbiviz.json gerado', () => {
  const spec = assertValidSpec(specWithEveryKind());
  const manifest = generatePbiviz(spec);

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
    const texto = nodeOf('text');
    delete texto.props.fontSize;
    container.children = [texto];

    expect(() => generateProject(specWith(container), BUILD_ID)).toThrow(/fontSize/);
  });

  it('a prancheta do editor NAO chega ao pacote', () => {
    const spec = assertValidSpec(specWithEveryKind());
    expect(spec.project.artboard).toEqual(ARTBOARD_MAX);

    for (const file of generateProject(spec, BUILD_ID)) {
      expect(file.contents, file.path).not.toMatch(/artboard/i);
      expect(file.contents, file.path).not.toContain(String(ARTBOARD_MAX.width));
      expect(file.contents, file.path).not.toContain(String(ARTBOARD_MAX.height));
    }
  });

  it('os valores da tabela de exemplo NAO chegam ao pacote', () => {
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

describe('painel de formatacao no visual gerado', () => {
  const publicada = assertValidSpec(specWithExposure());

  const objetos = (spec: VisualSpec): Record<string, ExposedObject> =>
    generateCapabilities(spec).objects as Record<string, ExposedObject>;

  it('sem nada publicado, o pacote e identico ao de antes', () => {
    const fechada = assertValidSpec(specWithEveryKind('Nada Publicado'));
    for (const { node } of walk(fechada)) expect(node.exposed).toBeUndefined();

    const capabilities = generateCapabilities(fechada);
    expect(capabilities.objects).toEqual({});
    expect('supportsEmptyDataView' in capabilities).toBe(false);

    const source = generateVisualSource(fechada, BUILD_ID);
    expect(source).not.toContain('FORMATTING');
    expect(source).not.toContain('./formatting');
    expect(source).not.toContain('pick(');
    expect(source).not.toContain('getFormattingModel');
  });

  it('cada no publicado vira um object, com o id do no como nome', () => {
    const objects = objetos(publicada);
    const [container, titulo] = [publicada.root, publicada.root.children?.[0]];

    expect(Object.keys(objects)).toEqual([container.id, titulo?.id]);
    expect(objects[container.id]?.displayName).toBe('Container');
    expect(objects[titulo?.id ?? '']?.displayName).toBe('Titulo do painel');
  });

  it('o no que nao publicou nada nao ganha object', () => {
    const nota = publicada.root.children?.[1];
    expect(nota?.exposed).toBeUndefined();
    expect(Object.keys(objetos(publicada))).not.toContain(nota?.id);
  });

  it('cada tipo de campo vira o tipo de propriedade que o host entende', () => {
    const titulo = publicada.root.children?.[0];
    const properties = objetos(publicada)[titulo?.id ?? '']?.properties ?? {};

    expect(properties.content?.type).toEqual({ text: true });
    expect(properties.fontSize?.type).toEqual({ integer: true });
    expect(properties.color?.type).toEqual({ fill: { solid: { color: true } } });
    expect(properties.showBackground?.type).toEqual({ bool: true });
    expect(properties.fontWeight?.type).toEqual({
      enumeration: [
        { value: 'normal', displayName: 'Normal' },
        { value: 'medium', displayName: 'Medio' },
        { value: 'semibold', displayName: 'Semi-negrito' },
        { value: 'bold', displayName: 'Negrito' },
      ],
    });
  });

  it('declara supportsEmptyDataView quando ha painel', () => {
    expect(generateCapabilities(publicada).supportsEmptyDataView).toBe(true);
  });

  it('o capabilities publicado continua valido contra o schema oficial', () => {
    const ajv = new Ajv({ strict: false, allErrors: false, validateSchema: true });
    const validate = ajv.compile(capabilitiesSchema);
    const explique = (): string =>
      (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`).join('; ');

    expect(validate(generateCapabilities(publicada)), explique()).toBe(true);
  });

  it('campo publicado le o override; campo fechado sai literal', () => {
    const source = generateVisualSource(publicada, BUILD_ID);
    const titulo = publicada.root.children?.[0];
    const element = source.slice(source.indexOf('<TextBox'));

    expect(element).toContain(
      `fontSize={pick(overrides, ${jsString(titulo?.id ?? '')}, "fontSize", 20)}`,
    );
    expect(element).toContain('padding={8}');
    expect(element).not.toContain('padding={pick(');
  });

  it('a tabela FORMATTING leva rotulo, faixa e opcoes — o registro nao vai ao bundle', () => {
    const source = generateVisualSource(publicada, BUILD_ID);
    const table = source.slice(source.indexOf('const FORMATTING'), source.indexOf('function Tree'));

    expect(table).toContain('"label": "Tamanho"');
    expect(table).toContain('"min": 8');
    expect(table).toContain('"max": 200');
    expect(table).toContain('"maxLength": 500');
    expect(table).toContain('"label": "Semi-negrito"');
  });

  it('a ordem dos campos e a do descritor, nao a do clique', () => {
    const source = generateVisualSource(publicada, BUILD_ID);
    const titulo = publicada.root.children?.[0];
    expect(titulo?.exposed?.[0]).toBe('color');

    const table = source.slice(source.indexOf('const FORMATTING'), source.indexOf('function Tree'));
    const ordem = NODE_DESCRIPTORS.text.fields
      .map((field) => field.key)
      .filter((key) => titulo?.exposed?.includes(key))
      .map((key) => table.indexOf(`"key": ${jsString(key)}`));

    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    expect(ordem[0]).toBeGreaterThan(-1);
  });

  it('o governante de um showWhen viaja mesmo sem ser publicado', () => {
    const spec = specWithExposure('Governante Fechado');
    const titulo = spec.root.children?.[0];
    if (titulo) titulo.exposed = ['background'];

    const source = generateVisualSource(assertValidSpec(spec), BUILD_ID);
    const table = source.slice(source.indexOf('const FORMATTING'), source.indexOf('function Tree'));

    expect(table).toContain('"showBackground": false');
    expect(table).toContain('"showWhen"');
  });

  it('o apelido do no e o conteudo do texto passam por literal de string', () => {
    const spec = specWithExposure('Aspas');
    const titulo = spec.root.children?.[0];
    if (titulo) {
      titulo.name = 'Fecha "aspas" </script>';
      titulo.props.content = 'Conteudo </script>';
    }

    const source = generateVisualSource(assertValidSpec(spec), BUILD_ID);
    expect(source).not.toContain('</script>');
    expect(source).toContain(jsString('Fecha "aspas" </script>'));
  });
});
