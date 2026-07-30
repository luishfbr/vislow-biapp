'use client';

import { create } from 'zustand';
import {
  bumpPackageVersion,
  createDefaultConfig,
  validateConfig,
  withChartType,
  type ChartType,
  type ValidationIssue,
  type VisualConfig,
} from '@vislow/config-schema';
import { loadProject, saveProjectDebounced } from '@/lib/persistence';

export interface EditorState {
  config: VisualConfig;
  issues: ValidationIssue[];
  /** Falso ate a hidratacao do localStorage terminar (evita mismatch de SSR). */
  hydrated: boolean;

  hydrate: () => void;
  /** Toda escrita passa por aqui: aplica, revalida e persiste (RN-03). */
  mutate: (recipe: (draft: VisualConfig) => void) => void;
  setChartType: (type: ChartType) => void;
  rename: (name: string) => void;
  newProject: (name: string) => void;
  /** Importa um config externo. Nao substitui o atual se for invalido. */
  importConfig: (raw: unknown) => { ok: true } | { ok: false; issues: ValidationIssue[] };
  markExported: () => void;
}

const INITIAL_NAME = 'Meu visual';

function revalidate(config: VisualConfig): ValidationIssue[] {
  const result = validateConfig(config);
  return result.kind === 'invalid' ? result.issues : [];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  config: createDefaultConfig(INITIAL_NAME, 'bar'),
  issues: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const stored = loadProject();
    set(stored ? { config: stored, issues: revalidate(stored), hydrated: true } : { hydrated: true });
  },

  mutate: (recipe) => {
    const draft = structuredClone(get().config);
    recipe(draft);
    const issues = revalidate(draft);
    set({ config: draft, issues });
    saveProjectDebounced(draft);
  },

  setChartType: (type) => {
    const next = withChartType(get().config, type);
    set({ config: next, issues: revalidate(next) });
    saveProjectDebounced(next);
  },

  rename: (name) => {
    get().mutate((draft) => {
      draft.project.name = name;
    });
  },

  newProject: (name) => {
    // Projeto novo => identidade nova (RN-01). E por isso que `createDefaultConfig`
    // gera o id aqui e nao no momento do export.
    const config = createDefaultConfig(name, get().config.chartType);
    set({ config, issues: revalidate(config) });
    saveProjectDebounced(config);
  },

  importConfig: (raw) => {
    const result = validateConfig(raw);
    if (result.kind === 'invalid') return { ok: false, issues: result.issues };
    set({ config: result.config, issues: [] });
    saveProjectDebounced(result.config);
    return { ok: true };
  },

  markExported: () => {
    // RF-10: reexportar o MESMO projeto reusa o GUID e so incrementa a versao,
    // para que o import no Power BI atualize o visual em vez de duplica-lo.
    get().mutate((draft) => {
      draft.project.packageVersion = bumpPackageVersion(draft.project.packageVersion);
    });
  },
}));

/** Seletor de conveniencia: o export so e permitido com config valida (RN-03). */
export const selectCanExport = (s: EditorState): boolean =>
  s.issues.length === 0 && s.config.project.name.trim().length >= 3;
