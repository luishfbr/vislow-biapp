// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TreePanel } from './TreePanel';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * A arvore, do lado do DOM. A mira esta em `treeDrop.test.ts` e a operacao em
 * `tree.test.ts`; o gesto de ponteiro nao se testa (ver `CanvasOverlay.test.tsx`).
 */

const store = () => useEditorStore.getState();

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
});

let host: HTMLElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  store().newProject('Projeto de teste');
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<TreePanel />);
  });
  return host;
}

const rowIds = (dom: HTMLElement): (string | null)[] =>
  [...dom.querySelectorAll('[data-row-id]')].map((row) => row.getAttribute('data-row-id'));

function press(dom: HTMLElement, id: string, key: string, ctrl = true): void {
  const row = dom.querySelector(`[data-row-id="${id}"]`);
  act(() => {
    row?.dispatchEvent(
      new KeyboardEvent('keydown', { key, ctrlKey: ctrl, bubbles: true, cancelable: true }),
    );
  });
}

describe('a arvore como lista', () => {
  it('cada no vira uma linha enderecavel, em ordem de desenho', () => {
    // O `data-row-id` nao e so para teste: e por ele que o arrasto le as caixas
    // no `pointerdown`.
    store().addNode('container');
    const painel = store().selectedIds[0] ?? '';
    store().addNode('text');
    const dentro = store().selectedIds[0] ?? '';

    expect(rowIds(render())).toEqual([store().spec.root.id, painel, dentro]);
  });
});

describe('indentar e desindentar pelo teclado', () => {
  /** Raiz com [painel(container), folha]. */
  function arvore(): { painel: string; folha: string } {
    store().addNode('container');
    const painel = store().selectedIds[0] ?? '';
    store().select(store().spec.root.id);
    store().addNode('text');
    return { painel, folha: store().selectedIds[0] ?? '' };
  }

  it('Ctrl+direita move para dentro do irmao de cima', () => {
    // Sem isto, trocar de pai existiria SO no ponteiro — e as setas do cabecalho
    // reordenam entre irmaos, nunca mudam de pai.
    const { painel, folha } = arvore();
    press(render(), folha, 'ArrowRight');

    expect(store().spec.root.children?.map((c) => c.id)).toEqual([painel]);
    expect(store().spec.root.children?.[0]?.children?.map((c) => c.id)).toEqual([folha]);
  });

  it('Ctrl+esquerda devolve para o avo, logo depois do pai', () => {
    const { painel, folha } = arvore();
    const dom = render();
    press(dom, folha, 'ArrowRight');
    press(dom, folha, 'ArrowLeft');

    expect(store().spec.root.children?.map((c) => c.id)).toEqual([painel, folha]);
  });

  it('sem modificador a seta nao move nada', () => {
    // A seta nua e navegacao; roubar a tecla quebraria quem percorre a lista.
    const { painel, folha } = arvore();
    press(render(), folha, 'ArrowRight', false);

    expect(store().spec.root.children?.map((c) => c.id)).toEqual([painel, folha]);
  });

  it('a raiz nao indenta nem desindenta', () => {
    arvore();
    const raiz = store().spec.root.id;
    const antes = store().spec.root;
    const dom = render();

    press(dom, raiz, 'ArrowRight');
    press(dom, raiz, 'ArrowLeft');
    expect(store().spec.root).toBe(antes);
  });
});

describe('o foco sobrevive ao movimento', () => {
  it('depois de Ctrl+seta o foco continua na linha movida', () => {
    // Sem isto o teclado da UM movimento: a linha remonta noutra posicao, o
    // foco cai no `body` e a segunda tecla nao chega a lugar nenhum.
    store().addNode('container');
    store().select(store().spec.root.id);
    store().addNode('text');
    const folha = store().selectedIds[0] ?? '';

    const dom = render();
    act(() => {
      dom.querySelector<HTMLElement>(`[data-row-id="${folha}"]`)?.focus();
    });
    press(dom, folha, 'ArrowRight');

    expect(document.activeElement?.getAttribute('data-row-id')).toBe(folha);
  });
});
