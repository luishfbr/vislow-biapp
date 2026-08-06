#!/usr/bin/env node
/**
 * `rm -rf` portatil.
 *
 * O `rm` nao existe no `cmd.exe`, e o pnpm no Windows roda os scripts por ele:
 * `pnpm build` no visual-kit morria em `'rm' nao e reconhecido...` antes de o
 * `tsc` comecar. Como o `rm -rf dist` do build NAO e higiene opcional (o `tsc`
 * nao apaga o que sumiu do fonte, e o `stage-vendor` copia o `dist/` inteiro
 * para dentro do visual), a saida nao era "tirar o passo": era torna-lo
 * portatil. Node ja traz `fs.rmSync`, entao isto nao custa dependencia nenhuma.
 *
 * Uso: `node <caminho>/scripts/rmrf.mjs dist .turbo`
 *
 * Os alvos sao resolvidos a partir do CWD — que o pnpm ja fixa no diretorio do
 * pacote — e precisam ficar DENTRO dele. Caminho absoluto ou que escape por
 * `..` e recusado: um `clean` errado que sobe na arvore apaga fonte, e essa
 * checagem custa tres linhas.
 */
import { rmSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

const alvos = process.argv.slice(2);

if (alvos.length === 0) {
  console.error('rmrf: nenhum alvo. Uso: node scripts/rmrf.mjs <caminho...>');
  process.exit(1);
}

const RAIZ = process.cwd();

for (const alvo of alvos) {
  const caminho = resolve(RAIZ, alvo);
  const dentro = relative(RAIZ, caminho);

  if (dentro === '' || dentro.startsWith('..') || isAbsolute(dentro)) {
    console.error(`rmrf: recusado, "${alvo}" esta fora de ${RAIZ}`);
    process.exit(1);
  }

  rmSync(caminho, { recursive: true, force: true });
}
