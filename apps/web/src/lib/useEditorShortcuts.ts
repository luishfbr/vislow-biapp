'use client';

import { useEffect } from 'react';
import { isTypingTarget, matchShortcut, matchToolShortcut } from '@/lib/shortcuts';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Liga os atalhos do editor ao documento.
 *
 * No DOCUMENTO, e nao no canvas: apagar o componente selecionado precisa
 * funcionar com o foco na arvore, no painel de propriedades ou em lugar nenhum
 * — que e o caso mais comum, logo depois de um arrasto com o mouse.
 *
 * As acoes sao lidas do store por `getState()` dentro do handler, e nao por
 * seletor: assinar cada uma re-registaria o listener a cada render sem ganho, e
 * as acoes do zustand sao estaveis por construcao.
 */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = matchShortcut(event);

      // A ferramenta so e consultada quando a tecla nao ja era outra coisa. Hoje
      // nao ha colisao — as ferramentas sao letras nuas e o resto pede
      // modificador —, mas a ordem deixa isso explicito em vez de acidental.
      if (!action) {
        // `Escape` e a UNICA que vale com o foco num campo — e la ela ja tem
        // dono: reverte o rascunho do proprio campo. As ferramentas, com mais
        // razao ainda: digitar "Barras" no nome do projeto nao pode armar sete
        // ferramentas pelo caminho.
        if (isTypingTarget(event.target)) return;

        const tool = matchToolShortcut(event);
        if (!tool) return;
        useEditorStore.getState().armPalette(tool === 'select' ? null : tool);
        event.preventDefault();
        return;
      }

      if (isTypingTarget(event.target)) return;

      const store = useEditorStore.getState();
      switch (action) {
        case 'deselect':
          // Desarma a paleta ANTES de mexer na selecao: com um tipo armado, Esc
          // quer dizer "cancela o que eu ia criar", e nao "esquece o que esta
          // selecionado" — cancelar as duas coisas de uma vez faria a tecla
          // cobrar por um engano que o usuario nao cometeu.
          if (store.paletteKind !== null) {
            store.armPalette(null);
            break;
          }
          // Com algo selecionado, Esc limpa a selecao. Sem nada selecionado, ele
          // SOBE um nivel — a mesma tecla desfaz os dois graus de "estou aqui
          // dentro", do mais raso para o mais fundo, e nao ha atalho novo para
          // aprender.
          if (store.selectedId !== null) {
            store.select(null);
            break;
          }
          store.exitContainer();
          break;
        case 'delete':
          store.removeSelected();
          break;
        case 'duplicate':
          store.duplicateNode();
          break;
        case 'bringForward':
          store.moveSelected(1);
          break;
        case 'sendBackward':
          store.moveSelected(-1);
          break;
        case 'undo':
          store.undo();
          break;
        case 'redo':
          store.redo();
          break;
      }

      // Depois de agir, e nao antes: uma tecla que nao virou acao continua sendo
      // do navegador. Ctrl+D e favorito, e Backspace e voltar uma pagina.
      event.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
