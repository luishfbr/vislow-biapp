/**
 * Contrato de dados dos nos do construtor.
 *
 * Depois do pivo para compilacao por usuario (ADR-08) os papeis de dado deixam
 * de ser fixos: cada visual declara os seus no `capabilities.json` gerado. O
 * componente, portanto, nao pode mais receber `DataPoint[]` pronto — ele recebe
 * o quadro inteiro e diz de quais papeis precisa, pelo nome que o USUARIO deu.
 *
 * Este e o mesmo contrato dos dois lados do ADR-04: o visual compilado monta o
 * `DataFrame` a partir do `DataView` do Power BI, o preview do editor monta a
 * partir de dados mock. Mesmo componente, mesma entrada.
 */

export interface RoleColumn {
  /** Nome do campo que o usuario arrastou no relatorio. Vai para eixos e legenda. */
  title: string;
  /** Valores brutos, na ordem das linhas. */
  values: (string | number | null)[];
  /**
   * Valores ja formatados pelo host (locale + format da medida, RF-17).
   * Indice paralelo a `values`.
   */
  formatted: string[];
}

export interface DataFrame {
  /**
   * Coluna por nome de papel. Um papel declarado mas NAO preenchido no relatorio
   * fica ausente — e o que dispara o estado vazio da RN-04 em vez de tela branca.
   */
  roles: Record<string, RoleColumn | undefined>;
  /** Locale do host. Usado para formatar agregados que o host nao formatou. */
  locale: string;
}

export interface SeriesPoint {
  category: string;
  value: number;
  /** Formatado pelo host. Vai para o tooltip e para os rotulos. */
  formatted: string;
}

/** Quadro vazio. Usado antes do primeiro `update` e nos testes. */
export const EMPTY_FRAME: DataFrame = { roles: {}, locale: 'pt-BR' };

/**
 * Une categoria e medida numa serie.
 *
 * Devolve `null` — e nao uma serie vazia — quando um dos papeis nao esta
 * preenchido, porque os dois casos pedem telas diferentes: papel faltando e
 * estado vazio com instrucao (RF-20); serie vazia e um filtro que nao retornou
 * linhas. Confundir os dois faz o visual acusar campo faltando quando o usuario
 * so filtrou demais.
 */
export function seriesOf(
  frame: DataFrame,
  categoryRole: string,
  measureRole: string,
): SeriesPoint[] | null {
  const categories = frame.roles[categoryRole];
  const measures = frame.roles[measureRole];
  if (!categories || !measures) return null;

  return categories.values.map((raw, index) => ({
    category: String(raw ?? ''),
    value: Number(measures.values[index]) || 0,
    formatted: measures.formatted[index] ?? '',
  }));
}

/** Papeis referenciados que faltam no quadro, na ordem em que foram pedidos. */
export function missingRoles(frame: DataFrame, ...roles: string[]): string[] {
  return roles.filter((role) => !frame.roles[role]);
}

/**
 * Soma da medida. E a agregacao do KPI.
 *
 * Formatar o total pelo `formatted` do host nao da: o host formata cada linha,
 * nao o agregado. Cair no `Intl` com o locale do host e o mais proximo — o
 * numero fica com o separador certo mesmo sem herdar o formato da medida.
 */
export function sumOf(frame: DataFrame, measureRole: string): { total: number; formatted: string } | null {
  const column = frame.roles[measureRole];
  if (!column) return null;

  const total = column.values.reduce<number>((acc, raw) => acc + (Number(raw) || 0), 0);
  // Uma linha so: o host ja formatou esse valor exato, entao vale mais que o
  // nosso Intl — preserva moeda, percentual e casas decimais da medida.
  if (column.values.length === 1) {
    return { total, formatted: column.formatted[0] ?? String(total) };
  }
  return {
    total,
    formatted: new Intl.NumberFormat(frame.locale, { maximumFractionDigits: 2 }).format(total),
  };
}
