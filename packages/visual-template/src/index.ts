import { constants, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  cp,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
} from 'node:fs/promises';
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

/**
 * As dependencias do template, instaladas UMA VEZ por `scripts/stage-deps.mjs`.
 *
 * Toda build monta seu `node_modules` a partir daqui em vez de rodar `npm ci` —
 * a arvore e identica em toda build, e instala-la no preparo tira a REDE de
 * dentro do worker, que roda com ambiente magro e sem proxy.
 */
export const DEPS_DIR = join(PACKAGE_ROOT, 'deps');

/**
 * Onde cada build trabalha.
 *
 * Dentro do proprio pacote, e nao em `os.tmpdir()`, por um motivo mecanico:
 * hardlink so existe dentro de um mesmo filesystem. Vizinho da store, o caminho
 * rapido de `linkDependencies` vale sempre, em vez de valer conforme a maquina.
 */
const BUILD_TMP_DIR = join(PACKAGE_ROOT, '.tmp');

export class TemplateNotStagedError extends Error {
  constructor(detail: string, command = 'pnpm build') {
    super(`${detail} Rode \`${command}\`.`);
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

  await assertDepsStaged();
}

/**
 * A store existe E corresponde ao lockfile de hoje.
 *
 * As duas metades importam. Store ausente e obvia; store VELHA e o modo de
 * falha caro — o `pbiviz` compilaria contra as dependencias de outro commit e
 * o sintoma apareceria como erro de tipo em codigo gerado que esta correto.
 *
 * So o hash do lockfile e conferido aqui: a versao do npm tambem entra no stamp,
 * mas descobri-la custa um subprocesso, e quem decide reinstalar e o script de
 * preparo, nao o servidor.
 */
export async function assertDepsStaged(
  depsDir: string = DEPS_DIR,
  templateDir: string = TEMPLATE_DIR,
): Promise<void> {
  const stamped = await readStampedLock(depsDir);
  if (stamped === null || !existsSync(join(depsDir, 'node_modules'))) {
    throw new TemplateNotStagedError('As dependencias do template nao foram instaladas.');
  }

  const lock = await readFile(join(templateDir, 'package-lock.json'));
  if (createHash('sha256').update(lock).digest('hex') !== stamped) {
    throw new TemplateNotStagedError(
      'A store de dependencias e de um package-lock.json anterior.',
    );
  }
}

async function readStampedLock(depsDir: string): Promise<string | null> {
  try {
    const stamp: unknown = JSON.parse(await readFile(join(depsDir, '.stamp.json'), 'utf8'));
    const lock = (stamp as { lock?: unknown }).lock;
    return typeof lock === 'string' ? lock : null;
  } catch {
    return null;
  }
}

/** Diretorio isolado para uma build, vizinho da store. */
export async function createBuildWorkdir(): Promise<string> {
  await mkdir(BUILD_TMP_DIR, { recursive: true });
  await sweepBuildWorkdirs();
  return mkdtemp(join(BUILD_TMP_DIR, 'build-'));
}

/**
 * Uma hora — vinte vezes o teto de uma build.
 *
 * A margem e o que torna a varredura segura sem coordenacao nenhuma: um
 * diretorio mais velho que isto nao tem como pertencer a um build em curso.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Recolhe workdir de build que morreu sem passar pelo `finally`.
 *
 * O pipeline apaga o diretorio dele mesmo, inclusive quando estoura o tempo —
 * mas nao quando o processo leva um SIGKILL. Enquanto isso vivia em
 * `os.tmpdir()`, o sistema operacional recolhia; vizinho da store, dentro do
 * repositorio, ninguem recolhe. Sem esta varredura o disco de quem desenvolve
 * acumularia uma arvore de ~190 MB por interrupcao.
 */
export async function sweepBuildWorkdirs(
  root: string = BUILD_TMP_DIR,
  maxAgeMs: number = STALE_AFTER_MS,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  const deadline = Date.now() - maxAgeMs;

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith('build-'))
      .map(async (entry) => {
        const path = join(root, entry);
        try {
          const info = await stat(path);
          if (info.mtimeMs < deadline) await rm(path, { recursive: true, force: true });
        } catch {
          // Sumiu no meio do caminho, ou e de outro dono. Varredura oportunista
          // nao e lugar de falhar um build.
        }
      }),
  );
}

/**
 * Monta o `node_modules` da build a partir da store.
 *
 * HARDLINK, nao symlink. O webpack do `pbiviz` roda com `resolve.symlinks:
 * false`: ele nao resolve link para realpath, e dois caminhos para o mesmo
 * pacote entram no bundle como dois modulos — o achado 39, que ja custou os
 * hooks do React dentro do visual. Hardlink nao cria caminho novo, cria nome
 * novo para o mesmo arquivo: o webpack ve uma arvore comum de arquivos reais.
 *
 * O barato aqui e o ponto: montar ~500 pacotes custa milissegundos e nenhum
 * byte de disco, contra o `npm ci` por build que isto substituiu.
 *
 * Quem escrever POR CIMA de um arquivo desses estara escrevendo na store — mas
 * nenhum passo do pipeline edita `node_modules` no lugar (o `pbiviz` so le, e o
 * `vendorInternalPackages` cria arquivo novo), e o `rm -rf` do fim so desfaz
 * nomes. Se um dia isso mudar, o sintoma e a store corrompida: apague `deps/` e
 * rode o preparo de novo.
 */
export async function linkDependencies(
  workdir: string,
  source: string = join(DEPS_DIR, 'node_modules'),
): Promise<void> {
  if (!existsSync(source)) {
    throw new TemplateNotStagedError('As dependencias do template nao foram instaladas.');
  }
  await cloneTree(source, join(workdir, 'node_modules'));
}

async function cloneTree(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });

  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);

    if (entry.isDirectory()) {
      await cloneTree(from, to);
    } else if (entry.isSymbolicLink()) {
      // `node_modules/.bin` e feito de symlinks RELATIVOS. Recriar o link
      // preserva o alvo dentro da arvore nova; segui-lo apontaria para a store.
      await symlink(await readlink(from), to);
    } else {
      await linkOrCopy(from, to);
    }
  }
}

/**
 * O caminho rapido, com a queda prevista.
 *
 * `EXDEV` acontece se a store e o workdir cairem em filesystems diferentes;
 * `EPERM` e `EMLINK`, em sistemas de arquivos que limitam hardlink. Cair para
 * copia deixa a build mais lenta e correta, em vez de rapida e quebrada —
 * `COPYFILE_FICLONE` ainda evita a copia real em APFS e btrfs.
 */
async function linkOrCopy(from: string, to: string): Promise<void> {
  try {
    await link(from, to);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EMLINK') throw error;
    await cp(from, to, { mode: constants.COPYFILE_FICLONE });
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
 * SEMPRE depois de `linkDependencies`, que e quem cria o `node_modules` da
 * build. Antes dele nao ha diretorio onde escrever, e o erro apareceria so na
 * resolucao do webpack, sem explicar nada.
 *
 * Copia de verdade, e nao hardlink: estes sao os unicos arquivos de
 * `node_modules` que mudam entre um build e outro do mesmo servidor.
 */
export async function vendorInternalPackages(workdir: string): Promise<void> {
  const target = join(workdir, 'node_modules', '@vislow');
  await mkdir(target, { recursive: true });
  await cp(join(VENDOR_DIR, '@vislow'), target, { recursive: true });
}
