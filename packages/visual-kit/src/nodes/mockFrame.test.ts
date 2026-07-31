import { describe, expect, it } from 'vitest';
import { seriesOf, sumOf } from './frame.js';
import { mockFrame } from './mockFrame.js';

const ROLES = [
  { name: 'regiao', kind: 'grouping' as const },
  { name: 'receita', kind: 'measure' as const },
  { name: 'custo', kind: 'measure' as const },
];

describe('quadro de exemplo do preview', () => {
  it('cria uma coluna para cada papel declarado', () => {
    const frame = mockFrame(ROLES);
    expect(Object.keys(frame.roles).sort()).toEqual(['custo', 'receita', 'regiao']);
  });

  it('nao cria coluna para papel nao declarado', () => {
    // E o que faz o estado vazio da RN-04 aparecer no preview quando o usuario
    // remove um papel que um no ainda referencia.
    expect(mockFrame(ROLES).roles.inexistente).toBeUndefined();
  });

  it('as colunas sao paralelas — mesma contagem de linhas', () => {
    const frame = mockFrame(ROLES);
    const lengths = Object.values(frame.roles).map((column) => column?.values.length);
    expect(new Set(lengths).size).toBe(1);
  });

  it('alimenta `seriesOf` sem buracos', () => {
    const series = seriesOf(mockFrame(ROLES), 'regiao', 'receita');
    expect(series).not.toBeNull();
    expect(series).toHaveLength(5);
    for (const point of series ?? []) {
      expect(typeof point.value).toBe('number');
      expect(point.formatted).not.toBe('');
    }
  });

  it('alimenta `sumOf` — o agregado do KPI', () => {
    expect(sumOf(mockFrame(ROLES), 'receita')?.total).toBeGreaterThan(0);
  });

  it('e deterministico: o preview nao muda sozinho entre renders', () => {
    expect(mockFrame(ROLES)).toEqual(mockFrame(ROLES));
  });

  it('duas medidas desenham series DIFERENTES', () => {
    // Dois graficos lado a lado com o mesmo desenho esconderiam do usuario que
    // ele ligou o campo errado num deles.
    const frame = mockFrame(ROLES);
    expect(frame.roles.receita?.values).not.toEqual(frame.roles.custo?.values);
  });

  it('expoe problema de layout de proposito: nome curto, nome longo e zero', () => {
    const frame = mockFrame([{ name: 'regiao', kind: 'grouping' }]);
    const values = frame.roles.regiao?.values.map(String) ?? [];
    expect(values.some((value) => value.length > 15)).toBe(true);
    expect(values.some((value) => value.length <= 4)).toBe(true);
  });

  it('formata a medida no locale pedido', () => {
    const frame = mockFrame([{ name: 'receita', kind: 'measure' }], 'en-US');
    expect(frame.locale).toBe('en-US');
    expect(frame.roles.receita?.formatted[1]).toContain(',');
  });
});
