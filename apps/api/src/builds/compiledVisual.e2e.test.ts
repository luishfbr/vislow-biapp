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
import { assertValidSpec, type VisualSpec } from '@vislow/component-registry';
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

/**
 * Os botoes da sobreposicao de teclado (RF-23), na ordem dos pontos.
 *
 * Sao a ponte que torna o cross-filter TESTAVEL num jsdom: acionar um deles
 * percorre o mesmo caminho de um clique na barra — `FrameHost.select` ->
 * `selectionManager.select` — sem depender do Recharts resolver coordenada de
 * mouse num DOM sem motor de layout. O que sobra para o Desktop e so o gesto
 * do mouse, que a matriz MT cobre.
 */
function keyboardKeys(element: Element): NodeListOf<Element> {
  return element.querySelectorAll('[role="group"] button');
}

describe('spec compilada vira um .pbiviz que renderiza', () => {
  let spec: VisualSpec;
  let outcome: BuildOutcome;
  let js: string;
  let guid: string;

  beforeAll(async () => {
    spec = assertValidSpec(specWithEveryKind('Vendas por Região 🚀'));
    outcome = await runBuildPipeline(spec, BUILD_ID);
    const inspection = await inspectPbiviz(outcome.artifact);
    js = inspection.js;
    guid = inspection.packageIdentity.guid;
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
    expect(js).toContain('pbi:');
  });

  /**
   * RN-04, o invariante mais caro do projeto: com dados, o visual mostra DADOS —
   * nunca o card de erro, nunca tela branca. Foi assim que o achado 39
   * apareceu: o bundle carregava, o KPI renderizava e o grafico caia no
   * ErrorBoundary.
   */
  it('renderiza dados, e nao o card de erro', async () => {
    const { html, errors } = await renderCompiled(js, guid, true);

    expect(html).not.toContain('Nao foi possivel renderizar o visual');
    expect(html).not.toContain('RENDER_FAIL');
    expect(html.length).toBeGreaterThan(500);
    // As categorias do DataView chegaram ate a tela.
    expect(html).toContain('Norte');
    // Recharts desenha em SVG; sem <svg> nenhum grafico saiu.
    expect(html).toContain('<svg');
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
    expect(html).toContain('pbi:relative');
  }, 60_000);

  /** O selo de build e o que torna um relato de erro identificavel (achado 40). */
  it('carimba a impressao digital do build na tela', async () => {
    const { html } = await renderCompiled(js, guid, true);
    expect(html).toContain(BUILD_ID);
  }, 60_000);

  /**
   * RN-04 do outro lado: sem campos ligados o visual instrui, nao fica branco
   * nem quebra. E o estado que o usuario ve no segundo seguinte ao import.
   */
  it('sem dados, mostra o estado vazio com instrucao', async () => {
    const { html, errors } = await renderCompiled(js, guid, false);

    expect(html).toContain('Faltam campos para montar o visual');
    expect(html).not.toContain('RENDER_FAIL');
    expect(errors).toEqual([]);
  }, 60_000);

  /**
   * O `capabilities.json` gerado e o que o Power BI le para montar o painel de
   * campos. Se ele nao declarar os papeis que a arvore consome, o usuario nao
   * tem onde arrastar a coluna — e o visual fica eternamente vazio.
   */
  it('o capabilities gerado declara os papeis que a arvore consome', () => {
    const capabilities = generateCapabilities(spec);
    expect(capabilities.dataRoles.map((role) => role.name).sort()).toEqual(['categoria', 'valor']);
  });

  /**
   * O tipo declarado na tabela de exemplo vira restricao do host, e o campo
   * passa a ser EXIGIDO.
   *
   * `requiredTypes` faz o Power BI recusar o arrasto de uma coluna do tipo
   * errado; `min: 1` faz ele segurar o visual enquanto faltar campo. Sem os
   * dois, o tipo que o usuario escolhe no editor seria so a formatacao do
   * preview.
   */
  it('o capabilities gerado exige o campo, e exige do tipo certo', () => {
    const capabilities = generateCapabilities(spec);

    const porNome = new Map(capabilities.dataRoles.map((role) => [role.name, role]));
    expect(porNome.get('categoria')?.requiredTypes).toEqual([{ text: true }]);
    expect(porNome.get('valor')?.requiredTypes).toEqual([{ integer: true }]);

    const [mapping] = capabilities.dataViewMappings as {
      conditions: Record<string, { min: number; max: number }>[];
    }[];
    expect(mapping?.conditions[0]?.categoria).toEqual({ min: 1, max: 1 });
    expect(mapping?.conditions[0]?.valor).toEqual({ min: 1, max: 1 });
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
   * PARIDADE DE INTERATIVIDADE (Sprint 6, achado 53).
   *
   * Ate aqui o gate provava que o pacote DESENHA. As assertivas abaixo provam
   * que ele CONVERSA com o host — que e onde o pivo da ADR-08 tinha deixado seis
   * capacidades para tras sem nenhum teste notar.
   */
  describe('paridade de interatividade', () => {
    /** RF-23: sem isso o visual e inutilizavel sem mouse, e o AppSource recusa. */
    it('cada ponto da serie e alcancavel por teclado, com rotulo legivel', async () => {
      const { element } = await renderCompiled(js, guid, true);
      const labels = [...keyboardKeys(element)].map((node) => node.textContent);

      // Quatro categorias do DataView, uma por grafico que a spec monta.
      expect(labels.length).toBeGreaterThanOrEqual(4);
      // Categoria E valor, e o valor ja FORMATADO pelo `format` da coluna
      // (`#,0.00`): um rotulo com o numero cru nao serve para leitor de tela.
      expect(labels).toContain('Norte: 120.00');
      expect([...keyboardKeys(element)][0]?.getAttribute('aria-pressed')).toBe('false');
    }, 60_000);

    /**
     * RF-18, o coracao do sprint: acionar um ponto tem de chegar ao
     * `selectionManager` com a identidade DAQUELA linha. E a assertiva que
     * teria reprovado o pacote do Sprint 5.
     */
    it('acionar um ponto filtra o relatorio (cross-filter)', async () => {
      const { element, calls, redraw } = await renderCompiled(js, guid, true);
      const keys = [...keyboardKeys(element)];

      (keys[1] as HTMLElement | undefined)?.click();
      await redraw();

      expect(calls.selections).toHaveLength(1);
      expect(calls.selections[0]?.identity).toEqual({ key: 'row-1' });
      expect(calls.selections[0]?.multi).toBe(false);
    }, 60_000);

    /** RF-19: o balao e o do host — e o que herda os campos do relatorio. */
    it('o foco num ponto pede o tooltip NATIVO, com os valores formatados', async () => {
      const { element, calls, redraw } = await renderCompiled(js, guid, true);

      (([...keyboardKeys(element)][0] as HTMLElement | undefined))?.focus();
      await redraw();

      expect(calls.tooltips.length).toBeGreaterThan(0);
      const items = calls.tooltips[0]?.dataItems ?? [];
      expect(items.map((item) => item.displayName)).toEqual(['Regiao', 'Receita']);
      // O `format` da coluna chega ao balao (RF-17): 120 vira "120.00", e nao
      // o numero cru. Sem isso o tooltip mostraria `1234567.89` onde o Power BI
      // mostra `R$ 1,23 mi` — um dos sinais de visual amador.
      expect(items[1]?.value).toBe('120.00');
    }, 60_000);

    /** RF-24: sem isso o botao direito abre o menu do navegador no relatorio. */
    it('o botao direito abre o menu de contexto do host', async () => {
      const { element, window, calls, redraw } = await renderCompiled(js, guid, true);

      element.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
      await redraw();

      expect(calls.contextMenus).toBe(1);
    }, 60_000);

    /**
     * RF-21. A variavel CSS no elemento raiz e o mecanismo inteiro para o HTML
     * da arvore; o SVG do grafico le a paleta pelo quadro. As duas pontas sao
     * verificadas aqui porque so o artefato compilado tem as duas juntas.
     */
    it('em alto contraste, a paleta do host vence as cores do usuario', async () => {
      const { element, html } = await renderCompiled(js, guid, true, true);
      const style = (element as HTMLElement).style;

      expect(style.getPropertyValue('--vislow-hc-ink')).toBe(HC_PALETTE.foreground);
      expect(style.getPropertyValue('--vislow-hc-surface')).toBe(HC_PALETTE.background);
      // O SVG nao pode carregar `var()`: o valor tem de estar resolvido.
      expect(html).not.toContain('fill="var(');
      expect(html).toContain(`fill="${HC_PALETTE.foreground}"`);
    }, 60_000);

    it('fora do alto contraste, nenhuma variavel fica presa no elemento', async () => {
      const { element } = await renderCompiled(js, guid, true);
      expect((element as HTMLElement).style.getPropertyValue('--vislow-hc-ink')).toBe('');
    }, 60_000);
  });
});

