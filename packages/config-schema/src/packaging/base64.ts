/**
 * Base64 de UTF-8, isomorfico (ADR-07).
 *
 * `btoa`/`atob` sao globais tanto no browser quanto no Node >= 16, mas operam
 * sobre *bytes latin-1*, nao sobre texto Unicode. Passar a string JSON direto
 * lanca `InvalidCharacterError` no primeiro acento ou emoji. Por isso o texto
 * passa por `TextEncoder`/`TextDecoder` — e nao pelo par `escape`/`unescape`,
 * obsoleto e incorreto fora de latin-1 (secao 8.2).
 */

/**
 * `String.fromCharCode` recebe um argumento por byte. Espalhar um array de
 * centenas de milhares de elementos estoura a pilha, entao o encode vai em
 * blocos. 32 KB e folgado para o limite de argumentos de qualquer engine.
 */
const CHUNK_BYTES = 0x8000;

/** Codifica texto Unicode em base64 padrao (`A-Za-z0-9+/=`). */
export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let latin1 = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    latin1 += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_BYTES));
  }
  return btoa(latin1);
}

/**
 * Inverso de `toBase64Utf8`.
 *
 * Espelha `decodeUtf8Base64` do Runtime Core de proposito: os testes de
 * empacotamento (T-05) usam esta funcao para provar que a config sobrevive ao
 * ciclo completo, e ela precisa se comportar como o lado que vai ler no
 * Power BI.
 */
export function fromBase64Utf8(base64: string): string {
  const latin1 = atob(base64);
  const bytes = new Uint8Array(latin1.length);
  for (let i = 0; i < latin1.length; i += 1) {
    bytes[i] = latin1.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
