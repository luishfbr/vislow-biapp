'use client';

import {
  NODE_DESCRIPTORS,
  acceptsChildren,
  parentOf,
  type SpecNode,
} from '@vislow/component-registry';
import { ArrowDown, ArrowUp, Circle, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { PanelSection } from '@/components/PanelSection';
import { Button } from '@/components/ui/button';
import { issuesByNode, markedAncestors } from '@/lib/issues';
import {
  byIndent,
  flattenTree,
  indentOf,
  isNoOp,
  targetAt,
  type DropTarget,
  type FlatRow,
  type RowBox,
} from '@/lib/treeDrop';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Arvore navegavel (RF-04), e o lugar onde a HIERARQUIA se organiza.
 *
 * A selecao mora aqui e nao no preview: envolver cada no do preview num elemento
 * clicavel mudaria a cadeia de flex que os graficos usam para medir (ADR-04).
 * O arrasto de reparent esta em docs/frontend.md §2.5.
 */

/** Abaixo disto o gesto ainda e um clique, e a linha so seleciona. */
const DRAG_MIN_PX = 8;

/** Faixa de rolagem automatica junto das bordas da lista. */
const EDGE_PX = 24;
const EDGE_SPEED = 8;

interface Drag {
  pointerId: number;
  ids: readonly string[];
  originPx: { x: number; y: number };
  rows: readonly RowBox[];
  blocked: ReadonlySet<string>;
  live: boolean;
}

/**
 * Um rotulo que diz QUAL no e, nao so de que tipo.
 *
 * Numa composicao com tres textos, "Texto, Texto, Texto" nao ajuda ninguem.
 */
function describe(node: SpecNode): string {
  const descriptor = NODE_DESCRIPTORS[node.kind];
  const content = node.props.content;
  if (typeof content === 'string' && content.trim() !== '') {
    return `${descriptor.label} — ${content.slice(0, 24)}`;
  }

  const measure = node.props.measureRole;
  if (typeof measure === 'string') return `${descriptor.label} — ${measure}`;

  const children = node.children?.length ?? 0;
  if (acceptsChildren(node)) {
    return `${descriptor.label} (${String(children)})`;
  }
  return descriptor.label;
}

/** Todo id do ramo de cada no arrastado: soltar dentro de si mesmo destacaria o ramo. */
function branchOf(rows: readonly FlatRow[], ids: readonly string[]): Set<string> {
  const blocked = new Set(ids);
  for (const row of rows) {
    if (row.parentId !== null && blocked.has(row.parentId)) blocked.add(row.node.id);
  }
  return blocked;
}

export function TreePanel() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const moveSelected = useEditorStore((s) => s.moveSelected);
  const reparentMany = useEditorStore((s) => s.reparentMany);
  const select = useEditorStore((s) => s.select);
  const toggleSelected = useEditorStore((s) => s.toggleSelected);
  const setSelection = useEditorStore((s) => s.setSelection);

  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const handled = useRef(false);
  const scrolling = useRef(0);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [moving, setMoving] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo(() => flattenTree(spec.root), [spec.root]);

  // Nos com problema PROPRIO, unidos aos ancestrais que os contem — calculado
  // uma vez para a arvore inteira.
  const faultyIds = useMemo(() => {
    const own = new Set(issuesByNode(spec, issues).keys());
    const withAncestors = new Set(own);
    for (const id of markedAncestors(spec, own)) withAncestors.add(id);
    return withAncestors;
  }, [spec, issues]);

  const anchor = selectedIds[0];
  const parent = anchor === undefined ? null : parentOf(spec.root, anchor);
  const siblings = parent?.children ?? [];
  const indexes = selectedIds
    .map((id) => siblings.findIndex((child) => child.id === id))
    .filter((index) => index >= 0);

  // O botao so fica ativo quando a operacao seria aceita — as mesmas condicoes
  // que `moveNode` e `removeNode` checam. Botao ativo que nao faz nada e a
  // versao de interface do no-op silencioso.
  //
  // Com VARIOS o criterio e a PONTA do bloco, porque `moveSelected` e tudo ou
  // nada: com o de cima ja no topo, subir seria recusado para todos.
  const isRoot = parent === null;
  const canMoveUp = !isRoot && indexes.length > 0 && Math.min(...indexes) > 0;
  const canMoveDown =
    !isRoot && indexes.length > 0 && Math.max(...indexes) < siblings.length - 1;

  const empty = (spec.root.children?.length ?? 0) === 0;

  /**
   * Caixas em coordenada de CONTEUDO, nao de tela: assim a rolagem automatica
   * nao as invalida. Lidas uma vez no `pointerdown` — nada se move durante o
   * arrasto, pelo mesmo motivo do marquee da prancheta.
   */
  const readRows = (): RowBox[] => {
    const list = listRef.current;
    if (!list) return [];
    const base = list.getBoundingClientRect().top - list.scrollTop;

    return rows.flatMap((row) => {
      const element = list.querySelector(`[data-row-id="${row.node.id}"]`);
      if (!element) return [];
      const box = element.getBoundingClientRect();
      return [
        {
          id: row.node.id,
          top: box.top - base,
          height: box.height,
          parentId: row.parentId,
          index: row.index,
          accepts: acceptsChildren(row.node),
        },
      ];
    });
  };

  const contentY = (clientY: number): number => {
    const list = listRef.current;
    if (!list) return 0;
    return clientY - list.getBoundingClientRect().top + list.scrollTop;
  };

  const stop = (): void => {
    cancelAnimationFrame(scrolling.current);
    scrolling.current = 0;
    drag.current = null;
    setTarget(null);
    setMoving(new Set());
  };

  const autoscroll = (clientY: number): void => {
    const list = listRef.current;
    if (!list) return;
    const box = list.getBoundingClientRect();
    const up = clientY - box.top < EDGE_PX;
    const down = box.bottom - clientY < EDGE_PX;

    cancelAnimationFrame(scrolling.current);
    if (!up && !down) return;

    // Laco proprio: parado na borda o ponteiro para de emitir eventos, e a lista
    // congelaria a um pixel do que o usuario esta tentando alcancar.
    const step = (): void => {
      if (!drag.current?.live) return;
      list.scrollTop += up ? -EDGE_SPEED : EDGE_SPEED;
      scrolling.current = requestAnimationFrame(step);
    };
    scrolling.current = requestAnimationFrame(step);
  };

  const beginDrag = (event: React.PointerEvent, id: string): void => {
    if (event.button !== 0) return;

    // Pressionar um no que JA esta na selecao arrasta o bloco; um de fora troca a
    // selecao por ele — a regra do Finder e do VSCode.
    const ids = selectedIds.includes(id) ? selectedIds : [id];
    if (ids.includes(spec.root.id)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      ids,
      originPx: { x: event.clientX, y: event.clientY },
      rows: [],
      blocked: new Set(),
      live: false,
    };
  };

  const moveDrag = (event: React.PointerEvent): void => {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;

    if (!active.live) {
      const dx = event.clientX - active.originPx.x;
      const dy = event.clientY - active.originPx.y;
      if (Math.hypot(dx, dy) < DRAG_MIN_PX) return;

      active.live = true;
      active.rows = readRows();
      active.blocked = branchOf(rows, active.ids);
      handled.current = true;
      setMoving(new Set(active.ids));
    }

    autoscroll(event.clientY);
    const next = targetAt(active.rows, contentY(event.clientY), active.blocked);
    setTarget(next && isNoOp(next, active.rows, active.ids) ? null : next);
  };

  const endDrag = (event: React.PointerEvent): void => {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;

    const drop = active.live ? target : null;
    const ids = active.ids;
    stop();

    if (drop) reparentMany(ids, drop.parentId, drop.kind === 'into' ? undefined : drop.index);
    requestAnimationFrame(() => {
      handled.current = false;
    });
  };

  /** `Ctrl+seta` indenta e desindenta — o caminho de teclado do que o arrasto faz. */
  const byKeyboard = (event: React.KeyboardEvent, id: string): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    const direction = event.key === 'ArrowRight' ? 'in' : event.key === 'ArrowLeft' ? 'out' : null;
    if (!direction) return;

    const next = byIndent(rows, id, direction);
    if (!next) return;
    event.preventDefault();
    reparentMany([id], next.parentId, next.kind === 'into' ? undefined : next.index);
  };

  return (
    <PanelSection
      title="Composicao"
      grow
      className="px-3 pb-3"
      actions={
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveUp}
            onClick={() => {
              moveSelected(-1);
            }}
            title="Mover para cima"
            aria-label="Mover para cima"
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveDown}
            onClick={() => {
              moveSelected(1);
            }}
            title="Mover para baixo"
            aria-label="Mover para baixo"
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isRoot}
            onClick={removeSelected}
            title={isRoot ? 'A raiz nao pode ser removida' : 'Remover'}
            aria-label={
              selectedIds.length > 1
                ? `Remover ${String(selectedIds.length)} componentes`
                : 'Remover'
            }
          >
            <X />
          </Button>
        </div>
      }
    >
      <div
        ref={listRef}
        className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-card py-1 ${
          moving.size > 0 ? 'cursor-grabbing select-none' : ''
        }`}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && drag.current?.live) {
            event.stopPropagation();
            stop();
          }
        }}
      >
        {rows.map((row) => {
          const id = row.node.id;
          const selected = selectedIds.includes(id);
          const published = row.node.exposed?.length ?? 0;

          return (
            <button
              key={id}
              type="button"
              data-row-id={id}
              onPointerDown={(event) => {
                beginDrag(event, id);
              }}
              onClick={(event) => {
                if (handled.current) return;
                if (event.shiftKey) extend(rows, selectedIds, row, select, setSelection);
                else if (event.ctrlKey || event.metaKey) toggleSelected(id);
                else select(id);
              }}
              onKeyDown={(event) => {
                byKeyboard(event, id);
              }}
              // `aria-pressed` e nao `aria-current`: com multi-selecao varias
              // linhas ficam marcadas ao mesmo tempo, e `aria-current` existe
              // para apontar UMA.
              aria-pressed={selected}
              style={{ paddingLeft: indentOf(row.depth) }}
              // Anel para o ALVO, fundo para o SELECIONADO: durante o arrasto o
              // no em voo esta selecionado, e o mesmo fundo nos dois tornaria os
              // dois estados indistinguiveis.
              className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-body transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                moving.has(id) ? 'opacity-40 ' : ''
              }${
                target?.kind === 'into' && target.parentId === id
                  ? 'bg-primary/5 ring-1 ring-inset ring-primary '
                  : ''
              }${
                selected
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <span className="min-w-0 truncate">{describe(row.node)}</span>
              {published > 0 && (
                // O MESMO glifo do alternador do painel de propriedades: e a
                // mesma informacao vista de outro lugar. Icone que E a
                // informacao precisa ser declarado.
                <SlidersHorizontal
                  role="img"
                  aria-label={`publica ${String(published)} ${published === 1 ? 'campo' : 'campos'} no painel do Power BI`}
                  className="ml-auto size-3 shrink-0 text-primary"
                />
              )}
              {faultyIds.has(id) && (
                // Marca tambem os ANCESTRAIS: um problema num no profundo
                // deixaria o export bloqueado sem indicio na parte visivel.
                <Circle
                  role="img"
                  aria-label="tem campo pendente"
                  className="ml-auto size-2 shrink-0 fill-current text-warning"
                />
              )}
            </button>
          );
        })}

        <BetweenLine target={target} rows={rows} list={listRef.current} />

        {empty && (
          // Estado vazio: a raiz sozinha nao explica que falta alguma coisa, e o
          // export fica bloqueado sem que nada na tela diga o porque.
          <p className="px-3 py-3 text-label leading-relaxed text-muted-foreground">
            A composicao esta vazia. Use <strong className="font-medium">Adicionar componente</strong>{' '}
            para colocar a primeira peca dentro do container.
          </p>
        )}
      </div>
    </PanelSection>
  );
}

/**
 * O fio da fresta, no recuo que o rotulo VAI ter — e o recuo que responde "em
 * qual pai isto cai?". Absoluto: empurrar layout moveria as linhas sob a mira.
 */
function BetweenLine({
  target,
  rows,
  list,
}: {
  target: DropTarget | null;
  rows: readonly FlatRow[];
  list: HTMLElement | null;
}) {
  if (target?.kind !== 'between' || !list) return null;

  const parent = rows.find((row) => row.node.id === target.parentId);
  if (!parent) return null;

  const kids = rows.filter((row) => row.parentId === target.parentId);
  const after = kids[target.index - 1]?.node.id;
  const seam = after ?? kids[target.index]?.node.id ?? target.parentId;
  const element = list.querySelector(`[data-row-id="${seam}"]`);
  if (!(element instanceof HTMLElement)) return null;

  const base = list.getBoundingClientRect().top - list.scrollTop;
  const box = element.getBoundingClientRect();

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2 h-0.5 -translate-y-1/2 rounded-full bg-primary"
      style={{
        top: box.top - base + (after === undefined ? 0 : box.height),
        left: indentOf(parent.depth + 1),
      }}
    />
  );
}

/**
 * Shift estende POR INTERVALO, entre irmaos. A ancora e o PRIMEIRO da selecao em
 * ordem de arvore. No de outro pai TROCA a selecao — a mesma regra do canvas.
 */
function extend(
  rows: readonly FlatRow[],
  selectedIds: readonly string[],
  row: FlatRow,
  select: (id: string) => void,
  setSelection: (ids: readonly string[]) => void,
): void {
  const anchor = rows.find((candidate) => candidate.node.id === selectedIds[0]);
  if (anchor?.parentId !== row.parentId) {
    select(row.node.id);
    return;
  }

  const kids = rows.filter((candidate) => candidate.parentId === row.parentId);
  const [lo, hi] =
    anchor.index <= row.index ? [anchor.index, row.index] : [row.index, anchor.index];
  setSelection(kids.slice(lo, hi + 1).map((candidate) => candidate.node.id));
}
