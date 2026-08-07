import { describe, expect, it } from 'vitest';
import { createNode, type SpecNode } from '@vislow/component-registry';
import {
  byIndent,
  flattenTree,
  indentOf,
  isNoOp,
  rowAt,
  targetAt,
  type RowBox,
} from './treeDrop';

/** raiz > [titulo, painel > [nota], rodape], 20px por linha. */
const ROWS: RowBox[] = [
  { id: 'raiz', top: 0, height: 20, parentId: null, index: 0, accepts: true },
  { id: 'titulo', top: 20, height: 20, parentId: 'raiz', index: 0, accepts: false },
  { id: 'painel', top: 40, height: 20, parentId: 'raiz', index: 1, accepts: true },
  { id: 'nota', top: 60, height: 20, parentId: 'painel', index: 0, accepts: false },
  { id: 'rodape', top: 80, height: 20, parentId: 'raiz', index: 2, accepts: false },
];

const LIVRE = new Set<string>();

describe('qual linha esta sob o ponteiro', () => {
  it('acha pela faixa, e devolve nada fora da lista', () => {
    expect(rowAt(ROWS, 45)?.id).toBe('painel');
    expect(rowAt(ROWS, 40)?.id).toBe('painel');
    expect(rowAt(ROWS, 60)?.id).toBe('nota');
    expect(rowAt(ROWS, 200)).toBeUndefined();
  });
});

describe('mira sobre um container', () => {
  it('o terco do meio vira FILHO', () => {
    expect(targetAt(ROWS, 47, LIVRE)).toEqual({ kind: 'into', parentId: 'painel' });
    expect(targetAt(ROWS, 52, LIVRE)).toEqual({ kind: 'into', parentId: 'painel' });
  });

  it('as pontas sao fresta, no pai DELE', () => {
    // Acima do painel: posicao 1 na raiz. Abaixo: posicao 2.
    expect(targetAt(ROWS, 41, LIVRE)).toEqual({ kind: 'between', parentId: 'raiz', index: 1 });
    expect(targetAt(ROWS, 58, LIVRE)).toEqual({ kind: 'between', parentId: 'raiz', index: 2 });
  });
});

describe('mira sobre uma folha', () => {
  it('nao existe "dentro" — a metade decide o lado', () => {
    // `acceptsChildren` e falso: recusar em silencio pareceria defeito, entao a
    // linha inteira vira a fresta mais proxima.
    expect(targetAt(ROWS, 22, LIVRE)).toEqual({ kind: 'between', parentId: 'raiz', index: 0 });
    expect(targetAt(ROWS, 38, LIVRE)).toEqual({ kind: 'between', parentId: 'raiz', index: 1 });
  });

  it('a fresta leva o pai da linha, e nao o da raiz', () => {
    // Sobre a `nota`, que mora dentro do painel: o destino e o painel.
    expect(targetAt(ROWS, 62, LIVRE)).toEqual({ kind: 'between', parentId: 'painel', index: 0 });
  });
});

describe('destinos recusados', () => {
  it('a raiz so aceita "dentro" — nao ha fresta acima dela', () => {
    expect(targetAt(ROWS, 1, LIVRE)).toEqual({ kind: 'into', parentId: 'raiz' });
    expect(targetAt(ROWS, 18, LIVRE)).toEqual({ kind: 'into', parentId: 'raiz' });
  });

  it('linha bloqueada nao e destino', () => {
    // Quem esta sendo arrastado, e todo descendente dele: `reparentNode` ja
    // recusaria o ciclo, mas o indicador nao pode prometer o que nao acontece.
    expect(targetAt(ROWS, 47, new Set(['painel']))).toBeNull();
    expect(targetAt(ROWS, 62, new Set(['nota']))).toBeNull();
  });

  it('fora de qualquer linha nao e destino', () => {
    expect(targetAt(ROWS, 500, LIVRE)).toBeNull();
  });
});

describe('soltar onde ja esta', () => {
  it('recusa "dentro" do proprio pai', () => {
    expect(isNoOp({ kind: 'into', parentId: 'raiz' }, ROWS, ['titulo'])).toBe(true);
    expect(isNoOp({ kind: 'into', parentId: 'painel' }, ROWS, ['titulo'])).toBe(false);
  });

  it('recusa a fresta imediatamente antes e depois', () => {
    // `titulo` esta no indice 0: soltar em 0 ou em 1 o deixa onde estava.
    expect(isNoOp({ kind: 'between', parentId: 'raiz', index: 0 }, ROWS, ['titulo'])).toBe(true);
    expect(isNoOp({ kind: 'between', parentId: 'raiz', index: 1 }, ROWS, ['titulo'])).toBe(true);
    expect(isNoOp({ kind: 'between', parentId: 'raiz', index: 2 }, ROWS, ['titulo'])).toBe(false);
  });

  it('com um bloco, o intervalo inteiro conta', () => {
    const bloco = ['titulo', 'painel'];
    expect(isNoOp({ kind: 'between', parentId: 'raiz', index: 0 }, ROWS, bloco)).toBe(true);
    expect(isNoOp({ kind: 'between', parentId: 'raiz', index: 2 }, ROWS, bloco)).toBe(true);
    expect(isNoOp({ kind: 'between', parentId: 'raiz', index: 3 }, ROWS, bloco)).toBe(false);
  });

  it('mudar de pai nunca e no-op', () => {
    expect(isNoOp({ kind: 'between', parentId: 'painel', index: 0 }, ROWS, ['titulo'])).toBe(false);
  });
});


describe('a arvore como lista', () => {
  /** raiz > [titulo, painel > [nota]] */
  function arvore(): SpecNode {
    const nota = { ...createNode('text'), id: 'nota' };
    const painel = { ...createNode('container'), id: 'painel', children: [nota] };
    const titulo = { ...createNode('text'), id: 'titulo' };
    return { ...createNode('container'), id: 'raiz', children: [titulo, painel] };
  }

  it('achata em ordem de desenho, com profundidade, pai e indice', () => {
    expect(flattenTree(arvore()).map((row) => [row.node.id, row.depth, row.parentId, row.index])).toEqual([
      ['raiz', 0, null, 0],
      ['titulo', 1, 'raiz', 0],
      ['painel', 1, 'raiz', 1],
      ['nota', 2, 'painel', 0],
    ]);
  });

  it('o recuo do fio e o recuo que o rotulo VAI ter', () => {
    // E o que responde "em qual pai isto cai?": soltar dentro do painel desenha
    // o fio onde a `nota` ja esta, e nao onde o `painel` esta.
    expect(indentOf(1)).toBe('1.25rem');
    expect(indentOf(2)).toBe('2rem');
  });
});

describe('indentar e desindentar pelo teclado', () => {
  function rows() {
    const nota = { ...createNode('text'), id: 'nota' };
    const painel = { ...createNode('container'), id: 'painel', children: [nota] };
    const titulo = { ...createNode('text'), id: 'titulo' };
    const folha = { ...createNode('text'), id: 'folha' };
    return flattenTree({ ...createNode('container'), id: 'raiz', children: [titulo, painel, folha] });
  }

  it('indentar entra no irmao de CIMA, quando ele aceita filhos', () => {
    expect(byIndent(rows(), 'folha', 'in')).toEqual({ kind: 'into', parentId: 'painel' });
  });

  it('nao indenta para dentro de uma folha, nem sem irmao acima', () => {
    // `painel` tem o `titulo` acima, que e folha; `titulo` nao tem ninguem.
    expect(byIndent(rows(), 'painel', 'in')).toBeNull();
    expect(byIndent(rows(), 'titulo', 'in')).toBeNull();
  });

  it('desindentar sai para logo depois do pai', () => {
    expect(byIndent(rows(), 'nota', 'out')).toEqual({
      kind: 'between',
      parentId: 'raiz',
      index: 2,
    });
  });

  it('nao desindenta filho da raiz, nem a propria raiz', () => {
    // Acima da raiz nao ha pai, e a raiz nao tem para onde ir.
    expect(byIndent(rows(), 'titulo', 'out')).toBeNull();
    expect(byIndent(rows(), 'raiz', 'out')).toBeNull();
    expect(byIndent(rows(), 'inexistente', 'in')).toBeNull();
  });
});
