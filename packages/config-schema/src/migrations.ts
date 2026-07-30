import { SCHEMA_VERSION } from './schema.js';

/**
 * Compatibilidade e migracao de schema (RN-09 / RN-12, secao 7.5).
 *
 * Regra: mudancas sao ADITIVAS dentro de uma major. Remover ou renomear campo
 * exige bump de major E uma funcao aqui.
 */

export type CompatVerdict =
  | { kind: 'ok' }
  /** Major diferente: o runtime NAO renderiza; exibe card de erro (RF-14). */
  | { kind: 'incompatible'; reason: string }
  /** Minor/patch a frente: renderiza, campos desconhecidos caem em default. */
  | { kind: 'forward'; reason: string };

function parse(version: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function checkCompatibility(
  configVersion: string,
  runtimeVersion: string = SCHEMA_VERSION,
): CompatVerdict {
  const cfg = parse(configVersion);
  const rt = parse(runtimeVersion);
  if (!cfg || !rt) {
    return { kind: 'incompatible', reason: `Versao de schema malformada: "${configVersion}"` };
  }
  if (cfg[0] !== rt[0]) {
    return {
      kind: 'incompatible',
      reason: `Config na major ${String(cfg[0])}, runtime na major ${String(rt[0])}`,
    };
  }
  if (cfg[1] > rt[1] || (cfg[1] === rt[1] && cfg[2] > rt[2])) {
    return {
      kind: 'forward',
      reason: `Config (${configVersion}) e mais nova que o runtime (${runtimeVersion})`,
    };
  }
  return { kind: 'ok' };
}

/**
 * Migracoes entre majors. Vazio no MVP — a primeira entrada so existira quando
 * houver uma 2.0.0. Mantido aqui para que a estrategia esteja no codigo, e nao
 * apenas no documento.
 */
export const MIGRATIONS: Record<string, (config: unknown) => unknown> = {};

export function migrate(config: unknown, fromVersion: string): unknown {
  const fn = MIGRATIONS[fromVersion];
  return fn ? fn(config) : config;
}
