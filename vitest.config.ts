import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'spike/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: ['**/*.test.*', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      // O subcaminho vem ANTES: os alias de string do Vite casam por prefixo, e
      // a entrada generica reescreveria "@vislow/config-schema/packaging" para
      // ".../src/index.tspackaging".
      '@vislow/config-schema/packaging': new URL(
        './packages/config-schema/src/packaging/index.ts',
        import.meta.url,
      ).pathname,
      '@vislow/config-schema': new URL('./packages/config-schema/src/index.ts', import.meta.url)
        .pathname,
      '@vislow/visual-kit': new URL('./packages/visual-kit/src/index.ts', import.meta.url).pathname,
    },
  },
});
