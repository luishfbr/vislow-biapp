import type { Artboard } from '@vislow/component-registry';
import { fitScale, type Pane } from './artboard';

/**
 * A camera do editor: quanto se ve da prancheta, e de onde.
 *
 * Ate 2026-08-04 nao havia camera nenhuma — a escala era so `fitScale`, presa em
 * 100% no teto, e nao havia deslocamento. Isso queria dizer que numa prancheta
 * de 1920 nada podia ser inspecionado de perto: o editor mostrava tudo, sempre,
 * reduzido, e o unico jeito de julgar um detalhe era exportar.
 *
 * Fora do componente, como `artboard.ts` e `canvasGeometry.ts`: e regra, e regra
 * se testa direto. No componente sobram os eventos.
 */

/**
 * Onde a camera esta.
 *
 * `tx`/`ty` sao o deslocamento da prancheta dentro do painel, em PIXEL DE TELA,
 * medidos a partir do canto do painel — a mesma unidade em que o ponteiro chega.
 * Guardar em unidade de prancheta obrigaria a converter em todo evento, e o
 * ponto do zoom-no-cursor e justamente nao ter essa conversao no meio.
 */
export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * Limites de zoom.
 *
 * O teto de 4x nao e generosidade: um texto de 12px numa prancheta de 1920 tem
 * meio milimetro na tela quando ela cabe inteira no painel, e julgar peso de
 * fonte nesse tamanho e adivinhar. O piso de 0,1 deixa uma prancheta de 1920
 * caber num painel estreito com folga.
 */
export const SCALE_MIN = 0.1;
export const SCALE_MAX = 4;

/** Passo do zoom por entalhe de roda. Multiplicativo: zoom e escala geometrica. */
export const ZOOM_STEP = 1.1;

export function clampScale(scale: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
}

/**
 * Amplia mantendo FIXO o ponto sob o cursor.
 *
 * E o que separa um zoom utilizavel de um inutil. Ampliando pelo centro do
 * painel, quem quer olhar um canto amplia e depois procura — a cada entalhe da
 * roda. Mantendo o ponto do cursor, o zoom vai para onde se esta olhando.
 *
 * `point` esta em pixel de tela relativo ao painel, igual a `tx`/`ty`.
 *
 * A conta: o ponto da prancheta sob o cursor e `(point - t) / scale`. Ele tem de
 * continuar sob o cursor depois, entao `point = t' + antes * scale'`, de onde
 * sai o `t'` abaixo.
 */
export function zoomAt(
  viewport: Viewport,
  factor: number,
  point: { x: number; y: number },
): Viewport {
  const scale = clampScale(viewport.scale * factor);
  // No limite o `clamp` mordeu e a escala nao mudou: mexer no deslocamento aqui
  // faria a prancheta deslizar sozinha enquanto a roda continua girando.
  if (scale === viewport.scale) return viewport;

  const ratio = scale / viewport.scale;
  return {
    scale,
    tx: point.x - (point.x - viewport.tx) * ratio,
    ty: point.y - (point.y - viewport.ty) * ratio,
  };
}

/** Desloca a camera. Sem limite: a prancheta pode sair de vista e voltar. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, tx: viewport.tx + dx, ty: viewport.ty + dy };
}

/**
 * Enquadra a prancheta inteira, centralizada, com folga.
 *
 * Reaproveita o `fitScale`, que ja e o comportamento de sempre — inclusive o
 * teto de 1: enquadrar uma prancheta de 100x100 ampliando-a ate encher o painel
 * faria um texto de 12px parecer um titulo, que e a mentira que declarar o
 * tamanho existe para evitar. Quem quiser ampliar alem disso usa o zoom, onde a
 * ampliacao e uma escolha visivel e nao um efeito colateral do enquadramento.
 */
export function fitToPane(artboard: Artboard, pane: Pane | null): Viewport {
  const scale = fitScale(artboard, pane);
  if (!pane) return { scale, tx: 0, ty: 0 };

  return {
    scale,
    tx: (pane.width - artboard.width * scale) / 2,
    ty: (pane.height - artboard.height * scale) / 2,
  };
}

/**
 * Amplia ou reduz para uma escala exata, ancorando no centro do painel.
 *
 * Usado pelo "100%" (Ctrl+0). Ancorar no centro, e nao no canto, mantem na tela
 * o que estava no meio dela — que e onde a atencao esta.
 */
export function zoomToScale(viewport: Viewport, scale: number, pane: Pane | null): Viewport {
  const center = pane
    ? { x: pane.width / 2, y: pane.height / 2 }
    : { x: 0, y: 0 };
  return zoomAt(viewport, clampScale(scale) / viewport.scale, center);
}
