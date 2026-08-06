// @vitest-environment jsdom
import { defaultPropsFor } from '@vislow/component-registry';
import type { DataFrame, FrameHost, RoleColumn, ScreenPoint } from '@vislow/visual-kit/nodes';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NODE_COMPONENTS } from '@/lib/nodeComponents';

/**
 * A Lista de Ranking (spec 5.3.0) — o primeiro no do kit que ACIONA algo.
 *
 * Mora em `apps/web` pela regra de sempre: o kit nao pode declarar `react`, entao
 * teste que MONTA componente do kit vive aqui.
 *
 * O que este arquivo cobre e o que nenhum typecheck alcanca:
 *
 *   1. O QUE A LINHA PEDE AO HOST. E a licao do achado 53 aplicada ao kit — o que
 *      importa nao e o que a lista desenha, e sim que ela chame `select` com o
 *      INDICE DE ORIGEM da categoria clicada. Ordenar a lista reposiciona os
 *      pontos, e um `sort` que reindexasse faria cada clique filtrar a categoria
 *      errada, com toda a compilacao limpa e o erro so aparecendo no Power BI.
 *   2. A ARITMETICA da barra: base zero, valores negativos e as duas bases.
 *   3. A ACESSIBILIDADE: nome, estado de alternador e o teclado.
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

function rows(dom: HTMLElement): HTMLElement[] {
  return [...dom.querySelectorAll<HTMLElement>('[role="button"]')];
}

/** Uma coluna do quadro. `formatted` e o que o HOST formatou, e vence. */
function column(title: string, values: (string | number)[], formatted?: string[]): RoleColumn {
  return { title, values, formatted: formatted ?? values.map(String) };
}

/**
 * Host de mentira que ANOTA o que a lista pediu, e que pode responder que ha
 * selecao ativa — o unico jeito de exercitar o esmaecimento.
 */
function spyHost(selected: number[] = []) {
  const calls: {
    selects: { role: string; index: number; multi: boolean }[];
    tooltips: { roles: readonly string[]; index: number; at: ScreenPoint }[];
    hidden: number;
  } = { selects: [], tooltips: [], hidden: 0 };

  const frameHost: FrameHost = {
    kind: 'host',
    select: (role, index, multi) => calls.selects.push({ role, index, multi }),
    isSelected: (_role, index) => selected.includes(index),
    hasSelection: selected.length > 0,
    showTooltip: (roles, index, at) => calls.tooltips.push({ roles, index, at }),
    hideTooltip: () => {
      calls.hidden += 1;
    },
  };
  return { frameHost, calls };
}

/**
 * Monta a lista com os defaults do DESCRITOR por baixo.
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
  const RankingList = NODE_COMPONENTS.ranking;
  const merged = { ...defaultPropsFor('ranking'), categoryRole: 'regiao', valueRole: 'receita', ...props };
  act(() => {
    root?.render(<RankingList {...merged} />);
  });
  return host;
}

/** A lista sobre as regioes e receitas pedidas. */
function renderRows(
  categories: string[],
  values: number[],
  props: Record<string, unknown> = {},
  frameHost?: FrameHost,
) {
  const frame: DataFrame = {
    roles: {
      regiao: column('Regiao', categories),
      receita: column('Receita', values),
    },
    locale: 'pt-BR',
  };
  if (frameHost) frame.host = frameHost;
  return render({ frame, ...props });
}

describe('Lista de Ranking — o que ela pede ao host', () => {
  it('clicar pede a selecao pelo INDICE DE ORIGEM, e nao pela posicao na lista', () => {
    /*
     * O teste que protege o filtro cruzado inteiro.
     *
     * A ordenacao padrao e por valor decrescente, entao a lista desenhada fica
     * ['Sul', 'Norte'] — invertida em relacao ao quadro, que veio
     * ['Norte' (10), 'Sul' (90)]. Clicar na PRIMEIRA linha da tela tem de pedir
     * o indice 1, que e onde 'Sul' esta no quadro. E dele que o host resolve o
     * selection id; pedir 0 filtraria 'Norte' e o relatorio inteiro mostraria a
     * regiao errada, sem erro nenhum.
     */
    const { frameHost, calls } = spyHost();
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);

    const first = rows(dom)[0]!;
    expect(first.getAttribute('aria-label')).toContain('Sul');

    act(() => {
      first.click();
    });

    expect(calls.selects).toEqual([{ role: 'regiao', index: 1, multi: false }]);
  });

  it('Ctrl e Cmd pedem selecao multipla, como nos visuais nativos', () => {
    const { frameHost, calls } = spyHost();
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);

    act(() => {
      rows(dom)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });
    act(() => {
      rows(dom)[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    });

    expect(calls.selects.map((call) => call.multi)).toEqual([true, true]);
  });

  it('Enter e Espaco acionam a linha, e o Espaco nao rola o relatorio', () => {
    const { frameHost, calls } = spyHost();
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);
    const first = rows(dom)[0]!;

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      first.dispatchEvent(enter);
    });
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      first.dispatchEvent(space);
    });

    expect(calls.selects).toHaveLength(2);
    // Sem o `preventDefault`, acionar pelo teclado move a tela do usuario junto.
    expect(space.defaultPrevented).toBe(true);
  });

  it('tecla que nao aciona nao pede nada', () => {
    const { frameHost, calls } = spyHost();
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);
    act(() => {
      rows(dom)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(calls.selects).toHaveLength(0);
  });

  it('o tooltip pede os DOIS papeis, e sai tambem pelo foco', () => {
    // RF-19 pelo teclado: quem chega por `Tab` nao tem coordenada de mouse.
    const { frameHost, calls } = spyHost();
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);

    act(() => {
      rows(dom)[0]!.focus();
    });

    expect(calls.tooltips).toHaveLength(1);
    expect(calls.tooltips[0]?.roles).toEqual(['regiao', 'receita']);
    expect(calls.tooltips[0]?.index).toBe(1);

    act(() => {
      rows(dom)[0]!.blur();
    });
    expect(calls.hidden).toBe(1);
  });
});

describe('Lista de Ranking — ordenacao e recorte', () => {
  it('ordena por valor decrescente por padrao', () => {
    const dom = renderRows(['Norte', 'Sul', 'Leste'], [10, 90, 50]);
    expect(rows(dom).map((row) => row.getAttribute('aria-label'))).toEqual([
      'Sul: 90',
      'Leste: 50',
      'Norte: 10',
    ]);
  });

  it('ordena por rotulo quando pedido, ignorando o sentido', () => {
    // `sortDirection` so aparece no painel quando a ordenacao e por valor
    // (`showWhen`), entao obedece-lo aqui seria seguir um controle que o autor
    // nao viu na tela.
    const dom = renderRows(['Norte', 'Sul', 'Leste'], [10, 90, 50], {
      sortMode: 'category',
      sortDirection: 'desc',
    });
    expect(rows(dom).map((row) => row.getAttribute('aria-label'))).toEqual([
      'Leste: 50',
      'Norte: 10',
      'Sul: 90',
    ]);
  });

  it('o modo "modelo" nao reordena — entrega a ordem do host', () => {
    const dom = renderRows(['Norte', 'Sul', 'Leste'], [10, 90, 50], { sortMode: 'model' });
    expect(rows(dom).map((row) => row.getAttribute('aria-label'))).toEqual([
      'Norte: 10',
      'Sul: 90',
      'Leste: 50',
    ]);
  });

  it('corta em maxRows, e o corte vem DEPOIS da ordenacao', () => {
    // Cortar antes entregaria as duas primeiras do quadro e so entao as
    // ordenaria — um "Top 2" que nao e o top de nada.
    const dom = renderRows(['Norte', 'Sul', 'Leste'], [10, 90, 50], { maxRows: 2 });
    expect(rows(dom).map((row) => row.getAttribute('aria-label'))).toEqual(['Sul: 90', 'Leste: 50']);
  });

  it('maxRows impossivel nao produz lista vazia', () => {
    // Uma lista de zero linhas e indistinguivel de um componente quebrado.
    const dom = renderRows(['Norte', 'Sul'], [10, 90], { maxRows: 0 });
    expect(rows(dom)).toHaveLength(1);
  });
});

describe('Lista de Ranking — a aritmetica da barra', () => {
  /** A largura declarada de cada barra, em %. */
  function fills(dom: HTMLElement): string[] {
    return [...dom.querySelectorAll<HTMLElement>('.vsl-rank-fill')].map((bar) => bar.style.width);
  }

  it('a base "maior" faz a primeira barra encher', () => {
    const dom = renderRows(['Norte', 'Sul'], [25, 100]);
    expect(fills(dom)).toEqual(['100%', '25%']);
  });

  it('a base "soma" mede a fatia de cada um no todo', () => {
    const dom = renderRows(['Norte', 'Sul'], [25, 75], { barBasis: 'total' });
    expect(fills(dom)).toEqual(['75%', '25%']);
  });

  it('base zero nao vira Infinity nem NaN', () => {
    /*
     * A DIVISAO POR ZERO, escrita e nao herdada — a mesma decisao do KPI Card.
     *
     * Com todos os valores zerados nao ha proporcao a desenhar. Uma largura
     * `NaN%` nao e recusada pelo navegador com erro: a barra simplesmente some,
     * ou pior, herda a largura anterior.
     */
    const dom = renderRows(['Norte', 'Sul'], [0, 0]);
    expect(fills(dom)).toEqual(['0%', '0%']);
  });

  it('valor negativo desenha barra pela MAGNITUDE, e o sinal fica no numero', () => {
    // Medir contra o numero cru daria comprimento negativo, que o navegador
    // ignora — a barra do maior prejuizo sumiria justamente por ser o maior.
    const dom = renderRows(['Norte', 'Sul'], [-100, 50]);
    const labels = rows(dom).map((row) => row.getAttribute('aria-label'));
    expect(fills(dom)).toEqual(['50%', '100%']);
    // Ordenado por valor: 50 vem antes de -100.
    expect(labels).toEqual(['Sul: 50', 'Norte: -100']);
  });

  it('nenhuma barra passa de 100%', () => {
    const dom = renderRows(['Norte', 'Sul'], [10, 20], { barBasis: 'total' });
    for (const width of fills(dom)) {
      expect(Number.parseFloat(width)).toBeLessThanOrEqual(100);
    }
  });
});

describe('Lista de Ranking — selecao e acessibilidade', () => {
  it('sem selecao no relatorio, nenhuma linha esmaece', () => {
    const { frameHost } = spyHost([]);
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);
    expect(rows(dom).map((row) => row.style.opacity)).toEqual(['1', '1']);
  });

  it('com selecao, o que esta fora dela esmaece na opacidade escolhida', () => {
    // O indice 1 e 'Sul', que a ordenacao poe em primeiro.
    const { frameHost } = spyHost([1]);
    const dom = renderRows(['Norte', 'Sul'], [10, 90], { dimOpacity: 40 }, frameHost);
    expect(rows(dom).map((row) => row.style.opacity)).toEqual(['1', '0.4']);
  });

  it('a linha selecionada se anuncia como pressionada', () => {
    const { frameHost } = spyHost([1]);
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);
    expect(rows(dom).map((row) => row.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('a marca de selecao reserva os 2px SEMPRE, para a linha nao andar', () => {
    const { frameHost } = spyHost([1]);
    const dom = renderRows(['Norte', 'Sul'], [10, 90], {}, frameHost);
    const [selected, other] = rows(dom);
    expect(selected!.style.borderLeftWidth).toBe('2px');
    expect(other!.style.borderLeftWidth).toBe('2px');
    // A do meio e transparente; a de cima carrega a variavel de alto contraste
    // da MARCA SELECIONADA — que ate a spec 5.3.0 nao tinha um unico leitor.
    expect(selected!.style.borderLeftColor).toContain('--vislow-hc-selected');
    expect(other!.style.borderLeftColor).toBe('transparent');
  });

  it('toda linha e alcancavel e tem nome que inclui categoria e valor', () => {
    const dom = renderRows(['Norte', 'Sul'], [10, 90]);
    for (const row of rows(dom)) {
      expect(row.tabIndex).toBe(0);
      expect(row.getAttribute('aria-label')).toMatch(/\S+: \S+/);
    }
  });

  it('categoria em branco ganha nome, em vez de um botao sem nome', () => {
    const dom = renderRows([''], [10]);
    expect(rows(dom)[0]?.getAttribute('aria-label')).toBe('(vazio): 10');
  });

  it('papel nao ligado mostra o estado vazio, e nao uma lista de zero linhas', () => {
    // RF-20: `seriesOf` devolve `null` com papel faltando, e isso e diferente de
    // um filtro que nao retornou linha nenhuma.
    const dom = render({ frame: { roles: {}, locale: 'pt-BR' } });
    expect(rows(dom)).toHaveLength(0);
    expect(dom.querySelector('.vsl-notice')).not.toBeNull();
  });

  it('as cores passam pelas variaveis de alto contraste', () => {
    // RF-21 do lado do HTML: o host precisa poder vencer a cor do autor.
    const dom = renderRows(['Norte'], [10]);
    const label = dom.querySelector<HTMLElement>('.vsl-rank-label');
    expect(label?.style.color).toContain('--vislow-hc-ink');

    const bar = dom.querySelector<HTMLElement>('.vsl-rank-fill');
    // O PREENCHIMENTO usa `surface` e a regra de baixo usa `accent`, e nao o
    // contrario: com o texto POR CIMA da barra, preencher com a cor de frente
    // faria o texto sumir dentro dela em alto contraste. Ligado o modo, o campo
    // colapsa para o fundo e sobra o sublinhado proporcional.
    expect(bar?.style.backgroundColor).toContain('--vislow-hc-surface');
    expect(bar?.style.borderBottomColor).toContain('--vislow-hc-accent');
  });
});
