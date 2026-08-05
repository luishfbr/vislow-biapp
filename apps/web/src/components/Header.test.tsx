// @vitest-environment jsdom
import { createEmptySpec } from '@vislow/component-registry';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { Header } from './Header';

/**
 * O campo do nome agora e um formulario (react-hook-form + zod) sobre um valor
 * que NAO e dele: a fonte continua sendo a store.
 *
 * Esse arranjo tem tres modos de falhar em silencio, e sao os tres que estao
 * aqui. (1) A mensagem nao aparece, e o usuario fica com o export desabilitado
 * sem saber por que. (2) O valor digitado nao chega na store, e o pacote sai com
 * o nome errado. (3) O campo nao ressincroniza quando a spec troca por fora, e a
 * tela passa a mostrar o nome de um projeto que nao esta mais aberto.
 *
 * O `projectNameSchema` isolado nao pega nenhum dos tres: os tres sao a ligacao
 * entre o formulario e a store.
 */

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
  // O `next-themes` e os popups do Base UI consultam `matchMedia`, que o jsdom
  // nao implementa. Sem o stub, o Header nao monta e os quatro testes falham por
  // um motivo que nao tem nada a ver com o que eles verificam.
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

/**
 * O `zodResolver` e ASSINCRONO: a validacao resolve numa microtarefa, e o
 * `formState.errors` so existe depois dela. Drenar a fila dentro do `act` e o
 * que faz a assertiva ler a mensagem em vez de ler o quadro anterior.
 */
const drainValidation = (): Promise<void> => Promise.resolve();

beforeEach(() => {
  const spec = createEmptySpec('Painel de vendas');
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

async function render(): Promise<void> {
  await act(async () => {
    root.render(<Header />);
    await drainValidation();
  });
}

function nameInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('#visual-name');
  expect(input, 'campo do nome ausente').not.toBeNull();
  return input!;
}

/**
 * Atribuir `input.value` direto NAO dispara o `onChange` do React: ele compara
 * com o valor que rastreia e conclui que nada mudou. `Reflect.set` com receptor
 * chama o setter nativo do prototipo com o elemento como `this`, e e isso que
 * faz o rastreador perceber a escrita. Mesma tecnica do `AddComponentDialog`.
 */
async function type(text: string): Promise<void> {
  const input = nameInput();
  await act(async () => {
    Reflect.set(HTMLInputElement.prototype, 'value', text, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await drainValidation();
  });
}

function errorText(): string {
  return container.querySelector('#visual-name-error')?.textContent ?? '';
}

describe('Header', () => {
  it('mostra a mensagem de minimo e marca o campo como invalido', async () => {
    await render();
    await type('ab');

    expect(errorText()).toContain('Minimo de 3');
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    // A mensagem so e util se o campo apontar para ela: sem o
    // `aria-describedby` o leitor de tela anuncia "invalido" e mais nada.
    expect(nameInput().getAttribute('aria-describedby')).toBe('visual-name-error');
  });

  it('reprova um nome que so tem espaco', async () => {
    await render();
    await type('   ');

    // O JSON Schema aprovaria: sao tres caracteres. Quem reprova e o zod, que
    // mede o valor aparado — o mesmo criterio do `selectCanExport`. Sem isto o
    // export ficava travado e nada na tela dizia por que.
    expect(errorText()).toContain('Minimo de 3');
  });

  it('escreve na store mesmo com o valor invalido', async () => {
    await render();
    await type('ab');

    // Invalido tem de chegar la: quem barra o export e o `validateSpec` sobre a
    // spec (RN-03), e ele so barra o que enxerga. Guardar o valor ruim so no
    // formulario deixaria o botao de export ativo com um nome que a API recusa.
    expect(useEditorStore.getState().spec.project.name).toBe('ab');
    expect(useEditorStore.getState().issues.length).toBeGreaterThan(0);
  });

  it('ressincroniza o campo quando a spec troca por fora', async () => {
    await render();
    await type('rascunho');
    expect(nameInput().value).toBe('rascunho');

    // Nem "Novo projeto" nem "Importar projeto (.json)" passam pelo formulario.
    // Sem o `reset`, o campo continuaria mostrando "rascunho" com outro projeto
    // aberto na store — e o usuario exportaria achando que e este.
    await act(async () => {
      useEditorStore.getState().newProject('Outro painel');
      await drainValidation();
    });

    expect(nameInput().value).toBe('Outro painel');
    expect(errorText()).toBe('');
  });
});
