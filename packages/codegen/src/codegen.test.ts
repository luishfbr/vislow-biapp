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
import { generateCapabilities } from './capabilities.js';
import { generatePbiviz } from './pbiviz.js';
import { generateVisualSource } from './visual.js';
import { generateProject } from './index.js';
import { jsString } from './literal.js';
import {
  TEST_TABLE,
  specWith,
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
    const source = generateVisualSource(assertValidSpec(specWithKind('text')), BUILD_ID);
    // A arvore tem texto dentro de container: o `CanvasSlot` e o unico outro no
    // do subcaminho, e ele so entra quando alguem posiciona.
    expect(source).not.toContain('CanvasSlot');
    expect(source).not.toContain('import *');
  });

  it('emite todos os campos do descritor, na ordem do descritor', () => {
    const source = generateVisualSource(assertValidSpec(specWithKind('text')), BUILD_ID);
    // Recortado no elemento: buscar no fonte inteiro faz a busca casar com o
    // campo de OUTRO no que tenha a mesma chave, e o teste passa a medir a ordem
    // de um elemento que nao e o testado. A caixa de texto e o sujeito certo
    // aqui porque e o no com mais campos do catalogo, cobrindo os seis tipos.
    const element = source.slice(source.indexOf('<TextBox'));
    const keys = NODE_DESCRIPTORS.text.fields.map((field) => field.key);
    const positions = keys.map((key) => element.indexOf(`${key}=`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  describe('filhos posicionados', () => {
    /** Uma caixa de texto dentro de um container que posiciona. */
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
      // O embrulho fica POR FORA do no, senao a caixa nao posiciona nada.
      expect(source.indexOf('<CanvasSlot')).toBeLessThan(source.indexOf('<TextBox'));
    });

    it('importa o CanvasSlot pelo nome, como qualquer outro no', () => {
      // Import nomeado e o que sustenta o tree-shaking (ADR-10).
      expect(positioned()).toMatch(
        /import \{[^}]*\bCanvasSlot\b[^}]*\} from '@vislow\/visual-kit\/nodes'/,
      );
    });

    it('quem so empilha nao paga pelo CanvasSlot no bundle', () => {
      const source = generateVisualSource(assertValidSpec(specWithKind('text')), BUILD_ID);
      expect(source).not.toContain('CanvasSlot');
    });
  });

  it('nao passa o quadro de dados a no nenhum — ninguem declara papel', () => {
    // A metade positiva deste teste ("passa o quadro a quem DECLARA papel")
    // tinha um grafico como sujeito e esta em quarentena junto com ele. A
    // metade que sobrou nao e trivial: ela afirma que `consumesData` continua
    // governando a emissao do `frame`, e e ela que falha no dia em que o KPI
    // Card voltar sem o outro lado ser reescrito.
    for (const kind of NODE_KINDS) {
      const source = generateVisualSource(assertValidSpec(specWithKind(kind)), BUILD_ID);
      expect(source, kind).not.toContain('frame={frame}');
    }
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
    // O selo do canto foi removido a pedido: o visual nao deve escrever um hash
    // sobre o relatorio de quem o usa. O buildId sobra so no card de erro.
    const source = generateVisualSource(assertValidSpec(specWithEveryKind()), BUILD_ID);
    expect(source).not.toContain('BuildStamp');
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
  /*
   * ============= A BATERIA DE dataRoles ESTA DORMENTE NA 5.0.0 ===============
   * Havia aqui quatro testes que precisavam de um no consumindo dados:
   *
   *   - "declara exatamente os papeis que a arvore consome" (ADR-12: campo
   *     pedido e campo usado sao a mesma coisa)
   *   - "mapeia grouping e measure para os kinds do Power BI"
   *   - "o tipo da coluna vira restricao de arrasto no host" (`requiredTypes`
   *     por `ColumnType`, com `date` deliberadamente de fora)
   *   - "a condicao limita a um campo, e NAO exige minimo" — a regressao de
   *     2026-08-03, em que os pocos apareciam com o nome certo e recusavam toda
   *     coluna, para sempre, porque `min: 1` descreve so o estado final
   *
   * Nenhum descritor declara campo de papel na 5.0.0, entao `usedRoles` devolve
   * vazio e o `capabilities` sai sem `dataRoles` e sem `dataViewMappings` — nao
   * ha o que os quatro possam medir. O codigo que eles cobriam continua em
   * `capabilities.ts`, intacto, e os quatro voltam com o KPI Card da Fase 4.
   *
   * O `min` proibido continua guardado em producao pelo `inspectArtifact` do
   * `pipeline.ts`, que le o capabilities de dentro do zip.
   * ==========================================================================
   */

  it('a arvore nao le dados: sem papel e sem mapeamento, para qualquer tipo', () => {
    // Nao e um teste vazio: e a AFIRMACAO do estado da 5.0.0. Ele falha no dia
    // em que um descritor voltar a declarar papel — e falhar aqui e o lembrete
    // de descongelar os quatro testes descritos acima.
    for (const kind of NODE_KINDS) {
      const capabilities = generateCapabilities(assertValidSpec(specWithKind(kind)));
      expect(capabilities.dataRoles, kind).toEqual([]);
      expect(capabilities.dataViewMappings, kind).toEqual([]);
    }
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
    //
    // O papel e MONTADO A MAO, e nao gerado: na 5.0.0 nenhum no consome dados e
    // o codegen nao produz `dataRoles` de onde partir. A guarda continua tendo
    // sujeito porque o que ela testa e o SCHEMA OFICIAL, nao o nosso codegen —
    // e e por isso que ela e a mais importante desta suite: e ela que teria
    // pegado o `requiredTypes: [{ dateTime: true }]` que ficou meses no codigo
    // matando toda build de projeto com coluna de data.
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
    // Campo obrigatorio do descritor apagado. Gerar assim emitiria
    // `fontSize={undefined}` no JSX e o visual sairia com a tipografia do host —
    // divergindo do preview, sem erro em lugar nenhum.
    //
    // Ate a spec 4.0.0 o sujeito era um papel NAO DECLARADO num grafico, que
    // passa pelo schema e morre na validacao semantica. Essa metade esta
    // dormente com os graficos; o que continua provado aqui e que
    // `generateProject` valida ANTES de emitir, em vez de confiar em quem chama.
    const texto = nodeOf('text');
    delete texto.props.fontSize;
    container.children = [texto];

    expect(() => generateProject(specWith(container), BUILD_ID)).toThrow(/fontSize/);
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
