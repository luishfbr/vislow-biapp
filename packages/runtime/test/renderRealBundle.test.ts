/**
 * Executa o bundle MINIFICADO real dentro de um jsdom, como o Power BI faz.
 *
 * Este e o unico teste que exercita o artefato de ponta a ponta: gera o pacote
 * com `buildPbiviz`, avalia o `content.js` num DOM, instancia o plugin e
 * verifica o que foi para a tela. Todos os outros testam fonte.
 *
 * Existe porque a Fase 3 encontrou um bug que NENHUM teste de fonte pegaria: o
 * webpack do `pbiviz` usa `resolve.symlinks: false`, e o layout do pnpm fazia o
 * React entrar duas vezes no bundle. Elementos JSX atravessam copias sem
 * problema, entao a falha atingia so componentes com hook — o `KpiCard`
 * renderizava, o `BarChart` mostrava card de erro. Ver Anexo A, achado 39.
 *
 * E tambem a unica verificacao executavel da RN-04: o visual nunca renderiza em
 * branco.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import JSZip from 'jszip';
import { createDefaultConfig, type ChartType } from '@vislow/config-schema';
import { buildPbiviz } from '@vislow/config-schema/packaging';
import { beforeAll, describe, expect, it } from 'vitest';

const DIST = new URL('../dist/', import.meta.url).pathname;
const REQUIRED = process.env.VISLOW_REQUIRE_TEMPLATE === '1';

async function findTemplate(): Promise<string | null> {
  try {
    const files = (await readdir(DIST)).filter((file) => file.endsWith('.pbiviz'));
    if (files.length !== 1) return null;
    return join(DIST, files[0]!);
  } catch {
    return null;
  }
}

const templatePath = await findTemplate();

if (templatePath === null && REQUIRED) {
  throw new Error(
    'VISLOW_REQUIRE_TEMPLATE=1 mas nao ha exatamente 1 .pbiviz em packages/runtime/dist. ' +
      'Rode `pnpm --filter @vislow/runtime build:runtime` antes.',
  );
}

if (templatePath === null) {
  console.warn(
    '\n[render do bundle real] ignorado: pacote base ausente.\n' +
      '  Para rodar: pnpm --filter @vislow/runtime build:runtime\n',
  );
}

interface RenderOutcome {
  /**
   * Subtree renderizada, serializada.
   *
   * Via `XMLSerializer` e nao `innerHTML`: a RN-11 proibe `innerHTML` em todo o
   * monorepo, e nao vale abrir excecao numa regra de seguranca so para ler o
   * resultado de um teste.
   */
  html: string;
  consoleErrors: string[];
}

/** Host do Power BI, reduzido ao que o visual realmente usa. */
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
      let index = 0;
      const builder = {
        withCategory: (_category: unknown, i: number) => {
          index = i;
          return builder;
        },
        createSelectionId: () => ({ key: `id-${String(index)}` }),
      };
      return builder;
    },
    colorPalette: { isHighContrast: false },
    tooltipService: { show: () => undefined, hide: () => undefined },
  };
}

/** `DataView` categorico minimo: uma dimensao e uma medida formatada. */
function fakeDataView() {
  const values = [
    {
      source: { displayName: 'Receita', roles: { measure: true }, format: '#,0.00' },
      values: [120, 340, 210, 90],
    },
  ];
  return {
    categorical: {
      categories: [
        {
          source: { displayName: 'Regiao', roles: { category: true } },
          values: ['Norte', 'Sul', 'Leste', 'Oeste'],
          identity: [0, 1, 2, 3],
        },
      ],
      values: Object.assign(values, { grouped: () => [] }),
    },
    metadata: { columns: [] },
  };
}

async function renderPackage(chartType: ChartType): Promise<RenderOutcome> {
  const template = await readFile(templatePath!);
  const config = createDefaultConfig('Teste de Render', chartType);
  const pkg = await buildPbiviz(template, config);

  const zip = await JSZip.loadAsync(pkg.bytes);
  const manifest = JSON.parse(
    await zip.file('package.json')!.async('string'),
  ) as { resources: { file: string }[]; visual: { guid: string } };
  const resourcePath = manifest.resources.find((r) => r.file.endsWith('.pbiviz.json'))!.file;
  const resource = JSON.parse(await zip.file(resourcePath)!.async('string')) as {
    content: { js: string };
  };

  const consoleErrors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => {
    consoleErrors.push(error.message);
  });
  virtualConsole.on('error', (...args: unknown[]) => {
    consoleErrors.push(args.map((a) => String(a)).join(' '));
  });

  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  // O bundle registra o plugin neste objeto global.
  Object.assign(window, {
    powerbi: { visuals: { plugins: {} }, extensibility: { visual: {} } },
  });

  window.eval(resource.content.js);

  const plugins = (
    window as unknown as {
      powerbi: { visuals: { plugins: Record<string, { create: (o: unknown) => unknown }> } };
    }
  ).powerbi.visuals.plugins;

  const plugin = plugins[manifest.visual.guid];
  expect(plugin, `plugin ${manifest.visual.guid} nao registrado`).toBeDefined();

  const element = window.document.getElementById('host')!;
  const visual = plugin!.create({ element, host: fakeHost() }) as {
    update: (options: unknown) => void;
  };
  visual.update({
    dataViews: [fakeDataView()],
    viewport: { width: 600, height: 400 },
    type: 62,
  });

  // O React renderiza fora da pilha atual no modo concorrente.
  await new Promise((resolve) => setTimeout(resolve, 200));

  return { html: new window.XMLSerializer().serializeToString(element), consoleErrors };
}

describe.skipIf(templatePath === null)('render do bundle real', () => {
  let bar: RenderOutcome;
  let kpi: RenderOutcome;

  beforeAll(async () => {
    bar = await renderPackage('bar');
    kpi = await renderPackage('kpi');
  }, 60_000);

  it('BarChart renderiza dados, nao card de erro (guarda de hooks)', () => {
    // A assertiva que fecha o achado 39. Duas copias do React deixam o
    // dispatcher de hooks nulo e o BarChart cai no ErrorBoundary.
    expect(bar.html).not.toContain('Nao foi possivel renderizar');
    expect(bar.html).not.toContain('RENDER_FAIL');
    expect(bar.consoleErrors).toEqual([]);

    // Uma barra por categoria, com rotulo.
    expect(bar.html).toContain('Norte');
    expect(bar.html).toContain('Oeste');
    expect(bar.html.match(/role="listitem"/g)).toHaveLength(4);
  });

  it('KpiCard renderiza o total formatado pelo locale', () => {
    expect(kpi.html).not.toContain('RENDER_FAIL');
    expect(kpi.consoleErrors).toEqual([]);
    // 120 + 340 + 210 + 90, com o `format` da coluna aplicado (RF-17).
    expect(kpi.html).toContain('760');
    expect(kpi.html).toContain('Receita');
  });

  it('RN-04 — nunca renderiza em branco', () => {
    for (const outcome of [bar, kpi]) {
      expect(outcome.html.length).toBeGreaterThan(200);
    }
  });

  it('aplica os tokens do config ao DOM', () => {
    // Prova ADR-02 no artefato: a classe prefixada chegou ao elemento, entao o
    // mapa de tokens sobreviveu ao Tailwind e a minificacao.
    expect(bar.html).toContain('pbi:rounded-xl');
    expect(bar.html).toContain('Teste de Render'); // header.text = nome do projeto
  });
});
