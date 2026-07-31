// @vitest-environment jsdom
import { createEmptySpec } from '@vislow/component-registry';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { AddComponentDialog } from './AddComponentDialog';

/**
 * O dialogo de componentes MONTA e responde ao teclado — nao so compila.
 *
 * O que se testa aqui e o caminho que substituiu a paleta: digitar filtra,
 * Enter adiciona o item destacado, e o que entra na arvore e o tipo certo. Um
 * typecheck nao percebe um `activeIndex` que aponta para a lista errada depois
 * do filtro; o usuario percebe na hora, adicionando o componente errado.
 *
 * `searchComponents` tem teste proprio, sem DOM (`lib/componentSearch.test.ts`).
 * Aqui e a ligacao entre ela, o destaque e o `addNode`.
 */

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
  // O jsdom conhece o `<dialog>` mas nao implementa o modal: nao ha top layer
  // nem retencao de foco para simular. Equipar o harness (mesma tecnica do
  // `SpecPreview.test.tsx` com o `ResizeObserver`) e melhor do que trocar o
  // `<dialog>` nativo por uma div so para o teste — a coisa testada deixaria de
  // ser a coisa entregue.
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
  // Sem layout tambem nao ha rolagem; sem este stub, mover o destaque lanca.
  window.HTMLElement.prototype.scrollIntoView = function noop() {
    /* nao ha rolagem sem layout */
  };
});

beforeEach(() => {
  // Projeto limpo por teste: o store e um singleton, e uma arvore herdada do
  // teste anterior tornaria a assertiva sobre "o que foi adicionado" ambigua.
  const spec = createEmptySpec('Teste');
  useEditorStore.setState({ spec, selectedId: spec.root.id, issues: [], hydrated: true });

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(onClose: () => void = () => undefined): void {
  act(() => {
    root.render(<AddComponentDialog open onClose={onClose} />);
  });
}

function search(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[role="combobox"]');
  expect(input, 'campo de busca ausente').not.toBeNull();
  return input!;
}

function type(text: string): void {
  const input = search();
  act(() => {
    // Atribuir `input.value` direto NAO dispara o `onChange` do React: ele
    // compara com o valor que rastreia internamente e conclui que nada mudou.
    // `Reflect.set` com receptor chama o setter nativo do prototipo com o
    // elemento como `this`, que e o que faz o rastreador perceber a escrita.
    Reflect.set(HTMLInputElement.prototype, 'value', text, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(key: string): void {
  act(() => {
    search().dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function options(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
}

function highlighted(): string {
  const active = options().find((option) => option.getAttribute('aria-selected') === 'true');
  return active?.textContent ?? '';
}

function childKinds(): string[] {
  return (useEditorStore.getState().spec.root.children ?? []).map((child) => child.kind);
}

describe('dialogo de componentes', () => {
  it('abre mostrando o catalogo inteiro', () => {
    render();
    expect(options()).toHaveLength(7);
  });

  it('digitar filtra a lista e o destaque volta para o primeiro resultado', () => {
    render();
    press('ArrowDown');
    type('pizza');

    expect(options()).toHaveLength(1);
    // O destaque nao pode ficar no indice 2 de uma lista que agora tem 1 item.
    expect(highlighted()).toContain('Pizza');
  });

  it('Enter adiciona o componente destacado', () => {
    let closed = false;
    render(() => {
      closed = true;
    });

    type('donut');
    press('Enter');

    expect(childKinds()).toEqual(['pieChart']);
    // Fecha sozinho: manter aberto depois de adicionar esconde o resultado.
    expect(closed).toBe(true);
  });

  it('as setas movem o destaque, e o Enter segue o destaque', () => {
    render();
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');

    // Terceiro do registro: container, text, kpi.
    expect(childKinds()).toEqual(['kpi']);
  });

  it('consulta sem resultado nao oferece nada para adicionar', () => {
    render();
    type('mapa de calor');

    expect(options()).toHaveLength(0);
    press('Enter');
    expect(childKinds()).toEqual([]);
  });

  it('o rodape diz onde o componente vai cair, conforme a selecao', () => {
    render();
    // Raiz selecionada: e um container, entao o no entra DENTRO dela.
    expect(container.textContent).toContain('Entra dentro de Container');
  });
});
