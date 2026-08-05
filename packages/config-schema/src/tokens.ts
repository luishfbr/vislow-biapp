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
 *
 * ========================= O QUE SAIU DAQUI, E POR QUE =======================
 * Ate a spec 3.0.0 este catalogo tambem governava MEDIDA: espacamento, raio,
 * espessura de borda e tamanho de fonte eram enums de seis ou sete degraus. Era
 * uma restricao real — nao havia como pedir 13px de espacamento, so `sm` (8) ou
 * `md` (16) —, e ela existia por um motivo tecnico que NAO se aplica a medida:
 * cor tambem e livre desde sempre, e funciona, porque cor vai por `style`
 * inline e nunca vira classe.
 *
 * Na spec 4.0.0 as medidas seguiram o mesmo caminho da cor: valor livre em
 * pixel, aplicado por `style`. A garantia de purge do Tailwind continua
 * intacta, porque nenhum numero do usuario chega a virar nome de classe. O que
 * sobrou aqui e o que e mesmo ESCOLHA ENTRE ALTERNATIVAS, e nao medida —
 * `font-weight` e `text-align` sao valores nomeados no proprio CSS, e a sombra e
 * uma receita de varias camadas que nao cabe num numero.
 * =============================================================================
 */

export const FONT_WEIGHT = ['normal', 'medium', 'semibold', 'bold'] as const;
export const ALIGN = ['left', 'center', 'right'] as const;
export const SHADOW = ['none', 'sm', 'md', 'lg'] as const;

export type FontWeight = (typeof FONT_WEIGHT)[number];
export type Align = (typeof ALIGN)[number];
export type Shadow = (typeof SHADOW)[number];

/** Catalogo completo, usado pelo editor para gerar controles e pelos testes. */
export const TOKEN_CATALOG = {
  fontWeight: FONT_WEIGHT,
  align: ALIGN,
  shadow: SHADOW,
} as const;

export type TokenKind = keyof typeof TOKEN_CATALOG;

/**
 * Cor e MEDIDA sao as excecoes deliberadas a RN-05: aceitam valor livre e sao
 * aplicadas por `style` inline, nunca por classe. Isso permite qualquer cor de
 * marca e qualquer pixel sem violar a garantia de purge do Tailwind.
 */
export const COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';
export const COLOR_REGEX = new RegExp(COLOR_PATTERN);

export function isHexColor(value: string): boolean {
  return COLOR_REGEX.test(value);
}
