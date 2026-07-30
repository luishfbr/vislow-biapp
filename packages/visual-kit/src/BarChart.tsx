import { useMemo } from 'react';
import type { VisualConfig } from '@vislow/config-schema';
import { FONT_SIZE_CLASS, RADIUS_TOP_CLASS, cx } from './tokens.js';
import { DIMMED_OPACITY, resolveColors } from './theme.js';
import { Frame } from './Frame.js';
import type { DataPoint, RenderContext } from './types.js';

const GRID_LINES = 4;

export function BarChart({
  config,
  data,
  context = {},
}: {
  config: VisualConfig;
  data: DataPoint[];
  context?: RenderContext;
}) {
  const colors = resolveColors(config, context);
  const bar = config.bar;

  // Calculado UMA vez por render. Ja foi bug: estava dentro do .map, o que
  // tornava o render O(n^2) e arriscava estourar a pilha com Math.max(...args).
  const maxValue = useMemo(() => data.reduce((m, d) => Math.max(m, d.value), 0), [data]);
  const hasSelection = useMemo(() => data.some((d) => d.selected), [data]);

  if (!bar) return null;

  return (
    <Frame config={config} colors={colors}>
      <div className="pbi:relative pbi:flex-1 pbi:min-h-0">
        {bar.showGridLines && (
          <div aria-hidden className="pbi:absolute pbi:inset-0 pbi:flex pbi:flex-col pbi:justify-between">
            {Array.from({ length: GRID_LINES + 1 }, (_, i) => (
              <div key={i} style={{ borderTop: `1px solid ${colors.grid}` }} />
            ))}
          </div>
        )}

        <div
          className="pbi:relative pbi:h-full pbi:flex pbi:items-end pbi:gap-2"
          role="list"
          aria-label={config.labels.valueAxis}
        >
          {data.map((point, index) => {
            const heightPct = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
            const dimmed = hasSelection && !point.selected;

            return (
              <div
                key={`${point.category}-${String(index)}`}
                role="listitem"
                tabIndex={0}
                aria-label={`${point.category}: ${point.formattedValue}`}
                aria-selected={point.selected}
                className={cx(
                  'pbi:flex-1',
                  'pbi:min-w-0',
                  'pbi:h-full',
                  'pbi:flex',
                  'pbi:flex-col',
                  'pbi:items-center',
                  'pbi:justify-end',
                  'pbi:cursor-pointer',
                  'pbi:outline-none',
                  'focus-visible:pbi:ring-2',
                )}
                style={{ opacity: dimmed ? DIMMED_OPACITY : 1 }}
                onClick={(e) => context.onSelect?.(index, e.ctrlKey || e.metaKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    context.onSelect?.(index, e.ctrlKey || e.metaKey);
                  }
                }}
                onMouseMove={(e) => context.onHover?.(index, { x: e.clientX, y: e.clientY })}
                onMouseLeave={() => context.onHoverEnd?.()}
              >
                {bar.showValueLabels && (
                  <span
                    className={cx('pbi:mb-1', 'pbi:truncate', FONT_SIZE_CLASS[bar.valueLabelSize])}
                    style={{ color: bar.valueLabelColor }}
                  >
                    {point.formattedValue}
                  </span>
                )}

                <div
                  className={cx('pbi:w-full', RADIUS_TOP_CLASS[bar.barRadius])}
                  style={{ height: `${String(heightPct)}%`, backgroundColor: colors.accent }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="pbi:shrink-0 pbi:flex pbi:gap-2 pbi:pt-2">
        {data.map((point, index) => (
          <span
            key={`label-${point.category}-${String(index)}`}
            className="pbi:flex-1 pbi:min-w-0 pbi:truncate pbi:text-center pbi:text-xs"
            style={{ color: colors.mutedText }}
            title={point.category}
          >
            {point.category}
          </span>
        ))}
      </div>
    </Frame>
  );
}
