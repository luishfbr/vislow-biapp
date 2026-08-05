import {
  LEGACY_BORDER,
  LEGACY_FONT_SIZE,
  LEGACY_RADIUS,
  LEGACY_SPACING,
} from './legacyTokens.js';
import { ALIGN, COLOR_PATTERN, FONT_WEIGHT, SHADOW } from './tokens.js';

/**
 * Versao do schema (RN-09/RN-12). Semver.
 * - patch/minor: mudancas ADITIVAS. Runtime antigo renderiza aplicando defaults.
 * - major: quebra. Runtime antigo exibe card de erro e uma migracao e obrigatoria.
 */
export const SCHEMA_VERSION = '1.0.0';

/** Identificador do visual: tambem e nome de variavel JS no bundle (docs/build-visual.md). */
export const PROJECT_ID_PATTERN = '^[A-Za-z][A-Za-z0-9]{7,63}$';

/** Versao do pacote no formato de 4 componentes do Power BI (RN-07). */
export const PACKAGE_VERSION_PATTERN = '^\\d+\\.\\d+\\.\\d+\\.\\d+$';

const color = { type: 'string', pattern: COLOR_PATTERN } as const;
const enumOf = (values: readonly string[]) => ({ enum: [...values] });

const object = (props: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});

/**
 * `additionalProperties: false` em TODO objeto e intencional: e a fronteira que
 * faz RN-05 valer e impede que um config de versao futura passe silenciosamente
 * por um runtime antigo.
 */
export const visualConfigSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `https://vislow.app/schemas/visual-config/${SCHEMA_VERSION}.json`,
  title: 'VisualConfig',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'project', 'chartType', 'layout', 'header', 'labels'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    project: object({
      id: { type: 'string', pattern: PROJECT_ID_PATTERN },
      name: { type: 'string', minLength: 3, maxLength: 50 },
      packageVersion: { type: 'string', pattern: PACKAGE_VERSION_PATTERN },
    }),
    chartType: enumOf(['bar', 'kpi']),
    layout: object({
      padding: enumOf(LEGACY_SPACING),
      radius: enumOf(LEGACY_RADIUS),
      shadow: enumOf(SHADOW),
      border: enumOf(LEGACY_BORDER),
      surfaceColor: color,
      borderColor: color,
    }),
    header: object({
      show: { type: 'boolean' },
      text: { type: 'string', maxLength: 200 },
      fontSize: enumOf(LEGACY_FONT_SIZE),
      fontWeight: enumOf(FONT_WEIGHT),
      align: enumOf(ALIGN),
      textColor: color,
    }),
    labels: object({
      categoryAxis: { type: 'string', maxLength: 100 },
      valueAxis: { type: 'string', maxLength: 100 },
    }),
    bar: object({
      accentColor: color,
      barRadius: enumOf(LEGACY_RADIUS),
      showGridLines: { type: 'boolean' },
      gridColor: color,
      showValueLabels: { type: 'boolean' },
      valueLabelColor: color,
      valueLabelSize: enumOf(LEGACY_FONT_SIZE),
      categoryLabelColor: color,
    }),
    kpi: object({
      accentColor: color,
      valueFontSize: enumOf(LEGACY_FONT_SIZE),
      labelFontSize: enumOf(LEGACY_FONT_SIZE),
      labelColor: color,
      showComparison: { type: 'boolean' },
      positiveColor: color,
      negativeColor: color,
    }),
  },
  allOf: [
    {
      if: { properties: { chartType: { const: 'bar' } }, required: ['chartType'] },
      then: { required: ['bar'] },
    },
    {
      if: { properties: { chartType: { const: 'kpi' } }, required: ['chartType'] },
      then: { required: ['kpi'] },
    },
  ],
} as const;
