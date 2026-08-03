// @vitest-environment jsdom
import {
  createEmptySpec,
  createNode,
  insertChild,
  setNodeProps,
  setNodeRect,
  validateSpec,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { issuesByNode } from '@/lib/issues';
import { SpecPreview } from './SpecPreview';

/**
 * O preview RENDERIZA — nao so compila.
 *
 * E o analogo, do lado do editor, do que o `compiledVisual.e2e` faz com o
 * artefato: montar de verdade e conferir que saiu dado, e nao card de erro. Um preview que monta em branco e a falha que
 * mais custou tempo neste projeto, e ela nunca aparece em typecheck.
 */

const CHART_BOX = { width: 800, height: 300 };

/**
 * Da tamanho ao jsdom.
 *
 * O jsdom nao tem motor de layout: todo elemento mede 0x0 e nao existe
 * `ResizeObserver`. O `ResponsiveContainer` do Recharts depende dos dois, entao
 * sem isto os graficos montam e desenham NADA — e o teste passaria achando que
 * esta tudo bem, justamente na parte que interessa.
 *
 * Mesma tecnica de `compiledVisual.e2e.test.ts`, pelo mesmo motivo: equipar o
 * harness em vez de afrouxar a assertiva.
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

let host: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(spec: VisualSpec): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  const byNode = issuesByNode(spec, validateSpec(spec).kind === 'valid' ? [] : issuesOf(spec));
  act(() => {
    root?.render(<SpecPreview spec={spec} issues={byNode} />);
  });
  return host;
}

function issuesOf(spec: VisualSpec): { path: string; message: string }[] {
  const result = validateSpec(spec);
  return result.kind === 'invalid' ? result.issues : [];
}

/** Empilha nos no container raiz, na ordem dada. */
function compose(name: string, ...nodes: SpecNode[]): VisualSpec {
  const spec = createEmptySpec(name);
  let root: SpecNode = spec.root;
  for (const node of nodes) {
    root = insertChild(root, spec.root.id, node) ?? root;
  }
  return { ...spec, root };
}

const NAO_RENDERIZOU = 'Nao foi possivel renderizar o visual';

describe('preview da arvore', () => {
  it('desenha texto, KPI e grafico juntos — sem card de erro', () => {
    const texto = setNodeProps(createNode('text'), '', {}) ?? createNode('text');
    const spec = compose(
      'Painel completo',
      { ...texto, props: { ...texto.props, content: 'Vendas do trimestre' } },
      createNode('kpi', { measureRole: 'receita' }),
      createNode('barChart', { categoryRole: 'regiao', measureRole: 'receita' }),
    );

    const dom = render(spec);

    expect(dom.textContent).toContain('Vendas do trimestre');
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
    // O KPI agrega a medida do quadro de exemplo: tem de sair NUMERO.
    expect(dom.textContent).toMatch(/\d/);
    // O grafico desenhou de verdade — com barras, nao so a moldura.
    expect(dom.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(dom.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0);
  });

  it('cada tipo de grafico do registro monta', () => {
    for (const kind of ['barChart', 'lineChart', 'areaChart', 'pieChart'] as const) {
      const spec = compose(
        `Grafico ${kind}`,
        createNode(kind, { categoryRole: 'regiao', measureRole: 'receita' }),
      );
      const dom = render(spec);

      expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
      expect(dom.querySelectorAll('svg').length).toBeGreaterThan(0);

      act(() => root?.unmount());
      host?.remove();
    }
  });

  it('no com papel pendente mostra o estado pendente, nunca "undefined"', () => {
    // Sem a guarda, o kit receberia `undefined` como nome de papel e mostraria
    // "arraste um campo para undefined" — mensagem sobre o nosso bug, nao sobre
    // o que o usuario precisa fazer.
    const spec = compose('Papel pendente', createNode('barChart'));

    const dom = render(spec);

    expect(dom.textContent).toContain('campo pendente');
    expect(dom.textContent).not.toContain('undefined');
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
  });

  it('projeto novo — tela em branco — nao renderiza em branco de ERRO', () => {
    const dom = render(createEmptySpec('Vazio'));
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
    expect(dom.querySelector('div')).not.toBeNull();
  });

  it('filho de canvas sai numa caixa absoluta com a geometria da spec', () => {
    const spec = compose('Posicionado', createNode('kpi', { measureRole: 'receita' }));
    const posicionado = setNodeRect(spec.root, spec.root.children![0]!.id, {
      x: 25,
      y: 10,
      w: 50,
      h: 40,
    })!;

    const dom = render({ ...spec, root: posicionado });
    const slot = dom.querySelector<HTMLElement>('[style*="left"]');

    expect(slot).not.toBeNull();
    expect(slot?.style.left).toBe('25%');
    expect(slot?.style.top).toBe('10%');
    expect(slot?.style.width).toBe('50%');
    expect(slot?.style.height).toBe('40%');
  });

  it('grafico dentro de uma caixa posicionada continua medindo', () => {
    // A ADR-14 dizia que um elemento a mais em volta do no quebra a medida do
    // ResponsiveContainer. Com a caixa ABSOLUTA a preocupacao se inverte: ela
    // nao entra na cadeia de flex e ja tem tamanho quando o grafico mede. Se
    // isso fosse falso, o grafico sairia sem barra nenhuma — e em silencio.
    const spec = compose(
      'Grafico posicionado',
      createNode('barChart', { categoryRole: 'regiao', measureRole: 'receita' }),
    );

    const dom = render(spec);

    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
    expect(dom.querySelectorAll('.recharts-bar-rectangle').length).toBeGreaterThan(0);
  });

  it('num container que empilha nao ha caixa nenhuma', () => {
    const spec = createEmptySpec('Empilhado');
    const empilhado = setNodeProps(spec.root, spec.root.id, { placement: 'stack' })!;
    const comFilho = insertChild(empilhado, spec.root.id, createNode('kpi', { measureRole: 'receita' }))!;

    const dom = render({ ...spec, root: comFilho });

    expect(dom.querySelector('[style*="left"]')).toBeNull();
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
  });

  it('container aninhado propaga o quadro para os filhos', () => {
    const interno = createNode('container');
    const spec = compose('Aninhado', {
      ...interno,
      children: [createNode('kpi', { measureRole: 'receita' })],
    });

    const dom = render(spec);
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
    expect(dom.textContent).toMatch(/\d/);
  });
});
