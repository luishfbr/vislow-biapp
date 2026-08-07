// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SpecPreview } from './SpecPreview';
import { StackHandles } from './StackHandles';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Quando a alca aparece e quando ela se cala. Sem layout no jsdom a caixa sai
 * zerada: afirma-se PRESENCA, nunca posicao — e gesto de ponteiro nao se testa.
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

/** Monta o preview e a alca no MESMO elemento: e ele que faz o papel da prancheta. */
function render(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  const board = host;
  root = createRoot(board);

  act(() => {
    root?.render(
      <>
        <SpecPreview spec={store().spec} />
        <StackHandles artboard={board} scale={1} />
      </>,
    );
  });
  return board;
}

const frame = (dom: HTMLElement): Element | null => dom.querySelector('.border-dashed');

/** Raiz empilhando, com um texto dentro, e o texto selecionado. */
function filhoDeStack(): void {
  store().setProp(store().spec.root.id, 'placement', 'stack');
  store().addNode('text');
}

describe('alca do filho de um container que empilha', () => {
  it('desenha moldura, selo e as oito alcas', () => {
    filhoDeStack();
    const dom = render();

    expect(frame(dom)).not.toBeNull();
    expect(dom.textContent).toContain('Arrastar torna livre');
    expect(dom.querySelectorAll('[style*="resize"]')).toHaveLength(8);
  });

  it('some quando o pai passa a posicionar — ali quem manda e o CanvasOverlay', () => {
    filhoDeStack();
    store().setProp(store().spec.root.id, 'placement', 'canvas');
    const dom = render();

    expect(frame(dom)).toBeNull();
    expect(dom.textContent).not.toContain('Arrastar torna livre');
  });

  it('nao aparece sem selecao', () => {
    filhoDeStack();
    store().select(null);
    const dom = render();

    expect(frame(dom)).toBeNull();
  });

  it('nao aparece com varios selecionados — converter mexeria em irmaos de uma vez', () => {
    filhoDeStack();
    store().addNode('text');
    store().selectSiblings();
    expect(store().selectedIds.length).toBeGreaterThan(1);

    expect(frame(render())).toBeNull();
  });

  it('cala-se com ferramenta armada — ali o gesto e desenhar', () => {
    // Sem isto a alca rouba o ponteiro e o retangulo nunca comeca a ser desenhado.
    filhoDeStack();
    store().armPalette('text');

    expect(frame(render())).toBeNull();
  });

  it('a marca inteira e decorativa: o caminho com foco e o botao do painel', () => {
    // Uma alca focavel converteria o pai e desmontaria a si mesma, deixando o
    // foco em lugar nenhum. Quem carrega rotulo e o "Posicionar livremente".
    filhoDeStack();
    const dom = render();

    expect(dom.querySelectorAll('button')).toHaveLength(0);
    for (const mark of dom.querySelectorAll('[style*="resize"]')) {
      expect(mark.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
