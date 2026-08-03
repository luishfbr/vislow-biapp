'use client';

import { bindingCount } from '@vislow/component-registry';
import { COLUMN_TYPE_LABEL, type ColumnType } from '@vislow/config-schema';
import { useState } from 'react';
import { DataTableDialog } from '@/components/DataTableDialog';
import { COLUMN_MARK } from '@/lib/columnMarks';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Os dados do visual, na coluna estreita (RF-09 / mapeamento de campos).
 *
 * Cada COLUNA da tabela de exemplo e, ao mesmo tempo, um campo que o visual vai
 * pedir no Power BI — nao ha duas listas. E o que faz "comecar do zero" ser
 * real: com compilacao por usuario o `capabilities.json` nasce por visual, entao
 * e o USUARIO quem decide quais campos o visual dele exige.
 *
 * Aqui a lista e SO LEITURA: 288px nao comportam uma planilha, e tentar editar
 * rotulo, tipo, papel e valores nesta largura produziria controles de 60px. A
 * edicao inteira mora no dialogo, que tem a largura da tela.
 */

const ACTION =
  'w-full rounded-md border border-dashed border-slate-300 px-2 py-1.5 text-[11px] font-medium ' +
  'text-slate-600 hover:border-sky-400 hover:text-sky-700 focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-600 dark:text-slate-300';

export function DataPanel() {
  const spec = useEditorStore((s) => s.spec);
  const [open, setOpen] = useState(false);

  const { columns, rows } = spec.data;

  return (
    // Faixa propria, com fundo e borda de topo: e a segunda coisa mais olhada da
    // coluna e antes ela era a quarta secao de uma pilha rolavel, saindo da tela
    // quando a arvore crescia. Aqui ela tem lugar fixo e rolagem propria.
    <section className="shrink-0 border-t border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Dados de exemplo
        </h2>
        <span className="text-[10px] tabular-nums text-slate-400">
          {columns.length} col · {rows.length} lin
        </span>
      </div>

      <ul className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
        {columns.map((column) => {
          const used = bindingCount(spec, column.name);
          return (
            <li
              key={column.name}
              className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center gap-1.5">
                {/* O mesmo chip do cabecalho da grade: o usuario reconhece a
                    coluna pelo sinal antes de ler o rotulo. */}
                <TypeMark type={column.type} measure={column.kind === 'measure'} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-800 dark:text-slate-100">
                  {column.displayName}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 pl-1 text-[10px] text-slate-400">
                <span className="shrink-0">{COLUMN_TYPE_LABEL[column.type].toLowerCase()}</span>
                <span className="min-w-0 truncate font-mono">{column.name}</span>
                {/* Quantos componentes usam a coluna. Esta na tela porque apagar
                    ou trocar o tipo dela DESLIGA esses componentes — o numero e
                    o aviso de quanto vai quebrar, antes de abrir o dialogo. */}
                <span className="ml-auto shrink-0 tabular-nums">
                  {used === 0 ? 'sem uso' : `${String(used)} uso(s)`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className={`${ACTION} mt-2`}
        onClick={() => {
          setOpen(true);
        }}
      >
        Editar dados
      </button>

      <p className="mt-2 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
        Os valores ficam <strong className="font-medium">no editor</strong> e não entram no pacote.
        O que o visual leva são as colunas: no Power BI, elas viram os campos que ele exige.
      </p>

      <DataTableDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </section>
  );
}

/**
 * Chip de tipo — a assinatura visual desta feature.
 *
 * O `Σ` marca a coluna que o visual vai SOMAR em vez de agrupar. E a informacao
 * mais consequente da coluna (um "Ano" somado vira um numero sem sentido), e por
 * isso ela viaja em dois canais: o glifo e a cor. So a cor excluiria quem nao a
 * distingue; so o glifo passaria despercebido numa lista de dez.
 */
function TypeMark({ type, measure }: { type: ColumnType; measure: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] leading-none ${
        measure
          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      {measure && <span className="mr-0.5">Σ</span>}
      {COLUMN_MARK[type]}
    </span>
  );
}
