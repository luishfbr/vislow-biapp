import { RECT_MIN_SIZE, type NodeRect } from '@vislow/component-registry';

/**
 * A matematica do canvas: encaixe, arrasto, redimensionamento e teclado.
 *
 * Fora do componente de proposito. E aqui que mora a diferenca entre um canvas
 * que parece profissional e um em que nada se alinha — e nada disso precisa de
 * React para ser conferido. No componente sobra o encanamento do gesto, que
 * jsdom mal consegue exercitar; aqui ficam as regras, que se testam direto.
 *
 * Tudo em PERCENTUAL do container. Pixel nunca chega neste modulo: quem converte
 * deslocamento de ponteiro em porcentagem e o componente, uma vez por gesto.
 */

/** Encaixe: 24 colunas por 16 linhas do container. */
export const GRID_X = 100 / 24;
export const GRID_Y = 100 / 16;

/** Tolerancia do alinhamento com irmao, em % — cerca de meia celula. */
export const SNAP_TOLERANCE = 2;

/** Passo fino do teclado: um quarto de celula. */
export const FINE_STEP = 0.25;

export interface PlacedChild {
  id: string;
  rect: NodeRect;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Linha de alinhamento a desenhar durante o gesto. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Arestas de encaixe num eixo: as do container e as dos irmaos.
 *
 * Inclui o CENTRO de cada irmao, alem das bordas. Centralizar um titulo sobre um
 * grafico e o alinhamento que mais aparece numa composicao, e sem o centro na
 * lista ele so sairia certo por sorte.
 */
export function edgesOf(
  children: readonly PlacedChild[],
  skipId: string,
  axis: 'x' | 'y',
): number[] {
  const edges = [0, 50, 100];
  for (const child of children) {
    if (child.id === skipId) continue;
    const start = axis === 'x' ? child.rect.x : child.rect.y;
    const size = axis === 'x' ? child.rect.w : child.rect.h;
    edges.push(start, start + size, start + size / 2);
  }
  return edges;
}

/**
 * Encaixa um valor na grade, ou numa aresta de irmao quando ela estiver perto.
 *
 * A aresta do irmao VENCE a grade: quem arrasta um cartao para junto de outro
 * quer as bordas rentes, e a celula mais proxima quase nunca cai exatamente onde
 * o vizinho esta. So o encaixe em irmao produz guia — a grade e silenciosa,
 * senao a tela pisca uma linha a cada celula percorrida.
 */
export function snapValue(
  value: number,
  step: number,
  candidates: readonly number[],
): { value: number; guide: number | undefined } {
  let best: number | undefined;
  let bestDistance = SNAP_TOLERANCE;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (best !== undefined) return { value: best, guide: best };
  return { value: Math.round(value / step) * step, guide: undefined };
}

/**
 * Aplica o deslocamento de um gesto a caixa de origem.
 *
 * Sempre a partir da caixa do INICIO do gesto, nunca acumulando sobre a anterior:
 * acumular soma o erro de arredondamento a cada evento de ponteiro, e um arrasto
 * longo termina longe de onde o cursor esta.
 */
export function applyGesture({
  from,
  handle,
  deltaX,
  deltaY,
  siblings,
  selectedId,
  freeform,
}: {
  from: NodeRect;
  handle: HandleId | 'move';
  deltaX: number;
  deltaY: number;
  siblings: readonly PlacedChild[];
  selectedId: string;
  /** Alt pressionado: solta do encaixe. */
  freeform: boolean;
}): { rect: NodeRect; guides: Guide[] } {
  const guides: Guide[] = [];
  const xEdges = freeform ? [] : edgesOf(siblings, selectedId, 'x');
  const yEdges = freeform ? [] : edgesOf(siblings, selectedId, 'y');

  const fit = (value: number, axis: 'x' | 'y'): number => {
    if (freeform) return value;
    const snapped = snapValue(value, axis === 'x' ? GRID_X : GRID_Y, axis === 'x' ? xEdges : yEdges);
    if (snapped.guide !== undefined) guides.push({ axis, at: snapped.guide });
    return snapped.value;
  };

  if (handle === 'move') {
    return {
      rect: {
        x: round2(clamp(fit(from.x + deltaX, 'x'), 0, 100 - from.w)),
        y: round2(clamp(fit(from.y + deltaY, 'y'), 0, 100 - from.h)),
        w: from.w,
        h: from.h,
      },
      guides,
    };
  }

  let { x, y, w, h } = from;
  const right = from.x + from.w;
  const bottom = from.y + from.h;

  // Cada borda e presa contra a OPOSTA, e nao contra o container: sem isso,
  // arrastar a alca esquerda para alem da direita inverte a caixa e o no
  // desaparece — largura negativa nao desenha nada, e sem erro nenhum.
  if (handle.includes('w')) {
    x = clamp(fit(from.x + deltaX, 'x'), 0, right - RECT_MIN_SIZE);
    w = right - x;
  }
  if (handle.includes('e')) {
    w = clamp(fit(right + deltaX, 'x'), from.x + RECT_MIN_SIZE, 100) - from.x;
  }
  if (handle.includes('n')) {
    y = clamp(fit(from.y + deltaY, 'y'), 0, bottom - RECT_MIN_SIZE);
    h = bottom - y;
  }
  if (handle.includes('s')) {
    h = clamp(fit(bottom + deltaY, 'y'), from.y + RECT_MIN_SIZE, 100) - from.y;
  }

  return { rect: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }, guides };
}

/**
 * Move ou redimensiona pelo teclado.
 *
 * Nao e alternativa de cortesia: um editor em que so o mouse posiciona exclui do
 * produto inteiro quem nao usa mouse. E o passo por celula ainda e mais exato que
 * o arrasto, entao acaba sendo o caminho de quem quer precisao.
 */
export function byKeyboard(
  rect: NodeRect,
  key: string,
  options: { fine: boolean; resizing: boolean },
): NodeRect | null {
  const stepX = options.fine ? GRID_X * FINE_STEP : GRID_X;
  const stepY = options.fine ? GRID_Y * FINE_STEP : GRID_Y;

  const dx = key === 'ArrowLeft' ? -stepX : key === 'ArrowRight' ? stepX : 0;
  const dy = key === 'ArrowUp' ? -stepY : key === 'ArrowDown' ? stepY : 0;
  if (dx === 0 && dy === 0) return null;

  if (options.resizing) {
    return {
      x: rect.x,
      y: rect.y,
      w: round2(clamp(rect.w + dx, RECT_MIN_SIZE, 100 - rect.x)),
      h: round2(clamp(rect.h + dy, RECT_MIN_SIZE, 100 - rect.y)),
    };
  }

  return {
    x: round2(clamp(rect.x + dx, 0, 100 - rect.w)),
    y: round2(clamp(rect.y + dy, 0, 100 - rect.h)),
    w: rect.w,
    h: rect.h,
  };
}
