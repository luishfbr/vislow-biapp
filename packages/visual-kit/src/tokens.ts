import type { Align, Border, FontSize, FontWeight, Radius, Shadow, Spacing } from '@vislow/config-schema';

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
 */

export const SPACING_CLASS: Record<Spacing, string> = {
  none: '',
  xs: 'pbi:p-1',
  sm: 'pbi:p-2',
  md: 'pbi:p-4',
  lg: 'pbi:p-6',
  xl: 'pbi:p-8',
};

export const RADIUS_CLASS: Record<Radius, string> = {
  none: 'pbi:rounded-none',
  sm: 'pbi:rounded-sm',
  md: 'pbi:rounded-md',
  lg: 'pbi:rounded-lg',
  xl: 'pbi:rounded-xl',
  full: 'pbi:rounded-full',
};

/** Raio aplicado so no topo — usado nas barras. */
export const RADIUS_TOP_CLASS: Record<Radius, string> = {
  none: 'pbi:rounded-t-none',
  sm: 'pbi:rounded-t-sm',
  md: 'pbi:rounded-t-md',
  lg: 'pbi:rounded-t-lg',
  xl: 'pbi:rounded-t-xl',
  full: 'pbi:rounded-t-full',
};

export const FONT_SIZE_CLASS: Record<FontSize, string> = {
  xs: 'pbi:text-xs',
  sm: 'pbi:text-sm',
  base: 'pbi:text-base',
  lg: 'pbi:text-lg',
  xl: 'pbi:text-xl',
  '2xl': 'pbi:text-2xl',
  '4xl': 'pbi:text-4xl',
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

export const BORDER_CLASS: Record<Border, string> = {
  none: 'pbi:border-0',
  thin: 'pbi:border',
  medium: 'pbi:border-2',
};

/** Todos os mapas, para o teste de cobertura de tokens (T-02). */
export const CLASS_MAPS = {
  spacing: SPACING_CLASS,
  radius: RADIUS_CLASS,
  radiusTop: RADIUS_TOP_CLASS,
  fontSize: FONT_SIZE_CLASS,
  fontWeight: FONT_WEIGHT_CLASS,
  align: ALIGN_CLASS,
  shadow: SHADOW_CLASS,
  border: BORDER_CLASS,
} as const;

/** Junta classes ignorando vazios. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
