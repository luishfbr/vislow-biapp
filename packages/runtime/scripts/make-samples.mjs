/**
 * Gera pacotes de exemplo a partir do Runtime Core, para teste manual no
 * Power BI Desktop (matriz MT-01..MT-14).
 *
 * Desde a Fase 3 este script apenas orquestra: o empacotamento vem de
 * `@vislow/config-schema/packaging`, o MESMO codigo que o editor executa no
 * browser. Duplicar o algoritmo aqui era o que fazia a amostra divergir do
 * artefato real sem ninguem perceber.
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createDefaultConfig, assertValidConfig } from '../../config-schema/dist/index.js';
import { buildPbiviz } from '../../config-schema/dist/packaging/index.js';

const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = new URL('../samples/', import.meta.url).pathname;

// --- amostras --------------------------------------------------------------
const bar = createDefaultConfig('Vendas por Região "2026" 🚀', 'bar');
bar.header.text = 'Vendas por Região';
bar.bar.accentColor = '#3b82f6';

const kpi = createDefaultConfig('Receita Total', 'kpi');
kpi.header.text = 'Receita acumulada';
kpi.layout.surfaceColor = '#0f172a';
kpi.header.textColor = '#e2e8f0';
kpi.kpi.accentColor = '#38bdf8';
kpi.kpi.labelColor = '#94a3b8';

const files = (await readdir(DIST)).filter((f) => f.endsWith('.pbiviz'));
if (files.length !== 1) throw new Error(`esperado 1 .pbiviz em dist/, achei ${files.length}`);
const template = await readFile(join(DIST, files[0]));

await mkdir(OUT, { recursive: true });
for (const config of [bar, kpi]) {
  assertValidConfig(config);
  const pkg = await buildPbiviz(template, config);
  await writeFile(join(OUT, pkg.filename), pkg.bytes);
  console.log(
    `gerado  samples/${pkg.filename}  (${(pkg.bytes.byteLength / 1024).toFixed(1)} KB)  ${config.chartType}`,
  );
}
