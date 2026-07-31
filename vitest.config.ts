import { defineConfig, mergeConfig } from 'vitest/config';
import { shared } from './vitest.shared.js';

/**
 * A suite RAPIDA. Roda contra o fonte (ver o mapa de alias em
 * `vitest.shared.ts`), em segundos, e e a que o `pnpm verify` executa.
 *
 * O gate de aceite nao esta aqui — ele compila um `.pbiviz` de verdade e vive
 * em `vitest.build.config.ts`. Antes os dois moravam no mesmo comando, e o
 * mesmo `pnpm test` levava 3 s ou 1 min conforme o estado do disco, passando
 * verde tendo rodado o gate ou nao.
 */
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: [
        'packages/*/src/**/*.test.{ts,tsx}',
        'apps/*/src/**/*.test.{ts,tsx}',
        // Escape para pacote cujo `src/` e compilado por uma toolchain de fora,
        // que nao tolera arquivo de teste ali dentro. Nenhum pacote precisa disso
        // hoje — o `visual-template` guarda o projeto do pbiviz em `template/`,
        // nao em `src/`. Fica porque a saida tem de existir antes da necessidade.
        'packages/*/test/**/*.test.{ts,tsx}',
      ],
      // `*.e2e.test.ts` e CONVENCAO, nao excecao para um arquivo: teste que
      // exige artefato compilado se chama assim e sai daqui automaticamente.
      exclude: ['**/node_modules/**', '**/dist/**', 'spike/**', '**/*.e2e.test.ts'],
    },
  }),
);
