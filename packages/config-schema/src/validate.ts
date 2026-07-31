// Build 2020-12 do Ajv. O entrypoint padrao ("ajv") e draft-07 e nao conhece o
// dialeto declarado em $schema — usar o errado falha so em runtime.
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { visualConfigSchema } from './schema.js';
import type { VisualConfig } from './types.js';

export interface ValidationIssue {
  /** Caminho do campo em notacao de ponto, ex.: `layout.padding`. */
  path: string;
  message: string;
}

/**
 * Discriminante de STRING, nao booleano, de proposito.
 *
 * O Runtime Core e compilado pela toolchain do pbiviz, que nao suporta
 * `strictNullChecks` (o `visualPlugin.ts` gerado por ela nao passa). Sem essa
 * flag o TypeScript NAO estreita uniao por discriminante booleano, e
 * `if (r.valid)` deixaria de dar acesso a `r.config`. Discriminante de string
 * estreita sob qualquer configuracao de compilador.
 */
export type ValidationResult =
  | { kind: 'valid'; config: VisualConfig }
  | { kind: 'invalid'; issues: ValidationIssue[] };

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  compiled ??= new Ajv2020({
    allErrors: true,
    strict: true,
    // `strictRequired` exigiria que `bar`/`kpi` fossem redeclarados dentro de
    // cada `then`. Eles estao definidos na raiz; a construcao if/then apenas
    // torna um deles obrigatorio conforme o chartType. Padrao legitimo.
    strictRequired: false,
  }).compile(visualConfigSchema);
  return compiled;
}

function toIssue(err: ErrorObject): ValidationIssue {
  const path = err.instancePath.replace(/^\//, '').replace(/\//g, '.');
  const extra =
    err.keyword === 'additionalProperties'
      ? ` (${String((err.params as { additionalProperty?: string }).additionalProperty)})`
      : '';
  return { path: path || '(raiz)', message: `${err.message ?? 'invalido'}${extra}` };
}

/**
 * Valida um VisualConfig contra o JSON Schema.
 *
 * Usado nos DOIS lados da fronteira (RN-03 e defesa em profundidade, docs/architecture.md):
 * o editor bloqueia o export de config invalida; o runtime revalida ao ler a
 * config embutida, porque o pacote pode ser editado a mao entre os dois pontos.
 */
export function validateConfig(value: unknown): ValidationResult {
  const validate = validator();
  if (validate(value)) return { kind: 'valid', config: value as VisualConfig };
  return {
    kind: 'invalid',
    issues: (validate.errors ?? []).map(toIssue),
  };
}

/** Atalho para os casos em que so importa o veredito. */
export function isValidConfig(value: unknown): boolean {
  return validateConfig(value).kind === 'valid';
}

/** Versao que lanca. Util em testes e em caminhos onde a config ja deveria ser valida. */
export function assertValidConfig(value: unknown): VisualConfig {
  const result = validateConfig(value);
  if (result.kind === 'invalid') {
    const detail = result.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(`VisualConfig invalido — ${detail}`);
  }
  return result.config;
}
