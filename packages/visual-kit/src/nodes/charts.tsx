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
 *
 * ---
 * PARIDADE DE INTERATIVIDADE (Sprint 6). Tres capacidades entram por aqui:
 *
 *  - **RF-18, cross-filter.** Barras e fatias tem area de clique POR MARCA e
 *    usam os handlers do proprio `<Bar>`/`<Pie>`, que ja entregam o indice.
 *    Linha e area nao tem marca por ponto quando o marcador esta desligado,
 *    entao usam o handler do GRAFICO e leem `activeTooltipIndex`. A diferenca e
 *    do Recharts, nao nossa — e o preco de trocar SVG proprio por biblioteca
 *    (o que a Fase 1 tinha era um `<div>` por barra).
 *  - **RF-19, tooltip nativo.** No visual compilado o balao e o do host, para
 *    herdar campos de tooltip do relatorio e se comportar como visual nativo.
 *    No preview do editor nao ha host, entao o balao do Recharts fica — sem
 *    ele, passar o mouse no preview nao mostraria nada.
 *  - **RF-23, teclado.** Cada ponto vira um `<button>` na sobreposicao
 *    `DataKeys`. Ver o comentario de la para o motivo de nao ser um wrapper.
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
import type { ReactNode } from 'react';
import { EmptyState } from '../states.js';
import { DIMMED_OPACITY } from '../theme.js';
import { hcInk, hcSurface } from '../highContrast.js';
import {
  hostOf,
  missingRoles,
  seriesOf,
  type DataFrame,
  type FrameHost,
  type HighContrastPalette,
  type SeriesPoint,
} from './frame.js';

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

const AXIS_INK = '#64748b';
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
 * Paleta de alto contraste, quando o host esta nesse modo (RF-21).
 *
 * Os graficos leem a paleta AQUI em vez de usarem as variaveis CSS de
 * `highContrast.ts`, porque o Recharts emite `fill`/`stroke` como ATRIBUTO de
 * SVG — e `var()` nao e substituido em atributo de apresentacao. Ver o cabecalho
 * de `highContrast.ts`: HTML usa a variavel, SVG le o quadro.
 */
function paletteOf(frame: DataFrame): HighContrastPalette | undefined {
  return hostOf(frame).highContrast;
}

/** Cor de uma marca de dados. Em alto contraste a selecao muda a cor, nao o tom. */
function markColor(
  hc: HighContrastPalette | undefined,
  chosen: string,
  selected: boolean,
): string {
  if (!hc) return chosen;
  return selected ? hc.foregroundSelected : hc.foreground;
}

/** RF-18 — o que nao esta selecionado esmaece; sem selecao, nada esmaece. */
function markOpacity(host: FrameHost, selected: boolean): number {
  return host.hasSelection && !selected ? DIMMED_OPACITY : 1;
}

function axisStyle(hc: HighContrastPalette | undefined): { fontSize: number; fill: string } {
  return { fontSize: 11, fill: hc ? hc.foreground : AXIS_INK };
}

function gridStroke(hc: HighContrastPalette | undefined): string {
  return hc ? hc.foreground : GRID_COLOR;
}

/**
 * O valor que o host ja formatou vence o numero cru no tooltip (RF-17).
 * Sem isso o tooltip mostraria `1234567.89` onde o Power BI mostra `R$ 1,23 mi`.
 */
function tooltipFormatter(_value: unknown, _name: unknown, item: unknown): [string, string] {
  const payload = (item as { payload?: Partial<SeriesPoint> } | undefined)?.payload;
  return [payload?.formatted ?? '', payload?.category ?? ''];
}

/**
 * Estado que o Recharts entrega aos handlers do GRAFICO.
 *
 * Declarado aqui, e reduzido ao que se usa, em vez de importado: o tipo real
 * (`MouseHandlerDataParam`) e interno da biblioteca. Um parametro mais largo
 * que o real e valido por contravariancia — o compilador confere.
 */
interface ChartMouseState {
  /** `null` esta na lista porque o `TooltipIndex` do Recharts o admite. */
  activeTooltipIndex?: number | string | null | undefined;
}

/** Minimo de um evento de mouse. Vale para o do React e para o do DOM. */
interface PointerLike {
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  metaKey: boolean;
}

function pointOf(event: PointerLike): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY };
}

/** Ctrl no Windows, Cmd no Mac — os dois somam a selecao, como no visual nativo. */
function isMulti(event: PointerLike): boolean {
  return event.ctrlKey || event.metaKey;
}

function indexOf(state: ChartMouseState): number | null {
  const raw = state.activeTooltipIndex;
  if (raw === undefined || raw === null || raw === '') return null;
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * Handlers do GRAFICO, para os tipos sem marca por ponto (linha e area).
 *
 * Sao inofensivos no preview: o host inerte transforma tudo em no-op. Manter os
 * mesmos handlers dos dois lados evita um segundo caminho de codigo que so
 * roda no pacote entregue — que e onde ninguem consegue depurar.
 */
function chartEvents(frame: DataFrame, categoryRole: string, measureRole: string) {
  const host = hostOf(frame);
  const roles = [categoryRole, measureRole];

  return {
    onClick: (state: ChartMouseState, event: PointerLike) => {
      const index = indexOf(state);
      if (index === null) return;
      host.select(categoryRole, index, isMulti(event));
    },
    onMouseMove: (state: ChartMouseState, event: PointerLike) => {
      const index = indexOf(state);
      if (index === null) {
        host.hideTooltip();
        return;
      }
      host.showTooltip(roles, index, pointOf(event));
    },
    onMouseLeave: () => {
      host.hideTooltip();
    },
  };
}

/** Handlers de uma MARCA (barra, fatia): o Recharts ja entrega o indice. */
function markEvents(frame: DataFrame, categoryRole: string, measureRole: string) {
  const host = hostOf(frame);
  const roles = [categoryRole, measureRole];

  return {
    click: (_data: unknown, index: number, event: PointerLike) => {
      host.select(categoryRole, index, isMulti(event));
    },
    over: (_data: unknown, index: number, event: PointerLike) => {
      host.showTooltip(roles, index, pointOf(event));
    },
    out: () => {
      host.hideTooltip();
    },
  };
}

/**
 * RF-23 — um botao focalizavel por ponto da serie.
 *
 * Por que uma sobreposicao e nao um wrapper clicavel: um elemento a mais na
 * cadeia de flex e o que o ADR-14 proibe — o `ResponsiveContainer` mede a
 * altura pelo pai e um wrapper a quebra. Este bloco e `absolute`, entao esta
 * fora do fluxo e nao entra na medida.
 *
 * Por que botao de HTML e nao `tabIndex` no SVG: o que o Recharts desenha e
 * gerado por ele, nao por nos — nao ha onde pendurar `aria-label` por marca sem
 * reimplementar as formas. O botao carrega categoria e valor JA FORMATADOS, que
 * e o que um leitor de tela precisa anunciar.
 *
 * `sr-only` ate receber foco: invisivel para quem usa mouse, visivel como
 * etiqueta no canto para quem chega por Tab. O grupo inteiro e
 * `pointer-events-none` — sem isso um botao de 1px roubaria clique do grafico.
 */
/**
 * Setas, Home e End andam pela serie movendo o FOCO do DOM, nao um indice em
 * estado. E o que permite ter navegacao por setas num pacote que nao pode usar
 * hook (achado 39): o irmao ja esta na arvore, basta focar.
 */
const FOCUS_STEP: Record<string, number | 'first' | 'last'> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
};

function moveFocus(current: HTMLElement, step: number | 'first' | 'last'): void {
  const siblings = [...(current.parentElement?.children ?? [])].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  if (siblings.length === 0) return;

  const here = siblings.indexOf(current);
  const target =
    step === 'first'
      ? 0
      : step === 'last'
        ? siblings.length - 1
        : // Circula: da ultima categoria a seta volta para a primeira, como nos
          // visuais nativos. Parar na ponta faz o usuario achar que travou.
          (here + step + siblings.length) % siblings.length;

  siblings[target]?.focus();
}

const KEY_CLASS =
  'pbi:sr-only pbi:focus:not-sr-only pbi:focus:absolute pbi:focus:top-0 pbi:focus:left-0 ' +
  'pbi:focus:z-10 pbi:focus:rounded pbi:focus:border pbi:focus:px-2 pbi:focus:py-1 ' +
  'pbi:focus:text-xs pbi:focus:outline-none pbi:focus:ring-2';

function DataKeys({
  frame,
  categoryRole,
  measureRole,
  points,
}: SeriesProps & { points: SeriesPoint[] }) {
  const host = hostOf(frame);
  const roles = [categoryRole, measureRole];
  const title = frame.roles[categoryRole]?.title ?? categoryRole;
  // As cores da etiqueta focada passam pelas variaveis de alto contraste: e
  // HTML, entao aqui `var()` vale (ao contrario do SVG do grafico).
  const chip = { backgroundColor: hcSurface('#ffffff'), color: hcInk('#1e293b') };

  return (
    <div
      className="pbi:absolute pbi:inset-0 pbi:pointer-events-none"
      role="group"
      aria-label={title}
    >
      {points.map((point) => (
        <button
          key={`${point.category}-${String(point.index)}`}
          type="button"
          className={KEY_CLASS}
          style={chip}
          aria-pressed={point.selected}
          onClick={(event) => {
            host.select(categoryRole, point.index, isMulti(event));
          }}
          // `Enter` e `Espaco` nao aparecem aqui de proposito: um `<button>` ja
          // os transforma em `click`, e trata-los outra vez selecionaria duas
          // vezes por tecla.
          onKeyDown={(event) => {
            const step = FOCUS_STEP[event.key];
            if (step === undefined) return;
            event.preventDefault();
            moveFocus(event.currentTarget, step);
          }}
          onFocus={(event) => {
            // O tooltip nativo acompanha o foco: quem navega por teclado ve a
            // mesma informacao que o mouse mostra.
            const box = event.currentTarget.getBoundingClientRect();
            host.showTooltip(roles, point.index, { x: box.left, y: box.top });
          }}
          onBlur={() => {
            host.hideTooltip();
          }}
        >
          {point.category}: {point.formatted}
        </button>
      ))}
    </div>
  );
}

/**
 * Casca que da area util ao `ResponsiveContainer`. Ver o comentario do Container.
 *
 * `relative` e o que ancora a sobreposicao de teclado. Nao muda a medida: o
 * elemento continua sendo o mesmo item de flex de antes.
 */
function ChartShell({ children, keys }: { children: React.ReactElement; keys: ReactNode }) {
  return (
    <div className="pbi:relative pbi:flex-1 pbi:min-h-0 pbi:min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
      {keys}
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
  const host = hostOf(frame);
  const hc = paletteOf(frame);
  const events = markEvents(frame, categoryRole, measureRole);

  // A cor e a opacidade vao no PROPRIO dado: o `<Cell>` esta deprecado no
  // Recharts 3 e some na 4, e o retangulo e montado com `{...baseProps,
  // ...entry}` — o que estiver na linha vence o que estiver no `<Bar>`.
  const marks = result.data.map((point) => ({
    ...point,
    fill: markColor(hc, color, point.selected),
    fillOpacity: markOpacity(host, point.selected),
  }));

  return (
    <ChartShell
      keys={
        <DataKeys
          frame={frame}
          categoryRole={categoryRole}
          measureRole={measureRole}
          points={result.data}
        />
      }
    >
      <BarChart data={marks} layout={horizontalBars ? 'vertical' : 'horizontal'}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke(hc)} />}
        {showXAxis && (
          <XAxis
            {...(horizontalBars
              ? { type: 'number' as const }
              : { type: 'category' as const, dataKey: 'category' })}
            tick={axisStyle(hc)}
          />
        )}
        {showYAxis && (
          <YAxis
            {...(horizontalBars
              ? { type: 'category' as const, dataKey: 'category', width: 90 }
              : { type: 'number' as const })}
            tick={axisStyle(hc)}
          />
        )}
        {showTooltip && host.kind === 'inert' && <Tooltip formatter={tooltipFormatter} />}
        <Bar
          dataKey="value"
          fill={color}
          isAnimationActive={false}
          onClick={events.click}
          onMouseMove={events.over}
          onMouseLeave={events.out}
        />
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

  const host = hostOf(frame);
  const hc = paletteOf(frame);

  return (
    <ChartShell
      keys={
        <DataKeys
          frame={frame}
          categoryRole={categoryRole}
          measureRole={measureRole}
          points={result.data}
        />
      }
    >
      {/* Linha e area nao tem marca por ponto quando o marcador esta desligado:
          o clique e o do grafico, resolvido pelo indice ativo. */}
      <LineChart data={result.data} {...chartEvents(frame, categoryRole, measureRole)}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke(hc)} />}
        {showXAxis && <XAxis dataKey="category" tick={axisStyle(hc)} />}
        {showYAxis && <YAxis tick={axisStyle(hc)} />}
        {showTooltip && host.kind === 'inert' && <Tooltip formatter={tooltipFormatter} />}
        <Line
          type="monotone"
          dataKey="value"
          stroke={markColor(hc, color, false)}
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

  const host = hostOf(frame);
  const hc = paletteOf(frame);
  const stroke = markColor(hc, color, false);

  return (
    <ChartShell
      keys={
        <DataKeys
          frame={frame}
          categoryRole={categoryRole}
          measureRole={measureRole}
          points={result.data}
        />
      }
    >
      <AreaChart data={result.data} {...chartEvents(frame, categoryRole, measureRole)}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={gridStroke(hc)} />}
        {showXAxis && <XAxis dataKey="category" tick={axisStyle(hc)} />}
        {showYAxis && <YAxis tick={axisStyle(hc)} />}
        {showTooltip && host.kind === 'inert' && <Tooltip formatter={tooltipFormatter} />}
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          fill={stroke}
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

  const host = hostOf(frame);
  const hc = paletteOf(frame);
  const sectors = markEvents(frame, categoryRole, measureRole);

  // A cor da fatia vai no PROPRIO dado, nao num `<Cell>`: o Cell esta deprecado
  // no Recharts 3 e some na 4. O `Pie` le `entry.fill` quando existe e so cai no
  // `fill` do proprio Pie quando nao (Pie.js:379).
  //
  // Em alto contraste todas as fatias ficam da mesma cor — e o que o modo pede,
  // e por isso o contorno na cor de fundo entra: sem ele as fatias vizinhas
  // viram uma mancha unica.
  const slices = result.data.map((point, index) => ({
    ...point,
    fill: markColor(hc, sliceColor(index), point.selected),
    fillOpacity: markOpacity(host, point.selected),
  }));

  return (
    <ChartShell
      keys={
        <DataKeys
          frame={frame}
          categoryRole={categoryRole}
          measureRole={measureRole}
          points={result.data}
        />
      }
    >
      <PieChart>
        {showTooltip && host.kind === 'inert' && <Tooltip formatter={tooltipFormatter} />}
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        <Pie
          data={slices}
          dataKey="value"
          nameKey="category"
          innerRadius={`${String(innerRadius)}%`}
          outerRadius="80%"
          isAnimationActive={false}
          {...(hc ? { stroke: hc.background, strokeWidth: 2 } : {})}
          onClick={sectors.click}
          onMouseEnter={sectors.over}
          onMouseLeave={sectors.out}
        />
      </PieChart>
    </ChartShell>
  );
}
