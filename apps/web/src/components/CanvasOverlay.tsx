'use client';

import { type NodeRect } from '@vislow/component-registry';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  applyGesture,
  applyGroupMove,
  byKeyboard,
  unionRect,
  type BoxPx,
  type Guide,
  type HandleId,
} from '@/lib/canvasGeometry';
import { rectToPx } from '@/lib/units';

export interface OverlayChild {
  id: string;
  rect: NodeRect;
  label: string;
  enterable?: boolean;
}

const HANDLES: { id: HandleId; label: string; x: number; y: number; cursor: string }[] = [
  { id: 'nw', label: 'pelo canto superior esquerdo', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', label: 'pela borda superior', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', label: 'pelo canto superior direito', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'e', label: 'pela borda direita', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', label: 'pelo canto inferior direito', x: 1, y: 1, cursor: 'nwse-resize' },
  { id: 's', label: 'pela borda inferior', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', label: 'pelo canto inferior esquerdo', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'w', label: 'pela borda esquerda', x: 0, y: 0.5, cursor: 'ew-resize' },
];

interface Gesture {
  pointerId: number;
  handle: HandleId | 'move';
  /** A caixa de CADA UM no inicio do gesto: o delta e sempre relativo a ela, nunca acumulado. */
  targets: readonly { id: string; from: NodeRect }[];
  union: NodeRect;
  boxPx: { width: number; height: number };
  originPx: { x: number; y: number };
}

export function CanvasOverlay({
  items,
  selectedIds,
  onSelect,
  onToggle,
  onChange,
  onChangeMany,
  onDuplicate,
  onMeasure,
  scale = 1,
  onGestureStart,
  onGestureEnd,
  onEnter,
  menu,
}: {
  items: readonly OverlayChild[];
  selectedIds: readonly string[];
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onChange: (id: string, rect: NodeRect) => void;
  onChangeMany: (entries: readonly { id: string; rect: NodeRect }[]) => void;
  onDuplicate?: ((ids: readonly string[]) => readonly string[]) | undefined;
  onMeasure?: ((size: BoxPx) => void) | undefined;
  scale?: number;
  onGestureStart?: (() => void) | undefined;
  onGestureEnd?: (() => void) | undefined;
  onEnter?: ((id: string) => void) | undefined;
  /** Embrulho de cada no. E por aqui que o menu de contexto entra, sem esta camada conhecer o store. */
  menu?: ((id: string, children: ReactNode) => ReactNode) | undefined;
}) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const live = useRef<Gesture | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handled = useRef(false);
  const [measured, setMeasured] = useState<BoxPx | undefined>(undefined);

  const selectedHere = items.filter((child) => selectedIds.includes(child.id));
  const only = selectedHere.length === 1 ? selectedHere[0] : undefined;
  const groupBox = selectedHere.length > 1 ? unionRect(selectedHere.map((c) => c.rect)) : null;

  // Leitura de layout SEMPRE dentro de um evento, nunca em render: e o que mantem esta camada barata.
  const measure = (): BoxPx | undefined => {
    const box = rootRef.current?.getBoundingClientRect();
    return box && box.width > 0 && box.height > 0
      ? { width: box.width, height: box.height }
      : undefined;
  };

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const read = (): void => {
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || scale <= 0) return;
      const size = { width: box.width / scale, height: box.height / scale };
      setMeasured((current) =>
        current?.width === size.width && current.height === size.height ? current : size,
      );
      onMeasure?.(size);
    };

    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onMeasure, scale]);

  const begin = (
    event: React.PointerEvent,
    handle: HandleId | 'move',
    child: OverlayChild,
  ): void => {
    if (event.button !== 0) return;

    event.stopPropagation();

    if (event.shiftKey && handle === 'move') {
      handled.current = true;
      onToggle(child.id);
      return;
    }

    const box = measure();
    if (!box) return;

    const inSelection = selectedIds.includes(child.id);
    const moving =
      handle === 'move' && inSelection && selectedHere.length > 1 ? selectedHere : [child];

    handled.current = true;

    onGestureStart?.();

    const ids = moving.map((item) => item.id);
    const copies = event.altKey && handle === 'move' ? onDuplicate?.(ids) : undefined;
    const duplicated = copies?.length === moving.length;

    const targets = moving.map((item, index) => ({
      id: duplicated ? (copies[index] ?? item.id) : item.id,
      from: item.rect,
    }));

    if (!duplicated && !inSelection) onSelect(child.id);

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();

    const union = unionRect(targets.map((target) => target.from));
    if (!union) return;

    const next: Gesture = {
      pointerId: event.pointerId,
      handle,
      targets,
      union,
      boxPx: { width: box.width, height: box.height },
      originPx: { x: event.clientX, y: event.clientY },
    };
    live.current = next;
    setGesture(next);
  };

  const move = (event: React.PointerEvent): void => {
    const active = live.current;
    if (active?.pointerId !== event.pointerId) return;

    const deltaX = ((event.clientX - active.originPx.x) / active.boxPx.width) * 100;
    const deltaY = ((event.clientY - active.originPx.y) / active.boxPx.height) * 100;

    const freeform = event.ctrlKey || event.metaKey;
    const skip = new Set(active.targets.map((target) => target.id));

    const single = active.targets.length === 1 ? active.targets[0] : undefined;
    if (single) {
      const resolved = applyGesture({
        from: single.from,
        handle: active.handle,
        deltaX,
        deltaY,
        siblings: items,
        skip,
        freeform,
        axisLock: event.shiftKey,
        proportional: event.shiftKey,
        boxPx: active.boxPx,
      });
      setGuides(resolved.guides);
      onChange(single.id, resolved.rect);
      return;
    }

    const resolved = applyGroupMove({
      union: active.union,
      deltaX,
      deltaY,
      siblings: items,
      movingIds: skip,
      freeform,
      axisLock: event.shiftKey,
      boxPx: active.boxPx,
    });
    setGuides(resolved.guides);
    onChangeMany(
      active.targets.map((target) => ({
        id: target.id,
        rect: {
          ...target.from,
          x: target.from.x + resolved.delta.dx,
          y: target.from.y + resolved.delta.dy,
        },
      })),
    );
  };

  const end = (event: React.PointerEvent): void => {
    if (live.current?.pointerId !== event.pointerId) return;
    live.current = null;
    setGesture(null);
    setGuides([]);
    requestAnimationFrame(() => {
      handled.current = false;
    });
    onGestureEnd?.();
  };

  const dragging = gesture !== null;

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
      {items.map((child) => {
        const isSelected = selectedIds.includes(child.id);
        const showHandles = isSelected && selectedHere.length === 1;
        const box = {
          left: `${String(child.rect.x)}%`,
          top: `${String(child.rect.y)}%`,
          width: `${String(child.rect.w)}%`,
          height: `${String(child.rect.h)}%`,
        };

        const node = (
          <div
            key={child.id}
            data-node-id={child.id}
            className="absolute"
            style={{ ...box, pointerEvents: 'none' }}
          >
            {/* UM SO botao, selecionado ou nao. E um `button` porque tem acao e
                precisa receber foco: sem ele, mover um componente exigiria
                mouse. E ele nao pode ser trocado por outro elemento quando a
                selecao muda — o `pointerdown` que seleciona tambem captura o
                ponteiro, e um elemento que desmonta no mesmo instante leva a
                captura embora. Era esse o motivo de selecionar e arrastar
                exigirem dois gestos separados. */}
            <button
              type="button"
              aria-label={
                !isSelected
                  ? `Selecionar ${child.label}`
                  : groupBox
                    ? `Mover ${String(selectedHere.length)} componentes selecionados. ` +
                      'Setas movem o bloco, Shift ajusta fino.'
                    : `Mover ${child.label}. Setas movem, Shift ajusta fino, Ctrl redimensiona.`
              }
              onPointerDown={(event) => {
                begin(event, 'move', child);
              }}
              onClick={(event) => {
                if (handled.current) {
                  handled.current = false;
                  return;
                }
                if (event.shiftKey) onToggle(child.id);
                else onSelect(child.id);
              }}
              onDoubleClick={() => {
                if (child.enterable === true) onEnter?.(child.id);
              }}
              onKeyDown={(event) => {
                if (!isSelected) return;
                const boxPx = measure();

                if (groupBox) {
                  const moved = byKeyboard(groupBox, event.key, {
                    coarse: event.shiftKey,
                    resizing: false,
                    boxPx,
                  });
                  if (!moved) return;
                  event.preventDefault();
                  const dx = moved.x - groupBox.x;
                  const dy = moved.y - groupBox.y;
                  onChangeMany(
                    selectedHere.map((item) => ({
                      id: item.id,
                      rect: { ...item.rect, x: item.rect.x + dx, y: item.rect.y + dy },
                    })),
                  );
                  return;
                }

                const next = byKeyboard(child.rect, event.key, {
                  coarse: event.shiftKey,
                  resizing: event.ctrlKey || event.metaKey,
                  boxPx,
                });
                if (!next) return;
                event.preventDefault();
                onChange(child.id, next);
              }}
              className={`absolute inset-0 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected ? '' : 'hover:bg-primary/5 hover:ring-1 hover:ring-ring/40'
              }`}
              style={{
                pointerEvents: 'auto',
                cursor: dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
            />

            {isSelected && <Brackets />}

            {showHandles && HANDLES.map((handle) => (
              <button
                key={handle.id}
                type="button"
                aria-label={`Redimensionar ${handle.label}`}
                onPointerDown={(event) => {
                  begin(event, handle.id, child);
                }}
                onKeyDown={(event) => {
                  const next = byKeyboard(child.rect, event.key, {
                    coarse: event.shiftKey,
                    resizing: true,
                    boxPx: measure(),
                  });
                  if (!next) return;
                  event.preventDefault();
                  onChange(child.id, next);
                }}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-xs border border-primary bg-white outline-none hover:border-primary hover:bg-primary focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  left: `${String(handle.x * 100)}%`,
                  top: `${String(handle.y * 100)}%`,
                  cursor: handle.cursor,
                  pointerEvents: 'auto',
                  touchAction: 'none',
                }}
              />
            ))}

            {/* Um so numero por gesto: com um bloco arrastando, uma etiqueta por
                no viraria uma pilha de numeros sobre a composicao, e nenhum
                deles seria o que o usuario esta acompanhando. */}
            {showHandles && dragging && (
              <Readout
                rect={child.rect}
                parent={measured}
                resizing={gesture.handle !== 'move'}
              />
            )}
          </div>
        );

        return menu ? menu(child.id, node) : node;
      })}

      {/* A moldura do bloco: tracejada e SEM alca, porque nao ha o que arrastar
          nela. Ela existe para dizer onde o bloco comeca e acaba — que com os
          nos espalhados nao se le somando as cantoneiras de cada um. */}
      {groupBox && (
        <span
          aria-hidden="true"
          className="absolute rounded-[3px] border border-dashed border-primary/70"
          style={{
            left: `${String(groupBox.x)}%`,
            top: `${String(groupBox.y)}%`,
            width: `${String(groupBox.w)}%`,
            height: `${String(groupBox.h)}%`,
            pointerEvents: 'none',
          }}
        />
      )}

      {guides.map((guide) => (
        <Guideline key={`${guide.axis}-${String(guide.at)}`} guide={guide} />
      ))}

      {/* Quem move pelo teclado nao ve o `Readout`, que e visual e so aparece no
          arrasto. Sem esta regiao, a seta muda a caixa e nada e anunciado — o
          componente "funciona" pelo teclado e mesmo assim e inutilizavel sem
          enxergar. `polite` para nao interromper: a posicao e informacao de
          acompanhamento, nao alerta. */}
      {(only ?? groupBox) && (
        <span aria-live="polite" className="sr-only">
          {only
            ? announce(only.label, only.rect, measured)
            : // Com um bloco, a caixa de cada no nao ajuda: sao N numeros para
              `${String(selectedHere.length)} componentes selecionados` +
              (groupBox ? `, ${announce('bloco', groupBox, measured)}` : '')}
        </span>
      )}
    </div>
  );
}

function announce(label: string, rect: NodeRect, parent: BoxPx | undefined): string {
  const px = rectToPx(rect, parent);
  return px
    ? `${label} em ${String(px.x)}, ${String(px.y)} pixels, ` +
        `tamanho ${String(px.w)} por ${String(px.h)} pixels`
    : `${label} em ${String(rect.x)}, ${String(rect.y)}, ` +
        `tamanho ${String(rect.w)} por ${String(rect.h)} por cento`;
}

/** Cantoneiras, e nao contorno fechado: um retangulo desenharia uma borda que o componente nao tem. */
function Brackets() {
  const corners = [
    'left-0 top-0 border-l-2 border-t-2 rounded-tl-[3px]',
    'right-0 top-0 border-r-2 border-t-2 rounded-tr-[3px]',
    'left-0 bottom-0 border-b-2 border-l-2 rounded-bl-[3px]',
    'right-0 bottom-0 border-b-2 border-r-2 rounded-br-[3px]',
  ];
  return (
    <>
      {corners.map((corner) => (
        <span
          key={corner}
          aria-hidden="true"
          className={`absolute h-3 w-3 border-primary ${corner}`}
        />
      ))}
    </>
  );
}

/** Nucleo escuro com halo claro, sem cor propria: uma guia colorida competiria com a composicao. */
function Guideline({ guide }: { guide: Guide }) {
  const vertical = guide.axis === 'x';
  return (
    <span
      aria-hidden="true"
      className="absolute bg-slate-900"
      style={{
        ...(vertical
          ? { left: `${String(guide.at)}%`, top: 0, bottom: 0, width: 1 }
          : { top: `${String(guide.at)}%`, left: 0, right: 0, height: 1 }),
        boxShadow: '0 0 0 1px rgb(255 255 255 / 0.7)',
        pointerEvents: 'none',
      }}
    />
  );
}

function Readout({
  rect,
  parent,
  resizing,
}: {
  rect: NodeRect;
  parent: BoxPx | undefined;
  resizing: boolean;
}) {
  const px = rectToPx(rect, parent);
  const text = px
    ? resizing
      ? `${String(px.w)} × ${String(px.h)}`
      : `${String(px.x)}, ${String(px.y)}`
    : resizing
      ? `${String(rect.w)}% × ${String(rect.h)}%`
      : `${String(rect.x)}%, ${String(rect.y)}%`;

  const inside = rect.y < 8;

  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 rounded bg-slate-900 px-1.5 py-0.5 text-micro font-medium tabular-nums text-white shadow-sm ${
        inside ? 'top-0.5' : '-top-5'
      }`}
      style={{ pointerEvents: 'none' }}
    >
      {text}
    </span>
  );
}
