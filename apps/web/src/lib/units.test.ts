import { RECT_MIN_SIZE } from '@vislow/component-registry';
import { describe, expect, it } from 'vitest';
import { axisLimitsPx, percentToPx, pxToPercent, rectToPx } from './units';

/**
 * A traducao entre o que o usuario le (pixel) e o que a spec guarda (%).
 *
 * O que se protege aqui e a HONESTIDADE do numero: um campo que mostra "256px"
 * tem de gravar um percentual que volta a dar 256px, e sem medida do pai tem de
 * dizer que nao sabe, em vez de chutar. Um pixel inventado e pior que nenhum —
 * o usuario digitaria contra ele.
 */

const PRANCHETA = { width: 1280, height: 720 };

describe('pixel e percentual', () => {
  it('converte nos dois sentidos', () => {
    expect(percentToPx(12.5, 1280)).toBe(160);
    expect(pxToPercent(160, 1280)).toBe(12.5);
  });

  it('o ciclo fecha dentro do arredondamento da spec', () => {
    // A spec guarda 2 casas e o campo mostra inteiro, entao a ida e volta perde
    // no maximo meio pixel. Mais que isso seria a caixa andando sozinha a cada
    // vez que o painel fosse aberto.
    for (const px of [0, 1, 37, 160, 640, 1279]) {
      const percent = pxToPercent(px, 1280);
      expect(percentToPx(percent!, 1280)).toBeCloseTo(px, 0);
    }
  });

  it('sem medida do pai, diz que nao sabe', () => {
    expect(percentToPx(50, undefined)).toBeUndefined();
    expect(pxToPercent(100, undefined)).toBeUndefined();
  });

  it('pai de tamanho zero tambem e "nao sei"', () => {
    // Dividir por zero daria `Infinity`, que o campo mostraria como um numero.
    expect(pxToPercent(100, 0)).toBeUndefined();
    expect(percentToPx(50, 0)).toBeUndefined();
  });
});

describe('caixa inteira', () => {
  it('converte os quatro eixos contra o eixo certo do pai', () => {
    // Largura contra a largura, altura contra a ALTURA. Usar um so tamanho para
    // os dois eixos e o erro que passa despercebido numa prancheta quadrada.
    expect(rectToPx({ x: 10, y: 10, w: 50, h: 50 }, PRANCHETA)).toEqual({
      x: 128,
      y: 72,
      w: 640,
      h: 360,
    });
  });

  it('sem medida, nao devolve caixa pela metade', () => {
    expect(rectToPx({ x: 10, y: 10, w: 50, h: 50 }, undefined)).toBeUndefined();
  });
});

describe('limites em pixel', () => {
  const rect = { x: 10, y: 20, w: 50, h: 30 };

  it('a posicao vai ate onde a caixa ainda cabe inteira', () => {
    // x maximo = (100 - w)% da largura. Passar disso empurraria a caixa para
    // fora do pai, e o `clampRect` a traria de volta — um campo que aceita o que
    // o store desfaz ensina o usuario a nao confiar no que digitou.
    expect(axisLimitsPx('x', rect, PRANCHETA)).toEqual({ min: 0, max: 640 });
    expect(axisLimitsPx('y', rect, PRANCHETA)).toEqual({ min: 0, max: 504 });
  });

  it('o tamanho vai do piso da spec ate o que sobra da origem', () => {
    expect(axisLimitsPx('w', rect, PRANCHETA)).toEqual({
      min: Math.round((RECT_MIN_SIZE / 100) * 1280),
      max: 1152,
    });
  });

  it('o piso nunca arredonda para zero', () => {
    // Num container estreito, 2% pode dar menos de meio pixel. Largura minima
    // zero desenha nada, e "nada" e indistinguivel de componente apagado.
    expect(axisLimitsPx('w', rect, { width: 20, height: 20 })?.min).toBe(1);
  });

  it('sem medida, nao ha limite em pixel', () => {
    expect(axisLimitsPx('w', rect, undefined)).toBeUndefined();
  });
});
