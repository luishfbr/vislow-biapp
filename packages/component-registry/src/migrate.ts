/**
 * Migracao do config plano v1 para a arvore v2.
 *
 * Existe porque projetos v1 estao salvos no `localStorage` de quem ja usou o
 * editor. Descartar seria perder o `project.id` — e com ele a capacidade de
 * *atualizar* o visual no Power BI em vez de duplicar (RF-10). A identidade e a
 * parte insubstituivel; o resto e aparencia.
 */
import type { VisualConfig } from '@vislow/config-schema';
import { createNode } from './factory.js';
import { SPEC_VERSION, type DataRole, type SpecNode, type VisualSpec } from './spec.js';

const V1_ROLES: DataRole[] = [
  { name: 'categoria', displayName: 'Categoria', kind: 'grouping' },
  { name: 'valor', displayName: 'Valor', kind: 'measure' },
];

/** Reconhece um documento no formato v1 sem confiar apenas no schemaVersion. */
export function isV1Config(value: unknown): value is VisualConfig {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<VisualConfig> & { root?: unknown };
  return (
    candidate.root === undefined &&
    typeof candidate.chartType === 'string' &&
    typeof candidate.layout === 'object'
  );
}

export function migrateV1ToV2(config: VisualConfig): VisualSpec {
  const { layout, header, chartType } = config;

  const children: SpecNode[] = [];

  if (header.show && header.text !== '') {
    const text = createNode('text');
    text.props = {
      ...text.props,
      content: header.text,
      fontSize: header.fontSize,
      fontWeight: header.fontWeight,
      align: header.align,
      color: header.textColor,
    };
    children.push(text);
  }

  if (chartType === 'bar') {
    const bar = createNode('barChart', { categoryRole: 'categoria', measureRole: 'valor' });
    bar.props = {
      ...bar.props,
      color: config.bar?.accentColor ?? '#3b82f6',
      showGrid: config.bar?.showGridLines ?? true,
    };
    children.push(bar);
  } else {
    const kpi = createNode('kpi', { measureRole: 'valor' });
    kpi.props = {
      ...kpi.props,
      valueFontSize: config.kpi?.valueFontSize ?? '4xl',
      valueColor: config.kpi?.accentColor ?? '#3b82f6',
      labelColor: config.kpi?.labelColor ?? '#64748b',
    };
    children.push(kpi);
  }

  // A moldura do v1 vira o container raiz: mesmo papel, mesmos tokens.
  const root = createNode('container');
  root.props = {
    ...root.props,
    direction: 'column',
    padding: layout.padding,
    radius: layout.radius,
    border: layout.border,
    shadow: layout.shadow,
    background: layout.surfaceColor,
    borderColor: layout.borderColor,
  };
  root.children = children;

  return {
    schemaVersion: SPEC_VERSION,
    // Preservado integralmente — e o ponto da migracao.
    project: { ...config.project },
    dataRoles: V1_ROLES.map((role) => ({ ...role })),
    root,
  };
}
