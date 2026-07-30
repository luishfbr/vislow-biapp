'use client';

import { useState } from 'react';
import { exportPbiviz } from '@/lib/exportPbiviz';
import { selectCanExport, useEditorStore } from '@/store/useEditorStore';
import { ImportInstructions } from './ImportInstructions';

/**
 * Botao de export do `.pbiviz` (RF-11 / RF-12).
 *
 * Estados explicitos porque o empacotamento e assincrono: sem eles um clique
 * duplo geraria dois pacotes e dois bumps de versao. Discriminante de string,
 * como no resto do projeto.
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'done'; filename: string }
  | { kind: 'error'; message: string; hint: string | null };

export function ExportButton() {
  const config = useEditorStore((s) => s.config);
  const markExported = useEditorStore((s) => s.markExported);
  const canExport = useEditorStore(selectCanExport);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const building = phase.kind === 'building';
  const disabled = !canExport || building;

  const handleExport = async () => {
    setPhase({ kind: 'building' });
    const result = await exportPbiviz(config);

    if (result.kind === 'error') {
      setPhase({ kind: 'error', message: result.message, hint: result.hint });
      return;
    }

    setPhase({ kind: 'done', filename: result.filename });
    setInstructionsOpen(true);
    // Depois do export, nao antes: o pacote leva a versao com que foi gerado, e
    // a proxima exportacao sobe para uma versao maior — e o que faz o Power BI
    // atualizar o visual em vez de duplicar (RF-10).
    markExported();
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {phase.kind === 'error' && (
          <div role="alert" className="max-w-xs text-right">
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
              {phase.message}
            </p>
            {phase.hint !== null && (
              <p className="text-[10px] leading-tight text-slate-500">{phase.hint}</p>
            )}
          </div>
        )}

        {phase.kind === 'done' && (
          <button
            type="button"
            onClick={() => {
              setInstructionsOpen(true);
            }}
            className="text-[11px] text-sky-600 underline decoration-dotted hover:text-sky-700 dark:text-sky-400"
          >
            Como importar
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            void handleExport();
          }}
          disabled={disabled}
          aria-busy={building}
          title={
            canExport
              ? 'Gera o pacote do visual para importar no Power BI'
              : 'Corrija a configuracao para exportar'
          }
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          {building ? 'Gerando...' : 'Baixar .pbiviz'}
        </button>
      </div>

      <ImportInstructions
        open={instructionsOpen}
        filename={phase.kind === 'done' ? phase.filename : ''}
        onClose={() => {
          setInstructionsOpen(false);
        }}
      />
    </>
  );
}
