/**
 * Atalhos de teclado do editor.
 *
 * O CASAMENTO vive aqui, puro e sem React, pelo mesmo motivo do
 * `canvasGeometry.ts`: e a parte que tem regra de verdade — combinacao de
 * modificadores, e a decisao de nao roubar a tecla de quem esta digitando — e e
 * a parte que jsdom nao ajuda a testar quando esta enterrada num `useEffect`.
 * No hook sobra ligar o evento a acao do store.
 */

import { NODE_DESCRIPTORS, NODE_KINDS, type NodeKind } from '@vislow/component-registry';

export type ShortcutAction =
  | 'deselect'
  | 'delete'
  | 'duplicate'
  | 'bringForward'
  | 'sendBackward'
  | 'undo'
  | 'redo';

/** A tecla da ferramenta de selecao. Nao e um tipo de no, entao nao tem descritor. */
export const SELECT_SHORTCUT = 'V';

/**
 * Tecla nua -> ferramenta. `null` quer dizer "nao e atalho de ferramenta".
 *
 * `'select'` desarma a paleta; um `NodeKind` a arma naquele tipo.
 *
 * O mapa e DERIVADO do catalogo, nunca escrito aqui: um tipo de no novo ganha a
 * tecla no mesmo commit em que passa a existir, e `registry.test.ts` garante que
 * ele nao roubou a de ninguem.
 */
const BY_KEY = new Map<string, NodeKind | 'select'>([
  [SELECT_SHORTCUT, 'select'],
  ...NODE_KINDS.map((kind): [string, NodeKind] => [NODE_DESCRIPTORS[kind].shortcut, kind]),
]);

/**
 * Ferramenta armada por tecla nua, ao estilo de editor de desenho.
 *
 * SEM MODIFICADOR, sempre: `Ctrl+B` e negrito no navegador, `Ctrl+P` e imprimir,
 * e roubar qualquer uma delas custaria mais do que a ferramenta vale. A guarda
 * de quem esta digitando continua sendo do chamador — a mesma divisao que o
 * `matchShortcut` ja usa.
 */
export function matchToolShortcut(chord: KeyChord): NodeKind | 'select' | null {
  if (chord.ctrlKey || chord.metaKey || chord.altKey) return null;
  return BY_KEY.get(chord.key.toUpperCase()) ?? null;
}

/** So o que o evento precisa ter. Deixa o teste escrever um literal. */
export interface KeyChord {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * O foco esta num lugar onde a tecla PERTENCE a quem digita?
 *
 * Sem esta guarda, `Backspace` num campo de texto apagaria o componente
 * selecionado em vez de uma letra, e `d` com Ctrl duplicaria enquanto o usuario
 * tenta editar o nome do projeto. A regra e por elemento, e nao por uma lista de
 * ids: qualquer campo novo passa a estar protegido no dia em que existe.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Qual acao esta tecla dispara — ou `null`, que quer dizer "deixe passar".
 *
 * `Escape` e o unico que vale com o foco dentro de um campo, e por isso ele nao
 * e decidido aqui: quem chama e que aplica o `isTypingTarget`. Assim a excecao
 * fica visivel no hook, em vez de escondida numa condicao composta.
 */
export function matchShortcut(chord: KeyChord): ShortcutAction | null {
  const mod = chord.ctrlKey || chord.metaKey;

  if (chord.key === 'Escape') return 'deselect';
  if (!mod && (chord.key === 'Delete' || chord.key === 'Backspace')) return 'delete';

  if (!mod || chord.altKey) return null;

  // `toLowerCase` porque com Shift o navegador entrega 'D'. O atalho de
  // duplicar nao pede Shift, mas quem segura CapsLock nao deveria descobrir isso.
  if (chord.key.toLowerCase() === 'd' && !chord.shiftKey) return 'duplicate';
  // Ctrl+Shift+Z refaz, e Ctrl+Y tambem — o primeiro e a convencao do Mac e da
  // web, o segundo a do Windows, e quem troca de maquina nao deveria reaprender.
  if (chord.key.toLowerCase() === 'z') return chord.shiftKey ? 'redo' : 'undo';
  if (chord.key.toLowerCase() === 'y' && !chord.shiftKey) return 'redo';
  // Colchetes sao a convencao de ordem de empilhamento em editor de desenho.
  // Ordem no array = ordem de desenho: o ultimo filho fica por cima.
  if (chord.key === ']') return 'bringForward';
  if (chord.key === '[') return 'sendBackward';

  return null;
}
