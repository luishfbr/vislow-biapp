/**
 * Orcamentos rigidos do Power BI. NAO sao recomendacao nossa.
 *
 * O host recusa o import acima destes limites, e a mensagem que ele mostra nao
 * diz qual dos dois estourou. Verificar aqui, antes de entregar, transforma uma
 * recusa incompreensivel no Desktop num erro com numero e causa.
 */
export const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
export const MAX_JS_BYTES = 1024 * 1024;

export function describeBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
