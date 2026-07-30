// SPIKE — verificacao automatizada dos pacotes gerados (embriao de T-03..T-08).
import JSZip from 'jszip';
import { readFile, readdir } from 'node:fs/promises';

const OLD_GUID = 'vislowSpike629BE43A5D854EF08EE114A6CAB537A8';
const OLD_NAME = 'vislowSpike';
const EXPECTED = {
  'VendasporRegiao2026E4535402BCA206D09B6B621B7EEE6320': 'Vendas por Região "2026" 🚀',
  'CustosOperacionaisC68D1D7AF099443EA4CB927D4C86CB88': 'Custos Operacionais',
};

let pass = 0, fail = 0;
const check = (id, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${id}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const files = (await readdir('out')).filter(f => f.endsWith('.pbiviz'));
const guids = [];

for (const f of files) {
  console.log(`\n── ${f}`);
  const zip = await JSZip.loadAsync(await readFile(`out/${f}`));
  const pkg = JSON.parse(await zip.file('package.json').async('string'));
  const guid = pkg.visual.guid;
  guids.push(guid);

  const resPath = `resources/${guid}.pbiviz.json`;
  check('T-03a recurso renomeado existe', zip.file(resPath) !== null, resPath);
  check('T-03b recurso antigo removido', zip.file(`resources/${OLD_GUID}.pbiviz.json`) === null);
  check('T-03c package.json aponta para o novo recurso',
        pkg.resources.some(r => r.file === resPath));

  const res = JSON.parse(await zip.file(resPath).async('string'));
  const js = res.content.js;

  check('T-04 placeholder de config consumido', !js.includes('__VISLOW_CONFIG_B64__'));
  check('T-04b placeholder de guid consumido', !js.includes('__VISLOW_SELFTEST_GUID__'));

  // T-05: config volta identica, incluindo aspas, acento e emoji
  const m = js.match(/const i="([A-Za-z0-9+/=]+)"|i="([A-Za-z0-9+/=]{20,})"/);
  const b64 = m && (m[1] || m[2]);
  let decoded = null;
  try { decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); } catch { /* noop */ }
  check('T-05 config decodificada bate (aspas/acento/emoji)',
        decoded?.title === EXPECTED[guid], decoded ? `title=${decoded.title}` : 'nao decodificou');

  check('T-06a guid antigo ausente do js', !js.includes(OLD_GUID));
  check('T-06b nome antigo ausente do js', !js.includes(OLD_NAME));
  check('T-06c guid antigo ausente do package.json',
        !JSON.stringify(pkg).includes(OLD_GUID));
  check('T-06d guid novo e identificador JS valido',
        /^[A-Za-z][A-Za-z0-9_$]*$/.test(guid));
  check('T-06e guid novo declarado como var no bundle',
        new RegExp(`var ${guid}\\b`).test(js));

  check('T-08 pacote < 2 MB',
        (await zip.generateAsync({ type: 'nodebuffer' })).length < 2 * 1024 * 1024);

  check('metadados coerentes',
        res.visual.guid === guid && res.visual.name === guid &&
        res.visual.displayName === EXPECTED[guid] && pkg.visual.displayName === EXPECTED[guid]);
}

console.log('\n── global');
check('T-07 GUIDs distintos entre projetos', new Set(guids).size === guids.length,
      guids.join(' / '));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passaram, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
