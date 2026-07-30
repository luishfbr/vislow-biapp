'use client';

import { ExportButton } from '@/components/ExportButton';
import { useEditorStore } from '@/store/useEditorStore';

export function Header() {
  const config = useEditorStore((s) => s.config);
  const rename = useEditorStore((s) => s.rename);

  const nameTooShort = config.project.name.trim().length < 3;

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Vislow
      </span>

      <div className="flex items-center gap-2">
        <label htmlFor="visual-name" className="text-xs text-slate-500">
          Nome do visual
        </label>
        <input
          id="visual-name"
          value={config.project.name}
          maxLength={50}
          onChange={(e) => {
            rename(e.target.value);
          }}
          aria-invalid={nameTooShort}
          className={`w-64 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2 dark:bg-slate-800 dark:text-slate-100 ${
            nameTooShort
              ? 'border-red-400 focus:ring-red-200'
              : 'border-slate-300 focus:border-sky-500 focus:ring-sky-200 dark:border-slate-600'
          }`}
        />
        {nameTooShort && (
          <span className="text-[11px] text-red-600 dark:text-red-400">minimo 3 caracteres</span>
        )}
      </div>

      <span className="text-[11px] text-slate-400">v{config.project.packageVersion}</span>

      <div className="ml-auto flex items-center gap-2">
        {/* O botao fica desabilitado com config invalida: RN-03 impede exportar
            um pacote que so quebraria dentro do Power BI. */}
        <ExportButton />
      </div>
    </header>
  );
}
