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
import { selectCanExport, useEditorStore } from './useEditorStore';

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

/**
 * O no selecionado, exigindo que haja um.
 *
 * Lanca em vez de devolver `null` porque quem chama esta afirmando que a acao
 * anterior selecionou algo — e "a selecao ficou vazia" tem de reprovar o teste
 * com essa frase, nao virar `undefined` num `toMatchObject` que passa.
 */
function selected(): SpecNode {
  const id = store().selectedId;
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
    expect(store().selectedId).toBeNull();
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
    const primeiro = store().selectedId;
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
   * ============ AS LIGACOES AUTOMATICAS DE PAPEL ESTAO DORMENTES =============
   * Havia aqui dois testes sobre `suggestRoleBindings`:
   *
   *   - "liga os papeis automaticamente e a spec continua valida" — sem isso
   *     todo grafico nascia no estado vazio, com dois campos a preencher antes
   *     de o usuario ver qualquer coisa
   *   - "sem coluna do tipo certo, o campo fica pendente e o export trava"
   *
   * `suggestRoleBindings` foi APAGADA na spec 5.0.0: sem campo de papel no
   * catalogo ela nao tinha o que sugerir, e `createNode` voltou a ser so os
   * defaults. Volta com o KPI Card da Fase 4.
   * =========================================================================
   */

  it('todo no nasce valido e o export nao trava por causa dele', () => {
    // A contrapartida do que saiu acima: nao havendo mais campo sem default,
    // adicionar qualquer componente deixa a spec pronta para exportar.
    for (const kind of NODE_KINDS) store().addNode(kind);

    expect(store().issues).toEqual([]);
    expect(selectCanExport(useEditorStore.getState())).toBe(true);
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

describe('duplicar', () => {
  it('a copia entra logo depois do original e passa a ser a selecao', () => {
    store().addNode('text');
    store().addNode('text');

    const copia = store().duplicateNode();

    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'text', 'text']);
    expect(store().selectedId).toBe(copia);
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
    expect(store().duplicateNode()).toBeNull();
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
    const selected = store().selectedId;

    store().setArtboard({ width: 800, height: 600 });

    expect(store().spec.root).toBe(before);
    expect(store().selectedId).toBe(selected);
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
    expect(store().selectedId).toBeNull();
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
    const id = store().selectedId ?? '';
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
    const id = store().selectedId ?? '';
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
    const criado = store().selectedId;
    expect(criado).not.toBeNull();

    store().undo();
    expect(store().selectedId).toBeNull();
  });

  it('a spec depois de desfazer continua valida', () => {
    store().addNode('text');
    store().setProp(store().selectedId ?? '', 'strokeWidth', 4);
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
    const filho = store().selectedId ?? '';
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
    expect(store().selectedId).toBeNull();
  });

  it('so da para entrar em quem POSICIONA', () => {
    // Num container que empilha nao ha camada para mostrar depois de entrar, e
    // o usuario ficaria num nivel sem nada clicavel, sem saber como sair.
    store().addNode('container');
    const empilha = store().selectedId ?? '';
    expect(store().spec.root.children?.[0]?.props.placement).toBe('stack');

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
    expect(store().selectedId).toBe(filho);
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
