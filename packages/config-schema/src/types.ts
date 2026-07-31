import type { Align, Border, FontSize, FontWeight, Radius, Shadow, Spacing } from './tokens.js';

/** Cor no formato `#RRGGBB`. Ver COLOR_PATTERN em tokens.ts. */
export type HexColor = string;

/** Versao do pacote no formato de 4 componentes exigido pelo Power BI (RN-07). */
export type PackageVersion = `${number}.${number}.${number}.${number}`;

export type ChartType = 'bar' | 'kpi';

export interface ProjectIdentity {
  /**
   * Identidade do visual. Vira o GUID do pacote E o nome de uma variavel
   * JavaScript dentro do bundle (verificado no spike, docs/build-visual.md), portanto
   * precisa casar com `^[A-Za-z][A-Za-z0-9]*$`.
   *
   * Gerado UMA vez, na criacao do projeto, e imutavel dai em diante (RN-01).
   */
  id: string;
  /** Nome legivel, 3-50 chars. Vira o displayName no Power BI (RN-06). */
  name: string;
  packageVersion: PackageVersion;
}

export interface LayoutConfig {
  padding: Spacing;
  radius: Radius;
  shadow: Shadow;
  border: Border;
  surfaceColor: HexColor;
  borderColor: HexColor;
}

export interface HeaderConfig {
  show: boolean;
  text: string;
  fontSize: FontSize;
  fontWeight: FontWeight;
  align: Align;
  textColor: HexColor;
}

export interface BarConfig {
  accentColor: HexColor;
  barRadius: Radius;
  showGridLines: boolean;
  gridColor: HexColor;
  showValueLabels: boolean;
  valueLabelColor: HexColor;
  valueLabelSize: FontSize;
  categoryLabelColor: HexColor;
}

export interface KpiConfig {
  accentColor: HexColor;
  valueFontSize: FontSize;
  labelFontSize: FontSize;
  labelColor: HexColor;
  showComparison: boolean;
  positiveColor: HexColor;
  negativeColor: HexColor;
}

export interface LabelsConfig {
  categoryAxis: string;
  valueAxis: string;
}

export interface VisualConfig {
  schemaVersion: string;
  project: ProjectIdentity;
  chartType: ChartType;
  layout: LayoutConfig;
  header: HeaderConfig;
  labels: LabelsConfig;
  /** Obrigatorio quando chartType === 'bar' (ver allOf no schema). */
  bar?: BarConfig;
  /** Obrigatorio quando chartType === 'kpi'. */
  kpi?: KpiConfig;
}

export type BarVisualConfig = VisualConfig & { chartType: 'bar'; bar: BarConfig };
export type KpiVisualConfig = VisualConfig & { chartType: 'kpi'; kpi: KpiConfig };
