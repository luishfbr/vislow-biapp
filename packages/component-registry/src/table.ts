import { coerceCell, type CellValue, type ColumnType } from '@vislow/config-schema';
import { createColumn } from './factory.js';
import { roleFieldsOf } from './registry.js';
import {
  KIND_FOR_TYPE,
  MAX_COLUMNS,
  MAX_ROWS,
  type DataColumn,
  type VisualSpec,
} from './spec.js';
import { unbindRole } from './tree.js';
import type { RoleKind } from './types.js';

/**
 * Edicao da tabela de exemplo — funcoes PURAS que devolvem uma spec nova.
 *
 * Moram aqui, e nao no store do editor, pelos mesmos dois motivos do `tree.ts`:
 * sao as unicas operacoes que podem produzir uma tabela invalida (linha com
 * comprimento errado, celula fora do tipo, coluna que sumiu deixando um no
 * ligado a um papel inexistente), e a regra de "o que e valido" ja vive neste
 * pacote. E sao testaveis sem React.
 *
 * MESMA CONVENCAO do `tree.ts`: operacao ilegal devolve `null`, nunca a spec
 * intacta. Um no-op silencioso e indistinguivel de sucesso.
 *
 * A ARVORE ANDA JUNTO. Apagar uma coluna, trocar o tipo dela ou trocar o papel
 * pode deixar um no ligado a algo que nao existe mais ou que mudou de natureza —
 * e uma spec assim reprova inteira, com um erro que aponta para o no e nao para
 * a coluna que o usuario mexeu. Por isso cada operacao que mexe na identidade da
 * coluna desliga as ligacoes afetadas no mesmo passo, via `unbindRole`.
 */

/**
 * Quantos CAMPOS da arvore estao ligados a esta coluna. A UI avisa antes de quebrar.
 *
 * So campos de papel entram na conta. Varrer todos os props compararia tambem o
 * texto que o usuario escreveu num no de texto — uma coluna chamada `total`
 * apareceria como "usada" por um titulo que por acaso diz "total".
 */
export function bindingCount(spec: VisualSpec, name: string): number {
  let count = 0;
  const visit = (node: VisualSpec['root']): void => {
    for (const field of roleFieldsOf(node.kind)) {
      if (node.props[field.key] === name) count += 1;
    }
    node.children?.forEach(visit);
  };
  visit(spec.root);
  return count;
}

export function columnOf(spec: VisualSpec, name: string): DataColumn | undefined {
  return spec.data.columns.find((column) => column.name === name);
}

function indexOf(spec: VisualSpec, name: string): number {
  return spec.data.columns.findIndex((column) => column.name === name);
}

/**
 * Coluna nova, com celulas vazias em todas as linhas.
 *
 * Nasce vazia e nao com valor de exemplo: um numero que o editor inventou e
 * indistinguivel de um numero que o usuario digitou, e ele so descobre a
 * diferenca quando o grafico ja esta composto em cima de dado que nao e dele.
 */
export function addColumn(spec: VisualSpec, label: string, type: ColumnType): VisualSpec | null {
  if (spec.data.columns.length >= MAX_COLUMNS) return null;
  if (label.trim() === '') return null;

  const column = createColumn(label.trim(), type, spec.data.columns);
  return {
    ...spec,
    data: {
      columns: [...spec.data.columns, column],
      rows: spec.data.rows.map((row) => [...row, null]),
    },
  };
}

/**
 * Remove a coluna, a celula correspondente de TODA linha e as ligacoes na
 * arvore. As tres coisas num passo so — separadas, a spec fica invalida no meio.
 */
export function removeColumn(spec: VisualSpec, name: string): VisualSpec | null {
  const index = indexOf(spec, name);
  // A ultima coluna nao sai: sem coluna nenhuma nao ha o que ligar nos nos, e o
  // schema exige `minItems: 1`.
  if (index < 0 || spec.data.columns.length <= 1) return null;

  return {
    ...spec,
    data: {
      columns: spec.data.columns.filter((_, position) => position !== index),
      rows: spec.data.rows.map((row) => row.filter((_, position) => position !== index)),
    },
    root: unbindRole(spec.root, name),
  };
}

/** So o rotulo. O `name` e imutavel por design — ver `createColumn`. */
export function setColumnLabel(spec: VisualSpec, name: string, label: string): VisualSpec | null {
  const index = indexOf(spec, name);
  if (index < 0 || label.trim() === '') return null;

  return withColumn(spec, index, (column) => ({ ...column, displayName: label.trim() }));
}

/**
 * Troca o tipo: converte toda a coluna e RE-DERIVA o papel.
 *
 * Re-derivar e o comportamento certo porque o tipo e a escolha mais forte: quem
 * marca uma coluna como texto acabou de dizer que ela nao e uma medida. Quem
 * precisa do caso raro ("Ano" e inteiro mas agrupa) troca o papel depois, e a
 * troca manual sobrevive — nada aqui a desfaz enquanto o tipo nao mudar de novo.
 *
 * O valor que nao couber no tipo novo vira celula vazia (`coerceCell`). Guardar
 * um `"abc"` numa coluna de moeda reprovaria a spec inteira na proxima
 * validacao, com um erro que nao aponta para a celula.
 */
export function setColumnType(spec: VisualSpec, name: string, type: ColumnType): VisualSpec | null {
  const index = indexOf(spec, name);
  const current = spec.data.columns[index];
  if (index < 0 || !current) return null;
  if (current.type === type) return null;

  const kind = KIND_FOR_TYPE[type];
  const next: VisualSpec = {
    ...spec,
    data: {
      columns: spec.data.columns.map((column, position) =>
        position === index ? { ...column, type, kind } : column,
      ),
      rows: spec.data.rows.map((row) =>
        row.map((cell, position) => (position === index ? coerceCell(cell, type) : cell)),
      ),
    },
  };

  return kind === current.kind ? next : { ...next, root: unbindRole(next.root, name) };
}

/**
 * Troca manual do papel. Desliga as ligacoes, que passaram a exigir o outro tipo.
 *
 * Sem desligar, o no fica apontando para uma coluna que agora e agrupamento num
 * campo que exige medida — e `validateSpec` reprova a spec inteira com
 * "papel X e grouping, mas o campo exige measure", uma mensagem que fala do no e
 * nao da coluna em que o usuario acabou de clicar.
 */
export function setColumnKind(spec: VisualSpec, name: string, kind: RoleKind): VisualSpec | null {
  const index = indexOf(spec, name);
  const current = spec.data.columns[index];
  if (index < 0 || !current || current.kind === kind) return null;

  return {
    ...withColumn(spec, index, (column) => ({ ...column, kind })),
    root: unbindRole(spec.root, name),
  };
}

/** Linha nova, toda vazia. */
export function addRow(spec: VisualSpec): VisualSpec | null {
  if (spec.data.rows.length >= MAX_ROWS) return null;

  const empty: CellValue[] = spec.data.columns.map(() => null);
  return { ...spec, data: { ...spec.data, rows: [...spec.data.rows, empty] } };
}

export function removeRow(spec: VisualSpec, index: number): VisualSpec | null {
  // A ultima linha nao sai: uma tabela sem linha nenhuma deixa todo grafico do
  // preview vazio, e o usuario le isso como visual quebrado, nao como tabela vazia.
  if (index < 0 || index >= spec.data.rows.length || spec.data.rows.length <= 1) return null;

  return {
    ...spec,
    data: { ...spec.data, rows: spec.data.rows.filter((_, position) => position !== index) },
  };
}

/**
 * Escreve uma celula. O valor ja chega parseado pelo controle (`parseCell`);
 * aqui ele so e prendido ao tipo da coluna, para o caso de vir de outro caminho.
 */
export function setCell(
  spec: VisualSpec,
  row: number,
  column: number,
  value: CellValue,
): VisualSpec | null {
  const target = spec.data.rows[row];
  const meta = spec.data.columns[column];
  if (!target || !meta) return null;

  return {
    ...spec,
    data: {
      ...spec.data,
      rows: spec.data.rows.map((current, position) =>
        position === row
          ? current.map((cell, at) => (at === column ? coerceCell(value, meta.type) : cell))
          : current,
      ),
    },
  };
}

function withColumn(
  spec: VisualSpec,
  index: number,
  edit: (column: DataColumn) => DataColumn,
): VisualSpec {
  return {
    ...spec,
    data: {
      ...spec.data,
      columns: spec.data.columns.map((column, position) =>
        position === index ? edit(column) : column,
      ),
    },
  };
}
