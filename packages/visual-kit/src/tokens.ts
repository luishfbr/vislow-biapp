import type { Align, FontWeight, Shadow, VAlign } from '@vislow/config-schema';

/**
 * Mapa token -> classe. ESTE ARQUIVO E O CORACAO DO ADR-02.
 *
 * ============================ REGRA INVIOLAVEL ============================
 * As classes DEVEM ser strings literais completas. NUNCA construa uma classe por
 * interpolacao (`vsl-w-${peso}`) ou concatenacao. O nome montado nao existe no
 * `styles.css`, e navegador nenhum reclama de classe inexistente: o estilo
 * simplesmente some dentro do Power BI, sem erro e sem aviso.
 *
 * Ate a spec 4.0.0 a razao era outra — o Tailwind fazia analise estatica do
 * fonte e so gerava o CSS das classes que conseguia LER aqui. O Tailwind saiu na
 * 5.0.0 e a regra ficou, agora com um dono a mais: `scripts/check-css.mjs`
 * confere os dois sentidos, classe usada sem regra e regra sem uso, e uma classe
 * interpolada nao aparece em nenhum dos dois lados.
 * =========================================================================
 *
 * ===================== POR QUE MEDIDA NAO ESTA MAIS AQUI =====================
 * Espacamento, raio, espessura e tamanho de fonte tinham mapa neste arquivo ate
 * a spec 3.0.0 — seis ou sete degraus cada. A regra acima e a razao de terem
 * sido enums. Mas ela so vale para CLASSE: desde sempre a cor e livre e
 * funciona, porque vai por `style` inline, que nao passa por analise nenhuma.
 *
 * As medidas seguiram esse caminho: viraram numero na spec e `style` inline nos
 * componentes. O que continua aqui e o que e ESCOLHA ENTRE ALTERNATIVAS, e nao
 * medida — peso, alinhamento nos dois eixos, sombra, direcao e transbordo.
 * =============================================================================
 */

/** Direcao de um container. Chaves batem com o campo `direction` do registro. */
export const DIRECTION_CLASS: Record<'row' | 'column', string> = {
  row: 'vsl-row',
  column: 'vsl-col',
};

export const FONT_WEIGHT_CLASS: Record<FontWeight, string> = {
  normal: 'vsl-w-normal',
  medium: 'vsl-w-medium',
  semibold: 'vsl-w-semibold',
  bold: 'vsl-w-bold',
};

export const ALIGN_CLASS: Record<Align, string> = {
  left: 'vsl-h-left',
  center: 'vsl-h-center',
  right: 'vsl-h-right',
};

export const VALIGN_CLASS: Record<VAlign, string> = {
  top: 'vsl-v-top',
  middle: 'vsl-v-middle',
  bottom: 'vsl-v-bottom',
};

export const SHADOW_CLASS: Record<Shadow, string> = {
  none: 'vsl-shadow-none',
  sm: 'vsl-shadow-sm',
  md: 'vsl-shadow-md',
  lg: 'vsl-shadow-lg',
};

/** Todos os mapas, para o teste de cobertura de tokens (T-02). */
export const CLASS_MAPS = {
  fontWeight: FONT_WEIGHT_CLASS,
  align: ALIGN_CLASS,
  valign: VALIGN_CLASS,
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

/**
 * ====================== A ASSINATURA: TIPOGRAFIA OPTICA ======================
 *
 * `fontSize` e pixel LIVRE. Uma entrelinha fixa serve bem a um tamanho so: 1.2
 * aperta os 11px de uma nota de rodape ate a ilegibilidade e afrouxa os 44px de
 * um numero grande ate ele parecer solto. Como o usuario digita qualquer numero,
 * a entrelinha precisa responder ao numero.
 *
 * A curva e uma reta com piso: texto pequeno respira, texto grande fecha. Custa
 * uma linha e vale por um controle a mais que ninguem teria de aprender.
 *
 *    11px -> 1.44     20px -> 1.35     44px -> 1.15 (piso)
 */
export function leadingFor(fontSize: number): number {
  const size = px(fontSize);
  return Math.max(1.15, 1.55 - size / 100);
}

/**
 * Tracking pelo mesmo motivo, e na direcao contraria a da entrelinha.
 *
 * Titulo grande com tracking neutro le como texto ampliado; texto pequeno com
 * tracking neutro le como texto comprimido. Os limiares sao os pontos em que a
 * diferenca passa a ser visivel, nao uma curva continua — meio milesimo de em em
 * cada tamanho intermediario seria precisao inventada.
 */
export function trackingFor(fontSize: number): string {
  const size = px(fontSize);
  if (size >= 28) return '-0.02em';
  if (size <= 12) return '0.01em';
  return '0';
}
