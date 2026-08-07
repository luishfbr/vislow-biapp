import {
  ARTBOARD_DEFAULT,
  ARTBOARD_MAX,
  ARTBOARD_MIN,
  artboardOf,
  defaultPropsFor,
  findNode,
  NODE_KINDS,
  validateSpec,
  type SpecNode,
} from '@vislow/component-registry';
import { beforeEach, describe, expect, it } from 'vitest';
import { selectCanExport, selectSelectedId, useEditorStore } from './useEditorStore';

/**
 * Comportamento do editor de composicao.
 *
 * O que estes testes protegem nao e a interface e sim a INVARIANTE: toda
 * sequencia de acoes que a interface permite tem de produzir uma spec que a API
 * aceitaria — ou deixa-la explicitamente pendente, com o export bloqueado. E a
 * RN-03 do lado do editor.
 */

const store = () => useEditorStore.getState();

/** Ids na ordem em que aparecem, do container raiz para baixo. */
function kindsOf(node: SpecNode): string[] {
  return [node.kind, ...(node.children ?? []).flatMap(kindsOf)];
}

/** O primeiro no do tipo pedido, em profundidade. */
function findByKind(node: SpecNode, kind: string): SpecNode | undefined {
  if (node.kind === kind) return node;
  for (const child of node.children ?? []) {
    const found = findByKind(child, kind);
    if (found) return found;
  }
  return undefined;
}

/**
 * O no selecionado, exigindo que haja um.
 *
 * Lanca em vez de devolver `null` porque quem chama esta afirmando que a acao
 * anterior selecionou algo — e "a selecao ficou vazia" tem de reprovar o teste
 * com essa frase, nao virar `undefined` num `toMatchObject` que passa.
 */
function selectedId(): string | null {
  return selectSelectedId(store());
}

function selected(): SpecNode {
  const id = selectedId();
  if (id === null) throw new Error('esperava uma selecao, e nao ha nenhuma');
  const node = findNode(store().spec.root, id);
  if (!node) throw new Error(`selecao orfa: ${id}`);
  return node;
}

beforeEach(() => {
  store().newProject('Projeto de teste');
});

describe('projeto novo', () => {
  it('nasce valido e exportavel — tela em branco de verdade', () => {
    expect(store().issues).toEqual([]);
    expect(selectCanExport(useEditorStore.getState())).toBe(true);
  });

  it('abre SEM selecao, com o painel falando do projeto', () => {
    // Nao e detalhe: com a raiz selecionada nao havia como distinguir "a raiz
    // esta selecionada" de "nada esta", e o clique no vazio nao tinha para onde
    // levar a selecao.
    expect(selectedId()).toBeNull();
  });

  it('nome curto demais bloqueia o export sem invalidar a arvore', () => {
    store().rename('ab');
    expect(selectCanExport(useEditorStore.getState())).toBe(false);
  });
});

describe('adicionar componentes', () => {
  it('entra DENTRO do container selecionado', () => {
    store().addNode('text');
    expect(kindsOf(store().spec.root)).toEqual(['container', 'text']);
  });

  it('entra como IRMAO quando a selecao e uma folha', () => {
    store().addNode('text');
    // A selecao agora e o texto, que nao aceita filhos.
    store().addNode('text');
    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'text']);
  });

  it('entra logo DEPOIS do irmao selecionado, nao no fim', () => {
    store().addNode('text');
    const primeiro = selectedId();
    store().addNode('text');
    store().select(primeiro);
    store().addNode('text');

    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'text', 'text']);
  });

  it('aninha dentro de um container filho', () => {
    store().addNode('container');
    store().addNode('text');
    expect(kindsOf(store().spec.root)).toEqual(['container', 'container', 'text']);
  });

  /*
   * ========== AS LIGACOES AUTOMATICAS DE PAPEL VOLTARAM NA 5.2.0 =============
   * `suggestRoleBindings` foi apagada na 5.0.0 porque, sem campo de papel no
   * catalogo, nao tinha o que sugerir. O KPI Card devolveu o sujeito a ela.
   *
   * A tese continua a mesma: ligar no palpite obvio e reversivel em um clique, e
   * uma tela vazia so parece defeito.
   * =========================================================================
   */

  it('liga os papeis automaticamente e a spec continua valida', () => {
    // Um projeto novo tem uma coluna de medida (`receita`), entao o KPI nasce
    // ligado a ela e desenhando um numero — nao no estado vazio.
    for (const kind of NODE_KINDS) store().addNode(kind);

    expect(store().issues).toEqual([]);
    expect(selectCanExport(useEditorStore.getState())).toBe(true);

    const kpi = findByKind(store().spec.root, 'kpi');
    expect(kpi?.props.valueRole).toBe('receita');
  });

  it('a comparacao NAO rouba a coluna do valor', () => {
    // Com uma medida so, o papel opcional fica em branco. Ligar as duas na mesma
    // coluna faria o card nascer comparando um numero com ele mesmo — variacao
    // zero, o unico resultado que nao ensina nada sobre o componente.
    store().addNode('kpi');
    const kpi = findByKind(store().spec.root, 'kpi');
    expect(kpi?.props.compareRole).toBe('');
  });

  it('sem coluna do tipo certo, o campo fica pendente e o export trava', () => {
    // A outra metade, e a que importa mais: o palpite e um atalho, nao uma
    // garantia. Sem medida nenhuma na tabela nao ha o que sugerir, e a pendencia
    // e a informacao correta — bloquear o export aqui e a RF-12 funcionando.
    for (const column of [...store().spec.data.columns]) {
      if (column.kind === 'measure') store().removeColumn(column.name);
    }
    store().addNode('kpi');

    expect(store().issues.length).toBeGreaterThan(0);
    expect(selectCanExport(useEditorStore.getState())).toBe(false);
  });
});

describe('reordenar e remover', () => {
  it('sobe e desce entre irmaos', () => {
    store().addNode('text');
    store().addNode('text');
    store().moveSelected(-1);
    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'text']);
  });

  it('a raiz nao pode ser removida', () => {
    store().select(store().spec.root.id);
    store().removeSelected();
    expect(store().spec.root).toBeDefined();
    expect(kindsOf(store().spec.root)).toEqual(['container']);
  });

  it('sem selecao, apagar nao apaga nada', () => {
    store().addNode('text');
    store().select(null);
    store().removeSelected();

    expect(kindsOf(store().spec.root)).toEqual(['container', 'text']);
  });

  it('remover leva a selecao para um vizinho, nunca para o vazio', () => {
    store().addNode('text');
    store().addNode('text');
    store().removeSelected();

    expect(selected()).toBeDefined();
  });
});

describe('selecao multipla', () => {
  /** Tres irmaos na raiz, devolvidos na ordem de desenho. */
  function tres(): string[] {
    store().addNode('text');
    store().addNode('text');
    store().addNode('text');
    return (store().spec.root.children ?? []).map((child) => child.id);
  }

  it('a lista vazia e SEMPRE o mesmo array', () => {
    // O zustand v5 compara por `Object.is`: um `[]` literal a cada limpeza faria
    // todo assinante re-renderizar sem ter nada novo para desenhar, e um
    // `useEffect` que dependesse dele entraria em laco.
    tres();
    const primeira = (store().select(null), store().selectedIds);
    const segunda = (store().select(null), store().selectedIds);
    expect(primeira).toBe(segunda);
    expect(primeira).toEqual([]);
  });

  it('alternar poe e tira', () => {
    const [a, b] = tres();
    store().select(a!);
    store().toggleSelected(b!);
    expect(store().selectedIds).toEqual([a, b]);

    store().toggleSelected(a!);
    expect(store().selectedIds).toEqual([b]);
    store().toggleSelected(b!);
    expect(store().selectedIds).toEqual([]);
  });

  it('a lista sai em ORDEM DE ARVORE, e nao na ordem dos cliques', () => {
    // E a ordem que o painel lista, que a arvore destaca e que `duplicateNode`
    // usa para inserir. A ordem de clique produziria uma lista diferente da que
    // esta na tela.
    const [a, b, c] = tres();
    store().setSelection([c!, a!, b!]);
    expect(store().selectedIds).toEqual([a, b, c]);
  });

  it('no de OUTRO PAI substitui em vez de somar', () => {
    // Somar quebraria a invariante: os dois `rect` sao percentuais de pais
    // diferentes, e arrastar os dois pelo mesmo delta os separaria na tela.
    store().addNode('container');
    const caixa = selected().id;
    store().addNode('text');
    const dentro = selected().id;

    store().select(caixa);
    store().toggleSelected(dentro);
    expect(store().selectedIds).toEqual([dentro]);
  });

  it('um no sozinho escapa da irmandade — a arvore seleciona em qualquer nivel', () => {
    store().addNode('container');
    store().addNode('text');
    const fundo = selected().id;

    store().select(fundo);
    expect(store().selectedIds).toEqual([fundo]);
  });

  it('ids inexistentes sao filtrados', () => {
    const [a] = tres();
    store().setSelection([a!, 'nao-existe']);
    expect(store().selectedIds).toEqual([a]);
    store().setSelection(['nao-existe']);
    expect(store().selectedIds).toEqual([]);
  });

  it('selecionar tudo pega os irmaos do NIVEL ENTRADO', () => {
    // "Tudo" so tem um significado representavel: a arvore inteira juntaria nos
    // de pais diferentes, que a invariante proibe.
    const ids = tres();
    store().addNode('container');
    const caixa = selected().id;
    // So um container que POSICIONA tem nivel para entrar — um recem-criado
    // nasce empilhando.
    store().setProp(caixa, 'placement', 'canvas');
    store().addNode('text');

    store().enterContainer(caixa);
    store().selectSiblings();
    expect(store().selectedIds).toHaveLength(1);

    store().exitContainer();
    store().selectSiblings();
    expect(store().selectedIds).toEqual([...ids, caixa]);
  });

  it('o seletor de UM so responde com um selecionado', () => {
    // Com varios, escolher um deles como "o principal" faria o painel de
    // propriedades editar em silencio um dos tres.
    const [a, b] = tres();
    store().select(a!);
    expect(selectedId()).toBe(a);
    store().toggleSelected(b!);
    expect(selectedId()).toBeNull();
  });
});

describe('acoes sobre varios', () => {
  function tres(): string[] {
    store().addNode('text');
    store().addNode('text');
    store().addNode('text');
    return (store().spec.root.children ?? []).map((child) => child.id);
  }

  it('apagar leva todos, e a selecao cai em quem SOBROU', () => {
    // `selectionAfterRemoval` responde pelo caso de um no so; com varios, o
    // irmao que ele aponta pode ter ido junto.
    const [a, b, c] = tres();
    store().setSelection([a!, b!]);
    store().removeSelected();

    expect(kindsOf(store().spec.root)).toEqual(['container', 'text']);
    expect(store().selectedIds).toEqual([c]);
  });

  it('duplicar N e UM passo, e cada copia entra depois do seu original', () => {
    const [a, b] = tres();
    store().setSelection([a!, b!]);
    const antes = store().past.length;

    const copias = store().duplicateNode();

    expect(copias).toHaveLength(2);
    expect(store().past.length).toBe(antes + 1);
    // a, copia-de-a, b, copia-de-b, c
    const ordem = (store().spec.root.children ?? []).map((child) => child.id);
    expect(ordem).toEqual([a, copias[0], b, copias[1], ordem[4]]);
    expect(store().selectedIds).toEqual(copias);
    expect(validateSpec(store().spec).kind).toBe('valid');
  });

  it('reordenar move o bloco junto, e recusa inteiro na ponta', () => {
    const [a, b, c] = tres();
    store().setSelection([b!, c!]);
    store().moveSelected(-1);
    expect((store().spec.root.children ?? []).map((child) => child.id)).toEqual([b, c, a]);

    // Ja no topo: tudo ou nada. Mover so o que da deixaria o bloco desmontado.
    store().moveSelected(-1);
    expect((store().spec.root.children ?? []).map((child) => child.id)).toEqual([b, c, a]);
  });

  it('mover N caixas e UM passo de desfazer', () => {
    const [a, b] = tres();
    store().setSelection([a!, b!]);
    const antes = store().past.length;

    store().beginGesture();
    for (let step = 1; step <= 20; step += 1) {
      store().setRects([
        { id: a!, rect: { x: step, y: 0, w: 20, h: 20 } },
        { id: b!, rect: { x: step + 30, y: 0, w: 20, h: 20 } },
      ]);
    }
    store().endGesture();

    expect(store().past.length).toBe(antes + 1);
    store().undo();
    expect(findNode(store().spec.root, a!)?.rect?.x).not.toBe(20);
  });

  it('desfazer larga os ids que deixaram de existir', () => {
    const [a, b] = tres();
    store().setSelection([a!, b!]);
    store().duplicateNode();
    expect(store().selectedIds).toHaveLength(2);

    store().undo();
    // As copias sumiram da arvore; a selecao nao pode continuar apontando para
    // elas, ou o painel passa a editar um fantasma.
    for (const id of store().selectedIds) {
      expect(findNode(store().spec.root, id)).not.toBeNull();
    }
  });
});

describe('duplicar', () => {
  it('a copia entra logo depois do original e passa a ser a selecao', () => {
    store().addNode('text');
    store().addNode('text');

    const [copia] = store().duplicateNode();

    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'text', 'text']);
    expect(selectedId()).toBe(copia);
  });

  it('a copia tem id PROPRIO, em toda a descendencia', () => {
    // Id repetido nao e reprovado pelo padrao de id, mas `findNode` para no
    // primeiro que casa — editar a copia acertaria o original, em silencio.
    store().addNode('container');
    store().addNode('text');
    store().select(store().spec.root.children?.[0]?.id ?? null);

    store().duplicateNode();

    const ids: string[] = [];
    const walk = (node: SpecNode): void => {
      ids.push(node.id);
      for (const child of node.children ?? []) walk(child);
    };
    walk(store().spec.root);

    expect(new Set(ids).size).toBe(ids.length);
    expect(validateSpec(store().spec).kind).toBe('valid');
  });

  it('a raiz nao duplica', () => {
    store().select(store().spec.root.id);
    expect(store().duplicateNode()).toEqual([]);
    expect(kindsOf(store().spec.root)).toEqual(['container']);
  });
});

describe('tabela de exemplo', () => {
  it('nome tecnico e derivado do rotulo e nao colide', () => {
    store().addColumn('Meta', 'decimal');
    store().addColumn('Meta', 'decimal');
    const nomes = store().spec.data.columns.map((column) => column.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('editar o rotulo NAO muda o nome tecnico', () => {
    // O nome amarra as referencias da arvore e vai para o capabilities.json.
    // Se ele mudasse junto, cada renomeio quebraria todo no que o usa.
    store().addNode('text');
    store().setColumnLabel('receita', 'Receita liquida');

    const column = store().spec.data.columns.find((c) => c.name === 'receita');
    expect(column?.displayName).toBe('Receita liquida');
    expect(store().issues).toEqual([]);
  });

  it('remover uma coluna deixa a spec valida — ninguem a consumia', () => {
    // Ate a spec 4.0.0 este teste se chamava "remover uma coluna DESLIGA os nos
    // que a usavam" e provava o `unbindRole`: o prop do no era APAGADO, e o no
    // voltava ao estado pendente com o export travado, em vez de guardar o nome
    // de uma coluna que nao existe mais. Nenhum no consome coluna na 5.0.0. O
    // `unbindRole` continua em `table.ts` e volta a morder na Fase 4.
    store().addNode('text');
    store().removeColumn('receita');

    expect(store().issues).toEqual([]);
    expect(selectCanExport(useEditorStore.getState())).toBe(true);
  });

  it('linha e celula chegam ao preview pelo store', () => {
    store().addRow();
    store().setCell(store().spec.data.rows.length - 1, 0, 'Centro');

    const linha = store().spec.data.rows.at(-1);
    expect(linha?.[0]).toBe('Centro');
    expect(store().issues).toEqual([]);
  });

  it('trocar o tipo re-deriva o papel e converte os valores', () => {
    store().setColumnType('receita', 'text');

    const column = store().spec.data.columns.find((c) => c.name === 'receita');
    expect(column?.kind).toBe('grouping');
    expect(store().spec.data.rows[0]?.[1]).toBe('184.320');
  });

  it('operacao ilegal nao mexe em nada — a ultima coluna nao sai', () => {
    store().removeColumn('receita');
    const antes = store().spec;
    store().removeColumn('regiao');
    expect(store().spec).toBe(antes);
  });
});

describe('prancheta do editor', () => {
  it('projeto novo comeca no tamanho padrao', () => {
    expect(artboardOf(store().spec)).toEqual(ARTBOARD_DEFAULT);
  });

  it('muda de tamanho sem invalidar a spec', () => {
    store().setArtboard({ width: 1920, height: 1080 });
    expect(artboardOf(store().spec)).toEqual({ width: 1920, height: 1080 });
    expect(store().issues).toEqual([]);
  });

  it('prende na faixa em vez de recusar — o campo aceita qualquer digitacao', () => {
    store().setArtboard({ width: 99999, height: 1 });
    expect(artboardOf(store().spec)).toEqual({
      width: ARTBOARD_MAX.width,
      height: ARTBOARD_MIN.height,
    });
    // O que sai do store tem de ser aceitavel pela API: e a mesma RN-03 dos
    // outros caminhos de escrita.
    expect(validateSpec(store().spec).kind).toBe('valid');
  });

  it('nao toca na arvore nem na selecao', () => {
    store().addNode('text');
    const before = store().spec.root;
    const selected = selectedId();

    store().setArtboard({ width: 800, height: 600 });

    expect(store().spec.root).toBe(before);
    expect(selectedId()).toBe(selected);
  });
});

describe('identidade do projeto (RF-10)', () => {
  it('exportar sobe a versao e PRESERVA o id', () => {
    const { id, packageVersion } = store().spec.project;
    store().markExported();

    expect(store().spec.project.id).toBe(id);
    expect(store().spec.project.packageVersion).not.toBe(packageVersion);
  });

  it('projeto novo ganha identidade nova (RN-01)', () => {
    const anterior = store().spec.project.id;
    store().newProject('Outro visual');
    expect(store().spec.project.id).not.toBe(anterior);
  });
});

describe('importar projeto', () => {
  it('recusa uma spec invalida sem substituir a atual', () => {
    const atual = store().spec;
    const result = store().importSpec({ schemaVersion: '2.0.0' });

    expect(result.ok).toBe(false);
    expect(store().spec).toBe(atual);
  });

  it('aceita uma spec valida e abre sem selecao', () => {
    // Herdar a selecao da spec anterior apontaria para um no que ja nao existe;
    // cair na raiz esconderia que o projeto acabou de ser trocado inteiro.
    store().addNode('text');
    const exportada = structuredClone(store().spec);

    store().newProject('Vazio');
    expect(store().importSpec(exportada)).toEqual({ ok: true });
    expect(selectedId()).toBeNull();
  });
});

describe('o roteiro do teste manual produz uma spec compilavel', () => {
  it('container aninhado com textos passa na mesma validacao que a API aplica', () => {
    store().rename('Painel de vendas');
    store().addNode('text');
    store().addNode('container');
    store().addNode('text');
    store().select(store().spec.root.id);
    store().addNode('text');

    expect(kindsOf(store().spec.root)).toEqual([
      'container',
      'text',
      'container',
      'text',
      'text',
    ]);

    // A MESMA funcao que o `BuildsController` chama antes de enfileirar.
    expect(validateSpec(store().spec).kind).toBe('valid');
    expect(selectCanExport(useEditorStore.getState())).toBe(true);
  });
});

describe('desfazer e refazer', () => {
  it('volta a edicao anterior e refaz de novo', () => {
    store().addNode('text');
    expect(kindsOf(store().spec.root)).toEqual(['container', 'text']);

    store().undo();
    expect(kindsOf(store().spec.root)).toEqual(['container']);

    store().redo();
    expect(kindsOf(store().spec.root)).toEqual(['container', 'text']);
  });

  it('sem historico, desfazer nao faz nada', () => {
    const antes = store().spec;
    store().undo();
    expect(store().spec).toBe(antes);
  });

  it('UM ARRASTO E UM PASSO, nao duzentos', () => {
    // Cada `pointermove` chama `setRect`. Sem o gesto delimitado, `Ctrl+Z`
    // andaria um pixel de cada vez e desfazer um arrasto exigiria centenas de
    // toques — que e o mesmo que nao ter desfazer.
    store().addNode('text');
    const id = selectedId() ?? '';
    const original = findNode(store().spec.root, id)?.rect;

    store().beginGesture();
    for (let x = 10; x <= 60; x += 1) store().setRect(id, { x, y: 10, w: 20, h: 20 });
    store().endGesture();

    expect(findNode(store().spec.root, id)?.rect?.x).toBe(60);
    store().undo();
    expect(findNode(store().spec.root, id)?.rect).toEqual(original);
  });

  it('durante o gesto NAO revalida nem empilha', () => {
    // Era o custo que cada evento de ponteiro pagava: `validateSpec` da spec
    // inteira mais um `saveProjectDebounced`, centenas de vezes por arrasto.
    store().addNode('text');
    const id = selectedId() ?? '';
    const passos = store().past.length;

    store().beginGesture();
    store().setRect(id, { x: 30, y: 30, w: 20, h: 20 });
    store().setRect(id, { x: 40, y: 30, w: 20, h: 20 });
    expect(store().past.length).toBe(passos);

    store().endGesture();
    expect(store().past.length).toBe(passos + 1);
  });

  it('gesto que nao mudou nada nao gasta um passo', () => {
    // Um clique que so seleciona abre e fecha um gesto. Empilhar ali faria
    // `Ctrl+Z` nao fazer nada visivel, e o usuario apertaria de novo achando
    // que o atalho falhou — e ai perderia a edicao de verdade.
    store().addNode('text');
    const passos = store().past.length;

    store().beginGesture();
    store().endGesture();

    expect(store().past.length).toBe(passos);
  });

  it('editar depois de desfazer abandona o ramo refeito', () => {
    store().addNode('text');
    store().addNode('text');
    store().undo();
    expect(store().future.length).toBe(1);

    store().addNode('text');
    expect(store().future).toEqual([]);
    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'text']);
  });

  it('desfazer a criacao de um no limpa a selecao que apontava para ele', () => {
    // Sem isto o painel de propriedades continuaria editando um no que ja nao
    // esta na arvore — e a edicao iria para lugar nenhum, sem erro.
    store().addNode('text');
    const criado = selectedId();
    expect(criado).not.toBeNull();

    store().undo();
    expect(selectedId()).toBeNull();
  });

  it('a spec depois de desfazer continua valida', () => {
    store().addNode('text');
    store().setProp(selectedId() ?? '', 'strokeWidth', 4);
    store().undo();
    store().undo();

    expect(validateSpec(store().spec).kind).toBe('valid');
  });

  it('projeto novo zera o historico', () => {
    // Desfazer nao pode ressuscitar o projeto anterior: ele tem outra
    // identidade (RN-01) e nao e mais o que esta aberto.
    store().addNode('text');
    store().newProject('Outro');

    expect(store().past).toEqual([]);
    store().undo();
    expect(kindsOf(store().spec.root)).toEqual(['container']);
  });
});

describe('criar pela paleta', () => {
  it('o componente nasce NA CAIXA que o gesto desenhou', () => {
    // Pelo dialogo o no cai numa caixa automatica em cascata, nunca onde a
    // pessoa esta olhando — e cada componente custava um arrasto de correcao
    // logo depois de criado.
    store().addNodeAt('text', { x: 25, y: 40, w: 30, h: 20 });

    expect(selected().kind).toBe('text');
    expect(selected().rect).toEqual({ x: 25, y: 40, w: 30, h: 20 });
  });

  it('caixa que transborda o pai e presa, nao recusada', () => {
    // Desenhar puxando para fora da prancheta e um gesto comum. Recusar
    // deixaria o arrasto sem resultado nenhum, sem dizer por que.
    store().addNodeAt('text', { x: 80, y: 80, w: 50, h: 50 });

    const rect = selected().rect;
    expect((rect?.x ?? 0) + (rect?.w ?? 0)).toBeLessThanOrEqual(100);
    expect((rect?.y ?? 0) + (rect?.h ?? 0)).toBeLessThanOrEqual(100);
    expect(validateSpec(store().spec).kind).toBe('valid');
  });

  it('nasce com os defaults do descritor, como qualquer outro caminho de criacao', () => {
    // Ate a spec 4.0.0 este teste conferia que desenhar um retangulo LIGAVA os
    // papeis, como o `addNode` fazia — os dois caminhos de criacao tinham de
    // concordar. Sem campo de papel no catalogo, o que os dois precisam ter em
    // comum e o conjunto de defaults, e e isso que se confere agora.
    store().addNodeAt('text', { x: 0, y: 0, w: 50, h: 50 });
    expect(store().issues).toEqual([]);
    expect(selected().props).toEqual(defaultPropsFor('text'));
  });

  it('numa raiz que EMPILHA, o no entra sem caixa', () => {
    // Ali quem decide o tamanho e a cadeia de flex. Gravar um `rect` produziria
    // uma geometria que nao desenha nada — e o `validateSpec` reprova filho de
    // container empilhado com caixa.
    store().setProp(store().spec.root.id, 'placement', 'stack');
    store().addNodeAt('text', { x: 25, y: 40, w: 30, h: 20 });

    expect(selected().kind).toBe('text');
    expect(selected().rect).toBeUndefined();
    expect(validateSpec(store().spec).kind).toBe('valid');
  });

  it('armar e desarmar a paleta', () => {
    store().armPalette('text');
    expect(store().paletteKind).toBe('text');
    store().armPalette(null);
    expect(store().paletteKind).toBeNull();
  });
});

describe('entrar e sair de container aninhado', () => {
  /** Raiz canvas com um container filho, que por sua vez tem um KPI. */
  function aninhado(): { filho: string } {
    store().addNode('container');
    const filho = selectedId() ?? '';
    store().setProp(filho, 'placement', 'canvas');
    store().addNode('text');
    return { filho };
  }

  it('entrar troca o nivel e limpa a selecao', () => {
    // Manter selecionado um irmao de fora deixaria as setas do teclado mexendo
    // num no que ja nao esta sob o ponteiro.
    const { filho } = aninhado();
    store().enterContainer(filho);

    expect(store().enteredId).toBe(filho);
    expect(selectedId()).toBeNull();
  });

  it('so da para entrar em quem POSICIONA', () => {
    // Num container que empilha nao ha camada para mostrar depois de entrar, e
    // o usuario ficaria num nivel sem nada clicavel, sem saber como sair.
    store().addNode('container');
    const empilha = selectedId() ?? '';
    store().setProp(empilha, 'placement', 'stack');

    store().enterContainer(empilha);
    expect(store().enteredId).toBeNull();
  });

  it('nao entra num id que nao existe', () => {
    store().enterContainer('inexistente');
    expect(store().enteredId).toBeNull();
  });

  it('sair sobe um nivel SELECIONANDO o container de onde saiu', () => {
    // E o no que o usuario acabou de terminar de editar, e o proximo gesto
    // quase sempre e sobre ele.
    const { filho } = aninhado();
    store().enterContainer(filho);

    expect(store().exitContainer()).toBe(true);
    expect(store().enteredId).toBeNull();
    expect(selectedId()).toBe(filho);
  });

  it('na raiz, sair nao faz nada e AVISA que nao fez', () => {
    // O `false` e o que deixa o Esc decidir o proximo passo em vez de engolir a
    // tecla — sem ele, quem chama nao teria como distinguir "subiu" de "ja
    // estava no topo".
    expect(store().exitContainer()).toBe(false);
    expect(store().enteredId).toBeNull();
  });

  it('projeto novo volta para a raiz', () => {
    const { filho } = aninhado();
    store().enterContainer(filho);
    store().newProject('Outro');

    expect(store().enteredId).toBeNull();
  });
});

/**
 * Mudar de pai pelo arrasto na Composicao. A mira esta em `lib/treeDrop.test.ts`
 * e a operacao em `tree.test.ts`; aqui fica a fronteira com o historico.
 */
describe('reparent de um bloco pelo store', () => {
  /** Raiz com [texto, painel] e o painel com um texto dentro. */
  function arvore(): { painel: string; texto: string; dentro: string } {
    store().addNode('text');
    const texto = selectedId() ?? '';
    store().select(store().spec.root.id);
    store().addNode('container');
    const painel = selectedId() ?? '';
    store().addNode('text');
    return { painel, texto, dentro: selectedId() ?? '' };
  }

  it('leva o no para o pai novo e o deixa selecionado', () => {
    const { painel, texto } = arvore();
    store().reparentMany([texto], painel);

    expect(findNode(store().spec.root, painel)?.children?.map((c) => c.id)).toContain(texto);
    expect(store().selectedIds).toEqual([texto]);
    expect(store().issues).toEqual([]);
  });

  it('um arrasto e UM passo de desfazer', () => {
    const { painel, texto } = arvore();
    const antes = store().spec.root;

    store().reparentMany([texto], painel);
    store().undo();

    expect(store().spec.root).toEqual(antes);
  });

  it('recusa soltar um container dentro de um filho dele, sem mexer em nada', () => {
    const { painel, dentro } = arvore();
    const antes = store().spec.root;

    store().reparentMany([painel], dentro);
    expect(store().spec.root).toBe(antes);
  });

  it('o filho que chega num canvas ganha caixa, e a spec continua valida', () => {
    const { painel, texto } = arvore();
    store().reparentMany([texto], painel);

    expect(findNode(store().spec.root, texto)?.rect).toBeDefined();
    expect(validateSpec(store().spec).kind).toBe('valid');
  });

  it('o bloco inteiro vai junto, na ordem da arvore', () => {
    store().addNode('text');
    const primeiro = selectedId() ?? '';
    store().select(store().spec.root.id);
    store().addNode('text');
    const segundo = selectedId() ?? '';
    store().select(store().spec.root.id);
    store().addNode('container');
    const painel = selectedId() ?? '';

    store().reparentMany([primeiro, segundo], painel);
    expect(findNode(store().spec.root, painel)?.children?.map((c) => c.id)).toEqual([
      primeiro,
      segundo,
    ]);
  });
});

/**
 * A selecao desce ate o nivel do no (`hostOf`).
 *
 * Sem isto a arvore selecionava um neto que a prancheta nao mostrava: a camada
 * so monta no container entrado, e chegar la exigia duplo clique. O duplo clique
 * continua existindo — o que sai e a exigencia.
 */
describe('selecionar entra no pai', () => {
  /** Raiz canvas > filho canvas > neto. Devolve os dois ids. */
  function neto(): { filho: string; neto: string } {
    store().addNode('container');
    const filho = selectedId() ?? '';
    store().addNode('text');
    return { filho, neto: selectedId() ?? '' };
  }

  it('selecionar um neto poe a camada no pai dele', () => {
    const { filho, neto: id } = neto();
    store().enterContainer(null);
    expect(store().enteredId).toBeNull();

    store().select(id);
    expect(store().enteredId).toBe(filho);
  });

  it('filho da raiz volta a camada para a raiz', () => {
    const { filho } = neto();
    store().select(filho);
    expect(store().enteredId).toBeNull();
  });

  it('pai que EMPILHA nao mexe no nivel — la nao ha camada', () => {
    const { filho, neto: id } = neto();
    store().setProp(filho, 'placement', 'stack');
    store().enterContainer(null);

    store().select(id);
    expect(store().enteredId).toBeNull();
  });

  it('limpar a selecao NAO sobe de nivel — o Esc tem dois passos', () => {
    const { filho, neto: id } = neto();
    store().select(id);
    expect(store().enteredId).toBe(filho);

    store().select(null);
    expect(store().enteredId).toBe(filho);
    expect(store().exitContainer()).toBe(true);
  });

  it('a arvore selecionando por lista desce igual', () => {
    const { filho, neto: id } = neto();
    store().enterContainer(null);

    store().setSelection([id]);
    expect(store().enteredId).toBe(filho);
  });

  it('no que nasce dentro de um container aninhado ja nasce alcancavel', () => {
    const { filho } = neto();
    store().enterContainer(null);
    store().select(filho);

    store().addNode('text');
    expect(store().enteredId).toBe(filho);
  });
});

/**
 * O painel de formatacao do visual gerado (spec 5.1.0), do lado do editor.
 *
 * As invariantes de ordem e de batismo estao no `component-registry`, onde se
 * testam sem React. O que se prova aqui e a fronteira: publicar e uma EDICAO —
 * passa pelo `commit`, revalida e empilha um passo de desfazer, como qualquer
 * outra.
 */
describe('publicar campo no painel do Power BI', () => {
  it('projeto novo nao publica nada', () => {
    const publicados = (node: SpecNode): number =>
      (node.exposed?.length ?? 0) + (node.children ?? []).reduce((n, c) => n + publicados(c), 0);

    store().addNode('text');
    expect(publicados(store().spec.root)).toBe(0);
  });

  it('publicar e uma edicao: entra no historico e continua valida', () => {
    store().addNode('text');
    const id = selectedId() ?? '';

    store().setFieldExposed(id, 'color', true);
    expect(findNode(store().spec.root, id)?.exposed).toEqual(['color']);
    expect(validateSpec(store().spec).kind).toBe('valid');

    store().undo();
    expect(findNode(store().spec.root, id)?.exposed).toBeUndefined();
  });

  it('o apelido tambem desfaz', () => {
    store().addNode('text');
    const id = selectedId() ?? '';

    store().setFieldExposed(id, 'color', true);
    store().setNodeName(id, 'Cabecalho');
    expect(findNode(store().spec.root, id)?.name).toBe('Cabecalho');

    store().undo();
    // Volta ao apelido que a publicacao sugeriu, nao a coisa nenhuma.
    expect(findNode(store().spec.root, id)?.name).toBe(String(defaultPropsFor('text').content));
  });

  it('chave estrutural nao muda nada — a operacao e rejeitada', () => {
    const id = store().spec.root.id;
    const antes = store().spec;

    store().setFieldExposed(id, 'placement', true);
    expect(store().spec).toBe(antes);
  });
});
