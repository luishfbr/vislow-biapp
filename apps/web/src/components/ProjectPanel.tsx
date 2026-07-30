'use client';

import { useRef, useState } from 'react';
import type { ChartType } from '@vislow/config-schema';
import { downloadJson } from '@/lib/persistence';
import { useEditorStore } from '@/store/useEditorStore';

const TYPES: { value: ChartType; label: string; hint: string }[] = [
  { value: 'bar', label: 'Barras', hint: 'Comparar categorias' },
  { value: 'kpi', label: 'KPI Card', hint: 'Destacar um numero' },
];

const ACTION =
  'w-full rounded-md border border-slate-300 px-3 py-1.5 text-left text-xs font-medium ' +
  'text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';

export function ProjectPanel() {
  const config = useEditorStore((s) => s.config);
  const setChartType = useEditorStore((s) => s.setChartType);
  const newProject = useEditorStore((s) => s.newProject);
  const importConfig = useEditorStore((s) => s.importConfig);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setImportError(null);
    try {
      const result = importConfig(JSON.parse(await file.text()));
      if (!result.ok) {
        const first = result.issues[0];
        setImportError(first ? `${first.path}: ${first.message}` : 'Configuracao invalida.');
      }
    } catch {
      setImportError('Arquivo nao e um JSON valido.');
    }
  };

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col gap-5 border-r border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Tipo de visual
        </h2>
        <div className="flex flex-col gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setChartType(t.value);
              }}
              aria-pressed={config.chartType === t.value}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                config.chartType === t.value
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-950'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.label}</div>
              <div className="text-[11px] text-slate-500">{t.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Projeto
        </h2>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            className={ACTION}
            onClick={() => {
              newProject('Meu visual');
            }}
          >
            Novo projeto
          </button>
          <button
            type="button"
            className={ACTION}
            onClick={() => {
              downloadJson(config);
            }}
          >
            Exportar configuracao
          </button>
          <button
            type="button"
            className={ACTION}
            onClick={() => fileInput.current?.click()}
          >
            Importar configuracao
          </button>
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
        </div>
        {importError !== null && (
          <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">
            {importError}
          </p>
        )}
      </section>

      <section className="mt-auto text-[11px] leading-relaxed text-slate-400">
        <p className="font-medium text-slate-500 dark:text-slate-400">Campos do modelo</p>
        <p className="mt-1">
          O mapeamento de colunas acontece <strong>dentro do Power BI</strong>, arrastando campos para
          Categoria e Valor. O editor nao acessa seu modelo.
        </p>
      </section>
    </aside>
  );
}
