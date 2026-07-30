import type powerbi from 'powerbi-visuals-api';
import { StrictMode, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  BarChart,
  BuildStamp,
  ErrorBoundary,
  ErrorCard,
  EmptyState,
  KpiCard,
  TruncationNotice,
  type HighContrastPalette,
  type RenderContext,
} from '@vislow/visual-kit';
import type { VisualConfig } from '@vislow/config-schema';
import '@vislow/visual-kit/styles.css';

import { BUILD_ID } from './buildId';
import { readEmbeddedConfig } from './embeddedConfig';
import { buildViewModel, CATEGORY_LIMIT, type ViewModel } from './viewModel';

type IVisual = powerbi.extensibility.visual.IVisual;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type ISelectionId = powerbi.extensibility.ISelectionId;
type ISelectionManager = powerbi.extensibility.ISelectionManager;
type IVisualHost = powerbi.extensibility.visual.IVisualHost;

export class Visual implements IVisual {
  private readonly root: Root;
  private readonly element: HTMLElement;
  private readonly host: IVisualHost;
  private readonly selectionManager: ISelectionManager;
  private readonly config: VisualConfig | null;
  private readonly bootError: { code: string; detail: string } | null;

  private selectionIds: ISelectionId[] = [];
  private tooltipItems: { displayName: string; value: string }[] = [];

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.element = options.element;
    this.selectionManager = options.host.createSelectionManager();
    this.root = createRoot(options.element);

    // RF-24: menu de contexto nativo (drill, exportar dados).
    options.element.addEventListener('contextmenu', (event) => {
      const mouse = event as MouseEvent;
      this.selectionManager.showContextMenu({}, { x: mouse.clientX, y: mouse.clientY });
      mouse.preventDefault();
    });

    const result = readEmbeddedConfig();
    if (result.kind === 'ok') {
      this.config = result.config;
      this.bootError = null;
    } else {
      this.config = null;
      this.bootError = { code: result.code, detail: result.detail };
    }

    // Selecao vinda de OUTROS visuais precisa refletir aqui (RF-18).
    this.selectionManager.registerOnSelectCallback(() => {
      this.rerender();
    });
  }

  public update(options: VisualUpdateOptions): void {
    this.lastOptions = options;
    this.rerender();
  }

  private lastOptions: VisualUpdateOptions | undefined;

  private highContrast(): HighContrastPalette | undefined {
    const palette = this.host.colorPalette;
    if (!palette.isHighContrast) return undefined;
    return {
      foreground: palette.foreground.value,
      background: palette.background.value,
      foregroundSelected: palette.foregroundSelected.value,
    };
  }

  private select(index: number, multi: boolean): void {
    const id = this.selectionIds[index];
    if (!id) return;
    void this.selectionManager.select(id, multi).then(() => {
      this.rerender();
    });
  }

  /**
   * RF-19 — tooltip NATIVO do Power BI, nao um balao proprio: e o que faz o
   * visual se comportar como os nativos e herdar campos de tooltip do relatorio.
   *
   * As coordenadas do tooltipService sao relativas ao elemento do visual; passar
   * clientX/clientY direto posiciona o balao no lugar errado quando o visual nao
   * esta no canto superior esquerdo do relatorio.
   */
  private showTooltip(index: number, client: { x: number; y: number }): void {
    const item = this.tooltipItems[index];
    const id = this.selectionIds[index];
    if (!item || !id) return;

    const rect = this.element.getBoundingClientRect();
    this.host.tooltipService.show({
      coordinates: [client.x - rect.left, client.y - rect.top],
      isTouchEvent: false,
      dataItems: [item],
      identities: [id],
    });
  }

  private hideTooltip(): void {
    this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
  }

  /**
   * RN-04: este metodo SEMPRE renderiza alguma coisa. Qualquer excecao vira card
   * de erro — tela branca dentro de um relatorio e defeito de severidade maxima.
   */
  private rerender(): void {
    try {
      this.root.render(
        <StrictMode>
          {/* O selo de build fica FORA do ErrorBoundary: se a arvore falhar, ele
              ainda precisa dizer qual pacote falhou. */}
          <div className="pbi:relative pbi:w-full pbi:h-full">
            <ErrorBoundary buildId={BUILD_ID}>{this.buildTree()}</ErrorBoundary>
            <BuildStamp id={BUILD_ID} />
          </div>
        </StrictMode>,
      );
    } catch (error) {
      // Cobre falhas ao MONTAR a arvore (buildViewModel, mapeamento de dados).
      // Falhas dentro do render de um componente sao capturadas pelo
      // ErrorBoundary acima — o try/catch nao as alcanca, porque a fase de
      // render do React e assincrona no modo concorrente.
      const detail = error instanceof Error ? error.message : 'Falha inesperada na renderizacao.';
      this.root.render(<ErrorCard code="RENDER_FAIL" detail={detail} buildId={BUILD_ID} />);
    }
  }

  private buildTree(): ReactElement {
    if (!this.config) {
      const err = this.bootError ?? { code: 'UNKNOWN', detail: '' };
      return <ErrorCard code={err.code} detail={err.detail} buildId={BUILD_ID} />;
    }
    if (!this.lastOptions) return <EmptyState missing={['Categoria', 'Valor']} />;

    const config = this.config;
    const model: ViewModel = buildViewModel(
      this.lastOptions.dataViews[0],
      config.chartType,
      this.host,
    );

    const context: RenderContext = {
      onSelect: (index, multi) => {
        this.select(index, multi);
      },
      onHover: (index, at) => {
        this.showTooltip(index, at);
      },
      onHoverEnd: () => {
        this.hideTooltip();
      },
    };
    const hc = this.highContrast();
    if (hc) context.highContrast = hc;

    switch (model.kind) {
      case 'empty':
        return <EmptyState missing={model.missing} />;

      case 'kpi':
        return <KpiCard config={config} datum={model.datum} context={context} />;

      case 'bar': {
        this.selectionIds = model.selectionIds;
        this.tooltipItems = model.points.map((p) => ({
          displayName: p.category,
          value: p.formattedValue,
        }));
        const active = this.selectionManager.getSelectionIds();
        const points = model.points.map((p, i) => ({
          ...p,
          selected: active.some((s) => JSON.stringify(s) === JSON.stringify(model.selectionIds[i])),
        }));

        return (
          <>
            <BarChart config={config} data={points} context={context} />
            {model.truncated && <TruncationNotice shown={points.length} limit={CATEGORY_LIMIT} />}
          </>
        );
      }
    }
  }
}
