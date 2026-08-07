'use client';

import { artboardOf } from '@vislow/component-registry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectionSimControl } from '@/components/SelectionSimControl';
import { ZoomControl } from '@/components/ZoomControl';
import type { Pane } from '@/lib/artboard';
import { bandOf, marqueeHits, type ScreenRect } from '@/lib/canvasGeometry';
import { hasSelectableMarks } from '@/lib/previewHost';
import {
  ZOOM_STEP,
  fitToPane,
  panBy,
  zoomAt,
  zoomToScale,
  type Viewport,
} from '@/lib/viewport';
import { useEditorStore } from '@/store/useEditorStore';
import { useUiStore } from '@/store/useUiStore';
import { SpecPreview } from './SpecPreview';

interface Panning {
  pointerId: number;
  originPx: { x: number; y: number };
  from: Viewport;
}

interface Drawing {
  pointerId: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface Marquee {
  pointerId: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  boxes: readonly { id: string; box: ScreenRect }[];
  base: readonly string[];
  applied: readonly string[];
}

/** Abaixo disso o gesto conta como CLIQUE, e o componente cai no tamanho padrao. */
const DRAW_MIN_PX = 8;

const DROP_W = 0.4;
const DROP_H = 0.3;

export function PreviewCanvas() {
  const spec = useEditorStore((s) => s.spec);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const select = useEditorStore((s) => s.select);
  const toggleSelected = useEditorStore((s) => s.toggleSelected);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setRect = useEditorStore((s) => s.setRect);
  const setRects = useEditorStore((s) => s.setRects);
  const duplicateNode = useEditorStore((s) => s.duplicateNode);
  const reportContainerSize = useEditorStore((s) => s.reportContainerSize);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const endGesture = useEditorStore((s) => s.endGesture);
  const paletteKind = useEditorStore((s) => s.paletteKind);
  const armPalette = useEditorStore((s) => s.armPalette);
  const addNodeAt = useEditorStore((s) => s.addNodeAt);
  const enteredId = useEditorStore((s) => s.enteredId);
  const enterContainer = useEditorStore((s) => s.enterContainer);

  const layoutEpoch = useUiStore((s) => s.layoutEpoch);
  const simulateSelection = useUiStore((s) => s.simulateSelection);
  const toggleSimulateSelection = useUiStore((s) => s.toggleSimulateSelection);
  const selectable = useMemo(() => hasSelectableMarks(spec), [spec]);

  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState<Pane | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panning = useRef<Panning | null>(null);
  const [dragging, setDragging] = useState(false);
  const drawing = useRef<Drawing | null>(null);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const marquee = useRef<Marquee | null>(null);
  const [band, setBand] = useState<ScreenRect | null>(null);

  const artboard = artboardOf(spec);
  const scale = viewport?.scale ?? 1;

  useEffect(() => {
    const element = paneRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const read = (): void => {
      const { clientWidth, clientHeight } = element;
      if (clientWidth > 0 && clientHeight > 0) setPane({ width: clientWidth, height: clientHeight });
    };

    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!pane) return;
    setViewport((current) => current ?? fitToPane(artboard, pane));
  }, [pane, artboard]);

  const seenEpoch = useRef(layoutEpoch);
  useEffect(() => {
    if (layoutEpoch === seenEpoch.current) return;
    seenEpoch.current = layoutEpoch;
    if (!pane) return;
    setViewport(fitToPane(artboard, pane));
  }, [layoutEpoch, artboard]);

  // Memoizado: um objeto novo por render remontaria a arvore do `SpecPreview` a cada movimento do ponteiro.
  const edit = useMemo(
    () => ({
      selectedIds,
      onSelect: select,
      onToggle: toggleSelected,
      onChange: setRect,
      onChangeMany: setRects,
      onDuplicate: (ids: readonly string[]) => duplicateNode(ids, { offset: false }),
      onMeasure: reportContainerSize,
      scale,
      onGestureStart: beginGesture,
      onGestureEnd: endGesture,
      enteredId: enteredId ?? spec.root.id,
      onEnter: enterContainer,
    }),
    [
      selectedIds,
      select,
      toggleSelected,
      setRect,
      setRects,
      duplicateNode,
      reportContainerSize,
      scale,
      beginGesture,
      endGesture,
      enteredId,
      spec.root.id,
      enterContainer,
    ],
  );

  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || typing(event.target)) return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    const reset = (): void => {
      setSpaceHeld(false);
    };

    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, []);

  const onWheel = (event: React.WheelEvent): void => {
    if (!viewport || !pane) return;
    const box = paneRef.current?.getBoundingClientRect();
    if (!box) return;

    const point = { x: event.clientX - box.left, y: event.clientY - box.top };

    setViewport(
      event.ctrlKey || event.metaKey
        ? zoomAt(viewport, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, point)
        : panBy(viewport, -event.deltaX, -event.deltaY),
    );
  };

  const beginPan = (event: React.PointerEvent): boolean => {
    if (!viewport) return false;
    if (!spaceHeld && event.button !== 1) return false;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panning.current = {
      pointerId: event.pointerId,
      originPx: { x: event.clientX, y: event.clientY },
      from: viewport,
    };
    setDragging(true);
    return true;
  };

  const toArtboard = (event: React.PointerEvent): { x: number; y: number } | null => {
    const box = paneRef.current?.getBoundingClientRect();
    if (!box || !viewport) return null;
    return {
      x: (event.clientX - box.left - viewport.tx) / viewport.scale,
      y: (event.clientY - box.top - viewport.ty) / viewport.scale,
    };
  };

  const toPane = (event: React.PointerEvent): { x: number; y: number } | null => {
    const box = paneRef.current?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : null;
  };

  const readNodeBoxes = (): { id: string; box: ScreenRect }[] => {
    const root = paneRef.current;
    const origin = root?.getBoundingClientRect();
    if (!root || !origin) return [];

    return [...root.querySelectorAll('[data-node-id]')].flatMap((element) => {
      const id = element.getAttribute('data-node-id');
      if (id === null) return [];
      const box = element.getBoundingClientRect();
      return [
        {
          id,
          box: {
            left: box.left - origin.left,
            top: box.top - origin.top,
            right: box.right - origin.left,
            bottom: box.bottom - origin.top,
          },
        },
      ];
    });
  };

  const onPointerDown = (event: React.PointerEvent): void => {
    if (beginPan(event)) return;
    if (event.button !== 0) return;

    if (paletteKind !== null) {
      const point = toArtboard(event);
      if (!point) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drawing.current = { pointerId: event.pointerId, from: point, to: point };
      setDraft(drawing.current);
      return;
    }

    const point = toPane(event);
    if (!point) return;

    const base = event.shiftKey ? selectedIds : [];
    if (!event.shiftKey && selectedIds.length > 0) select(null);

    event.currentTarget.setPointerCapture(event.pointerId);
    marquee.current = {
      pointerId: event.pointerId,
      from: point,
      to: point,
      boxes: readNodeBoxes(),
      base,
      applied: base,
    };
    setBand(bandOf(point, point));
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    const sketch = drawing.current;
    if (sketch?.pointerId === event.pointerId) {
      const point = toArtboard(event);
      if (!point) return;
      drawing.current = { ...sketch, to: point };
      setDraft(drawing.current);
      return;
    }

    const selecting = marquee.current;
    if (selecting?.pointerId === event.pointerId) {
      const point = toPane(event);
      if (!point) return;
      const next = bandOf(selecting.from, point);
      setBand(next);

      const hits = marqueeHits(selecting.boxes, next);
      const wanted = [...new Set([...selecting.base, ...hits])];

      const same =
        wanted.length === selecting.applied.length &&
        wanted.every((id, index) => id === selecting.applied[index]);

      marquee.current = { ...selecting, to: point, applied: same ? selecting.applied : wanted };
      if (!same) setSelection(wanted);
      return;
    }

    const active = panning.current;
    if (active?.pointerId !== event.pointerId) return;
    setViewport(
      panBy(
        active.from,
        event.clientX - active.originPx.x,
        event.clientY - active.originPx.y,
      ),
    );
  };

  const endDraw = (event: React.PointerEvent): void => {
    const sketch = drawing.current;
    if (sketch?.pointerId !== event.pointerId) return;
    drawing.current = null;
    setDraft(null);

    const kind = paletteKind;
    armPalette(null);
    if (!kind) return;

    const width = Math.abs(sketch.to.x - sketch.from.x);
    const height = Math.abs(sketch.to.y - sketch.from.y);
    const tiny = width < DRAW_MIN_PX || height < DRAW_MIN_PX;

    const box = tiny
      ? {
          x: sketch.from.x - (artboard.width * DROP_W) / 2,
          y: sketch.from.y - (artboard.height * DROP_H) / 2,
          w: artboard.width * DROP_W,
          h: artboard.height * DROP_H,
        }
      : {
          x: Math.min(sketch.from.x, sketch.to.x),
          y: Math.min(sketch.from.y, sketch.to.y),
          w: width,
          h: height,
        };

    addNodeAt(kind, {
      x: (box.x / artboard.width) * 100,
      y: (box.y / artboard.height) * 100,
      w: (box.w / artboard.width) * 100,
      h: (box.h / artboard.height) * 100,
    });
  };

  const endPointer = (event: React.PointerEvent): void => {
    endDraw(event);

    if (marquee.current?.pointerId === event.pointerId) {
      marquee.current = null;
      setBand(null);
    }

    if (panning.current?.pointerId !== event.pointerId) return;
    panning.current = null;
    setDragging(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || !pane) return;
      if (event.key === '0') {
        event.preventDefault();
        setViewport((current) => (current ? zoomToScale(current, 1, pane) : current));
      }
      if (event.key === '1') {
        event.preventDefault();
        setViewport(fitToPane(artboard, pane));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pane, artboard]);

  return (
    <main className="relative flex h-full flex-1 flex-col overflow-hidden bg-background p-4">
      <div
        ref={paneRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-muted/60 ring-1 ring-border ring-inset"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1px, transparent 0)',
          backgroundSize: `${String(24 * scale)}px ${String(24 * scale)}px`,
          backgroundPosition: `${String(viewport?.tx ?? 0)}px ${String(viewport?.ty ?? 0)}px`,
          color: 'var(--color-border)',
          cursor: dragging
            ? 'grabbing'
            : spaceHeld
              ? 'grab'
              : paletteKind !== null
                ? 'crosshair'
                : 'default',
          touchAction: 'none',
          userSelect: dragging || draft ? 'none' : undefined,
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div
          // `bg-white` LITERAL: esta caixa e a pagina do relatorio do Power BI, nao interface do editor.
          className="absolute left-0 top-0 origin-top-left overflow-hidden bg-white shadow-lg ring-1 ring-black/10"
          style={{
            width: artboard.width,
            height: artboard.height,
            transform: `translate(${String(viewport?.tx ?? 0)}px, ${String(viewport?.ty ?? 0)}px) scale(${String(scale)})`,
            visibility: viewport ? 'visible' : 'hidden',
          }}
        >
          <SpecPreview spec={spec} edit={edit} simulateSelection={simulateSelection} />
        </div>

        {/* O retangulo em desenho. Fica FORA da prancheta transformada e usa
            coordenadas de tela, senao a espessura da linha seria multiplicada
            pelo zoom — um fio em 25% e uma tarja em 400%. */}
        {draft && viewport && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute border border-primary bg-primary/10"
            style={{
              left: Math.min(draft.from.x, draft.to.x) * viewport.scale + viewport.tx,
              top: Math.min(draft.from.y, draft.to.y) * viewport.scale + viewport.ty,
              width: Math.abs(draft.to.x - draft.from.x) * viewport.scale,
              height: Math.abs(draft.to.y - draft.from.y) * viewport.scale,
            }}
          />
        )}

        {/* A banda de selecao. TRACEJADA, para nao ser confundida com o
            retangulo de desenho — os dois nascem do mesmo gesto no vazio e o
            que os separa e a ferramenta armada, que nao esta na tela. Ja vem em
            pixel do painel: nao ha conversao de camera nenhuma a fazer. */}
        {band && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute border border-dashed border-primary bg-primary/5"
            style={{
              left: band.left,
              top: band.top,
              width: band.right - band.left,
              height: band.bottom - band.top,
            }}
          />
        )}
      </div>

      {/* A escala deixou de ser LEGENDA e virou CONTROLE. Ela sempre descreveu o
          painel e nao o projeto — muda ao redimensionar a janela e ao girar a
          roda, sem ninguem editar nada —, e por isso continua aqui e nao nas
          propriedades. O que mudou e que agora se pode mexer nela sem decorar
          atalho: os tres gestos de camara tinham botao nenhum, e gesto que
          ninguem descobre e gesto que nao existe.

          O aviso de "dados de exemplo" foi para a barra do pacote, junto com o
          resto do que e verdade sobre o projeto. */}
      {/* So aparece quando ha marca que a selecao possa esmaecer. Numa arvore de
          container e texto o interruptor nao mudaria pixel nenhum, e um controle
          inerte na tela e a mesma falha de `direction` num container que
          posiciona livremente. */}
      {selectable && (
        <SelectionSimControl active={simulateSelection} onToggle={toggleSimulateSelection} />
      )}

      <ZoomControl
        scale={scale}
        onZoom={(factor) => {
          setViewport((current) =>
            current && pane
              ? zoomAt(current, factor, { x: pane.width / 2, y: pane.height / 2 })
              : current,
          );
        }}
        onScale={(next) => {
          setViewport((current) => (current ? zoomToScale(current, next, pane) : current));
        }}
        onFit={() => {
          if (pane) setViewport(fitToPane(artboard, pane));
        }}
      />
    </main>
  );
}
