import { describe, expect, it } from 'vitest';
import { createEmptySpec, createNode } from './factory.js';
import { assertValidSpec, validateSpec } from './schema.js';
import type { SpecNode } from './spec.js';
import {
  ancestryOf,
  findNode,
  insertChild,
  moveNode,
  parentOf,
  removeNode,
  reparentNode,
  selectionAfterRemoval,
  setNodeProps,
  subtreeIds,
} from './tree.js';

/**
 * Arvore de trabalho:
 *
 *   root (container)
 *   ├── titulo (text)
 *   ├── linha (container)
 *   │   └── kpi
 *   └── barras (barChart)
 */
function fixture(): SpecNode {
  const titulo = { ...createNode('text'), id: 'titulo' };
  const kpi = { ...createNode('kpi', { measureRole: 'valor' }), id: 'kpi' };
  const linha = { ...createNode('container'), id: 'linha', children: [kpi] };
  const barras = {
    ...createNode('barChart', { categoryRole: 'categoria', measureRole: 'valor' }),
    id: 'barras',
  };
  return { ...createNode('container'), id: 'root', children: [titulo, linha, barras] };
}

const idsOf = (node: SpecNode | null): string[] => (node?.children ?? []).map((child) => child.id);

describe('navegacao', () => {
  it('acha um no em qualquer profundidade', () => {
    expect(findNode(fixture(), 'kpi')?.kind).toBe('kpi');
    expect(findNode(fixture(), 'inexistente')).toBeNull();
  });

  it('devolve a cadeia da raiz ate o no', () => {
    expect(ancestryOf(fixture(), 'kpi').map((node) => node.id)).toEqual(['root', 'linha', 'kpi']);
    expect(ancestryOf(fixture(), 'inexistente')).toEqual([]);
  });

  it('a raiz nao tem pai', () => {
    expect(parentOf(fixture(), 'root')).toBeNull();
    expect(parentOf(fixture(), 'kpi')?.id).toBe('linha');
  });

  it('subtreeIds inclui o proprio no', () => {
    expect(subtreeIds(fixture())).toEqual(new Set(['root', 'titulo', 'linha', 'kpi', 'barras']));
  });
});

describe('insercao', () => {
  it('insere no fim por padrao e na posicao pedida quando informada', () => {
    const root = fixture();
    expect(idsOf(insertChild(root, 'root', { ...createNode('text'), id: 'novo' }))).toEqual([
      'titulo',
      'linha',
      'barras',
      'novo',
    ]);
    expect(idsOf(insertChild(root, 'root', { ...createNode('text'), id: 'novo' }, 0))).toEqual([
      'novo',
      'titulo',
      'linha',
      'barras',
    ]);
  });

  it('rejeita filho em folha — so o container aceita', () => {
    expect(insertChild(fixture(), 'titulo', createNode('text'))).toBeNull();
    expect(insertChild(fixture(), 'inexistente', createNode('text'))).toBeNull();
  });

  it('nao muta a arvore de entrada', () => {
    const root = fixture();
    insertChild(root, 'root', createNode('text'));
    expect(idsOf(root)).toEqual(['titulo', 'linha', 'barras']);
  });
});

describe('remocao', () => {
  it('remove uma folha e um ramo inteiro', () => {
    expect(idsOf(removeNode(fixture(), 'titulo'))).toEqual(['linha', 'barras']);
    const semLinha = removeNode(fixture(), 'linha');
    expect(findNode(semLinha!, 'kpi')).toBeNull();
  });

  it('rejeita remover a raiz — uma arvore sem raiz nao e representavel', () => {
    expect(removeNode(fixture(), 'root')).toBeNull();
  });
});

describe('reordenacao', () => {
  it('sobe e desce entre irmaos', () => {
    expect(idsOf(moveNode(fixture(), 'linha', -1))).toEqual(['linha', 'titulo', 'barras']);
    expect(idsOf(moveNode(fixture(), 'linha', 1))).toEqual(['titulo', 'barras', 'linha']);
  });

  it('rejeita nas pontas, para o botao desabilitado nao mentir', () => {
    expect(moveNode(fixture(), 'titulo', -1)).toBeNull();
    expect(moveNode(fixture(), 'barras', 1)).toBeNull();
    expect(moveNode(fixture(), 'root', -1)).toBeNull();
  });
});

describe('reparent', () => {
  it('move um no para outro container', () => {
    const next = reparentNode(fixture(), 'barras', 'linha');
    expect(idsOf(next)).toEqual(['titulo', 'linha']);
    expect(idsOf(findNode(next!, 'linha'))).toEqual(['kpi', 'barras']);
  });

  it('rejeita soltar um container dentro de um descendente seu', () => {
    // Sem esta guarda o ramo inteiro se destacaria da arvore — o pedaco do
    // visual sumiria da tela sem erro nenhum.
    expect(reparentNode(fixture(), 'linha', 'kpi')).toBeNull();
    expect(reparentNode(fixture(), 'root', 'linha')).toBeNull();
    expect(reparentNode(fixture(), 'linha', 'linha')).toBeNull();
  });

  it('rejeita destino que nao aceita filhos', () => {
    expect(reparentNode(fixture(), 'barras', 'titulo')).toBeNull();
  });
});

describe('props', () => {
  it('aplica o patch preservando os demais campos', () => {
    const next = setNodeProps(fixture(), 'titulo', { content: 'Ola' });
    expect(findNode(next!, 'titulo')?.props).toMatchObject({
      content: 'Ola',
      fontSize: 'lg',
    });
  });

  it('rejeita id inexistente', () => {
    expect(setNodeProps(fixture(), 'inexistente', { content: 'Ola' })).toBeNull();
  });
});

describe('selecao apos remocao', () => {
  it('cai no irmao seguinte, senao no anterior, senao no pai', () => {
    expect(selectionAfterRemoval(fixture(), 'titulo')).toBe('linha');
    expect(selectionAfterRemoval(fixture(), 'barras')).toBe('linha');
    expect(selectionAfterRemoval(fixture(), 'kpi')).toBe('linha');
  });
});

describe('as operacoes preservam a validade da spec', () => {
  it('inserir, mover e remover produzem arvore que passa no schema', () => {
    const spec = createEmptySpec('Composicao valida');
    const rootId = spec.root.id;

    const comTexto = insertChild(spec.root, rootId, createNode('text'));
    const comBarras = insertChild(
      comTexto!,
      rootId,
      createNode('barChart', { categoryRole: 'categoria', measureRole: 'valor' }),
    );
    const reordenado = moveNode(comBarras!, comBarras?.children?.[1]?.id ?? '', -1);

    expect(assertValidSpec({ ...spec, root: reordenado }).root.children).toHaveLength(2);
  });

  it('um grafico sem papel ligado e invalido de proposito', () => {
    const spec = createEmptySpec('Papel pendente');
    // `createNode` NAO preenche campo de papel: o usuario escolhe. Ate escolher,
    // a spec nao passa — e o export fica bloqueado em vez de gerar um visual que
    // pede uma coluna que ninguem ligou.
    const root = insertChild(spec.root, spec.root.id, createNode('barChart'));
    const result = validateSpec({ ...spec, root });

    expect(result.kind).toBe('invalid');
  });
});
