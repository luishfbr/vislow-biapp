import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O `apps/web/tsconfig.json` usa `jsx: "preserve"` porque quem transforma o
  // JSX la e o Next. O vitest le esse mesmo tsconfig e receberia JSX cru. Este
  // override vale so para os testes; o build do editor continua com o Next.
  oxc: { jsx: { runtime: 'automatic' } },

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
    exclude: ['**/node_modules/**', '**/dist/**', 'spike/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: ['**/*.test.*', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      // O `visual-kit` NAO declara react — nem em `devDependencies` (achado 39:
      // duas copias no bundle do pbiviz zeram o dispatcher de hooks). Isso e uma
      // regra do PACOTE, e quebra os testes que importam os componentes a partir
      // do fonte: nao ha `react` resolvivel a partir de `packages/visual-kit/`.
      //
      // O alias resolve isso so no vitest, sem tocar no layout de node_modules —
      // que e justamente o que nao pode mudar. Aponta para a copia do editor,
      // que e quem renderiza esses componentes no preview de verdade.
      react: new URL('./apps/web/node_modules/react', import.meta.url).pathname,
      'react-dom': new URL('./apps/web/node_modules/react-dom', import.meta.url).pathname,
      // O subcaminho vem ANTES: os alias de string do Vite casam por prefixo, e
      // a entrada generica reescreveria "@vislow/config-schema/packaging" para
      // ".../src/index.tspackaging".
      '@vislow/config-schema/packaging': new URL(
        './packages/config-schema/src/packaging/index.ts',
        import.meta.url,
      ).pathname,
      '@vislow/config-schema': new URL('./packages/config-schema/src/index.ts', import.meta.url)
        .pathname,
      // Mesma armadilha do subcaminho de packaging: o especifico vem ANTES.
      '@vislow/visual-kit/nodes': new URL(
        './packages/visual-kit/src/nodes/index.ts',
        import.meta.url,
      ).pathname,
      '@vislow/visual-kit': new URL('./packages/visual-kit/src/index.ts', import.meta.url).pathname,
      '@vislow/component-registry': new URL(
        './packages/component-registry/src/index.ts',
        import.meta.url,
      ).pathname,
      '@vislow/build-contract': new URL('./packages/build-contract/src/index.ts', import.meta.url)
        .pathname,
      '@vislow/codegen': new URL('./packages/codegen/src/index.ts', import.meta.url).pathname,
      // O alias do editor. A BARRA e obrigatoria: sem ela o prefixo "@" casaria
      // tambem com "@vislow/..." e reescreveria os pacotes do monorepo.
      '@/': new URL('./apps/web/src/', import.meta.url).pathname,
    },
  },
});
