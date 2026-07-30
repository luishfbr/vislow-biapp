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
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PKG = join(HERE, '..');
const REPO = join(TEMPLATE_PKG, '..', '..');
const VENDOR = join(TEMPLATE_PKG, 'vendor', '@vislow');

/**
 * O que copiar de cada pacote.
 *
 * `packaging/` do config-schema fica de FORA: e onde vive o `buildPbiviz`, que
 * importa JSZip. O visual nunca chama esse caminho, mas basta o arquivo existir
 * para que uma importacao distraida arraste JSZip para dentro do bundle, contra
 * o orcamento de 1 MB. Nao copiar torna o invariante fisico em vez de confiado.
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
}

await main();
