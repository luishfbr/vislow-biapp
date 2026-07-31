import type { PackageVersion } from './types.js';

/**
 * Geracao da identidade do visual (docs/build-visual.md).
 *
 * CORRIGIDO PELO SPIKE: o GUID nao e apenas metadado — e o nome de uma variavel
 * JavaScript no bundle (`var vislowSpike629BE43A...;(()=>{`). Precisa portanto
 * ser um identificador JS valido, e nao um UUID.
 *
 * Convencao da CLI oficial do pbiviz: `{nome}{32 hex maiusculos}`.
 */

const HEX_BYTES = 16; // -> 32 caracteres hex
const MAX_SLUG = 40;

/** Remove diacriticos e tudo que nao seja `[A-Za-z0-9]`. */
export function slugify(name: string): string {
  const stripped = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, MAX_SLUG);

  if (stripped.length === 0) return 'vislow';
  return /^[A-Za-z]/.test(stripped) ? stripped : `v${stripped}`;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Gera a identidade de um projeto NOVO. Deve ser chamada uma unica vez, na
 * criacao; reexportar o mesmo projeto reusa o `id` e apenas incrementa a
 * versao (RN-01 / RF-10).
 */
export function createProjectId(displayName: string): string {
  return slugify(displayName) + randomHex(HEX_BYTES);
}

/** Incrementa o componente de build da versao do pacote (RN-07). */
export function bumpPackageVersion(version: PackageVersion): PackageVersion {
  const [major = 1, minor = 0, patch = 0, build = 0] = version.split('.').map(Number);
  return [major, minor, patch, build + 1].map(String).join('.') as PackageVersion;
}

export const INITIAL_PACKAGE_VERSION: PackageVersion = '1.0.0.0';
