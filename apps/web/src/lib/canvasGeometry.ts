import { RECT_MIN_SIZE, type NodeRect } from '@vislow/component-registry';

/** Atracao do encaixe, em PIXEL DE TELA: quem julga "esta perto" e o olho, e o olho mede na tela. */
export const SNAP_PX = 6;

export const KEY_STEP_PX = 1;
export const KEY_STEP_COARSE_PX = 10;

/** Sem medida do container, encaixe desligado seria um gesto que muda de comportamento na primeira medida. */
const FALLBACK_TOLERANCE = 1;

export interface BoxPx {
  width: number;
  height: number;
}

export interface PlacedChild {
  id: string;
  rect: NodeRect;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Caixa de tela, do jeito que o `getBoundingClientRect` devolve. */
export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Caixa medida na tela, em pixel de PRANCHETA: a diferenca cancela o deslocamento, e sobra desfazer o zoom. */
export function boxWithin(
  box: ScreenBox,
  base: ScreenBox,
  scale: number,
): { x: number; y: number; w: number; h: number } | null {
  if (scale <= 0) return null;
  return {
    x: (box.left - base.left) / scale,
    y: (box.top - base.top) / scale,
    w: box.width / scale,
    h: box.height / scale,
  };
}

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

export function percentPerPx(box: BoxPx | undefined, axis: 'x' | 'y'): number | undefined {
  const size = axis === 'x' ? box?.width : box?.height;
  if (size === undefined || size <= 0) return undefined;
  return 100 / size;
}

function toleranceOf(box: BoxPx | undefined, axis: 'x' | 'y'): number {
  const perPx = percentPerPx(box, axis);
  return perPx === undefined ? FALLBACK_TOLERANCE : SNAP_PX * perPx;
}

export function edgesOf(
  children: readonly PlacedChild[],
  skip: ReadonlySet<string>,
  axis: 'x' | 'y',
): number[] {
  const edges = [0, 50, 100];
  for (const child of children) {
    if (skip.has(child.id)) continue;
    const start = axis === 'x' ? child.rect.x : child.rect.y;
    const size = axis === 'x' ? child.rect.w : child.rect.h;
    edges.push(start, start + size, start + size / 2);
  }
  return edges;
}

/** `null` para lista vazia, e nao caixa em zero: "nao ha o que envolver" nao e "envolve nada". */
export function unionRect(rects: readonly NodeRect[]): NodeRect | null {
  const first = rects[0];
  if (!first) return null;

  let left = first.x;
  let top = first.y;
  let right = first.x + first.w;
  let bottom = first.y + first.h;

  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  }

  return { x: round2(left), y: round2(top), w: round2(right - left), h: round2(bottom - top) };
}


export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Por INTERSECCAO, nao por continencia: basta a banda cruzar qualquer parte do no. */
export function marqueeHits(
  boxes: readonly { id: string; box: ScreenRect }[],
  band: ScreenRect,
): string[] {
  return boxes
    .filter(
      ({ box }) =>
        box.left < band.right &&
        box.right > band.left &&
        box.top < band.bottom &&
        box.bottom > band.top,
    )
    .map(({ id }) => id);
}

export function bandOf(
  from: { x: number; y: number },
  to: { x: number; y: number },
): ScreenRect {
  return {
    left: Math.min(from.x, to.x),
    top: Math.min(from.y, to.y),
    right: Math.max(from.x, to.x),
    bottom: Math.max(from.y, to.y),
  };
}

/** Fora da tolerancia o valor passa INTACTO — e o que faz o encaixe ser atracao, e nao grade. */
export function snapValue(
  value: number,
  tolerance: number,
  candidates: readonly number[],
): { value: number; guide: number | undefined } {
  let best: number | undefined;
  let bestDistance = tolerance;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best === undefined ? { value, guide: undefined } : { value: best, guide: best };
}

/** Sempre a partir da caixa do INICIO do gesto: acumular faria o erro de arredondamento andar sozinho. */
export function applyGesture({
  from,
  handle,
  deltaX,
  deltaY,
  siblings,
  skip,
  freeform,
  axisLock = false,
  proportional = false,
  boxPx,
}: {
  from: NodeRect;
  handle: HandleId | 'move';
  deltaX: number;
  deltaY: number;
  siblings: readonly PlacedChild[];
  skip: ReadonlySet<string>;
  freeform: boolean;
  axisLock?: boolean;
  proportional?: boolean;
  boxPx?: BoxPx | undefined;
}): { rect: NodeRect; guides: Guide[] } {
  const guides: Guide[] = [];
  const xEdges = freeform ? [] : edgesOf(siblings, skip, 'x');
  const yEdges = freeform ? [] : edgesOf(siblings, skip, 'y');

  const fit = (value: number, axis: 'x' | 'y'): number => {
    if (freeform) return value;
    const snapped = snapValue(
      value,
      toleranceOf(boxPx, axis),
      axis === 'x' ? xEdges : yEdges,
    );
    if (snapped.guide !== undefined) guides.push({ axis, at: snapped.guide });
    return snapped.value;
  };

  if (handle === 'move') {
    const dx = axisLock && Math.abs(deltaX) < Math.abs(deltaY) ? 0 : deltaX;
    const dy = axisLock && Math.abs(deltaY) <= Math.abs(deltaX) ? 0 : deltaY;

    return {
      rect: {
        x: round2(clamp(fit(from.x + dx, 'x'), 0, 100 - from.w)),
        y: round2(clamp(fit(from.y + dy, 'y'), 0, 100 - from.h)),
        w: from.w,
        h: from.h,
      },
      guides,
    };
  }

  let { x, y, w, h } = from;
  const right = from.x + from.w;
  const bottom = from.y + from.h;

  const movesW = handle.includes('w');
  const movesE = handle.includes('e');
  const movesN = handle.includes('n');
  const movesS = handle.includes('s');

  if (movesW) {
    x = clamp(fit(from.x + deltaX, 'x'), 0, right - RECT_MIN_SIZE);
    w = right - x;
  }
  if (movesE) {
    w = clamp(fit(right + deltaX, 'x'), from.x + RECT_MIN_SIZE, 100) - from.x;
  }
  if (movesN) {
    y = clamp(fit(from.y + deltaY, 'y'), 0, bottom - RECT_MIN_SIZE);
    h = bottom - y;
  }
  if (movesS) {
    h = clamp(fit(bottom + deltaY, 'y'), from.y + RECT_MIN_SIZE, 100) - from.y;
  }

  if (proportional && from.w > 0 && from.h > 0) {
    const ratio = from.w / from.h;
    const changedX = Math.abs(w / from.w - 1);
    const changedY = Math.abs(h / from.h - 1);
    const driveByX = (movesW || movesE) && (!(movesN || movesS) || changedX >= changedY);

    if (driveByX) h = w / ratio;
    else w = h * ratio;

    if (movesW) x = right - w;
    if (movesN) y = bottom - h;
  }

  w = clamp(w, RECT_MIN_SIZE, 100);
  h = clamp(h, RECT_MIN_SIZE, 100);
  x = clamp(x, 0, 100 - w);
  y = clamp(y, 0, 100 - h);

  return { rect: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }, guides };
}

/** O sujeito do encaixe e a CAIXA ENVOLVENTE, nao cada no: N sujeitos achariam arestas diferentes e o bloco se romperia. */
export function applyGroupMove({
  union,
  deltaX,
  deltaY,
  siblings,
  movingIds,
  freeform,
  axisLock = false,
  boxPx,
}: {
  union: NodeRect;
  deltaX: number;
  deltaY: number;
  siblings: readonly PlacedChild[];
  movingIds: ReadonlySet<string>;
  freeform: boolean;
  axisLock?: boolean;
  boxPx?: BoxPx | undefined;
}): { delta: { dx: number; dy: number }; guides: Guide[] } {
  const resolved = applyGesture({
    from: union,
    handle: 'move',
    deltaX,
    deltaY,
    siblings,
    skip: movingIds,
    freeform,
    axisLock,
    boxPx,
  });

  return {
    delta: { dx: round2(resolved.rect.x - union.x), dy: round2(resolved.rect.y - union.y) },
    guides: resolved.guides,
  };
}

export function byKeyboard(
  rect: NodeRect,
  key: string,
  options: { coarse: boolean; resizing: boolean; boxPx?: BoxPx | undefined },
): NodeRect | null {
  const px = options.coarse ? KEY_STEP_COARSE_PX : KEY_STEP_PX;
  const stepX = px * (percentPerPx(options.boxPx, 'x') ?? 0.5);
  const stepY = px * (percentPerPx(options.boxPx, 'y') ?? 0.5);

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
