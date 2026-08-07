// @vitest-environment jsdom
import { defaultPropsFor } from '@vislow/component-registry';
import type { DataFrame, FrameHost, RoleColumn, ScreenPoint } from '@vislow/visual-kit/nodes';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NODE_COMPONENTS } from '@/lib/nodeComponents';

/**
 * O Medidor de Meta (spec 5.4.0).
 *
 * Mora em `apps/web` pela regra de sempre: o kit nao pode declarar `react`, entao
 * teste que MONTA componente do kit vive aqui.
 *
 * O que este arquivo cobre e o que nenhum typecheck alcanca:
 *
 *   1. A ESCALA AUTOMATICA — abaixo da meta o trilho mede a meta; acima, mede o
 *      valor. E o unico lugar onde essa decisao existe escrita como numero.
 *   2. O ENTALHE — que so aparece quando a meta ficou para tras, e que usa a cor
 *      do TRILHO. Um entalhe com cor propria passaria despercebido no fonte e
 *      sumiria dentro do alto contraste do Power BI, que e onde ninguem olha.
 *   3. A ARITMETICA de borda: meta zero, meta negativa, valor zero.
 *   4. O ESTADO VAZIO nos dois caminhos — sem valor, e modo campo sem meta.
 *   5. A ACESSIBILIDADE: nome do grupo com valor e progresso, barra escondida.
 */

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
});

let host: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function column(title: string, values: (string | number)[], formatted?: string[]): RoleColumn {
  return { title, values, formatted: formatted ?? values.map(String) };
}

function spyHost() {
  const calls: {
    tooltips: { roles: readonly string[]; index: number; at: ScreenPoint }[];
    hidden: number;
  } = { tooltips: [], hidden: 0 };

  const frameHost: FrameHost = {
    kind: 'host',
    select: () => undefined,
    isSelected: () => false,
    hasSelection: false,
    showTooltip: (roles, index, at) => calls.tooltips.push({ roles, index, at }),
    hideTooltip: () => {
      calls.hidden += 1;
    },
  };
  return { frameHost, calls };
}

/**
 * Monta o medidor com os defaults do DESCRITOR por baixo, e pelo MAPA do editor.
 *
 * Partir do registro e o que faz um campo novo aparecer aqui sozinho; passar pelo
 * mapa e o que reprova o dia em que ele apontar para o componente errado.
 */
function render(props: Record<string, unknown>): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  const GoalGauge = NODE_COMPONENTS.gauge;
  const merged = {
    ...defaultPropsFor('gauge'),
    valueRole: 'receita',
    targetRole: 'meta',
    ...props,
  };
  act(() => {
    root?.render(<GoalGauge {...merged} />);
  });
  return host;
}

/** O medidor sobre um realizado e uma meta, os dois vindos de campo. */
function renderGauge(
  value: number,
  target: number,
  props: Record<string, unknown> = {},
  frameHost?: FrameHost,
) {
  const frame: DataFrame = {
    roles: {
      receita: column('Receita', [value]),
      meta: column('Meta', [target]),
    },
    locale: 'pt-BR',
  };
  if (frameHost) frame.host = frameHost;
  return render({ frame, ...props });
}

function fill(dom: HTMLElement): HTMLElement | null {
  return dom.querySelector<HTMLElement>('.vsl-goal-fill');
}
function notch(dom: HTMLElement): HTMLElement | null {
  return dom.querySelector<HTMLElement>('.vsl-goal-notch');
}
function support(dom: HTMLElement): string {
  return dom.querySelector<HTMLElement>('.vsl-goal-support')?.textContent ?? '';
}

describe('Medidor de Meta — a escala automatica', () => {
  it('abaixo da meta, o trilho MEDE A META e nao ha entalhe', () => {
    /*
     * O caso comum, e o que define a leitura do componente: a barra preenche a
     * fracao do alvo, e o fim do trilho E a meta. Um entalhe ali seria um
     * recorte na borda da moldura, e nao uma marca.
     */
    const dom = renderGauge(840, 1000);

    expect(fill(dom)?.style.width).toBe('84%');
    expect(notch(dom)).toBeNull();
  });

  it('acima da meta, o trilho MEDE O VALOR e a meta vira entalhe', () => {
    // A barra enche e a meta recua para dentro dela: 1000 de meta contra 1250 de
    // realizado poe o entalhe em 80% — que e o que torna "passou" mensuravel em
    // vez de so saturado.
    const dom = renderGauge(1250, 1000);

    expect(fill(dom)?.style.width).toBe('100%');
    expect(notch(dom)?.style.left).toBe('80%');
  });

  it('o entalhe usa a COR DO TRILHO, e nao uma cor propria', () => {
    /*
     * A guarda do alto contraste, e a razao de o entalhe existir como vao.
     *
     * A cor precisa passar por `hcSurface` — a variavel de FUNDO do host. Com
     * `hcAccent` ou `hcLine` ela receberia o mesmo `foreground` da barra, e a
     * marca sumiria dentro do preenchimento exatamente no caso que ela existe
     * para provar. O teste olha a variavel, e nao o hex, porque e a variavel que
     * decide isso dentro do Power BI.
     */
    const dom = renderGauge(1250, 1000, { trackColor: '#eff1ec' });

    expect(notch(dom)?.style.backgroundColor).toContain('--vislow-hc-surface');
    expect(notch(dom)?.style.backgroundColor).toContain('#eff1ec');
  });

  it('espessura zero esconde o entalhe sem mexer na barra', () => {
    const dom = renderGauge(1250, 1000, { notchWidth: 0 });

    expect(notch(dom)).toBeNull();
    expect(fill(dom)?.style.width).toBe('100%');
  });
});

describe('Medidor de Meta — a aritmetica de borda', () => {
  it('meta zero nao vira Infinity: o apoio cai na meta em si', () => {
    // A mesma regra do `DeltaLine` do KPI. "Infinity% da meta" e pior do que nao
    // anunciar percentual nenhum.
    const dom = renderGauge(500, 0);

    expect(support(dom)).toBe('de 0');
    expect(support(dom)).not.toContain('Infinity');
  });

  it('meta negativa: o percentual usa |meta| e nao inverte o sinal', () => {
    /*
     * Meta de saldo, de margem ou de resultado pode ser negativa. Dividir pelo
     * numero cru daria -50% para um realizado que e METADE do alvo, e o sinal do
     * texto brigaria com o comprimento da barra ao lado.
     */
    const dom = renderGauge(-50, -100);

    // O sinal e o do `Intl`, e nao o menos tipografico do KPI: la o numero e uma
    // VARIACAO e o `+` precisa ser escrito por nos; aqui e uma razao, que nunca
    // leva sinal positivo.
    expect(support(dom)).toBe('-50% da meta');
  });

  it('valor e meta zerados nao desenham barra nenhuma', () => {
    // Sem escala nao ha proporcao: a barra sai vazia, e nao cheia. Cheia diria
    // "meta batida" para um medidor que nao tem meta.
    const dom = renderGauge(0, 0);

    expect(fill(dom)?.style.width).toBe('0%');
    expect(notch(dom)).toBeNull();
  });

  it('a meta FIXA nao precisa de campo nenhum', () => {
    const frame: DataFrame = { roles: { receita: column('Receita', [750]) }, locale: 'pt-BR' };
    const dom = render({ frame, targetMode: 'fixed', targetValue: 1500, targetRole: '' });

    expect(fill(dom)?.style.width).toBe('50%');
    expect(support(dom)).toBe('50% da meta');
  });
});

describe('Medidor de Meta — o juizo', () => {
  it('bateu a meta usa a cor favoravel; ficou aquem usa a desfavoravel', () => {
    const acima = renderGauge(1000, 1000, { reachedColor: '#1e231c', shortColor: '#656b60' });
    expect(fill(acima)?.style.backgroundColor).toContain('#1e231c');

    act(() => root?.unmount());
    host?.remove();

    const abaixo = renderGauge(999, 1000, { reachedColor: '#1e231c', shortColor: '#656b60' });
    expect(fill(abaixo)?.style.backgroundColor).toContain('#656b60');
  });

  it('em polaridade "cair e melhor", ficar ABAIXO da meta e que e favoravel', () => {
    // Um medidor de custo, de churn ou de prazo. Sem isto o componente pinta
    // economia como problema — o mesmo erro que `polarity` evita no KPI.
    const dom = renderGauge(800, 1000, {
      polarity: 'lower',
      reachedColor: '#1e231c',
      shortColor: '#656b60',
    });

    expect(fill(dom)?.style.backgroundColor).toContain('#1e231c');
  });
});

describe('Medidor de Meta — a linha de apoio', () => {
  it('escreve o que falta, e diz quando passou', () => {
    expect(support(renderGauge(840, 1000, { progressMode: 'remaining' }))).toBe('faltam 160');

    act(() => root?.unmount());
    host?.remove();

    expect(support(renderGauge(1160, 1000, { progressMode: 'remaining' }))).toBe(
      '160 acima da meta',
    );
  });

  it('meta exata nao escreve "faltam 0"', () => {
    expect(support(renderGauge(1000, 1000, { progressMode: 'remaining' }))).toBe('meta atingida');
  });

  it('percentual e meta cabem na mesma linha', () => {
    expect(support(renderGauge(840, 1000, { progressMode: 'percentAndGoal' }))).toBe('84% de 1000');
  });
});

describe('Medidor de Meta — estado vazio e acessibilidade', () => {
  it('sem a medida, pede o campo em vez de desenhar', () => {
    const dom = render({ frame: { roles: {}, locale: 'pt-BR' } });

    expect(dom.textContent).toContain('Faltam campos');
    expect(dom.querySelector('.vsl-goal-track')).toBeNull();
  });

  it('modo campo com a meta em branco pede a meta pelo ROTULO do campo', () => {
    /*
     * O estado que existe para o autor E para quem usa o relatorio: o consumidor
     * pode simplesmente nao ter arrastado coluna nenhuma para o papel. Sem nome
     * de papel para citar, o aviso cita o rotulo — "Arraste um campo para:" com
     * uma linha em branco nao orienta ninguem.
     */
    const frame: DataFrame = { roles: { receita: column('Receita', [10]) }, locale: 'pt-BR' };
    const dom = render({ frame, targetRole: '' });

    expect(dom.textContent).toContain('Faltam campos');
    expect(dom.textContent).toContain('Meta');
  });

  it('o grupo se anuncia com valor E progresso; a barra fica escondida', () => {
    const dom = renderGauge(840, 1000, { label: 'Receita do trimestre' });
    const group = dom.querySelector<HTMLElement>('[role="group"]');

    expect(group?.getAttribute('aria-label')).toBe('Receita do trimestre: 840, 84% da meta');
    // Focalizavel, e nao acionavel: sem papel de agrupamento nao ha identidade
    // para selecionar, e um `button` prometeria uma acao inexistente.
    expect(group?.tabIndex).toBe(0);
    expect(dom.querySelector('[role="button"]')).toBeNull();
    expect(dom.querySelector('.vsl-goal-track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('rotulo vazio cai no titulo da coluna, nunca num nome vazio', () => {
    const dom = renderGauge(840, 1000);
    expect(dom.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Receita: 840, 84% da meta',
    );
  });

  it('o balao pede os DOIS papeis no modo campo, e so um no modo fixo', () => {
    const { frameHost, calls } = spyHost();
    const dom = renderGauge(840, 1000, {}, frameHost);

    act(() => {
      dom
        .querySelector('[role="group"]')
        ?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 6 }));
    });

    expect(calls.tooltips[0]?.roles).toEqual(['receita', 'meta']);
    // Indice 0 porque o no nao declara agrupamento: o host entrega uma linha so
    // por medida, ja agregada.
    expect(calls.tooltips[0]?.index).toBe(0);
  });
});
