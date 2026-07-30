import { describe, expect, it } from 'vitest';
import { TOKEN_CATALOG, type TokenKind } from '@vislow/config-schema';
import { CLASS_MAPS, cx } from './tokens.js';

/**
 * T-02 — o guardiao do ADR-02 / RN-05.
 *
 * Se alguem adicionar um token ao catalogo do schema sem adicionar a classe
 * correspondente aqui, o Tailwind nao geraria o CSS e o estilo sumiria em
 * silencio dentro do Power BI. Este teste transforma essa falha silenciosa
 * em falha de CI.
 */
describe('cobertura de tokens (T-02)', () => {
  const MAP_FOR: Record<TokenKind, keyof typeof CLASS_MAPS> = {
    spacing: 'spacing',
    radius: 'radius',
    fontSize: 'fontSize',
    fontWeight: 'fontWeight',
    align: 'align',
    shadow: 'shadow',
    border: 'border',
  };

  it.each(Object.keys(TOKEN_CATALOG) as TokenKind[])(
    'todo valor de "%s" tem classe mapeada',
    (kind) => {
      const values = TOKEN_CATALOG[kind];
      const map = CLASS_MAPS[MAP_FOR[kind]] as Record<string, string>;
      for (const value of values) {
        expect(map, `token "${kind}.${value}" sem entrada no mapa`).toHaveProperty(value);
        expect(typeof map[value]).toBe('string');
      }
      // O mapa nao pode ter chaves alem do catalogo (evita classe orfa no CSS).
      expect(Object.keys(map).sort()).toEqual([...values].sort());
    },
  );

  it('radiusTop cobre exatamente os mesmos valores de radius', () => {
    expect(Object.keys(CLASS_MAPS.radiusTop).sort()).toEqual(
      Object.keys(CLASS_MAPS.radius).sort(),
    );
  });

  it('gap cobre exatamente os mesmos valores de spacing', () => {
    expect(Object.keys(CLASS_MAPS.gap).sort()).toEqual(Object.keys(CLASS_MAPS.spacing).sort());
  });
});

describe('classes literais (invariante do ADR-02)', () => {
  const all = Object.values(CLASS_MAPS).flatMap((m) => Object.values(m));

  it('nenhuma classe contem interpolacao ou template literal', () => {
    for (const cls of all) {
      expect(cls).not.toMatch(/[${}`]/);
    }
  });

  it('toda classe nao-vazia usa o prefixo pbi: do Tailwind v4', () => {
    for (const cls of all.filter((c) => c !== '')) {
      for (const part of cls.split(' ')) {
        expect(part, `classe sem prefixo: ${part}`).toMatch(/^pbi:/);
      }
    }
  });
});

describe('cx', () => {
  it('ignora vazios, false, null e undefined', () => {
    expect(cx('a', '', false, null, undefined, 'b')).toBe('a b');
  });
});
