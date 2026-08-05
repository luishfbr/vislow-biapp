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
import { generateCapabilities, specWithEveryKind } from '@vislow/codegen';
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
function fakeDataView() {
  const values = [
    {
      source: { displayName: 'Receita', roles: { valor: true }, format: '#,0.00' },
      values: [120, 340, 210, 90],
    },
  ];
  return {
    categorical: {
      categories: [
        {
          source: { displayName: 'Regiao', roles: { categoria: true } },
          values: ['Norte', 'Sul', 'Leste', 'Oeste'],
          identity: [0, 1, 2, 3],
        },
      ],
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
  const visual = plugin!.create({ element, host: fakeHost(calls, highContrast) }) as {
    update: (options: unknown) => void;
  };
  visual.update({
    dataViews: withData ? [fakeDataView()] : [],
    viewport: VIEWPORT,
    type: 62,
  });

  // No modo concorrente o React renderiza fora da pilha atual.
  const settle = async (): Promise<string> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return new window.XMLSerializer().serializeToString(element);
  };

  return { html: await settle(), errors, element, window, calls, redraw: settle };
}

/*
 * Aqui vivia `keyboardKeys(element)`, que devolvia os botoes da sobreposicao de
 * teclado (RF-23) na ordem dos pontos da serie. Eram a ponte que tornava o
 * cross-filter TESTAVEL num jsdom: acionar um deles percorria o mesmo caminho
 * de um clique na barra — `FrameHost.select` -> `selectionManager.select` — sem
 * depender do Recharts resolver coordenada de mouse num DOM sem motor de
 * layout.
 *
 * A sobreposicao e dos graficos, e saiu com eles na spec 5.0.0. Ver a
 * quarentena no fim deste arquivo.
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
   * Ate a spec 4.0.0 este teste esperava o `EmptyState` — "Faltam campos para
   * montar o visual" —, porque todo no do catalogo consumia dados e sem coluna
   * ligada nao havia o que desenhar. Nenhum no consome dados na 5.0.0: uma
   * composicao de texto NAO depende do modelo, e exibir "faltam campos" seria
   * mentira. O que a RN-04 continua exigindo e o que se afirma aqui — nunca
   * branco, nunca card de erro.
   *
   * O `EmptyState` continua no kit, sem consumidor, e volta a aparecer com o KPI
   * Card da Fase 4.
   */
  it('sem DataView, desenha a composicao em vez de quebrar', async () => {
    const { html, errors } = await renderCompiled(js, guid, false);

    expect(html).toContain(String(defaultPropsFor('text').content));
    expect(html).not.toContain('RENDER_FAIL');
    expect(html).not.toContain('Não foi possível renderizar o visual');
    expect(errors).toEqual([]);
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
  it('o capabilities do PACOTE nao declara papel — ninguem consome dados', () => {
    // Ate a spec 4.0.0 este teste conferia que os papeis consumidos pela arvore
    // chegavam ao pacote (`['categoria', 'valor']`) — sem isso o usuario nao tem
    // onde arrastar a coluna e o visual fica eternamente vazio. Nenhum no
    // consome dados na 5.0.0, e o visual gerado sai SEM POCO DE CAMPOS no Power
    // BI. Isto e consequencia conhecida da poda, nao descuido: a afirmacao fica
    // registrada aqui e falha no dia em que a Fase 4 devolver o KPI Card.
    expect(embutido.dataRoles).toEqual([]);
    expect(embutido.dataViewMappings).toEqual([]);
  });

  it('o capabilities do PACOTE e exatamente o que o codegen gerou', () => {
    // O `pbiviz` so reescreve capabilities de visual de script. Qualquer outra
    // diferenca aqui e a toolchain mexendo no que nao devia.
    expect(embutido).toEqual(JSON.parse(JSON.stringify(generateCapabilities(spec))));
  });

  /*
   * ============ AS DUAS GUARDAS DE POCO DE CAMPOS ESTAO DORMENTES ============
   * Havia aqui dois testes que so tem sujeito com `dataRoles` no pacote:
   *
   *   - "o capabilities do PACOTE exige o campo do tipo certo" — `requiredTypes`
   *     e o que faz o host RECUSAR o arrasto de uma coluna do tipo errado; sem
   *     ele o tipo escolhido no editor seria so formatacao de preview
   *   - "nenhuma condicao do PACOTE declara `min` — senao os pocos travam" — a
   *     regressao de 2026-08-03, em que os pocos apareciam com o nome certo e
   *     recusavam toda coluna, para sempre, sem erro e sem aviso
   *
   * O codigo dos dois continua em `capabilities.ts`, e o `inspectArtifact` do
   * `pipeline.ts` continua rejeitando `min` em producao. Voltam a ter o que
   * medir com o KPI Card da Fase 4.
   * ==========================================================================
   */

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
   * ========== A PARIDADE DE INTERATIVIDADE ESTA EM QUARENTENA (5.0.0) ========
   * Havia aqui um `describe('paridade de interatividade')` com seis testes — o
   * fecho do Sprint 6 e do achado 53, em que o pacote DESENHAVA certo e nao
   * FILTRAVA nada, sem nenhum teste notar:
   *
   *   - cada ponto da serie alcancavel por teclado, com rotulo legivel (RF-23)
   *   - acionar um ponto filtra o relatorio, com a identidade DAQUELA linha,
   *     `{ key: 'row-1' }` (RF-18)
   *   - o foco pede o tooltip NATIVO com os valores ja formatados pelo `format`
   *     da coluna (RF-19 / RF-17)
   *   - o botao direito abre o menu de contexto do host (RF-24)
   *   - em alto contraste a paleta do host vence, e o SVG le a paleta pelo
   *     quadro em vez de carregar `var()` (RF-21)
   *   - fora do alto contraste nenhuma variavel fica presa no elemento
   *
   * OS SEIS TINHAM O GRAFICO COMO UNICO SUJEITO: a sobreposicao de teclado, as
   * marcas selecionaveis e o `fill` resolvido sao todos dele. Com a poda da
   * 5.0.0 nao ha no que se ligue ao host — `interaction.ts` e `dataFrame.ts`
   * continuam no template, chamados a cada `update()`, mas sem consumidor.
   *
   * A METADE HTML DO ALTO CONTRASTE NAO FICOU DESCOBERTA: `SpecPreview.test.tsx`
   * confere que a cor e o fundo da caixa de texto saem embrulhados em
   * `var(--vislow-hc-*, ...)`, que e o mecanismo inteiro do lado do HTML. O que
   * esta sem cobertura e a ponta SVG, que so existe com grafico.
   *
   * Os seis voltam com o KPI Card da Fase 4. `apps/web/src/components/
   * kitInteraction.test.tsx`, que cobria os mesmos comportamentos no lado do
   * editor, foi apagado pelo mesmo motivo.
   * =========================================================================
   */
});
