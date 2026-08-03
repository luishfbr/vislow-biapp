'use client';

import { MAX_COLUMNS, MAX_ROWS, bindingCount, type DataColumn } from '@vislow/component-registry';
import {
  cellToInput,
  formatCell,
  isNumericType,
  parseCell,
  type CellValue,
  type ColumnType,
} from '@vislow/config-schema';
import { useEffect, useId, useRef, useState } from 'react';
import { COLUMN_MARK, COLUMN_TYPE_OPTIONS, acceptsHint, cellAlignment } from '@/lib/columnMarks';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * A tabela de exemplo, em tamanho de tela.
 *
 * O usuario declara quantas colunas quiser, com o TIPO de cada uma, e digita as
 * linhas contra as quais vai compor o visual. Cada coluna e, ao mesmo tempo, um
 * campo que o pacote vai exigir no Power BI — e por isso o cabecalho de cada
 * coluna e desenhado como o chip que ela vira do outro lado.
 *
 * `<dialog>` nativo: Esc, backdrop e retencao de foco vem de graca, e nao ha
 * biblioteca de modal no projeto (mesmo padrao do `ImportInstructions`).
 *
 * E uma `<table>` de verdade, e nao um grid de `<div>`. E o unico jeito de o
 * leitor de tela anunciar "linha 3, Receita" ao entrar numa celula; num grid de
 * divs, cinquenta linhas de numeros viram cinquenta campos sem contexto.
 */

const CELL =
  'w-full bg-transparent px-2 py-1 text-sm outline-none focus:bg-sky-50 ' +
  'focus:ring-2 focus:ring-inset focus:ring-sky-500 dark:focus:bg-sky-950';

const ICON_BUTTON =
  'inline-flex h-6 w-6 items-center justify-center rounded text-[11px] text-slate-400 ' +
  'hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 dark:hover:bg-red-950';

const ADD =
  'rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 ' +
  'hover:border-sky-400 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40 ' +
  'dark:border-slate-600 dark:text-slate-300';

export function DataTableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const spec = useEditorStore((s) => s.spec);
  const addColumn = useEditorStore((s) => s.addColumn);
  const addRow = useEditorStore((s) => s.addRow);
  const removeRow = useEditorStore((s) => s.removeRow);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const { columns, rows } = spec.data;
  const cheio = columns.length >= MAX_COLUMNS;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="data-table-title"
      className="m-auto w-[64rem] max-w-[calc(100vw-3rem)] rounded-lg bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-900/40 dark:bg-slate-900 dark:text-slate-100"
      // Clique no backdrop fecha. O alvo so e o proprio `<dialog>` quando o
      // clique caiu FORA do conteudo — dentro dele, o alvo e algum filho.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <h2 id="data-table-title" className="text-sm font-semibold">
            Dados de exemplo
          </h2>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Componha o visual contra os seus próprios números. As linhas ficam no editor; as colunas
            viram os campos que o visual exige no Power BI, com o tipo que você declarar aqui.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 rounded px-1.5 py-0.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          ✕
        </button>
      </header>

      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {/* Canto vazio, acima da numeracao das linhas. */}
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 w-10 border-b border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
              >
                <span className="sr-only">Linha</span>
              </th>
              {columns.map((column) => (
                <ColumnHeader key={column.name} column={column} />
              ))}
              <th
                scope="col"
                className="sticky top-0 z-20 w-32 border-b border-slate-200 bg-slate-50 p-2 align-top dark:border-slate-700 dark:bg-slate-950"
              >
                <button
                  type="button"
                  className={ADD}
                  disabled={cheio}
                  title={cheio ? `O limite é de ${String(MAX_COLUMNS)} colunas.` : undefined}
                  onClick={() => {
                    addColumn(`Coluna ${String(columns.length + 1)}`, 'text');
                  }}
                >
                  + coluna
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, r) => (
              // Chave pelo INDICE de proposito: a linha nao tem identidade
              // propria, ela E a posicao. Uma chave sintetica sobreviveria a
              // remocao no meio e levaria o rascunho da celula junto, para a
              // linha errada.
              <tr key={r} className="odd:bg-slate-50/60 dark:odd:bg-slate-950/40">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-2 text-right text-[10px] font-normal tabular-nums text-slate-400 dark:border-slate-700"
                >
                  {r + 1}
                </th>
                {columns.map((column, c) => (
                  <td key={column.name} className="border-b border-slate-100 p-0 dark:border-slate-800">
                    <Cell
                      row={r}
                      column={c}
                      type={column.type}
                      header={column.displayName}
                      value={row[c] ?? null}
                    />
                  </td>
                ))}
                <td className="border-b border-slate-100 px-2 text-center dark:border-slate-800">
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    disabled={rows.length <= 1}
                    aria-label={`Remover a linha ${String(r + 1)}`}
                    onClick={() => {
                      removeRow(r);
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <button
          type="button"
          className={ADD}
          disabled={rows.length >= MAX_ROWS}
          title={rows.length >= MAX_ROWS ? `O limite é de ${String(MAX_ROWS)} linhas.` : undefined}
          onClick={addRow}
        >
          + linha
        </button>
        <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
          {columns.length}/{MAX_COLUMNS} colunas · {rows.length}/{MAX_ROWS} linhas
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        >
          Concluir
        </button>
      </footer>
    </dialog>
  );
}

/**
 * O cabecalho da coluna, desenhado como o CHIP que ela vira no painel de campos
 * do Power BI: sinal do tipo, rotulo e — quando e medida — o `Σ`.
 *
 * O `Σ` e um botao, e nao um enfeite: ele alterna agrupar/somar, que e a decisao
 * mais consequente da coluna. Um "Ano" e inteiro e ainda assim agrupa; somado,
 * vira um numero sem significado nenhum.
 */
function ColumnHeader({ column }: { column: DataColumn }) {
  const spec = useEditorStore((s) => s.spec);
  const setColumnLabel = useEditorStore((s) => s.setColumnLabel);
  const setColumnType = useEditorStore((s) => s.setColumnType);
  const setColumnKind = useEditorStore((s) => s.setColumnKind);
  const removeColumn = useEditorStore((s) => s.removeColumn);

  const id = useId();
  const medida = column.kind === 'measure';
  const usos = bindingCount(spec, column.name);
  const ultima = spec.data.columns.length <= 1;

  /** O aviso de quanto vai quebrar, no `title` de quem quebra. */
  const impacto =
    usos === 0 ? '' : ` ${String(usos)} componente(s) ficarão pendentes.`;

  return (
    <th
      scope="col"
      className="sticky top-0 z-20 min-w-40 border-b border-slate-200 bg-slate-50 p-2 text-left align-top dark:border-slate-700 dark:bg-slate-950"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-pressed={medida}
          title={
            medida
              ? `Somar os valores desta coluna. Clique para agrupar por ela.${impacto}`
              : `Agrupar por esta coluna. Clique para somar os valores.${impacto}`
          }
          onClick={() => {
            setColumnKind(column.name, medida ? 'grouping' : 'measure');
          }}
          className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] leading-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 ${
            medida
              ? 'bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300'
              : 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {medida && <span className="mr-0.5">Σ</span>}
          {COLUMN_MARK[column.type]}
          <span className="sr-only">{medida ? ' Medida: soma' : ' Agrupamento'}</span>
        </button>

        <input
          value={column.displayName}
          maxLength={50}
          autoComplete="off"
          aria-label={`Nome da coluna ${column.name}`}
          onChange={(event) => {
            setColumnLabel(column.name, event.target.value);
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-800 outline-none hover:border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:text-slate-100 dark:hover:border-slate-600 dark:focus:ring-sky-900"
        />

        <button
          type="button"
          className={ICON_BUTTON}
          disabled={ultima}
          aria-label={`Remover a coluna ${column.displayName}`}
          title={
            ultima
              ? 'A tabela precisa de pelo menos uma coluna.'
              : `Remover a coluna.${impacto}`
          }
          onClick={() => {
            removeColumn(column.name);
          }}
        >
          ✕
        </button>
      </div>

      <select
        value={column.type}
        aria-label={`Tipo da coluna ${column.displayName}`}
        aria-describedby={id}
        onChange={(event) => {
          setColumnType(column.name, event.target.value as ColumnType);
        }}
        className="mt-1 w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-sky-900"
      >
        {COLUMN_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* O tipo e uma restricao de VERDADE do lado do Power BI. Sem este aviso,
          o usuario descobriria no Desktop que a coluna dele foi recusada, sem
          nenhuma pista de que a causa foi uma escolha feita nesta tela. */}
      <p id={id} className="mt-1 text-[10px] font-normal leading-tight text-slate-500 dark:text-slate-400">
        {acceptsHint(column.type)}
      </p>
    </th>
  );
}

/**
 * Uma celula.
 *
 * Numero e data usam RASCUNHO com commit no blur/Enter, e nao escrita direta a
 * cada tecla: digitar "1.234,5" passa por "1." e por "1.234," , que nao sao
 * numeros — escrever a cada tecla apagaria o que o usuario esta no meio de
 * digitar. Escape desfaz. E o mesmo padrao do campo da prancheta, que existe
 * neste projeto exatamente por ter aprendido isso.
 *
 * Enter tambem desce para a celula de baixo, que e como se preenche uma coluna
 * inteira sem tirar a mao do teclado.
 */
function Cell({
  row,
  column,
  type,
  header,
  value,
}: {
  row: number;
  column: number;
  type: ColumnType;
  /** Rotulo da coluna. Entra no nome acessivel: "Linha 3" sozinho nao diz de qual. */
  header: string;
  value: CellValue;
}) {
  const setCell = useEditorStore((s) => s.setCell);
  const [draft, setDraft] = useState(() => cellToInput(value, type));

  // Trocar o tipo da coluna, importar projeto ou desfazer mudam a celula por
  // fora; sem isto o campo continuaria exibindo o que foi digitado por ultimo.
  useEffect(() => {
    setDraft(cellToInput(value, type));
  }, [value, type]);

  const descer = (event: React.KeyboardEvent<HTMLElement>): void => {
    const next = event.currentTarget
      .closest('table')
      ?.querySelector<HTMLElement>(`[data-cell="${String(row + 1)}-${String(column)}"]`);
    next?.focus();
  };

  if (type === 'boolean') {
    return (
      <select
        data-cell={`${String(row)}-${String(column)}`}
        value={value === null ? '' : String(value)}
        aria-label={`${header}, linha ${String(row + 1)}`}
        onChange={(event) => {
          setCell(row, column, event.target.value === '' ? null : event.target.value === 'true');
        }}
        className={`${CELL} text-left`}
      >
        <option value="">—</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  }

  const commit = (): void => {
    setCell(row, column, parseCell(draft, type));
  };

  return (
    <input
      data-cell={`${String(row)}-${String(column)}`}
      // `date` ganha o seletor nativo; o resto e texto, porque `type=number`
      // recusa a virgula decimal em boa parte dos navegadores.
      type={type === 'date' ? 'date' : 'text'}
      inputMode={isNumericType(type) ? 'decimal' : undefined}
      value={draft}
      autoComplete="off"
      aria-label={`${header}, linha ${String(row + 1)}`}
      // O valor formatado no `title`: na celula ele aparece cru (sem `R$`, sem
      // separador de milhar) porque e assim que da para editar.
      title={formatCell(value, type)}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          descer(event);
        }
        if (event.key === 'Escape') setDraft(cellToInput(value, type));
      }}
      className={`${CELL} ${cellAlignment(type)} ${
        isNumericType(type) ? 'font-mono tabular-nums' : ''
      }`}
    />
  );
}
