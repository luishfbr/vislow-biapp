'use client';

import { useId } from 'react';
import { DialogFooter, DialogFrame, DialogHeader } from '@/components/DialogFrame';
import { Button } from '@/components/ui/button';

/**
 * A confirmacao que faltava nas acoes que apagam o historico.
 *
 * `newProject` e `importSpec` zeram `past` e `future` — depois delas nao ha
 * `Ctrl+Z` que traga o projeto de volta, e ate 2026-08-04 as duas disparavam
 * direto de um item de menu, sem aviso. Um clique errado num menu de tres itens
 * apagava a composicao inteira em silencio.
 *
 * A regra das Web Interface Guidelines e "confirmacao OU janela de desfazer".
 * Aqui e confirmacao: uma janela de desfazer exigiria guardar a spec anterior
 * fora do historico que a propria acao acabou de limpar, e o botao de desfazer
 * teria de sobreviver a uma tela que mudou inteira.
 *
 * O ROTULO DO BOTAO REPETE O VERBO DA ACAO. "Confirmar" obriga a reler a pergunta
 * para saber o que vai acontecer; "Descartar e comecar" nao.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = true,
  showCancel = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  /** O verbo da acao, nao "Confirmar". */
  confirmLabel: string;
  destructive?: boolean;
  /**
   * `false` deixa so o botao de seguir. E o caso do AVISO: um erro de importacao
   * nao oferece escolha nenhuma — oferecer "Cancelar" ali sugeriria que ha algo a
   * cancelar quando o que houve ja aconteceu.
   */
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  return (
    <DialogFrame open={open} onClose={onCancel} labelledBy={titleId} size="sm">
      <DialogHeader id={titleId} title={title}>
        <p className="mt-1 text-pretty text-body leading-relaxed text-muted-foreground">
          {description}
        </p>
      </DialogHeader>

      <DialogFooter>
        {/* Sair primeiro, seguir depois: a ordem poe a acao de maior consequencia
            onde o polegar chega por ultimo, e o Esc ja resolve o mesmo que o
            "Cancelar". */}
        {showCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button
          size="sm"
          variant={destructive ? 'destructive' : 'default'}
          onClick={onConfirm}
          // O foco NAO comeca aqui: `autoFocus` num botao destrutivo transforma
          // um Enter distraido em perda de trabalho.
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogFrame>
  );
}
