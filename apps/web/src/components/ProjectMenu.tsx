'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { downloadJson } from '@/lib/persistence';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Acoes de PROJETO — novo, exportar JSON, importar JSON.
 *
 * Saiu da coluna esquerda porque nao pertencia a ela: aquela coluna e sobre a
 * composicao (o que existe e a que dados se liga), e tres botoes de arquivo
 * ocupavam nela o espaco vertical que a arvore e os campos disputam a cada nova
 * linha. Sao acoes raras — uma por sessao, no maximo — e acao rara paga aluguel
 * caro num painel permanente.
 *
 * Nao confundir com o export do visual: o botao ao lado baixa o `.pbiviz`, que e
 * o produto. Aqui e o PROJETO, o JSON que se reabre no editor.
 */

const ITEM =
  'w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 ' +
  'focus-visible:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 ' +
  'focus-visible:outline-sky-600 dark:text-slate-200 ' +
  'dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800';

export function ProjectMenu() {
  const spec = useEditorStore((s) => s.spec);
  const newProject = useEditorStore((s) => s.newProject);
  const importSpec = useEditorStore((s) => s.importSpec);

  const [open, setOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items = (): HTMLButtonElement[] =>
    Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  /**
   * Setas percorrem o menu, como `role="menu"` promete.
   *
   * Lido do DOM em vez de uma lista de refs: sao os mesmos botoes que o JSX
   * acima escreve, e uma segunda lista para mante-los em ordem seria a copia que
   * esquece o item seguinte.
   */
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const current = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (index: number) => {
      event.preventDefault();
      all[(index + all.length) % all.length]?.focus();
    };

    if (event.key === 'ArrowDown') go(current + 1);
    else if (event.key === 'ArrowUp') go(current - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(all.length - 1);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    // Foco de volta no gatilho quando o menu fecha por teclado: sem isto o foco
    // cai no `<body>` e a proxima tecla nao tem onde ir.
    if (returnFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };

    // O primeiro item recebe o foco na abertura: quem abriu o menu pelo teclado
    // esta a uma seta de distancia do resto, e nao a um Tab pelo header inteiro.
    items()[0]?.focus();

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleFile = async (file: File) => {
    setImportError(null);
    try {
      const result = importSpec(JSON.parse(await file.text()));
      if (!result.ok) {
        const first = result.issues[0];
        setImportError(first ? `${first.path}: ${first.message}` : 'Projeto invalido.');
      }
    } catch {
      setImportError('Arquivo nao e um JSON valido.');
    }
  };

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Acoes do projeto"
        title="Acoes do projeto"
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm leading-none text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <span aria-hidden>⋯</span>
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Acoes do projeto"
          onKeyDown={moveFocus}
          className="absolute right-0 z-10 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              newProject('Meu visual');
              close(true);
            }}
          >
            Novo projeto
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              downloadJson(spec);
              close(true);
            }}
          >
            Exportar projeto (.json)
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              fileInput.current?.click();
              close(false);
            }}
          >
            Importar projeto (.json)
          </button>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />

      {importError !== null && (
        // Ancorado no gatilho, e nao dentro do menu: o menu ja fechou quando o
        // arquivo foi escolhido, e um erro que some junto com ele nao seria lido.
        <div
          role="alert"
          className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-red-200 bg-white px-3 py-2 text-[11px] text-red-600 shadow-lg dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
        >
          {importError}
          <button
            type="button"
            onClick={() => {
              setImportError(null);
            }}
            className="mt-1 block text-[10px] text-slate-500 underline"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
