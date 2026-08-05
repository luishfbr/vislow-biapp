// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasOverlay, type OverlayChild } from './CanvasOverlay';

/**
 * A camada de manipulacao, do lado do DOM.
 *
 * A matematica esta em `lib/canvasGeometry.test.ts`, sem React. Aqui fica o que
 * so o DOM responde: quem recebe foco, o que cada alca anuncia e se o teclado
 * chega ate a acao. O gesto de ponteiro NAO e testado — jsdom nao implementa
 * captura de ponteiro, e um teste que o simulasse estaria conferindo o proprio
 * dublê. Esse caminho e do teste manual.
 */

const CHILDREN: OverlayChild[] = [
  { id: 'kpi-1', rect: { x: 10, y: 10, w: 20, h: 20 }, label: 'KPI' },
  { id: 'barras-1', rect: { x: 50, y: 50, w: 40, h: 40 }, label: 'Barras' },
];

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
});

let host: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(selectedId: string | null, handlers: Partial<{
  onSelect: (id: string | null) => void;
  onChange: (id: string, rect: { x: number; y: number; w: number; h: number }) => void;
}> = {}): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <CanvasOverlay
        items={CHILDREN}
        selectedId={selectedId}
        onSelect={handlers.onSelect ?? (() => undefined)}
        onChange={handlers.onChange ?? (() => undefined)}
      />,
    );
  });
  return host;
}

function button(dom: HTMLElement, label: string): HTMLButtonElement {
  const found = dom.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);
  if (!found) throw new Error(`nenhum botao rotulado "${label}"`);
  return found;
}

describe('camada de manipulacao', () => {
  it('so o no selecionado tem alcas', () => {
    const dom = render('kpi-1');
    // Oito alcas de redimensionamento, uma superficie de arrasto, e o irmao
    // continua sendo apenas um alvo de selecao.
    expect(dom.querySelectorAll('button[aria-label^="Redimensionar"]')).toHaveLength(8);
    expect(dom.querySelectorAll('button[aria-label^="Mover"]')).toHaveLength(1);
    expect(dom.querySelectorAll('button[aria-label^="Selecionar"]')).toHaveLength(1);
  });

  it('cada alca diz qual borda ela move', () => {
    // "Redimensionar" oito vezes nao serve para quem navega por leitor de tela:
    // as oito soam iguais e nao ha como escolher.
    const dom = render('kpi-1');
    const rotulos = [...dom.querySelectorAll('button[aria-label^="Redimensionar"]')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(new Set(rotulos).size).toBe(8);
  });

  it('clicar num irmao seleciona', () => {
    const onSelect = vi.fn();
    const dom = render('kpi-1', { onSelect });
    act(() => {
      button(dom, 'Selecionar Barras').click();
    });
    expect(onSelect).toHaveBeenCalledWith('barras-1');
  });

  /**
   * jsdom nao faz layout: `getBoundingClientRect` devolve zeros, entao o
   * componente nao mede o container e `byKeyboard` cai no passo de reserva de
   * 0,5%. O NUMERO exato do passo em pixel se confere em
   * `canvasGeometry.test.ts`; o que se confere aqui e que a tecla chega ate a
   * acao, e em qual eixo.
   */
  const PASSO_SEM_MEDIDA = 0.5;

  it('a seta move o no selecionado', () => {
    const onChange = vi.fn();
    const dom = render('kpi-1', { onChange });

    act(() => {
      button(dom, 'Mover').dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });

    expect(onChange).toHaveBeenCalledWith(
      'kpi-1',
      expect.objectContaining({ x: 10 + PASSO_SEM_MEDIDA, w: 20 }),
    );
  });

  it('a alca redimensiona pelo teclado sem exigir modificador', () => {
    // Quem chegou na alca pelo Tab ja disse o que quer; pedir Ctrl ali seria
    // pedir duas vezes.
    const onChange = vi.fn();
    const dom = render('kpi-1', { onChange });

    act(() => {
      button(dom, 'Redimensionar pela borda direita').dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });

    expect(onChange).toHaveBeenCalledWith(
      'kpi-1',
      expect.objectContaining({ x: 10, w: 20 + PASSO_SEM_MEDIDA }),
    );
  });

  it('a caixa e desenhada com os percentuais da spec, sem medir nada', () => {
    const dom = render('barras-1');
    const alvo = button(dom, 'Mover').parentElement!;
    expect(alvo.style.left).toBe('50%');
    expect(alvo.style.top).toBe('50%');
    expect(alvo.style.width).toBe('40%');
    expect(alvo.style.height).toBe('40%');
  });

  it('sem selecao, nenhuma caixa tem alcas', () => {
    // `selectedId` nulo e estado de primeira classe: e o que o clique no vazio
    // produz. Antes ele nao existia — a selecao caia na raiz e o painel ficava
    // preso no ultimo no clicado.
    const dom = render(null);
    expect(dom.querySelectorAll('button[aria-label^="Redimensionar"]')).toHaveLength(0);
    expect(dom.querySelectorAll('button[aria-label^="Mover"]')).toHaveLength(0);
    expect(dom.querySelectorAll('button[aria-label^="Selecionar"]')).toHaveLength(2);
  });

  it('o botao do no NAO e trocado ao ser selecionado', () => {
    // E a invariante que faz press-and-drag funcionar num gesto so: o
    // `pointerdown` seleciona E captura o ponteiro, e um elemento que desmonta
    // no mesmo instante leva a captura embora. Comparar a IDENTIDADE do nodo do
    // DOM antes e depois e o unico jeito de provar que ele sobreviveu.
    const dom = render(null);
    const antes = button(dom, 'Selecionar KPI');

    act(() => {
      root?.render(
        <CanvasOverlay
          items={CHILDREN}
          selectedId="kpi-1"
          onSelect={() => undefined}
          onChange={() => undefined}
        />,
      );
    });

    expect(button(dom, 'Mover KPI')).toBe(antes);
  });

  it('a area vazia do canvas nao vira vidro sobre o preview', () => {
    // A raiz precisa deixar o ponteiro passar: se ela capturasse, o canvas
    // inteiro ficaria inerte fora das caixas.
    const dom = render('kpi-1');
    const camada = dom.firstElementChild as HTMLElement;
    expect(camada.style.pointerEvents).toBe('none');
  });
});
