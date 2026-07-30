// SPIKE — codigo descartavel. Prova ADR-01 (injecao de config) e ADR-03 (GUID unico).
// Este script e o embriao de buildPbiviz() da secao 8.3 do documento.
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const CONFIG_TOKEN = '__VISLOW_CONFIG_B64__';
const GUID_TOKEN = '__VISLOW_SELFTEST_GUID__';

function newIdentity(displayName) {
  // O GUID vira NOME DE VARIAVEL JS no bundle -> precisa ser identificador valido.
  const slug = displayName.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'vislow';
  const head = /^[A-Za-z]/.test(slug) ? slug : 'v' + slug;
  return head + randomBytes(16).toString('hex').toUpperCase();
}

function replaceAll(hay, needle, rep) {
  return hay.split(needle).join(rep);
}

function assertOnce(js, token) {
  const n = js.split(token).length - 1;
  if (n !== 1) throw new Error(`Token ${token} aparece ${n}x no bundle (esperado 1)`);
}

export async function buildPbiviz(templateBuf, { displayName, version, config, guid }) {
  const zip = await JSZip.loadAsync(templateBuf);

  const pkg = JSON.parse(await zip.file('package.json').async('string'));
  const oldGuid = pkg.visual.guid;
  const oldName = pkg.visual.name;

  const newGuid = guid ?? newIdentity(displayName);
  const newName = newGuid;

  const resPath = pkg.resources.find(r => r.file.endsWith('.pbiviz.json')).file;
  const res = JSON.parse(await zip.file(resPath).async('string'));

  // 1. Injeta a config (ADR-01/ADR-07)
  assertOnce(res.content.js, CONFIG_TOKEN);
  const payload = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
  res.content.js = res.content.js.replace(CONFIG_TOKEN, payload);

  // 2. Placeholder de autodiagnostico -> mostra na tela qual GUID o bundle carrega
  res.content.js = res.content.js.replace(GUID_TOKEN, newGuid);

  // 3. Reescreve identidade DENTRO do bundle (ADR-03).
  //    Ordem importa: GUID primeiro (mais especifico), depois o nome residual.
  res.content.js = replaceAll(res.content.js, oldGuid, newGuid);
  if (oldName !== oldGuid) res.content.js = replaceAll(res.content.js, oldName, newName);

  // 4. Metadados do recurso
  res.visual.guid = newGuid;
  res.visual.name = newName;
  res.visual.displayName = displayName;
  res.visual.version = version;

  // 5. Renomeia o recurso e atualiza a referencia (passo mais facil de esquecer)
  const newResPath = `resources/${newGuid}.pbiviz.json`;
  zip.remove(resPath);
  zip.file(newResPath, JSON.stringify(res));

  // 6. package.json
  pkg.visual.guid = newGuid;
  pkg.visual.name = newName;
  pkg.visual.displayName = displayName;
  pkg.visual.version = version;
  pkg.version = version;
  pkg.resources = pkg.resources.map(r => r.file === resPath ? { ...r, file: newResPath } : r);
  zip.file('package.json', JSON.stringify(pkg));

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buf, newGuid, oldGuid, filename: `${newGuid}.${version}.pbiviz` };
}

// --------------------------------------------------------------------------
const TEMPLATE = 'vislowSpike/dist/vislowSpike629BE43A5D854EF08EE114A6CAB537A8.1.0.0.0.pbiviz';

const CASES = [
  { displayName: 'Vendas por Região "2026" 🚀',
    config: { title: 'Vendas por Região "2026" 🚀', accentColor: '#3b82f6', surfaceColor: '#ffffff' } },
  { displayName: 'Custos Operacionais',
    config: { title: 'Custos Operacionais', accentColor: '#ef4444', surfaceColor: '#fef2f2' } },
];

const template = await readFile(TEMPLATE);
for (const c of CASES) {
  const out = await buildPbiviz(template, { ...c, version: '1.0.0.0' });
  await writeFile(`out/${out.filename}`, out.buf);
  console.log(`gerado  out/${out.filename}  (${(out.buf.length / 1024).toFixed(1)} KB)  guid=${out.newGuid}`);
}
