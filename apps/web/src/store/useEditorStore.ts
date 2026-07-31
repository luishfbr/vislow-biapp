'use client';

import { create } from 'zustand';
import {
  acceptsChildren,
  createEmptySpec,
  createNode,
  createRole,
  findNode,
  insertChild,
  moveNode,
  parentOf,
  removeNode,
  reparentNode,
  selectionAfterRemoval,
  setNodeProps,
  suggestRoleBindings,
  unbindRole,
  validateSpec,
  type NodeKind,
  type RoleKind,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { bumpPackageVersion, type ValidationIssue } from '@vislow/config-schema';
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

  addRole: (kind: RoleKind) => void;
  setRoleLabel: (name: string, displayName: string) => void;
  removeRole: (name: string) => void;

  rename: (name: string) => void;
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
      const node = createNode(kind, suggestRoleBindings(kind, spec.dataRoles));

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

    addRole: (kind) => {
      const { spec } = get();
      const sameKind = spec.dataRoles.filter((role) => role.kind === kind).length;
      const base = kind === 'grouping' ? 'Categoria' : 'Medida';
      const label = sameKind === 0 ? base : `${base} ${String(sameKind + 1)}`;

      commit({
        ...spec,
        dataRoles: [...spec.dataRoles, createRole(label, kind, spec.dataRoles)],
      });
    },

    /**
     * So o rotulo muda. O `name` e estavel por desenho (ver `createRole`): e ele
     * que aparece no `capabilities.json` e amarra as referencias da arvore.
     */
    setRoleLabel: (name, displayName) => {
      const { spec } = get();
      commit({
        ...spec,
        dataRoles: spec.dataRoles.map((role) =>
          role.name === name ? { ...role, displayName } : role,
        ),
      });
    },

    removeRole: (name) => {
      const { spec } = get();
      // Desligar da arvore junto e obrigatorio: um no apontando para papel
      // inexistente e exatamente o caso que `validateSpec` reprova, e o usuario
      // ficaria com um erro cuja causa ele nao consegue ver na tela.
      commit({
        ...spec,
        dataRoles: spec.dataRoles.filter((role) => role.name !== name),
        root: unbindRole(spec.root, name),
      });
    },

    rename: (name) => {
      const { spec } = get();
      commit({ ...spec, project: { ...spec.project, name } });
    },

    newProject: (name) => {
      // Projeto novo => identidade nova (RN-01). O id nasce aqui, e nao no
      // export, e e o que faz reexportar atualizar em vez de duplicar.
      const spec = createEmptySpec(name);
      commit(spec, spec.root.id);
    },

    importSpec: (raw) => {
      const result = validateSpec(raw);
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
