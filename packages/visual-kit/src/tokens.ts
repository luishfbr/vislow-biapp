import type { Align, FontWeight, Shadow } from '@vislow/config-schema';

/**
 * Mapa token -> classe Tailwind.  ESTE ARQUIVO E O CORACAO DO ADR-02.
 *
 * ============================ REGRA INVIOLAVEL ============================
 * As classes DEVEM ser strings literais completas. NUNCA construa uma classe
 * por interpolacao (`pbi:p-${n}`) ou concatenacao: o Tailwind faz analise
 * estatica do fonte e so gera o CSS das classes que consegue LER aqui.
 * Uma classe interpolada nao e gerada, e o estilo some silenciosamente no
 * Power BI — sem erro, sem aviso.
 * =========================================================================
 *
 * Tailwind v4 usa prefixo em forma de variante: `pbi:flex`, nao `pbi-flex`.
 * Validado no spike contra a toolchain do pbiviz (ADR-06 revisado).
 *
 * ===================== POR QUE MEDIDA NAO ESTA MAIS AQUI =====================
 * Espacamento, raio, espessura e tamanho de fonte tinham mapa neste arquivo ate
 * a spec 3.0.0 — seis ou sete degraus cada. A regra acima e a razao de terem
 * sido enums: `pbi:p-${n}` nao gera CSS nenhum. Mas ela so vale para CLASSE.
 * Desde sempre a cor e livre e funciona, porque vai por `style` inline, que nao
 * passa por analise estatica nenhuma (ver `highContrast.ts`) — e o `CanvasSlot`
 * faz o mesmo com percentual arbitrario.
 *
 * As medidas seguiram esse caminho: viraram numero na spec e `style` inline nos
 * componentes. O que continua aqui e o que e ESCOLHA ENTRE ALTERNATIVAS, e nao
 * medida — peso, alinhamento, sombra e direcao.
 * =============================================================================
 */

/** Direcao de um container. Chaves batem com o campo `direction` do registro. */
export const DIRECTION_CLASS: Record<'row' | 'column', string> = {
  row: 'pbi:flex-row',
  column: 'pbi:flex-col',
};

export const FONT_WEIGHT_CLASS: Record<FontWeight, string> = {
  normal: 'pbi:font-normal',
  medium: 'pbi:font-medium',
  semibold: 'pbi:font-semibold',
  bold: 'pbi:font-bold',
};

export const ALIGN_CLASS: Record<Align, string> = {
  left: 'pbi:text-left',
  center: 'pbi:text-center',
  right: 'pbi:text-right',
};

export const SHADOW_CLASS: Record<Shadow, string> = {
  none: 'pbi:shadow-none',
  sm: 'pbi:shadow-sm',
  md: 'pbi:shadow-md',
  lg: 'pbi:shadow-lg',
};

/** Todos os mapas, para o teste de cobertura de tokens (T-02). */
export const CLASS_MAPS = {
  fontWeight: FONT_WEIGHT_CLASS,
  align: ALIGN_CLASS,
  shadow: SHADOW_CLASS,
} as const;

/** Junta classes ignorando vazios. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Uma medida em pixel, pronta para `style`.
 *
 * Existe para dar UM lugar a duas decisoes que, espalhadas, divergiriam entre os
 * componentes: o que fazer com um numero que nao chegou (a spec garante que
 * chega, mas o visual compilado tambem roda contra props montadas a mao em
 * teste), e o que fazer com um negativo — que o schema ja recusa, e que aqui
 * vira zero em vez de virar um layout invertido sem erro nenhum.
 *
 * Devolve NUMERO, e nao string: o React ja acrescenta `px` a propriedade
 * numerica, e uma string interpolada aqui seria a unica coisa neste arquivo com
 * cara de classe construida — exatamente o que ninguem deve imitar.
 */
export function px(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
