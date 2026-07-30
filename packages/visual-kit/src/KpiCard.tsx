import type { VisualConfig } from '@vislow/config-schema';
import { FONT_SIZE_CLASS, cx } from './tokens.js';
import { resolveColors } from './theme.js';
import { Frame } from './Frame.js';
import type { KpiDatum, RenderContext } from './types.js';

export function KpiCard({
  config,
  datum,
  context = {},
}: {
  config: VisualConfig;
  datum: KpiDatum;
  context?: RenderContext;
}) {
  const colors = resolveColors(config, context);
  const kpi = config.kpi;
  if (!kpi) return null;

  const comparison = kpi.showComparison ? datum.comparison : undefined;
  const up = comparison !== undefined && comparison.deltaRatio >= 0;

  return (
    <Frame config={config} colors={colors}>
      <div className="pbi:flex-1 pbi:flex pbi:flex-col pbi:items-center pbi:justify-center pbi:min-h-0">
        <div
          className={cx('pbi:truncate', 'pbi:max-w-full', FONT_SIZE_CLASS[kpi.valueFontSize])}
          style={{ color: colors.accent }}
          title={datum.formattedValue}
        >
          {datum.formattedValue}
        </div>

        <div
          className={cx('pbi:truncate', 'pbi:max-w-full', 'pbi:mt-1', FONT_SIZE_CLASS[kpi.labelFontSize])}
          style={{ color: kpi.labelColor }}
          title={datum.label}
        >
          {datum.label}
        </div>

        {comparison && (
          <div
            className="pbi:mt-2 pbi:text-sm pbi:truncate pbi:max-w-full"
            style={{ color: up ? colors.positive : colors.negative }}
          >
            {/* Seta E sinal: cor sozinha nao comunica direcao para daltonicos
                nem em alto contraste, onde as duas cores podem coincidir. */}
            <span aria-hidden>{up ? '▲' : '▼'}</span>{' '}
            <span>{comparison.formattedDelta}</span>{' '}
            <span style={{ color: kpi.labelColor }}>vs {comparison.formattedValue}</span>
          </div>
        )}
      </div>
    </Frame>
  );
}
