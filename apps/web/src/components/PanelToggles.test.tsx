// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@/store/useUiStore';
import { PanelToggles } from './PanelToggles';

/**
 * Os controles de mostrar/ocultar coluna.
 *
 * A primeira versao deles flutuava em `absolute` sobre a area de trabalho, e com
 * a coluna ABERTA ficava por cima do conteudo dela — o botao de adicionar
 * componente a esquerda, a primeira linha das propriedades a direita. Ancora-los
 * na borda do canvas so mudaria o problema de lugar: na faixa estreita a coluna
 * aberta vira gaveta sobre o canvas.
 *
 * Por isso o teste afirma o POSICIONAMENTO, e nao so o efeito: um controle de
 * vista que precisa de `absolute` para existir esta no lugar errado.
 */

let container: HTMLDivElement;
let root: Root;

const INICIAL = { ...useUiStore.getState() };

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
  useUiStore.setState(INICIAL, true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(<PanelToggles />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

const botao = (rotulo: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);

describe('posicionamento', () => {
  it('nao flutua: nenhum controle e posicionado por absolute', () => {
    for (const node of container.querySelectorAll('*')) {
      expect(node.className, `"${node.className}" posiciona por absolute`).not.toContain('absolute');
    }
  });

  it('nao empilha sobre nada: nenhum z-index', () => {
    for (const node of container.querySelectorAll('*')) {
      expect(node.className).not.toContain('z-');
    }
  });
});

describe('o rotulo conta o que o clique vai fazer', () => {
  it('com a coluna a vista, oferece ocultar', () => {
    expect(botao('Ocultar a coluna da esquerda')).not.toBeNull();
    expect(botao('Ocultar a coluna da direita')).not.toBeNull();
  });

  it('com a coluna recolhida, oferece mostrar', () => {
    act(() => {
      useUiStore.getState().toggleLeft();
    });
    expect(botao('Mostrar a coluna da esquerda')).not.toBeNull();
    // A da direita nao se mexeu.
    expect(botao('Ocultar a coluna da direita')).not.toBeNull();
  });

  /**
   * `aria-pressed` conta o ESTADO (a coluna esta a vista), e nao a acao. Os dois
   * juntos sao o que faz um leitor de tela anunciar "Ocultar a coluna da
   * esquerda, pressionado" — que e a leitura correta de uma alternancia.
   */
  it('marca aria-pressed quando a coluna esta a vista', () => {
    expect(botao('Ocultar a coluna da esquerda')?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      useUiStore.getState().toggleLeft();
    });
    expect(botao('Mostrar a coluna da esquerda')?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('o clique alterna a coluna certa', () => {
  it('a esquerda recolhe so a esquerda', () => {
    act(() => {
      botao('Ocultar a coluna da esquerda')!.click();
    });
    expect(useUiStore.getState().leftCollapsed).toBe(true);
    expect(useUiStore.getState().rightCollapsed).toBe(false);
  });

  it('a direita recolhe so a direita', () => {
    act(() => {
      botao('Ocultar a coluna da direita')!.click();
    });
    expect(useUiStore.getState().rightCollapsed).toBe(true);
    expect(useUiStore.getState().leftCollapsed).toBe(false);
  });
});
