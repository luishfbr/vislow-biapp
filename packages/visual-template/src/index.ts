import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Localizacao do scaffold e dos pacotes internos vendorizados.
 *
 * O worker de build monta um projeto `npm` a partir daqui. Este modulo existe
 * para que a API nao precise saber a estrutura de diretorios do template — o
 * dia em que ela mudar, muda so aqui.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Do `dist/` compilado, a raiz do pacote fica um nivel acima; rodando pelo
 * fonte (vitest), dois. Resolver por tentativa evita depender de qual dos dois
 * caminhos carregou o modulo.
 *
 * Sincrono de proposito: `await` no topo do modulo tornaria este pacote
 * assincrono para quem o importa, e o carregador de modulos do NestJS nao lida
 * bem com isso.
 */
function resolvePackageRoot(): string {
  for (const candidate of [join(HERE, '..'), join(HERE, '..', '..')]) {
    if (existsSync(join(candidate, 'template', 'package.json'))) return candidate;
  }
  throw new Error('Nao encontrei o diretorio `template/` do @vislow/visual-template.');
}

const PACKAGE_ROOT = resolvePackageRoot();

/** Scaffold estatico: tudo que e igual em todo visual gerado. */
export const TEMPLATE_DIR = join(PACKAGE_ROOT, 'template');

/** `@vislow/*` compilados, prontos para entrar em `node_modules`. */
export const VENDOR_DIR = join(PACKAGE_ROOT, 'vendor');

export class TemplateNotStagedError extends Error {
  constructor(detail: string) {
    super(
      `${detail} Rode \`pnpm build && pnpm --filter @vislow/visual-template stage:vendor\`.`,
    );
    this.name = 'TemplateNotStagedError';
  }
}

/** Falha cedo e com instrucao, em vez de deixar o `pbiviz` falhar no meio. */
export async function assertTemplateStaged(): Promise<void> {
  try {
    await stat(join(TEMPLATE_DIR, 'package-lock.json'));
  } catch {
    throw new TemplateNotStagedError('O template nao tem package-lock.json.');
  }

  try {
    const vendored = await readdir(join(VENDOR_DIR, '@vislow'));
    if (!vendored.includes('visual-kit') || !vendored.includes('config-schema')) {
      throw new Error('incompleto');
    }
  } catch {
    throw new TemplateNotStagedError('Os pacotes internos nao foram vendorizados.');
  }
}

/** Copia o scaffold para o diretorio de trabalho de um build. */
export async function copyTemplate(workdir: string): Promise<void> {
  await mkdir(workdir, { recursive: true });
  await cp(TEMPLATE_DIR, workdir, {
    recursive: true,
    // `node_modules` e `.tmp` podem existir se alguem rodou um build a mao
    // dentro do template. Copia-los levaria lixo — e possivelmente symlinks —
    // para dentro do build isolado.
    filter: (path) => !path.includes('node_modules') && !path.includes('.tmp'),
  });
}

/**
 * Instala os `@vislow/*` em `node_modules`.
 *
 * SEMPRE depois do `npm ci`: ele apaga `node_modules` inteiro antes de
 * instalar, entao vendorizar antes seria trabalho jogado fora — e o erro
 * apareceria so na resolucao do webpack, sem explicar nada.
 */
export async function vendorInternalPackages(workdir: string): Promise<void> {
  const target = join(workdir, 'node_modules', '@vislow');
  await mkdir(target, { recursive: true });
  await cp(join(VENDOR_DIR, '@vislow'), target, { recursive: true });
}
