# packages/visual-kit — os componentes que desenham

O mesmo código roda no preview do editor **e** dentro do Power BI (ADR-04). Tudo aqui termina no bundle do
visual, e é isso que explica cada restrição. Detalhe em [docs/frontend.md](../../docs/frontend.md) e
[docs/build-visual.md](../../docs/build-visual.md).

**UI aqui exige as duas skills** — `frontend-design` antes do JSX, `web-design-guidelines` sobre o diff.

- **Este pacote não usa hooks** — regra de ESLint, não convenção. Hook é o único ponto sensível à duplicação do
  React no bundle: elementos JSX atravessam cópias, hooks não. Use classe (ver `ErrorBoundary`) ou calcule no
  render.
- **Não declare `react`, nem em `devDependencies`.** Sem isso o webpack do `pbiviz` (`resolve.symlinks: false`)
  resolve duas cópias e o dispatcher de hooks fica `null`. Teste que monta estes componentes mora em `apps/web`.
- **Classe Tailwind é string literal completa** em `src/tokens.ts`. Interpolação some sem erro dentro do Power
  BI. E **o prefixo vem antes da variante**: `pbi:focus:ring-2`, nunca `focus:pbi:ring-2` — ao contrário, o CLI
  não gera regra e não reclama. Confira no `dist/styles.css`.
- **Cor nunca vira classe:** hex validado, aplicado por `style` inline.
- **Alto contraste: HTML usa a variável CSS, SVG lê o quadro.** `var()` **não** é substituído em atributo de
  apresentação de SVG. Nos nós de HTML use `hcInk`/`hcSurface`/`hcAccent`/`hcLine`; nos gráficos resolva por
  `hostOf(frame).highContrast`.
- **Nunca leia `frame.host` direto — use `hostOf(frame)`**, que devolve o `INERT_HOST` no preview (ADR-16).
- **Teclado é sobreposição `absolute` de `<button>` `sr-only`**, não `tabIndex` no SVG: um elemento a mais na
  cadeia de flex quebra a medida do `ResponsiveContainer`. As setas movem o foco do DOM, não um índice em estado.
- **`/nodes` fica fora do barril** — quem importa só o barril não deve pagar pelo Recharts (~575 KB) contra o
  orçamento de 1 MB.
- **A guarda de CSS (`scripts/check-css.mjs`) confere o CSS de saída**, e uma classe pode ter segunda origem no
  fonte. Ao escolher classe para a lista dela, prefira as que só o `tokens.ts` produz.
