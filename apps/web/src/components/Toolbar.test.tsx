// @vitest-environment jsdom
import { NODE_DESCRIPTORS, NODE_KINDS } from '@vislow/component-registry';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { Toolbar } from './Toolbar';

/**
 * A barra de ferramentas.
 *
 * O que estes testes protegem nao e o desenho — e a LIGACAO COM O CATALOGO. A
 * barra sai de `NODE_DESCRIPTORS`, e um tipo de no novo tem de aparecer aqui no
 * mesmo commit em que passa a existir. Uma lista escrita a mao passaria neste
 * arquivo e falharia no dia seguinte, em silencio (o achado 53 e exatamente esta
 * familia: capacidade que existe no catalogo e nao chega ao consumidor).
 */

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
  // O jsdom nao implementa `matchMedia`, e os popups do Base UI o consultam.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

beforeEach(() => {
  useEditorStore.getState().armPalette(null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(<Toolbar />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const tools = (): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'),
];

const byLabel = (label: string): HTMLButtonElement => {
  const node = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(node, `ferramenta "${label}" ausente`).not.toBeNull();
  return node!;
};

describe('a barra sai do catalogo', () => {
  it('tem uma ferramenta por tipo de no, mais a de selecao', () => {
    expect(tools()).toHaveLength(NODE_KINDS.length + 1);
  });

  it('rotula cada ferramenta com o label do descritor', () => {
    for (const kind of NODE_KINDS) {
      expect(byLabel(NODE_DESCRIPTORS[kind].label)).toBeTruthy();
    }
  });

  it('anuncia a tecla do descritor, e nao uma escrita aqui', () => {
    for (const kind of NODE_KINDS) {
      const descriptor = NODE_DESCRIPTORS[kind];
      expect(byLabel(descriptor.label).getAttribute('aria-keyshortcuts')).toBe(descriptor.shortcut);
    }
  });
});

describe('armar e desarmar', () => {
  it('clicar arma o tipo no store', () => {
    act(() => {
      byLabel(NODE_DESCRIPTORS.text.label).click();
    });
    expect(useEditorStore.getState().paletteKind).toBe('text');
  });

  it('clicar na ferramenta ja armada volta para selecionar', () => {
    const alvo = NODE_DESCRIPTORS.text.label;
    act(() => {
      byLabel(alvo).click();
    });
    act(() => {
      byLabel(alvo).click();
    });
    expect(useEditorStore.getState().paletteKind).toBeNull();
  });

  it('a ferramenta de selecao desarma o que estiver armado', () => {
    act(() => {
      byLabel(NODE_DESCRIPTORS.text.label).click();
    });
    act(() => {
      byLabel('Selecionar').click();
    });
    expect(useEditorStore.getState().paletteKind).toBeNull();
  });

  /**
   * O estado armado e uma ALTERNANCIA, e nao uma acao. Sem `aria-pressed`, quem
   * usa leitor de tela nao tem como saber qual ferramenta esta ativa — e a barra
   * e so de icones.
   */
  it('marca aria-pressed na ferramenta ativa, e so nela', () => {
    act(() => {
      byLabel(NODE_DESCRIPTORS.text.label).click();
    });
    const marcadas = tools().filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]?.getAttribute('aria-label')).toBe(NODE_DESCRIPTORS.text.label);
  });

  it('sem nada armado, quem esta marcada e a de selecao', () => {
    const marcadas = tools().filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]?.getAttribute('aria-label')).toBe('Selecionar');
  });
});

/**
 * `role="toolbar"` PROMETE um unico ponto de parada no Tab e navegacao por
 * setas. Sem isso, chegar ao campo de nome pelo teclado custaria oito paradas, e
 * a promessa ficaria escrita no atributo e nao no comportamento.
 */
describe('foco em roda', () => {
  const seta = (key: string): void => {
    act(() => {
      container
        .querySelector('[role="toolbar"]')
        ?.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    });
  };

  it('so a ferramenta armada e tabulavel', () => {
    const tabulaveis = tools().filter((b) => b.tabIndex === 0);
    expect(tabulaveis).toHaveLength(1);
    expect(tabulaveis[0]?.getAttribute('aria-label')).toBe('Selecionar');
  });

  it('o ponto de parada acompanha a ferramenta armada', () => {
    act(() => {
      byLabel(NODE_DESCRIPTORS.text.label).click();
    });
    const tabulaveis = tools().filter((b) => b.tabIndex === 0);
    expect(tabulaveis).toHaveLength(1);
    expect(tabulaveis[0]?.getAttribute('aria-label')).toBe(NODE_DESCRIPTORS.text.label);
  });

  it('a seta direita anda para a proxima', () => {
    tools()[0]?.focus();
    seta('ArrowRight');
    expect(document.activeElement).toBe(tools()[1]);
  });

  it('a seta esquerda da primeira circula para a ultima', () => {
    tools()[0]?.focus();
    seta('ArrowLeft');
    expect(document.activeElement).toBe(tools().at(-1));
  });

  it('Home e End vao para as pontas', () => {
    tools()[3]?.focus();
    seta('End');
    expect(document.activeElement).toBe(tools().at(-1));
    seta('Home');
    expect(document.activeElement).toBe(tools()[0]);
  });

  it('tecla que nao e de navegacao nao mexe no foco', () => {
    tools()[2]?.focus();
    seta('ArrowDown');
    expect(document.activeElement).toBe(tools()[2]);
  });
});

