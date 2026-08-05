import { describe, expect, it } from 'vitest';
import { TOKEN_CATALOG, type TokenKind } from '@vislow/config-schema';
import { CLASS_MAPS, cx, px } from './tokens.js';

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
    fontWeight: 'fontWeight',
    align: 'align',
    shadow: 'shadow',
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

  it('o catalogo nao voltou a governar MEDIDA', () => {
    // Na spec 4.0.0 espacamento, raio, espessura e tamanho de fonte deixaram de
    // ser enum e viraram pixel livre, aplicado por `style`. Reintroduzir um
    // deles como token seria voltar a prender o usuario em seis degraus — e o
    // caminho para isso e silencioso: bastaria acrescentar a chave aqui.
    expect(Object.keys(TOKEN_CATALOG).sort()).toEqual(['align', 'fontWeight', 'shadow']);
  });
});

describe('medida em pixel', () => {
  it('deixa passar o pixel escolhido', () => {
    expect(px(13)).toBe(13);
    expect(px(0.5)).toBe(0.5);
  });

  it('numero ausente ou impossivel vira zero, nunca `NaN`', () => {
    // `style={{ padding: NaN }}` e ignorado sem erro, e o componente sai com o
    // espacamento do host — divergindo do preview sem nada reclamar.
    for (const bad of [undefined, null, 'md', NaN, Infinity, -4]) {
      expect(px(bad)).toBe(0);
    }
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
