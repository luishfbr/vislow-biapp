import type { ValidationIssue } from '@vislow/config-schema';

/**
 * Estado de uma build.
 *
 * Discriminante de STRING, como todo o resto do projeto. Aqui o motivo nao e a
 * toolchain do pbiviz e sim o mesmo beneficio: o cliente faz `switch` sobre
 * `status` e o compilador cobra os casos.
 */
export type BuildStatus = 'queued' | 'running' | 'done' | 'failed';

/**
 * Codigos de falha. Existem para que o suporte seja possivel: sem eles o
 * usuario so consegue relatar "nao funcionou" (RNF-11).
 */
export type BuildErrorCode =
  /** A spec nao passou no schema ou nas regras semanticas. Culpa do cliente. */
  | 'SPEC_INVALID'
  /** `npm ci` falhou — cache frio, rede ou lockfile fora de sincronia. */
  | 'INSTALL_FAILED'
  /** `pbiviz package` falhou. Quase sempre erro de tipo no fonte gerado. */
  | 'COMPILE_FAILED'
  /** Compilou, mas o artefato nao passou na inspecao. NUNCA e entregue. */
  | 'ARTIFACT_REJECTED'
  /** Estourou o tempo duro. */
  | 'TIMEOUT'
  /** O template nao foi preparado no servidor. Culpa de implantacao. */
  | 'TEMPLATE_NOT_STAGED';

export interface BuildError {
  code: BuildErrorCode;
  message: string;
  /** Preenchido apenas em SPEC_INVALID. */
  issues?: ValidationIssue[];
  /** Ultimas linhas do log da ferramenta que falhou. */
  detail?: string;
}

export interface BuildRecord {
  id: string;
  status: BuildStatus;
  /** Nome do arquivo entregue, ex.: `Vendas por Regiao.pbiviz`. */
  fileName: string;
  createdAt: string;
  finishedAt?: string;
  error?: BuildError;
  /** Medidas do artefato. Uteis no editor e no diagnostico. */
  metrics?: { packageBytes: number; jsBytes: number; durationMs: number };
}

/** Erro que o pipeline lanca para virar `BuildError` sem perder o codigo. */
export class BuildFailure extends Error {
  public readonly code: BuildErrorCode;
  public readonly detail: string | undefined;
  public readonly issues: ValidationIssue[] | undefined;

  constructor(
    code: BuildErrorCode,
    message: string,
    options: { detail?: string; issues?: ValidationIssue[] } = {},
  ) {
    super(message);
    this.name = 'BuildFailure';
    this.code = code;
    this.detail = options.detail;
    this.issues = options.issues;
  }
}
