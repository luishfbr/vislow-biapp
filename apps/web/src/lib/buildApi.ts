import {
  isTerminal,
  type BuildErrorCode,
  type BuildMetrics,
  type BuildRecord,
  type CreateBuildResponse,
} from '@vislow/build-contract';
import type { VisualSpec } from '@vislow/component-registry';
import type { ValidationIssue } from '@vislow/config-schema';

/**
 * Cliente da API de build (RF-11 / RF-12).
 *
 * Depois do ADR-08 o `.pbiviz` deixa de ser montado no browser por patch: o
 * editor manda a arvore e o servidor COMPILA um projeto de verdade. O que era
 * `buildPbiviz` virou tres chamadas HTTP — e a espera, que antes nao existia,
 * passou a ser parte da interface.
 *
 * RN-02: sobe a spec, que e desenho. Nenhum dado do modelo do Power BI passa por
 * aqui — o editor nem tem acesso a ele.
 */

const API_BASE = (process.env.NEXT_PUBLIC_VISLOW_API_URL ?? 'http://localhost:3001').replace(
  /\/+$/,
  '',
);

/** Intervalo entre consultas. A build medida leva ~12 s; 1 s da granularidade sem inundar. */
const POLL_INTERVAL_MS = 1000;

/**
 * Teto de espera do CLIENTE. Maior que o timeout do servidor de proposito: quem
 * decide que uma build morreu e o servidor, que sabe o motivo. Este limite so
 * existe para o caso de o servidor sumir no meio.
 */
const POLL_TIMEOUT_MS = 240_000;

/** Fases visiveis do export. Discriminante de string, como no resto do projeto. */
export type BuildPhase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'queued' }
  | { kind: 'compiling' }
  | { kind: 'done'; fileName: string; metrics: BuildMetrics | null }
  | { kind: 'error'; message: string; hint: string | null; issues: ValidationIssue[] };

export type BuildOutcome =
  | { kind: 'ok'; fileName: string; blob: Blob; metrics: BuildMetrics | null }
  | { kind: 'error'; message: string; hint: string | null; issues: ValidationIssue[] };

class ApiUnreachableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Nao foi possivel falar com a API de build.', options);
    this.name = 'ApiUnreachableError';
  }
}

/**
 * Mensagem para humano a partir do codigo da API.
 *
 * O `switch` e exaustivo por compilador (`switch-exhaustiveness-check` +
 * `BuildErrorCode` vindo do contrato compartilhado): um codigo novo no servidor
 * quebra o build do editor em vez de virar "erro desconhecido" na tela.
 */
function describeCode(code: BuildErrorCode, detail: string | undefined): {
  message: string;
  hint: string | null;
} {
  switch (code) {
    case 'SPEC_INVALID':
      return {
        message: 'A composicao tem campos pendentes e nao pode ser compilada.',
        hint: 'Os problemas estao marcados na arvore.',
      };
    case 'INSTALL_FAILED':
      return {
        message: 'O servidor nao conseguiu preparar as dependencias da build.',
        hint: detail ?? 'Falha de infraestrutura — tente de novo em instantes.',
      };
    case 'COMPILE_FAILED':
      return {
        message: 'A compilacao do visual falhou.',
        hint: detail ?? 'O log completo esta no servidor.',
      };
    case 'ARTIFACT_REJECTED':
      // O pacote existe e foi DESCARTADO de proposito (ADR-11). Vale dizer isso:
      // "falhou" sugere tentar de novo; "reprovado na inspecao" sugere reportar.
      return {
        message: 'O pacote gerado nao passou na inspecao e nao foi entregue.',
        hint: detail ?? 'Reporte este caso — o artefato foi barrado antes do download.',
      };
    case 'TIMEOUT':
      return {
        message: 'A build passou do tempo limite.',
        hint: 'Simplifique a composicao ou tente de novo.',
      };
    case 'TEMPLATE_NOT_STAGED':
      return {
        message: 'O servidor de build nao esta preparado.',
        hint: 'Rode `pnpm build && pnpm stage:vendor` antes de subir a API.',
      };
  }
}

function describeFailure(error: unknown): BuildOutcome & { kind: 'error' } {
  if (error instanceof ApiUnreachableError) {
    return {
      kind: 'error',
      message: 'A API de build nao respondeu.',
      hint: `Rode \`pnpm dev:api\` e confirme que ela ouve em ${API_BASE}.`,
      issues: [],
    };
  }
  return {
    kind: 'error',
    message: 'Nao foi possivel gerar o pacote.',
    hint: error instanceof Error ? error.message : null,
    issues: [],
  };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch (cause) {
    throw new ApiUnreachableError({ cause });
  }
}

/** Corpo de erro da API, quando ele existe e e legivel. */
async function readError(response: Response): Promise<{
  code?: BuildErrorCode;
  message?: string;
  issues?: ValidationIssue[];
}> {
  try {
    return (await response.json()) as { code?: BuildErrorCode; message?: string };
  } catch {
    return {};
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Compila a spec e devolve o pacote.
 *
 * Nao lanca: devolve o erro descrito para a interface mostrar. Um export que
 * falha em silencio deixaria o usuario sem saber se o download aconteceu.
 */
export async function requestBuild(
  spec: VisualSpec,
  onPhase: (phase: BuildPhase) => void,
): Promise<BuildOutcome> {
  try {
    onPhase({ kind: 'uploading' });

    const created = await request('/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec }),
    });

    if (!created.ok) {
      const body = await readError(created);
      const described = describeCode(body.code ?? 'SPEC_INVALID', body.message);
      return { kind: 'error', ...described, issues: body.issues ?? [] };
    }

    const { buildId } = (await created.json()) as CreateBuildResponse;
    const record = await pollUntilTerminal(buildId, onPhase);

    if (record.status === 'failed') {
      const failure = record.error;
      const described = describeCode(failure?.code ?? 'COMPILE_FAILED', failure?.detail);
      return { kind: 'error', ...described, issues: failure?.issues ?? [] };
    }

    const artifact = await request(`/builds/${buildId}/artifact`);
    if (!artifact.ok) {
      const body = await readError(artifact);
      return {
        kind: 'error',
        message: 'A build terminou mas o pacote nao pode ser baixado.',
        hint: body.message ?? null,
        issues: [],
      };
    }

    const metrics = record.metrics ?? null;
    return { kind: 'ok', fileName: record.fileName, blob: await artifact.blob(), metrics };
  } catch (error) {
    return describeFailure(error);
  }
}

async function pollUntilTerminal(
  buildId: string,
  onPhase: (phase: BuildPhase) => void,
): Promise<BuildRecord> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  for (;;) {
    const response = await request(`/builds/${buildId}`);
    if (!response.ok) throw new Error(`A build ${buildId} sumiu do servidor.`);

    const record = (await response.json()) as BuildRecord;
    if (isTerminal(record.status)) return record;

    // `queued` e `compiling` sao fases diferentes para o usuario: uma diz "a fila
    // esta ocupada", a outra diz "e a sua vez e esta demorando".
    onPhase({ kind: record.status === 'queued' ? 'queued' : 'compiling' });

    if (Date.now() > deadline) {
      throw new Error('A API parou de responder sobre esta build.');
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
