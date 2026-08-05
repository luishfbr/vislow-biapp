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
  // dispatcher fica `null` e o componente cai no ErrorBoundary. A duplicacao e
  // evitada hoje pela vendorizacao do template (copia de diretorio, nunca
  // symlink) — esta regra e a defesa em profundidade, e e o que impede alguem
  // de reintroduzir um hook sem saber.
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

  // Um modulo do NestJS e uma classe VAZIA de proposito: ela existe so para
  // carregar o decorator `@Module`, que e o que o container de DI le. Nao ha
  // como escrever um modulo sem cair no `no-extraneous-class`, entao a regra sai
  // — e sai apenas nos arquivos `*.module.ts`, onde o padrao e legitimo.
  {
    files: ['apps/api/src/**/*.module.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },

  // Componentes do shadcn/ui: codigo de TERCEIRO copiado para dentro do repo.
  //
  // O `shadcn add` reescreve estes arquivos por cima a cada componente novo e o
  // `shadcn diff` compara com o upstream. Corrigi-los a mao para passar no
  // `strictTypeChecked` transformaria toda atualizacao futura num conflito, e a
  // correcao voltaria a ser desfeita sem ninguem notar — entao a folga fica aqui,
  // na fronteira, e nao dentro dos arquivos.
  //
  // O que NAO sai: `no-restricted-properties` e `no-restricted-syntax` (RN-11).
  // A proibicao de `innerHTML` nao tem excecao por origem do codigo — o lint
  // oficial do `pbiviz` tambem nao abre essa.
  {
    files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
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

  // Configuracao da raiz e scripts de build: nao sao codigo de produto e nao
  // pertencem a nenhum tsconfig de pacote. Lint sem informacao de tipos, de
  // proposito.
  //
  // `packages/*/scripts/**` e `scripts/**` entram aqui porque sao scripts
  // CRITICOS de build (`stage-vendor.mjs` prepara o template do worker,
  // `check-css.mjs` e a guarda do ADR-02, `check-docs.mjs` e a guarda da
  // documentacao) e antes nao casavam com padrao nenhum — rodavam com zero
  // regras. Um diretorio de scripts novo precisa entrar nesta lista.
  {
    files: [
      '*.{mjs,ts}',
      '**/*.config.{mjs,ts}',
      'scripts/**/*.{mjs,ts}',
      'packages/*/scripts/**/*.{mjs,ts}',
    ],
    // `base` traz o parser de TypeScript sem as regras que exigem informacao de
    // tipos — arquivos de configuracao nao pertencem a nenhum tsconfig.
    extends: [eslint.configs.recommended, tseslint.configs.base],
    languageOptions: { globals: globals.node },
  },
]);
