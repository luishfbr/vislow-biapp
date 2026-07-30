/**
 * Nos de grafico, sobre Recharts.
 *
 * Recharts foi aprovado no gate do backend (ADR-08): 5 tipos de grafico custam
 * 645 KB de `content.js` contra o limite de 1 MB, com ~17 KB de custo marginal
 * por tipo. Os imports sao NOMEADOS de proposito — e o que permite ao webpack
 * fazer tree-shaking e levar so os tipos que o usuario usou.
 *
 * Sem hooks nossos aqui, pela regra do achado 39 (ha guarda de ESLint). O
 * Recharts usa hooks internamente, mas o visual compilado nasce de um `npm
 * install` limpo, sem o layout de symlinks que duplicava o React.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '../states.js';
import { missingRoles, seriesOf, type DataFrame, type SeriesPoint } from './frame.js';

/** Props de eixo comuns aos graficos cartesianos. Espelha `AXIS_FIELDS`. */
export interface AxisProps {
  showGrid: boolean;
  showTooltip: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
}

interface SeriesProps {
  frame: DataFrame;
  categoryRole: string;
  measureRole: string;
}

const AXIS_STYLE = { fontSize: 11, fill: '#64748b' } as const;
const GRID_COLOR = '#e2e8f0';

/** Paleta de fatias da pizza. Cores literais, nunca derivadas em runtime. */
const SLICE_COLORS: [string, ...string[]] = [
  '#3b82f6',
  '#f97316',
  '#16a34a',
  '#a855f7',
  '#ef4444',
  '#0ea5e9',
  '#eab308',
];

/** Tupla nao-vazia: o `?? [0]` e o que prova ao compilador que sempre ha cor. */
function sliceColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length] ?? SLICE_COLORS[0];
}

/**
 * O valor que o host ja formatou vence o numero cru no tooltip (RF-17).
 * Sem isso o tooltip mostraria `1234567.89` onde o Power BI mostra `R$ 1,23 mi`.
 */
function tooltipFormatter(_value: unknown, _name: unknown, item: unknown): [string, string] {
  const payload = (item as { payload?: Partial<SeriesPoint> } | undefined)?.payload;
  return [payload?.formatted ?? '', payload?.category ?? ''];
}

/** Casca que da area util ao `ResponsiveContainer`. Ver o comentario do Container. */
function ChartShell({ children }: { children: React.ReactElement }) {
  return (
    <div className="pbi:flex-1 pbi:min-h-0 pbi:min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Papeis nao preenchidos -> estado vazio. Devolve `null` quando pode desenhar.
 * Centralizado para que nenhum tipo novo de grafico esqueca a RN-04.
 */
function guard(props: SeriesProps): { data: SeriesPoint[] } | { empty: string[] } {
  const data = seriesOf(props.frame, props.categoryRole, props.measureRole);
  if (!data) return { empty: missingRoles(props.frame, props.categoryRole, props.measureRole) };
  return { data };
}

export function BarChartNode({
  frame,
  categoryRole,
  measureRole,
  color,
  layout,
  showGrid,
  showTooltip,
  showXAxis,
  showYAxis,
}: SeriesProps & AxisProps & { color: string; layout: 'vertical' | 'horizontal' }) {
  const result = guard({ frame, categoryRole, measureRole });
  if ('empty' in result) return <EmptyState missing={result.empty} />;

  // ATENCAO a inversao de vocabulario: para o usuario, "vertical" e a barra que
  // sobe. Para o Recharts, `layout="vertical"` e a barra que cresce para a
  // direita. Traduzir aqui, uma vez, em vez de espalhar a confusao pelo codegen.
  const horizontalBars = layout === 'horizontal';

  return (
    <ChartShell>
      <BarChart data={result.data} layout={horizontalBars ? 'vertical' : 'horizontal'}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />}
        {showXAxis && (
          <XAxis
            {...(horizontalBars
              ? { type: 'number' as const }
              : { type: 'category' as const, dataKey: 'category' })}
            tick={AXIS_STYLE}
          />
        )}
        {showYAxis && (
          <YAxis
            {...(horizontalBars
              ? { type: 'category' as const, dataKey: 'category', width: 90 }
              : { type: 'number' as const })}
            tick={AXIS_STYLE}
          />
        )}
        {showTooltip && <Tooltip formatter={tooltipFormatter} />}
        <Bar dataKey="value" fill={color} isAnimationActive={false} />
      </BarChart>
    </ChartShell>
  );
}

export function LineChartNode({
  frame,
  categoryRole,
  measureRole,
  color,
  strokeWidth,
  showDots,
  showGrid,
  showTooltip,
  showXAxis,
  showYAxis,
}: SeriesProps & AxisProps & { color: string; strokeWidth: number; showDots: boolean }) {
  const result = guard({ frame, categoryRole, measureRole });
  if ('empty' in result) return <EmptyState missing={result.empty} />;

  return (
    <ChartShell>
      <LineChart data={result.data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />}
        {showXAxis && <XAxis dataKey="category" tick={AXIS_STYLE} />}
        {showYAxis && <YAxis tick={AXIS_STYLE} />}
        {showTooltip && <Tooltip formatter={tooltipFormatter} />}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={strokeWidth}
          dot={showDots}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartShell>
  );
}

export function AreaChartNode({
  frame,
  categoryRole,
  measureRole,
  color,
  fillOpacity,
  showGrid,
  showTooltip,
  showXAxis,
  showYAxis,
}: SeriesProps & AxisProps & { color: string; fillOpacity: number }) {
  const result = guard({ frame, categoryRole, measureRole });
  if ('empty' in result) return <EmptyState missing={result.empty} />;

  return (
    <ChartShell>
      <AreaChart data={result.data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />}
        {showXAxis && <XAxis dataKey="category" tick={AXIS_STYLE} />}
        {showYAxis && <YAxis tick={AXIS_STYLE} />}
        {showTooltip && <Tooltip formatter={tooltipFormatter} />}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          fill={color}
          // O campo do registro e percentual (5..100); o Recharts quer 0..1.
          fillOpacity={fillOpacity / 100}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartShell>
  );
}

export function PieChartNode({
  frame,
  categoryRole,
  measureRole,
  innerRadius,
  showLegend,
  showTooltip,
}: SeriesProps & { innerRadius: number; showLegend: boolean; showTooltip: boolean }) {
  const result = guard({ frame, categoryRole, measureRole });
  if ('empty' in result) return <EmptyState missing={result.empty} />;

  // A cor da fatia vai no PROPRIO dado, nao num `<Cell>`: o Cell esta deprecado
  // no Recharts 3 e some na 4. O `Pie` le `entry.fill` quando existe e so cai no
  // `fill` do proprio Pie quando nao (Pie.js:379).
  const slices = result.data.map((point, index) => ({ ...point, fill: sliceColor(index) }));

  return (
    <ChartShell>
      <PieChart>
        {showTooltip && <Tooltip formatter={tooltipFormatter} />}
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        <Pie
          data={slices}
          dataKey="value"
          nameKey="category"
          innerRadius={`${String(innerRadius)}%`}
          outerRadius="80%"
          isAnimationActive={false}
        />
      </PieChart>
    </ChartShell>
  );
}
