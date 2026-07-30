import { checkCompatibility, validateConfig, type VisualConfig } from '@vislow/config-schema';

/**
 * CONTRATO DE PLACEHOLDER (secao 8.2 do doc de MVP).
 *
 * Este literal e substituido no export pelo config do usuario, em base64.
 * O build FALHA se o token nao aparecer exatamente uma vez no bundle.
 */
const VISLOW_CONFIG_B64 = '__VISLOW_CONFIG_B64__';

/**
 * Base64 padrao (A-Za-z0-9+/=) NUNCA contem "_"; o placeholder e cheio deles.
 *
 * Nao comparar contra o token concatenado: o minificador pode dobrar a
 * concatenacao e criar uma SEGUNDA ocorrencia literal do placeholder no bundle,
 * fazendo o patch substituir a ocorrencia errada. Verificado no spike.
 */
const IS_PATCHED = !VISLOW_CONFIG_B64.includes('_');

/** Discriminante de string pelo mesmo motivo de ValidationResult: a toolchain
 *  do pbiviz nao suporta strictNullChecks, e sem ela uniao com discriminante
 *  booleano nao estreita. */
export type EmbeddedConfigResult =
  | { kind: 'ok'; config: VisualConfig }
  | { kind: 'error'; code: string; detail: string };

function decodeUtf8Base64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Le e valida a config embutida.
 *
 * Revalida mesmo o que o editor ja validou: o `.pbiviz` pode ser editado a mao
 * entre os dois pontos. Defesa em profundidade (secao 13).
 */
export function readEmbeddedConfig(): EmbeddedConfigResult {
  if (!IS_PATCHED) {
    return {
      kind: 'error',
      code: 'CFG_MISSING',
      detail: 'Este e o pacote base do Vislow, sem configuracao. Gere um visual pelo editor.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8Base64(VISLOW_CONFIG_B64));
  } catch {
    return { kind: 'error', code: 'CFG_CORRUPT', detail: 'A configuracao embutida nao pode ser lida.' };
  }

  const version = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version === 'string') {
    const compat = checkCompatibility(version);
    if (compat.kind === 'incompatible') {
      return { kind: 'error', code: 'CFG_VERSION', detail: compat.reason };
    }
  }

  const result = validateConfig(parsed);
  if (result.kind === 'invalid') {
    const first = result.issues[0];
    return {
      kind: 'error',
      code: 'CFG_INVALID',
      detail: first ? `${first.path}: ${first.message}` : 'Configuracao invalida.',
    };
  }

  return { kind: 'ok', config: result.config };
}
