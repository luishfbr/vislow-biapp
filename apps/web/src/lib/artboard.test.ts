import { ARTBOARD_MAX, ARTBOARD_MIN } from '@vislow/component-registry';
import { describe, expect, it } from 'vitest';
import { ARTBOARD_PRESETS, fitScale, scalePercent } from './artboard';

describe('escala da prancheta', () => {
  it('desenha em 1:1 quando a prancheta cabe inteira', () => {
    expect(fitScale({ width: 640, height: 360 }, { width: 900, height: 600 })).toBe(1);
  });

  it('nunca amplia — prancheta pequena fica pequena, e essa e a informacao', () => {
    // Ampliar 100x100 ate preencher o painel faria um texto de 12px parecer
    // titulo, que e exatamente a mentira que declarar o tamanho existe para
    // evitar.
    expect(fitScale({ width: 100, height: 100 }, { width: 2000, height: 2000 })).toBe(1);
  });

  it('reduz pelo eixo mais apertado, uniforme nos dois', () => {
    // 1920x1080 num painel de 960x900: a largura pede 0,5 e a altura permitiria
    // 0,83. Vence a largura, senao a prancheta sai cortada.
    expect(fitScale({ width: 1920, height: 1080 }, { width: 960, height: 900 })).toBe(0.5);
    expect(fitScale({ width: 1920, height: 1080 }, { width: 1920, height: 540 })).toBe(0.5);
  });

  it('sem medida do painel devolve 1 em vez de chutar', () => {
    expect(fitScale({ width: 1280, height: 720 }, null)).toBe(1);
    expect(fitScale({ width: 1280, height: 720 }, { width: 0, height: 0 })).toBe(1);
  });

  it('a prancheta reduzida cabe no painel, em toda a faixa valida', () => {
    const pane = { width: 700, height: 420 };
    for (const artboard of [
      ARTBOARD_MIN,
      ARTBOARD_MAX,
      { width: 1280, height: 720 },
      { width: 1920, height: 100 },
      { width: 100, height: 1080 },
    ]) {
      const scale = fitScale(artboard, pane);
      expect(artboard.width * scale).toBeLessThanOrEqual(pane.width);
      expect(artboard.height * scale).toBeLessThanOrEqual(pane.height);
    }
  });
});

describe('leitura da escala', () => {
  it('arredonda para baixo — 100% promete pixel real', () => {
    expect(scalePercent(1)).toBe(100);
    expect(scalePercent(0.996)).toBe(99);
    expect(scalePercent(0.625)).toBe(62);
  });
});

describe('atalhos de tamanho', () => {
  it('todo atalho esta dentro da faixa que o schema aceita', () => {
    for (const { label, size } of ARTBOARD_PRESETS) {
      expect(size.width, label).toBeGreaterThanOrEqual(ARTBOARD_MIN.width);
      expect(size.width, label).toBeLessThanOrEqual(ARTBOARD_MAX.width);
      expect(size.height, label).toBeGreaterThanOrEqual(ARTBOARD_MIN.height);
      expect(size.height, label).toBeLessThanOrEqual(ARTBOARD_MAX.height);
    }
  });

  it('cada atalho tem a proporcao que o rotulo anuncia', () => {
    const ratio = (label: string): number => {
      const [w, h] = label.split(':').map(Number);
      return (w ?? 0) / (h ?? 1);
    };
    for (const { label, size } of ARTBOARD_PRESETS) {
      expect(size.width / size.height, label).toBeCloseTo(ratio(label), 5);
    }
  });
});
