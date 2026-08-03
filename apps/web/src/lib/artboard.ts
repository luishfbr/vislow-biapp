import type { Artboard } from '@vislow/component-registry';

/**
 * A matematica da prancheta: qual escala faz ela caber na area disponivel.
 *
 * Fora do componente pelo mesmo motivo do `canvasGeometry.ts` — e regra, se
 * testa direto, e no componente sobra so a medicao do painel, que jsdom nao
 * exercita.
 */

/** Area util do painel de preview, em px. `null` antes da primeira medicao. */
export interface Pane {
  width: number;
  height: number;
}

/**
 * Atalhos de tamanho. Rotulados pela PROPORCAO porque e assim que se pensa em
 * enquadramento — o tamanho exato vai no nome acessivel, para quem precisa dele.
 *
 * Nao ha atalho para 1920x1080: e 16:9 tambem, esta a dois digitos de distancia
 * no campo, e um quarto botao no trilho paga o preco de todos os outros tres.
 */
export const ARTBOARD_PRESETS: readonly { label: string; size: Artboard }[] = [
  { label: '16:9', size: { width: 1280, height: 720 } },
  { label: '4:3', size: { width: 1440, height: 1080 } },
  { label: '1:1', size: { width: 1080, height: 1080 } },
];

/**
 * Escala que faz a prancheta caber no painel, uniforme nos dois eixos.
 *
 * NUNCA passa de 1. Ampliar uma prancheta de 100x100 ate preencher o painel
 * faria um texto de 12px parecer um titulo — exatamente a mentira que declarar o
 * tamanho existe para evitar. Prancheta pequena fica pequena, e e essa a
 * informacao.
 *
 * Antes da primeira medicao (`pane` nulo) devolve 1: nao ha o que ajustar, e
 * chutar uma escala faria a moldura saltar de tamanho no primeiro frame.
 */
export function fitScale(artboard: Artboard, pane: Pane | null): number {
  if (!pane || pane.width <= 0 || pane.height <= 0) return 1;
  if (artboard.width <= 0 || artboard.height <= 0) return 1;

  return Math.min(1, pane.width / artboard.width, pane.height / artboard.height);
}

/**
 * A escala como o usuario a le: inteiro por cento.
 *
 * Arredonda para BAIXO. Um "100%" numa prancheta que na verdade esta em 99,6%
 * afirma pixel real onde nao ha — e pixel real e a unica coisa que este numero
 * promete.
 */
export function scalePercent(scale: number): number {
  return Math.floor(scale * 100);
}
