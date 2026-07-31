# apps/web — o editor de composição

Detalhe completo em [docs/frontend.md](../../docs/frontend.md). **UI aqui exige as duas skills** — plano com
`frontend-design` antes do JSX, auditoria com `web-design-guidelines` sobre o diff.

- **Nada de lista de tipos ou de propriedades escrita à mão.** Paleta, painel de propriedades, schema e codegen
  saem todos de `NODE_DESCRIPTORS`. Uma lista paralela é a quinta cópia do catálogo e a primeira a divergir.
- **`lib/nodeComponents.ts` é o gêmeo por referência do que o codegen faz por texto.** `nodeComponents.test.ts`
  compara o nome da função com `descriptor.component` — é a única coisa ligando os dois caminhos.
- **Seletor de zustand nunca constrói valor.** O v5 compara com `Object.is`, então devolver um `Map` ou objeto
  novo re-renderiza em loop e trava a aba. Derivação que cria objeto vive em `lib/issues.ts`, memoizada no
  componente.
- **Seleção no preview depende de quem posiciona.** Container que empilha: nenhuma (ADR-14) — um wrapper
  clicável entra na cadeia de flex que o `ResponsiveContainer` usa para medir. Container em `placement:
  'canvas'`: tem seleção, arrasto e alças (ADR-18), porque a camada é filha `absolute`, está fora do fluxo e
  desenha com os mesmos `%` da spec, sem medir para desenhar.
- **A geometria (`rect`) é % do pai e mora fora de `props`** — `props` espelha o descritor, e o codegen despeja
  cada chave como atributo JSX; geometria é relação com o pai.
- **A matemática do canvas fica em `lib/canvasGeometry.ts`**, sem React, e é lá que ela se testa. No componente
  sobra o gesto, que jsdom não exercita.
- **Nome de papel é imutável** (ADR-13). O usuário edita `displayName`; o `name` nasce em `createRole` e amarra
  as referências da árvore e o `capabilities.json`.
- **`react-is` é declarado explicitamente** — é peer do Recharts e o repo usa `autoInstallPeers: false`. O
  visual compilado esconde esse problema porque o `npm ci` do template instala peers sozinho.
- **Testes `.tsx` precisam do `oxc.jsx` no `vitest.config.ts`**: o `tsconfig.json` daqui usa `jsx: "preserve"`
  (exigência do Next) e o vitest lê o mesmo arquivo. Definir `esbuild.jsx` é ignorado em silêncio no Vite 8.
- **`react` no vitest vem por alias para a cópia do editor** — o `visual-kit` não pode declarar react.
- **Teste que monta componentes do `visual-kit` mora aqui**, não no kit (`kitInteraction.test.tsx`): sem
  `react-dom` resolvível lá, o ESLint com tipos reprova o arquivo inteiro.
