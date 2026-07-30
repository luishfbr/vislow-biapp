'use client';

import { useState } from 'react';
import { BarChart, ErrorBoundary, KpiCard, MOCK_BARS, MOCK_KPI } from '@vislow/visual-kit';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Preview (RF-05).
 *
 * Renderiza com os MESMOS componentes do Runtime Core — nao com uma reimplementacao.
 * E o que faz o ADR-04 se pagar: nao existe "preview aproximado", existe o
 * proprio visual, alimentado por dados mock em vez do DataView.
 *
 * RN-02: nenhum dado do modelo do Power BI passa por aqui. O app nem tem acesso
 * a ele.
 */

const RATIOS = [
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
] as const;

export function PreviewCanvas() {
  const config = useEditorStore((s) => s.config);
  const [ratio, setRatio] = useState<number>(16 / 9);

  return (
    <main className="flex h-full flex-1 flex-col items-center justify-center gap-4 bg-slate-100 p-8 dark:bg-slate-950">
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg shadow-lg ring-1 ring-slate-200 dark:ring-slate-700"
        style={{ aspectRatio: String(ratio) }}
      >
        {/* O ErrorBoundary tambem no preview: um config em edicao pode passar por
            estados transitorios que o componente nao suporta, e travar o editor
            seria pior que mostrar o card de erro. */}
        <ErrorBoundary>
          {config.chartType === 'bar' ? (
            <BarChart config={config} data={MOCK_BARS} />
          ) : (
            <KpiCard config={config} datum={MOCK_KPI} />
          )}
        </ErrorBoundary>
      </div>

      <div className="flex items-center gap-2">
        {RATIOS.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => {
              setRatio(r.value);
            }}
            aria-pressed={ratio === r.value}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              ratio === r.value
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-slate-400">dados de exemplo</span>
      </div>
    </main>
  );
}
