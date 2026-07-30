/**
 * Sela a impressao digital de build no pacote, depois do `pbiviz package`.
 *
 * O id e o prefixo do sha256 do `content.js` ANTES da selagem — deterministico
 * por fonte, entao o mesmo codigo sempre produz o mesmo id e dois candidatos
 * diferentes sempre produzem ids diferentes. E isso que permite comparar dois
 * pacotes importados no Power BI sem ambiguidade sobre qual e qual.
 *
 * Roda antes do `assert-package.mjs`, que valida o pacote ja selado.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import JSZip from 'jszip';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TOKEN = '__VISLOW_BUILD_ID__';
const ID_BYTES = 4; // -> 8 caracteres hex

const files = (await readdir(DIST)).filter((f) => f.endsWith('.pbiviz'));
if (files.length !== 1) {
  console.error(`✗ esperado exatamente 1 .pbiviz em dist/, encontrado ${files.length}`);
  process.exit(1);
}

const path = join(DIST, files[0]);
const zip = await JSZip.loadAsync(await readFile(path));

const pkg = JSON.parse(await zip.file('package.json').async('string'));
const resPath = pkg.resources.find((r) => r.file.endsWith('.pbiviz.json')).file;
const resFile = zip.file(resPath);
const res = JSON.parse(await resFile.async('string'));

const occurrences = res.content.js.split(TOKEN).length - 1;
if (occurrences !== 1) {
  console.error(
    `✗ ${TOKEN} aparece ${occurrences}x no bundle (esperado 1).\n` +
      '  O minificador alterou o token, ou buildId.ts saiu do grafo de imports.',
  );
  process.exit(1);
}

const id = createHash('sha256')
  .update(res.content.js)
  .digest('hex')
  .slice(0, ID_BYTES * 2);

// Callback em vez de string literal: `$&` num id hex e improvavel, mas o custo
// de blindar e zero.
res.content.js = res.content.js.replace(TOKEN, () => id);

zip.file(resPath, JSON.stringify(res), { date: resFile.date });
await writeFile(path, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

console.log(`\n✓ build selado: ${id}   (${files[0]})`);
