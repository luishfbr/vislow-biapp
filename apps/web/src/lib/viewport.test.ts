import { describe, expect, it } from 'vitest';
import {
  SCALE_MAX,
  SCALE_MIN,
  clampScale,
  fitToPane,
  panBy,
  zoomAt,
  zoomToScale,
  type Viewport,
} from './viewport';

/**
 * A camera do editor.
 *
 * O que se protege aqui e a INVARIANTE do zoom-no-cursor: o ponto da prancheta
 * que estava sob o ponteiro tem de continuar sob ele depois. E a diferenca entre
 * um zoom em que se olha o que se quer e um em que se amplia e depois procura.
 */

const PANE = { width: 800, height: 600 };
const ARTBOARD = { width: 1280, height: 720 };

/** Que ponto da PRANCHETA esta sob um ponto do painel. */
function artboardPointUnder(viewport: Viewport, point: { x: number; y: number }) {
  return {
    x: (point.x - viewport.tx) / viewport.scale,
    y: (point.y - viewport.ty) / viewport.scale,
  };
}

describe('zoom no cursor', () => {
  const inicial: Viewport = { scale: 1, tx: 0, ty: 0 };

  it('o ponto sob o cursor nao se move', () => {
    const cursor = { x: 300, y: 200 };
    const antes = artboardPointUnder(inicial, cursor);
    const depois = artboardPointUnder(zoomAt(inicial, 1.5, cursor), cursor);

    expect(depois.x).toBeCloseTo(antes.x, 10);
    expect(depois.y).toBeCloseTo(antes.y, 10);
  });

  it('continua valendo com a camera ja deslocada e ampliada', () => {
    const deslocada: Viewport = { scale: 2.3, tx: -140, ty: 75 };
    const cursor = { x: 512, y: 91 };
    const antes = artboardPointUnder(deslocada, cursor);
    const depois = artboardPointUnder(zoomAt(deslocada, 0.7, cursor), cursor);

    expect(depois.x).toBeCloseTo(antes.x, 10);
    expect(depois.y).toBeCloseTo(antes.y, 10);
  });

  it('reduzir e ampliar de volta no mesmo ponto volta ao mesmo lugar', () => {
    const cursor = { x: 410, y: 260 };
    const ida = zoomAt(inicial, 2, cursor);
    const volta = zoomAt(ida, 0.5, cursor);

    expect(volta.scale).toBeCloseTo(inicial.scale, 10);
    expect(volta.tx).toBeCloseTo(inicial.tx, 10);
    expect(volta.ty).toBeCloseTo(inicial.ty, 10);
  });
});

describe('limites de escala', () => {
  it('prende no piso e no teto', () => {
    expect(clampScale(50)).toBe(SCALE_MAX);
    expect(clampScale(0.001)).toBe(SCALE_MIN);
    expect(clampScale(1.5)).toBe(1.5);
  });

  it('no limite, a prancheta NAO desliza', () => {
    // A roda continua girando depois de bater no teto. Sem esta guarda, cada
    // entalhe extra recalcularia o deslocamento com escala igual e a prancheta
    // sairia andando sozinha sob o cursor parado.
    const noTeto: Viewport = { scale: SCALE_MAX, tx: 30, ty: -12 };
    expect(zoomAt(noTeto, 1.1, { x: 400, y: 300 })).toBe(noTeto);

    const noPiso: Viewport = { scale: SCALE_MIN, tx: 30, ty: -12 };
    expect(zoomAt(noPiso, 0.9, { x: 400, y: 300 })).toBe(noPiso);
  });
});

describe('enquadrar', () => {
  it('centraliza a prancheta no painel', () => {
    const view = fitToPane(ARTBOARD, PANE);
    expect(view.tx).toBeCloseTo((PANE.width - ARTBOARD.width * view.scale) / 2, 10);
    expect(view.ty).toBeCloseTo((PANE.height - ARTBOARD.height * view.scale) / 2, 10);
  });

  it('NAO amplia uma prancheta pequena para encher o painel', () => {
    // Ampliar 100x100 ate 800 de largura faria um texto de 12px parecer um
    // titulo — a mentira que declarar o tamanho existe para evitar. Quem quiser
    // ampliar usa o zoom, onde a ampliacao e escolha visivel.
    expect(fitToPane({ width: 100, height: 100 }, PANE).scale).toBe(1);
  });

  it('sem medida do painel, nao inventa enquadramento', () => {
    expect(fitToPane(ARTBOARD, null)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});

describe('deslocar', () => {
  it('soma no deslocamento e nao mexe na escala', () => {
    const view: Viewport = { scale: 1.7, tx: 10, ty: 20 };
    expect(panBy(view, -5, 8)).toEqual({ scale: 1.7, tx: 5, ty: 28 });
  });
});

describe('escala exata', () => {
  it('ancora no centro do painel', () => {
    // Ancorar no canto jogaria para fora da tela justamente o que estava no
    // meio dela, que e onde a atencao esta.
    const view = fitToPane(ARTBOARD, PANE);
    const centro = { x: PANE.width / 2, y: PANE.height / 2 };
    const antes = artboardPointUnder(view, centro);

    const cheio = zoomToScale(view, 1, PANE);
    expect(cheio.scale).toBe(1);
    expect(artboardPointUnder(cheio, centro).x).toBeCloseTo(antes.x, 10);
    expect(artboardPointUnder(cheio, centro).y).toBeCloseTo(antes.y, 10);
  });

  it('respeita os limites', () => {
    expect(zoomToScale({ scale: 1, tx: 0, ty: 0 }, 99, PANE).scale).toBe(SCALE_MAX);
  });
});
