import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertDepsStaged,
  linkDependencies,
  sweepBuildWorkdirs,
  TemplateNotStagedError,
} from './index.js';

/**
 * A store de dependencias e uma guarda, e guarda que nunca falhou nao e guarda
 * verificada: cada teste aqui QUEBRA de proposito o que ela protege.
 *
 * Os dois modos de falha nao sao equivalentes. Store ausente e barulhenta — a
 * build nem comeca. Store VELHA e silenciosa: o `pbiviz` compilaria contra as
 * dependencias de outro commit e o erro sairia como falha de tipo em codigo
 * gerado que esta correto.
 */

const LOCK = '{"lockfileVersion":3,"packages":{}}';

const temps: string[] = [];

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vislow-staging-'));
  temps.push(dir);
  return dir;
}

/** Um par store + template, com o stamp que quisermos. */
async function fixture(stampedLock: string | null): Promise<{ deps: string; template: string }> {
  const root = await scratch();
  const deps = join(root, 'deps');
  const template = join(root, 'template');

  await mkdir(join(deps, 'node_modules'), { recursive: true });
  await mkdir(template, { recursive: true });
  await writeFile(join(template, 'package-lock.json'), LOCK, 'utf8');

  if (stampedLock !== null) {
    const stamp = JSON.stringify({ lock: stampedLock, npm: '11.0.0' });
    await writeFile(join(deps, '.stamp.json'), stamp, 'utf8');
  }

  return { deps, template };
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('assertDepsStaged', () => {
  it('aceita a store que corresponde ao lockfile de hoje', async () => {
    const { deps, template } = await fixture(hashOf(LOCK));
    await expect(assertDepsStaged(deps, template)).resolves.toBeUndefined();
  });

  it('recusa store ausente, e diz o que rodar', async () => {
    const { deps, template } = await fixture(null);
    await expect(assertDepsStaged(deps, template)).rejects.toThrow(TemplateNotStagedError);
    await expect(assertDepsStaged(deps, template)).rejects.toThrow(/pnpm build/);
  });

  it('recusa store de um package-lock.json anterior', async () => {
    const { deps, template } = await fixture(hashOf('{"lockfileVersion":3,"packages":{"a":{}}}'));
    await expect(assertDepsStaged(deps, template)).rejects.toThrow(/anterior/);
  });

  it('recusa stamp corrompido em vez de confiar nele', async () => {
    const { deps, template } = await fixture(hashOf(LOCK));
    await writeFile(join(deps, '.stamp.json'), 'nao e json', 'utf8');
    await expect(assertDepsStaged(deps, template)).rejects.toThrow(TemplateNotStagedError);
  });
});

describe('linkDependencies', () => {
  /** Uma store minima com o que importa: arquivo, subdiretorio e `.bin`. */
  async function store(): Promise<string> {
    const source = join(await scratch(), 'node_modules');
    await mkdir(join(source, 'recharts', 'dist'), { recursive: true });
    await mkdir(join(source, '.bin'), { recursive: true });
    await writeFile(join(source, 'recharts', 'package.json'), '{"name":"recharts"}', 'utf8');
    await writeFile(join(source, 'recharts', 'dist', 'index.js'), 'export const x = 1;', 'utf8');
    await symlink(join('..', 'recharts', 'dist', 'index.js'), join(source, '.bin', 'recharts'));
    return source;
  }

  it('monta a arvore inteira no workdir', async () => {
    const source = await store();
    const workdir = await scratch();

    await linkDependencies(workdir, source);

    const built = join(workdir, 'node_modules', 'recharts', 'dist', 'index.js');
    expect(await readFile(built, 'utf8')).toBe('export const x = 1;');
  });

  it('usa hardlink: o arquivo montado E o arquivo da store', async () => {
    const source = await store();
    const workdir = await scratch();

    await linkDependencies(workdir, source);

    const origin = await stat(join(source, 'recharts', 'package.json'));
    const mounted = await stat(join(workdir, 'node_modules', 'recharts', 'package.json'));
    expect(mounted.ino).toBe(origin.ino);
  });

  it('nao deixa symlink no lugar de pacote — e o achado 39', async () => {
    const source = await store();
    const workdir = await scratch();

    await linkDependencies(workdir, source);

    // Um symlink aqui daria ao webpack (que roda com `resolve.symlinks: false`)
    // um segundo caminho para o mesmo pacote, e o bundle ganharia duas copias.
    const pkg = await lstat(join(workdir, 'node_modules', 'recharts'));
    expect(pkg.isSymbolicLink()).toBe(false);
    expect(pkg.isDirectory()).toBe(true);
  });

  it('preserva os symlinks relativos do .bin apontando para dentro do workdir', async () => {
    const source = await store();
    const workdir = await scratch();

    await linkDependencies(workdir, source);

    const bin = join(workdir, 'node_modules', '.bin', 'recharts');
    expect((await lstat(bin)).isSymbolicLink()).toBe(true);
    // Seguir o link no lugar de recria-lo faria os binarios da build apontarem
    // para a store — que e exatamente o caminho de fora que nao pode existir.
    expect(await readlink(bin)).toBe(join('..', 'recharts', 'dist', 'index.js'));
  });

  it('recusa montar quando a store nao existe', async () => {
    const workdir = await scratch();
    await expect(linkDependencies(workdir, join(workdir, 'nao-existe'))).rejects.toThrow(
      TemplateNotStagedError,
    );
  });
});

describe('sweepBuildWorkdirs', () => {
  /** Um workdir com a idade que quisermos, em horas. */
  async function aged(root: string, name: string, hours: number): Promise<string> {
    const path = join(root, name);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'ocupa-disco'), 'x', 'utf8');
    const when = new Date(Date.now() - hours * 60 * 60 * 1000);
    await utimes(path, when, when);
    return path;
  }

  it('recolhe o que sobrou de uma build morta e poupa a que esta em curso', async () => {
    const root = await scratch();
    await aged(root, 'build-morta', 3);
    await aged(root, 'build-viva', 0);

    await sweepBuildWorkdirs(root);

    expect(await readdir(root)).toEqual(['build-viva']);
  });

  it('nao toca em nada que nao seja workdir de build', async () => {
    const root = await scratch();
    await aged(root, 'deps', 99);

    await sweepBuildWorkdirs(root);

    expect(await readdir(root)).toEqual(['deps']);
  });

  it('em diretorio inexistente, nao faz nada em vez de falhar o build', async () => {
    const root = join(await scratch(), 'ainda-nao-existe');
    await expect(sweepBuildWorkdirs(root)).resolves.toBeUndefined();
  });
});
