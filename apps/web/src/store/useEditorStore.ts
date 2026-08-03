'use client';

import { create } from 'zustand';
import {
  acceptsChildren,
  addColumn,
  addRow,
  clampArtboard,
  createEmptySpec,
  createNode,
  findNode,
  insertChild,
  isV2Spec,
  migrateV2ToV3,
  moveNode,
  parentOf,
  removeColumn,
  removeNode,
  removeRow,
  reparentNode,
  selectionAfterRemoval,
  setCell,
  setColumnKind,
  setColumnLabel,
  setColumnType,
  setNodeProps,
  setNodeRect,
  suggestRoleBindings,
  validateSpec,
  type Artboard,
  type NodeKind,
  type NodeRect,
  type RoleKind,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import {
  bumpPackageVersion,
  type CellValue,
  type ColumnType,
  type ValidationIssue,
} from '@vislow/config-schema';
import { loadProject, saveProjectDebounced } from '@/lib/persistence';

/**
 * Estado do editor de composicao.
 *
 * Uma unica spec, uma unica selecao. Toda escrita passa por `commit`, que
 * revalida e persiste (RN-03) — nao existe caminho que altere a arvore sem
 * revalidar, e e isso que garante que o botao de export so fica ativo com uma
 * spec que a API aceitaria.
 */

export interface EditorState {
  spec: VisualSpec;
  issues: ValidationIssue[];
  /** Id do no selecionado. Sempre aponta para um no existente. */
  selectedId: string;
  /** Falso ate a hidratacao do localStorage terminar (evita mismatch de SSR). */
  hydrated: boolean;

  hydrate: () => void;

  select: (id: string) => void;
  /** Adiciona um no relativo a selecao e passa a selecionar o novo. */
  addNode: (kind: NodeKind) => void;
  removeSelected: () => void;
  /** Reordena entre irmaos. `delta` e -1 (sobe) ou +1 (desce). */
  moveSelected: (delta: number) => void;
  reparent: (id: string, parentId: string, index?: number) => void;
  setProp: (id: string, key: string, value: unknown) => void;
  /** Move ou redimensiona dentro de um pai que posiciona. Prende na borda. */
  setRect: (id: string, rect: NodeRect) => void;

  /**
   * A tabela de exemplo. Cada coluna e, ao mesmo tempo, um campo do visual —
   * nao ha duas listas. Toda operacao delega para `table.ts`, que e puro e
   * testado sem React; aqui so passa pelo `commit`.
   */
  addColumn: (label: string, type: ColumnType) => void;
  setColumnLabel: (name: string, label: string) => void;
  setColumnType: (name: string, type: ColumnType) => void;
  setColumnKind: (name: string, kind: RoleKind) => void;
  removeColumn: (name: string) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
  setCell: (row: number, column: number, value: CellValue) => void;

  rename: (name: string) => void;
  /** Tamanho da prancheta do editor, em px. Prende na faixa valida. */
  setArtboard: (size: Artboard) => void;
  newProject: (name: string) => void;
  importSpec: (raw: unknown) => { ok: true } | { ok: false; issues: ValidationIssue[] };
  markExported: () => void;
}

const INITIAL_NAME = 'Meu visual';

function revalidate(spec: VisualSpec): ValidationIssue[] {
  const result = validateSpec(spec);
  return result.kind === 'invalid' ? result.issues : [];
}

export const useEditorStore = create<EditorState>((set, get) => {
  /** Ponto unico de escrita: aplica, revalida e persiste. */
  const commit = (spec: VisualSpec, selectedId?: string): void => {
    set({ spec, issues: revalidate(spec), ...(selectedId === undefined ? {} : { selectedId }) });
    saveProjectDebounced(spec);
  };

  /** Aplica uma edicao de arvore. Operacao rejeitada (null) e ignorada. */
  const editTree = (next: SpecNode | null, selectedId?: string): void => {
    if (!next) return;
    commit({ ...get().spec, root: next }, selectedId);
  };

  /**
   * Aplica uma edicao de tabela. Mesma convencao do `editTree`: `null` e
   * operacao ilegal (teto atingido, ultima coluna, celula fora da grade) e nao
   * mexe em nada. Note que a spec resultante pode ser INVALIDA de proposito —
   * apagar uma coluna ligada deixa o no pendente —, e por isso ela passa pelo
   * `commit`, que revalida e acende o painel.
   */
  const editTable = (next: VisualSpec | null): void => {
    if (!next) return;
    commit(next);
  };

  const initial = createEmptySpec(INITIAL_NAME);

  return {
    spec: initial,
    issues: revalidate(initial),
    selectedId: initial.root.id,
    hydrated: false,

    hydrate: () => {
      if (get().hydrated) return;
      const stored = loadProject();
      if (!stored) {
        set({ hydrated: true });
        return;
      }
      set({
        spec: stored,
        issues: revalidate(stored),
        selectedId: stored.root.id,
        hydrated: true,
      });
    },

    select: (id) => {
      if (findNode(get().spec.root, id)) set({ selectedId: id });
    },

    /**
     * Onde o no novo entra: DENTRO da selecao quando ela aceita filhos, senao
     * logo DEPOIS dela, como irmao. E a regra que dispensa o usuario de pensar
     * onde clicar antes — o resultado e sempre o que ele veria num editor de
     * documento.
     */
    addNode: (kind) => {
      const { spec, selectedId } = get();
      const selected = findNode(spec.root, selectedId) ?? spec.root;
      const node = createNode(kind, suggestRoleBindings(kind, spec.data.columns));

      if (acceptsChildren(selected)) {
        editTree(insertChild(spec.root, selected.id, node), node.id);
        return;
      }

      const parent = parentOf(spec.root, selected.id);
      if (!parent) return;
      const index = (parent.children ?? []).findIndex((child) => child.id === selected.id) + 1;
      editTree(insertChild(spec.root, parent.id, node, index), node.id);
    },

    removeSelected: () => {
      const { spec, selectedId } = get();
      // Calculado ANTES da remocao: depois o no ja nao tem irmaos para consultar.
      const next = selectionAfterRemoval(spec.root, selectedId);
      editTree(removeNode(spec.root, selectedId), next);
    },

    moveSelected: (delta) => {
      const { spec, selectedId } = get();
      editTree(moveNode(spec.root, selectedId, delta));
    },

    reparent: (id, parentId, index) => {
      editTree(reparentNode(get().spec.root, id, parentId, index), id);
    },

    setProp: (id, key, value) => {
      editTree(setNodeProps(get().spec.root, id, { [key]: value }));
    },

    setRect: (id, rect) => {
      editTree(setNodeRect(get().spec.root, id, rect));
    },

    addColumn: (label, type) => {
      editTable(addColumn(get().spec, label, type));
    },

    /**
     * So o rotulo muda. O `name` e estavel por desenho (ver `createColumn`): e
     * ele que aparece no `capabilities.json` e amarra as referencias da arvore.
     */
    setColumnLabel: (name, label) => {
      editTable(setColumnLabel(get().spec, name, label));
    },

    /**
     * Trocar tipo ou papel pode DESLIGAR nos — `table.ts` cuida disso no mesmo
     * passo. O no volta a pendente, o export trava, e o painel mostra onde. E
     * melhor que a alternativa: uma spec que reprova inteira por um erro que
     * fala do no, e nao da coluna em que o usuario acabou de clicar.
     */
    setColumnType: (name, type) => {
      editTable(setColumnType(get().spec, name, type));
    },

    setColumnKind: (name, kind) => {
      editTable(setColumnKind(get().spec, name, kind));
    },

    removeColumn: (name) => {
      editTable(removeColumn(get().spec, name));
    },

    addRow: () => {
      editTable(addRow(get().spec));
    },

    removeRow: (index) => {
      editTable(removeRow(get().spec, index));
    },

    setCell: (row, column, value) => {
      editTable(setCell(get().spec, row, column, value));
    },

    rename: (name) => {
      const { spec } = get();
      commit({ ...spec, project: { ...spec.project, name } });
    },

    /**
     * A prancheta e do PROJETO, nao preferencia da maquina: quem exporta o
     * `.vislow.json` e abre noutro lugar continua desenhando no mesmo alvo. Ela
     * nao chega ao pacote — o `.pbiviz` segue preenchendo a moldura que o autor
     * do relatorio desenhar.
     */
    setArtboard: (size) => {
      const { spec } = get();
      commit({ ...spec, project: { ...spec.project, artboard: clampArtboard(size) } });
    },

    newProject: (name) => {
      // Projeto novo => identidade nova (RN-01). O id nasce aqui, e nao no
      // export, e e o que faz reexportar atualizar em vez de duplicar.
      const spec = createEmptySpec(name);
      commit(spec, spec.root.id);
    },

    /**
     * Importa um `.vislow.json`, migrando o formato antigo pelo mesmo caminho
     * do `localStorage`.
     *
     * Sem a migracao aqui, um arquivo exportado antes da tabela de exemplo
     * existir seria recusado como "invalido" — e o usuario nao teria como
     * saber que o problema e a idade do arquivo, nem o que fazer a respeito.
     */
    importSpec: (raw) => {
      const candidate = isV2Spec(raw) ? migrateV2ToV3(raw) : raw;
      const result = validateSpec(candidate);
      if (result.kind === 'invalid') return { ok: false, issues: result.issues };
      commit(result.spec, result.spec.root.id);
      return { ok: true };
    },

    markExported: () => {
      // RF-10: reexportar o MESMO projeto reusa o GUID e so incrementa a versao,
      // para que o import no Power BI atualize o visual em vez de duplica-lo.
      const { spec } = get();
      commit({
        ...spec,
        project: {
          ...spec.project,
          packageVersion: bumpPackageVersion(spec.project.packageVersion),
        },
      });
    },
  };
});

/** O export so e permitido com spec valida (RN-03). */
export const selectCanExport = (s: EditorState): boolean =>
  s.issues.length === 0 && s.spec.project.name.trim().length >= 3;

/**
 * No selecionado, ou a raiz quando a selecao ficou orfa.
 *
 * Devolve uma REFERENCIA vinda do estado, nunca um objeto novo — um seletor que
 * constroi valor a cada chamada faz o zustand v5 comparar por `Object.is`, achar
 * que mudou e re-renderizar em loop. Derivacoes que criam objeto vivem em
 * `lib/issues.ts` e sao memoizadas no componente.
 */
export const selectSelectedNode = (s: EditorState): SpecNode =>
  findNode(s.spec.root, s.selectedId) ?? s.spec.root;
