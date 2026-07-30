// @ts-check
import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/.tmp/**',
    'spike/**', // codigo descartavel do gate da Fase 1
  ]),

  // Codigo de produto: lint com informacao de tipos.
  {
    files: [
      'packages/*/src/**/*.{ts,tsx}',
      'apps/*/src/**/*.{ts,tsx}',
      'packages/*/test/**/*.{ts,tsx}',
    ],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // RN-11: a config do usuario NUNCA vira HTML/CSS/JS executavel.
      // O lint oficial do pbiviz ja proibe innerHTML no runtime; aqui a regra
      // vale para todo o monorepo, inclusive o preview do editor.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'RN-11: proibido. Use APIs de DOM ou JSX.' },
        { property: 'outerHTML', message: 'RN-11: proibido. Use APIs de DOM ou JSX.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'RN-11: proibido. A config do usuario nunca e interpretada como HTML.',
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },

  // O `visual-kit` e compilado para DENTRO do bundle do visual do Power BI, onde
  // o webpack do `pbiviz` usa `resolve.symlinks: false` e pode duplicar o React
  // (achado 39). Elementos JSX atravessam copias sem problema, mas hooks nao: o
  // dispatcher fica `null` e o componente cai no ErrorBoundary. Enquanto a
  // arquitetura de compilacao por usuario nao dissolver essa causa, o kit fica
  // sem hooks — e essa regra e o que impede alguem de reintroduzir um sem saber.
  {
    files: ['packages/visual-kit/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              importNames: [
                'useState',
                'useEffect',
                'useMemo',
                'useCallback',
                'useRef',
                'useReducer',
                'useContext',
                'useLayoutEffect',
                'useId',
                'useSyncExternalStore',
                'useTransition',
                'useDeferredValue',
              ],
              message:
                'achado 39: hook no visual-kit quebra dentro do Power BI se o React duplicar no bundle. Use classe (ver ErrorBoundary) ou calcule no render.',
            },
          ],
        },
      ],
    },
  },

  // O runtime tem DOIS tsconfig: o `tsconfig.json` e lax e existe para a
  // toolchain do pbiviz (cujo visualPlugin.ts gerado nao passa em
  // strictNullChecks). O lint precisa apontar para o config estrito.
  {
    files: ['packages/runtime/src/**/*.{ts,tsx}', 'packages/runtime/test/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./packages/runtime/tsconfig.check.json'],
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Testes: as mesmas regras, com folgas pontuais.
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // Arquivos de configuracao da raiz: nao sao codigo de produto e nao pertencem
  // a nenhum tsconfig de pacote. Lint sem informacao de tipos, de proposito.
  {
    files: ['*.{mjs,ts}', '**/*.config.{mjs,ts}'],
    // `base` traz o parser de TypeScript sem as regras que exigem informacao de
    // tipos — arquivos de configuracao nao pertencem a nenhum tsconfig.
    extends: [eslint.configs.recommended, tseslint.configs.base],
    languageOptions: { globals: globals.node },
  },
]);
