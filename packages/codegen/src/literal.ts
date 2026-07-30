/**
 * Emissao de literais no fonte gerado.
 *
 * RN-11 vive aqui do lado do servidor. Nada que o usuario escreveu vira codigo:
 * texto sempre sai como LITERAL DE STRING dentro de um container de expressao
 * JSX (`prop={"..."}`), nunca como atributo cru nem como expressao. O schema ja
 * limitou tamanho, enum e formato antes de chegar aqui; este modulo garante que
 * nem o que passou pelo schema consegue escapar das aspas.
 */

/**
 * Separadores de linha Unicode. Escritos como ESCAPE, nunca como caractere
 * literal: sao invisiveis num editor, e um `git`/copiar-colar que os normalize
 * quebraria a protecao sem deixar rastro no diff.
 */
const LINE_SEPARATORS = /[\u2028\u2029]/g;

/**
 * String segura para o fonte gerado.
 *
 * `JSON.stringify` ja escapa aspas, barras invertidas e controles. Faltam dois
 * casos que ele deixa passar crus:
 *
 * - **U+2028/U+2029**: legais dentro de uma string JSON, mas so validos em JS a
 *   partir do ES2019. O `pbiviz` controla o proprio `tsconfig`, entao nao vale
 *   apostar no alvo de compilacao dele.
 * - **`</`**: inofensivo em TSX, mas o bundle final e servido dentro de HTML
 *   pelo host. Escapar custa nada e fecha a duvida.
 */
export function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(LINE_SEPARATORS, (char) => `\\u${char.charCodeAt(0).toString(16)}`)
    .replace(/<\//g, '<\\/');
}

/** Valor de prop JSX. Sempre em container de expressao — ver o cabecalho. */
export function jsxValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '{true}' : '{false}';
  if (typeof value === 'number' && Number.isFinite(value)) return `{${String(value)}}`;
  return `{${jsString(String(value))}}`;
}

/** Indenta um bloco de linhas. Puro cosmetico: o fonte gerado e lido por gente. */
export function indent(text: string, level: number): string {
  const pad = '  '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n');
}
