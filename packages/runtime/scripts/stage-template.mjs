/**
 * Copia o pacote base recem-construido para os estaticos do editor.
 *
 * O editor e 100% client-side (ADR-05): ele nao tem backend para consultar, e
 * `fetch` o template de um caminho fixo. O nome do arquivo em `dist/` carrega o
 * GUID e a versao do pacote base, entao a copia normaliza para um nome estavel —
 * do contrario o cliente teria de descobrir o nome, o que exigiria um indice.
 *
 * O destino e versionado no .gitignore de proposito: e artefato de build.
 */
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PUBLIC = new URL('../../../apps/web/public/templates/', import.meta.url).pathname;
export const TEMPLATE_FILENAME = 'base-runtime.pbiviz';

const files = (await readdir(DIST)).filter((file) => file.endsWith('.pbiviz'));
if (files.length !== 1) {
  console.error(
    `✗ esperado exatamente 1 .pbiviz em packages/runtime/dist, encontrado ${files.length}.\n` +
      '  Rode `pnpm --filter @vislow/runtime build:runtime` primeiro.',
  );
  process.exit(1);
}

const source = join(DIST, files[0]);
const target = join(PUBLIC, TEMPLATE_FILENAME);

await mkdir(PUBLIC, { recursive: true });
await copyFile(source, target);

const { size } = await stat(target);
console.log(
  `✓ template do editor: apps/web/public/templates/${TEMPLATE_FILENAME} (${(size / 1024).toFixed(1)} KB)`,
);
