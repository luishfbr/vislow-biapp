import { describe, expect, it } from 'vitest';
import {
  GRID_X,
  GRID_Y,
  applyGesture,
  byKeyboard,
  edgesOf,
  snapValue,
  type PlacedChild,
} from './canvasGeometry';

/**
 * Dois irmaos conhecidos: um cartao a esquerda e um a direita, com folga entre
 * eles. Serve para exercitar o encaixe em aresta de vizinho.
 */
const SIBLINGS: PlacedChild[] = [
  { id: 'alvo', rect: { x: 10, y: 10, w: 20, h: 20 } },
  { id: 'vizinho', rect: { x: 60, y: 40, w: 20, h: 20 } },
];

const ALVO = SIBLINGS[0]!.rect;

/** Move o alvo por um delta, com encaixe ligado. */
function move(deltaX: number, deltaY: number, freeform = false) {
  return applyGesture({
    from: ALVO,
    handle: 'move',
    deltaX,
    deltaY,
    siblings: SIBLINGS,
    selectedId: 'alvo',
    freeform,
  });
}

describe('encaixe', () => {
  it('cai na celula mais proxima, sem guia', () => {
    // A grade e silenciosa: uma linha piscando a cada celula percorrida
    // transformaria o arrasto num estroboscopio.
    const { rect, guides } = move(1, 0);
    expect(rect.x).toBe(12.5); // 11 -> a celula de 12,5 (3 x 4,1667)
    expect(guides).toEqual([]);
  });

  it('a aresta do vizinho vence a grade, e ai sim desenha guia', () => {
    // Levar o alvo para perto de x=60 (borda esquerda do vizinho): a celula mais
    // proxima seria 58,33, mas quem arrasta ate ali quer as bordas rentes.
    const { rect, guides } = move(49.4, 0);
    expect(rect.x).toBe(60);
    expect(guides).toContainEqual({ axis: 'x', at: 60 });
  });

  it('o centro do vizinho tambem encaixa — e o alinhamento mais comum', () => {
    const { rect } = move(60, 0);
    expect(rect.x).toBe(70); // centro do vizinho: 60 + 20/2
  });

  it('Alt solta do encaixe e nao produz guia', () => {
    const { rect, guides } = move(1, 0, true);
    expect(rect.x).toBe(11);
    expect(guides).toEqual([]);
  });

  it('so encaixa dentro da tolerancia', () => {
    expect(snapValue(50, GRID_X, [60]).value).not.toBe(60);
    expect(snapValue(59, GRID_X, [60]).value).toBe(60);
  });

  it('nao encaixa no proprio no', () => {
    // Sem o descarte, o alvo grudaria nas proprias arestas e nao sairia do lugar.
    expect(edgesOf(SIBLINGS, 'alvo', 'x')).not.toContain(10);
    expect(edgesOf(SIBLINGS, 'alvo', 'x')).toContain(60);
  });
});

describe('arrasto', () => {
  it('prende na borda do container em vez de sair por ela', () => {
    expect(move(200, 0).rect).toMatchObject({ x: 80, w: 20 });
    expect(move(-200, 0).rect).toMatchObject({ x: 0, w: 20 });
    expect(move(0, 200).rect).toMatchObject({ y: 80, h: 20 });
  });

  it('mover nao muda o tamanho', () => {
    const { rect } = move(13, 7);
    expect(rect.w).toBe(ALVO.w);
    expect(rect.h).toBe(ALVO.h);
  });

  it('o delta e sempre relativo ao inicio do gesto', () => {
    // Acumular sobre a caixa anterior somaria o arredondamento a cada evento de
    // ponteiro, e um arrasto longo terminaria longe do cursor. Medido SEM
    // encaixe: com ele, dois deltas diferentes caem em celulas diferentes de
    // proposito, e a diferenca deixa de ser o que se quer observar aqui.
    expect(move(20, 0, true).rect.x).toBe(30);
    expect(move(40, 0, true).rect.x).toBe(50);
  });
});

describe('redimensionamento', () => {
  function resize(handle: 'e' | 'w' | 's' | 'n' | 'se', deltaX: number, deltaY: number) {
    return applyGesture({
      from: ALVO,
      handle,
      deltaX,
      deltaY,
      siblings: [],
      selectedId: 'alvo',
      freeform: true,
    }).rect;
  }

  it('a alca direita muda a largura e nao mexe na origem', () => {
    expect(resize('e', 10, 0)).toEqual({ x: 10, y: 10, w: 30, h: 20 });
  });

  it('a alca esquerda move a origem e compensa na largura', () => {
    expect(resize('w', -5, 0)).toEqual({ x: 5, y: 10, w: 25, h: 20 });
  });

  it('a alca de canto mexe nos dois eixos', () => {
    expect(resize('se', 10, 10)).toEqual({ x: 10, y: 10, w: 30, h: 30 });
  });

  it('a borda nao ultrapassa a oposta — caixa invertida some sem erro', () => {
    // Sem o piso contra a borda oposta, arrastar a alca esquerda alem da direita
    // daria largura negativa: o no simplesmente desaparece, e nada reclama.
    expect(resize('w', 100, 0)).toMatchObject({ x: 28, w: 2 });
    expect(resize('n', 0, 100)).toMatchObject({ y: 28, h: 2 });
  });

  it('nao cresce para fora do container', () => {
    expect(resize('e', 500, 0).w).toBe(90); // x=10, entao o maximo e 90
    expect(resize('s', 0, 500).h).toBe(90);
  });
});

describe('teclado', () => {
  const opcoes = { fine: false, resizing: false };

  it('a seta anda uma celula', () => {
    expect(byKeyboard(ALVO, 'ArrowRight', opcoes)?.x).toBe(14.17);
    expect(byKeyboard(ALVO, 'ArrowDown', opcoes)?.y).toBe(16.25);
  });

  it('Shift anda um quarto de celula', () => {
    expect(byKeyboard(ALVO, 'ArrowRight', { ...opcoes, fine: true })?.x).toBe(11.04);
  });

  it('com Ctrl a seta redimensiona em vez de mover', () => {
    const next = byKeyboard(ALVO, 'ArrowRight', { ...opcoes, resizing: true });
    expect(next).toMatchObject({ x: 10, w: 24.17 });
  });

  it('prende nos limites, igual ao arrasto', () => {
    const encostado = { x: 80, y: 0, w: 20, h: 20 };
    expect(byKeyboard(encostado, 'ArrowRight', opcoes)?.x).toBe(80);
    expect(byKeyboard(encostado, 'ArrowUp', opcoes)?.y).toBe(0);
  });

  it('ignora tecla que nao e seta', () => {
    expect(byKeyboard(ALVO, 'Enter', opcoes)).toBeNull();
    expect(byKeyboard(ALVO, 'a', opcoes)).toBeNull();
  });

  it('o passo do teclado e o mesmo da grade do arrasto', () => {
    // Duas constantes diferentes fariam o teclado desalinhar o que o mouse
    // alinhou, e a composicao ficaria com meia celula de erro invisivel.
    expect(byKeyboard({ x: 0, y: 0, w: 10, h: 10 }, 'ArrowRight', opcoes)?.x).toBe(
      Math.round(GRID_X * 100) / 100,
    );
    expect(byKeyboard({ x: 0, y: 0, w: 10, h: 10 }, 'ArrowDown', opcoes)?.y).toBe(
      Math.round(GRID_Y * 100) / 100,
    );
  });
});
