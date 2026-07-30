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
 */
import type powerbi from 'powerbi-visuals-api';
import { valueFormatter } from 'powerbi-visuals-utils-formattingutils';
import type { DataFrame, RoleColumn } from '@vislow/visual-kit/nodes';

type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type DataViewMetadataColumn = powerbi.DataViewMetadataColumn;

/** Bate com o `dataReductionAlgorithm` do capabilities.json gerado (RF-25). */
export const CATEGORY_LIMIT = 1000;

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

/**
 * Le do `DataView` apenas os papeis que a arvore consome.
 *
 * Um papel declarado no `capabilities.json` mas nao preenchido no relatorio fica
 * AUSENTE do quadro — e o que faz o no cair no estado vazio com instrucao em vez
 * de renderizar em branco (RN-04 / RF-20).
 */
export function readDataFrame(
  options: VisualUpdateOptions,
  roles: string[],
  locale: string,
): DataFrame {
  const categorical = options.dataViews?.[0]?.categorical;

  // Categorias e valores num unico varredor: o papel diz de qual lado a coluna
  // veio, entao o codigo de leitura nao precisa saber.
  const columns: { source: DataViewMetadataColumn; values: powerbi.PrimitiveValue[] }[] = [
    ...(categorical?.categories ?? []),
    ...(categorical?.values ?? []),
  ];

  const out: Record<string, RoleColumn | undefined> = {};

  for (const role of roles) {
    const column = columns.find((candidate) => candidate.source.roles?.[role] === true);
    if (!column) continue;

    const format = makeFormatter(column.source, locale);
    out[role] = {
      title: column.source.displayName,
      values: column.values as (string | number | null)[],
      formatted: column.values.map((value) => format.format(value)),
    };
  }

  return { roles: out, locale };
}
