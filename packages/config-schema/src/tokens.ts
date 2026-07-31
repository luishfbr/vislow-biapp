/**
 * Catalogo de tokens de design (docs/build-visual.md).
 *
 * REGRA CENTRAL (ADR-02 / RN-05): estes enums sao FECHADOS. Todo valor aqui tem
 * uma classe correspondente escrita literalmente no mapa do @vislow/visual-kit.
 * E isso que garante que o Tailwind enxergue a classe em build time, num runtime
 * que e compilado ANTES de o usuario escolher qualquer coisa.
 *
 * Adicionar um valor aqui sem adicionar a classe no visual-kit quebra o teste
 * de cobertura de tokens (T-02) — de proposito.
 */

export const SPACING = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
export const RADIUS = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const;
export const FONT_SIZE = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '4xl'] as const;
export const FONT_WEIGHT = ['normal', 'medium', 'semibold', 'bold'] as const;
export const ALIGN = ['left', 'center', 'right'] as const;
export const SHADOW = ['none', 'sm', 'md', 'lg'] as const;
export const BORDER = ['none', 'thin', 'medium'] as const;

export type Spacing = (typeof SPACING)[number];
export type Radius = (typeof RADIUS)[number];
export type FontSize = (typeof FONT_SIZE)[number];
export type FontWeight = (typeof FONT_WEIGHT)[number];
export type Align = (typeof ALIGN)[number];
export type Shadow = (typeof SHADOW)[number];
export type Border = (typeof BORDER)[number];

/** Catalogo completo, usado pelo editor para gerar controles e pelos testes. */
export const TOKEN_CATALOG = {
  spacing: SPACING,
  radius: RADIUS,
  fontSize: FONT_SIZE,
  fontWeight: FONT_WEIGHT,
  align: ALIGN,
  shadow: SHADOW,
  border: BORDER,
} as const;

export type TokenKind = keyof typeof TOKEN_CATALOG;

/**
 * Cores sao a excecao deliberada a RN-05: aceitam hex livre e sao aplicadas por
 * `style` inline, nunca por classe. Isso permite qualquer cor de marca sem
 * violar a garantia de purge do Tailwind.
 */
export const COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';
export const COLOR_REGEX = new RegExp(COLOR_PATTERN);

export function isHexColor(value: string): boolean {
  return COLOR_REGEX.test(value);
}
