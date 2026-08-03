// @vitest-environment jsdom
import type { Artboard } from '@vislow/component-registry';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArtboardBar } from './ArtboardBar';

/**
 * O trilho da prancheta, do lado do DOM.
 *
 * A matematica da escala esta em `lib/artboard.test.ts`, sem React. Aqui fica o
 * que so o DOM responde: o que cada atalho anuncia, o que o campo faz com uma
 * digitacao impossivel e se o erro chega a quem nao ve a cor da borda.
 */

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

function render(
  artboard: Artboard = { width: 1280, height: 720 },
  scale = 1,
  onChange: (size: Artboard) => void = () => undefined,
): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<ArtboardBar artboard={artboard} scale={scale} onChange={onChange} />);
  });
  return host;
}

function field(dom: HTMLElement, label: string): HTMLInputElement {
  const found = [...dom.querySelectorAll('label')].find((l) => l.textContent === label);
  const input = found?.htmlFor ? dom.querySelector<HTMLInputElement>(`#${found.htmlFor}`) : null;
  if (!input) throw new Error(`nenhum campo rotulado "${label}"`);
  return input;
}

/**
 * Digita no campo.
 *
 * Pelo setter NATIVO, e nao por `input.value = x`: o React troca o setter do
 * elemento por um que atualiza o proprio rastreador de valor, entao a atribuicao
 * direta faz ele concluir que nada mudou e engolir o `onChange`. E o mesmo
 * motivo pelo qual o `fireEvent` das bibliotecas de teste faz isto por dentro.
 */
function type(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  act(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- o `this` e dado no `call`, e e o proprio input
    const setter = descriptor?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/**
 * Tira o foco do campo.
 *
 * `focusout`, e nao `blur`: o React delega no container e `blur` nao borbulha,
 * entao um `new FocusEvent('blur')` nunca chega ao `onBlur` do componente — o
 * teste passaria a conferir o proprio dublê.
 */
function blur(input: HTMLInputElement): void {
  act(() => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

describe('atalhos de tamanho', () => {
  it('o atalho anuncia o tamanho que aplica, e nao so a forma', () => {
    // "4:3" sozinho nao diz se aplica 1440x1080 ou 800x600, e quem usa leitor de
    // tela nao tem o preview para conferir depois.
    const dom = render();
    const labels = [...dom.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('16:9 — 1280 por 720 pixels');
    expect(labels.every((l) => /\d+ por \d+ pixels$/.test(l ?? ''))).toBe(true);
  });

  it('marca como pressionado so o atalho do tamanho exato em uso', () => {
    const dom = render({ width: 1280, height: 720 });
    const pressed = [...dom.querySelectorAll('button')].filter(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.textContent).toBe('16:9');
  });

  it('16:9 num tamanho proprio nao acende o atalho — ele aplica UM tamanho', () => {
    const dom = render({ width: 1920, height: 1080 });
    expect(dom.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0);
  });

  it('aplica o tamanho do atalho', () => {
    const onChange = vi.fn();
    const dom = render({ width: 1280, height: 720 }, 1, onChange);
    const alvo = [...dom.querySelectorAll('button')].find((b) => b.textContent === '1:1');
    act(() => {
      alvo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith({ width: 1080, height: 1080 });
  });
});

describe('campos de tamanho', () => {
  it('prende na faixa em vez de recusar a digitacao', () => {
    // Quem digita 5000 quis "o maior que der". Recusar deixaria o campo com um
    // numero que a prancheta nao tem.
    const onChange = vi.fn();
    const dom = render({ width: 1280, height: 720 }, 1, onChange);
    const largura = field(dom, 'Largura');

    type(largura, '5000');
    blur(largura);

    expect(onChange).toHaveBeenCalledWith({ width: 1920, height: 720 });
    expect(largura.value).toBe('1920');
  });

  it('deixa apagar para redigitar sem reescrever a prancheta a cada tecla', () => {
    // Sem rascunho proprio, o "1" de "1280" viraria 100 pelo piso e o campo
    // ficaria impossivel de editar.
    const onChange = vi.fn();
    const dom = render({ width: 1280, height: 720 }, 1, onChange);
    const largura = field(dom, 'Largura');

    type(largura, '');
    type(largura, '9');
    type(largura, '96');
    type(largura, '960');
    // Nenhum passo intermediario escreveu: "9" e "96" estao abaixo do piso e
    // teriam virado 100, deixando o campo impossivel de terminar de digitar.
    expect(onChange).not.toHaveBeenCalled();

    blur(largura);
    expect(onChange).toHaveBeenCalledWith({ width: 960, height: 720 });
  });

  it('campo vazio volta ao valor atual, sem chamar mudanca', () => {
    const onChange = vi.fn();
    const dom = render({ width: 1280, height: 720 }, 1, onChange);
    const altura = field(dom, 'Altura');

    type(altura, '');
    blur(altura);

    expect(onChange).not.toHaveBeenCalled();
    expect(altura.value).toBe('720');
  });

  it('Escape desiste da digitacao', () => {
    const dom = render({ width: 1280, height: 720 });
    const largura = field(dom, 'Largura');

    type(largura, '400');
    act(() => {
      largura.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(largura.value).toBe('1280');
  });

  it('valor impossivel diz a faixa em texto, nao so na cor da borda', () => {
    const dom = render({ width: 1280, height: 720 });
    const largura = field(dom, 'Largura');

    type(largura, '5000');

    expect(largura.getAttribute('aria-invalid')).toBe('true');
    const live = dom.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Largura entre 100 e 1920 px.');
  });

  it('a faixa fica no campo mesmo sem erro, para quem chega nele pelo teclado', () => {
    const dom = render();
    const altura = field(dom, 'Altura');
    const described = altura.getAttribute('aria-describedby');
    expect(dom.querySelector(`#${String(described)}`)?.textContent).toBe(
      'Altura entre 100 e 1080 px.',
    );
  });
});

describe('leitura da escala', () => {
  it('mostra a escala tambem em 1:1 — pixel real e informacao', () => {
    expect(render({ width: 1280, height: 720 }, 1).textContent).toContain('escala 100%');
  });

  it('mostra a reducao aplicada', () => {
    expect(render({ width: 1920, height: 1080 }, 0.375).textContent).toContain('escala 37%');
  });
});
