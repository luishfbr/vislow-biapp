// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NodeContextMenu } from './NodeContextMenu';
import { useEditorStore } from '@/store/useEditorStore';
import { useUiStore } from '@/store/useUiStore';

/** O menu de contexto do no. As bordas — raiz e vazio — estao em docs/frontend.md §2.6. */

const store = () => useEditorStore.getState();

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
  // Popup do Base UI consulta `matchMedia`, que o jsdom nao implementa. Sem o
  // stub o menu nao monta, e a mensagem nao diz o motivo.
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
});

let host: HTMLElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  store().newProject('Projeto de teste');
  useUiStore.setState({ menuOpen: false });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(id: string): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <NodeContextMenu id={id}>
        <button type="button" data-alvo={id}>
          {id}
        </button>
      </NodeContextMenu>,
    );
  });
}

function open(id: string): void {
  const alvo = host?.querySelector(`[data-alvo="${id}"]`);
  act(() => {
    alvo?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }),
    );
  });
}

const item = (): HTMLElement | null => document.querySelector('[data-slot="context-menu-item"]');

describe('menu de contexto do no', () => {
  it('abre com o botao direito e oferece Excluir', () => {
    store().addNode('text');
    const texto = store().selectedIds[0] ?? '';
    render(texto);
    open(texto);

    expect(item()?.textContent).toContain('Excluir');
  });

  it('excluir remove o no', () => {
    store().addNode('text');
    const texto = store().selectedIds[0] ?? '';
    render(texto);
    open(texto);
    act(() => item()?.click());

    expect(store().spec.root.children).toEqual([]);
  });

  it('seleciona ANTES de abrir, quando o no nao estava selecionado', () => {
    // Um menu que aparece sobre um no e apaga outro seria a pior falha possivel aqui.
    store().addNode('text');
    const primeiro = store().selectedIds[0] ?? '';
    store().select(store().spec.root.id);
    store().addNode('text');
    expect(store().selectedIds).not.toEqual([primeiro]);

    render(primeiro);
    open(primeiro);
    expect(store().selectedIds).toEqual([primeiro]);
  });

  it('na raiz o item fica desabilitado, e clicar nao apaga nada', () => {
    // Mesma regra do X do cabecalho da Composicao: uma arvore sem raiz nao e
    // representavel, e `removeNode` recusa.
    store().addNode('text');
    const raiz = store().spec.root.id;
    render(raiz);
    open(raiz);

    expect(item()?.getAttribute('data-disabled')).not.toBeNull();
    act(() => item()?.click());
    expect(store().spec.root.children).toHaveLength(1);
  });

  it('com varios selecionados o rotulo CONTA', () => {
    store().addNode('text');
    store().addNode('text');
    store().selectSiblings();
    const ids = store().selectedIds;
    expect(ids.length).toBe(2);

    render(ids[0] ?? '');
    open(ids[0] ?? '');
    expect(item()?.textContent).toContain('Excluir 2 componentes');
  });

  it('avisa o store do movel enquanto esta aberto', () => {
    // E o que faz o `useEditorShortcuts` sair cedo: sem isso o `Esc` fecharia o
    // menu e limparia a selecao no mesmo toque.
    store().addNode('text');
    const texto = store().selectedIds[0] ?? '';
    render(texto);
    expect(useUiStore.getState().menuOpen).toBe(false);

    open(texto);
    expect(useUiStore.getState().menuOpen).toBe(true);
  });
});
