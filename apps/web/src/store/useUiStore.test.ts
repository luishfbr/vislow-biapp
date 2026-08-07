// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LEFT, DEFAULT_RIGHT, useUiStore } from './useUiStore';

/**
 * O estado do movel.
 *
 * Duas coisas que este arquivo existe para nao deixar acontecer:
 *
 * 1. **O shell quebrado que nao se conserta.** Um `localStorage` adulterado, ou
 *    escrito por uma versao anterior, nao pode produzir painel de largura
 *    negativa — a tela ficaria sem canvas e sem como voltar pela propria
 *    interface.
 * 2. **Reenquadrar por nada.** O `layoutEpoch` e o que manda o canvas reenquadrar.
 *    Se ele subir sem a forma do shell ter mudado, o zoom do usuario e desfeito
 *    sem que ninguem tenha pedido.
 */

const KEY = 'vislow.ui.v1';

const INICIAL = { ...useUiStore.getState() };

beforeEach(() => {
  window.localStorage.clear();
  useUiStore.setState(INICIAL, true);
});

afterEach(() => {
  window.localStorage.clear();
});

describe('persistencia', () => {
  it('nasce nos padroes quando nao ha nada guardado', () => {
    useUiStore.getState().hydrate();
    expect(useUiStore.getState().leftWidth).toBe(DEFAULT_LEFT);
    expect(useUiStore.getState().rightWidth).toBe(DEFAULT_RIGHT);
    expect(useUiStore.getState().leftCollapsed).toBe(false);
  });

  it('guarda a largura arrastada e a le de volta', () => {
    useUiStore.getState().setLeftWidth(27);
    useUiStore.setState(INICIAL, true);
    useUiStore.getState().hydrate();
    expect(useUiStore.getState().leftWidth).toBe(27);
  });

  it('guarda o recolhimento', () => {
    useUiStore.getState().toggleRight();
    useUiStore.setState(INICIAL, true);
    useUiStore.getState().hydrate();
    expect(useUiStore.getState().rightCollapsed).toBe(true);
  });
});

describe('saneamento do que foi lido', () => {
  it('recusa largura fora da faixa e cai no padrao', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ leftWidth: -40, rightWidth: 999 }));
    useUiStore.getState().hydrate();
    expect(useUiStore.getState().leftWidth).toBe(DEFAULT_LEFT);
    expect(useUiStore.getState().rightWidth).toBe(DEFAULT_RIGHT);
  });

  it('recusa tipo errado sem quebrar', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ leftWidth: 'largo', leftCollapsed: 'sim' }));
    useUiStore.getState().hydrate();
    expect(useUiStore.getState().leftWidth).toBe(DEFAULT_LEFT);
    // Qualquer coisa que nao seja `true` e falso: uma string truthy nao pode
    // recolher um painel.
    expect(useUiStore.getState().leftCollapsed).toBe(false);
  });

  it('sobrevive a JSON invalido', () => {
    window.localStorage.setItem(KEY, '{isto nao e json');
    expect(() => {
      useUiStore.getState().hydrate();
    }).not.toThrow();
    expect(useUiStore.getState().leftWidth).toBe(DEFAULT_LEFT);
  });
});

describe('layoutEpoch: so sobe quando a forma do shell muda', () => {
  it('sobe ao recolher e ao expandir', () => {
    const antes = useUiStore.getState().layoutEpoch;
    useUiStore.getState().toggleLeft();
    expect(useUiStore.getState().layoutEpoch).toBe(antes + 1);
    useUiStore.getState().toggleLeft();
    expect(useUiStore.getState().layoutEpoch).toBe(antes + 2);
  });

  it('NAO sobe ao arrastar um divisor', () => {
    // Arrastar muda a largura, nao a forma: o enquadramento continua valendo, e
    // reenquadrar durante o arrasto faria a prancheta pular sob o ponteiro.
    const antes = useUiStore.getState().layoutEpoch;
    useUiStore.getState().setLeftWidth(25);
    useUiStore.getState().setRightWidth(25);
    useUiStore.getState().setLayersHeight(40);
    expect(useUiStore.getState().layoutEpoch).toBe(antes);
  });

  it('collapseBoth e idempotente — nao sobe com tudo ja recolhido', () => {
    // O chamador e um efeito que roda em toda travessia de breakpoint. Sem esta
    // guarda, cada redimensionamento da janela na faixa estreita desfaria o zoom.
    useUiStore.getState().collapseBoth();
    const depoisDoPrimeiro = useUiStore.getState().layoutEpoch;
    useUiStore.getState().collapseBoth();
    useUiStore.getState().collapseBoth();
    expect(useUiStore.getState().layoutEpoch).toBe(depoisDoPrimeiro);
  });

  it('collapseBoth recolhe as duas de uma vez', () => {
    useUiStore.getState().collapseBoth();
    expect(useUiStore.getState().leftCollapsed).toBe(true);
    expect(useUiStore.getState().rightCollapsed).toBe(true);
  });

  /** O epoch e de sessao: reabrir o editor nao pode contar como mudanca de forma. */
  it('nao e persistido', () => {
    useUiStore.getState().toggleLeft();
    const guardado: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    expect(guardado).not.toHaveProperty('layoutEpoch');
  });
});

describe('menu de contexto aberto', () => {
  it('e transitorio: nao entra no que se guarda', () => {
    // Abrir o editor amanha achando que ha menu aberto travaria os atalhos, que
    // e justamente o que a bandeira existe para fazer enquanto ele esta na tela.
    useUiStore.getState().setMenuOpen(true);
    useUiStore.getState().toggleLeft();

    const guardado: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    expect(guardado).not.toHaveProperty('menuOpen');
    expect(useUiStore.getState().menuOpen).toBe(true);
  });
});
