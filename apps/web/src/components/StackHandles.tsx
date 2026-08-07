'use client';

import {
  CONTAINER_CANVAS,
  findNode,
  indexPath,
  parentOf,
  positionsChildren,
} from '@vislow/component-registry';
import { useLayoutEffect, useRef, useState } from 'react';
import { applyGesture, boxWithin, type HandleId } from '@/lib/canvasGeometry';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Alca do filho de um container que EMPILHA: mede o DOM, e o primeiro arrasto
 * converte o pai para livre. Racional em docs/frontend.md §3.6.3.
 */

const HANDLES: { id: HandleId; x: number; y: number; cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { id: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
];

interface Ghost {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Gesture {
  pointerId: number;
  handle: HandleId | 'move';
  id: string;
  boxPx: { width: number; height: number };
  originPx: { x: number; y: number };
}

/** O `ResizeObserver` repete a medida, e um objeto novo por leitura re-renderizaria em laco. */
function sameBox(a: Ghost | null, b: Ghost | null): boolean {
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Desce pelos indices da spec. Cada componente do kit renderiza UM elemento raiz — `SpecPreview.test.tsx` afirma. */
function elementAt(root: Element | null, path: readonly number[]): HTMLElement | null {
  let node: Element | null | undefined = root;
  for (const index of path) node = node?.children[index];
  return node instanceof HTMLElement ? node : null;
}

export function StackHandles({
  artboard,
  scale,
}: {
  artboard: HTMLElement | null;
  scale: number;
}) {
  const spec = useEditorStore((s) => s.spec);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const paletteKind = useEditorStore((s) => s.paletteKind);
  const setProp = useEditorStore((s) => s.setProp);
  const setRect = useEditorStore((s) => s.setRect);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const endGesture = useEditorStore((s) => s.endGesture);

  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const live = useRef<Gesture | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const id = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const parent = id === undefined ? null : parentOf(spec.root, id);
  // So quem EMPILHA: onde o pai posiciona, quem manda e o `CanvasOverlay`. Com
  // ferramenta armada o gesto e desenhar, e a alca nao pode roubar o ponteiro.
  const pending =
    id !== undefined && parent !== null && !positionsChildren(parent) && paletteKind === null
      ? id
      : undefined;

  useLayoutEffect(() => {
    if (pending === undefined || !artboard) {
      setGhost(null);
      return;
    }

    const path = indexPath(spec.root, pending);
    const read = (): void => {
      const target = path ? elementAt(artboard.querySelector('.vsl-root'), path) : null;
      const next = target
        ? boxWithin(target.getBoundingClientRect(), artboard.getBoundingClientRect(), scale)
        : null;
      setGhost((current) => (sameBox(current, next) ? current : next));
    };

    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(artboard);
    return () => {
      observer.disconnect();
    };
  }, [pending, artboard, scale, spec]);

  const begin = (event: React.PointerEvent, handle: HandleId | 'move'): void => {
    if (event.button !== 0 || pending === undefined || !parent) return;
    event.stopPropagation();
    event.preventDefault();

    // A medida do PAI, colhida antes da conversao: depois dela o DOM se
    // reorganiza em `CanvasSlot` e nao ha mais o que medir no meio do gesto.
    const path = indexPath(spec.root, parent.id);
    const parentEl = path && elementAt(artboard?.querySelector('.vsl-root') ?? null, path);
    const box = parentEl?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0 || scale <= 0) return;

    beginGesture();
    setProp(parent.id, 'placement', CONTAINER_CANVAS);
    if (!findNode(useEditorStore.getState().spec.root, pending)?.rect) {
      endGesture();
      return;
    }

    rootRef.current?.setPointerCapture(event.pointerId);
    const next: Gesture = {
      pointerId: event.pointerId,
      handle,
      id: pending,
      boxPx: { width: box.width / scale, height: box.height / scale },
      originPx: { x: event.clientX, y: event.clientY },
    };
    live.current = next;
    setGesture(next);
  };

  const move = (event: React.PointerEvent): void => {
    const active = live.current;
    if (active?.pointerId !== event.pointerId) return;

    const root = useEditorStore.getState().spec.root;
    const from = findNode(root, active.id)?.rect;
    const container = parentOf(root, active.id);
    if (!from || !container) return;

    const siblings = (container.children ?? []).flatMap((child) =>
      child.rect ? [{ id: child.id, rect: child.rect }] : [],
    );

    const resolved = applyGesture({
      from,
      handle: active.handle,
      deltaX: ((event.clientX - active.originPx.x) / active.boxPx.width) * 100,
      deltaY: ((event.clientY - active.originPx.y) / active.boxPx.height) * 100,
      siblings,
      skip: new Set([active.id]),
      freeform: event.ctrlKey || event.metaKey,
      axisLock: event.shiftKey,
      proportional: event.shiftKey,
      boxPx: active.boxPx,
    });
    setRect(active.id, resolved.rect);
  };

  const end = (event: React.PointerEvent): void => {
    if (live.current?.pointerId !== event.pointerId) return;
    live.current = null;
    setGesture(null);
    endGesture();
  };

  // Montada ate o fim do gesto: e esta raiz que segura a captura do ponteiro.
  const dragging = gesture !== null;
  if (!ghost && !dragging) return null;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {ghost && !dragging && (
        <div
          className="absolute"
          style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}
        >
          {/* Tracejada e ACROMATICA — `primary` quer dizer "esta na spec", e esta
              caixa foi medida. Halo branco como o `Guideline`, pelo fundo do autor. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-[3px] border border-dashed border-slate-900/45"
            style={{ boxShadow: '0 0 0 1px rgb(255 255 255 / 0.55)' }}
          />

          <GhostChip inside={ghost.y < 24} />

          {/* Decoracao: o caminho com rotulo e foco e o "Posicionar livremente"
              do painel — alca focavel converteria e desmontaria a si mesma. */}
          {HANDLES.map((handle) => (
            <span
              key={handle.id}
              aria-hidden="true"
              onPointerDown={(event) => {
                begin(event, handle.id);
              }}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-xs border border-slate-900/55 bg-white hover:border-primary hover:bg-primary"
              style={{
                left: `${String(handle.x * 100)}%`,
                top: `${String(handle.y * 100)}%`,
                cursor: handle.cursor,
                pointerEvents: 'auto',
                touchAction: 'none',
              }}
            />
          ))}

          <span
            aria-hidden="true"
            onPointerDown={(event) => {
              begin(event, 'move');
            }}
            className="absolute inset-0"
            style={{ pointerEvents: 'auto', cursor: 'grab', touchAction: 'none' }}
          />
        </div>
      )}
    </div>
  );
}

/** A pilula do `Readout`, com a mesma medida: converter mexe nos IRMAOS, e isso precisa estar dito antes do gesto. */
function GhostChip({ inside }: { inside: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 rounded bg-slate-900 px-1.5 py-0.5 text-micro font-medium text-white shadow-sm ${
        inside ? 'top-0.5' : '-top-5'
      }`}
      style={{ pointerEvents: 'none' }}
    >
      Arrastar torna livre
    </span>
  );
}
