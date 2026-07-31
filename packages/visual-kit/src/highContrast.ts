/**
 * Alto contraste (RF-21) — a paleta do host vence a cor que o usuario escolheu.
 *
 * O caminho e uma VARIAVEL CSS com fallback: todo no emite
 * `color: var(--vislow-hc-ink, #1e293b)`. Fora do alto contraste a variavel nao
 * existe e a cor do usuario vale; ligado o modo, o visual compilado define a
 * variavel no elemento raiz e ela ganha de toda cor da arvore, em qualquer
 * profundidade — sem prop nova em descritor nenhum, sem contexto e sem hook
 * (achado 39, verificado por ESLint).
 *
 * NAO serve para SVG. `var()` NAO e substituido em atributo de apresentacao:
 * `<rect fill="var(--x, red)">` nao pinta em navegador nenhum, e o Recharts
 * emite `fill`/`stroke` como atributo. Por isso os graficos — que sempre
 * recebem o quadro, porque todo descritor de grafico tem campo de papel —
 * resolvem a paleta a partir de `frame.host.highContrast` (`nodes/charts.tsx`).
 *
 * A regra, entao, e uma so: **HTML usa a variavel, SVG le o quadro.**
 */

export const HC_VARS = {
  /** Texto e rotulo. Recebe o `foreground` do host. */
  ink: '--vislow-hc-ink',
  /** Superficie. Recebe o `background`. */
  surface: '--vislow-hc-surface',
  /** Marca de dados (numero do KPI, barra). Recebe o `foreground`. */
  accent: '--vislow-hc-accent',
  /** Grade, borda e eixo. Recebe o `foreground`. */
  line: '--vislow-hc-line',
  /** Marca selecionada. Recebe o `foregroundSelected`. */
  selected: '--vislow-hc-selected',
} as const;

/**
 * Interpolar aqui e seguro, ao contrario do mapa de tokens: isto vira `style`
 * inline, nao classe do Tailwind — nao passa por analise estatica nenhuma.
 */
function withFallback(variable: string, chosen: string): string {
  return `var(${variable}, ${chosen})`;
}

export function hcInk(chosen: string): string {
  return withFallback(HC_VARS.ink, chosen);
}

export function hcSurface(chosen: string): string {
  return withFallback(HC_VARS.surface, chosen);
}

export function hcAccent(chosen: string): string {
  return withFallback(HC_VARS.accent, chosen);
}

export function hcLine(chosen: string): string {
  return withFallback(HC_VARS.line, chosen);
}
