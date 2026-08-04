'use client';

import { useEffect, useRef } from 'react';

/**
 * Instrucoes de importacao no Power BI (RF-13).
 *
 * Aparece depois de um export bem-sucedido, porque e exatamente ali que o
 * usuario nao sabe o que fazer com o arquivo que acabou de baixar. Usa o
 * `<dialog>` nativo: Esc, backdrop e retencao de foco vem de graca, e nao ha
 * biblioteca de modal no projeto.
 *
 * Os passos saem daqui como componente proprio (`ImportSteps`) porque o dialogo
 * de compilacao termina neles: quando o pacote fica pronto, e o MESMO dialogo
 * que passa a mostra-los, em vez de fechar e abrir outro por cima. Este dialogo
 * continua existindo para o link "Como importar", que e consultado fora do
 * fluxo de export.
 */

const STEPS: { title: string; detail: string }[] = [
  {
    title: 'Abra o Power BI Desktop ou o Service',
    detail: 'No Desktop, a faixa "Inserir". No Service, o painel de visualizacoes do relatorio.',
  },
  {
    title: 'Visualizações → ⋯ → Importar um visual de um arquivo',
    detail: 'Selecione o .pbiviz que acabou de ser baixado e confirme o aviso de visual nao certificado.',
  },
  {
    title: 'Insira o visual e arraste os campos',
    detail: 'Categoria / Eixo recebe a dimensao; Valor recebe a medida. O visual nao acessa seu modelo.',
  },
  {
    title: 'Para atualizar depois',
    detail:
      'Reexporte o MESMO projeto e importe de novo: o identificador e reusado, entao o Power BI atualiza o visual existente em vez de duplicar.',
  },
];

/** So a lista. Sem dialogo, sem cabecalho — quem monta a moldura e quem usa. */
export function ImportSteps() {
  return (
    <ol className="flex flex-col gap-3 px-5 py-4">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {index + 1}
          </span>
          <div>
            <p className="text-xs font-medium">{step.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {step.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface ImportInstructionsProps {
  open: boolean;
  filename: string;
  onClose: () => void;
}

export function ImportInstructions({ open, filename, onClose }: ImportInstructionsProps) {
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
      onClose={onClose}
      aria-labelledby="import-instructions-title"
      className="m-auto w-[32rem] max-w-[calc(100vw-2rem)] rounded-lg bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-900/40 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 id="import-instructions-title" className="text-sm font-semibold">
          Pacote gerado
        </h2>
        <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{filename}</p>
      </div>

      <ImportSteps />

      <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
        >
          Entendi
        </button>
      </div>
    </dialog>
  );
}
