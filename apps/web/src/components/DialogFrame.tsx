'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A moldura dos dialogos do editor.
 *
 * CONTINUA SENDO `<dialog>` NATIVO. Esc, clique no backdrop, retencao de foco e
 * camada superior vem do navegador, sem dependencia — e o `BuildProgressDialog`
 * recusa Esc e backdrop enquanto compila, comportamento documentado e com teste
 * negativo proprio. Trocar por um `Dialog` de biblioteca seria reescrever isso.
 *
 * O que estava errado nao era o `<dialog>`, era a AUSENCIA DE MOLDURA: os quatro
 * dialogos tinham quatro larguras (`30rem`, `30rem`, `32rem`, `64rem`), TRES
 * formulas de folga diferentes, e so dois dos quatro tinham teto de altura — os
 * outros dois transbordavam numa janela baixa sem nada para rolar.
 *
 * Aqui a largura vira um TAMANHO NOMEADO e o teto de altura e obrigatorio,
 * porque nao existe caso em que um dialogo deva poder ficar mais alto que a
 * janela.
 */

const SIZES = {
  /** Confirmacao e aviso: uma pergunta e dois botoes. */
  sm: 'w-[26rem]',
  /** O padrao — instrucoes, progresso, busca. */
  md: 'w-[32rem]',
  /** A planilha. Larga porque a tabela e o conteudo. */
  lg: 'w-[64rem]',
} as const;

export type DialogSize = keyof typeof SIZES;

export interface DialogFrameProps {
  open: boolean;
  /** Chamado quando o navegador fecha o dialogo — por Esc, backdrop ou `close()`. */
  onClose: () => void;
  /** `id` do titulo, para o `aria-labelledby`. */
  labelledBy: string;
  size?: DialogSize;
  /**
   * Recusa Esc e clique no backdrop. Existe para o dialogo de compilacao: a spec
   * ja subiu, e liberar a tela convidaria a editar uma composicao que nao
   * corresponde ao pacote que esta sendo gerado.
   */
  locked?: boolean;
  className?: string;
  children: ReactNode;
}

export function DialogFrame({
  open,
  onClose,
  labelledBy,
  size = 'md',
  locked = false,
  className,
  children,
}: DialogFrameProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={(event) => {
        // `cancel` e o Esc. `preventDefault` e o que o recusa.
        if (locked) event.preventDefault();
      }}
      onClick={(event) => {
        // Clique no BACKDROP: o alvo e o proprio `<dialog>`, porque o conteudo o
        // cobre inteiro. Clique no conteudo tem outro alvo e nao chega aqui.
        if (!locked && event.target === dialog.current) onClose();
      }}
      className={cn(
        'm-auto rounded-lg bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50',
        // Teto de altura para TODOS, com rolagem propria: um dialogo mais alto
        // que a janela esconde os proprios botoes, e o backdrop nao rola.
        'max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain',
        // Uma unica formula de folga lateral, em vez das tres que havia.
        'max-w-[calc(100vw-2rem)]',
        SIZES[size],
        className,
      )}
    >
      {children}
    </dialog>
  );
}

/** Cabecalho padrao: titulo e, quando houver, uma linha de contexto. */
export function DialogHeader({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-border px-5 py-4">
      <h2 id={id} className="text-title font-semibold">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Rodape padrao: acoes a direita, na ordem "sair" depois "seguir". */
export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{children}</div>
  );
}
