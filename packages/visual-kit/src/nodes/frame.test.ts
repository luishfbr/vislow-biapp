import { describe, expect, it } from 'vitest';
import { EMPTY_FRAME, missingRoles, seriesOf, sumOf, type DataFrame } from './frame.js';

function frameWith(roles: DataFrame['roles']): DataFrame {
  return { roles, locale: 'pt-BR' };
}

const categoria = { title: 'Regiao', values: ['Sul', 'Norte'], formatted: ['Sul', 'Norte'] };
const valor = { title: 'Receita', values: [10, 30], formatted: ['R$ 10', 'R$ 30'] };

describe('seriesOf', () => {
  it('une categoria e medida preservando a formatacao do host', () => {
    expect(seriesOf(frameWith({ categoria, valor }), 'categoria', 'valor')).toEqual([
      { category: 'Sul', value: 10, formatted: 'R$ 10' },
      { category: 'Norte', value: 30, formatted: 'R$ 30' },
    ]);
  });

  /**
   * A distincao que o `null` carrega: papel FALTANDO pede o estado vazio com
   * instrucao (RF-20); serie VAZIA e filtro que nao retornou linhas. Colapsar os
   * dois faz o visual acusar campo faltando quando o usuario so filtrou demais.
   */
  it('devolve null quando um dos papeis nao esta preenchido', () => {
    expect(seriesOf(frameWith({ categoria }), 'categoria', 'valor')).toBeNull();
    expect(seriesOf(frameWith({ valor }), 'categoria', 'valor')).toBeNull();
    expect(seriesOf(EMPTY_FRAME, 'categoria', 'valor')).toBeNull();
  });

  it('distingue serie vazia de papel faltando', () => {
    const vazio = frameWith({
      categoria: { title: 'Regiao', values: [], formatted: [] },
      valor: { title: 'Receita', values: [], formatted: [] },
    });
    expect(seriesOf(vazio, 'categoria', 'valor')).toEqual([]);
  });

  it('trata nulo e nao-numero sem produzir NaN', () => {
    const sujo = frameWith({
      categoria: { title: 'C', values: [null, 'x'], formatted: ['', 'x'] },
      valor: { title: 'V', values: ['nao numero', null], formatted: ['-', '-'] },
    });
    expect(seriesOf(sujo, 'categoria', 'valor')).toEqual([
      { category: '', value: 0, formatted: '-' },
      { category: 'x', value: 0, formatted: '-' },
    ]);
  });
});

describe('missingRoles', () => {
  it('lista os papeis ausentes na ordem em que foram pedidos', () => {
    expect(missingRoles(frameWith({ valor }), 'categoria', 'valor')).toEqual(['categoria']);
    expect(missingRoles(EMPTY_FRAME, 'categoria', 'valor')).toEqual(['categoria', 'valor']);
    expect(missingRoles(frameWith({ categoria, valor }), 'categoria', 'valor')).toEqual([]);
  });
});

describe('sumOf', () => {
  it('soma a medida e formata pelo locale do quadro', () => {
    expect(sumOf(frameWith({ valor }), 'valor')).toEqual({ total: 40, formatted: '40' });
  });

  /**
   * Com uma linha so, o `formatted` do host e o valor exato do agregado — e
   * carrega moeda, percentual e casas decimais que o nosso Intl nao conhece.
   */
  it('preserva o formato do host quando ha uma unica linha', () => {
    const unica = frameWith({ valor: { title: 'Receita', values: [1234.5], formatted: ['R$ 1,23 mil'] } });
    expect(sumOf(unica, 'valor')).toEqual({ total: 1234.5, formatted: 'R$ 1,23 mil' });
  });

  it('devolve null quando o papel nao esta preenchido', () => {
    expect(sumOf(EMPTY_FRAME, 'valor')).toBeNull();
  });
});
