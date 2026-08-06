'use client';

import { create } from 'zustand';

/**
 * O estado do MOVEL, nao o do projeto.
 *
 * Larguras de painel, painel recolhido, faixa da tela. Nada aqui descreve o
 * visual que sera compilado, e por isso nada aqui passa pelo `useEditorStore`:
 * toda escrita naquele store atravessa o `commit`, que revalida a spec inteira e
 * empilha um passo de desfazer. Arrastar um divisor nao pode revalidar a spec, e
 * `Ctrl+Z` depois de recolher um painel tem de desfazer a ULTIMA EDICAO, nao o
 * recolhimento.
 *
 * A CAMERA NAO MORA AQUI. Zoom e deslocamento continuam sendo estado do
 * componente do canvas e continuam FORA da persistencia — abrir o editor no
 * enquadramento de ontem, num projeto cuja prancheta pode ter mudado de tamanho,
 * confunde mais do que ajuda. A regra ja valia antes deste sprint.
 */

/** Chave propria, separada da do projeto: sao dois ciclos de vida distintos. */
const STORAGE_KEY = 'vislow.ui.v1';

/** Percentual do `PanelGroup`, nao pixel — e a unidade com que o grupo trabalha. */
export const DEFAULT_LEFT = 18;
export const DEFAULT_RIGHT = 20;

/**
 * O piso do painel de camadas, em percentual da altura do grupo vertical.
 *
 * Existe por causa de um defeito real: a coluna esquerda era `overflow-hidden`
 * com tres faixas de altura fixa e uma elastica, entao numa tela baixa a arvore
 * encolhia para perto de zero E NAO HAVIA O QUE ROLAR, porque a coluna nao
 * rolava. Um piso declarado no proprio grupo torna esse estado inalcancavel.
 */
export const MIN_LAYERS = 25;

export interface UiState {
  /** Largura da coluna esquerda, em % do grupo horizontal. */
  leftWidth: number;
  /** Largura da coluna direita, em % do grupo horizontal. */
  rightWidth: number;
  /** Altura da faixa de camadas dentro da coluna esquerda, em %. */
  layersHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  /**
   * Sobe a cada recolher/expandir. O canvas observa ESTE numero para
   * reenquadrar, e nao a medida do painel: o painel muda de tamanho durante a
   * animacao inteira, e reenquadrar a cada quadro desfaria o zoom do usuario no
   * meio do gesto. Ver docs/frontend.md §2.1.1.
   */
  layoutEpoch: number;
  /**
   * Faz o host do preview reportar a PRIMEIRA linha como selecionada (spec 5.3.0).
   *
   * Existe porque o esmaecimento e um estado visual GRANDE — numa Lista de
   * Ranking pode ser quase a tela inteira — e ate aqui ele era invisivel no
   * editor: `sampleFrame` nao define `frame.host`, entao `hostOf` cai no
   * `INERT_HOST`, `hasSelection` e sempre falso e o autor so descobria como fica
   * exportando e importando no Power BI Desktop.
   *
   * E um INTERRUPTOR, e nao clique na linha, por duas razoes. Pressionar um no ja
   * seleciona E arrasta no mesmo gesto no canvas; somar "e tambem alterna o
   * filtro" faria o autor bagunçar selecoes toda vez que movesse a lista — e,
   * como a camada de manipulacao so da `pointerEvents: auto` aos filhos do
   * container ENTRADO, o clique passaria em alguns niveis da arvore e nao em
   * outros. Comportamento que depende da profundidade e indistinguivel de bug.
   * Alem disso nao ha relatorio para filtrar no editor: o clique prometeria um
   * efeito que nao existe.
   *
   * NAO E PERSISTIDO, pela mesma regra da camera: abrir o editor amanha com uma
   * selecao falsa aplicada e sem lembrar por que confunde mais do que ajuda.
   */
  simulateSelection: boolean;

  toggleSimulateSelection: () => void;
  setLeftWidth: (value: number) => void;
  setRightWidth: (value: number) => void;
  setLayersHeight: (value: number) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  /**
   * Recolhe as duas de uma vez. Chamado quando a janela entra na faixa estreita,
   * onde coluna aberta vira gaveta SOBRE o canvas — duas gavetas abertas em
   * 900px de largura nao deixariam prancheta nenhuma a vista.
   */
  collapseBoth: () => void;
  /** Le o `localStorage`. So no cliente, pelo mesmo motivo do `hydrate` do editor. */
  hydrate: () => void;
}

interface Persisted {
  leftWidth: number;
  rightWidth: number;
  layersHeight: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

const DEFAULTS: Persisted = {
  leftWidth: DEFAULT_LEFT,
  rightWidth: DEFAULT_RIGHT,
  layersHeight: 60,
  leftCollapsed: false,
  rightCollapsed: false,
};

/**
 * Le e SANEIA. Um `localStorage` adulterado a mao, ou escrito por uma versao
 * anterior, nao pode produzir um painel de largura negativa que deixa a tela sem
 * canvas — e um shell quebrado nao tem como se consertar pela propria interface.
 */
function read(): Persisted {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const value = parsed as Partial<Record<keyof Persisted, unknown>>;
    const pct = (input: unknown, fallback: number): number =>
      typeof input === 'number' && Number.isFinite(input) && input >= 5 && input <= 90
        ? input
        : fallback;
    const flag = (input: unknown): boolean => input === true;
    return {
      leftWidth: pct(value.leftWidth, DEFAULTS.leftWidth),
      rightWidth: pct(value.rightWidth, DEFAULTS.rightWidth),
      layersHeight: pct(value.layersHeight, DEFAULTS.layersHeight),
      leftCollapsed: flag(value.leftCollapsed),
      rightCollapsed: flag(value.rightCollapsed),
    };
  } catch {
    // `localStorage` indisponivel (modo privado, cota estourada) nao pode
    // impedir o editor de abrir. Os padroes servem.
    return DEFAULTS;
  }
}

function write(state: Persisted): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Perder a largura do painel e aceitavel; derrubar o editor nao e.
  }
}

export const useUiStore = create<UiState>((set, get) => {
  /** Persiste o recorte guardavel do estado atual. */
  const save = (): void => {
    const s = get();
    write({
      leftWidth: s.leftWidth,
      rightWidth: s.rightWidth,
      layersHeight: s.layersHeight,
      leftCollapsed: s.leftCollapsed,
      rightCollapsed: s.rightCollapsed,
    });
  };

  return {
    ...DEFAULTS,
    layoutEpoch: 0,
    simulateSelection: false,

    // Nao chama `save()`: fora do recorte persistido de proposito. E tambem nao
    // mexe no `layoutEpoch` — a moldura nao mudou de tamanho, so o que ha dentro
    // dela, e reenquadrar aqui desfaria o zoom do autor por nada.
    toggleSimulateSelection: () => {
      set((s) => ({ simulateSelection: !s.simulateSelection }));
    },

    // O SERVIDOR sempre monta com os padroes, e o `hydrate` traz o guardado
    // depois — ler o `localStorage` no corpo do store divergiria do HTML gerado
    // no build estatico, o mesmo motivo do `hydrate` do editor.
    hydrate: () => {
      set(read());
    },

    setLeftWidth: (value) => {
      set({ leftWidth: value });
      save();
    },
    setRightWidth: (value) => {
      set({ rightWidth: value });
      save();
    },
    setLayersHeight: (value) => {
      set({ layersHeight: value });
      save();
    },

    toggleLeft: () => {
      set((s) => ({ leftCollapsed: !s.leftCollapsed, layoutEpoch: s.layoutEpoch + 1 }));
      save();
    },
    toggleRight: () => {
      set((s) => ({ rightCollapsed: !s.rightCollapsed, layoutEpoch: s.layoutEpoch + 1 }));
      save();
    },

    collapseBoth: () => {
      // Idempotente de proposito: quem chama e um efeito que roda em toda
      // travessia de breakpoint, e mexer no `layoutEpoch` sem nada ter mudado
      // faria o canvas reenquadrar — desfazendo o zoom do usuario por nada.
      const s = get();
      if (s.leftCollapsed && s.rightCollapsed) return;
      set({ leftCollapsed: true, rightCollapsed: true, layoutEpoch: s.layoutEpoch + 1 });
      save();
    },
  };
});
