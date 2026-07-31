import { describe, expect, it } from 'vitest';
import {
  EMPTY_FRAME,
  INERT_HOST,
  hostOf,
  missingRoles,
  seriesOf,
  sumOf,
  type DataFrame,
  type FrameHost,
} from './frame.js';

function frameWith(roles: DataFrame['roles']): DataFrame {
  return { roles, locale: 'pt-BR' };
}

/** Host de teste: registra o que foi pedido e finge a selecao que se quiser. */
function fakeHost(selected: number[] = []): FrameHost & {
  selects: [string, number, boolean][];
  tooltips: [readonly string[], number][];
} {
  const selects: [string, number, boolean][] = [];
  const tooltips: [readonly string[], number][] = [];
  return {
    kind: 'host',
    selects,
    tooltips,
    hasSelection: selected.length > 0,
    select: (role, index, multi) => selects.push([role, index, multi]),
    isSelected: (_role, index) => selected.includes(index),
    showTooltip: (roles, index) => tooltips.push([roles, index]),
    hideTooltip: () => undefined,
  };
}

const categoria = { title: 'Regiao', values: ['Sul', 'Norte'], formatted: ['Sul', 'Norte'] };
const valor = { title: 'Receita', values: [10, 30], formatted: ['R$ 10', 'R$ 30'] };

describe('seriesOf', () => {
  it('une categoria e medida preservando a formatacao do host', () => {
    expect(seriesOf(frameWith({ categoria, valor }), 'categoria', 'valor')).toEqual([
      { category: 'Sul', value: 10, formatted: 'R$ 10', index: 0, selected: false },
      { category: 'Norte', value: 30, formatted: 'R$ 30', index: 1, selected: false },
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
      { category: '', value: 0, formatted: '-', index: 0, selected: false },
      { category: 'x', value: 0, formatted: '-', index: 1, selected: false },
    ]);
  });
});

describe('selecao no quadro (RF-18)', () => {
  it('marca como selecionados os pontos que o host aponta', () => {
    const frame: DataFrame = { ...frameWith({ categoria, valor }), host: fakeHost([1]) };
    expect(seriesOf(frame, 'categoria', 'valor')?.map((p) => p.selected)).toEqual([false, true]);
  });

  /**
   * O indice e o que liga o ponto de volta ao selection id do host. Sem ele o
   * clique numa barra reordenada filtraria a categoria errada — o tipo de bug
   * que so aparece com dado real.
   */
  it('carrega o indice da linha de origem', () => {
    const points = seriesOf(frameWith({ categoria, valor }), 'categoria', 'valor');
    expect(points?.map((p) => p.index)).toEqual([0, 1]);
  });
});

describe('hostOf', () => {
  /**
   * O preview do editor nao tem host. Todo no chama `hostOf` e nunca
   * `frame.host?.`: um encadeamento opcional por chamada e uma chance por
   * chamada de esquecer o `?.` — e o esquecimento so quebra o editor.
   */
  it('devolve o host inerte quando o quadro nao tem host', () => {
    expect(hostOf(EMPTY_FRAME)).toBe(INERT_HOST);
    expect(hostOf(EMPTY_FRAME).kind).toBe('inert');
    expect(hostOf(EMPTY_FRAME).hasSelection).toBe(false);
    expect(hostOf(EMPTY_FRAME).isSelected('categoria', 0)).toBe(false);
  });

  it('o host inerte nao explode quando um no o aciona', () => {
    const inert = hostOf(EMPTY_FRAME);
    expect(() => {
      inert.select('categoria', 0, false);
      inert.showTooltip(['categoria'], 0, { x: 1, y: 2 });
      inert.hideTooltip();
    }).not.toThrow();
  });

  it('devolve o host de verdade quando ele existe', () => {
    const host = fakeHost();
    expect(hostOf({ ...EMPTY_FRAME, host })).toBe(host);
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
