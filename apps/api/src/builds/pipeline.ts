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

export interface BuildOutcome {
  artifact: Buffer;
  fileName: string;
  packageBytes: number;
  jsBytes: number;
}

export interface PipelineOptions {
  timeoutMs: number;
  onStep?: (step: BuildStep) => void;
}

export const DEFAULT_TIMEOUT_MS = 180_000;

export function createBuildId(): string {
  return randomBytes(4).toString('hex');
}

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
        maxBuffer: 64 * 1024 * 1024,
        env: options.env,
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        if (error) {
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

/** Chamado pelo MESMO node que roda a API, nunca por `npx` — ver docs/backend.md. */
function pbivizCli(workdir: string): string {
  return join(workdir, 'node_modules', 'powerbi-visuals-tools', 'bin', 'pbiviz.js');
}

// `SystemRoot` e a critica: sem ela o proprio runtime do Node falha em chamadas nativas.
const WINDOWS_ESSENTIALS = ['SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE'];

/** Deliberadamente magro: o que importa e NAO repassar segredo do servidor ao processo de build. */
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

  const workdir = await createBuildWorkdir();

  try {
    step('generating');
    await copyTemplate(workdir);

    for (const file of generateProject(validation.spec, buildId)) {
      await writeFile(join(workdir, file.path), file.contents, 'utf8');
    }

    step('linking');
    try {
      await linkDependencies(workdir);
    } catch (error) {
      throw new BuildFailure('INSTALL_FAILED', 'Falha ao montar as dependencias do build.', {
        detail: error instanceof Error ? error.message : '',
      });
    }

    await vendorInternalPackages(workdir);

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
      throw new BuildFailure('COMPILE_FAILED', 'A compilacao do visual falhou.', {
        detail: logsOf(error),
      });
    }

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

  if (candidates.length !== 1 || candidates[0] === undefined) {
    throw new BuildFailure(
      'ARTIFACT_REJECTED',
      `Esperava 1 arquivo .pbiviz em dist/, encontrei ${String(candidates.length)}.`,
    );
  }

  return readFile(join(dist, candidates[0]));
}

function asMappings(capabilities: unknown): { conditions?: Record<string, unknown>[] }[] {
  if (typeof capabilities !== 'object' || capabilities === null) return [];
  const mappings = (capabilities as { dataViewMappings?: unknown }).dataViewMappings;
  if (!Array.isArray(mappings)) return [];
  return mappings.filter(
    (mapping): mapping is { conditions?: Record<string, unknown>[] } =>
      typeof mapping === 'object' && mapping !== null,
  );
}

/** O portao inspeciona de FORA (ADR-11). Cada assertiva corresponde a uma falha que este projeto ja pagou. */
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
  if (!new RegExp(`var ${packageIdentity.guid}\\b`).test(inspection.js)) {
    reject('O GUID nao aparece como variavel no bundle — o visual nao carregaria.');
  }
  if (!inspection.js.includes('vsl-')) {
    reject('O bundle nao contem as classes do visual-kit — o CSS nao entrou.');
  }
  if (!isDeepStrictEqual(inspection.capabilities, JSON.parse(JSON.stringify(expected)))) {
    reject('O capabilities.json dentro do pacote nao e o que o codegen gerou para esta spec.');
  }
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
