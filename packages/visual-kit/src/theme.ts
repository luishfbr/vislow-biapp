import type { VisualConfig } from '@vislow/config-schema';
import type { RenderContext } from './types.js';

/**
 * Cores efetivas de um render.
 *
 * Regra: em alto contraste, a paleta do host vence a config (RF-21). Manter
 * isso num unico lugar evita que cada componente reimplemente a decisao — e
 * esqueca dela em algum caminho.
 */
export interface ResolvedColors {
  surface: string;
  border: string;
  headerText: string;
  accent: string;
  mutedText: string;
  grid: string;
  positive: string;
  negative: string;
}

export function resolveColors(config: VisualConfig, ctx: RenderContext): ResolvedColors {
  const hc = ctx.highContrast;
  if (hc) {
    return {
      surface: hc.background,
      border: hc.foreground,
      headerText: hc.foreground,
      accent: hc.foreground,
      mutedText: hc.foreground,
      grid: hc.foreground,
      positive: hc.foregroundSelected,
      negative: hc.foreground,
    };
  }

  return {
    surface: config.layout.surfaceColor,
    border: config.layout.borderColor,
    headerText: config.header.textColor,
    accent: config.bar?.accentColor ?? config.kpi?.accentColor ?? '#3b82f6',
    mutedText: config.bar?.categoryLabelColor ?? config.kpi?.labelColor ?? '#64748b',
    grid: config.bar?.gridColor ?? '#f1f5f9',
    positive: config.kpi?.positiveColor ?? '#16a34a',
    negative: config.kpi?.negativeColor ?? '#dc2626',
  };
}

/** Opacidade de esmaecimento de itens nao selecionados (RF-18). */
export const DIMMED_OPACITY = 0.35;
