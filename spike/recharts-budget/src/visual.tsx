/**
 * SPIKE R-A — pior caso de orcamento: 5 tipos de grafico do Recharts.
 *
 * Nao e codigo de produto. O objetivo e medir o `content.js` resultante contra
 * os limites rigidos do Power BI: 1 MB de bundle e 2 MB de pacote.
 *
 * Os imports sao nomeados justamente para que o webpack possa fazer
 * tree-shaking — e o mesmo padrao que o codegen do backend vai emitir.
 */
import type powerbi from 'powerbi-visuals-api';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type IVisual = powerbi.extensibility.visual.IVisual;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

interface Datum {
  name: string;
  value: number;
}

const COLORS = ['#3b82f6', '#ef4444', '#16a34a', '#f59e0b', '#8b5cf6'];

function Charts({ data }: { data: Datum[] }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: 'repeat(5, 1fr)' }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill={COLORS[0]} />
        </BarChart>
      </ResponsiveContainer>

      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Line dataKey="value" stroke={COLORS[1]} />
        </LineChart>
      </ResponsiveContainer>

      <ResponsiveContainer>
        <AreaChart data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Area dataKey="value" fill={COLORS[2]} />
        </AreaChart>
      </ResponsiveContainer>

      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name">
            {data.map((d, i) => (
              <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <ResponsiveContainer>
        <ScatterChart>
          <XAxis dataKey="name" />
          <YAxis dataKey="value" />
          <Scatter data={data} fill={COLORS[4]} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export class Visual implements IVisual {
  private readonly root: Root;

  constructor(options: VisualConstructorOptions) {
    this.root = createRoot(options.element);
  }

  public update(options: VisualUpdateOptions): void {
    const categorical = options.dataViews[0]?.categorical;
    const categories = categorical?.categories?.[0]?.values ?? [];
    const values = categorical?.values?.[0]?.values ?? [];

    const data: Datum[] = categories.map((c, i) => ({
      name: String(c ?? ''),
      value: Number(values[i]) || 0,
    }));

    this.root.render(
      <StrictMode>
        <Charts data={data} />
      </StrictMode>,
    );
  }
}
