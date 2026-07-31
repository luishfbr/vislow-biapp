/**
 * Traducao `DataView` -> `DataFrame`. ESTATICO: identico em todo visual gerado.
 *
 * Fica no template, e nao no codegen, de proposito. O que muda por build e so a
 * arvore e a identidade; tudo que e igual em todo visual mora aqui. Essa
 * fronteira e o que permite cachear o `npm ci` e revisar o codigo de leitura de
 * dados uma vez, em vez de a cada spec.
 *
 * O `visual-kit` nao conhece o Power BI — e este arquivo que faz a ponte, do
 * mesmo jeito que o preview do editor monta o `DataFrame` a partir de mock.
 * Mesmo componente dos dois lados (ADR-04).
 *
 * A leitura acontece em DOIS passos — casar papel com coluna, depois formatar —
 * porque a selecao precisa do meio do caminho: o `createSelectionIdBuilder`
 * quer a `DataViewCategoryColumn` crua, que o quadro ja descartou. Ver
 * `interaction.ts`.
 */
import type powerbi from 'powerbi-visuals-api';
import { valueFormatter } from 'powerbi-visuals-utils-formattingutils';
import type { DataFrame, RoleColumn } from '@vislow/visual-kit/nodes';

type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
type DataViewCategoryColumn = powerbi.DataViewCategoryColumn;

/** Bate com o `dataReductionAlgorithm` do capabilities.json gerado (RF-25). */
export const CATEGORY_LIMIT = 1000;

/** Coluna do relatorio ja casada com o papel que a arvore pediu. */
export interface MatchedColumn {
  role: string;
  source: DataViewMetadataColumn;
  values: powerbi.PrimitiveValue[];
  /**
   * Presente so quando a coluna veio de `categories`. E a unica que gera
   * selection id: filtrar por uma medida nao faz sentido para o host.
   */
  category?: DataViewCategoryColumn;
}

/**
 * Casa os papeis que a arvore consome com as colunas do `DataView`.
 *
 * Um papel declarado no `capabilities.json` mas nao preenchido no relatorio
 * simplesmente NAO aparece no resultado — e o que faz o no cair no estado vazio
 * com instrucao em vez de renderizar em branco (RN-04 / RF-20).
 */
export function matchRoles(options: VisualUpdateOptions, roles: string[]): MatchedColumn[] {
  const categorical = options.dataViews?.[0]?.categorical;
  const categories = categorical?.categories ?? [];
  const values = categorical?.values ?? [];

  const matched: MatchedColumn[] = [];

  for (const role of roles) {
    const category = categories.find((candidate) => candidate.source.roles?.[role] === true);
    if (category) {
      matched.push({ role, source: category.source, values: category.values, category });
      continue;
    }
    const measure = values.find((candidate) => candidate.source.roles?.[role] === true);
    if (measure) {
      matched.push({ role, source: measure.source, values: measure.values });
    }
  }

  return matched;
}

/**
 * Formatador que respeita o `format` da coluna no modelo e o locale do host.
 *
 * RF-17: sem isso o visual mostra `1234.5678` onde o modelo pede `R$ 1.234,57`
 * — um dos sinais mais rapidos de que um visual customizado e amador.
 */
function makeFormatter(column: DataViewMetadataColumn, locale: string) {
  const format = column.format;
  // A opcao precisa estar AUSENTE, nao presente com valor `undefined`: o
  // valueFormatter distingue os dois casos.
  return valueFormatter.create(
    format === undefined ? { cultureSelector: locale } : { format, cultureSelector: locale },
  );
}

/** Monta o quadro a partir das colunas casadas. */
export function readDataFrame(matched: MatchedColumn[], locale: string): DataFrame {
  const out: Record<string, RoleColumn | undefined> = {};

  for (const column of matched) {
    const format = makeFormatter(column.source, locale);
    out[column.role] = {
      title: column.source.displayName,
      values: column.values as (string | number | null)[],
      formatted: column.values.map((value) => format.format(value)),
    };
  }

  return { roles: out, locale };
}

/**
 * RF-25 — o host corta em `CATEGORY_LIMIT` e nao avisa ninguem.
 *
 * Devolve `undefined` quando nao truncou: o quadro carrega a marca so no caso
 * anormal, e o aviso na tela nasce da presenca dela.
 */
export function truncationOf(matched: MatchedColumn[]): DataFrame['truncated'] {
  for (const column of matched) {
    if (column.category && column.values.length >= CATEGORY_LIMIT) {
      return { shown: column.values.length, limit: CATEGORY_LIMIT };
    }
  }
  return undefined;
}
