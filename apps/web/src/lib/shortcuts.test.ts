// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  isTypingTarget,
  matchShortcut,
  matchToolShortcut,
  SELECT_SHORTCUT,
  type KeyChord,
} from './shortcuts';
import { NODE_DESCRIPTORS, NODE_KINDS } from '@vislow/component-registry';

/**
 * Os atalhos do editor.
 *
 * O que se testa aqui e o CASAMENTO, nao o efeito: o efeito e uma acao do store,
 * ja coberta em `useEditorStore.test.ts`. O que quebra em silencio e a tecla —
 * um atalho que rouba `Backspace` de quem esta digitando, ou um que exige um
 * modificador a mais e simplesmente nunca dispara.
 */

const chord = (over: Partial<KeyChord> & { key: string }): KeyChord => ({
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('casamento de atalho', () => {
  it('Escape limpa a selecao', () => {
    expect(matchShortcut(chord({ key: 'Escape' }))).toBe('deselect');
  });

  it('Delete e Backspace apagam', () => {
    expect(matchShortcut(chord({ key: 'Delete' }))).toBe('delete');
    expect(matchShortcut(chord({ key: 'Backspace' }))).toBe('delete');
  });

  it('duplicar aceita Ctrl e Cmd, porque o repo roda nos dois', () => {
    expect(matchShortcut(chord({ key: 'd', ctrlKey: true }))).toBe('duplicate');
    expect(matchShortcut(chord({ key: 'd', metaKey: true }))).toBe('duplicate');
  });

  it('duplicar ignora o CapsLock', () => {
    // Com Shift ou CapsLock o navegador entrega 'D'. Comparar a letra crua
    // faria o atalho parar de funcionar sem nenhum sinal de por que.
    expect(matchShortcut(chord({ key: 'D', ctrlKey: true }))).toBe('duplicate');
  });

  it('os colchetes mudam a ordem de empilhamento', () => {
    expect(matchShortcut(chord({ key: ']', ctrlKey: true }))).toBe('bringForward');
    expect(matchShortcut(chord({ key: '[', ctrlKey: true }))).toBe('sendBackward');
  });

  it('sem o modificador, a letra continua sendo do usuario', () => {
    expect(matchShortcut(chord({ key: 'd' }))).toBeNull();
    expect(matchShortcut(chord({ key: ']' }))).toBeNull();
  });

  it('Alt junto NAO dispara — la mora outro gesto', () => {
    // Alt duplica arrastando, no ponteiro. Deixar Ctrl+Alt+D valer tambem
    // aqui daria dois caminhos para a mesma acao com significados diferentes.
    expect(matchShortcut(chord({ key: 'd', ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('Ctrl+Shift+D nao duplica', () => {
    // Reservado: e onde um "duplicar no lugar" caberia depois, e um atalho que
    // ja responde nao pode ser reaproveitado sem quebrar quem o aprendeu.
    expect(matchShortcut(chord({ key: 'D', ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it('desfazer e refazer, nas duas convencoes', () => {
    // Ctrl+Shift+Z e a convencao do Mac e da web; Ctrl+Y a do Windows. Quem
    // troca de maquina nao deveria reaprender o atalho mais usado do editor.
    expect(matchShortcut(chord({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(matchShortcut(chord({ key: 'z', metaKey: true }))).toBe('undo');
    expect(matchShortcut(chord({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(matchShortcut(chord({ key: 'y', ctrlKey: true }))).toBe('redo');
  });

  it('tecla desconhecida nao vira acao', () => {
    expect(matchShortcut(chord({ key: 'k', ctrlKey: true }))).toBeNull();
  });
});

describe('foco de quem digita', () => {
  it('campo de texto, area de texto e select sao do usuario', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
  });

  it('conteudo editavel tambem', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom nao deriva `isContentEditable` do atributo; o que importa aqui e
    // que a propriedade seja consultada, e nao a lista de tags.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it('um botao nao e', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });

  it('alvo ausente nao e', () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('ferramentas por tecla nua', () => {
  it('cada tipo do catalogo tem a sua, e ela vem do descritor', () => {
    for (const kind of NODE_KINDS) {
      expect(matchToolShortcut(chord({ key: NODE_DESCRIPTORS[kind].shortcut }))).toBe(kind);
    }
  });

  it('a tecla de selecao desarma', () => {
    expect(matchToolShortcut(chord({ key: SELECT_SHORTCUT }))).toBe('select');
  });

  it('aceita minuscula: quem digita nao segura Shift para escolher ferramenta', () => {
    expect(matchToolShortcut(chord({ key: 'b' }))).toBe('barChart');
  });

  /**
   * A guarda mais importante deste bloco. `Ctrl+B` e negrito, `Ctrl+P` e
   * imprimir, `Cmd+T` e aba nova — roubar qualquer uma custaria mais do que a
   * ferramenta vale, e o sintoma seria o navegador "parando de funcionar".
   */
  it('NAO dispara com modificador', () => {
    for (const over of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(matchToolShortcut(chord({ key: 'B', ...over }))).toBeNull();
    }
  });

  it('Shift sozinho nao atrapalha — CapsLock nao pode desligar a barra', () => {
    expect(matchToolShortcut(chord({ key: 'B', shiftKey: true }))).toBe('barChart');
  });

  it('tecla fora do catalogo nao vira ferramenta', () => {
    for (const key of ['Q', 'Z', 'Enter', 'Escape', '1']) {
      expect(matchToolShortcut(chord({ key }))).toBeNull();
    }
  });

  /**
   * As duas familias nao podem se sobrepor: uma tecla que ja e acao nao pode
   * tambem armar ferramenta, senao `Delete` apagaria um no E armaria alguma
   * coisa no mesmo evento.
   */
  it('nenhuma tecla de ferramenta colide com uma acao do editor', () => {
    const teclas = [SELECT_SHORTCUT, ...NODE_KINDS.map((k) => NODE_DESCRIPTORS[k].shortcut)];
    for (const key of teclas) {
      expect(matchShortcut(chord({ key })), `${key} ja e acao`).toBeNull();
    }
  });
});
