import { assertValidSpec, type VisualSpec } from '@vislow/component-registry';
import { generateCapabilities } from './capabilities.js';
import { generatePbiviz } from './pbiviz.js';
import { generateVisualSource } from './visual.js';

export * from './capabilities.js';
export * from './pbiviz.js';
export * from './visual.js';
export * from './roles.js';
export * from './literal.js';
// Exportado, e nao mantido privado, porque as fixtures sao DERIVADAS do registro
// de componentes: um tipo novo passa a ser exercitado no mesmo commit em que
// passa a existir. Duplica-las no teste da API criaria a terceira lista de tipos
// do projeto — a divergencia que a ADR-09 fecha para o schema.
export * from './fixtures.js';

/** Arquivo a escrever sobre o scaffold, com caminho relativo a raiz do projeto. */
export interface GeneratedFile {
  path: string;
  contents: string;
}

/**
 * Os tres arquivos que distinguem um visual de outro.
 *
 * Todo o resto — `package.json`, `tsconfig.json`, `dataFrame.ts`, estilo e
 * icone — e ESTATICO e vem do `visual-template`. Manter a fronteira nitida e o
 * que permite cachear o `npm ci` entre builds: o que muda por build nao toca as
 * dependencias.
 *
 * A spec e revalidada aqui, mesmo que a API ja tenha validado. E barato, e o
 * codegen nao pode assumir que o unico caminho ate ele passou pelo controller.
 */
export function generateProject(spec: VisualSpec, buildId: string): GeneratedFile[] {
  const valid = assertValidSpec(spec);

  return [
    { path: 'src/visual.tsx', contents: generateVisualSource(valid, buildId) },
    {
      path: 'capabilities.json',
      contents: `${JSON.stringify(generateCapabilities(valid), null, 2)}\n`,
    },
    { path: 'pbiviz.json', contents: `${JSON.stringify(generatePbiviz(valid), null, 2)}\n` },
  ];
}
