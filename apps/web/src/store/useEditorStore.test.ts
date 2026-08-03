import {
  ARTBOARD_DEFAULT,
  ARTBOARD_MAX,
  ARTBOARD_MIN,
  artboardOf,
  findNode,
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

beforeEach(() => {
  store().newProject('Projeto de teste');
});

describe('projeto novo', () => {
  it('nasce valido e exportavel — tela em branco de verdade', () => {
    expect(store().issues).toEqual([]);
    expect(selectCanExport(useEditorStore.getState())).toBe(true);
  });

  it('seleciona a raiz', () => {
    expect(store().selectedId).toBe(store().spec.root.id);
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
    store().addNode('kpi');
    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'kpi']);
  });

  it('entra logo DEPOIS do irmao selecionado, nao no fim', () => {
    store().addNode('text');
    const primeiro = store().selectedId;
    store().addNode('kpi');
    store().select(primeiro);
    store().addNode('barChart');

    expect(kindsOf(store().spec.root)).toEqual(['container', 'text', 'barChart', 'kpi']);
  });

  it('aninha dentro de um container filho', () => {
    store().addNode('container');
    store().addNode('kpi');
    expect(kindsOf(store().spec.root)).toEqual(['container', 'container', 'kpi']);
  });

  it('liga os papeis automaticamente e a spec continua valida', () => {
    // Sem isto todo grafico nasceria no estado vazio, com dois campos para
    // preencher antes de o usuario ver qualquer coisa.
    store().addNode('barChart');
    expect(store().issues).toEqual([]);

    const bar = findNode(store().spec.root, store().selectedId);
    expect(bar?.props).toMatchObject({ categoryRole: 'categoria', measureRole: 'valor' });
  });

  it('sem papel do tipo certo, o campo fica pendente e o export trava', () => {
    store().removeRole('categoria');
    store().addNode('barChart');

    expect(store().issues.length).toBeGreaterThan(0);
    expect(selectCanExport(useEditorStore.getState())).toBe(false);
  });
});

describe('reordenar e remover', () => {
  it('sobe e desce entre irmaos', () => {
    store().addNode('text');
    store().addNode('kpi');
    store().moveSelected(-1);
    expect(kindsOf(store().spec.root)).toEqual(['container', 'kpi', 'text']);
  });

  it('a raiz nao pode ser removida', () => {
    store().removeSelected();
    expect(store().spec.root).toBeDefined();
    expect(kindsOf(store().spec.root)).toEqual(['container']);
  });

  it('remover leva a selecao para um vizinho, nunca para o vazio', () => {
    store().addNode('text');
    store().addNode('kpi');
    store().removeSelected();

    expect(findNode(store().spec.root, store().selectedId)).not.toBeNull();
  });
});

describe('papeis de dados', () => {
  it('nome tecnico e derivado do rotulo e nao colide', () => {
    store().addRole('measure');
    store().addRole('measure');
    const nomes = store().spec.dataRoles.map((role) => role.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('editar o rotulo NAO muda o nome tecnico', () => {
    // O nome amarra as referencias da arvore e vai para o capabilities.json.
    // Se ele mudasse junto, cada renomeio quebraria todo no que o usa.
    store().addNode('barChart');
    store().setRoleLabel('valor', 'Receita liquida');

    const role = store().spec.dataRoles.find((r) => r.name === 'valor');
    expect(role?.displayName).toBe('Receita liquida');
    expect(store().issues).toEqual([]);
  });

  it('remover um papel DESLIGA os nos que o usavam', () => {
    store().addNode('kpi');
    expect(store().issues).toEqual([]);

    store().removeRole('valor');

    const kpi = findNode(store().spec.root, store().selectedId);
    expect(kpi?.props.measureRole).toBeUndefined();
    // Pendente, nao quebrado: o editor mostra o campo vazio e trava o export.
    expect(selectCanExport(useEditorStore.getState())).toBe(false);
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
    store().addNode('barChart');
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

  it('aceita uma spec valida e seleciona a raiz', () => {
    store().addNode('barChart');
    const exportada = structuredClone(store().spec);

    store().newProject('Vazio');
    expect(store().importSpec(exportada)).toEqual({ ok: true });
    expect(store().selectedId).toBe(store().spec.root.id);
  });
});

describe('o roteiro do teste manual produz uma spec compilavel', () => {
  it('container + KPI + dois graficos passa na mesma validacao que a API aplica', () => {
    store().rename('Painel de vendas');
    store().addNode('text');
    store().addNode('container');
    store().addNode('kpi');
    store().select(store().spec.root.id);
    store().addNode('barChart');
    store().addNode('lineChart');

    expect(kindsOf(store().spec.root)).toEqual([
      'container',
      'text',
      'container',
      'kpi',
      'barChart',
      'lineChart',
    ]);

    // A MESMA funcao que o `BuildsController` chama antes de enfileirar.
    expect(validateSpec(store().spec).kind).toBe('valid');
    expect(selectCanExport(useEditorStore.getState())).toBe(true);
  });
});
