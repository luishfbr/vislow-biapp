/**
 * Guardas de empacotamento do Runtime Core.
 *
 * Existem porque a toolchain do Power BI falha em silencio: `pbiviz package`
 * reporta "Build completed successfully" mesmo produzindo um pacote sem os
 * estilos, e o minificador pode alterar o placeholder de config. Cada assertiva
 * aqui transforma um desses silencios em falha de build.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';

const DIST = new URL('../dist/', import.meta.url).pathname;
const CONFIG_TOKEN = '__VISLOW_CONFIG_B64__';
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024; // limite rigido do Power BI (C-04)
const MAX_JS_BYTES = 1024 * 1024; // RNF-04

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const files = (await readdir(DIST)).filter((f) => f.endsWith('.pbiviz'));
if (files.length !== 1) {
  console.error(`✗ esperado exatamente 1 .pbiviz em dist/, encontrado ${files.length}`);
  process.exit(1);
}

const path = join(DIST, files[0]);
const buf = await readFile(path);
const zip = await JSZip.loadAsync(buf);

console.log(`\nVerificando ${files[0]} (${(buf.length / 1024).toFixed(1)} KB)\n`);

const pkg = JSON.parse(await zip.file('package.json').async('string'));
const resPath = pkg.resources.find((r) => r.file.endsWith('.pbiviz.json')).file;
const res = JSON.parse(await zip.file(resPath).async('string'));
const js = res.content.js;
const css = res.content.css ?? '';

// --- Placeholder de config (R-01) -----------------------------------------
const occurrences = js.split(CONFIG_TOKEN).length - 1;
check(
  'placeholder de config aparece exatamente 1x',
  occurrences === 1,
  `${occurrences} ocorrencia(s)`,
);

// --- CSS chegou ao pacote (achado 20 do Anexo A) --------------------------
check('content.css nao esta vazio', css.length > 0, `${css.length} chars`);
for (const cls of ['pbi\\:p-4', 'pbi\\:rounded-xl', 'pbi\\:flex', 'pbi\\:truncate']) {
  check(`classe presente: ${cls}`, css.includes(cls));
}
check('preflight nao vazou', !/(^|\})\s*(html|body)\s*\{/.test(css));

// --- Identidade ------------------------------------------------------------
check(
  'guid e identificador JS valido',
  /^[A-Za-z][A-Za-z0-9]*$/.test(pkg.visual.guid),
  pkg.visual.guid,
);

// --- Impressao digital de build -------------------------------------------
// Um pacote nao selado nao identifica a si mesmo, e foi essa cegueira que
// custou uma sessao inteira de diagnostico. `stamp-build-id.mjs` ja falha se o
// token nao aparecer exatamente 1x; aqui basta provar que ele foi consumido.
check('build id selado no bundle', !js.includes('__VISLOW_BUILD_ID__'));
check('guid declarado como var no bundle', new RegExp(`var ${pkg.visual.guid}\\b`).test(js));

// --- Orcamentos (RNF-04 / RNF-05) -----------------------------------------
check('pacote < 2 MB', buf.length < MAX_PACKAGE_BYTES, `${(buf.length / 1024).toFixed(1)} KB`);
check(
  'bundle js < 1 MB',
  js.length < MAX_JS_BYTES,
  `${(js.length / 1024).toFixed(1)} KB`,
);

console.log(`\n${failures === 0 ? '✅ pacote valido' : `❌ ${failures} verificacao(oes) falharam`}\n`);
process.exit(failures === 0 ? 0 : 1);
