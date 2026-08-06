import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { validateSpec, type VisualSpec } from '@vislow/component-registry';
import { generateCapabilities, generateProject } from '@vislow/codegen';
import { inspectPbiviz } from '@vislow/config-schema/packaging';
import {
  assertTemplateStaged,
  copyTemplate,
  createBuildWorkdir,
  linkDependencies,
  vendorInternalPackages,
} from '@vislow/visual-template';
import { MAX_JS_BYTES, MAX_PACKAGE_BYTES, describeBytes } from './budgets.js';
import { BuildFailure, type BuildStep } from './types.js';

/**
 * O pipeline de build. Uma spec entra, um `.pbiviz` verificado sai.
 *
 * Validar -> copiar scaffold -> codegen -> montar `node_modules` da store ->
 * vendorizar -> `pbiviz package` -> INSPECIONAR -> entregar.
 *
 * **Nenhum passo daqui usa a rede.** As dependencias sao instaladas uma vez, no
 * preparo (`stage:deps`), e a build so as monta por hardlink. Foi o que tirou o
 * `npm ci` de dentro do worker: la ele rodava com ambiente magro, sem proxy nem
 * CA corporativo, e falhava em maquina que instalava o repo sem problema.
 *
 * O passo de inspecao nao e opcional e nao e um teste: e um portao. Este projeto
 * ja documentou tres vezes que `pbiviz package` reporta sucesso produzindo
 * pacote quebrado. Um artefato que nao passa na inspecao nunca chega ao usuario
 * — vira `ARTIFACT_REJECTED`, com o numero que estourou.
 *
 * **RN-11 do lado do servidor:** nenhum codigo do usuario e executado nem
 * compilado como codigo. A spec e DADO; o `@vislow/codegen` emite JSX a partir
 * de uma whitelist (o registro de componentes), com todo valor saindo como
 * literal. As dependencias saem do lockfile do template, que o usuario nao
 * controla.
 */

export interface BuildOutcome {
  artifact: Buffer;
  fileName: string;
  packageBytes: number;
  jsBytes: number;
}

export interface PipelineOptions {
  /** Tempo duro do build inteiro. Estourou, o diretorio morre junto. */
  timeoutMs: number;
  /**
   * Chamado ao ENTRAR em cada etapa, nunca ao sair: o que o usuario espera ler e
   * o que esta acontecendo agora, e a etapa longa e justamente a que nao teria
   * aviso nenhum se o sinal fosse na conclusao.
   *
   * Opcional porque o pipeline roda sem plateia nos testes e no gate de aceite.
   */
  onStep?: (step: BuildStep) => void;
}

export const DEFAULT_TIMEOUT_MS = 180_000;

/** Id curto do build. E a impressao digital que aparece no canto do visual. */
export function createBuildId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Nome do arquivo entregue.
 *
 * O usuario reconhece o visual pelo nome que deu, nao pelo GUID. Mas o nome
 * atravessa um cabecalho HTTP e um sistema de arquivos, entao tudo que e
 * separador de caminho ou controle sai fora. O `Content-Disposition` no
 * controller ainda faz o proprio escape — este saneamento e o cinto, aquele e o
 * suspensorio.
 */
// eslint-disable-next-line no-control-regex -- os controles sao exatamente o que precisa sair
const UNSAFE_IN_FILENAME = /[\u0000-\u001f\u007f/\\:*?"<>|]/g;

export function artifactFileName(name: string): string {
  const safe = name.replace(UNSAFE_IN_FILENAME, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `${safe === '' ? 'visual' : safe}.pbiviz`;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Falha de um processo externo, com os logs presos ao erro.
 *
 * Classe propria em vez de anexar campos ao erro do `execFile`: o que interessa
 * — `killed` e as saidas — passa a ser tipado, e quem faz `catch` nao precisa
 * adivinhar o formato do que veio.
 */
class ProcessFailure extends Error {
  constructor(
    message: string,
    public readonly killed: boolean,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'ProcessFailure';
  }
}

/** Ultimas linhas de um log. O comeco de um log de webpack nunca diz o motivo. */
function tail(text: string, lines = 30): string {
  return text.split('\n').slice(-lines).join('\n').trim();
}

function run(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        // Logs de webpack sao grandes; truncar aqui esconderia justamente o
        // trecho que explica a falha.
        maxBuffer: 64 * 1024 * 1024,
        env: options.env,
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        if (error) {
          // `killed` distingue "estourou o tempo" de "saiu com codigo != 0" —
          // sao erros diferentes para o usuario e merecem codigos diferentes.
          reject(new ProcessFailure(error.message, error.killed === true, stdout, stderr));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function isTimeout(error: unknown): boolean {
  return error instanceof ProcessFailure && error.killed;
}

function logsOf(error: unknown): string {
  if (!(error instanceof ProcessFailure)) {
    return error instanceof Error ? error.message : '';
  }
  return tail(`${error.stdout}\n${error.stderr}`);
}

/**
 * O compilador, chamado pelo MESMO node que roda a API — nunca por `npx`.
 *
 * No Windows o `npx` e um `npx.cmd`, e desde a correcao do CVE-2024-27980 o
 * `execFile` do Node recusa executar `.cmd` sem `shell: true`. O sintoma e um
 * `spawn npx ENOENT` que nao menciona nem o Windows nem o `.cmd` — e em macOS e
 * Linux nada disso acontece, entao a falha e invisivel para quem desenvolve
 * fora do Windows.
 *
 * Chamar o `bin/pbiviz.js` direto tambem e mais honesto: `npx` resolveria o
 * binario por PATH e por node_modules, e nos sabemos exatamente onde ele esta —
 * `linkDependencies` acabou de monta-lo ali.
 */
function pbivizCli(workdir: string): string {
  return join(workdir, 'node_modules', 'powerbi-visuals-tools', 'bin', 'pbiviz.js');
}

/**
 * Variaveis sem as quais o Node nao roda no Windows.
 *
 * `SystemRoot` e a critica — sem ela o proprio runtime falha em chamadas
 * nativas, com erro que nao cita variavel nenhuma. As outras sao caminho de
 * sistema, nao segredo: um ambiente magro demais no Windows quebra o compilador
 * antes de ele comecar.
 */
const WINDOWS_ESSENTIALS = ['SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE'];

/**
 * Ambiente do processo de build.
 *
 * Deliberadamente magro. O que importa nao e economizar variaveis e sim NAO
 * repassar segredo do servidor para um processo que compila fonte gerada a
 * partir de entrada de usuario.
 *
 * NAO defina NODE_ENV=production aqui. O npm leria isso como `--omit=dev` e
 * trataria o `powerbi-visuals-tools` — uma devDependency — como ausente. O
 * sintoma nao aponta para nada disso: vira um 404 do registro tentando BAIXAR
 * um pacote chamado `pbiviz` (achado 42).
 */
function buildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
  };

  if (process.platform === 'win32') {
    for (const name of WINDOWS_ESSENTIALS) {
      const value = process.env[name];
      if (value !== undefined) env[name] = value;
    }
  }

  return env;
}

export async function runBuildPipeline(
  spec: VisualSpec,
  buildId: string,
  options: PipelineOptions = { timeoutMs: DEFAULT_TIMEOUT_MS },
): Promise<BuildOutcome> {
  const step = (name: BuildStep): void => {
    options.onStep?.(name);
  };

  // 1. Validacao. Antes de tocar o disco: uma spec invalida nao merece um
  //    diretorio temporario, e o erro precisa citar o CAMPO, nao o build.
  step('validating');
  const validation = validateSpec(spec);
  if (validation.kind === 'invalid') {
    throw new BuildFailure('SPEC_INVALID', 'A spec do visual nao e valida.', {
      issues: validation.issues,
    });
  }

  try {
    await assertTemplateStaged();
  } catch (error) {
    throw new BuildFailure(
      'TEMPLATE_NOT_STAGED',
      error instanceof Error ? error.message : 'Template nao preparado.',
    );
  }

  const deadline = Date.now() + options.timeoutMs;
  const remaining = (): number => Math.max(1, deadline - Date.now());
  const env = buildEnv();

  // Diretorio proprio por build, destruido no `finally` — inclusive quando
  // estoura o tempo. E o isolamento minimo: dois builds simultaneos nunca veem
  // o `node_modules` um do outro.
  const workdir = await createBuildWorkdir();

  try {
    // 2. Scaffold estatico.
    step('generating');
    await copyTemplate(workdir);

    // 3. Codegen: os tres arquivos que distinguem um visual de outro.
    // O scaffold ja traz `src/`, entao nao ha diretorio novo a criar.
    for (const file of generateProject(validation.spec, buildId)) {
      await writeFile(join(workdir, file.path), file.contents, 'utf8');
    }

    // 4. Dependencias: hardlink da store, sem rede e sem npm. A arvore vem do
    //    lockfile do template — nunca da spec do usuario.
    step('linking');
    try {
      await linkDependencies(workdir);
    } catch (error) {
      throw new BuildFailure('INSTALL_FAILED', 'Falha ao montar as dependencias do build.', {
        detail: error instanceof Error ? error.message : '',
      });
    }

    // 5. Pacotes internos — DEPOIS do passo 4, que e quem cria `node_modules`.
    await vendorInternalPackages(workdir);

    // 6. Compilacao de verdade.
    step('compiling');
    try {
      await run(process.execPath, [pbivizCli(workdir), 'package'], {
        cwd: workdir,
        timeoutMs: remaining(),
        env,
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new BuildFailure('TIMEOUT', 'A compilacao estourou o tempo.');
      }
      // O `pbiviz` imprime `error` de certificado e mesmo assim conclui com
      // sucesso; quando ele falha de verdade, o motivo esta nas ultimas linhas.
      throw new BuildFailure('COMPILE_FAILED', 'A compilacao do visual falhou.', {
        detail: logsOf(error),
      });
    }

    // 7. Portao. Nada sai daqui sem passar.
    step('inspecting');
    const artifact = await readArtifact(workdir);
    const outcome = await inspectArtifact(artifact, validation.spec);
    return { ...outcome, fileName: artifactFileName(validation.spec.project.name) };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function readArtifact(workdir: string): Promise<Buffer> {
  const dist = join(workdir, 'dist');
  let candidates: string[];
  try {
    candidates = (await readdir(dist)).filter((file) => file.endsWith('.pbiviz'));
  } catch {
    throw new BuildFailure(
      'ARTIFACT_REJECTED',
      'A compilacao terminou sem criar o diretorio dist/.',
    );
  }

  // Exatamente um: zero significa que o `pbiviz` mentiu sobre o sucesso, e mais
  // de um significa que sobrou artefato de outra build no mesmo diretorio —
  // impossivel por construcao hoje, mas entregar "algum" seria pior que falhar.
  if (candidates.length !== 1 || candidates[0] === undefined) {
    throw new BuildFailure(
      'ARTIFACT_REJECTED',
      `Esperava 1 arquivo .pbiviz em dist/, encontrei ${String(candidates.length)}.`,
    );
  }

  return readFile(join(dist, candidates[0]));
}

/**
 * Os mapeamentos do capabilities lido do zip, sem confiar no formato.
 *
 * O portao inspeciona de FORA (ADR-11): o que vier do pacote e `unknown` de
 * verdade, e um formato inesperado nao pode explodir o worker — ele so nao tem
 * condicao para conferir.
 */
function asMappings(capabilities: unknown): { conditions?: Record<string, unknown>[] }[] {
  if (typeof capabilities !== 'object' || capabilities === null) return [];
  const mappings = (capabilities as { dataViewMappings?: unknown }).dataViewMappings;
  if (!Array.isArray(mappings)) return [];
  return mappings.filter(
    (mapping): mapping is { conditions?: Record<string, unknown>[] } =>
      typeof mapping === 'object' && mapping !== null,
  );
}

/**
 * Confere o artefato contra a spec que o pediu.
 *
 * Cada assertiva aqui corresponde a uma falha que este projeto ja pagou: GUID
 * que nao e identificador JS (o bundle nem carrega), identidade divergente entre
 * `package.json` e recurso (o Power BI recusa), orcamento estourado (o import e
 * recusado sem dizer por que).
 */
async function inspectArtifact(
  artifact: Buffer,
  spec: VisualSpec,
): Promise<Omit<BuildOutcome, 'fileName'>> {
  const inspection = await inspectPbiviz(artifact);
  const reject = (message: string): never => {
    throw new BuildFailure('ARTIFACT_REJECTED', message);
  };

  const { packageIdentity, resourceIdentity } = inspection;
  const expected = generateCapabilities(spec);

  if (packageIdentity.guid !== spec.project.id) {
    reject(
      `O GUID do pacote (${packageIdentity.guid}) nao e o do projeto (${spec.project.id}).`,
    );
  }
  if (packageIdentity.guid !== resourceIdentity.guid) {
    reject('A identidade do package.json diverge da identidade do recurso.');
  }
  if (packageIdentity.displayName !== spec.project.name) {
    reject(`O nome exibido do pacote e "${packageIdentity.displayName}".`);
  }
  if (packageIdentity.version !== spec.project.packageVersion) {
    reject(`A versao do pacote e ${packageIdentity.version}.`);
  }
  if (inspection.resourcePath !== inspection.declaredResourcePath) {
    reject('O recurso declarado no package.json nao e o recurso presente no zip.');
  }
  // O GUID e nome de variavel JS no `visualPlugin.ts` gerado, nao um UUID.
  if (!new RegExp(`var ${packageIdentity.guid}\\b`).test(inspection.js)) {
    reject('O GUID nao aparece como variavel no bundle — o visual nao carregaria.');
  }
  // ADR-02: sem o CSS pre-compilado o visual importa, renderiza e sai sem
  // estilo nenhum. O `pbiviz` reporta sucesso do mesmo jeito.
  if (!inspection.js.includes('vsl-')) {
    reject('O bundle nao contem as classes do visual-kit — o CSS nao entrou.');
  }
  // O capabilities do PACOTE, nao o que o codegen diz ter gerado. Sem esta
  // assertiva um pacote importa, renderiza e mesmo assim recusa todo arrasto de
  // campo — foi exatamente o que aconteceu, e nenhuma das guardas anteriores
  // olhava para dentro do zip. O plugin do `pbiviz` so reescreve capabilities de
  // visual de script (`dataViewMappings[0].scriptResult`), que nunca e o caso
  // aqui, entao a igualdade estrita e a comparacao certa.
  if (!isDeepStrictEqual(inspection.capabilities, JSON.parse(JSON.stringify(expected)))) {
    reject('O capabilities.json dentro do pacote nao e o que o codegen gerou para esta spec.');
  }
  // Uma condicao com `min` trava os pocos de campo: o host recusa todo estado
  // intermediario do arrasto, em silencio, e o visual nunca recebe dado nenhum.
  for (const mapping of asMappings(inspection.capabilities)) {
    for (const condition of mapping.conditions ?? []) {
      for (const [role, range] of Object.entries(condition)) {
        if (range !== null && typeof range === 'object' && 'min' in range) {
          reject(`A condicao do papel "${role}" declara "min" — isso trava o arrasto no host.`);
        }
      }
    }
  }
  if (inspection.packageBytes > MAX_PACKAGE_BYTES) {
    reject(
      `O pacote tem ${describeBytes(inspection.packageBytes)}, acima do limite de ${describeBytes(MAX_PACKAGE_BYTES)}.`,
    );
  }
  if (inspection.jsBytes > MAX_JS_BYTES) {
    reject(
      `O content.js tem ${describeBytes(inspection.jsBytes)}, acima do limite de ${describeBytes(MAX_JS_BYTES)}.`,
    );
  }

  return {
    artifact,
    packageBytes: inspection.packageBytes,
    jsBytes: inspection.jsBytes,
  };
}
