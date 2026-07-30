'use client';

import { useRef, useState } from 'react';
import { Palette } from '@/components/Palette';
import { RolesPanel } from '@/components/RolesPanel';
import { TreePanel } from '@/components/TreePanel';
import { downloadJson } from '@/lib/persistence';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Coluna esquerda do editor: o que existe, o que da para adicionar e o que o
 * visual vai pedir ao Power BI.
 *
 * A ordem e deliberada — paleta, composicao, campos. E a ordem em que a pessoa
 * trabalha: escolhe uma peca, ve onde ela caiu, depois liga aos dados.
 */

const ACTION =
  'w-full rounded-md border border-slate-300 px-3 py-1.5 text-left text-xs font-medium ' +
  'text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800';

export function ProjectPanel() {
  const spec = useEditorStore((s) => s.spec);
  const newProject = useEditorStore((s) => s.newProject);
  const importSpec = useEditorStore((s) => s.importSpec);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
    <aside className="flex h-full w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <Palette />
      <TreePanel />
      <RolesPanel />

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
              downloadJson(spec);
            }}
          >
            Exportar projeto (JSON)
          </button>
          <button type="button" className={ACTION} onClick={() => fileInput.current?.click()}>
            Importar projeto (JSON)
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
    </aside>
  );
}
