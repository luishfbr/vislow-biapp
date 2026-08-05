// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { ProjectMenu } from './ProjectMenu';

/**
 * A guarda negativa deste sprint.
 *
 * `newProject` e `importSpec` zeram `past` e `future`: depois delas nao existe
 * `Ctrl+Z` que traga o projeto de volta. Ate 2026-08-04 as duas disparavam
 * DIRETO de um item de menu de tres linhas — um clique errado apagava a
 * composicao inteira em silencio.
 *
 * O risco que este arquivo protege nao e o dialogo sumir: e alguem religar o
 * `onClick` na acao do store "porque o dialogo atrapalha o fluxo". Por isso o
 * teste afirma o NAO-EFEITO, e nao a presenca do dialogo.
 */

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
  // O jsdom conhece o `<dialog>` mas nao implementa o modal.
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
  // Os popups do Base UI consultam `matchMedia`, que o jsdom nao implementa.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

beforeEach(() => {
  useEditorStore.getState().newProject('Painel original');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(<ProjectMenu />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/**
 * O menu vive num portal, entao a busca e no documento e nao no container.
 *
 * E ela IGNORA o que esta dentro de um `<dialog>` fechado: o `ConfirmDialog`
 * monta o elemento sempre, aberto ou nao, e sem este filtro o teste encontraria
 * o botao "Cancelar" de um dialogo que ninguem abriu — passando por engano
 * exatamente onde deveria reprovar.
 */
const porTexto = (texto: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find((node) => {
    if (node.textContent.trim() !== texto) return false;
    const dialogo = node.closest('dialog');
    return dialogo === null || dialogo.hasAttribute('open');
  }) ?? null;

function abrirMenu(): void {
  const gatilho = container.querySelector<HTMLButtonElement>('button[aria-label="Ações do projeto"]');
  expect(gatilho, 'gatilho do menu ausente').not.toBeNull();
  act(() => {
    gatilho!.click();
  });
}

describe('novo projeto', () => {
  it('NAO apaga nada ao escolher o item — so pergunta', () => {
    const antes = useEditorStore.getState().spec.project.id;
    abrirMenu();
    const item = porTexto('Novo projeto');
    expect(item, 'item "Novo projeto" ausente').not.toBeNull();
    act(() => {
      item!.click();
    });

    // O projeto continua o mesmo: o item abriu uma pergunta, nao executou.
    expect(useEditorStore.getState().spec.project.id).toBe(antes);
    expect(porTexto('Descartar e começar')).not.toBeNull();
  });

  it('apaga so depois da confirmacao', () => {
    const antes = useEditorStore.getState().spec.project.id;
    abrirMenu();
    act(() => {
      porTexto('Novo projeto')!.click();
    });
    act(() => {
      porTexto('Descartar e começar')!.click();
    });
    expect(useEditorStore.getState().spec.project.id).not.toBe(antes);
  });

  it('cancelar deixa o projeto intacto', () => {
    const antes = useEditorStore.getState().spec.project.id;
    abrirMenu();
    act(() => {
      porTexto('Novo projeto')!.click();
    });
    act(() => {
      porTexto('Cancelar')!.click();
    });
    expect(useEditorStore.getState().spec.project.id).toBe(antes);
    expect(porTexto('Descartar e começar')).toBeNull();
  });
});

describe('exportar o projeto', () => {
  /**
   * Exportar nao destroi nada, entao NAO pergunta. Uma confirmacao aqui seria a
   * que ensina a clicar em "sim" sem ler — e a que faz a confirmacao do "Novo
   * projeto" deixar de proteger.
   */
  it('nao pede confirmacao', () => {
    abrirMenu();
    const item = porTexto('Exportar projeto (.json)');
    expect(item).not.toBeNull();
    expect(porTexto('Cancelar')).toBeNull();
  });
});
