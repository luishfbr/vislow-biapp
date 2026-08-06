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

/** A forma de um `object` do capabilities, so o que os testes leem. */
interface ExposedObject {
  displayName: string;
  properties: Record<string, { displayName: string; type: Record<string, unknown> } | undefined>;
}

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

  it('passa o quadro so a quem declara papel — e a regra vem do registro', () => {
    // Descongelado na spec 5.2.0. Entre a poda e o KPI Card so a metade negativa
    // existia, porque nenhum descritor declarava papel; agora as duas valem, e e
    // `consumesData` — a MESMA funcao que o preview do editor consulta — que
    // decide de que lado cada tipo cai. Divergir aqui faria o preview desenhar
    // dados e o pacote entregue cair no estado vazio.
    for (const kind of NODE_KINDS) {
      const source = generateVisualSource(assertValidSpec(specWithKind(kind)), BUILD_ID);
      if (consumesData(kind)) expect(source, kind).toContain('frame={frame}');
      else expect(source, kind).not.toContain('frame={frame}');
    }
  });

  it('o KPI e quem le dados; container e texto continuam sem quadro', () => {
    // A afirmacao concreta por tras da regra acima. Sem ela, um registro em que
    // NINGUEM declarasse papel passaria no teste anterior por vacuidade — que e
    // exatamente o estado de que a 5.2.0 saiu.
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
   * ============== A QUARENTENA ACABOU DE VEZ NA SPEC 5.3.0 ==================
   * Esta bateria esteve congelada duas vezes. Entre a poda da 5.0.0 e o KPI Card
   * nao havia no que consumisse dados, e `usedRoles` devolvia vazio. Entre o KPI
   * e a Lista de Ranking havia dados mas so MEDIDA — e por isso o ramo
   * `Grouping`, o bloco `categorical.categories`, o `dataReductionAlgorithm` e o
   * truncamento (RF-25) continuavam escritos e sem chamador.
   *
   * A Lista de Ranking e o sujeito que faltava. Os quatro testes que afirmavam a
   * AUSENCIA de agrupamento foram invertidos aqui — eram o lembrete combinado, e
   * falharam no commit exato em que deviam falhar.
   * ==========================================================================
   */

  it('declara exatamente os papeis que a arvore consome, e nada mais (ADR-12)', () => {
    const capabilities = generateCapabilities(assertValidSpec(specWithEveryKind()));
    const names = capabilities.dataRoles.map((role) => role.name);

    // As duas medidas que o KPI liga, mais a categoria que a Lista de Ranking
    // liga: a tabela de exemplo tem tres colunas e a arvore agora usa as tres.
    expect(names).toContain('valor');
    expect(names).toContain('meta');
    expect(names).toContain('categoria');
  });

  it('coluna que a arvore nao liga fica FORA do poco de campos (ADR-12)', () => {
    // O outro lado do teste acima, e o que ele deixou de poder afirmar quando a
    // Lista passou a ligar `categoria`. Uma coluna a mais na tabela, que no
    // nenhum referencia, nao pode virar campo: poco que ninguem le e o visual
    // pedindo uma coluna para nada.
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
    // `usedRoles` filtra `spec.data.columns`, entao a ordem do poco de campos e
    // a que o autor ve na tabela. Reordenar por travessia da arvore mudaria o
    // poco a cada vez que um no fosse movido — e a Lista de Ranking, que e o
    // ultimo no da fixture, liga a PRIMEIRA coluna.
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

    // `Grouping` deixou de ser ramo morto do `capabilities.ts` na spec 5.3.0.
    expect(kinds).toEqual({ categoria: 'Grouping', valor: 'Measure', meta: 'Measure' });
  });

  it.each(COLUMN_TYPES)(
    'o tipo "%s" da coluna vira restricao de arrasto no host',
    (type: ColumnType) => {
      const capabilities = generateCapabilities(assertValidSpec(specWithColumnType(type)));
      const role = capabilities.dataRoles[0];
      expect(role).toBeDefined();

      // `date` fica DELIBERADAMENTE de fora: o `valueType` do schema oficial roda
      // com `additionalProperties: false` e nao tem tipo temporal nenhum na
      // lista. Emitir a chave fazia o `pbiviz package` lancar "Invalid
      // capabilities" e quebrava a build inteira de quem ligasse uma coluna de
      // data. `requiredTypes` e opcional no schema; omitir e a saida.
      if (type === 'date') {
        expect(role?.requiredTypes).toBeUndefined();
        return;
      }

      // Percentual e moeda sao FORMATO, nao tipo: no modelo do Power BI os dois
      // sao numero, e exigir outra coisa recusaria a coluna certa.
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
    /*
     * A REGRESSAO DE 2026-08-03, guardada por extenso.
     *
     * O host valida o estado que os pocos TERIAM depois do arrasto contra a
     * lista de condicoes. Uma condicao unica exigindo `min: 1` em todos os
     * papeis descreve so o estado FINAL: o estado apos o primeiro campo — um
     * papel preenchido, o resto vazio — nao satisfaz condicao nenhuma, e o host
     * descarta o drop. Em silencio. O visual nunca sai de zero campos e nada
     * renderiza jamais.
     *
     * Quem responde por "falta campo" e o `EmptyState`, no visual.
     */
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
    // A guarda em texto cru tambem: um `min` aninhado em qualquer outro lugar do
    // mapeamento nao passa pelo laco acima.
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

    // O bloco de categorias, emitido pela primeira vez na spec 5.3.0. `for.in` e
    // nao `bind.to`: agrupamento cria uma LINHA por valor distinto, e e disso
    // que sai o selection id de cada marca.
    expect(mapping.categorical.categories?.select).toEqual([{ for: { in: 'categoria' } }]);
  });

  it('o corte do host e declarado, e bate com o que o visual anuncia', () => {
    /*
     * A DUPLICATA VIGIADA.
     *
     * `CATEGORY_LIMIT` esta escrito em DOIS lugares — `codegen/src/capabilities.ts`
     * e `visual-template/template/src/dataFrame.ts` — e nao ha import ligando os
     * dois: um e do backend que gera o manifesto, o outro compila para dentro do
     * bundle do visual. Enquanto o truncamento era codigo morto, divergir nao
     * custava nada. Agora custa: o host cortaria em N e o rodape anunciaria M, e
     * o visual mentiria sobre o proprio dado sem erro nenhum.
     *
     * Este teste le o fonte do template e compara. E feio de proposito — a
     * alternativa seria um pacote compartilhado so para uma constante.
     */
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
    const match = /CATEGORY_LIMIT\s*=\s*(\d+)/.exec(source);
    expect(match, 'CATEGORY_LIMIT sumiu do template').not.toBeNull();
    expect(Number(match?.[1])).toBe(declared);
  });

  it('uma arvore so de container e texto continua sem pedir campo nenhum', () => {
    // O estado da 5.0.0, agora como afirmacao sobre os tipos que NAO leem dados
    // — e o que garante que um projeto sem KPI gera o mesmo pacote de antes.
    for (const kind of NODE_KINDS.filter((candidate) => !consumesData(candidate))) {
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

/**
 * O painel de formatacao do visual gerado (spec 5.1.0).
 *
 * A afirmacao central desta suite e a PRIMEIRA: sem nada publicado, o pacote e o
 * de antes do Sprint B. Ela e o que permite a todas as outras serem aditivas —
 * e a que falha no dia em que alguem transformar o painel em comportamento
 * padrao, que foi a decisao explicitamente recusada no desenho.
 */
describe('painel de formatacao no visual gerado', () => {
  const publicada = assertValidSpec(specWithExposure());

  /** O primeiro no publicado da fixture e o container; o segundo, o titulo. */
  const objetos = (spec: VisualSpec): Record<string, ExposedObject> =>
    generateCapabilities(spec).objects as Record<string, ExposedObject>;

  it('sem nada publicado, o pacote e identico ao de antes', () => {
    const fechada = assertValidSpec(specWithEveryKind('Nada Publicado'));
    for (const { node } of walk(fechada)) expect(node.exposed).toBeUndefined();

    const capabilities = generateCapabilities(fechada);
    expect(capabilities.objects).toEqual({});
    // A chave AUSENTE, e nao `false`: o gate compara o capabilities do zip com o
    // regerado, e uma chave a mais e uma diferenca.
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
    // O apelido vira o titulo do card; sem apelido, o rotulo do descritor.
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
    // `integer`, e nao `numeric`: meio pixel nao e uma escolha.
    expect(properties.fontSize?.type).toEqual({ integer: true });
    expect(properties.color?.type).toEqual({ fill: { solid: { color: true } } });
    expect(properties.showBackground?.type).toEqual({ bool: true });
    // O rotulo humano do registro chega ao dropdown do Power BI.
    expect(properties.fontWeight?.type).toEqual({
      enumeration: [
        { value: 'normal', displayName: 'Normal' },
        { value: 'medium', displayName: 'Medio' },
        { value: 'semibold', displayName: 'Semi-negrito' },
        { value: 'bold', displayName: 'Negrito' },
      ],
    });
  });

  /**
   * Sem esta chave o painel aparece, o consumidor mexe e NADA muda no visual:
   * com `dataRoles: []`, e ela que faz os valores chegarem ao `update()`. E o
   * modo de falha mais caro deste sprint, porque nao produz erro nenhum.
   */
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

    // Publicado: o valor do autor vira o ULTIMO argumento do `pick`, nao some.
    expect(element).toContain(
      `fontSize={pick(overrides, ${jsString(titulo?.id ?? '')}, "fontSize", 20)}`,
    );
    // Fechado: literal, como sempre. E o que torna "ignorar o override" uma
    // propriedade estrutural do pacote — nao ha por onde ler o `objects` ali.
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
    // A fixture publica embaralhado de proposito.
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
    // `background` so aparece com `showBackground` ligado. Na fixture os dois
    // estao publicados; aqui fica so o governado, e o valor do governante tem de
    // viajar assim mesmo — senao o painel avalia a condicao contra nada.
    const spec = specWithExposure('Governante Fechado');
    const titulo = spec.root.children?.[0];
    if (titulo) titulo.exposed = ['background'];

    const source = generateVisualSource(assertValidSpec(spec), BUILD_ID);
    const table = source.slice(source.indexOf('const FORMATTING'), source.indexOf('function Tree'));

    expect(table).toContain('"showBackground": false');
    expect(table).toContain('"showWhen"');
  });

  it('o apelido do no e o conteudo do texto passam por literal de string', () => {
    // RN-11: os dois sao coisa que o USUARIO escreveu, e nenhum dos dois pode
    // escapar das aspas no fonte gerado.
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
