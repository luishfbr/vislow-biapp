// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildPhase } from '@/lib/buildApi';
import { BuildProgressDialog } from './BuildProgressDialog';

/**
 * O bloqueio da tela durante a compilacao.
 *
 * Este arquivo existe porque a guarda desta feature e negativa: o que ela faz e
 * IMPEDIR o fechamento, e uma guarda que nunca foi vista mordendo nao esta
 * verificada. Um `onCancel` que esquecesse o `preventDefault` fecharia o dialogo
 * no Esc sem erro nenhum — e o usuario voltaria a editar uma composicao que ja
 * subiu, recebendo um pacote que nao corresponde ao que ve na tela.
 *
 * O jsdom conhece o `<dialog>` mas nao implementa o modal — nao ha top layer nem
 * retencao de foco. O harness e o mesmo do `AddComponentDialog.test.tsx`: equipar
 * o minimo, para que a coisa testada continue sendo a coisa entregue.
 */

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new window.Event('close'));
  };
  // O jsdom tambem nao tem `matchMedia`. Sem preferencia por movimento reduzido:
  // o caminho testado e o normal, com transicao.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

beforeEach(() => {
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

function render(phase: BuildPhase, onClose: () => void = () => undefined): void {
  act(() => {
    root.render(
      <BuildProgressDialog
        phase={phase}
        fileName="Vendas.pbiviz"
        onRetry={() => undefined}
        onClose={onClose}
      />,
    );
  });
}

const dialog = (): HTMLDialogElement => {
  const node = container.querySelector('dialog');
  expect(node, 'dialogo ausente').not.toBeNull();
  return node!;
};

/** O Esc do navegador chega no `<dialog>` como um evento `cancel` cancelavel. */
function pressEscape(): boolean {
  const event = new window.Event('cancel', { cancelable: true });
  act(() => {
    dialog().dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe('enquanto a build roda', () => {
  it('abre sozinho e nao oferece saida nenhuma', () => {
    render({ kind: 'running', step: 'compiling' });

    expect(dialog().hasAttribute('open')).toBe(true);
    // Nenhum botao: nao ha "cancelar", porque o servidor compilaria do mesmo
    // jeito e a tela liberada convidaria a editar o que ja subiu.
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('recusa o Esc', () => {
    const onClose = vi.fn();
    render({ kind: 'running', step: 'compiling' }, onClose);

    expect(pressEscape()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignora o clique no backdrop', () => {
    const onClose = vi.fn();
    render({ kind: 'running', step: 'compiling' }, onClose);

    // Clique no backdrop: o alvo e o proprio `<dialog>`, porque o conteudo o
    // cobre inteiro. E o gesto que fecha os outros dialogos do editor.
    act(() => {
      dialog().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mostra a etapa do servidor e uma barra que reflete o avanco', () => {
    render({ kind: 'running', step: 'validating' });
    const bar = container.querySelector('[role="progressbar"]');
    const inicio = Number(bar?.getAttribute('aria-valuenow'));
    expect(container.textContent).toContain('Conferindo a composição');
    expect(container.textContent).toContain('etapa 1 de 5');

    render({ kind: 'running', step: 'compiling' });
    const depois = Number(
      container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    );
    expect(container.textContent).toContain('Compilando o pacote');
    expect(depois).toBeGreaterThan(inicio);
  });

  it('diz quantos estao na fila na frente', () => {
    render({ kind: 'queued', position: 2 });
    expect(container.textContent).toContain('2 builds na sua frente');
  });
});

describe('quando termina', () => {
  it('o erro vira o conteudo do dialogo, com saida e nova tentativa', () => {
    const onClose = vi.fn();
    render(
      { kind: 'error', message: 'A compilacao do visual falhou.', hint: 'veja o log', issues: [] },
      onClose,
    );

    expect(container.textContent).toContain('A compilacao do visual falhou.');
    expect(container.textContent).toContain('veja o log');

    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('Tentar de novo');
    expect(labels).toContain('Fechar');

    // Terminou: agora ha o que decidir, e o Esc volta a valer.
    expect(pressEscape()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('o sucesso enche a barra e emenda nas instrucoes de importacao', () => {
    vi.useFakeTimers();
    render({
      kind: 'done',
      fileName: 'Vendas.pbiviz',
      metrics: { packageBytes: 226_406, jsBytes: 769_331, durationMs: 11_800 },
    });

    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '100',
    );
    expect(container.textContent).toContain('221 KB');

    act(() => {
      vi.runAllTimers();
    });
    expect(container.textContent).toContain('Importar um visual de um arquivo');
    vi.useRealTimers();
  });

  it('some da tela quando volta para idle', () => {
    render({ kind: 'running', step: 'compiling' });
    render({ kind: 'idle' });
    expect(dialog().hasAttribute('open')).toBe(false);
  });
});
