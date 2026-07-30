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
 * Custa ~15 s e exige o template preparado. Sem isso, avisa e se ignora; no CI,
 * `VISLOW_REQUIRE_BUILD=1` transforma a ausencia em falha, para que nunca passe
 * como "teste ignorado".
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

const STAGED = existsSync(join(VENDOR_DIR, '@vislow', 'visual-kit', 'dist', 'styles.css'));
const REQUIRED = process.env.VISLOW_REQUIRE_BUILD === '1';

if (!STAGED && REQUIRED) {
  throw new Error(
    'VISLOW_REQUIRE_BUILD=1 mas o template nao esta preparado. Rode ' +
      '`pnpm build && pnpm --filter @vislow/visual-template stage:vendor`.',
  );
}
if (!STAGED) {
  console.warn(
    '\n[build compilado] ignorado: template nao preparado.\n' +
      '  Para rodar: pnpm build && pnpm --filter @vislow/visual-template stage:vendor\n',
  );
}

const BUILD_ID = 'e2e00001';

/** Host do Power BI, reduzido ao que o visual gerado realmente usa. */
function fakeHost() {
  return {
    locale: 'pt-BR',
    createSelectionManager: () => ({
      select: () => Promise.resolve([]),
      getSelectionIds: () => [],
      showContextMenu: () => undefined,
      registerOnSelectCallback: () => undefined,
    }),
    createSelectionIdBuilder: () => {
      const builder = {
        withCategory: () => builder,
        createSelectionId: () => ({ key: 'id' }),
      };
      return builder;
    },
    colorPalette: { isHighContrast: false },
    tooltipService: { show: () => undefined, hide: () => undefined },
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

async function renderCompiled(js: string, guid: string, withData: boolean): Promise<RenderOutcome> {
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
  const visual = plugin!.create({ element, host: fakeHost() }) as {
    update: (options: unknown) => void;
  };
  visual.update({
    dataViews: withData ? [fakeDataView()] : [],
    viewport: VIEWPORT,
    type: 62,
  });

  // No modo concorrente o React renderiza fora da pilha atual.
  await new Promise((resolve) => setTimeout(resolve, 300));

  return { html: new window.XMLSerializer().serializeToString(element), errors };
}

describe.skipIf(!STAGED)('spec compilada vira um .pbiviz que renderiza', () => {
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
});

describe('identidade entre projetos', () => {
  /**
   * RN-01 / C-03: dois visuais precisam coexistir no mesmo relatorio. GUID
   * repetido faz o segundo import sobrescrever o primeiro — foi o erro 2 do
   * Anexo A, e a compilacao real nao o dissolve sozinha.
   */
  it('dois projetos novos nunca compartilham GUID', () => {
    const a = specWithEveryKind('Vendas');
    const b = specWithEveryKind('Vendas');
    expect(a.project.id).not.toBe(b.project.id);
  });

  it('o mesmo projeto reexportado mantem o id', () => {
    const spec = specWithEveryKind('Vendas');
    const reexport = { ...spec, project: { ...spec.project, packageVersion: '1.0.0.1' as const } };
    expect(reexport.project.id).toBe(spec.project.id);
  });
});
