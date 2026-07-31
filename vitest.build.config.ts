import { defineConfig, mergeConfig } from 'vitest/config';
import { shared } from './vitest.shared.js';

/**
 * O GATE DE ACEITE (ADR-08): spec -> `.pbiviz` compilado de verdade -> bundle
 * minificado executado num jsdom. Roda `npm ci` e `npx pbiviz package` num
 * diretorio temporario, entao custa ~15 s e nao cabe na suite rapida.
 *
 * Nao ha modo "ignorado". O `stage:vendor` e dependencia declarada da tarefa
 * `test:build` no `turbo.json`, entao o template SEMPRE esta preparado quando
 * isto roda — e se nao estiver, o arquivo lanca no carregamento.
 */
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ['apps/*/src/**/*.e2e.test.ts', 'packages/*/src/**/*.e2e.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 300_000,
    },
  }),
);
