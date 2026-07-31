'use client';

import { useState } from 'react';
import { requestBuild, type BuildPhase } from '@/lib/buildApi';
import { triggerDownload } from '@/lib/persistence';
import { selectCanExport, useEditorStore } from '@/store/useEditorStore';
import { ImportInstructions } from './ImportInstructions';

/**
 * Botao de export (RF-11 / RF-12).
 *
 * Depois do ADR-08 o pacote nao e mais montado no browser: a spec sobe, o
 * servidor COMPILA um projeto pbiviz de verdade e devolve o artefato. O que
 * mudou na interface e que a espera passou a existir — ~12 s medidos —, entao as
 * fases sao nomeadas e visiveis. "Gerando..." parado por doze segundos e
 * indistinguivel de travado.
 */

const PHASE_LABEL: Record<BuildPhase['kind'], string> = {
  idle: 'Baixar .pbiviz',
  uploading: 'Enviando...',
  queued: 'Na fila...',
  compiling: 'Compilando...',
  done: 'Baixar .pbiviz',
  error: 'Baixar .pbiviz',
};

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function ExportButton() {
  const spec = useEditorStore((s) => s.spec);
  const markExported = useEditorStore((s) => s.markExported);
  const canExport = useEditorStore(selectCanExport);
  const [phase, setPhase] = useState<BuildPhase>({ kind: 'idle' });
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const busy = phase.kind === 'uploading' || phase.kind === 'queued' || phase.kind === 'compiling';
  const disabled = !canExport || busy;

  const handleExport = async () => {
    const result = await requestBuild(spec, setPhase);

    if (result.kind === 'error') {
      setPhase(result);
      return;
    }

    triggerDownload(result.blob, result.fileName);
    setPhase({ kind: 'done', fileName: result.fileName, metrics: result.metrics });
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
          <div role="alert" className="max-w-sm text-right">
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{phase.message}</p>
            {phase.hint !== null && (
              <p className="text-[10px] leading-tight text-slate-500">{phase.hint}</p>
            )}
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="flex items-center gap-2 text-right">
            {phase.metrics && (
              // As medidas ficam a vista porque o orcamento e duro (1 MB de JS,
              // 2 MB de pacote): quem esta compondo precisa ver o custo subir
              // antes de a build ser reprovada.
              <span className="text-[10px] text-slate-400">
                {formatBytes(phase.metrics.packageBytes)} ·{' '}
                {(phase.metrics.durationMs / 1000).toFixed(1)} s
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setInstructionsOpen(true);
              }}
              className="text-[11px] text-sky-600 underline decoration-dotted hover:text-sky-700 dark:text-sky-400"
            >
              Como importar
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            void handleExport();
          }}
          disabled={disabled}
          aria-busy={busy}
          title={
            canExport
              ? 'Compila o visual no servidor e baixa o pacote'
              : 'Resolva os campos pendentes para exportar'
          }
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          {PHASE_LABEL[phase.kind]}
        </button>
      </div>

      <ImportInstructions
        open={instructionsOpen}
        filename={phase.kind === 'done' ? phase.fileName : ''}
        onClose={() => {
          setInstructionsOpen(false);
        }}
      />
    </>
  );
}
