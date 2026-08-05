import { describe, expect, it } from 'vitest';
import {
  KEY_STEP_COARSE_PX,
  KEY_STEP_PX,
  SNAP_PX,
  applyGesture,
  byKeyboard,
  edgesOf,
  percentPerPx,
  snapValue,
  type BoxPx,
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

/** Container do tamanho da prancheta padrao. Tolerancia: 6px em 1280 = 0,47%. */
const BOX: BoxPx = { width: 1280, height: 720 };

/** Move o alvo por um delta, com encaixe ligado. */
function move(deltaX: number, deltaY: number, over: Partial<Parameters<typeof applyGesture>[0]> = {}) {
  return applyGesture({
    from: ALVO,
    handle: 'move',
    deltaX,
    deltaY,
    siblings: SIBLINGS,
    selectedId: 'alvo',
    freeform: false,
    boxPx: BOX,
    ...over,
  });
}

describe('o valor e livre — nao existe mais grade', () => {
  it('um pixel arrastado e um pixel gravado', () => {
    // ATE 2026-08-04 este mesmo gesto caia numa celula de 4,17%: numa prancheta
    // de 1280 o componente so pousava de 53 em 53 pixels. Era essa a sensacao
    // de canvas travado.
    const { rect, guides } = move(1, 0);
    expect(rect.x).toBe(11);
    expect(guides).toEqual([]);
  });

  it('longe de qualquer aresta, o valor passa intacto', () => {
    expect(move(3.7, 0).rect.x).toBe(13.7);
    expect(move(0, 2.3).rect.y).toBe(12.3);
  });
});

describe('encaixe', () => {
  it('gruda na aresta do vizinho quando chega perto, e desenha a guia', () => {
    // 59,7 esta a 0,3% de 60 — dentro dos 6px de tolerancia (0,47% em 1280).
    const { rect, guides } = move(49.7, 0);
    expect(rect.x).toBe(60);
    expect(guides).toContainEqual({ axis: 'x', at: 60 });
  });

  it('NAO gruda fora da tolerancia', () => {
    // 59 esta a 1% de 60, o dobro da folga. Antes, esse valor era arredondado
    // para a celula de grade mais proxima de qualquer jeito.
    const { rect, guides } = move(49, 0);
    expect(rect.x).toBe(59);
    expect(guides).toEqual([]);
  });

  it('o centro do vizinho tambem encaixa — e o alinhamento mais comum', () => {
    // Centro do vizinho: 60 + 20/2 = 70. Centralizar um titulo sobre um grafico
    // e o alinhamento que mais aparece numa composicao.
    const { rect, guides } = move(59.8, 0);
    expect(rect.x).toBe(70);
    expect(guides).toContainEqual({ axis: 'x', at: 70 });
  });

  it('a tolerancia e em PIXEL DE TELA, nao em % do pai', () => {
    // A mesma folga de 6px vale menos por cento num container largo. Com
    // tolerancia fixa em %, o encaixe grudaria com forca diferente conforme o
    // tamanho do container — um fio no estreito, meio dedo no largo.
    const estreito = { width: 200, height: 200 };
    const largo = { width: 2000, height: 2000 };

    // 58,5 esta a 1,5% de 60.
    expect(move(48.5, 0, { boxPx: estreito }).rect.x).toBe(60);
    expect(move(48.5, 0, { boxPx: largo }).rect.x).toBe(58.5);
  });

  it('Ctrl/Cmd solta do encaixe e nao produz guia', () => {
    const { rect, guides } = move(49.7, 0, { freeform: true });
    expect(rect.x).toBe(59.7);
    expect(guides).toEqual([]);
  });

  it('sem medida do container, o encaixe continua vivo', () => {
    // Degradar para "sem encaixe" seria uma falha silenciosa: o usuario
    // descobriria pela composicao desalinhada, sem nada na tela dizendo por que.
    const { rect } = move(50.5, 0, { boxPx: undefined });
    expect(rect.x).toBe(60);
  });

  it('nao encaixa no proprio no', () => {
    // Sem o descarte, o alvo grudaria nas proprias arestas e nao sairia do lugar.
    expect(edgesOf(SIBLINGS, 'alvo', 'x')).not.toContain(10);
    expect(edgesOf(SIBLINGS, 'alvo', 'x')).toContain(60);
  });

  it('a conversao de pixel para % protege contra container zerado', () => {
    // Dividir por zero daria `Infinity`, e uma tolerancia infinita gruda na
    // primeira aresta que existir e nunca mais solta.
    expect(percentPerPx({ width: 0, height: 0 }, 'x')).toBeUndefined();
    expect(percentPerPx(undefined, 'y')).toBeUndefined();
    expect(percentPerPx({ width: 200, height: 100 }, 'x')).toBe(0.5);
  });

  it('so encaixa dentro da tolerancia', () => {
    expect(snapValue(50, 2, [60]).value).toBe(50);
    expect(snapValue(59, 2, [60]).value).toBe(60);
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
    // ponteiro, e um arrasto longo terminaria longe do cursor.
    expect(move(20, 0, { freeform: true }).rect.x).toBe(30);
    expect(move(40, 0, { freeform: true }).rect.x).toBe(50);
  });

  it('Shift tranca no eixo que andou mais', () => {
    expect(move(20, 3, { axisLock: true }).rect).toMatchObject({ x: 30, y: 10 });
    expect(move(3, 20, { axisLock: true }).rect).toMatchObject({ x: 10, y: 30 });
  });

  it('Shift deixa corrigir a direcao sem soltar o botao', () => {
    // O eixo trancado e decidido pelo MAIOR deslocamento, e nao pelo primeiro
    // movimento: quem comecou torto tem de conseguir endireitar.
    expect(move(5, 30, { axisLock: true }).rect).toMatchObject({ x: 10, y: 40 });
  });
});

describe('redimensionamento', () => {
  function resize(
    handle: 'e' | 'w' | 's' | 'n' | 'se' | 'nw',
    deltaX: number,
    deltaY: number,
    over: Partial<Parameters<typeof applyGesture>[0]> = {},
  ) {
    return applyGesture({
      from: ALVO,
      handle,
      deltaX,
      deltaY,
      siblings: [],
      selectedId: 'alvo',
      freeform: true,
      ...over,
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

  describe('Shift preserva a proporcao', () => {
    const LARGO = { x: 10, y: 10, w: 40, h: 20 }; // proporcao 2:1

    const prop = (handle: 'se' | 'nw' | 'e', dx: number, dy: number) =>
      applyGesture({
        from: LARGO,
        handle,
        deltaX: dx,
        deltaY: dy,
        siblings: [],
        selectedId: 'alvo',
        freeform: true,
        proportional: true,
      }).rect;

    it('a altura acompanha a largura', () => {
      expect(prop('se', 10, 0)).toEqual({ x: 10, y: 10, w: 50, h: 25 });
    });

    it('a borda oposta a arrastada nao anda', () => {
      // Canto superior esquerdo: o inferior direito (50, 30) e a ancora.
      const rect = prop('nw', -10, 0);
      expect(rect).toEqual({ x: 0, y: 5, w: 50, h: 25 });
      expect(rect.x + rect.w).toBe(50);
      expect(rect.y + rect.h).toBe(30);
    });

    it('vale tambem numa alca de borda', () => {
      expect(prop('e', 20, 0)).toMatchObject({ w: 60, h: 30 });
    });

    it('a dimensao derivada tambem e presa no container', () => {
      // A proporcao deriva uma altura que nenhum clamp de ramo tocou. Sem o
      // fecho unico no fim, ela sai da prancheta e o no some pela borda.
      const rect = prop('se', 500, 0);
      expect(rect.w).toBe(90);
      expect(rect.y + rect.h).toBeLessThanOrEqual(100);
    });
  });
});

describe('teclado', () => {
  const opcoes = { coarse: false, resizing: false, boxPx: BOX };

  it('a seta anda UM PIXEL da prancheta', () => {
    // "Uma seta anda um pixel" e uma promessa conferivel. "Uma seta anda 4,17%
    // do pai", que era o passo da grade, nao e promessa nenhuma.
    expect(byKeyboard(ALVO, 'ArrowRight', opcoes)?.x).toBe(round(10 + 100 / 1280));
    expect(byKeyboard(ALVO, 'ArrowDown', opcoes)?.y).toBe(round(10 + 100 / 720));
  });

  it('Shift anda dez pixels', () => {
    const passo = KEY_STEP_COARSE_PX / KEY_STEP_PX;
    expect(passo).toBe(10);
    expect(byKeyboard(ALVO, 'ArrowRight', { ...opcoes, coarse: true })?.x).toBe(
      round(10 + (100 / 1280) * KEY_STEP_COARSE_PX),
    );
  });

  it('com Ctrl a seta redimensiona em vez de mover', () => {
    const next = byKeyboard(ALVO, 'ArrowRight', { ...opcoes, resizing: true });
    expect(next).toMatchObject({ x: 10, w: round(20 + 100 / 1280) });
  });

  it('sem medida, a seta ainda anda — nunca zero', () => {
    // Passo zero e indistinguivel de atalho quebrado.
    const next = byKeyboard(ALVO, 'ArrowRight', { coarse: false, resizing: false });
    expect(next?.x).toBeGreaterThan(ALVO.x);
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

  it('a folga do encaixe e maior que o passo da seta', () => {
    // Se a seta andasse mais que a folga, seria impossivel parar dentro da zona
    // de encaixe pelo teclado: o no pularia de um lado ao outro dela.
    expect(SNAP_PX).toBeGreaterThan(KEY_STEP_PX);
  });
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
