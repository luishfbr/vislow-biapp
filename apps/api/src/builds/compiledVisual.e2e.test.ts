/**
 * GATE DE ACEITE do pivo para compilacao real (ADR-08).
 *
 * Compila um `.pbiviz` de verdade a partir de uma spec e **executa o bundle
 * minificado num jsdom**, como o Power BI faz. E o herdeiro direto do
 * `renderRealBundle.test.ts`: foi o unico teste que pegou o achado 39 (React
 * duplicado), porque nenhum teste de fonte enxerga o que o webpack fez com o
 * bundle.
 *
 * Agora ele cobre todo pacote que o backend produz — que era exatamente o
 * combinado do plano.
 *
 * Custa ~15 s e exige o template preparado. NAO ha modo "ignorado": o sufixo
 * `.e2e.test.ts` tira este arquivo da suite rapida (`vitest.config.ts`) e o
 * poe na do gate (`vitest.build.config.ts`), cuja tarefa no turbo declara
 * `stage:vendor` como dependencia. Se ele rodar, o template esta preparado —
 * e se nao estiver, isto lanca no carregamento em vez de passar verde.
 */
import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { join } from 'node:path';
import { assertValidSpec, defaultPropsFor, type VisualSpec } from '@vislow/component-registry';
import { generateCapabilities, specWithEveryKind, specWithExposure } from '@vislow/codegen';
import { inspectPbiviz } from '@vislow/config-schema/packaging';
import { VENDOR_DIR } from '@vislow/visual-template';
import { MAX_JS_BYTES, MAX_PACKAGE_BYTES } from './budgets.js';
import { runBuildPipeline, type BuildOutcome } from './pipeline.js';

if (!existsSync(join(VENDOR_DIR, '@vislow', 'visual-kit', 'dist', 'styles.css'))) {
  throw new Error(
    'Template nao preparado, e este teste nao tem como se ignorar. ' +
      'Rode `pnpm check` — o turbo encadeia build -> stage:vendor -> test:build.',
  );
}

const BUILD_ID = 'e2e00001';

/** Paleta de alto contraste de teste. Valores distintos, para nao se confundirem. */
const HC_PALETTE = {
  foreground: '#ffffff',
  background: '#000000',
  foregroundSelected: '#00ff00',
};

/**
 * O que o host recebeu do visual.
 *
 * O gate do Sprint 4 so perguntava se o visual DESENHAVA. Era o suficiente
 * enquanto o achado 53 nao existia — o pacote desenhava certo e nao filtrava
 * nada, e nenhum teste tinha como notar. Estas gravacoes sao o que fecha esse
 * buraco: o que interessa nao e o que o visual mostra, e o que ele PEDE ao host.
 */
interface HostCalls {
  selections: { identity: unknown; multi: boolean }[];
  contextMenus: number;
  tooltips: { dataItems: { displayName: string; value: string }[] }[];
}

/** Host do Power BI, reduzido ao que o visual gerado realmente usa. */
function fakeHost(calls: HostCalls, highContrast: boolean) {
  return {
    locale: 'pt-BR',
    createSelectionManager: () => ({
      select: (identity: unknown, multi: boolean) => {
        calls.selections.push({ identity, multi });
        return Promise.resolve([identity]);
      },
      getSelectionIds: () => [],
      showContextMenu: () => {
        calls.contextMenus += 1;
      },
      registerOnSelectCallback: () => undefined,
    }),
    createSelectionIdBuilder: () => {
      let row = -1;
      const builder = {
        withCategory: (_category: unknown, index: number) => {
          row = index;
          return builder;
        },
        // Identidade distinta por linha: com um id unico para todas, um clique
        // na terceira barra passaria por selecao da primeira e o teste
        // aprovaria o bug que ele existe para pegar.
        createSelectionId: () => ({ key: `row-${String(row)}` }),
      };
      return builder;
    },
    colorPalette: highContrast
      ? {
          isHighContrast: true,
          foreground: { value: HC_PALETTE.foreground },
          background: { value: HC_PALETTE.background },
          foregroundSelected: { value: HC_PALETTE.foregroundSelected },
        }
      : { isHighContrast: false },
    tooltipService: {
      show: (options: { dataItems: { displayName: string; value: string }[] }) => {
        calls.tooltips.push({ dataItems: options.dataItems });
      },
      hide: () => undefined,
    },
  };
}

/**
 * `DataView` com os papeis que a spec de teste declara.
 *
 * Os nomes de papel sao os do USUARIO (`categoria`, `valor`), nao os fixos do
 * runtime antigo — e essa troca que o pivo trouxe.
 */
function fakeDataView(rowCount = 1) {
  /*
   * O BLOCO `categories` EXISTE DESDE A SPEC 5.3.0.
   *
   * Ate a Lista de Ranking nenhum descritor declarava papel de agrupamento, o
   * mapeamento gerado nao pedia categoria e o host nao a entregaria — um bloco
   * aqui teria feito o harness ser mais generoso que o Power BI. Agora o
   * mapeamento PEDE `categorical.categories`, e nao entrega-lo e que seria
   * mentir sobre o host.
   *
   * `identity` por linha, e distinta: e dela que sai o selection id, e com um id
   * unico para todas um clique na terceira linha passaria por selecao da
   * primeira — o teste aprovaria o bug que existe para pegar.
   */
  const categories = [
    {
      source: { displayName: 'Categoria', roles: { categoria: true } },
      values: Array.from({ length: rowCount }, (_, i) => `Categoria ${String(i + 1)}`),
      identity: Array.from({ length: rowCount }, (_, i) => ({ key: `identity-${String(i)}` })),
    },
  ];

  /*
   * UMA linha por padrao, e isso e deliberado.
   *
   * Com uma linha so, `sumOf` reusa o `formatted` do host e o teste do KPI mede
   * o `valueFormatter` de verdade — que e onde vive o achado aberto da RF-17.
   * Com mais de uma ele cai no `Intl`, que formata em pt-BR CORRETAMENTE e
   * portanto ESCONDERIA o achado. Quem precisa de varias linhas pede.
   *
   * O `format` da coluna e o que faz o `valueFormatter` devolver `1.234,57` em
   * vez de `1234.5678`. Sem ele o teste passaria com o numero cru.
   */
  const medida = (base: number): number[] =>
    rowCount === 1 ? [base] : Array.from({ length: rowCount }, (_, i) => i + 1);

  const values = [
    {
      source: { displayName: 'Receita', roles: { valor: true }, format: '#,0.00' },
      values: medida(1084320),
    },
    {
      source: { displayName: 'Meta', roles: { meta: true }, format: '#,0.00' },
      values: medida(1000000),
    },
  ];
  return {
    categorical: {
      categories,
      values: Object.assign(values, { grouped: () => [] }),
    },
    metadata: { columns: [] },
  };
}

interface RenderOutcome {
  /** Serializado com `XMLSerializer`: a RN-11 proibe `innerHTML` no monorepo. */
  html: string;
  errors: string[];
  /** O elemento do visual, ainda vivo: e nele que os testes interagem. */
  element: Element;
  window: JSDOM['window'];
  calls: HostCalls;
  /** Re-serializa depois de uma interacao. */
  redraw: () => Promise<string>;
  /**
   * A instancia do visual compilado.
   *
   * E por ela que o gate alcanca o painel de formatacao: `getFormattingModel()`
   * e um metodo do visual, nao algo que apareca no DOM. Sem isto, a unica prova
   * de que o painel existe seria abrir o Power BI.
   */
  visual: CompiledVisual;
}

/** O que o gate usa do visual compilado. */
interface CompiledVisual {
  update: (options: unknown) => void;
  getFormattingModel?: () => { cards: unknown[] };
}

const VIEWPORT = { width: 800, height: 600 };
const CHART_BOX = { width: 800, height: 150 };

/**
 * Da tamanho ao jsdom.
 *
 * O jsdom nao tem motor de layout: todo elemento mede 0x0 e nao existe
 * `ResizeObserver`. O `ResponsiveContainer` do Recharts depende dos dois, entao
 * sem isto os graficos montam e desenham NADA — e o teste passaria achando que
 * esta tudo bem, justamente na parte que o achado 39 quebrou.
 *
 * Equipar o harness em vez de afrouxar a assertiva: o que se quer provar e que o
 * grafico desenha quando tem espaco, e essa e a condicao real dentro do Power BI.
 */
function installLayout(window: JSDOM['window']): void {
  class ImmediateResizeObserver {
    constructor(private readonly callback: (entries: unknown[], observer: unknown) => void) {}

    public observe(target: Element): void {
      const entry = { target, contentRect: { ...CHART_BOX, top: 0, left: 0, x: 0, y: 0 } };
      // Sincrono E em microtask: o Recharts le a medida na montagem em algumas
      // versoes e no efeito em outras.
      this.callback([entry], this);
      queueMicrotask(() => {
        this.callback([entry], this);
      });
    }
    public unobserve(): void {
      /* nada a desfazer: a medida e fixa */
    }
    public disconnect(): void {
      /* idem */
    }
  }

  Object.assign(window, { ResizeObserver: ImmediateResizeObserver });

  for (const [property, value] of [
    ['offsetWidth', CHART_BOX.width],
    ['offsetHeight', CHART_BOX.height],
    ['clientWidth', CHART_BOX.width],
    ['clientHeight', CHART_BOX.height],
  ] as const) {
    Object.defineProperty(window.HTMLElement.prototype, property, {
      configurable: true,
      get: () => value,
    });
  }

  window.HTMLElement.prototype.getBoundingClientRect = function boundingRect() {
    return {
      ...CHART_BOX,
      top: 0,
      left: 0,
      bottom: CHART_BOX.height,
      right: CHART_BOX.width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
}

async function renderCompiled(
  js: string,
  guid: string,
  withData: boolean,
  highContrast = false,
  /**
   * O que o consumidor do relatorio escolheu no painel de formatacao.
   *
   * Chega ao visual pelo mesmo caminho do Power BI — `metadata.objects` do
   * DataView —, que e o que faz este teste valer alguma coisa: um atalho por
   * dentro provaria so que a funcao de merge funciona.
   */
  objects?: Record<string, Record<string, unknown>>,
  /**
   * Quantas categorias o host entrega. Uma por padrao — ver `fakeDataView`.
   *
   * Quem testa cross-filter pede varias: com uma linha so, "selecionou a
   * categoria certa" e indistinguivel de "selecionou a unica que havia".
   */
  rowCount?: number,
): Promise<RenderOutcome> {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => errors.push(error.message));
  virtualConsole.on('error', (...args: unknown[]) =>
    errors.push(args.map((a) => String(a)).join(' ')),
  );

  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  installLayout(window);

  Object.assign(window, {
    powerbi: { visuals: { plugins: {} }, extensibility: { visual: {} } },
  });
  window.eval(js);

  const plugins = (
    window as unknown as {
      powerbi: { visuals: { plugins: Record<string, { create: (o: unknown) => unknown }> } };
    }
  ).powerbi.visuals.plugins;

  const plugin = plugins[guid];
  expect(plugin, `plugin ${guid} nao registrado no bundle`).toBeDefined();

  const element = window.document.getElementById('host')!;
  const calls: HostCalls = { selections: [], contextMenus: 0, tooltips: [] };
  const visual = plugin!.create({
    element,
    host: fakeHost(calls, highContrast),
  }) as CompiledVisual;
  visual.update({
    // Sem papel declarado o host ainda entrega um DataView so com metadados —
    // e para isso que o capabilities gerado declara `supportsEmptyDataView`.
    dataViews: withData
      ? [fakeDataView(rowCount)]
      : objects
        ? [{ metadata: { columns: [], objects } }]
        : [],
    viewport: VIEWPORT,
    type: 62,
  });

  // No modo concorrente o React renderiza fora da pilha atual.
  const settle = async (): Promise<string> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return new window.XMLSerializer().serializeToString(element);
  };

  return { html: await settle(), errors, element, window, calls, redraw: settle, visual };
}

/*
 * Aqui vivia `keyboardKeys(element)`, que devolvia os botoes da sobreposicao de
 * teclado (RF-23) na ordem dos pontos da serie. Eram a ponte que tornava o
 * cross-filter TESTAVEL num jsdom: acionar um deles percorria o mesmo caminho
 * de um clique na barra — `FrameHost.select` -> `selectionManager.select` — sem
 * depender do Recharts resolver coordenada de mouse num DOM sem motor de
 * layout.
 *
 * A sobreposicao e dos graficos, e saiu com eles na spec 5.0.0. O KPI Card nao a
 * traz de volta: ele e UM elemento focalizavel, nao uma serie de pontos, e sem
 * papel de agrupamento nao ha identidade para acionar. Ver o bloco de paridade no
 * fim deste arquivo — o teclado voltou como "alcancavel e rotulado", e o
 * cross-filter continua sem sujeito.
 */

describe('spec compilada vira um .pbiviz que renderiza', () => {
  let spec: VisualSpec;
  let outcome: BuildOutcome;
  let js: string;
  let guid: string;
  /** O capabilities LIDO DO ZIP — nao o regerado em memoria. */
  let embutido: {
    dataRoles: { name: string; kind: string; requiredTypes?: unknown }[];
    dataViewMappings: { conditions?: Record<string, unknown>[] }[];
  };

  beforeAll(async () => {
    spec = assertValidSpec(specWithEveryKind('Vendas por Região 🚀'));
    outcome = await runBuildPipeline(spec, BUILD_ID);
    const inspection = await inspectPbiviz(outcome.artifact);
    js = inspection.js;
    guid = inspection.packageIdentity.guid;
    embutido = inspection.capabilities as typeof embutido;
  }, 300_000);

  it('a identidade nasce do projeto, sem reescrita (ADR-08)', () => {
    expect(guid).toBe(spec.project.id);
    // O GUID e nome de variavel JS no visualPlugin.ts gerado, nao um UUID.
    expect(new RegExp(`var ${guid}\\b`).test(js)).toBe(true);
  });

  it('o nome do arquivo e o nome que o usuario deu', () => {
    expect(outcome.fileName).toBe('Vendas por Região 🚀.pbiviz');
  });

  it('cabe nos orcamentos rigidos do Power BI', () => {
    expect(outcome.packageBytes).toBeLessThan(MAX_PACKAGE_BYTES);
    expect(outcome.jsBytes).toBeLessThan(MAX_JS_BYTES);
  });

  /** ADR-02: sem o CSS pre-compilado o visual importa e sai sem estilo nenhum. */
  it('leva o CSS do visual-kit no bundle', () => {
    expect(js).toContain('vsl-');
  });

  /**
   * RN-04, o invariante mais caro do projeto: com dados, o visual mostra DADOS —
   * nunca o card de erro, nunca tela branca. Foi assim que o achado 39
   * apareceu: o bundle carregava, o KPI renderizava e o grafico caia no
   * ErrorBoundary.
   */
  it('renderiza a composicao, e nao o card de erro', async () => {
    const { html, errors } = await renderCompiled(js, guid, true);

    expect(html).not.toContain('Não foi possível renderizar o visual');
    expect(html).not.toContain('RENDER_FAIL');
    expect(html.length).toBeGreaterThan(300);
    // O conteudo da caixa de texto atravessou codegen, webpack e `pbiviz
    // package` e chegou ao DOM.
    expect(html).toContain(String(defaultPropsFor('text').content));
    // A tipografia e NOSSA, nao herdada do host: a classe que carrega a familia
    // e o `tabular-nums` esta no elemento.
    expect(html).toContain('vsl-text');
    expect(errors).toEqual([]);
  }, 60_000);

  /**
   * A geometria sobrevive a toolchain inteira.
   *
   * A fixture posiciona cada tipo de no numa faixa, e a caixa e percentual em
   * `style` inline. Nada no caminho — codegen, webpack, `pbiviz package` —
   * reclamaria se ela sumisse: o visual so voltaria a empilhar, com todos os nos
   * amontoados no canto. Esta e a unica assertiva do projeto que prova que um no
   * posicionado no editor sai posicionado do compilador.
   */
  it('o no posicionado chega ao DOM compilado com a caixa da spec', async () => {
    const { html } = await renderCompiled(js, guid, true);
    const rects = spec.root.children!.map((child) => child.rect!);

    expect(rects.length).toBeGreaterThan(1);
    for (const rect of rects) {
      expect(html).toContain(`top: ${String(rect.y)}%`);
      expect(html).toContain(`height: ${String(rect.h)}%`);
    }
    // E o container que as contem virou bloco de contencao — sem isto as caixas
    // se posicionariam contra a janela, nao contra o visual.
    expect(html).toContain('vsl-canvas');
  }, 60_000);

  /**
   * O contrario do que este teste afirmava ate 2026-08-03.
   *
   * O selo de build no canto saiu a pedido: o visual nao deve escrever um hash
   * sobre o relatorio de quem o usa. A assertiva vira o inverso para o selo nao
   * voltar por descuido — e para registrar que o `buildId` deixou de ser
   * legivel da tela no caminho de sucesso. Ele continua no bundle e no card de
   * erro de renderizacao (achado 40).
   */
  it('nao carimba a impressao digital do build na tela', async () => {
    const { html } = await renderCompiled(js, guid, true);
    expect(html).not.toContain(BUILD_ID);
    // No bundle ele continua, e e de la que se identifica um pacote.
    expect(js).toContain(BUILD_ID);
  }, 60_000);

  /**
   * RN-04 do outro lado: SEM DataView nenhum, o visual continua desenhando.
   *
   * A arvore tem os dois casos ao mesmo tempo, e e por isso que este teste mede
   * os dois: a caixa de texto NAO depende do modelo e desenha o conteudo do
   * autor; o KPI depende, e cai no `EmptyState` orientando qual campo arrastar
   * (RF-20). Exibir "faltam campos" sobre a composicao inteira seria mentira, e
   * desenhar um KPI em branco seria a tela branca que a RN-04 proibe.
   */
  it('sem DataView, o texto desenha e o KPI pede o campo', async () => {
    const { html, errors } = await renderCompiled(js, guid, false);

    expect(html).toContain(String(defaultPropsFor('text').content));
    expect(html).toContain('Faltam campos para montar o visual');
    expect(html).not.toContain('RENDER_FAIL');
    expect(html).not.toContain('Não foi possível renderizar o visual');
    expect(errors).toEqual([]);
  }, 60_000);

  /**
   * COM DataView, o numero chega a tela — formatado pelo host.
   *
   * A outra metade do estado vazio, e a que prova que a via de dados esta
   * inteira: `capabilities` -> `matchRoles` -> `readDataFrame` -> `sumOf` -> DOM.
   * Cada elo desses esteve dormente entre a 5.0.0 e a 5.2.0.
   */
  it('com DataView, o KPI desenha o valor formatado e a variacao', async () => {
    const { html } = await renderCompiled(js, guid, true);
    const figura = /vsl-kpi-figure[^>]*>([^<]*)</.exec(html)?.[1] ?? '';

    /*
     * ================== ACHADO ABERTO: O SEPARADOR NAO E O DO LOCALE =========
     * O `format` da coluna CHEGA — agrupamento de milhar e duas casas decimais —,
     * mas os separadores saem em `en-US` mesmo com `host.locale === 'pt-BR'`.
     *
     * A causa esta no `powerbi-visuals-utils-formattingutils`: o
     * `formattingService.getCulture` chama `Globalize.findClosestCulture`, e as
     * culturas so existem se `lib/globalize/globalize.cultures` for importado —
     * o que ninguem faz. Sem elas, ele cai em `Globalize.culture("en-US")`.
     * Importar o modulo custaria 1,17 MB de tabela de locales e estouraria o
     * orcamento de 1 MB do `content.js` (RNF-04).
     *
     * NAO E REGRESSAO DESTE SPRINT: o caminho e o mesmo desde a spec 3.0.0. Ficou
     * invisivel porque o teste equivalente da 4.x media `120` — abaixo de mil,
     * sem separador nenhum para errar. O KPI trouxe um numero grande e o expos.
     *
     * A assertiva abaixo afirma o que e VERDADE hoje e nao congela o defeito: ela
     * exige que o formato tenha sido aplicado, sem afirmar qual separador esta
     * certo. A escolha entre pagar o bundle, trocar o `valueFormatter` por `Intl`
     * ou aceitar `en-US` e do produto, e a RF-17 continua descoberta ate la.
     * =========================================================================
     */
    expect(figura, 'o formato da coluna nao foi aplicado').toMatch(/^1[.,]084[.,]320[.,]00$/);

    // A variacao usa `Intl` com o locale do quadro, e essa metade sai em pt-BR.
    expect(html).toContain('▲');
    expect(html).toContain('+84.320');
    expect(html).toContain('vs Meta');
    expect(html).not.toContain('Faltam campos para montar o visual');
  }, 60_000);

  /**
   * O `capabilities.json` DE DENTRO DO PACOTE e o que o Power BI le para montar
   * o painel de campos. Se ele nao declarar os papeis que a arvore consome, o
   * usuario nao tem onde arrastar a coluna — e o visual fica eternamente vazio.
   *
   * Ler do zip, e nao chamar `generateCapabilities` de novo, e o ponto: a versao
   * anterior deste teste comparava o codegen consigo mesmo e por isso passava
   * verde enquanto o pacote entregue recusava todo arrasto no Desktop.
   */
  it('o capabilities do PACOTE declara os papeis que a arvore consome', () => {
    // O POCO DE CAMPOS VOLTOU na spec 5.2.0 com o KPI (duas medidas) e ganhou a
    // CATEGORIA na 5.3.0, com a Lista de Ranking. Entre a poda da 5.0.0 e o KPI
    // este teste afirmava `dataRoles: []`, e era essa afirmacao que sinalizava a
    // hora de descongelar o resto do arquivo. Sinalizou duas vezes.
    expect(embutido.dataRoles.map((role) => role.name)).toEqual(['categoria', 'valor', 'meta']);
    expect(embutido.dataViewMappings).toHaveLength(1);

    // `Grouping` DENTRO DO ZIP. E o que faz o host entregar `categories`, sem o
    // que nao ha selection id — e portanto nao ha cross-filter nenhum.
    const kinds = Object.fromEntries(embutido.dataRoles.map((role) => [role.name, role.kind]));
    expect(kinds.categoria).toBe('Grouping');
  });

  it('o capabilities do PACOTE e exatamente o que o codegen gerou', () => {
    // O `pbiviz` so reescreve capabilities de visual de script. Qualquer outra
    // diferenca aqui e a toolchain mexendo no que nao devia.
    expect(embutido).toEqual(JSON.parse(JSON.stringify(generateCapabilities(spec))));
  });

  it('o capabilities do PACOTE exige o campo do tipo certo', () => {
    // `requiredTypes` e o que faz o host RECUSAR o arrasto de uma coluna do tipo
    // errado — a coluna nem chega ao poco. Sem ele, o tipo escolhido no editor
    // seria so formatacao de preview.
    //
    // A fixture cobre os DOIS extremos: `text` e o mais estreito do lado do
    // agrupamento, `integer` o mais estreito do lado da medida — e `integer` e
    // mais estreito que `numeric` de proposito, porque quem marcou a coluna como
    // inteiro disse que casas decimais nao servem.
    const required = Object.fromEntries(
      embutido.dataRoles.map((role) => [role.name, role.requiredTypes]),
    );
    expect(required).toEqual({
      categoria: [{ text: true }],
      valor: [{ integer: true }],
      meta: [{ integer: true }],
    });
  });

  it('nenhuma condicao do PACOTE declara `min` — senao os pocos travam', () => {
    // A regressao de 2026-08-03, medida onde importa: DENTRO do zip. O host
    // valida o estado que os pocos teriam depois do arrasto, e uma condicao
    // exigindo `min: 1` em todos os papeis descreve so o estado final — o estado
    // apos o primeiro campo nao satisfaz condicao nenhuma, e o drop e descartado
    // em silencio. O visual nunca sai de zero campos.
    expect(JSON.stringify(embutido.dataViewMappings)).not.toContain('"min"');
    for (const condition of embutido.dataViewMappings[0]?.conditions ?? []) {
      for (const [role, limit] of Object.entries(condition)) {
        expect(limit, role).toEqual({ max: 1 });
      }
    }
  });

  /**
   * OS VALORES DA TABELA DE EXEMPLO NAO ESTAO NO PACOTE.
   *
   * O teste do codegen ja garante isso no fonte gerado; este garante no BUNDLE
   * MINIFICADO, que e o que o usuario distribui. Sao coisas diferentes: um
   * `import` novo, um `default` de componente ou uma constante inlinada pelo
   * webpack passariam pelo primeiro e apareceriam aqui.
   *
   * O que esta em jogo nao e so a estetica de "visual que mente sobre o proprio
   * dado": os numeros que o usuario digita no editor sao dele, e o `.pbiviz` e
   * um arquivo que ele distribui para outras pessoas.
   */
  it('os valores de exemplo nao viajam dentro do bundle compilado', () => {
    for (const row of spec.data.rows) {
      for (const cell of row) {
        if (cell === null) continue;
        expect(js, `o bundle carrega ${String(cell)}`).not.toContain(String(cell));
      }
    }
  });

  /**
   * RF-21 — a unica das seis capacidades do Sprint 6 que NAO foi para a
   * quarentena, porque `Container` e `TextBox` continuam passando cor e fundo
   * por `hcInk`/`hcSurface`.
   *
   * A variavel CSS no elemento raiz e o mecanismo inteiro do lado do HTML. Ela
   * e escrita por `applyHighContrast`, dentro de `readFrame` — e por isso o
   * `update()` continua chamando `readFrame` mesmo sem papel nenhum declarado.
   * Tirar essa chamada por parecer inutil desligaria o alto contraste em
   * silencio.
   */
  it('em alto contraste, a paleta do host chega ao elemento raiz', async () => {
    const { element } = await renderCompiled(js, guid, true, true);
    const style = (element as HTMLElement).style;

    expect(style.getPropertyValue('--vislow-hc-ink')).toBe(HC_PALETTE.foreground);
    expect(style.getPropertyValue('--vislow-hc-surface')).toBe(HC_PALETTE.background);
  }, 60_000);

  it('fora do alto contraste, nenhuma variavel fica presa no elemento', async () => {
    const { element } = await renderCompiled(js, guid, true);
    expect((element as HTMLElement).style.getPropertyValue('--vislow-hc-ink')).toBe('');
  }, 60_000);

  /*
   * ================= A PARIDADE DE INTERATIVIDADE, INTEIRA ==================
   * Este bloco fechava o Sprint 6 e o achado 53 — o pacote DESENHAVA certo e nao
   * FILTRAVA nada, sem nenhum teste notar. Foi para a quarentena na 5.0.0 porque
   * os seis testes tinham o GRAFICO como unico sujeito, e o KPI Card devolveu
   * so tres deles: um card de numero unico nao tem marca para clicar.
   *
   * A Lista de Ranking (spec 5.3.0) devolve os que faltavam. Sobra UM item
   * declarado, e ele nao tem sujeito por construcao:
   *
   *   - a ponta SVG do alto contraste. `var()` nao e substituido em atributo de
   *     apresentacao de SVG, e por isso um no que desenhe SVG precisa resolver a
   *     paleta por `hostOf(frame).highContrast`. Os tres nos de dados de hoje
   *     — KPI, Lista — sao HTML puro, e HTML usa a variavel. Volta com o
   *     primeiro no que emitir SVG (o grafico de barras com eixo).
   * =========================================================================
   */
  describe('paridade de interatividade', () => {
    it('o card e alcancavel por teclado e rotulado (RF-23)', async () => {
      const { element } = await renderCompiled(js, guid, true);
      const card = element.querySelector('.vsl-kpi');

      expect(card, 'o KPI nao chegou ao DOM do pacote').not.toBeNull();
      expect(card?.getAttribute('tabindex')).toBe('0');
      // Rotulado, senao o leitor de tela anuncia um grupo sem nome. O rotulo cai
      // no titulo da coluna quando o autor nao escreveu um.
      expect(card?.getAttribute('aria-label')).toBe('Receita');
    }, 60_000);

    it('o foco pede o tooltip NATIVO ja formatado (RF-19 / RF-17)', async () => {
      const { element, calls, window } = await renderCompiled(js, guid, true);
      const card = element.querySelector('.vsl-kpi')!;

      // `focusin`, e nao `focus`: o React delega no elemento raiz, e desde o 17
      // e a versao que borbulha que ele escuta. Um `focus` aqui nao chega ao
      // `onFocus` do componente e o teste passaria por engano se fosse negativo.
      card.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.tooltips).toHaveLength(1);
      const items = calls.tooltips[0]?.dataItems ?? [];
      expect(items.map((item) => item.displayName)).toEqual(['Receita', 'Meta']);
      // FORMATADO pelo `format` da coluna, e nao o numero cru — que e o que a
      // RF-17 pede. O separador ainda sai em `en-US`: ver o achado aberto no
      // teste "com DataView, o KPI desenha o valor formatado e a variacao".
      expect(items[0]?.value).toMatch(/^1[.,]084[.,]320[.,]00$/);
    }, 60_000);

    it('o botao direito abre o menu de contexto do host (RF-24)', async () => {
      const { element, calls, window } = await renderCompiled(js, guid, true);

      element.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // O ouvinte esta no ELEMENTO do visual, e nao no no — entao ele vale para
      // qualquer composicao, inclusive uma so de texto.
      expect(calls.contextMenus).toBe(1);
    }, 60_000);

    /*
     * ================== O TESTE QUE FECHA O ACHADO 53 =========================
     * O achado 53 foi um pacote que DESENHAVA certo e nao FILTRAVA nada, com
     * toda a suite verde. A licao ficou escrita no `fakeHost`: o que interessa
     * nao e o que o visual mostra, e sim o que ele PEDE AO HOST.
     *
     * Este e o primeiro teste do repo a exercitar isso ponta a ponta num pacote
     * REAL: clique no DOM -> `FrameHost.select` -> `Interaction.select` ->
     * `buildIdentities` -> `selectionManager.select`, tudo dentro do
     * `content.js` MINIFICADO. Esteve sem sujeito desde a spec 5.0.0.
     * =========================================================================
     */
    it('acionar uma linha filtra o relatorio com a identidade DAQUELA categoria (RF-18)', async () => {
      // Tres categorias com valores 1, 2 e 3: a ordenacao padrao e decrescente,
      // entao a PRIMEIRA linha desenhada e a ULTIMA do quadro. Um `sort` que
      // reindexasse — ou um `buildIdentities` que devolvesse sempre o mesmo id —
      // filtraria a categoria errada, e so aqui isso apareceria.
      const { element, calls, window } = await renderCompiled(js, guid, true, false, undefined, 3);
      const rows = element.querySelectorAll('.vsl-rank-row');
      expect(rows, 'a Lista de Ranking nao chegou ao DOM do pacote').toHaveLength(3);

      rows[0]!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.selections).toHaveLength(1);
      expect(calls.selections[0]?.identity).toEqual({ key: 'row-2' });
      expect(calls.selections[0]?.multi).toBe(false);
    }, 60_000);

    it('Ctrl+clique pede selecao MULTIPLA, como nos visuais nativos (RF-18)', async () => {
      const { element, calls, window } = await renderCompiled(js, guid, true, false, undefined, 3);
      const rows = element.querySelectorAll('.vsl-rank-row');

      rows[1]!.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.selections[0]?.multi).toBe(true);
    }, 60_000);

    it('a linha e um BOTAO acionavel, e nao so alcancavel (RF-23)', async () => {
      // A diferenca contra o KPI, que e `role="group"`: la nao ha identidade
      // para selecionar e um `button` prometeria uma acao inexistente. Aqui a
      // acao existe, e `aria-pressed` diz que ela e um ALTERNADOR.
      const { element } = await renderCompiled(js, guid, true, false, undefined, 3);
      const row = element.querySelector('.vsl-rank-row');

      expect(row?.getAttribute('role')).toBe('button');
      expect(row?.getAttribute('tabindex')).toBe('0');
      expect(row?.getAttribute('aria-pressed')).toBe('false');
      expect(row?.getAttribute('aria-label')).toContain('Categoria');
    }, 60_000);

    it('o teclado aciona a mesma via do clique (RF-23 / RF-18)', async () => {
      const { element, calls, window } = await renderCompiled(js, guid, true, false, undefined, 3);
      const row = element.querySelector('.vsl-rank-row')!;

      row.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.selections).toHaveLength(1);
      expect(calls.selections[0]?.identity).toEqual({ key: 'row-2' });
    }, 60_000);

    it('acima do corte do host, o visual avisa que truncou (RF-25)', async () => {
      /*
       * `truncationOf` so dispara com `column.category` presente E
       * `values.length >= CATEGORY_LIMIT`. Sem no de agrupamento a primeira
       * condicao nunca era verdadeira, e o aviso era codigo morto desde o
       * Sprint 6 — emitido pelo `visual.tsx` gerado e jamais renderizado.
       *
       * Mil categorias e o proprio `dataReductionAlgorithm` que o capabilities
       * declara. A Lista desenha so `maxRows` delas; o aviso fala do conjunto.
       */
      const { html } = await renderCompiled(js, guid, true, false, undefined, 1000);
      expect(html).toContain('Exibindo 1000 de mais de 1000 categorias');
    }, 60_000);
  });
});

/**
 * O PAINEL DE FORMATACAO, no pacote compilado (spec 5.1.0).
 *
 * Um segundo `.pbiviz` de verdade, e nao uma variacao do primeiro: a afirmacao
 * que sustenta o sprint e que um projeto SEM publicacao continua gerando o
 * pacote de antes — e ela so vale se o pacote sem publicacao for compilado como
 * estava. O `specWithEveryKind` do bloco acima e esse baseline.
 *
 * O que so este bloco alcanca:
 *
 *   1. `getFormattingModel()` existe no bundle MINIFICADO e devolve os cards. O
 *      teste de fonte prova que o codegen emite a chamada; so aqui se sabe que
 *      ela sobreviveu ao webpack e que a tabela emitida casa com os tipos do
 *      `formatting.ts` — o `pbiviz package` compila com verificacao de tipos, e
 *      uma forma errada reprovaria a build inteira antes deste teste rodar;
 *   2. o valor escolhido pelo consumidor chega ao DOM pelo caminho do host —
 *      `metadata.objects` — com `dataRoles` vazio.
 *
 * O QUE ELE NAO ALCANCA, e vale dizer por extenso: o host de teste entrega o
 * DataView que o teste montou, entao ele nao depende do `supportsEmptyDataView`.
 * Quem morde se essa chave sumir e a assertiva sobre o capabilities LIDO DO ZIP,
 * logo abaixo — dentro do Power BI de verdade, sem ela o painel aparece, o
 * consumidor mexe e nada chega ao `update()`. E o item MT-15 da matriz manual.
 */
describe('o pacote compilado leva o painel de formatacao', () => {
  let spec: VisualSpec;
  let js: string;
  let guid: string;
  let embutido: { objects: Record<string, unknown>; supportsEmptyDataView?: boolean };
  /** O no de texto da fixture — o que publica sete campos. */
  let textoId: string;

  beforeAll(async () => {
    spec = assertValidSpec(specWithExposure('Painel Publicado'));
    textoId = spec.root.children?.[0]?.id ?? '';
    const outcome = await runBuildPipeline(spec, BUILD_ID);
    const inspection = await inspectPbiviz(outcome.artifact);
    js = inspection.js;
    guid = inspection.packageIdentity.guid;
    embutido = inspection.capabilities as typeof embutido;
  }, 300_000);

  it('o capabilities do PACOTE declara os objects e o supportsEmptyDataView', () => {
    // Lido do ZIP, nao regerado em memoria: e a unica leitura que prova o que
    // o Power BI vai receber.
    expect(Object.keys(embutido.objects)).toContain(textoId);
    expect(embutido.supportsEmptyDataView).toBe(true);
    expect(embutido).toEqual(generateCapabilities(spec));
  });

  it('getFormattingModel devolve os cards do bundle minificado', async () => {
    const { visual, errors } = await renderCompiled(js, guid, false, false, {});
    const model = visual.getFormattingModel?.();

    expect(model).toBeDefined();
    // Dois nos publicam: o container (sem apelido) e a caixa de texto.
    expect(model?.cards).toHaveLength(2);

    const cards = (model?.cards ?? []) as { uid: string; displayName: string }[];
    expect(cards.map((card) => card.uid)).toContain(textoId);
    expect(cards.map((card) => card.displayName)).toEqual(['Container', 'Titulo do painel']);
    expect(errors).toEqual([]);
  }, 60_000);

  it('o campo escondido pelo showWhen nao vira slice — e volta quando ligam o governante', async () => {
    const { visual } = await renderCompiled(js, guid, false, false, {});
    const slices = (model: unknown): string[] =>
      (((model as { cards: { uid: string; groups: { slices: { uid: string }[] }[] }[] }).cards.find(
        (card) => card.uid === textoId,
      )?.groups[0]?.slices ?? []) as { uid: string }[]).map((slice) => slice.uid);

    expect(slices(visual.getFormattingModel?.())).not.toContain(`${textoId}-background`);

    visual.update({
      dataViews: [{ metadata: { columns: [], objects: { [textoId]: { showBackground: true } } } }],
      viewport: VIEWPORT,
      type: 62,
    });
    expect(slices(visual.getFormattingModel?.())).toContain(`${textoId}-background`);
  }, 60_000);

  it('o que o consumidor escolhe chega ao DOM, sem poco de campos', async () => {
    const escolhido = 'Texto trocado no relatorio';
    const { html, errors } = await renderCompiled(js, guid, false, false, {
      [textoId]: { content: escolhido, color: { solid: { color: '#ff0000' } } },
    });

    expect(html).toContain(escolhido);
    // O valor do autor saiu da tela: o override venceu de verdade.
    expect(html).not.toContain('Receita total');
    expect(html).toContain('#ff0000');
    expect(errors).toEqual([]);
  }, 60_000);

  it('valor invalido vindo do host cai no valor do autor, sem quebrar a tela', async () => {
    // O padrao de falha desta toolchain e o silencio: um `fontSize` que nao e
    // numero viraria `NaN` no `style` inline e o texto sumiria sem erro.
    const { html, errors } = await renderCompiled(js, guid, false, false, {
      [textoId]: { fontSize: 'gigante', color: { solid: { color: 'vermelho' } } },
    });

    expect(html).toContain('Receita total');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Não foi possível renderizar o visual');
    expect(errors).toEqual([]);
  }, 60_000);

  it('o campo NAO publicado ignora o override — e propriedade estrutural', async () => {
    // `padding` da caixa de texto ficou fechado na fixture: o valor do autor
    // esta literal no JSX e nao ha por onde ler o `objects` naquela posicao.
    const { html } = await renderCompiled(js, guid, false, false, {
      [textoId]: { padding: 99 },
    });

    expect(html).not.toContain('padding: 99px');
    expect(html).toContain(`padding: ${String(defaultPropsFor('text').padding)}px`);
  }, 60_000);
});
