/**
 * Catalogo de tokens de design (docs/build-visual.md).
 *
 * REGRA CENTRAL (ADR-02 / RN-05): estes enums sao FECHADOS. Todo valor aqui tem
 * uma classe `vsl-*` correspondente, escrita literalmente no mapa do
 * @vislow/visual-kit E no `styles.css` dele. Um valor sem classe nao desenha
 * nada — e nao avisa.
 *
 * Adicionar um valor aqui sem adicionar a classe no visual-kit quebra o teste de
 * cobertura de tokens (T-02) e a guarda `check-css.mjs` — de proposito, e nos
 * dois sentidos: a guarda tambem reprova regra CSS que ninguem usa.
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
 * pixel, aplicado por `style`. Nenhum numero do usuario chega a virar nome de
 * classe, entao o conjunto de classes do pacote continua fechado e conferivel. O
 * que sobrou aqui e o que e mesmo ESCOLHA ENTRE ALTERNATIVAS, e nao medida —
 * `font-weight`, `text-align` e alinhamento vertical sao valores nomeados no
 * proprio CSS, e a sombra e uma receita de varias camadas que nao cabe num
 * numero.
 * =============================================================================
 */

export const FONT_WEIGHT = ['normal', 'medium', 'semibold', 'bold'] as const;
export const ALIGN = ['left', 'center', 'right'] as const;
/**
 * Alinhamento VERTICAL do conteudo dentro da caixa.
 *
 * Separado de `align` de proposito: sao dois eixos independentes, e um catalogo
 * unico com seis valores obrigaria todo consumidor a saber quais deles servem
 * para qual eixo — que e exatamente o tipo de convencao que o compilador nao
 * cobra.
 */
export const VALIGN = ['top', 'middle', 'bottom'] as const;
export const SHADOW = ['none', 'sm', 'md', 'lg'] as const;

export type FontWeight = (typeof FONT_WEIGHT)[number];
export type Align = (typeof ALIGN)[number];
export type VAlign = (typeof VALIGN)[number];
export type Shadow = (typeof SHADOW)[number];

/** Catalogo completo, usado pelo editor para gerar controles e pelos testes. */
export const TOKEN_CATALOG = {
  fontWeight: FONT_WEIGHT,
  align: ALIGN,
  valign: VALIGN,
  shadow: SHADOW,
} as const;

export type TokenKind = keyof typeof TOKEN_CATALOG;

/**
 * Cor e MEDIDA sao as excecoes deliberadas a RN-05: aceitam valor livre e sao
 * aplicadas por `style` inline, nunca por classe. Isso permite qualquer cor de
 * marca e qualquer pixel sem abrir o conjunto fechado de classes do pacote.
 */
export const COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';
export const COLOR_REGEX = new RegExp(COLOR_PATTERN);

export function isHexColor(value: string): boolean {
  return COLOR_REGEX.test(value);
}
