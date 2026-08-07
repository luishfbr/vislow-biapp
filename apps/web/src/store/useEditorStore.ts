'use client';

import { create } from 'zustand';
import {
  acceptsChildren,
  addColumn,
  addRow,
  clampArtboard,
  clampRect,
  cloneSubtree,
  createEmptySpec,
  createNode,
  suggestRoleBindings,
  findNode,
  insertChild,
  moveNode,
  parentOf,
  positionsChildren,
  removeColumn,
  removeNode,
  removeRow,
  reparentNode,
  selectionAfterRemoval,
  setCell,
  setColumnKind,
  setColumnLabel,
  setColumnType,
  setFieldExposed,
  setNodeName,
  setNodeProps,
  setNodeRect,
  setNodeRects,
  validateSpec,
  SPEC_VERSION,
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

/** Estado do editor. Toda escrita passa por `commit`, que revalida e persiste (RN-03). */
export interface EditorState {
  spec: VisualSpec;
  issues: ValidationIssue[];
  /** Ordem de arvore, nao de clique. Com mais de um, todos sao IRMAOS — `rect` e % do pai. */
  selectedIds: readonly string[];
  hydrated: boolean;

  /** Medida de tela, em px da prancheta. Fora da spec de proposito: nao descreve o projeto. */
  containerSizes: Record<string, { width: number; height: number }>;

  /** Da sessao, nao persistido — achado 40, ver docs/history.md. */
  lastExportedAt: number | null;
  reportContainerSize: (id: string, size: { width: number; height: number }) => void;

  past: VisualSpec[];
  future: VisualSpec[];
  undo: () => void;
  redo: () => void;

  /** Um arrasto e UM passo de desfazer. Entre begin/end a escrita e transitoria. */
  beginGesture: () => void;
  endGesture: () => void;

  hydrate: () => void;

  select: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  setSelection: (ids: readonly string[]) => void;
  selectSiblings: () => void;
  addNode: (kind: NodeKind) => void;
  addNodeAt: (kind: NodeKind, rect: NodeRect) => void;

  paletteKind: NodeKind | null;
  armPalette: (kind: NodeKind | null) => void;

  enteredId: string | null;
  enterContainer: (id: string | null) => void;
  exitContainer: () => boolean;
  removeSelected: () => void;
  duplicateNode: (
    ids?: readonly string[] | null,
    options?: { offset?: boolean },
  ) => readonly string[];
  moveSelected: (delta: number) => void;
  reparent: (id: string, parentId: string, index?: number) => void;
  setProp: (id: string, key: string, value: unknown) => void;
  setRect: (id: string, rect: NodeRect) => void;
  setRects: (entries: readonly { id: string; rect: NodeRect }[]) => void;

  setNodeName: (id: string, name: string) => void;
  setFieldExposed: (id: string, key: string, exposed: boolean) => void;

  addColumn: (label: string, type: ColumnType) => void;
  setColumnLabel: (name: string, label: string) => void;
  setColumnType: (name: string, type: ColumnType) => void;
  setColumnKind: (name: string, kind: RoleKind) => void;
  removeColumn: (name: string) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
  setCell: (row: number, column: number, value: CellValue) => void;

  rename: (name: string) => void;
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

const HISTORY_LIMIT = 50;

/** Sempre o MESMO array: o zustand v5 compara por `Object.is` e um `[]` novo re-renderiza. */
const NO_SELECTION: readonly string[] = [];

/** Impoe as regras de `selectedIds`. Um no sozinho escapa da irmandade: a arvore seleciona em qualquer nivel. */
function resolveSelection(root: SpecNode, ids: readonly string[]): readonly string[] {
  const present = ids.filter((id) => findNode(root, id));
  const first = present[0];
  if (first === undefined) return NO_SELECTION;
  if (present.length === 1) return present;

  const parent = parentOf(root, first);
  if (!parent) return [first];

  const wanted = new Set(present);
  return (parent.children ?? []).map((child) => child.id).filter((id) => wanted.has(id));
}

/**
 * O container onde a camada monta para estes nos ficarem manipulaveis — `null` e
 * a raiz. Pai que empilha nao tem camada: fica onde estava (docs/frontend.md §3.6.1).
 */
function hostOf(root: SpecNode, ids: readonly string[], current: string | null): string | null {
  const first = ids[0];
  if (first === undefined) return current;

  const parent = parentOf(root, first);
  if (!parent) return current;
  if (parent.id === root.id) return null;
  return positionsChildren(parent) ? parent.id : current;
}

export const useEditorStore = create<EditorState>((set, get) => {
  let gestureBase: VisualSpec | null = null;

  /** `selectedIds` undefined = nao mexe na selecao; lista = troca. Colapsar os dois desselecionaria ao editar. */
  const commit = (spec: VisualSpec, selectedIds?: readonly string[]): void => {
    const selection =
      selectedIds === undefined
        ? {}
        : { selectedIds, enteredId: hostOf(spec.root, selectedIds, get().enteredId) };

    if (gestureBase) {
      set({ spec, ...selection });
      return;
    }

    const { past, spec: previous } = get();
    set({
      spec,
      issues: revalidate(spec),
      past: [...past, previous].slice(-HISTORY_LIMIT),
      future: [],
      ...selection,
    });
    saveProjectDebounced(spec);
  };

  const restore = (spec: VisualSpec, past: VisualSpec[], future: VisualSpec[]): void => {
    const { selectedIds } = get();
    set({
      spec,
      issues: revalidate(spec),
      past,
      future,
      selectedIds: resolveSelection(spec.root, selectedIds),
    });
    saveProjectDebounced(spec);
  };

  const editTree = (next: SpecNode | null, selectedIds?: readonly string[]): void => {
    if (!next) return;
    commit({ ...get().spec, root: next }, selectedIds);
  };

  const editTable = (next: VisualSpec | null): void => {
    if (!next) return;
    commit(next);
  };

  const initial = createEmptySpec(INITIAL_NAME);

  return {
    spec: initial,
    issues: revalidate(initial),
    selectedIds: NO_SELECTION,
    hydrated: false,
    containerSizes: {},
    lastExportedAt: null,
    past: [],
    future: [],
    paletteKind: null,
    enteredId: null,

    beginGesture: () => {
      gestureBase ??= get().spec;
    },

    endGesture: () => {
      const base = gestureBase;
      gestureBase = null;
      if (!base) return;

      const { spec, past } = get();
      if (base === spec) {
        set({ issues: revalidate(spec) });
        return;
      }

      set({
        issues: revalidate(spec),
        past: [...past, base].slice(-HISTORY_LIMIT),
        future: [],
      });
      saveProjectDebounced(spec);
    },

    undo: () => {
      const { past, future, spec } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      restore(previous, past.slice(0, -1), [spec, ...future]);
    },

    redo: () => {
      const { past, future, spec } = get();
      const next = future[0];
      if (!next) return;
      restore(next, [...past, spec], future.slice(1));
    },

    reportContainerSize: (id, size) => {
      const current = get().containerSizes[id];
      // Nao e otimizacao: o `ResizeObserver` repete a medida e o `Object.is` re-renderizaria em laco.
      if (current?.width === size.width && current.height === size.height) return;
      set({ containerSizes: { ...get().containerSizes, [id]: size } });
    },

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
        selectedIds: NO_SELECTION,
        hydrated: true,
        past: [],
        future: [],
        enteredId: null,
      });
    },

    select: (id) => {
      // Limpar NAO sobe de nivel: o `Esc` limpa a selecao e so depois sai do
      // container, e colapsar os dois passos tiraria o usuario de onde ele esta.
      if (id === null) {
        set({ selectedIds: NO_SELECTION });
        return;
      }
      const { spec, enteredId } = get();
      if (findNode(spec.root, id)) {
        set({ selectedIds: [id], enteredId: hostOf(spec.root, [id], enteredId) });
      }
    },

    toggleSelected: (id) => {
      const { spec, selectedIds } = get();
      if (!findNode(spec.root, id)) return;

      if (selectedIds.includes(id)) {
        const next = selectedIds.filter((current) => current !== id);
        set({ selectedIds: next.length === 0 ? NO_SELECTION : next });
        return;
      }

      const anchor = selectedIds[0];
      const sameParent =
        anchor !== undefined && parentOf(spec.root, anchor)?.id === parentOf(spec.root, id)?.id;

      const next = sameParent ? resolveSelection(spec.root, [...selectedIds, id]) : [id];
      set({ selectedIds: next, enteredId: hostOf(spec.root, next, get().enteredId) });
    },

    setSelection: (ids) => {
      const { spec, enteredId } = get();
      const next = resolveSelection(spec.root, ids);
      set({ selectedIds: next, enteredId: hostOf(spec.root, next, enteredId) });
    },

    selectSiblings: () => {
      const { spec, enteredId } = get();
      const container = enteredId === null ? spec.root : findNode(spec.root, enteredId);
      if (!container) return;
      const ids = (container.children ?? []).map((child) => child.id);
      set({ selectedIds: ids.length === 0 ? NO_SELECTION : ids });
    },

    addNode: (kind) => {
      const { spec, selectedIds } = get();
      const anchor = selectedIds[0];
      const selected = (anchor === undefined ? null : findNode(spec.root, anchor)) ?? spec.root;
      const node = createNode(kind, suggestRoleBindings(kind, spec.data.columns));

      if (acceptsChildren(selected)) {
        editTree(insertChild(spec.root, selected.id, node), [node.id]);
        return;
      }

      const parent = parentOf(spec.root, selected.id);
      if (!parent) return;
      const index = (parent.children ?? []).findIndex((child) => child.id === selected.id) + 1;
      editTree(insertChild(spec.root, parent.id, node, index), [node.id]);
    },

    addNodeAt: (kind, rect) => {
      const { spec } = get();
      const node = createNode(kind, suggestRoleBindings(kind, spec.data.columns));

      if (!positionsChildren(spec.root)) {
        editTree(insertChild(spec.root, spec.root.id, node), [node.id]);
        return;
      }

      node.rect = clampRect(rect);
      editTree(insertChild(spec.root, spec.root.id, node), [node.id]);
    },

    armPalette: (kind) => {
      set({ paletteKind: kind });
    },

    enterContainer: (id) => {
      const { spec } = get();
      if (id !== null) {
        const node = findNode(spec.root, id);
        if (!node || !positionsChildren(node)) return;
      }
      set({ enteredId: id, selectedIds: NO_SELECTION });
    },

    exitContainer: () => {
      const { spec, enteredId } = get();
      if (enteredId === null || enteredId === spec.root.id) return false;

      const parent = parentOf(spec.root, enteredId);
      set({
        enteredId: parent && parent.id !== spec.root.id ? parent.id : null,
        selectedIds: [enteredId],
      });
      return true;
    },

    removeSelected: () => {
      const { spec, selectedIds } = get();
      const anchor = selectedIds[0];
      if (anchor === undefined) return;

      const survivor = selectionAfterRemoval(spec.root, selectedIds);

      let root: SpecNode | null = spec.root;
      for (const id of selectedIds) root = root && removeNode(root, id);
      if (!root) return;

      editTree(root, [survivor]);
    },

    duplicateNode: (ids, options) => {
      const { spec, selectedIds } = get();
      const targets = ids ?? selectedIds;
      if (targets.length === 0) return NO_SELECTION;

      let root: SpecNode | null = spec.root;
      const copies: string[] = [];

      // De tras para a frente: inserir do primeiro empurraria o indice dos que ainda faltam.
      for (const target of [...targets].reverse()) {
        if (!root || target === spec.root.id) return NO_SELECTION;

        const node = findNode(root, target);
        const parent = parentOf(root, target);
        if (!node || !parent) return NO_SELECTION;

        const copy = cloneSubtree(node);
        if (copy.rect && options?.offset !== false) {
          copy.rect = clampRect({ ...copy.rect, x: copy.rect.x + 2, y: copy.rect.y + 2 });
        }

        const index = (parent.children ?? []).findIndex((child) => child.id === target) + 1;
        root = insertChild(root, parent.id, copy, index);
        copies.unshift(copy.id);
      }

      if (!root) return NO_SELECTION;
      editTree(root, copies);
      return copies;
    },

    moveSelected: (delta) => {
      const { spec, selectedIds } = get();
      if (selectedIds.length === 0) return;

      // Subindo, o de cima primeiro; descendo, o de baixo. Na ordem errada dois vizinhos trocam entre si.
      const order = delta < 0 ? selectedIds : [...selectedIds].reverse();

      let root: SpecNode | null = spec.root;
      for (const id of order) root = root && moveNode(root, id, delta);
      editTree(root);
    },

    reparent: (id, parentId, index) => {
      editTree(reparentNode(get().spec.root, id, parentId, index), [id]);
    },

    setProp: (id, key, value) => {
      editTree(setNodeProps(get().spec.root, id, { [key]: value }));
    },

    setRect: (id, rect) => {
      editTree(setNodeRect(get().spec.root, id, rect));
    },

    setRects: (entries) => {
      editTree(setNodeRects(get().spec.root, entries));
    },

    setNodeName: (id, name) => {
      editTree(setNodeName(get().spec.root, id, name));
    },

    setFieldExposed: (id, key, exposed) => {
      editTree(setFieldExposed(get().spec.root, id, key, exposed));
    },

    addColumn: (label, type) => {
      editTable(addColumn(get().spec, label, type));
    },

    setColumnLabel: (name, label) => {
      editTable(setColumnLabel(get().spec, name, label));
    },

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

    setArtboard: (size) => {
      const { spec } = get();
      commit({ ...spec, project: { ...spec.project, artboard: clampArtboard(size) } });
    },

    newProject: (name) => {
      const spec = createEmptySpec(name);
      commit(spec, NO_SELECTION);
      set({ past: [], future: [], enteredId: null });
    },

    /** Versao incompativel e dita por extenso: nao ha migracao 4->5, ver docs/history.md. */
    importSpec: (raw) => {
      const version =
        typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
          ? raw.schemaVersion
          : undefined;
      if (typeof version === 'string' && version !== SPEC_VERSION) {
        return {
          ok: false,
          issues: [
            {
              path: '/schemaVersion',
              message:
                `Este arquivo e da versao ${version}, e o editor esta na ${SPEC_VERSION}. ` +
                'Nao ha conversao entre as duas — recomponha o visual neste editor.',
            },
          ],
        };
      }

      const result = validateSpec(raw);
      if (result.kind === 'invalid') return { ok: false, issues: result.issues };
      commit(result.spec, NO_SELECTION);
      set({ past: [], future: [], enteredId: null });
      return { ok: true };
    },

    markExported: () => {
      set({ lastExportedAt: Date.now() });
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

export const selectCanExport = (s: EditorState): boolean =>
  s.issues.length === 0 && s.spec.project.name.trim().length >= 3;

/** Devolve REFERENCIA do estado, nunca objeto novo — senao o `Object.is` do zustand v5 re-renderiza em loop. */
export const selectSelectedNode = (s: EditorState): SpecNode | null => {
  const id = selectSelectedId(s);
  return id === null ? null : findNode(s.spec.root, id);
};

export const selectSelectedId = (s: EditorState): string | null =>
  s.selectedIds.length === 1 ? (s.selectedIds[0] ?? null) : null;

export const selectSelectionCount = (s: EditorState): number => s.selectedIds.length;
