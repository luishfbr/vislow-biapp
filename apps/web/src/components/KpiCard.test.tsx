// @vitest-environment jsdom
import { defaultPropsFor } from '@vislow/component-registry';
import type { DataFrame, FrameHost, RoleColumn, ScreenPoint } from '@vislow/visual-kit/nodes';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NODE_COMPONENTS } from '@/lib/nodeComponents';

/**
 * O KPI Card (RF-16) — o primeiro no a ler dados desde a poda da spec 5.0.0.
 *
 * Mora em `apps/web`, e nao no `visual-kit`, pela regra de sempre: o kit nao pode
 * declarar `react`, entao teste que MONTA componente do kit vive aqui.
 *
 * O que este arquivo cobre e a ARITMETICA e a ACESSIBILIDADE — as duas coisas do
 * card que nenhum typecheck alcanca. Base zero, base negativa e polaridade
 * invertida sao casos em que o componente pode mentir com toda a compilacao
 * limpa: um "+Infinity%" ou uma economia de custo pintada de vermelho passam por
 * qualquer tipo.
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

/**
 * O elemento pedido, exigindo que exista.
 *
 * Como `HTMLElement`, e nao `Element`: os testes leem `style` e chamam `focus`, e
 * os dois so existem no primeiro. Lanca em vez de devolver `null` porque um
 * seletor que nao casa e o teste falhando, nao um caso a tratar.
 */
function el(dom: HTMLElement, selector: string): HTMLElement {
  const found = dom.querySelector<HTMLElement>(selector);
  expect(found, selector).not.toBeNull();
  return found!;
}

/** Uma coluna do quadro. `formatted` e o que o HOST formatou, e vence. */
function column(title: string, value: number, formatted?: string): RoleColumn {
  return { title, values: [value], formatted: [formatted ?? String(value)] };
}

function frameOf(
  roles: Record<string, RoleColumn | undefined>,
  frameHost?: FrameHost,
): DataFrame {
  const frame: DataFrame = { roles, locale: 'pt-BR' };
  if (frameHost) frame.host = frameHost;
  return frame;
}

/** Host de mentira que ANOTA o que o card pediu. */
function spyHost() {
  const calls: { tooltips: { roles: readonly string[]; at: ScreenPoint }[]; hidden: number } = {
    tooltips: [],
    hidden: 0,
  };
  const frameHost: FrameHost = {
    kind: 'host',
    select: () => undefined,
    isSelected: () => false,
    hasSelection: false,
    showTooltip: (roles, _index, at) => calls.tooltips.push({ roles, at }),
    hideTooltip: () => {
      calls.hidden += 1;
    },
  };
  return { frameHost, calls };
}

/**
 * Monta o card com os defaults do DESCRITOR por baixo.
 *
 * Partir do registro, e nao de um objeto escrito a mao, e o que faz um campo novo
 * aparecer aqui sozinho — e o que impede o teste de exercitar uma combinacao de
 * props que o editor nunca produz.
 */
function render(props: Record<string, unknown>): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  // Pelo MAPA do editor, e nao pelo import direto do kit: e a mesma referencia
  // que o `SpecPreview` monta, entao um dia em que o mapa apontar para o
  // componente errado reprova aqui tambem.
  const KpiCard = NODE_COMPONENTS.kpi;
  const merged = { ...defaultPropsFor('kpi'), ...props };
  act(() => {
    root?.render(<KpiCard {...merged} />);
  });
  return host;
}

/** O card com valor e comparacao ligados, sobre os numeros pedidos. */
function renderDelta(value: number, compare: number, props: Record<string, unknown> = {}) {
  return render({
    frame: frameOf({
      receita: column('Receita', value),
      meta: column('Meta', compare),
    }),
    valueRole: 'receita',
    compareRole: 'meta',
    ...props,
  });
}

describe('KPI Card — estado vazio', () => {
  it('sem a medida ligada, orienta qual campo arrastar (RF-20)', () => {
    // RN-04: nunca tela branca. E este e o estado real de um KPI recem-importado
    // no Power BI, antes de o consumidor arrastar a medida.
    const dom = render({ frame: frameOf({}), valueRole: 'receita', compareRole: '' });

    expect(dom.textContent).toContain('Faltam campos');
    expect(dom.textContent).toContain('receita');
  });

  it('sem a comparacao, desenha o numero e nada de variacao', () => {
    const dom = render({
      frame: frameOf({ receita: column('Receita', 1000, 'R$ 1.000,00') }),
      valueRole: 'receita',
      compareRole: '',
    });

    expect(dom.textContent).toContain('R$ 1.000,00');
    // Sem comparacao nao ha fio nem seta: os dois pertencem a linha que nao existe.
    expect(dom.querySelector('.vsl-kpi-rule')).toBeNull();
    expect(dom.querySelector('.vsl-kpi-arrow')).toBeNull();
  });
});

describe('KPI Card — o valor', () => {
  it('usa o texto que o HOST formatou, e nao o numero cru (RF-17)', () => {
    // Uma linha so: o host ja formatou esse valor exato, entao ele preserva
    // moeda, percentual e casas decimais da medida. Cair no `Intl` aqui seria
    // trocar `R$ 1.234,57` por `1234.5678` — um dos sinais mais rapidos de que um
    // visual customizado e amador.
    const dom = render({
      frame: frameOf({ receita: column('Receita', 1234.5678, 'R$ 1.234,57') }),
      valueRole: 'receita',
      compareRole: '',
    });

    expect(dom.querySelector('.vsl-kpi-figure')?.textContent).toBe('R$ 1.234,57');
  });

  it('o rotulo vazio cai no nome do campo que o consumidor arrastou', () => {
    const dom = render({
      frame: frameOf({ receita: column('Receita liquida', 10) }),
      valueRole: 'receita',
      compareRole: '',
      label: '',
    });

    expect(dom.querySelector('.vsl-kpi-label')?.textContent).toBe('Receita liquida');
  });
});

describe('KPI Card — a variacao', () => {
  it('mostra diferenca e percentual, com sinal e seta', () => {
    const dom = renderDelta(1084320, 1000000);
    const delta = dom.querySelector('.vsl-kpi-delta')?.textContent ?? '';

    expect(delta).toContain('▲');
    expect(delta).toContain('+');
    // 84.320 sobre 1.000.000 = 8,4%.
    expect(delta).toMatch(/8[.,]4\s?%/);
    expect(delta).toContain('vs Meta');
  });

  it('a queda leva seta para baixo e o sinal de menos TIPOGRAFICO', () => {
    const dom = renderDelta(900, 1000);
    const delta = dom.querySelector('.vsl-kpi-delta')?.textContent ?? '';

    expect(delta).toContain('▼');
    // U+2212, e nao o hifen: o sinal e nosso, prefixado a magnitude formatada.
    expect(delta).toContain('−');
    expect(delta).toMatch(/10\s?%/);
  });

  it('BASE ZERO nao vira Infinity: sobra o absoluto', () => {
    // `x / 0` e `Infinity`, e um card que anuncia "+Infinity%" e pior do que um
    // que nao anuncia percentual nenhum.
    const dom = renderDelta(500, 0);
    const delta = dom.querySelector('.vsl-kpi-delta')?.textContent ?? '';

    expect(delta).not.toContain('Infinity');
    expect(delta).not.toContain('NaN');
    expect(delta).not.toContain('%');
    expect(delta).toContain('500');
    expect(delta).toContain('▲');
  });

  it('BASE NEGATIVA nao inverte o percentual em relacao a seta', () => {
    // Prejuizo de 200 que virou prejuizo de 100: a diferenca e +100, e o
    // percentual tem de ser POSITIVO tambem. Dividir pela base crua (-200) daria
    // -50%, com a seta para cima e o numero para baixo na mesma linha.
    const dom = renderDelta(-100, -200);
    const delta = dom.querySelector('.vsl-kpi-delta')?.textContent ?? '';

    expect(delta).toContain('▲');
    expect(delta).not.toContain('−');
    expect(delta).toMatch(/50\s?%/);
  });

  it('variacao zero nao aponta para lado nenhum', () => {
    const dom = renderDelta(1000, 1000);
    const arrow = dom.querySelector('.vsl-kpi-arrow');

    // O slot CONTINUA na tela, vazio: e ele que impede a linha de refluir quando
    // a direcao muda na atualizacao seguinte.
    expect(arrow).not.toBeNull();
    expect(arrow?.textContent).toBe('');
  });

  it('a legenda vazia cai no nome do campo de comparacao', () => {
    const dom = renderDelta(1100, 1000, { compareLabel: '' });
    expect(dom.querySelector('.vsl-kpi-delta')?.textContent).toContain('vs Meta');
  });

  it('a legenda escrita pelo autor vence o nome do campo', () => {
    const dom = renderDelta(1100, 1000, { compareLabel: 'ante o mes passado' });
    const delta = dom.querySelector('.vsl-kpi-delta')?.textContent ?? '';

    expect(delta).toContain('ante o mes passado');
    expect(delta).not.toContain('vs Meta');
  });

  it.each([
    ['absolute', true, false],
    ['percent', false, true],
    ['both', true, true],
  ])('deltaMode "%s" escolhe o que aparece', (mode, temAbsoluto, temPercentual) => {
    const dom = renderDelta(1100, 1000, { deltaMode: mode });
    const delta = dom.querySelector('.vsl-kpi-delta')?.textContent ?? '';

    expect(delta.includes('100')).toBe(temAbsoluto);
    expect(delta.includes('%')).toBe(temPercentual);
  });

  it('o fio some quando o autor desliga', () => {
    expect(renderDelta(1100, 1000).querySelector('.vsl-kpi-rule')).not.toBeNull();
    act(() => root?.unmount());
    host?.remove();
    expect(renderDelta(1100, 1000, { showRule: false }).querySelector('.vsl-kpi-rule')).toBeNull();
  });
});

describe('KPI Card — polaridade', () => {
  const VERDE = '#0f7b3f';
  const VERMELHO = '#b3261e';
  const cores = { upColor: VERDE, downColor: VERMELHO };

  const corDa = (dom: HTMLElement) => el(dom, '.vsl-kpi-delta').style.color;

  it('"subir e melhor": alta favoravel, queda desfavoravel', () => {
    expect(corDa(renderDelta(1100, 1000, { polarity: 'higher', ...cores }))).toContain(VERDE);
    act(() => root?.unmount());
    host?.remove();
    expect(corDa(renderDelta(900, 1000, { polarity: 'higher', ...cores }))).toContain(VERMELHO);
  });

  it('"cair e melhor" INVERTE a cor, e nao a seta', () => {
    // O caso que justifica o campo existir: custo, churn, prazo, defeitos. A
    // queda continua desenhando `▼` — a direcao e aritmetica —, mas e ela que
    // recebe a cor de favoravel.
    const dom = renderDelta(900, 1000, { polarity: 'lower', ...cores });

    expect(corDa(dom)).toContain(VERDE);
    expect(dom.querySelector('.vsl-kpi-delta')?.textContent).toContain('▼');
  });

  it('"sem juizo" usa uma cor so nos dois sentidos', () => {
    expect(corDa(renderDelta(1100, 1000, { polarity: 'neutral', ...cores }))).toContain(VERDE);
    act(() => root?.unmount());
    host?.remove();
    expect(corDa(renderDelta(900, 1000, { polarity: 'neutral', ...cores }))).toContain(VERDE);
  });

  it('a DIRECAO nao depende da cor: seta e sinal andam juntos', () => {
    // A prova de que o card sobrevive a daltonismo e ao alto contraste, em que as
    // duas cores do autor podem virar a mesma. Com `upColor === downColor`, a
    // linha ainda diz para onde o numero foi.
    const dom = renderDelta(900, 1000, { upColor: '#656b60', downColor: '#656b60' });
    const delta = dom.querySelector('.vsl-kpi-delta')?.textContent ?? '';

    expect(delta).toContain('▼');
    expect(delta).toContain('−');
  });

  it('a seta e decorativa para o leitor de tela — o sinal ja diz', () => {
    const dom = renderDelta(1100, 1000);
    expect(dom.querySelector('.vsl-kpi-arrow')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('KPI Card — o host', () => {
  it('o ponteiro pede o tooltip NATIVO com os dois papeis (RF-19)', () => {
    const { frameHost, calls } = spyHost();
    const dom = render({
      frame: frameOf(
        { receita: column('Receita', 1100), meta: column('Meta', 1000) },
        frameHost,
      ),
      valueRole: 'receita',
      compareRole: 'meta',
    });

    const card = el(dom, '.vsl-kpi');
    act(() => {
      card.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 60 }));
    });

    expect(calls.tooltips).toHaveLength(1);
    expect(calls.tooltips[0]?.roles).toEqual(['receita', 'meta']);
    expect(calls.tooltips[0]?.at).toEqual({ x: 40, y: 60 });

    act(() => {
      card.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(calls.hidden).toBe(1);
  });

  it('quem chega por Tab tambem recebe o balao', () => {
    // Sem isto o tooltip seria exclusivo do mouse — e o card e alcancavel por
    // teclado justamente para nao ser.
    const { frameHost, calls } = spyHost();
    const dom = render({
      frame: frameOf({ receita: column('Receita', 1100) }, frameHost),
      valueRole: 'receita',
      compareRole: '',
    });

    const card = el(dom, '.vsl-kpi');
    act(() => { card.focus(); });

    expect(calls.tooltips).toHaveLength(1);
    expect(calls.tooltips[0]?.roles).toEqual(['receita']);
  });

  it('sem host, o preview nao quebra — o inerte responde por todos', () => {
    // ADR-16: `hostOf` devolve o `INERT_HOST` quando o quadro nao traz host, que
    // e o caso do preview do editor. Um `frame.host?.showTooltip?.()` por chamada
    // seria uma chance por chamada de esquecer o `?.`.
    const dom = render({
      frame: frameOf({ receita: column('Receita', 1100) }),
      valueRole: 'receita',
      compareRole: '',
    });

    const card = el(dom, '.vsl-kpi');
    expect(() => {
      act(() => {
        card.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      });
    }).not.toThrow();
  });

  it('e alcancavel por teclado e rotulado (RF-23)', () => {
    const dom = renderDelta(1100, 1000, { label: 'Receita do mes' });
    const card = el(dom, '.vsl-kpi');

    expect(card.getAttribute('tabindex')).toBe('0');
    expect(card.getAttribute('aria-label')).toBe('Receita do mes');
    // `group`, e nao `button`: sem papel de agrupamento nao ha identidade para
    // selecionar, e um `button` prometeria uma acao que nao existe.
    expect(card.getAttribute('role')).toBe('group');
  });

  it('sem rotulo nenhum, o numero nomeia o card', () => {
    // Um grupo focalizavel com `aria-label=""` e anunciado como "grupo" e mais
    // nada. O caso e raro — exige rotulo vazio E coluna sem titulo —, e e
    // exatamente por ser raro que ninguem o encontraria na mao.
    const dom = render({
      frame: frameOf({ receita: column('', 1100, 'R$ 1.100,00') }),
      valueRole: 'receita',
      compareRole: '',
      label: '',
    });

    expect(el(dom, '.vsl-kpi').getAttribute('aria-label')).toBe('R$ 1.100,00');
  });

  it('as cores passam pelas variaveis de alto contraste (RF-21)', () => {
    const dom = renderDelta(1100, 1000);
    const figura = el(dom, '.vsl-kpi-figure');
    const rotulo = el(dom, '.vsl-kpi-label');
    const card = el(dom, '.vsl-kpi');

    // O numero e MARCA DE DADOS e usa `accent`; o rotulo e texto e usa `ink`.
    expect(figura.style.color).toContain('--vislow-hc-accent');
    expect(rotulo.style.color).toContain('--vislow-hc-ink');
    expect(card.style.backgroundColor).toContain('--vislow-hc-surface');
    expect(card.style.borderColor).toContain('--vislow-hc-line');
  });
});
