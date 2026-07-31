'use client';

import { ExportButton } from '@/components/ExportButton';
import { ProjectMenu } from '@/components/ProjectMenu';
import { useEditorStore } from '@/store/useEditorStore';

export function Header() {
  const spec = useEditorStore((s) => s.spec);
  const rename = useEditorStore((s) => s.rename);

  const nameTooShort = spec.project.name.trim().length < 3;

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
          value={spec.project.name}
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

      <span className="text-[11px] text-slate-400">v{spec.project.packageVersion}</span>

      <div className="ml-auto flex items-center gap-2">
        {/* Acoes de arquivo do PROJETO — vieram da coluna esquerda, onde
            ocupavam altura permanente para uso ocasional. Ficam a esquerda do
            export porque o export e a acao principal, e a principal e a ultima. */}
        <ProjectMenu />
        {/* O botao fica desabilitado com spec invalida: RN-03 impede pedir uma
            build que o servidor recusaria de qualquer forma. */}
        <ExportButton />
      </div>
    </header>
  );
}
