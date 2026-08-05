import { describe, expect, it } from 'vitest';
import { createEmptySpec, createNode } from './factory.js';
import { NODE_KINDS, defaultPropsFor } from './registry.js';
import { assertValidSpec, validateSpec } from './schema.js';
import type { SpecNode } from './spec.js';
import {
  ancestryOf,
  clampRect,
  findNode,
  insertChild,
  moveNode,
  parentOf,
  removeNode,
  reparentNode,
  selectionAfterRemoval,
  setNodeProps,
  setNodeRect,
  subtreeIds,
} from './tree.js';

/**
 * Arvore de trabalho:
 *
 *   root (container)
 *   ├── titulo (text)
 *   ├── linha (container)
 *   │   └── nota (text)
 *   └── rodape (text)
 *
 * O que esta sob teste aqui e a OPERACAO DE ARVORE — achar, inserir, mover,
 * remover, reparentar. Ela nao olha o tipo do no, so a forma; a arvore precisa
 * de folha e de galho, e nao de variedade. Ate a spec 4.0.0 a fixture usava um
 * KPI e um grafico de barras, e a variedade era so aparencia.
 */
function fixture(): SpecNode {
  const titulo = { ...createNode('text'), id: 'titulo' };
  const nota = { ...createNode('text'), id: 'nota' };
  const linha = { ...createNode('container'), id: 'linha', children: [nota] };
  const rodape = { ...createNode('text'), id: 'rodape' };
  return { ...createNode('container'), id: 'root', children: [titulo, linha, rodape] };
}

const idsOf = (node: SpecNode | null): string[] => (node?.children ?? []).map((child) => child.id);

describe('navegacao', () => {
  it('acha um no em qualquer profundidade', () => {
    expect(findNode(fixture(), 'nota')?.kind).toBe('text');
    expect(findNode(fixture(), 'inexistente')).toBeNull();
  });

  it('devolve a cadeia da raiz ate o no', () => {
    expect(ancestryOf(fixture(), 'nota').map((node) => node.id)).toEqual(['root', 'linha', 'nota']);
    expect(ancestryOf(fixture(), 'inexistente')).toEqual([]);
  });

  it('a raiz nao tem pai', () => {
    expect(parentOf(fixture(), 'root')).toBeNull();
    expect(parentOf(fixture(), 'nota')?.id).toBe('linha');
  });

  it('subtreeIds inclui o proprio no', () => {
    expect(subtreeIds(fixture())).toEqual(new Set(['root', 'titulo', 'linha', 'nota', 'rodape']));
  });
});

describe('insercao', () => {
  it('insere no fim por padrao e na posicao pedida quando informada', () => {
    const root = fixture();
    expect(idsOf(insertChild(root, 'root', { ...createNode('text'), id: 'novo' }))).toEqual([
      'titulo',
      'linha',
      'rodape',
      'novo',
    ]);
    expect(idsOf(insertChild(root, 'root', { ...createNode('text'), id: 'novo' }, 0))).toEqual([
      'novo',
      'titulo',
      'linha',
      'rodape',
    ]);
  });

  it('rejeita filho em folha — so o container aceita', () => {
    expect(insertChild(fixture(), 'titulo', createNode('text'))).toBeNull();
    expect(insertChild(fixture(), 'inexistente', createNode('text'))).toBeNull();
  });

  it('nao muta a arvore de entrada', () => {
    const root = fixture();
    insertChild(root, 'root', createNode('text'));
    expect(idsOf(root)).toEqual(['titulo', 'linha', 'rodape']);
  });
});

describe('remocao', () => {
  it('remove uma folha e um ramo inteiro', () => {
    expect(idsOf(removeNode(fixture(), 'titulo'))).toEqual(['linha', 'rodape']);
    const semLinha = removeNode(fixture(), 'linha');
    expect(findNode(semLinha!, 'nota')).toBeNull();
  });

  it('rejeita remover a raiz — uma arvore sem raiz nao e representavel', () => {
    expect(removeNode(fixture(), 'root')).toBeNull();
  });
});

describe('reordenacao', () => {
  it('sobe e desce entre irmaos', () => {
    expect(idsOf(moveNode(fixture(), 'linha', -1))).toEqual(['linha', 'titulo', 'rodape']);
    expect(idsOf(moveNode(fixture(), 'linha', 1))).toEqual(['titulo', 'rodape', 'linha']);
  });

  it('rejeita nas pontas, para o botao desabilitado nao mentir', () => {
    expect(moveNode(fixture(), 'titulo', -1)).toBeNull();
    expect(moveNode(fixture(), 'rodape', 1)).toBeNull();
    expect(moveNode(fixture(), 'root', -1)).toBeNull();
  });
});

describe('reparent', () => {
  it('move um no para outro container', () => {
    const next = reparentNode(fixture(), 'rodape', 'linha');
    expect(idsOf(next)).toEqual(['titulo', 'linha']);
    expect(idsOf(findNode(next!, 'linha'))).toEqual(['nota', 'rodape']);
  });

  it('rejeita soltar um container dentro de um descendente seu', () => {
    // Sem esta guarda o ramo inteiro se destacaria da arvore — o pedaco do
    // visual sumiria da tela sem erro nenhum.
    expect(reparentNode(fixture(), 'linha', 'nota')).toBeNull();
    expect(reparentNode(fixture(), 'root', 'linha')).toBeNull();
    expect(reparentNode(fixture(), 'linha', 'linha')).toBeNull();
  });

  it('rejeita destino que nao aceita filhos', () => {
    expect(reparentNode(fixture(), 'rodape', 'titulo')).toBeNull();
  });
});

describe('props', () => {
  it('aplica o patch preservando os demais campos', () => {
    const next = setNodeProps(fixture(), 'titulo', { content: 'Ola' });
    // O campo NAO tocado sai do descritor, e nao de um numero escrito aqui: o
    // que esta sob teste e "o patch preserva o resto", nao qual e o tamanho
    // padrao. Escrito a mao, este teste quebraria toda vez que a linguagem
    // visual mudasse um default — e quebrar por isso ensina a ignora-lo.
    expect(findNode(next!, 'titulo')?.props).toMatchObject({
      content: 'Ola',
      fontSize: defaultPropsFor('text').fontSize,
    });
  });

  it('rejeita id inexistente', () => {
    expect(setNodeProps(fixture(), 'inexistente', { content: 'Ola' })).toBeNull();
  });
});

describe('geometria', () => {
  it('prende a caixa dentro do pai em vez de rejeitar o arrasto', () => {
    // Arrastar alem da borda quer dizer "encosta na borda". Rejeitar faria o no
    // saltar de volta para a posicao anterior no meio do gesto.
    const next = setNodeRect(fixture(), 'titulo', { x: 80, y: -10, w: 40, h: 30 });
    expect(findNode(next!, 'titulo')?.rect).toEqual({ x: 60, y: 0, w: 40, h: 30 });
  });

  it('respeita o piso de tamanho', () => {
    expect(clampRect({ x: 0, y: 0, w: 0, h: -3 })).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it('arredonda para duas casas — o numero vai literal para o fonte gerado', () => {
    expect(clampRect({ x: 100 / 3, y: 0, w: 100 / 3, h: 50 })).toEqual({
      x: 33.33,
      y: 0,
      w: 33.33,
      h: 50,
    });
  });

  it('preserva props e filhos, e rejeita id inexistente', () => {
    const next = setNodeRect(fixture(), 'linha', { x: 0, y: 0, w: 50, h: 50 });
    expect(findNode(next!, 'linha')?.props).toMatchObject({ direction: 'column' });
    expect(idsOf(findNode(next!, 'linha'))).toEqual(['nota']);
    expect(setNodeRect(fixture(), 'inexistente', { x: 0, y: 0, w: 10, h: 10 })).toBeNull();
  });

  it('as demais operacoes de arvore carregam o rect junto', () => {
    // Reordenar ou mudar de pai nao pode limpar a geometria: o no reapareceria
    // no canto superior esquerdo, e nada indicaria por que.
    const comRect = setNodeRect(fixture(), 'rodape', { x: 10, y: 20, w: 30, h: 40 });
    const reordenado = moveNode(comRect!, 'rodape', -1);
    expect(findNode(reordenado!, 'rodape')?.rect).toEqual({ x: 10, y: 20, w: 30, h: 40 });

    const movido = reparentNode(comRect!, 'rodape', 'linha');
    expect(findNode(movido!, 'rodape')?.rect).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
});

describe('selecao apos remocao', () => {
  it('cai no irmao seguinte, senao no anterior, senao no pai', () => {
    expect(selectionAfterRemoval(fixture(), 'titulo')).toBe('linha');
    expect(selectionAfterRemoval(fixture(), 'rodape')).toBe('linha');
    expect(selectionAfterRemoval(fixture(), 'nota')).toBe('linha');
  });
});

describe('as operacoes preservam a validade da spec', () => {
  it('inserir, mover e remover produzem arvore que passa no schema', () => {
    const spec = createEmptySpec('Composicao valida');
    const rootId = spec.root.id;

    const comTexto = insertChild(spec.root, rootId, createNode('text'));
    const comSegundo = insertChild(comTexto!, rootId, createNode('container'));
    const reordenado = moveNode(comSegundo!, comSegundo?.children?.[1]?.id ?? '', -1);

    expect(assertValidSpec({ ...spec, root: reordenado }).root.children).toHaveLength(2);
  });

  /**
   * Ate a spec 4.0.0 havia aqui um teste chamado "um grafico sem papel ligado e
   * invalido de proposito": `createNode` nao preenchia campo de papel, entao um
   * grafico recem-criado reprovava no schema e o export ficava bloqueado ate o
   * usuario ligar uma coluna.
   *
   * Na 5.0.0 nenhum descritor declara campo de papel e TODO no nasce valido. O
   * teste abaixo afirma exatamente isso, para que a mudanca fique registrada
   * como decisao e nao como teste que sumiu.
   */
  it('todo no nasce VALIDO — nao ha mais campo pendente', () => {
    const spec = createEmptySpec('Nasce valido');
    let root = spec.root;
    for (const kind of NODE_KINDS) {
      root = insertChild(root, spec.root.id, createNode(kind)) ?? root;
    }

    expect(validateSpec({ ...spec, root }).kind).toBe('valid');
  });
});
