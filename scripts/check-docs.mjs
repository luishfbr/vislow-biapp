#!/usr/bin/env node
/**
 * Guarda da documentacao.
 *
 * A documentacao deste repo ja divergiu do codigo em silencio: o README da API
 * citava `VISLOW_REQUIRE_BUILD` meses depois de a variavel deixar de existir, e
 * ninguem notou porque o mesmo fato morava em tres arquivos. Esta guarda checa
 * as duas formas de divergencia que uma maquina consegue ver:
 *
 *   1. LINK QUEBRADO — todo link relativo em .md aponta para um arquivo que existe.
 *   2. TERMO MORTO — nomes do caminho antigo (removido na faxina de 2026-07-31)
 *      nao aparecem fora de docs/history.md, que e o arquivo onde eles DEVEM
 *      aparecer, escritos no tempo em que eram verdade.
 *
 * O que ela NAO checa: se o texto esta certo. Isso continua sendo trabalho de
 * quem edita. Ela existe para que o erro barato seja pego de graca.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Diretorios que nao sao nossos, ou que sao saida de build. */
const IGNORE = new Set(['node_modules', '.git', '.turbo', '.next', 'dist', 'vendor', 'spike']);

/**
 * O arquivo onde o passado pode ser citado. Tudo o mais fala do presente.
 * Os README dentro de `template/` sao lidos de dentro do projeto gerado, onde
 * `docs/` nao existe — por isso ficam fora da checagem de link.
 */
const HISTORY = 'docs/history.md';
const NO_LINK_CHECK = [/^packages\/visual-template\/template\//];

/**
 * Termos do caminho aposentado pela ADR-08 e pela faxina. Encontrar um deles
 * fora do historico significa que alguem esta descrevendo codigo que nao existe.
 */
const DEAD_TERMS = [
  'buildPbiviz',
  'CONFIG_PLACEHOLDER',
  'Runtime Core',
  'packages/runtime',
  'VISLOW_REQUIRE_BUILD',
  'VISLOW_REQUIRE_TEMPLATE',
  'stage:template',
  'test:packaging',
  'doc-mvp-lowcode-pbi',
  'padroes-de-engenharia',
];

/** Coleta todo .md que e nosso. */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

const problems = [];

/** Numero da linha de um offset, para que o erro seja clicavel. */
function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

for (const file of collect(ROOT)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');

  // 1. Links relativos.
  if (!NO_LINK_CHECK.some((re) => re.test(rel))) {
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = target.split('#')[0];
      if (path === '') continue;
      if (!existsSync(resolve(dirname(file), path))) {
        problems.push(`${rel}:${lineAt(text, m.index)}  link quebrado -> ${target}`);
      }
    }
  }

  // 2. Termos mortos.
  if (rel === HISTORY) continue;
  for (const term of DEAD_TERMS) {
    for (const m of text.matchAll(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))) {
      problems.push(
        `${rel}:${lineAt(text, m.index)}  termo do caminho antigo -> "${term}" (so em ${HISTORY})`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`\ncheck-docs: ${problems.length} problema(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nLink quebrado: corrija o caminho. Termo antigo: o codigo que ele descreve nao existe');
  console.error('mais — reescreva para o caminho atual, ou mova o trecho para o historico.\n');
  process.exit(1);
}

console.log('check-docs: links resolvem, nenhum termo do caminho antigo fora do historico.');
