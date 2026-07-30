import type powerbi from 'powerbi-visuals-api';
import { valueFormatter } from 'powerbi-visuals-utils-formattingutils';
import type { DataPoint, KpiDatum } from '@vislow/visual-kit';

type DataView = powerbi.DataView;
type ISelectionId = powerbi.extensibility.ISelectionId;
type IVisualHost = powerbi.extensibility.visual.IVisualHost;

/** Limite declarado no capabilities.json (RN-10). */
export const CATEGORY_LIMIT = 1000;

export interface BarViewModel {
  kind: 'bar';
  points: DataPoint[];
  selectionIds: ISelectionId[];
  truncated: boolean;
}

export interface KpiViewModel {
  kind: 'kpi';
  datum: KpiDatum;
}

export interface EmptyViewModel {
  kind: 'empty';
  /** Roles que faltam, em linguagem de usuario (RF-20). */
  missing: string[];
}

export type ViewModel = BarViewModel | KpiViewModel | EmptyViewModel;

function roleColumn(
  values: powerbi.DataViewValueColumns | undefined,
  role: string,
): powerbi.DataViewValueColumn | undefined {
  return values?.find((v) => v.source.roles?.[role] === true);
}

/**
 * Formatador que respeita o `format` da coluna no modelo e o locale do host.
 *
 * RF-17: sem isso o visual mostra `1234.5678` onde o modelo pede `R$ 1.234,57`
 * — um dos sinais mais rapidos de que um visual customizado e amador.
 */
function makeFormatter(column: powerbi.DataViewMetadataColumn | undefined, locale: string) {
  const format = column?.format;
  // `exactOptionalPropertyTypes`: a opcao precisa estar AUSENTE, nao presente
  // com valor undefined — o valueFormatter distingue os dois casos.
  return valueFormatter.create(
    format === undefined ? { cultureSelector: locale } : { format, cultureSelector: locale },
  );
}

export function buildViewModel(
  dataView: DataView | undefined,
  chartType: 'bar' | 'kpi',
  host: IVisualHost,
): ViewModel {
  const categorical = dataView?.categorical;
  const category = categorical?.categories?.[0];
  const measure = roleColumn(categorical?.values, 'measure');
  const target = roleColumn(categorical?.values, 'target');

  if (chartType === 'kpi') {
    if (!measure) return { kind: 'empty', missing: ['Valor'] };

    const fmt = makeFormatter(measure.source, host.locale);
    const total = measure.values.reduce<number>((sum, v) => sum + (Number(v) || 0), 0);

    const datum: KpiDatum = {
      formattedValue: fmt.format(total),
      label: measure.source.displayName,
    };

    if (target) {
      const targetTotal = target.values.reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
      if (targetTotal !== 0) {
        const ratio = (total - targetTotal) / Math.abs(targetTotal);
        datum.comparison = {
          formattedValue: makeFormatter(target.source, host.locale).format(targetTotal),
          deltaRatio: ratio,
          formattedDelta: `${Math.abs(ratio * 100).toFixed(1).replace('.', ',')}%`,
        };
      }
    }

    return { kind: 'kpi', datum };
  }

  // chartType === 'bar'
  const missing: string[] = [];
  if (!category) missing.push('Categoria');
  if (!measure) missing.push('Valor');
  if (!category || !measure) return { kind: 'empty', missing };

  const fmt = makeFormatter(measure.source, host.locale);
  const points: DataPoint[] = [];
  const selectionIds: ISelectionId[] = [];

  for (let i = 0; i < category.values.length; i++) {
    points.push({
      category: String(category.values[i] ?? ''),
      value: Number(measure.values[i]) || 0,
      formattedValue: fmt.format(measure.values[i]),
      selected: false,
    });
    selectionIds.push(
      host.createSelectionIdBuilder().withCategory(category, i).createSelectionId(),
    );
  }

  return {
    kind: 'bar',
    points,
    selectionIds,
    // RF-25: o dataReductionAlgorithm corta em CATEGORY_LIMIT sem avisar.
    truncated: category.values.length >= CATEGORY_LIMIT,
  };
}
