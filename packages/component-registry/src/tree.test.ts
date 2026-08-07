import { describe, expect, it } from 'vitest';
import { cloneSubtree, createEmptySpec, createNode } from './factory.js';
import {
  CONTAINER_CANVAS,
  CONTAINER_STACK,
  NODE_DESCRIPTORS,
  NODE_KINDS,
  consumesData,
  defaultPropsFor,
  exposableFields,
  isExposable,
} from './registry.js';
import { assertValidSpec, validateSpec } from './schema.js';
import type { SpecNode } from './spec.js';
import {
  ancestryOf,
  clampRect,
  findNode,
  indexPath,
  insertChild,
  moveNode,
  parentOf,
  positionsChildren,
  removeNode,
  reparentNode,
  selectionAfterRemoval,
  setFieldExposed,
  setNodeName,
  setNodeProps,
  setNodeRect,
  setNodeRects,
  subtreeIds,
  suggestNodeName,
  titleOf,
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

  it('indexPath desce por indice de filho, e a raiz e o caminho vazio', () => {
    expect(indexPath(fixture(), 'nota')).toEqual([1, 0]);
    expect(indexPath(fixture(), 'rodape')).toEqual([2]);
    expect(indexPath(fixture(), 'root')).toEqual([]);
    expect(indexPath(fixture(), 'inexistente')).toBeNull();
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
  it('container novo posiciona, e o filho nasce com caixa', () => {
    // O default do descritor. Empilhado, o filho nao tem caixa e nao tem alca.
    const vazio = createNode('container');
    expect(positionsChildren(vazio)).toBe(true);
    expect(insertChild(vazio, vazio.id, createNode('text'))?.children?.[0]?.rect).toBeDefined();
  });

  it('empilhar para posicionar reparte em FAIXAS, e nao em cascata', () => {
    // A conversao nao pode fazer a tela pular: cada filho recebe a faixa que ja
    // ocupava. A cascata (`droppedRect`) e para no que chega, nao para o que fica.
    const empilhado = setNodeProps(fixture(), 'root', { placement: CONTAINER_STACK })!;
    const livre = setNodeProps(empilhado, 'root', { placement: CONTAINER_CANVAS })!;

    expect((livre.children ?? []).map((child) => child.rect)).toEqual([
      { x: 0, y: 0, w: 100, h: 33.33 },
      { x: 0, y: 33.33, w: 100, h: 33.33 },
      { x: 0, y: 66.67, w: 100, h: 33.33 },
    ]);
  });

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

  it('o lote move varios numa caminhada so', () => {
    const root = fixture();
    const next = setNodeRects(root, [
      { id: 'titulo', rect: { x: 5, y: 5, w: 30, h: 20 } },
      { id: 'rodape', rect: { x: 50, y: 60, w: 40, h: 30 } },
    ]);
    expect(findNode(next!, 'titulo')?.rect).toEqual({ x: 5, y: 5, w: 30, h: 20 });
    expect(findNode(next!, 'rodape')?.rect).toEqual({ x: 50, y: 60, w: 40, h: 30 });
    // O ramo sem ninguem do lote sai INTACTO POR IDENTIDADE — e o que permite
    // ao React pular a re-renderizacao dele durante o arrasto.
    expect(findNode(next!, 'linha')).toBe(findNode(root, 'linha'));
  });

  it('o lote prende cada caixa, como o caminho de um no so', () => {
    const next = setNodeRects(fixture(), [{ id: 'titulo', rect: { x: 90, y: 0, w: 40, h: 0 } }]);
    expect(findNode(next!, 'titulo')?.rect).toEqual({ x: 60, y: 0, w: 40, h: 2 });
  });

  it('o lote e TUDO OU NADA', () => {
    // Aplicar so os que existem devolveria uma arvore boa sem o chamador ter
    // como saber que uma entrada ficou pelo caminho.
    expect(
      setNodeRects(fixture(), [
        { id: 'titulo', rect: { x: 5, y: 5, w: 30, h: 20 } },
        { id: 'inexistente', rect: { x: 0, y: 0, w: 10, h: 10 } },
      ]),
    ).toBeNull();
    expect(setNodeRects(fixture(), [])).toBeNull();
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
    expect(selectionAfterRemoval(fixture(), ['titulo'])).toBe('linha');
    expect(selectionAfterRemoval(fixture(), ['rodape'])).toBe('linha');
    expect(selectionAfterRemoval(fixture(), ['nota'])).toBe('linha');
  });

  it('o vizinho escolhido tem de SOBREVIVER a remocao', () => {
    // Apagando titulo e linha, o seguinte ao titulo e justamente a linha, que
    // tambem esta indo embora: apontar para ela deixaria a selecao orfa. E cair
    // direto no pai pularia por cima do rodape, que continua ali.
    expect(selectionAfterRemoval(fixture(), ['titulo', 'linha'])).toBe('rodape');
    expect(selectionAfterRemoval(fixture(), ['linha', 'rodape'])).toBe('titulo');
    // Nenhum sobrevivente: so entao o pai.
    expect(selectionAfterRemoval(fixture(), ['titulo', 'linha', 'rodape'])).toBe('root');
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

  /*
   * ===================== QUEM NASCE PENDENTE, E POR QUE =====================
   * Ate a 4.0.0 um grafico recem-criado reprovava no schema ate o usuario ligar
   * uma coluna. Na 5.0.0 nenhum descritor declarava papel e TODO no nascia
   * valido. A 5.2.0 traz o meio-termo, e ele e desenhado:
   *
   *   - `container` e `text` continuam nascendo validos;
   *   - o `kpi` nasce PENDENTE no papel obrigatorio, e so nele.
   *
   * Nao e regressao. Um KPI exportavel sem medida entregaria um pacote que so
   * sabe mostrar o estado vazio, e e a RF-12 que impede: o campo e apontado no
   * painel e na arvore, e o export fica bloqueado ate a coluna ser ligada. O
   * preview, enquanto isso, desenha o `EmptyState` — que e literalmente o que o
   * Power BI mostraria.
   * ==========================================================================
   */
  it('container e texto nascem validos; o KPI nasce pendente so no papel obrigatorio', () => {
    const spec = createEmptySpec('Nasce valido');

    for (const kind of NODE_KINDS) {
      const root = insertChild(spec.root, spec.root.id, createNode(kind)) ?? spec.root;
      const result = validateSpec({ ...spec, root });

      if (!consumesData(kind)) {
        expect(result.kind, kind).toBe('valid');
        continue;
      }

      expect(result.kind, kind).toBe('invalid');
      const issues = result.kind === 'invalid' ? result.issues : [];
      // UM campo, e nao a arvore inteira: o papel opcional nasce em `''` e nao
      // conta como pendencia. Se ele passasse a contar, o autor teria de ligar
      // uma medida de comparacao que a maioria dos KPIs nunca usa.
      expect(issues.map((issue) => issue.path).join('\n'), kind).toContain('valueRole');
      expect(issues.map((issue) => issue.path).join('\n'), kind).not.toContain('compareRole');
    }
  });

  it('ligar a medida basta para o KPI ficar valido', () => {
    // A outra metade: a pendencia acima tem UMA saida, e ela e a que o painel
    // oferece. Sem este teste, "nasce pendente" poderia ser um no que nunca
    // valida.
    const spec = createEmptySpec('KPI ligado');
    const kpi = createNode('kpi');
    const measure = spec.data.columns.find((column) => column.kind === 'measure');
    kpi.props.valueRole = measure?.name ?? '';

    const root = insertChild(spec.root, spec.root.id, kpi) ?? spec.root;
    expect(validateSpec({ ...spec, root }).kind).toBe('valid');
  });
});

/**
 * O que o autor publica no painel de formatacao do visual gerado (spec 5.1.0).
 *
 * As invariantes moram nas OPERACOES, e nao no editor, pelo mesmo motivo do
 * resto do modulo: sao testaveis sem React, e nao ha caminho pelo qual a
 * interface produza uma lista fora de ordem ou um card sem titulo.
 */
describe('publicacao de campo', () => {
  const texto = (): SpecNode => {
    const node = createNode('text');
    node.props.content = 'Receita total';
    return node;
  };

  it('FECHADO e o padrao: no recem-criado nao publica nada', () => {
    expect(createNode('text').exposed).toBeUndefined();
    expect(createNode('container').exposed).toBeUndefined();
  });

  it('publicar o primeiro campo batiza o no', () => {
    const root = texto();
    const next = setFieldExposed(root, root.id, 'color', true);

    expect(next?.exposed).toEqual(['color']);
    // O titulo do card e a unica coisa pela qual o consumidor identifica o
    // componente: um card chamado "Texto" nasce de um esquecimento que so
    // apareceria dentro do Power BI.
    expect(next?.name).toBe('Receita total');
  });

  it('o apelido ja escolhido nao e sobrescrito pela publicacao seguinte', () => {
    const root = texto();
    const batizado = setNodeName(root, root.id, 'Cabecalho')!;
    const publicado = setFieldExposed(batizado, batizado.id, 'color', true);

    expect(publicado?.name).toBe('Cabecalho');
  });

  it('a lista guarda a ordem do DESCRITOR, nao a dos cliques', () => {
    // Ela vira a ordem dos slices dentro do card. Pela ordem de clique, o mesmo
    // autor geraria dois pacotes diferentes so por desmarcar e remarcar.
    let root: SpecNode = texto();
    for (const key of ['overflow', 'color', 'content']) {
      root = setFieldExposed(root, root.id, key, true) ?? root;
    }

    const ordem = exposableFields('text')
      .map((field) => field.key)
      .filter((key) => root.exposed?.includes(key));
    expect(root.exposed).toEqual(ordem);
  });

  it('despublicar tudo remove a lista, mas preserva o apelido', () => {
    const root = texto();
    const publicado = setFieldExposed(root, root.id, 'color', true)!;
    const fechado = setFieldExposed(publicado, publicado.id, 'color', false);

    // AUSENTE, e nao `[]`: "fechado" precisa ter uma representacao so, senao o
    // teste de "projeto sem publicacao gera o pacote de antes" vale num caminho
    // e falha no outro.
    expect(fechado?.exposed).toBeUndefined();
    // Quem publicar de novo reencontra o nome que escolheu.
    expect(fechado?.name).toBe('Receita total');
  });

  it('campo estrutural e campo inexistente sao REJEITADOS', () => {
    const root = createNode('container');
    // `placement` decide se o codegen embrulha os filhos em CanvasSlot: a
    // escolha ja foi gasta quando o pacote foi gerado.
    expect(setFieldExposed(root, root.id, 'placement', true)).toBeNull();
    expect(setFieldExposed(root, root.id, 'naoExiste', true)).toBeNull();
    expect(isExposable(NODE_DESCRIPTORS.container.fields[0]!)).toBe(false);
  });

  it('o apelido vazio volta ao rotulo do descritor', () => {
    const root = texto();
    const batizado = setNodeName(root, root.id, '  Cabecalho  ')!;
    expect(batizado.name).toBe('Cabecalho');

    const apagado = setNodeName(batizado, batizado.id, '   ')!;
    expect(apagado.name).toBeUndefined();
    expect(titleOf(apagado)).toBe('Texto');
  });

  it('o apelido sugerido vem do conteudo, senao do rotulo', () => {
    expect(suggestNodeName(texto())).toBe('Receita total');
    expect(suggestNodeName(createNode('container'))).toBe('Container');
  });

  it('duplicar um no leva a publicacao junto', () => {
    const root = texto();
    const publicado = setFieldExposed(root, root.id, 'color', true)!;
    const copia = cloneSubtree(publicado);

    expect(copia.exposed).toEqual(publicado.exposed);
    expect(copia.name).toBe(publicado.name);
    // Ids diferentes: sao dois cards separados no painel do Power BI.
    expect(copia.id).not.toBe(publicado.id);
  });

  it('a spec com campo publicado passa no schema; com campo estrutural, nao', () => {
    const spec = createEmptySpec('Publicada');
    const comTexto = insertChild(spec.root, spec.root.id, texto())!;
    const alvo = comTexto.children?.[0];
    const publicado = setFieldExposed(comTexto, alvo?.id ?? '', 'color', true)!;

    expect(validateSpec({ ...spec, root: publicado }).kind).toBe('valid');

    // Uma spec adulterada, que nao passou pelas operacoes de arvore.
    const adulterado = structuredClone(publicado);
    adulterado.exposed = ['placement'];
    expect(validateSpec({ ...spec, root: adulterado }).kind).toBe('invalid');
  });
});
