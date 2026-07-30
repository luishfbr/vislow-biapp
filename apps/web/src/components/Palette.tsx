'use client';

import { NODE_DESCRIPTORS, NODE_KINDS } from '@vislow/component-registry';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Paleta de componentes (RF-04).
 *
 * GERADA do registro, nunca escrita a mao: um tipo de no novo aparece aqui no
 * mesmo commit em que passa a existir, ja com rotulo e dica. Uma lista escrita a
 * mao seria a quarta copia do catalogo — depois do schema, do codegen e do mapa
 * de componentes do preview — e a primeira a esquecer alguem.
 */
export function Palette() {
  const addNode = useEditorStore((s) => s.addNode);

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Componentes
      </h2>
      <div className="flex flex-col gap-1">
        {NODE_KINDS.map((kind) => {
          const descriptor = NODE_DESCRIPTORS[kind];
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                addNode(kind);
              }}
              title={descriptor.hint}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-left transition-colors hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:hover:bg-sky-950"
            >
              <div className="text-xs font-medium text-slate-800 dark:text-slate-100">
                {descriptor.label}
              </div>
              <div className="text-[10px] leading-tight text-slate-500">{descriptor.hint}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-tight text-slate-400">
        Entra dentro do container selecionado, ou logo abaixo do item selecionado.
      </p>
    </section>
  );
}
