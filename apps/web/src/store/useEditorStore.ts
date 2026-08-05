'use client';

import { create } from 'zustand';
import {
  acceptsChildren,
  addColumn,
  addRow,
  clampArtboard,
  clampRect,
  cloneSubtree,
  createEmptySpec,
  createNode,
  findNode,
  insertChild,
  moveNode,
  parentOf,
  positionsChildren,
  removeColumn,
  removeNode,
  removeRow,
  reparentNode,
  selectionAfterRemoval,
  setCell,
  setColumnKind,
  setColumnLabel,
  setColumnType,
  setNodeProps,
  setNodeRect,
  validateSpec,
  SPEC_VERSION,
  type Artboard,
  type NodeKind,
  type NodeRect,
  type RoleKind,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import {
  bumpPackageVersion,
  type CellValue,
  type ColumnType,
  type ValidationIssue,
} from '@vislow/config-schema';
import { loadProject, saveProjectDebounced } from '@/lib/persistence';

/**
 * Estado do editor de composicao.
 *
 * Uma unica spec, uma unica selecao. Toda escrita passa por `commit`, que
 * revalida e persiste (RN-03) — nao existe caminho que altere a arvore sem
 * revalidar, e e isso que garante que o botao de export so fica ativo com uma
 * spec que a API aceitaria.
 */

export interface EditorState {
  spec: VisualSpec;
  issues: ValidationIssue[];
  /**
   * Id do no selecionado, ou `null` quando nao ha selecao.
   *
   * `null` e estado de primeira classe, nao ausencia de dado: clicar no vazio da
   * prancheta limpa a selecao como em qualquer editor de desenho, e ai o painel
   * da direita fala do PROJETO. Antes disto o campo era `string` e o setter
   * recusava id inexistente, entao nao havia como nao ter nada selecionado — o
   * painel ficava preso no ultimo no clicado.
   */
  selectedId: string | null;
  /** Falso ate a hidratacao do localStorage terminar (evita mismatch de SSR). */
  hydrated: boolean;

  /**
   * Tamanho de cada container que posiciona, em pixel DA PRANCHETA — ja
   * dividido pelo zoom, entao independente da camera.
   *
   * NAO E DA SPEC, e por isso vive fora dela: e medida da tela, muda ao
   * redimensionar a janela e nao descreve o projeto. Escrever isto pelo `commit`
   * revalidaria a spec inteira e agendaria um save a cada pixel de resize.
   *
   * Existe porque o painel fala PIXEL e a spec guarda PERCENTUAL, e a conversao
   * precisa do tamanho do pai. Nem sempre da para deduzi-lo da prancheta: um
   * container `canvas` dentro de um `stack` tem o tamanho decidido pelo flex.
   * Medir cobre os dois casos com um mecanismo so.
   */
  containerSizes: Record<string, { width: number; height: number }>;

  /**
   * Quando o ultimo `.pbiviz` saiu desta sessao, em epoch — ou `null` se nenhum
   * saiu ainda.
   *
   * FORA da spec, como o `containerSizes`: nao descreve o visual e nao pode
   * empilhar um passo de desfazer nem disparar `validateSpec`.
   *
   * E DA SESSAO, nao persistido, de proposito. Um "exportado as 14:32" lido do
   * `localStorage` no dia seguinte responde a pergunta errada — a pergunta e
   * "este arquivo aqui na minha pasta veio da tela que estou vendo AGORA?" —, e
   * responde com confianca. E exatamente o modo de errar do achado 40, que ja
   * custou uma sessao inteira de diagnostico.
   */
  lastExportedAt: number | null;
  /** Chamado pela camada de manipulacao. Ignora medida que nao mudou. */
  reportContainerSize: (id: string, size: { width: number; height: number }) => void;

  /**
   * Historico. `past` cresce a cada edicao; `future` so tem conteudo depois de
   * um desfazer, e e zerado por qualquer edicao nova — o mesmo contrato de
   * qualquer editor.
   *
   * Guarda a SPEC INTEIRA por passo, e nao um diff. A spec de um projeto e
   * pequena (a tabela de exemplo tem teto de 10x50) e as operacoes de arvore ja
   * preservam por referencia os ramos que nao mudaram, entao dois passos
   * consecutivos compartilham quase tudo. Um sistema de diff aqui seria uma
   * segunda descricao de "o que uma edicao faz", paralela as operacoes de
   * `tree.ts` e a primeira a divergir delas.
   */
  past: VisualSpec[];
  future: VisualSpec[];
  undo: () => void;
  redo: () => void;

  /**
   * Abre e fecha um gesto contínuo — um arrasto no canvas, um scrubbing no
   * painel.
   *
   * Sem isto, um unico arrasto empilharia DUZENTOS passos de desfazer, um por
   * evento de ponteiro, e `Ctrl+Z` andaria um pixel de cada vez. Entre `begin` e
   * `end` a escrita e TRANSITORIA: aplica na tela, mas nao empilha historico,
   * nao revalida a spec inteira e nao agenda gravacao — que era o custo que
   * cada `pointermove` pagava desde que o canvas existe.
   */
  beginGesture: () => void;
  endGesture: () => void;

  hydrate: () => void;

  /** `null` limpa a selecao. Id inexistente continua sendo ignorado. */
  select: (id: string | null) => void;
  /** Adiciona um no relativo a selecao e passa a selecionar o novo. */
  addNode: (kind: NodeKind) => void;
  /**
   * Cria um no NUMA CAIXA ESCOLHIDA, direto na raiz.
   *
   * O caminho do arrastar-da-paleta e do desenhar-retangulo. Distinto de
   * `addNode`, que decide o lugar pela selecao e da ao no uma caixa automatica
   * em cascata: aqui quem decidiu o lugar foi o ponteiro, e ignorar isso para
   * soltar o componente noutro canto seria desfazer o gesto que o usuario
   * acabou de fazer.
   */
  addNodeAt: (kind: NodeKind, rect: NodeRect) => void;

  /**
   * O tipo que a paleta esta oferecendo: sendo arrastado, ou armado para
   * desenhar. `null` quando nao ha nenhum.
   *
   * Vive no store porque a paleta e a prancheta sao painteis IRMAOS — o gesto
   * comeca num e termina no outro, e nao ha ancestral comum abaixo da pagina.
   */
  paletteKind: NodeKind | null;
  armPalette: (kind: NodeKind | null) => void;

  /**
   * Em qual container o ponteiro esta trabalhando. `null` quer dizer a raiz.
   *
   * Ate 2026-08-04 um componente dentro de um container ANINHADO so podia ser
   * selecionado pela arvore: a camada de manipulacao so aparecia para os filhos
   * diretos de cada canvas, e todas as camadas ficavam ativas ao mesmo tempo —
   * clicar num container pegava o filho dele, e nunca o container.
   *
   * Agora vale um nivel de cada vez, como em qualquer editor de desenho: um
   * clique pega o container, duplo clique ENTRA nele, e Esc sobe. Assim o
   * container tambem passa a ser selecionavel no canvas, e nao so na arvore.
   */
  enteredId: string | null;
  enterContainer: (id: string | null) => void;
  /** Sobe um nivel. Devolve `false` quando ja estava na raiz. */
  exitContainer: () => boolean;
  removeSelected: () => void;
  /**
   * Copia um no como irmao logo depois dele, e seleciona a copia. Sem `id`,
   * duplica a selecao. Devolve o id da copia — e o que permite ao Alt+arrastar
   * continuar o gesto sobre ela em vez de sobre o original.
   *
   * `offset` desloca a copia para que ela nao suma atras do original; o
   * Alt+arrastar desliga, porque ali quem afasta as duas e o proprio ponteiro.
   */
  duplicateNode: (id?: string | null, options?: { offset?: boolean }) => string | null;
  /** Reordena entre irmaos. `delta` e -1 (sobe) ou +1 (desce). */
  moveSelected: (delta: number) => void;
  reparent: (id: string, parentId: string, index?: number) => void;
  setProp: (id: string, key: string, value: unknown) => void;
  /** Move ou redimensiona dentro de um pai que posiciona. Prende na borda. */
  setRect: (id: string, rect: NodeRect) => void;

  /**
   * A tabela de exemplo. Cada coluna e, ao mesmo tempo, um campo do visual —
   * nao ha duas listas. Toda operacao delega para `table.ts`, que e puro e
   * testado sem React; aqui so passa pelo `commit`.
   */
  addColumn: (label: string, type: ColumnType) => void;
  setColumnLabel: (name: string, label: string) => void;
  setColumnType: (name: string, type: ColumnType) => void;
  setColumnKind: (name: string, kind: RoleKind) => void;
  removeColumn: (name: string) => void;
  addRow: () => void;
  removeRow: (index: number) => void;
  setCell: (row: number, column: number, value: CellValue) => void;

  rename: (name: string) => void;
  /** Tamanho da prancheta do editor, em px. Prende na faixa valida. */
  setArtboard: (size: Artboard) => void;
  newProject: (name: string) => void;
  importSpec: (raw: unknown) => { ok: true } | { ok: false; issues: ValidationIssue[] };
  markExported: () => void;
}

const INITIAL_NAME = 'Meu visual';

function revalidate(spec: VisualSpec): ValidationIssue[] {
  const result = validateSpec(spec);
  return result.kind === 'invalid' ? result.issues : [];
}

/** Teto do historico. Cinquenta passos cobrem qualquer sessao de composicao. */
const HISTORY_LIMIT = 50;

export const useEditorStore = create<EditorState>((set, get) => {
  /**
   * A spec de ANTES do gesto em andamento, ou `null` fora de um gesto.
   *
   * Em fecho lexico, e nao no estado: e escrituracao do historico, nao algo que
   * a interface leia. No estado, todo componente assinado no store re-renderiza
   * no `pointerdown` sem ter nada novo para desenhar.
   */
  let gestureBase: VisualSpec | null = null;

  /**
   * Ponto unico de escrita: aplica, revalida, empilha e persiste.
   *
   * `selectedId` distingue `undefined` de `null`: o primeiro quer dizer "nao
   * mexa na selecao", o segundo "limpe a selecao". Colapsar os dois faria toda
   * edicao de propriedade desselecionar o no que estava sendo editado.
   *
   * Dentro de um gesto a escrita e TRANSITORIA: so a spec muda. O historico, a
   * revalidacao e a gravacao acontecem uma vez, no `endGesture`.
   */
  const commit = (spec: VisualSpec, selectedId?: string | null): void => {
    const selection = selectedId === undefined ? {} : { selectedId };

    if (gestureBase) {
      set({ spec, ...selection });
      return;
    }

    const { past, spec: previous } = get();
    set({
      spec,
      issues: revalidate(spec),
      // O teto corta pelo COMECO: o passo mais antigo e o que menos falta.
      past: [...past, previous].slice(-HISTORY_LIMIT),
      // Editar depois de desfazer abandona o ramo refeito — o contrato de
      // qualquer editor, e o unico que nao exige explicar uma arvore ao usuario.
      future: [],
      ...selection,
    });
    saveProjectDebounced(spec);
  };

  /**
   * Troca a spec sem empilhar historico — o caminho do desfazer e do refazer.
   *
   * A selecao e conferida contra a arvore de destino: desfazer a criacao de um
   * no deixaria a selecao apontando para algo que ja nao existe, e o painel de
   * propriedades passaria a editar um fantasma.
   */
  const restore = (spec: VisualSpec, past: VisualSpec[], future: VisualSpec[]): void => {
    const { selectedId } = get();
    set({
      spec,
      issues: revalidate(spec),
      past,
      future,
      selectedId: selectedId !== null && findNode(spec.root, selectedId) ? selectedId : null,
    });
    saveProjectDebounced(spec);
  };

  /** Aplica uma edicao de arvore. Operacao rejeitada (null) e ignorada. */
  const editTree = (next: SpecNode | null, selectedId?: string | null): void => {
    if (!next) return;
    commit({ ...get().spec, root: next }, selectedId);
  };

  /**
   * Aplica uma edicao de tabela. Mesma convencao do `editTree`: `null` e
   * operacao ilegal (teto atingido, ultima coluna, celula fora da grade) e nao
   * mexe em nada. Note que a spec resultante pode ser INVALIDA de proposito —
   * apagar uma coluna ligada deixa o no pendente —, e por isso ela passa pelo
   * `commit`, que revalida e acende o painel.
   */
  const editTable = (next: VisualSpec | null): void => {
    if (!next) return;
    commit(next);
  };

  const initial = createEmptySpec(INITIAL_NAME);

  return {
    spec: initial,
    issues: revalidate(initial),
    // Projeto abre sem selecao, e nao com a raiz: o painel da direita comeca
    // falando do projeto — nome e prancheta —, que e a primeira decisao de quem
    // esta comecando a compor.
    selectedId: null,
    hydrated: false,
    containerSizes: {},
    lastExportedAt: null,
    past: [],
    future: [],
    paletteKind: null,
    enteredId: null,

    beginGesture: () => {
      // Ja dentro de um gesto: nao troca a base. Um `pointerdown` que chega sem
      // o `pointerup` do anterior — captura perdida, botao do meio — nao pode
      // apagar o ponto de retorno do gesto que ainda esta em curso.
      gestureBase ??= get().spec;
    },

    endGesture: () => {
      const base = gestureBase;
      gestureBase = null;
      if (!base) return;

      const { spec, past } = get();
      // Gesto que nao mudou nada — um clique que so selecionou — nao empilha:
      // senao `Ctrl+Z` gastaria um passo sem desfazer coisa alguma, e o usuario
      // apertaria de novo achando que o atalho falhou.
      if (base === spec) {
        set({ issues: revalidate(spec) });
        return;
      }

      set({
        issues: revalidate(spec),
        past: [...past, base].slice(-HISTORY_LIMIT),
        future: [],
      });
      saveProjectDebounced(spec);
    },

    undo: () => {
      const { past, future, spec } = get();
      const previous = past[past.length - 1];
      if (!previous) return;
      restore(previous, past.slice(0, -1), [spec, ...future]);
    },

    redo: () => {
      const { past, future, spec } = get();
      const next = future[0];
      if (!next) return;
      restore(next, [...past, spec], future.slice(1));
    },

    reportContainerSize: (id, size) => {
      const current = get().containerSizes[id];
      // A guarda de igualdade nao e otimizacao: o `ResizeObserver` dispara
      // varias vezes com a MESMA medida, e um objeto novo a cada vez faz o
      // zustand v5 (que compara por `Object.is`) re-renderizar em laco.
      if (current?.width === size.width && current.height === size.height) return;
      set({ containerSizes: { ...get().containerSizes, [id]: size } });
    },

    hydrate: () => {
      if (get().hydrated) return;
      const stored = loadProject();
      if (!stored) {
        set({ hydrated: true });
        return;
      }
      set({
        spec: stored,
        issues: revalidate(stored),
        selectedId: null,
        hydrated: true,
        // O historico comeca vazio: nao ha "antes" de abrir o editor, e um
        // `Ctrl+Z` que voltasse para a spec inicial em branco apagaria o
        // projeto que o usuario acabou de reabrir.
        past: [],
        future: [],
        enteredId: null,
      });
    },

    select: (id) => {
      if (id === null) {
        set({ selectedId: null });
        return;
      }
      if (findNode(get().spec.root, id)) set({ selectedId: id });
    },

    /**
     * Onde o no novo entra: DENTRO da selecao quando ela aceita filhos, senao
     * logo DEPOIS dela, como irmao. E a regra que dispensa o usuario de pensar
     * onde clicar antes — o resultado e sempre o que ele veria num editor de
     * documento.
     */
    addNode: (kind) => {
      const { spec, selectedId } = get();
      // Sem selecao, o no novo entra na raiz. E a mesma regra de sempre — dentro
      // do selecionado quando ele aceita filhos — aplicada ao caso em que o
      // "selecionado" e a prancheta inteira.
      const selected =
        (selectedId === null ? null : findNode(spec.root, selectedId)) ?? spec.root;
      const node = createNode(kind);

      if (acceptsChildren(selected)) {
        editTree(insertChild(spec.root, selected.id, node), node.id);
        return;
      }

      const parent = parentOf(spec.root, selected.id);
      if (!parent) return;
      const index = (parent.children ?? []).findIndex((child) => child.id === selected.id) + 1;
      editTree(insertChild(spec.root, parent.id, node, index), node.id);
    },

    addNodeAt: (kind, rect) => {
      const { spec } = get();
      const node = createNode(kind);

      // Raiz que EMPILHA nao tem onde honrar a caixa: quem decide o tamanho ali
      // e a cadeia de flex. Cair no caminho comum e melhor que gravar um `rect`
      // que nao desenha nada — o componente aparece, so que empilhado.
      if (!positionsChildren(spec.root)) {
        editTree(insertChild(spec.root, spec.root.id, node), node.id);
        return;
      }

      node.rect = clampRect(rect);
      editTree(insertChild(spec.root, spec.root.id, node), node.id);
    },

    armPalette: (kind) => {
      set({ paletteKind: kind });
    },

    enterContainer: (id) => {
      const { spec } = get();
      // So um container que POSICIONA tem nivel para entrar: num que empilha nao
      // ha geometria de onde derivar a camada, e a objecao da ADR-14 continua.
      if (id !== null) {
        const node = findNode(spec.root, id);
        if (!node || !positionsChildren(node)) return;
      }
      // A selecao vai junto: entrar num container e dizer "e aqui dentro que eu
      // estou", e manter selecionado um irmao de fora deixaria as setas do
      // teclado mexendo num no que ja nao esta sob o ponteiro.
      set({ enteredId: id, selectedId: null });
    },

    exitContainer: () => {
      const { spec, enteredId } = get();
      if (enteredId === null || enteredId === spec.root.id) return false;

      const parent = parentOf(spec.root, enteredId);
      // Sobe SELECIONANDO o container de onde saiu — e o no que o usuario
      // acabou de terminar de editar, e o proximo gesto quase sempre e sobre ele.
      set({
        enteredId: parent && parent.id !== spec.root.id ? parent.id : null,
        selectedId: enteredId,
      });
      return true;
    },

    removeSelected: () => {
      const { spec, selectedId } = get();
      if (!selectedId) return;
      // Calculado ANTES da remocao: depois o no ja nao tem irmaos para consultar.
      const next = selectionAfterRemoval(spec.root, selectedId);
      editTree(removeNode(spec.root, selectedId), next);
    },

    /**
     * Duplica com DESLOCAMENTO por padrao, nao sobreposto.
     *
     * Copia exatamente em cima do original parece um no so — o usuario arrasta o
     * de cima varias vezes sem entender por que o de baixo nunca aparece. E o
     * mesmo motivo pelo qual `droppedRect` cai em cascata. A excecao e o
     * Alt+arrastar, onde o ponteiro ja esta afastando as duas.
     */
    duplicateNode: (id, options) => {
      const { spec, selectedId } = get();
      const target = id ?? selectedId;
      // A raiz nao tem pai onde inserir a copia, e uma segunda raiz nao e
      // representavel.
      if (!target || target === spec.root.id) return null;

      const node = findNode(spec.root, target);
      const parent = parentOf(spec.root, target);
      if (!node || !parent) return null;

      const copy = cloneSubtree(node);
      if (copy.rect && options?.offset !== false) {
        copy.rect = clampRect({ ...copy.rect, x: copy.rect.x + 2, y: copy.rect.y + 2 });
      }

      const index = (parent.children ?? []).findIndex((child) => child.id === target) + 1;
      const next = insertChild(spec.root, parent.id, copy, index);
      if (!next) return null;

      editTree(next, copy.id);
      return copy.id;
    },

    moveSelected: (delta) => {
      const { spec, selectedId } = get();
      if (!selectedId) return;
      editTree(moveNode(spec.root, selectedId, delta));
    },

    reparent: (id, parentId, index) => {
      editTree(reparentNode(get().spec.root, id, parentId, index), id);
    },

    setProp: (id, key, value) => {
      editTree(setNodeProps(get().spec.root, id, { [key]: value }));
    },

    setRect: (id, rect) => {
      editTree(setNodeRect(get().spec.root, id, rect));
    },

    addColumn: (label, type) => {
      editTable(addColumn(get().spec, label, type));
    },

    /**
     * So o rotulo muda. O `name` e estavel por desenho (ver `createColumn`): e
     * ele que aparece no `capabilities.json` e amarra as referencias da arvore.
     */
    setColumnLabel: (name, label) => {
      editTable(setColumnLabel(get().spec, name, label));
    },

    /**
     * Trocar tipo ou papel pode DESLIGAR nos — `table.ts` cuida disso no mesmo
     * passo. O no volta a pendente, o export trava, e o painel mostra onde. E
     * melhor que a alternativa: uma spec que reprova inteira por um erro que
     * fala do no, e nao da coluna em que o usuario acabou de clicar.
     */
    setColumnType: (name, type) => {
      editTable(setColumnType(get().spec, name, type));
    },

    setColumnKind: (name, kind) => {
      editTable(setColumnKind(get().spec, name, kind));
    },

    removeColumn: (name) => {
      editTable(removeColumn(get().spec, name));
    },

    addRow: () => {
      editTable(addRow(get().spec));
    },

    removeRow: (index) => {
      editTable(removeRow(get().spec, index));
    },

    setCell: (row, column, value) => {
      editTable(setCell(get().spec, row, column, value));
    },

    rename: (name) => {
      const { spec } = get();
      commit({ ...spec, project: { ...spec.project, name } });
    },

    /**
     * A prancheta e do PROJETO, nao preferencia da maquina: quem exporta o
     * `.vislow.json` e abre noutro lugar continua desenhando no mesmo alvo. Ela
     * nao chega ao pacote — o `.pbiviz` segue preenchendo a moldura que o autor
     * do relatorio desenhar.
     */
    setArtboard: (size) => {
      const { spec } = get();
      commit({ ...spec, project: { ...spec.project, artboard: clampArtboard(size) } });
    },

    newProject: (name) => {
      // Projeto novo => identidade nova (RN-01). O id nasce aqui, e nao no
      // export, e e o que faz reexportar atualizar em vez de duplicar.
      const spec = createEmptySpec(name);
      commit(spec, null);
      // Projeto novo zera o historico: desfazer nao pode ressuscitar o anterior,
      // que ja tem outra identidade (RN-01) e nao e mais o projeto aberto. E o
      // nivel volta a raiz: o container em que se estava nao existe mais.
      set({ past: [], future: [], enteredId: null });
    },

    /**
     * Importa um `.vislow.json`.
     *
     * VERSAO INCOMPATIVEL E DITA POR EXTENSO, e nao empacotada como "arquivo
     * invalido". Ate a spec 4.0.0 havia uma cadeia de migracao aqui e um arquivo
     * antigo era convertido; na 5.0.0 ela foi apagada junto com os tipos de no
     * removidos. Sem esta mensagem, quem tentasse abrir um arquivo de dois meses
     * atras receberia uma lista de erros de schema sobre `kind` desconhecido — e
     * nao teria como saber que o problema e a idade do arquivo.
     */
    importSpec: (raw) => {
      // O `in` ja estreita `raw` para um objeto com a chave: o compilador sabe
      // disso, e uma assercao aqui seria ruido que o lint reprova.
      const version =
        typeof raw === 'object' && raw !== null && 'schemaVersion' in raw
          ? raw.schemaVersion
          : undefined;
      if (typeof version === 'string' && version !== SPEC_VERSION) {
        return {
          ok: false,
          issues: [
            {
              path: '/schemaVersion',
              message:
                `Este arquivo e da versao ${version}, e o editor esta na ${SPEC_VERSION}. ` +
                'Nao ha conversao entre as duas — recomponha o visual neste editor.',
            },
          ],
        };
      }

      const result = validateSpec(raw);
      if (result.kind === 'invalid') return { ok: false, issues: result.issues };
      commit(result.spec, null);
      // Mesma razao do projeto novo: o que foi importado substitui tudo.
      set({ past: [], future: [], enteredId: null });
      return { ok: true };
    },

    markExported: () => {
      // Fora do `commit`: e registro de sessao, nao edicao do projeto.
      set({ lastExportedAt: Date.now() });
      // RF-10: reexportar o MESMO projeto reusa o GUID e so incrementa a versao,
      // para que o import no Power BI atualize o visual em vez de duplica-lo.
      const { spec } = get();
      commit({
        ...spec,
        project: {
          ...spec.project,
          packageVersion: bumpPackageVersion(spec.project.packageVersion),
        },
      });
    },
  };
});

/** O export so e permitido com spec valida (RN-03). */
export const selectCanExport = (s: EditorState): boolean =>
  s.issues.length === 0 && s.spec.project.name.trim().length >= 3;

/**
 * No selecionado, ou `null` quando nao ha selecao (ou ela ficou orfa).
 *
 * NAO cai mais na raiz. Cair na raiz apagava justamente a distincao que o painel
 * precisa: "a raiz esta selecionada" e "nada esta selecionado" sao telas
 * diferentes, e o segundo e o que o clique no vazio produz.
 *
 * Devolve uma REFERENCIA vinda do estado, nunca um objeto novo — um seletor que
 * constroi valor a cada chamada faz o zustand v5 comparar por `Object.is`, achar
 * que mudou e re-renderizar em loop. Derivacoes que criam objeto vivem em
 * `lib/issues.ts` e sao memoizadas no componente.
 */
export const selectSelectedNode = (s: EditorState): SpecNode | null =>
  s.selectedId === null ? null : findNode(s.spec.root, s.selectedId);
