// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useEditorStore } from '@/store/useEditorStore';
import { useUiStore } from '@/store/useUiStore';

/** A fronteira entre os atalhos do documento e o menu de contexto aberto. */

const store = () => useEditorStore.getState();

function Harness() {
  useEditorShortcuts();
  return null;
}

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
});

let host: HTMLElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  store().newProject('Projeto de teste');
  useUiStore.setState({ menuOpen: false });

  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<Harness />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const press = (key: string): void => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

describe('atalhos com o menu de contexto aberto', () => {
  it('Delete apaga quando nao ha menu', () => {
    store().addNode('text');
    press('Delete');
    expect(store().spec.root.children).toEqual([]);
  });

  it('Delete NAO apaga com o menu aberto — senao apagaria duas vezes', () => {
    store().addNode('text');
    useUiStore.setState({ menuOpen: true });

    press('Delete');
    expect(store().spec.root.children).toHaveLength(1);
  });

  it('Esc NAO limpa a selecao com o menu aberto — a tecla e do menu', () => {
    store().addNode('text');
    const texto = store().selectedIds[0] ?? '';
    useUiStore.setState({ menuOpen: true });

    press('Escape');
    expect(store().selectedIds).toEqual([texto]);
  });

  it('fechado o menu, o Esc volta a limpar a selecao', () => {
    store().addNode('text');
    useUiStore.setState({ menuOpen: false });

    press('Escape');
    expect(store().selectedIds).toEqual([]);
  });
});
