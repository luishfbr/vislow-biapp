'use client';

import { NODE_DESCRIPTORS, acceptsChildren, type NodeKind } from '@vislow/component-registry';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { searchComponents } from '@/lib/componentSearch';
import { selectSelectedNode, useEditorStore } from '@/store/useEditorStore';

/**
 * Adicionar componente (RF-04).
 *
 * Substitui a paleta fixa que ocupava o topo da coluna esquerda. O motivo e de
 * espaco, mas tambem de escala: sete tipos ainda cabiam empilhados, trinta nao —
 * e a lista fixa cresce justamente para baixo, comendo a arvore e os campos, que
 * sao o que a pessoa olha o tempo todo. Aqui a lista custa zero enquanto fechada.
 *
 * Continua GERADA do registro, como a paleta era: os candidatos saem de
 * `searchComponents`, que le `NODE_DESCRIPTORS`.
 *
 * Usa o `<dialog>` nativo, como o `ImportInstructions`: Esc, retencao de foco e
 * backdrop vem de graca, e nao ha biblioteca de modal no projeto.
 */

const OPTION_ID = (kind: NodeKind): string => `add-component-${kind}`;

/**
 * O gatilho, com o atalho que o abre de qualquer lugar do editor.
 *
 * Mora no mesmo arquivo que o dialogo de proposito: o atalho e o botao sao duas
 * portas para a mesma coisa, e separa-los e como perdem a sincronia.
 */
export function AddComponentButton() {
  const [open, setOpen] = useState(false);
  // O rotulo do atalho so pode ser decidido no cliente. Comeca em "Ctrl" e
  // corrige depois de montar — no servidor nao ha plataforma para consultar, e
  // adivinhar aqui seria divergencia de hidratacao.
  const [shortcut, setShortcut] = useState('Ctrl K');

  useEffect(() => {
    if (/Mac|iPhone|iPad/u.test(navigator.userAgent)) setShortcut('⌘K');
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      // O navegador usa Ctrl/⌘+K para a barra de busca; aqui a acao e nossa.
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        aria-haspopup="dialog"
        // O repouso e /5 e o hover e /10: a varredura tinha deixado os dois em
        // /10 e o botao parava de responder ao ponteiro.
        className="flex w-full items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-left text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-4 shrink-0" />
        Adicionar componente
        <kbd className="ml-auto rounded border border-primary/40 px-1 py-0.5 font-mono text-micro font-normal text-primary">
          {shortcut}
        </kbd>
      </button>

      <AddComponentDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

export interface AddComponentDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddComponentDialog({ open, onClose }: AddComponentDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const addNode = useEditorStore((s) => s.addNode);
  const target = useEditorStore(selectSelectedNode);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const results = useMemo(() => searchComponents(query), [query]);
  const activeKind = results[active];

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      // Zerado na ABERTURA, e nao no fechamento: limpar ao fechar deixaria a
      // lista saltar durante a animacao de saida do backdrop.
      setQuery('');
      setActive(0);
      node.showModal();
    }
    if (!open && node.open) node.close();
  }, [open]);

  // A lista mudou embaixo do indice: sem isto, digitar mais uma letra podia
  // deixar o destaque num item que ja nao existe e o Enter nao fazer nada.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Segue o destaque com a rolagem — navegar por seta ate o fim de uma lista
  // longa nao pode empurrar o item para fora da vista.
  useEffect(() => {
    if (!activeKind) return;
    document.getElementById(OPTION_ID(activeKind))?.scrollIntoView({ block: 'nearest' });
  }, [activeKind]);

  const commit = (kind: NodeKind) => {
    addNode(kind);
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((index) => (index + 1) % results.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => (index - 1 + results.length) % results.length);
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(results.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (activeKind) commit(activeKind);
        break;
      default:
        break;
    }
  };

  // A MESMA regra de `addNode`, dita em portugues: dentro da selecao quando ela
  // aceita filhos, senao logo depois dela. Sem selecao, a regra e a mesma
  // aplicada a raiz — e e isso que a frase precisa dizer, em vez de sumir.
  const destination = !target
    ? 'Entra na prancheta'
    : acceptsChildren(target)
      ? `Entra dentro de ${NODE_DESCRIPTORS[target.kind].label}`
      : `Entra logo depois de ${NODE_DESCRIPTORS[target.kind].label}`;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        // Clique no backdrop: o alvo e o proprio <dialog>, porque o conteudo
        // esta dentro de um filho. O nativo nao fecha sozinho.
        if (event.target === dialog.current) onClose();
      }}
      aria-labelledby="add-component-title"
      className="m-auto w-[30rem] max-w-[calc(100vw-2rem)] rounded-lg bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="flex flex-col">
        <div className="border-b border-border px-4 py-3">
          <h2 id="add-component-title" className="sr-only">
            Adicionar componente
          </h2>
          <input
            // O dialogo existe para ser digitado: sem isto, cada abertura pede um
            // Tab antes da primeira letra. E `showModal()` ja prendeu o foco
            // dentro do dialogo, entao nao ha para onde ele fugir.
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="add-component-results"
            aria-autocomplete="list"
            aria-activedescendant={activeKind ? OPTION_ID(activeKind) : undefined}
            aria-label="Buscar componente"
            placeholder="Buscar componente…"
            // Nao e campo de formulario: preenchimento automatico e corretor
            // ortografico so atrapalhariam uma busca por nome de componente.
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-input px-3 py-2 text-ui outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/*
          O resultado da busca muda sem que nada receba foco: sem uma regiao
          viva, quem usa leitor de tela digita e nao ouve nada mudar.
        */}
        <p aria-live="polite" className="sr-only">
          {results.length === 0
            ? 'Nenhum componente encontrado'
            : `${String(results.length)} componente(s)`}
        </p>

        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs wrap-break-word text-muted-foreground">
            Nenhum componente para <span className="font-medium">{query}</span>. Tente “grafico”,
            “numero” ou “texto”.
          </p>
        ) : (
          // Sem `<ul>/<li>`: filho direto de um `listbox` tem de ser `option`, e
          // um `<li>` no meio quebraria a relacao que o leitor de tela usa para
          // anunciar "3 de 7".
          <div
            id="add-component-results"
            role="listbox"
            aria-label="Componentes"
            // `overscroll-contain`: rolar ate o fim da lista nao pode continuar
            // rolando a pagina atras do modal.
            className="max-h-72 overflow-y-auto overscroll-contain py-1"
          >
            {results.map((kind, index) => {
              const descriptor = NODE_DESCRIPTORS[kind];
              const highlighted = index === active;
              return (
                <button
                  key={kind}
                  type="button"
                  id={OPTION_ID(kind)}
                  role="option"
                  aria-selected={highlighted}
                  tabIndex={-1}
                  onClick={() => {
                    commit(kind);
                  }}
                  // Mouse e teclado compartilham UM destaque: mover o ponteiro
                  // move o mesmo indice que a seta move, entao nunca ha duas
                  // linhas parecendo ativas ao mesmo tempo.
                  onMouseMove={() => {
                    setActive(index);
                  }}
                  className={`block w-full px-4 py-2 text-left transition-colors ${
                    highlighted ? 'bg-primary/10' : ''
                  }`}
                >
                  <span
                    className={`block text-xs font-medium ${
                      highlighted
                        ? 'text-primary'
                        : 'text-foreground'
                    }`}
                  >
                    {descriptor.label}
                  </span>
                  <span className="block text-label leading-tight text-muted-foreground">
                    {descriptor.hint}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/*
          O destino resolvido, e nao uma frase generica: a regra de `addNode`
          depende da selecao atual, e ela e a duvida real de quem esta prestes a
          clicar. A paleta antiga dizia as duas metades da regra e deixava o
          usuario decidir qual valia para ele.
        */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
          <p className="min-w-0 truncate text-label text-muted-foreground">
            {destination}
          </p>
          <p className="hidden shrink-0 text-micro text-muted-foreground sm:block">
            ↑↓ navegar · ↵ adicionar · Esc fechar
          </p>
        </div>
      </div>
    </dialog>
  );
}
