import { createProjectId, INITIAL_PACKAGE_VERSION } from './identity.js';
import { SCHEMA_VERSION } from './schema.js';
import type { BarConfig, ChartType, HeaderConfig, KpiConfig, LabelsConfig, LayoutConfig, VisualConfig } from './types.js';

/**
 * Defaults do editor.
 *
 * RNF-09: as combinacoes de cor abaixo atendem contraste AA. Alterar um default
 * de cor exige reverificar o contraste — ha teste cobrindo isso.
 */

export const DEFAULT_LAYOUT: LayoutConfig = {
  padding: 'md',
  radius: 'xl',
  shadow: 'sm',
  border: 'thin',
  surfaceColor: '#ffffff',
  borderColor: '#e2e8f0',
};

export const DEFAULT_HEADER: HeaderConfig = {
  show: true,
  text: 'Titulo do visual',
  fontSize: 'lg',
  fontWeight: 'bold',
  align: 'left',
  textColor: '#1e293b',
};

export const DEFAULT_LABELS: LabelsConfig = {
  categoryAxis: 'Categoria',
  valueAxis: 'Valor',
};

export const DEFAULT_BAR: BarConfig = {
  accentColor: '#3b82f6',
  barRadius: 'md',
  showGridLines: true,
  gridColor: '#f1f5f9',
  showValueLabels: true,
  valueLabelColor: '#475569',
  valueLabelSize: 'xs',
  categoryLabelColor: '#64748b',
};

export const DEFAULT_KPI: KpiConfig = {
  accentColor: '#3b82f6',
  valueFontSize: '4xl',
  labelFontSize: 'sm',
  labelColor: '#64748b',
  showComparison: true,
  positiveColor: '#16a34a',
  negativeColor: '#dc2626',
};

/** Cria um projeto novo, ja valido contra o schema. */
export function createDefaultConfig(name: string, chartType: ChartType = 'bar'): VisualConfig {
  const base = {
    schemaVersion: SCHEMA_VERSION,
    project: {
      id: createProjectId(name),
      name,
      packageVersion: INITIAL_PACKAGE_VERSION,
    },
    chartType,
    layout: { ...DEFAULT_LAYOUT },
    header: { ...DEFAULT_HEADER, text: name },
    labels: { ...DEFAULT_LABELS },
  };

  return chartType === 'bar'
    ? { ...base, bar: { ...DEFAULT_BAR } }
    : { ...base, kpi: { ...DEFAULT_KPI } };
}

/**
 * Troca o tipo de visual preservando os tokens comuns (RF-01) e preenchendo
 * com defaults o bloco especifico que ainda nao existe.
 */
export function withChartType(config: VisualConfig, chartType: ChartType): VisualConfig {
  if (config.chartType === chartType) return config;
  const next: VisualConfig = { ...config, chartType };
  if (chartType === 'bar') next.bar ??= { ...DEFAULT_BAR };
  else next.kpi ??= { ...DEFAULT_KPI };
  return next;
}
