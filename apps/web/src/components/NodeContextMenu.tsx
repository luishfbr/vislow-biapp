'use client';

import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useEditorStore } from '@/store/useEditorStore';
import { useUiStore } from '@/store/useUiStore';

/**
 * Botao direito sobre um no, na prancheta e na arvore. Um item por enquanto; as
 * bordas — a raiz, e o vazio da prancheta — estao em docs/frontend.md §2.6.
 */
export function NodeContextMenu({ id, children }: { id: string; children: ReactNode }) {
  const isRoot = useEditorStore((s) => s.spec.root.id === id);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const select = useEditorStore((s) => s.select);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const setMenuOpen = useUiStore((s) => s.setMenuOpen);

  const count = selectedIds.includes(id) ? selectedIds.length : 1;

  return (
    <ContextMenu
      onOpenChange={(open) => {
        // Selecionar ANTES de abrir: o menu age sobre a selecao, e um menu que
        // aparece sobre um no e apaga outro seria a pior falha possivel aqui.
        // Pelo `hostOf`, isto tambem desce a camada ate o pai do no.
        if (open && !selectedIds.includes(id)) select(id);
        setMenuOpen(open);
      }}
    >
      <ContextMenuTrigger render={<span className="contents" />}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          variant="destructive"
          // A mesma regra do X do cabecalho da Composicao: uma arvore sem raiz
          // nao e representavel, e `removeNode` recusa. SEM `title` — o item
          // desabilitado e `pointer-events-none`, entao a dica nunca apareceria.
          disabled={isRoot}
          onClick={removeSelected}
        >
          <Trash2 />
          {count > 1 ? `Excluir ${String(count)} componentes` : 'Excluir'}
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
