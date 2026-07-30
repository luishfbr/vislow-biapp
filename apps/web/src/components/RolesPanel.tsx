'use client';

import { walk, NODE_DESCRIPTORS } from '@vislow/component-registry';
import { useMemo } from 'react';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Papeis de dados do visual (RF-09 / mapeamento de campos).
 *
 * E o que faz "comecar do zero" ser real: com compilacao por usuario o
 * `capabilities.json` nasce por visual, entao e o USUARIO quem decide quais
 * campos o visual dele vai pedir no Power BI — em vez de herdar Categoria/Valor
 * de um runtime pre-compilado.
 *
 * O que ele edita e o ROTULO, que e o que aparece no painel de campos do
 * relatorio. O nome tecnico e estavel por desenho (ver `createRole`).
 */

const ACTION =
  'flex-1 rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-[11px] font-medium ' +
  'text-slate-600 hover:border-sky-400 hover:text-sky-700 dark:border-slate-600 dark:text-slate-300';

export function RolesPanel() {
  const spec = useEditorStore((s) => s.spec);
  const addRole = useEditorStore((s) => s.addRole);
  const setRoleLabel = useEditorStore((s) => s.setRoleLabel);
  const removeRole = useEditorStore((s) => s.removeRole);

  /**
   * Quantos nos consomem cada papel.
   *
   * Aparece na tela porque remover um papel DESLIGA os nos que o usavam — o
   * numero e o aviso de quanto vai quebrar, antes de clicar.
   */
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { node } of walk(spec)) {
      for (const field of NODE_DESCRIPTORS[node.kind].fields) {
        if (field.kind !== 'role') continue;
        const bound = node.props[field.key];
        if (typeof bound === 'string') counts.set(bound, (counts.get(bound) ?? 0) + 1);
      }
    }
    return counts;
  }, [spec]);

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Campos do visual
      </h2>

      <div className="flex flex-col gap-1.5">
        {spec.dataRoles.map((role) => {
          const used = usage.get(role.name) ?? 0;
          return (
            <div
              key={role.name}
              className="rounded-md border border-slate-200 px-2 py-1.5 dark:border-slate-700"
            >
              <div className="flex items-center gap-1.5">
                <input
                  value={role.displayName}
                  maxLength={50}
                  onChange={(e) => {
                    setRoleLabel(role.name, e.target.value);
                  }}
                  aria-label={`Rotulo do campo ${role.name}`}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-800 outline-none hover:border-slate-300 focus:border-sky-500 dark:text-slate-100 dark:hover:border-slate-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    removeRole(role.name);
                  }}
                  title={
                    used === 0
                      ? 'Remover campo'
                      : `Remover campo — ${String(used)} componente(s) ficarao pendentes`
                  }
                  aria-label={`Remover campo ${role.displayName}`}
                  className="shrink-0 rounded px-1 text-[11px] text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                >
                  ✕
                </button>
              </div>
              <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] text-slate-400">
                <span>{role.kind === 'grouping' ? 'categoria' : 'medida'}</span>
                <span className="font-mono">{role.name}</span>
                <span className="ml-auto">{used === 0 ? 'nao usado' : `${String(used)} uso(s)`}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          className={ACTION}
          onClick={() => {
            addRole('grouping');
          }}
        >
          + Categoria
        </button>
        <button
          type="button"
          className={ACTION}
          onClick={() => {
            addRole('measure');
          }}
        >
          + Medida
        </button>
      </div>

      <p className="mt-2 text-[10px] leading-tight text-slate-400">
        Estes sao os campos que o visual vai pedir no Power BI. As colunas do modelo sao arrastadas
        para eles <strong>dentro do relatorio</strong> — o editor nao acessa seu modelo.
      </p>
    </section>
  );
}
