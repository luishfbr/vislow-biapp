// Gate de aceite da ADR-08: compila um `.pbiviz` de verdade e executa o bundle
// minificado num jsdom, como o Power BI faz. Ver docs/build-visual.md.
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

const HC_PALETTE = {
  foreground: '#ffffff',
  background: '#000000',
  foregroundSelected: '#00ff00',
};

interface HostCalls {
  selections: { identity: unknown; multi: boolean }[];
  contextMenus: number;
  tooltips: { dataItems: { displayName: string; value: string }[] }[];
}

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
        // Identidade distinta por linha: com uma so, um clique na terceira passaria pela primeira.
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

function fakeDataView(rowCount = 1) {
  const categories = [
    {
      source: { displayName: 'Categoria', roles: { categoria: true } },
      values: Array.from({ length: rowCount }, (_, i) => `Categoria ${String(i + 1)}`),
      identity: Array.from({ length: rowCount }, (_, i) => ({ key: `identity-${String(i)}` })),
    },
  ];

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
  html: string;
  errors: string[];
  element: Element;
  window: JSDOM['window'];
  calls: HostCalls;
  redraw: () => Promise<string>;
  visual: CompiledVisual;
}

interface CompiledVisual {
  update: (options: unknown) => void;
  getFormattingModel?: () => { cards: unknown[] };
}

const VIEWPORT = { width: 800, height: 600 };
const CHART_BOX = { width: 800, height: 150 };

function installLayout(window: JSDOM['window']): void {
  class ImmediateResizeObserver {
    constructor(private readonly callback: (entries: unknown[], observer: unknown) => void) {}

    public observe(target: Element): void {
      const entry = { target, contentRect: { ...CHART_BOX, top: 0, left: 0, x: 0, y: 0 } };
      this.callback([entry], this);
      queueMicrotask(() => {
        this.callback([entry], this);
      });
    }
    public unobserve(): void {
      /* a medida e fixa: nada a desfazer */
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
  objects?: Record<string, Record<string, unknown>>,
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
    dataViews: withData
      ? [fakeDataView(rowCount)]
      : objects
        ? [{ metadata: { columns: [], objects } }]
        : [],
    viewport: VIEWPORT,
    type: 62,
  });

  const settle = async (): Promise<string> => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return new window.XMLSerializer().serializeToString(element);
  };

  return { html: await settle(), errors, element, window, calls, redraw: settle, visual };
}

describe('spec compilada vira um .pbiviz que renderiza', () => {
  let spec: VisualSpec;
  let outcome: BuildOutcome;
  let js: string;
  let guid: string;
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
    expect(new RegExp(`var ${guid}\\b`).test(js)).toBe(true);
  });

  it('o nome do arquivo e o nome que o usuario deu', () => {
    expect(outcome.fileName).toBe('Vendas por Região 🚀.pbiviz');
  });

  it('cabe nos orcamentos rigidos do Power BI', () => {
    expect(outcome.packageBytes).toBeLessThan(MAX_PACKAGE_BYTES);
    expect(outcome.jsBytes).toBeLessThan(MAX_JS_BYTES);
  });

  it('leva o CSS do visual-kit no bundle', () => {
    expect(js).toContain('vsl-');
  });

  it('renderiza a composicao, e nao o card de erro', async () => {
    const { html, errors } = await renderCompiled(js, guid, true);

    expect(html).not.toContain('Não foi possível renderizar o visual');
    expect(html).not.toContain('RENDER_FAIL');
    expect(html.length).toBeGreaterThan(300);
    expect(html).toContain(String(defaultPropsFor('text').content));
    expect(html).toContain('vsl-text');
    expect(errors).toEqual([]);
  }, 60_000);

  it('o no posicionado chega ao DOM compilado com a caixa da spec', async () => {
    const { html } = await renderCompiled(js, guid, true);
    const rects = spec.root.children!.map((child) => child.rect!);

    expect(rects.length).toBeGreaterThan(1);
    for (const rect of rects) {
      expect(html).toContain(`top: ${String(rect.y)}%`);
      expect(html).toContain(`height: ${String(rect.h)}%`);
    }
    expect(html).toContain('vsl-canvas');
  }, 60_000);

  it('nao carimba a impressao digital do build na tela', async () => {
    const { html } = await renderCompiled(js, guid, true);
    expect(html).not.toContain(BUILD_ID);
    expect(js).toContain(BUILD_ID);
  }, 60_000);

  it('sem DataView, o texto desenha e o KPI pede o campo', async () => {
    const { html, errors } = await renderCompiled(js, guid, false);

    expect(html).toContain(String(defaultPropsFor('text').content));
    expect(html).toContain('Faltam campos para montar o visual');
    expect(html).not.toContain('RENDER_FAIL');
    expect(html).not.toContain('Não foi possível renderizar o visual');
    expect(errors).toEqual([]);
  }, 60_000);

  it('com DataView, o KPI desenha o valor formatado e a variacao', async () => {
    const { html } = await renderCompiled(js, guid, true);
    const figura = /vsl-kpi-figure[^>]*>([^<]*)</.exec(html)?.[1] ?? '';

    // ACHADO ABERTO (RF-17): o `format` chega, mas os separadores saem em `en-US` — por isso
    // a regex aceita `.` ou `,`. Diagnostico e opcoes em docs/requirements.md.
    expect(figura, 'o formato da coluna nao foi aplicado').toMatch(/^1[.,]084[.,]320[.,]00$/);

    expect(html).toContain('▲');
    expect(html).toContain('+84.320');
    expect(html).toContain('vs Meta');
    expect(html).not.toContain('Faltam campos para montar o visual');
  }, 60_000);

  it('o capabilities do PACOTE declara os papeis que a arvore consome', () => {
    expect(embutido.dataRoles.map((role) => role.name)).toEqual(['categoria', 'valor', 'meta']);
    expect(embutido.dataViewMappings).toHaveLength(1);

    const kinds = Object.fromEntries(embutido.dataRoles.map((role) => [role.name, role.kind]));
    expect(kinds.categoria).toBe('Grouping');
  });

  it('o capabilities do PACOTE e exatamente o que o codegen gerou', () => {
    expect(embutido).toEqual(JSON.parse(JSON.stringify(generateCapabilities(spec))));
  });

  it('o capabilities do PACOTE exige o campo do tipo certo', () => {
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
    expect(JSON.stringify(embutido.dataViewMappings)).not.toContain('"min"');
    for (const condition of embutido.dataViewMappings[0]?.conditions ?? []) {
      for (const [role, limit] of Object.entries(condition)) {
        expect(limit, role).toEqual({ max: 1 });
      }
    }
  });

  it('os valores de exemplo nao viajam dentro do bundle compilado', () => {
    for (const row of spec.data.rows) {
      for (const cell of row) {
        if (cell === null) continue;
        expect(js, `o bundle carrega ${String(cell)}`).not.toContain(String(cell));
      }
    }
  });

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

  // Fecha o achado 53 — um pacote que DESENHAVA certo e nao FILTRAVA nada, suite verde.
  describe('paridade de interatividade', () => {
    it('o card e alcancavel por teclado e rotulado (RF-23)', async () => {
      const { element } = await renderCompiled(js, guid, true);
      const card = element.querySelector('.vsl-kpi');

      expect(card, 'o KPI nao chegou ao DOM do pacote').not.toBeNull();
      expect(card?.getAttribute('tabindex')).toBe('0');
      expect(card?.getAttribute('aria-label')).toBe('Receita');
    }, 60_000);

    it('o foco pede o tooltip NATIVO ja formatado (RF-19 / RF-17)', async () => {
      const { element, calls, window } = await renderCompiled(js, guid, true);
      const card = element.querySelector('.vsl-kpi')!;

      // `focusin`, e nao `focus`: o React delega no raiz e so escuta a versao que borbulha.
      card.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.tooltips).toHaveLength(1);
      const items = calls.tooltips[0]?.dataItems ?? [];
      expect(items.map((item) => item.displayName)).toEqual(['Receita', 'Meta']);
      expect(items[0]?.value).toMatch(/^1[.,]084[.,]320[.,]00$/);
    }, 60_000);

    it('o botao direito abre o menu de contexto do host (RF-24)', async () => {
      const { element, calls, window } = await renderCompiled(js, guid, true);

      element.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(calls.contextMenus).toBe(1);
    }, 60_000);

    it('acionar uma linha filtra o relatorio com a identidade DAQUELA categoria (RF-18)', async () => {
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
      const { html } = await renderCompiled(js, guid, true, false, undefined, 1000);
      expect(html).toContain('Exibindo 1000 de mais de 1000 categorias');
    }, 60_000);
  });
});

describe('o pacote compilado leva o painel de formatacao', () => {
  let spec: VisualSpec;
  let js: string;
  let guid: string;
  let embutido: { objects: Record<string, unknown>; supportsEmptyDataView?: boolean };
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
    expect(Object.keys(embutido.objects)).toContain(textoId);
    expect(embutido.supportsEmptyDataView).toBe(true);
    expect(embutido).toEqual(generateCapabilities(spec));
  });

  it('getFormattingModel devolve os cards do bundle minificado', async () => {
    const { visual, errors } = await renderCompiled(js, guid, false, false, {});
    const model = visual.getFormattingModel?.();

    expect(model).toBeDefined();
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
    expect(html).not.toContain('Receita total');
    expect(html).toContain('#ff0000');
    expect(errors).toEqual([]);
  }, 60_000);

  it('valor invalido vindo do host cai no valor do autor, sem quebrar a tela', async () => {
    const { html, errors } = await renderCompiled(js, guid, false, false, {
      [textoId]: { fontSize: 'gigante', color: { solid: { color: 'vermelho' } } },
    });

    expect(html).toContain('Receita total');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Não foi possível renderizar o visual');
    expect(errors).toEqual([]);
  }, 60_000);

  it('o campo NAO publicado ignora o override — e propriedade estrutural', async () => {
    const { html } = await renderCompiled(js, guid, false, false, {
      [textoId]: { padding: 99 },
    });

    expect(html).not.toContain('padding: 99px');
    expect(html).toContain(`padding: ${String(defaultPropsFor('text').padding)}px`);
  }, 60_000);
});
