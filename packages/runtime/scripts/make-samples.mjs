/**
 * Gera pacotes de exemplo a partir do Runtime Core, para teste manual no
 * Power BI Desktop (matriz MT-01..MT-14).
 *
 * Script de DESENVOLVIMENTO. A implementacao definitiva de `buildPbiviz` vive
 * em @vislow/config-schema na Fase 3, ja consumida pelo editor. Este arquivo
 * existe para permitir o teste manual da Fase 1 antes de o editor existir.
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import {
  createDefaultConfig,
  assertValidConfig,
} from '../../config-schema/dist/index.js';

const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = new URL('../samples/', import.meta.url).pathname;
const CONFIG_TOKEN = '__VISLOW_CONFIG_B64__';

function replaceAll(hay, needle, rep) {
  return hay.split(needle).join(rep);
}

async function buildPbiviz(templateBuf, config) {
  const zip = await JSZip.loadAsync(templateBuf);

  const pkg = JSON.parse(await zip.file('package.json').async('string'));
  const oldGuid = pkg.visual.guid;
  const oldName = pkg.visual.name;

  const newGuid = config.project.id;
  const version = config.project.packageVersion;

  const resPath = pkg.resources.find((r) => r.file.endsWith('.pbiviz.json')).file;
  const res = JSON.parse(await zip.file(resPath).async('string'));

  const occurrences = res.content.js.split(CONFIG_TOKEN).length - 1;
  if (occurrences !== 1) throw new Error(`placeholder aparece ${occurrences}x (esperado 1)`);

  res.content.js = res.content.js.replace(
    CONFIG_TOKEN,
    Buffer.from(JSON.stringify(config), 'utf8').toString('base64'),
  );

  // Ordem obrigatoria: GUID antes do nome. Como guid = nome + hex, inverter
  // corromperia todas as ocorrencias do GUID.
  res.content.js = replaceAll(res.content.js, oldGuid, newGuid);
  if (oldName !== oldGuid) res.content.js = replaceAll(res.content.js, oldName, newGuid);

  res.visual.guid = newGuid;
  res.visual.name = newGuid;
  res.visual.displayName = config.project.name;
  res.visual.version = version;

  const newResPath = `resources/${newGuid}.pbiviz.json`;
  zip.remove(resPath);
  zip.file(newResPath, JSON.stringify(res));

  pkg.visual.guid = newGuid;
  pkg.visual.name = newGuid;
  pkg.visual.displayName = config.project.name;
  pkg.visual.version = version;
  pkg.version = version;
  pkg.resources = pkg.resources.map((r) =>
    r.file === resPath ? { ...r, file: newResPath } : r,
  );
  zip.file('package.json', JSON.stringify(pkg));

  return {
    buf: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    filename: `${newGuid}.${version}.pbiviz`,
  };
}

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
  const out = await buildPbiviz(template, config);
  await writeFile(join(OUT, out.filename), out.buf);
  console.log(
    `gerado  samples/${out.filename}  (${(out.buf.length / 1024).toFixed(1)} KB)  ${config.chartType}`,
  );
}
