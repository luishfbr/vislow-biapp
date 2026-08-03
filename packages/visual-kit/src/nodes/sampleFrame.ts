import { formatCell, type CellValue, type ColumnType } from '@vislow/config-schema';
import type { DataFrame, RoleColumn } from './frame.js';

/**
 * Quadro do preview (RF-06), montado a partir da TABELA DE EXEMPLO do usuario.
 *
 * Antes o dado de exemplo era fabricado a partir do nome do papel: um hash
 * decidia a serie, e o usuario compunha contra numeros que nao eram dele. Pior,
 * cada papel tinha serie propria — um KPI ao lado de um grafico contava
 * historias diferentes da MESMA linha, porque nao havia linha nenhuma.
 *
 * Agora ha: o usuario declara as colunas e digita as linhas, e este arquivo so
 * transpoe. Duas medidas da mesma linha ficam coerentes entre si porque sao,
 * de fato, a mesma linha.
 *
 * Nao importa `SampleTable` do `@vislow/component-registry` de proposito: o kit
 * e folha do grafo de pacotes e fica assim. A entrada e estrutural, e
 * `SampleTable` satisfaz.
 *
 * RN-02: nenhum dado real do modelo do Power BI passa por aqui — o editor nao
 * tem acesso a ele. O que passa e o que o usuario digitou.
 */

interface SampleColumn {
  name: string;
  displayName: string;
  type: ColumnType;
}

export interface SampleInput {
  columns: readonly SampleColumn[];
  /** Alinhadas as colunas por indice — `rows[linha][coluna]`. */
  rows: readonly (readonly CellValue[])[];
}

/**
 * Valor bruto no formato que os nos esperam.
 *
 * `RoleColumn.values` nao aceita booleano: o eixo de um grafico desenha texto ou
 * numero, e um `true` cru chegaria ao SVG como categoria sem nome. O booleano
 * vira o mesmo "Sim"/"Não" que o usuario le na celula — que e o que ele espera
 * ver na legenda.
 */
function rawValue(cell: CellValue, type: ColumnType): string | number | null {
  if (cell === null) return null;
  if (typeof cell === 'boolean') return formatCell(cell, type);
  return cell;
}

/**
 * Monta o quadro de exemplo.
 *
 * Uma coluna declarada SEMPRE vira coluna do quadro. O estado vazio da RN-04 no
 * preview vem de campo nao ligado no no — que e o caso real que o usuario
 * precisa ver —, e nao de coluna ausente do quadro.
 *
 * O `title` e o `displayName`, e nao o `name`: e o rotulo que aparece no eixo e
 * na legenda, e e tambem o que o host mandaria no visual compilado.
 */
export function sampleFrame(table: SampleInput, locale = 'pt-BR'): DataFrame {
  const roles: Record<string, RoleColumn | undefined> = {};

  table.columns.forEach((column, index) => {
    const cells = table.rows.map((row) => row[index] ?? null);
    roles[column.name] = {
      title: column.displayName,
      values: cells.map((cell) => rawValue(cell, column.type)),
      formatted: cells.map((cell) => formatCell(cell, column.type, locale)),
    };
  });

  return { roles, locale };
}
