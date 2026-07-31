// @vitest-environment jsdom
/**
 * As tres capacidades do Sprint 6 que vivem nos NOS do `visual-kit`:
 * cross-filter, tooltip nativo e teclado (RF-18, RF-19, RF-23).
 *
 * Renderiza de verdade, e nao so compila. Nenhum typecheck acusa um `onClick`
 * que nunca chega ao host, nem um botao de teclado que o Recharts arrastou
 * junto com a arvore ao remontar. Foi assim que o achado 53 escapou: o visual
 * DESENHAVA certo e nenhum teste perguntava se ele FILTRAVA.
 *
 * ---
 * POR QUE ESTE ARQUIVO NAO VIVE EM `packages/visual-kit/`, que e o pacote que
 * ele testa: o `visual-kit` nao declara `react` nem em `devDependencies`, e
 * isso e regra de arquitetura, nao descuido (achado 39 — duas copias do React
 * no bundle do `pbiviz` zeram o dispatcher de hooks). Sem `react-dom`
 * resolvivel a partir de `packages/visual-kit/`, um teste que MONTA a arvore la
 * dentro so compilaria as custas de reintroduzir a dependencia proibida.
 *
 * O editor e o outro consumidor dos mesmos componentes e ja tem o React — e o
 * lugar honesto. A restricao do pacote manda no endereco do teste.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BarChartNode,
  LineChartNode,
  PieChartNode,
  type DataFrame,
  type FrameHost,
  type ScreenPoint,
} from '@vislow/visual-kit/nodes';

const CHART_BOX = { width: 800, height: 300 };

/**
 * O jsdom nao tem motor de layout e nao tem `ResizeObserver`, e o
 * `ResponsiveContainer` depende dos dois: sem isto o grafico monta e desenha
 * NADA. Mesma tecnica de `compiledVisual.e2e.test.ts`, pelo mesmo motivo —
 * equipar o harness em vez de afrouxar a assertiva.
 */
function installLayout(): void {
  class ImmediateResizeObserver {
    constructor(private readonly callback: (entries: unknown[], observer: unknown) => void) {}

    public observe(target: Element): void {
      const entry = { target, contentRect: { ...CHART_BOX, top: 0, left: 0, x: 0, y: 0 } };
      this.callback([entry], this);
      queueMicrotask(() => {
        this.callback([entry], this);
      });
    }
    public unobserve(): void {
      /* a medida e fixa */
    }
    public disconnect(): void {
      /* idem */
    }
  }

  Object.assign(window, { ResizeObserver: ImmediateResizeObserver, IS_REACT_ACT_ENVIRONMENT: true });

  for (const [property, value] of [
    ['offsetWidth', CHART_BOX.width],
    ['offsetHeight', CHART_BOX.height],
    ['clientWidth', CHART_BOX.width],
    ['clientHeight', CHART_BOX.height],
  ] as const) {
    Object.defineProperty(window.HTMLElement.prototype, property, {
      configurable: true,
      get: () => value,
    });
  }

  window.HTMLElement.prototype.getBoundingClientRect = function boundingRect() {
    return {
      ...CHART_BOX,
      top: 0,
      left: 0,
      bottom: CHART_BOX.height,
      right: CHART_BOX.width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
}

beforeAll(installLayout);

interface SpyHost extends FrameHost {
  selects: { role: string; index: number; multi: boolean }[];
  tooltips: { roles: readonly string[]; index: number; at: ScreenPoint }[];
  hides: number;
}

function spyHost(options: { selected?: number[]; highContrast?: FrameHost['highContrast'] } = {}) {
  const selected = options.selected ?? [];
  const host: SpyHost = {
    kind: 'host',
    selects: [],
    tooltips: [],
    hides: 0,
    hasSelection: selected.length > 0,
    highContrast: options.highContrast,
    select: (role, index, multi) => host.selects.push({ role, index, multi }),
    isSelected: (_role, index) => selected.includes(index),
    showTooltip: (roles, index, at) => host.tooltips.push({ roles, index, at }),
    hideTooltip: () => {
      host.hides += 1;
    },
  };
  return host;
}

const CATEGORIES = ['Sul', 'Norte', 'Leste'];

function frameOf(host?: FrameHost): DataFrame {
  return {
    locale: 'pt-BR',
    host,
    roles: {
      categoria: { title: 'Regiao', values: CATEGORIES, formatted: CATEGORIES },
      valor: { title: 'Receita', values: [10, 30, 20], formatted: ['R$ 10', 'R$ 30', 'R$ 20'] },
    },
  };
}

const AXES = { showGrid: true, showTooltip: true, showXAxis: true, showYAxis: true };

let dom: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  dom?.remove();
  root = null;
  dom = null;
});

function render(element: React.ReactElement): HTMLElement {
  dom = document.createElement('div');
  document.body.appendChild(dom);
  root = createRoot(dom);
  act(() => {
    root?.render(element);
  });
  return dom;
}

function bars(frame: DataFrame) {
  return render(
    <BarChartNode
      frame={frame}
      categoryRole="categoria"
      measureRole="valor"
      color="#3b82f6"
      layout="vertical"
      {...AXES}
    />,
  );
}

/** Os botoes da sobreposicao de teclado, na ordem dos pontos. */
function keys(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

describe('teclado e leitor de tela (RF-23)', () => {
  it('cada ponto da serie vira um botao com categoria e valor formatado', () => {
    const container = bars(frameOf(spyHost()));
    const labels = keys(container).map((button) => button.textContent);

    expect(labels).toEqual(['Sul: R$ 10', 'Norte: R$ 30', 'Leste: R$ 20']);
  });

  /**
   * `sr-only` ate o foco e o que permite existir sem poluir a tela; o grupo
   * `pointer-events-none` e o que impede um botao de 1px de roubar o clique do
   * grafico. As duas classes juntas sao o desenho inteiro — por isso a
   * assertiva e sobre elas, e nao sobre "tem botao".
   */
  it('os botoes ficam invisiveis ate receberem foco e nao interceptam o mouse', () => {
    const container = bars(frameOf(spyHost()));
    const group = container.querySelector('[role="group"]');

    expect(group?.className).toContain('pbi:pointer-events-none');
    expect(keys(container)[0]?.className).toContain('pbi:sr-only');
    expect(keys(container)[0]?.className).toContain('pbi:focus:not-sr-only');
  });

  /**
   * RF-23 pede setas, e setas normalmente pedem um indice em estado — que o
   * `visual-kit` nao pode ter (achado 39). O foco do DOM faz o papel do estado:
   * o irmao ja esta na arvore, basta foca-lo.
   */
  it('as setas andam pela serie e circulam nas pontas', () => {
    const container = bars(frameOf(spyHost()));
    const buttons = keys(container);

    act(() => {
      buttons[0]?.focus();
      buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);

    act(() => {
      buttons[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[2]);

    // Da ultima, a seta volta para a primeira: parar na ponta parece travamento.
    act(() => {
      buttons[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('o estado de selecao chega ao leitor de tela', () => {
    const container = bars(frameOf(spyHost({ selected: [1] })));
    expect(keys(container).map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('todo tipo de grafico ganha a sobreposicao, nao so as barras', () => {
    const frame = frameOf(spyHost());
    for (const chart of [
      <LineChartNode
        key="line"
        frame={frame}
        categoryRole="categoria"
        measureRole="valor"
        color="#3b82f6"
        strokeWidth={2}
        showDots
        {...AXES}
      />,
      <PieChartNode
        key="pie"
        frame={frame}
        categoryRole="categoria"
        measureRole="valor"
        innerRadius={0}
        showLegend
        showTooltip
      />,
    ]) {
      const container = render(chart);
      expect(keys(container)).toHaveLength(CATEGORIES.length);

      act(() => root?.unmount());
      dom?.remove();
    }
  });
});

describe('cross-filter (RF-18)', () => {
  it('acionar um ponto pelo teclado filtra o relatorio pelo papel de agrupamento', () => {
    const host = spyHost();
    const container = bars(frameOf(host));

    act(() => {
      keys(container)[1]?.click();
    });

    expect(host.selects).toEqual([{ role: 'categoria', index: 1, multi: false }]);
  });

  it('Ctrl soma a selecao em vez de troca-la', () => {
    const host = spyHost();
    const container = bars(frameOf(host));

    act(() => {
      keys(container)[2]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      );
    });

    expect(host.selects).toEqual([{ role: 'categoria', index: 2, multi: true }]);
  });

  /** RF-18: o que nao esta selecionado esmaece — inclusive por selecao alheia. */
  it('esmaece as marcas fora da selecao e mantem a selecionada opaca', () => {
    const container = bars(frameOf(spyHost({ selected: [1] })));
    const opacities = [...container.querySelectorAll('.recharts-rectangle')].map((node) =>
      node.getAttribute('fill-opacity'),
    );

    expect(opacities).toEqual(['0.35', '1', '0.35']);
  });

  it('sem selecao nenhuma, nada esmaece', () => {
    const container = bars(frameOf(spyHost()));
    const opacities = [...container.querySelectorAll('.recharts-rectangle')].map((node) =>
      node.getAttribute('fill-opacity'),
    );

    expect(new Set(opacities)).toEqual(new Set(['1']));
  });
});

describe('tooltip (RF-19)', () => {
  /**
   * O balao do Recharts e o do host se sobreporiam. Quem manda e o host: e ele
   * que herda os campos de tooltip que o autor do relatorio configurou.
   */
  it('com host de verdade, o balao do Recharts sai de cena', () => {
    const container = bars(frameOf(spyHost()));
    expect(container.querySelector('.recharts-tooltip-wrapper')).toBeNull();
  });

  /**
   * No preview do editor nao ha `tooltipService`. Sem o balao do Recharts,
   * passar o mouse no preview nao mostraria absolutamente nada — e o preview
   * deixaria de valer como referencia do resultado.
   */
  it('sem host, o balao do Recharts fica', () => {
    const container = bars(frameOf());
    expect(container.querySelector('.recharts-tooltip-wrapper')).not.toBeNull();
  });

  it('o foco no teclado pede o tooltip nativo, com os dois papeis do grafico', () => {
    const host = spyHost();
    const container = bars(frameOf(host));

    act(() => {
      keys(container)[0]?.focus();
    });

    expect(host.tooltips).toHaveLength(1);
    expect(host.tooltips[0]?.roles).toEqual(['categoria', 'valor']);
    expect(host.tooltips[0]?.index).toBe(0);
  });

  it('sair do ponto esconde o balao', () => {
    const host = spyHost();
    const container = bars(frameOf(host));

    act(() => {
      keys(container)[0]?.focus();
      keys(container)[0]?.blur();
    });

    expect(host.hides).toBeGreaterThan(0);
  });
});

describe('alto contraste (RF-21)', () => {
  const PALETTE = { foreground: '#ffffff', background: '#000000', foregroundSelected: '#00ff00' };

  /**
   * O SVG le a paleta do QUADRO, e nao a variavel CSS: `var()` nao e
   * substituido em atributo de apresentacao. Se alguem trocar isto por
   * `hcAccent(color)`, as barras somem e nada acusa.
   */
  it('a paleta do host vence a cor escolhida nas marcas', () => {
    const container = bars(frameOf(spyHost({ highContrast: PALETTE })));
    const fills = [...container.querySelectorAll('.recharts-rectangle')].map((node) =>
      node.getAttribute('fill'),
    );

    expect(new Set(fills)).toEqual(new Set([PALETTE.foreground]));
  });

  it('a marca selecionada usa o foregroundSelected', () => {
    const container = bars(frameOf(spyHost({ selected: [0], highContrast: PALETTE })));
    const fills = [...container.querySelectorAll('.recharts-rectangle')].map((node) =>
      node.getAttribute('fill'),
    );

    expect(fills[0]).toBe(PALETTE.foregroundSelected);
    expect(fills[1]).toBe(PALETTE.foreground);
  });

  it('fora do alto contraste, a cor do usuario vale', () => {
    const container = bars(frameOf(spyHost()));
    const fills = [...container.querySelectorAll('.recharts-rectangle')].map((node) =>
      node.getAttribute('fill'),
    );

    expect(new Set(fills)).toEqual(new Set(['#3b82f6']));
  });
});
