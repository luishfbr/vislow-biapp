import { describe, expect, it } from 'vitest';
import {
  NODE_DESCRIPTORS,
  NODE_KINDS,
  assertValidSpec,
  createNode,
  type NodeKind,
} from '@vislow/component-registry';
import { generateCapabilities } from './capabilities.js';
import { generatePbiviz } from './pbiviz.js';
import { generateVisualSource } from './visual.js';
import { generateProject } from './index.js';
import { jsString } from './literal.js';
import { specWith, specWithEveryKind, specWithKind, nodeOf } from './fixtures.js';

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
    const keys = NODE_DESCRIPTORS.barChart.fields.map((field) => field.key);
    const positions = keys.map((key) => source.indexOf(`${key}=`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
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
      { displayName: 'Categoria', name: 'categoria', kind: 'Grouping' },
      { displayName: 'Valor', name: 'valor', kind: 'Measure' },
    ]);
  });

  it('limita cada papel a um campo', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithKind('lineChart')));
    const [mapping] = capabilities.dataViewMappings as {
      conditions: Record<string, { max: number }>[];
    }[];
    expect(mapping?.conditions[0]).toEqual({ categoria: { max: 1 }, valor: { max: 1 } });
  });

  it('nao declara mapeamento quando a arvore nao le dados', () => {
    const container = createNode('container');
    container.children = [createNode('text')];
    const capabilities = generateCapabilities(assertValidSpec(specWith(container)));

    expect(capabilities.dataRoles).toEqual([]);
    expect(capabilities.dataViewMappings).toEqual([]);
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

  it('o JSON emitido termina em quebra de linha', () => {
    const files = generateProject(assertValidSpec(specWithEveryKind()), BUILD_ID);
    for (const file of files.filter((f) => f.path.endsWith('.json'))) {
      expect(file.contents.endsWith('\n')).toBe(true);
      expect(() => JSON.parse(file.contents) as unknown).not.toThrow();
    }
  });
});
