/**
 * Publica `src/styles.css` em `dist/styles.css`, minificado.
 *
 * Substituiu o CLI do Tailwind na spec 5.0.0. O CSS passou a ser escrito a mao,
 * entao nao ha o que compilar — ha o que COPIAR sem os comentarios, que neste
 * arquivo sao longos de proposito e viajariam no bundle do visual contra o
 * orcamento de 1 MB do `content.js`.
 *
 * Minificacao deliberadamente burra: tira comentario, junta espaco em branco e
 * remove o ponto-e-virgula antes do fecha-chaves. Nao reordena, nao funde regra,
 * nao renomeia nada. Um minificador de verdade seria uma dependencia a mais para
 * economizar bytes que este arquivo nao tem — e cada transformacao esperta e uma
 * chance a mais de o CSS sair diferente do que foi escrito, no unico lugar do
 * produto onde ninguem olharia.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src', 'styles.css');
const TARGET = join(ROOT, 'dist', 'styles.css');

const source = await readFile(SOURCE, 'utf8');

const minified = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();

if (minified === '') {
  throw new Error('src/styles.css nao produziu regra nenhuma.');
}

await mkdir(dirname(TARGET), { recursive: true });
await writeFile(TARGET, `${minified}\n`, 'utf8');

console.log(`CSS publicado: ${source.length} -> ${minified.length} bytes.`);
