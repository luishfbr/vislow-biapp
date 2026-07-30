/**
 * Gera um pacote de diagnostico de GRAFICO DE BARRAS a partir do dist atual.
 *
 * Uso: node scripts/make-diagnostic.mjs <rotulo>
 *   ex.: node scripts/make-diagnostic.mjs A
 *
 * O rotulo entra no nome do visual, entao os candidatos aparecem distinguiveis
 * no painel de visualizacoes do Power BI. GUIDs distintos permitem importar os
 * dois no MESMO relatorio e comparar lado a lado.
 *
 * Barras porque e o unico componente com hook — e portanto o unico que falha.
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { createDefaultConfig, assertValidConfig } from '../../config-schema/dist/index.js';
import { buildPbiviz } from '../../config-schema/dist/packaging/index.js';

const label = process.argv[2];
if (!label || !/^[A-Za-z0-9]+$/.test(label)) {
  console.error('uso: node scripts/make-diagnostic.mjs <rotulo alfanumerico>');
  process.exit(1);
}

const DIST = new URL('../dist/', import.meta.url).pathname;
const OUT = new URL('../diagnostico/', import.meta.url).pathname;

const files = (await readdir(DIST)).filter((f) => f.endsWith('.pbiviz'));
if (files.length !== 1) {
  console.error(`✗ esperado 1 .pbiviz em dist/, encontrado ${files.length}`);
  process.exit(1);
}
const template = await readFile(join(DIST, files[0]));

// Le o build id que o pacote base carrega, para reportar junto.
const zip = await JSZip.loadAsync(template);
const pkg = JSON.parse(await zip.file('package.json').async('string'));
const res = JSON.parse(
  await zip.file(pkg.resources.find((r) => r.file.endsWith('.pbiviz.json')).file).async('string'),
);
const buildId = res.content.js.match(/"([0-9a-f]{8})"/)?.[1] ?? 'desconhecido';

const config = createDefaultConfig(`Diagnostico ${label}`, 'bar');
config.header.text = `Diagnostico ${label}`;
assertValidConfig(config);

const out = await buildPbiviz(template, config);
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, out.filename), out.bytes);

console.log(
  `\n✓ candidato ${label}\n` +
    `  arquivo : diagnostico/${out.filename}\n` +
    `  build id: ${buildId}\n` +
    `  tamanho : ${(out.bytes.byteLength / 1024).toFixed(1)} KB\n`,
);
