/**
 * Guarda do ADR-02: o CSS pre-compilado e a UNICA fonte de estilo do visual.
 *
 * PORQUE ISTO EXISTE. Uma classe que nao tem regra some sem erro nenhum —
 * navegador ignora nome de classe que nao existe, sem console, sem nada. O
 * resultado e um visual sem estilo dentro do Power BI e um build que reporta
 * sucesso.
 *
 * E gate, nao teste — o mesmo principio do `inspectPbiviz` (ADR-11): build que
 * produz artefato quebrado tem de FALHAR, e nao produzir confiando que alguem
 * inspecione depois. Por isso roda dentro do `build`, e nao so na CI.
 *
 * =================== O QUE MUDOU QUANDO O TAILWIND SAIU ====================
 * Ate a spec 4.0.0 esta guarda conferia uma AMOSTRA de seis utilidades, e nao
 * podia conter nome de classe por extenso: o Tailwind v4 varria o pacote inteiro
 * incluindo este script, lia as exigencias daqui e gerava as regras — a guarda
 * passava com o `tokens.ts` quebrado. Uma guarda que nao tem como falhar nao e
 * guarda.
 *
 * Sem Tailwind, ninguem le este arquivo alem do Node. A guarda deixa de ser uma
 * amostra e passa a ser uma CONFERENCIA TOTAL, nos dois sentidos:
 *
 *   1. toda classe `vsl-` usada no fonte tem regra no CSS;
 *   2. toda regra `.vsl-` do CSS e usada por alguem no fonte.
 *
 * O sentido (2) e o novo, e e o que impede o arquivo de virar deposito: regra
 * orfa nao quebra nada — ela so vai junto no bundle para sempre, e ninguem
 * descobre que podia sair.
 * ==========================================================================
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = join(ROOT, 'dist', 'styles.css');
const SRC = join(ROOT, 'src');

/**
 * O preflight do Tailwind reseta `html`/`body` globais, e o CSS escrito a mao
 * pode fazer o mesmo por engano. Dentro do Power BI isso vaza para o relatorio
 * inteiro, nao so para o visual. A ancora e o fim da regra anterior, e nao o
 * inicio da linha: o CSS sai minificado numa linha so.
 */
const GLOBAL_RESET = /(^|[{}])\s*(html|body|\*)\s*[,{]/;

/** Todo arquivo de fonte do pacote, menos os proprios testes. */
async function sourceFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

/**
 * Tira COMENTARIO antes de procurar classe. A guarda tem de olhar codigo, nao
 * prosa.
 *
 * Descoberto quebrando de proposito, que e o unico jeito de saber que uma guarda
 * morde: o `tokens.ts` documenta a regra da classe literal com um exemplo do que
 * NAO fazer (`vsl-w-` seguido de interpolacao), e a guarda leu o exemplo como
 * uso real e reprovou o build. E o espelho do problema antigo, em que o Tailwind
 * lia as exigencias de dentro do proprio guarda.
 *
 * Bloco inteiro, e linha que COMECA com `//`. Um `//` no meio da linha fica: ele
 * quase sempre e `https://` dentro de string, e cortar dali levaria junto o
 * resto da linha — que pode conter classe.
 */
function withoutComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const css = await readFile(CSS, 'utf8');

if (css.trim() === '') {
  throw new Error('dist/styles.css vazio. O passo de CSS rodou sem encontrar fonte?');
}

if (GLOBAL_RESET.test(css)) {
  throw new Error(
    'reset global no CSS do runtime: ha regra para html, body ou *. ' +
      'Ela vazaria para o relatorio inteiro do host, nao so para o visual.',
  );
}

/**
 * As regras declaradas. So casa `.vsl-x` em posicao de SELETOR — um `.vsl-x`
 * dentro de comentario nao conta, e e por isso que a busca exige o abre-chaves
 * ou a virgula depois.
 */
const declared = new Set(
  [...css.matchAll(/\.(vsl-[a-z0-9-]+)\s*(?=[,{])/g)].map((match) => match[1]),
);

/**
 * As classes usadas. Le de STRING no fonte, que e a unica forma que uma classe
 * pode ter aqui — a regra do `tokens.ts` proibe interpolacao, e uma classe
 * interpolada nao apareceria nesta busca nem na de cima, entao ela cai no
 * relatorio de regra orfa. A guarda morde nos dois casos.
 */
const used = new Map();
for (const file of await sourceFiles(SRC)) {
  const text = withoutComments(await readFile(file, 'utf8'));
  for (const match of text.matchAll(/['"`]([^'"`]*\bvsl-[a-z0-9-]+[^'"`]*)['"`]/g)) {
    for (const cls of match[1].split(/\s+/).filter((part) => part.startsWith('vsl-'))) {
      if (!used.has(cls)) used.set(cls, file.slice(ROOT.length + 1));
    }
  }
}

const missing = [...used].filter(([cls]) => !declared.has(cls));
if (missing.length > 0) {
  throw new Error(
    `classes sem regra no CSS:\n${missing.map(([cls, file]) => `  ${cls}  (${file})`).join('\n')}\n` +
      'O navegador ignora classe inexistente em silencio: o estilo sumiria dentro do Power BI.',
  );
}

const orphans = [...declared].filter((cls) => !used.has(cls));
if (orphans.length > 0) {
  throw new Error(
    `regras sem uso no CSS: ${orphans.join(', ')}.\n` +
      'Ou falta usa-las, ou elas viajam no bundle sem servir a ninguem. ' +
      'Se a classe e construida por interpolacao em algum componente, o problema e la.',
  );
}

console.log(
  `CSS verificado: ${css.length} bytes, ${declared.size} regras, ` +
    `${used.size} usos, nenhuma orfa e nenhuma ausente.`,
);
