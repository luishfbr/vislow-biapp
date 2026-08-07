#!/usr/bin/env node
/**
 * Guarda do comentario: limita o TAMANHO, nao o assunto.
 *
 * A convencao "comentario explica por que, nao o que" nunca teve teto, e o
 * repo chegou a 27% de linhas de comentario. Ver docs/engineering.md secao 4.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = join(ROOT, 'scripts', 'comment-baseline.json');

const MAX = 4;
const MAX_HEADER = 6;

const ROOTS = ['apps', 'packages'];
const IGNORE = new Set(['node_modules', 'dist', '.next', 'vendor', 'deps', 'coverage', '.turbo']);

function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Regioes contiguas de comentario, medidas por linha inicial.
 * Reconhece so comentario que ABRE a linha — o resto e codigo com nota no fim.
 */
function regions(text) {
  const lines = text.split('\n');
  const found = [];
  let firstCode = -1;
  let i = 0;

  while (i < lines.length) {
    const s = lines[i].trim();

    if (s.startsWith('/*')) {
      let j = i;
      while (j < lines.length && !lines[j].slice(lines[j].indexOf('/*') + 2).includes('*/')) j++;
      found.push({ line: i + 1, size: j - i + 1 });
      i = j + 1;
    } else if (s.startsWith('//')) {
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('//')) j++;
      found.push({ line: i + 1, size: j - i });
      i = j;
    } else {
      if (s !== '' && firstCode < 0) firstCode = i + 1;
      i++;
    }
  }

  const header = found.find((r) => firstCode < 0 || r.line < firstCode);
  for (const r of found) r.limit = r === header ? MAX_HEADER : MAX;
  return found;
}

const files = ROOTS.flatMap((r) => collect(join(ROOT, r)));
const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  : {};

const measured = new Map();
let commentLines = 0;
let codeLines = 0;

for (const file of files) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  const found = regions(text);

  commentLines += found.reduce((a, r) => a + r.size, 0);
  codeLines += text.split('\n').filter((l) => l.trim() !== '').length;

  const over = found.filter((r) => r.size > r.limit);
  measured.set(rel, {
    worst: over.reduce((a, r) => Math.max(a, r.size), 0),
    over,
  });
}

if (process.argv.includes('--update-baseline')) {
  const bootstrap = !existsSync(BASELINE_FILE);
  const next = {};
  const refused = [];
  for (const [rel, m] of [...measured].sort()) {
    if (m.worst === 0) continue;
    const old = baseline[rel];
    if (bootstrap) next[rel] = m.worst;
    else if (old === undefined) refused.push(`${rel}  bloco de ${m.worst} linhas — corte, nao registre`);
    else if (m.worst > old) refused.push(`${rel}  ${old} -> ${m.worst} linhas — o baseline so encolhe`);
    else next[rel] = m.worst;
  }
  if (refused.length > 0) {
    console.error(`\ncheck-comments: ${refused.length} entrada(s) recusada(s)\n`);
    for (const r of refused) console.error(`  ${r}`);
    console.error('\nO baseline registra divida existente e nunca cresce. Corte o comentario.\n');
    process.exit(1);
  }
  writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`check-comments: baseline com ${Object.keys(next).length} arquivo(s).`);
  process.exit(0);
}

const problems = [];

for (const [rel, m] of measured) {
  const recorded = baseline[rel];

  if (recorded === undefined) {
    for (const r of m.over) {
      problems.push(`${rel}:${r.line}  comentario de ${r.size} linhas (maximo ${r.limit})`);
    }
  } else if (m.worst === 0) {
    problems.push(`${rel}  limpo — remova do baseline com --update-baseline`);
  } else if (m.worst > recorded) {
    problems.push(`${rel}  piorou: ${recorded} -> ${m.worst} linhas`);
  } else if (m.worst < recorded) {
    problems.push(`${rel}  melhorou: ${recorded} -> ${m.worst} — rode --update-baseline`);
  }
}

for (const rel of Object.keys(baseline)) {
  if (!measured.has(rel)) problems.push(`${rel}  no baseline mas nao existe mais`);
}

const ratio = ((commentLines / codeLines) * 100).toFixed(1);

if (problems.length > 0) {
  console.error(`\ncheck-comments: ${problems.length} problema(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nMaximo ${MAX} linhas por comentario (${MAX_HEADER} no cabecalho do arquivo).`);
  console.error('Racional longo vai para docs/; no codigo fica o ponteiro.\n');
  process.exit(1);
}

console.log(
  `check-comments: nenhum comentario acima do limite fora do baseline ` +
    `(${Object.keys(baseline).length} arquivo(s) em divida, ${ratio}% do fonte e comentario).`,
);
