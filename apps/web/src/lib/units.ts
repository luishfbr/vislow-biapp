import { RECT_MIN_SIZE, type NodeRect } from '@vislow/component-registry';
import type { BoxPx } from './canvasGeometry';

/**
 * A traducao entre o que o usuario LE e o que a spec GUARDA.
 *
 * A spec guarda geometria em percentual do pai, e isso nao muda: um visual do
 * Power BI nao escolhe o proprio tamanho — o autor do relatorio arrasta a
 * moldura, e a mesma composicao precisa valer com 400 ou 1600 de largura
 * (`spec.ts`, `NodeRect`). Coordenada em pixel na spec entregaria um visual que
 * nao acompanha a moldura.
 *
 * Mas NINGUEM compoe pensando em "37,5% do pai". Todo editor de desenho fala
 * pixel, e a prancheta existe justamente para dar um tamanho concreto contra o
 * qual o pixel signifique algo. Entao o pixel e a lingua da interface, o
 * percentual e a lingua do arquivo, e a conversao mora aqui — num lugar so,
 * puro e testavel, em vez de espalhada por cada campo.
 */

/**
 * Percentual do pai para pixel.
 *
 * Sem a medida do pai devolve `undefined`, e nao um chute: um numero errado com
 * cara de pixel e pior que nenhum numero — o usuario digitaria contra ele.
 */
export function percentToPx(percent: number, parentPx: number | undefined): number | undefined {
  if (parentPx === undefined || parentPx <= 0) return undefined;
  return Math.round((percent / 100) * parentPx);
}

/** Pixel para percentual do pai, nas duas casas que a spec usa. */
export function pxToPercent(px: number, parentPx: number | undefined): number | undefined {
  if (parentPx === undefined || parentPx <= 0) return undefined;
  return Math.round((px / parentPx) * 100 * 100) / 100;
}

/** A caixa inteira em pixel, ou `undefined` enquanto o pai nao foi medido. */
export interface RectPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectToPx(rect: NodeRect, parent: BoxPx | undefined): RectPx | undefined {
  const x = percentToPx(rect.x, parent?.width);
  const y = percentToPx(rect.y, parent?.height);
  const w = percentToPx(rect.w, parent?.width);
  const h = percentToPx(rect.h, parent?.height);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  return { x, y, w, h };
}

/**
 * Limites de um eixo, em pixel — o que o campo do painel usa para prender.
 *
 * Derivados dos limites em percentual, e nao escritos de novo: `RECT_MIN_SIZE`
 * ja e a fonte, e um segundo minimo escrito em pixel aqui divergiria dela no
 * primeiro dia em que alguem mexesse num dos dois.
 */
export function axisLimitsPx(
  axis: 'x' | 'y' | 'w' | 'h',
  rect: NodeRect,
  parent: BoxPx | undefined,
): { min: number; max: number } | undefined {
  const size = axis === 'x' || axis === 'w' ? parent?.width : parent?.height;
  if (size === undefined || size <= 0) return undefined;

  // Posicao: de zero ate onde a caixa ainda cabe inteira. Tamanho: do piso da
  // spec ate o que sobra a partir da origem atual. E o mesmo par de regras do
  // `clampRect`, dito em pixel.
  switch (axis) {
    case 'x':
      return { min: 0, max: Math.round(((100 - rect.w) / 100) * size) };
    case 'y':
      return { min: 0, max: Math.round(((100 - rect.h) / 100) * size) };
    case 'w':
      return {
        min: Math.max(1, Math.round((RECT_MIN_SIZE / 100) * size)),
        max: Math.round(((100 - rect.x) / 100) * size),
      };
    case 'h':
      return {
        min: Math.max(1, Math.round((RECT_MIN_SIZE / 100) * size)),
        max: Math.round(((100 - rect.y) / 100) * size),
      };
  }
}
