/**
 * Instala UMA VEZ as dependencias que toda build do template consome.
 *
 * PORQUE ISTO EXISTE. As 548 entradas do lockfile do template sao identicas em
 * toda build — nada nelas depende da spec do usuario. Reinstala-las por build
 * custava a maior fatia do tempo e, pior, exigia REDE dentro do worker.
 *
 * E o worker roda com um ambiente deliberadamente magro (`buildEnv` no
 * pipeline): so `PATH`, `HOME` e o que for do npm. Sem `HTTP_PROXY` e sem
 * `NODE_EXTRA_CA_CERTS`, um `npm ci` atras de proxy corporativo ou de TLS
 * interceptado nao alcanca o registro — foi assim que uma maquina nova ficou
 * presa em `INSTALL_FAILED` enquanto o `pnpm install` do repo funcionava nela.
 *
 * Este script roda no PREPARO, no shell de quem desenvolve, com o ambiente
 * inteiro: proxy, CA e `~/.npmrc` valem aqui. A build passa a so MONTAR o
 * `node_modules` a partir do que ja esta no disco (`linkDependencies`), e deixa
 * de precisar de rede.
 *
 * `deps/` e um projeto npm de verdade — package.json + lockfile + node_modules
 * plano — e nao uma copia do `template/`: o scaffold e copiado por build e nao
 * pode carregar `node_modules` junto (`copyTemplate` filtra exatamente isso).
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Como chamar o npm sem depender do sistema operacional.
 *
 * No Windows o npm e um `npm.cmd`, e desde a correcao do CVE-2024-27980 o
 * `execFile` do Node RECUSA executar `.cmd` sem `shell: true` — o erro sai como
 * `spawn npm ENOENT`, que nao menciona nem o Windows nem o `.cmd`. Em macOS e
 * Linux nada disso aparece, entao a falha e invisivel para quem desenvolve fora
 * do Windows. Os argumentos aqui sao todos literais nossos: nao ha entrada de
 * usuario para o shell interpretar.
 */
const IS_WINDOWS = process.platform === 'win32';
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';
const NPM_OPTIONS = IS_WINDOWS ? { shell: true } : {};

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PKG = join(HERE, '..');
const TEMPLATE = join(TEMPLATE_PKG, 'template');
const DEPS = join(TEMPLATE_PKG, 'deps');
const STAMP = join(DEPS, '.stamp.json');

/** Os dois arquivos que definem a arvore instalada. Nada mais e copiado. */
const MANIFEST = ['package.json', 'package-lock.json'];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * A identidade da store.
 *
 * O lockfile responde "quais pacotes"; a versao do npm responde "com qual
 * layout" — `npm ci` de versoes diferentes nao produz o mesmo `node_modules`.
 * Os dois juntos sao o que torna "a store esta atualizada" uma pergunta com
 * resposta, em vez de uma suposicao.
 */
async function fingerprint() {
  const lock = await readFile(join(TEMPLATE, 'package-lock.json'));
  const { stdout } = await run(NPM, ['--version'], NPM_OPTIONS);
  return {
    lock: createHash('sha256').update(lock).digest('hex'),
    npm: stdout.trim(),
  };
}

async function readStamp() {
  try {
    return JSON.parse(await readFile(STAMP, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const wanted = await fingerprint();
  const current = await readStamp();

  // Sair cedo e o que torna barato ser dependencia de `pnpm dev`: o caso comum
  // e a store ja pronta, e nele este script custa um hash e uma leitura.
  if (
    current?.lock === wanted.lock &&
    current?.npm === wanted.npm &&
    (await exists(join(DEPS, 'node_modules')))
  ) {
    console.log('store de dependencias ja preparada.');
    return;
  }

  // O stamp sai ANTES do install. Um `npm ci` interrompido no meio deixa
  // `node_modules` pela metade; sem apagar o stamp, a proxima execucao acharia
  // que esta tudo pronto e a falha apareceria la na frente, no `pbiviz`.
  await rm(STAMP, { force: true });
  await mkdir(DEPS, { recursive: true });
  for (const file of MANIFEST) {
    await cp(join(TEMPLATE, file), join(DEPS, file));
  }

  console.log('instalando as dependencias do template (so na primeira vez)...');
  const started = Date.now();

  try {
    // `--include=dev` explicito: o `powerbi-visuals-tools` e devDependency do
    // template, e sem ele nao ha compilador (achado 42). O env NAO e filtrado
    // aqui — e justamente o ponto: proxy e CA do ambiente valem.
    await run(NPM, ['ci', '--include=dev', '--no-audit', '--no-fund'], {
      ...NPM_OPTIONS,
      cwd: DEPS,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    // O log inteiro, e nao um resumo: e aqui que um proxy ou um certificado
    // corporativo se revela, e a mensagem do npm e a unica que sabe qual dos
    // dois foi.
    console.error(`\n${error.stdout ?? ''}\n${error.stderr ?? ''}`);

    // Sem log nenhum e com ENOENT, o npm nem chegou a rodar: o problema e
    // ACHAR o npm, nao instalar. Sao dois problemas diferentes e a mensagem
    // precisa distinguir, senao a proxima pessoa vai caçar proxy por horas.
    const detail =
      error.code === 'ENOENT'
        ? `Nao encontrei o executavel \`${NPM}\` no PATH.`
        : 'O log do npm esta acima — atras de proxy ou de TLS interceptado, configure ' +
          '`npm config set proxy/https-proxy/cafile`.';

    throw new Error(`Falha ao preparar as dependencias do template. ${detail}`, { cause: error });
  }

  await writeFile(STAMP, `${JSON.stringify(wanted, null, 2)}\n`, 'utf8');
  console.log(`store de dependencias pronta em ${String(Date.now() - started)} ms.`);
}

await main();
