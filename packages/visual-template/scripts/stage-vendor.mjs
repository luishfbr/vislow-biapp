/**
 * Empacota os pacotes internos que o visual gerado consome.
 *
 * PORQUE ISTO EXISTE. O projeto de build e um projeto `npm` standalone, com
 * `npm ci` a partir de um lockfile — de proposito. Foi o que o gate do Sprint 2
 * mediu, e e o que dissolve o achado 39: sem o layout de symlinks do pnpm, o
 * webpack do `pbiviz` (que roda com `resolve.symlinks: false`) nao tem como
 * enxergar duas copias do mesmo React.
 *
 * Mas `@vislow/visual-kit` e `@vislow/config-schema` sao privados: nao estao em
 * registro nenhum e nao podem entrar no `package.json` do template. A saida e
 * copia-los como DIRETORIOS REAIS para dentro de `node_modules` DEPOIS do
 * `npm ci` — `npm ci` apaga `node_modules` inteiro antes de instalar, entao a
 * ordem nao e negociavel.
 *
 * Copia de diretorio, e nao symlink nem `file:` no lockfile:
 *   - symlink reintroduziria exatamente a condicao do achado 39;
 *   - `file:` faria o `npm ci` recusar o lockfile a cada byte alterado no kit.
 */
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PKG = join(HERE, '..');
const REPO = join(TEMPLATE_PKG, '..', '..');
const VENDOR = join(TEMPLATE_PKG, 'vendor', '@vislow');

/**
 * O que copiar de cada pacote.
 *
 * `packaging/` do config-schema fica de FORA: e onde vive o `inspectPbiviz`,
 * que importa JSZip. O visual nunca chama esse caminho, mas basta o arquivo
 * existir para que uma importacao distraida arraste JSZip para dentro do
 * bundle, contra o orcamento de 1 MB. Nao copiar torna o invariante fisico em
 * vez de confiado.
 */
const PACKAGES = [
  { name: 'visual-kit', exclude: [] },
  { name: 'config-schema', exclude: ['packaging'] },
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await rm(VENDOR, { recursive: true, force: true });
  await mkdir(VENDOR, { recursive: true });

  for (const { name, exclude } of PACKAGES) {
    const source = join(REPO, 'packages', name);
    const dist = join(source, 'dist');

    if (!(await exists(dist))) {
      throw new Error(
        `packages/${name}/dist ausente. Rode \`pnpm build\` antes de \`pnpm stage:vendor\`.`,
      );
    }

    const target = join(VENDOR, name);
    await mkdir(target, { recursive: true });
    await cp(join(source, 'package.json'), join(target, 'package.json'));
    await cp(dist, join(target, 'dist'), {
      recursive: true,
      filter: (path) => !exclude.some((part) => path.includes(join('dist', part))),
    });

    console.log(`vendorizado: @vislow/${name}`);
  }

  // Guarda do ADR-02: o CSS pre-compilado e a UNICA fonte de estilo do visual, e
  // o `pbiviz` reporta sucesso sem ele. Sem esta checagem, um `pnpm build` sem o
  // passo de CSS produziria visuais sem estilo nenhum, em silencio.
  const css = join(VENDOR, 'visual-kit', 'dist', 'styles.css');
  if (!(await exists(css))) {
    throw new Error(
      'dist/styles.css do visual-kit ausente. Rode `pnpm --filter @vislow/visual-kit build:css`.',
    );
  }
  console.log('CSS do visual-kit presente.');

  // ===================== NENHUMA BIBLIOTECA EXTERNA NO KIT ===================
  // O Recharts saiu do visual compilado na spec 5.0.0, e saiu tambem do
  // `package.json` do template — nao esta mais instalado. Um `dist/` que ainda o
  // importe nao quebra o build enquanto ninguem o alcanca pelo grafo de imports,
  // e foi exatamente o que aconteceu: `charts.js` e `KpiNode.js` sobreviveram no
  // `dist/` depois de apagados do `src/`, porque o `tsc` nao apaga o que sumiu.
  //
  // Esta guarda olha o que de fato VIAJA para dentro do visual, e nao o fonte.
  // Ela reprova o pacote antes de o `pbiviz` tentar resolver um modulo que nao
  // existe — e a mensagem dele nao apontaria para a causa.
  const proibidas = ['recharts', 'd3-'];
  const restos = [];
  for (const file of await readdir(join(VENDOR, 'visual-kit', 'dist'), { recursive: true })) {
    if (!file.endsWith('.js')) continue;
    const full = join(VENDOR, 'visual-kit', 'dist', file);
    const code = await readFile(full, 'utf8');
    const achada = proibidas.find((lib) => code.includes(`from '${lib}`) || code.includes(`"${lib}`));
    if (achada) restos.push(`${file} (${achada})`);
  }
  if (restos.length > 0) {
    throw new Error(
      `o dist/ do visual-kit importa biblioteca externa:\n  ${restos.join('\n  ')}\n` +
        'Provavel resto de build antigo — o `tsc` nao apaga o que sumiu do `src/`. ' +
        'Rode `pnpm --filter @vislow/visual-kit build`, que agora limpa o `dist/` antes.',
    );
  }
  console.log('visual-kit sem biblioteca externa.');
}

await main();
