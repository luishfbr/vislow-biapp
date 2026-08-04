import type { BuildErrorCode } from '@vislow/build-contract';
import type { ValidationIssue } from '@vislow/config-schema';

/**
 * Tipos internos do servidor.
 *
 * Os tipos de FIO — `BuildStatus`, `BuildErrorCode`, `BuildRecord` — vivem em
 * `@vislow/build-contract`, porque o editor tambem os consome. O que sobra aqui
 * e o que nunca atravessa o fio: a excecao que o pipeline lanca.
 */
export type {
  BuildError,
  BuildErrorCode,
  BuildMetrics,
  BuildRecord,
  BuildStatus,
  BuildStep,
} from '@vislow/build-contract';

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
