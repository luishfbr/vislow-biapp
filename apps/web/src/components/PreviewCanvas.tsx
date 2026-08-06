'use client';

import { artboardOf } from '@vislow/component-registry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectionSimControl } from '@/components/SelectionSimControl';
import { ZoomControl } from '@/components/ZoomControl';
import type { Pane } from '@/lib/artboard';
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

/**
 * Area de preview (RF-05).
 *
 * O canvas cuida do ENQUADRAMENTO — prancheta, moldura, fundo, camera. Quem
 * desenha a arvore e o `SpecPreview`, que e o gemeo do codegen. Separar os dois e
 * o que permite mexer na aparencia do editor sem risco de mexer no que o Power BI
 * vai mostrar.
 *
 * A PRANCHETA E DESENHADA EM PIXEL DE VERDADE e transformada por escala uniforme.
 * E a unica forma de o tamanho declarado significar algo: a geometria dos nos e
 * proporcional (`NodeRect`), mas a tipografia nao, entao desenhar so a proporcao
 * faria 1920x1080 e 640x360 produzirem o mesmo preview e composicoes diferentes.
 * A escala e `transform`, que NAO altera o tamanho de layout: um no que se mede
 * continua medindo a prancheta em px reais, e o que ele calcula aqui e o que
 * calcularia numa moldura daquele tamanho.
 *
 * A CAMERA (`lib/viewport.ts`) tem zoom e deslocamento desde 2026-08-04. Antes a
 * escala era so "cabe no painel", presa em 100% no teto — numa prancheta de 1920
 * nada podia ser inspecionado de perto, e julgar um detalhe exigia exportar.
 * Ela e estado do PAINEL, nao do projeto: nao entra na spec nem no
 * `localStorage`, pelo mesmo motivo que a escala nunca entrou.
 *
 * Num container que POSICIONA, o preview tem selecao e arrasto: a camada de
 * manipulacao e filha absoluta do container, fora do fluxo, e nao toca na cadeia
 * de flex de que um no que se mede depende (ADR-18). Num container que EMPILHA
 * continua sem — la nao ha geometria de onde derivar a camada, e a objecao da
 * ADR-14 segue de pe. A selecao pelo painel de arvore funciona nos dois casos.
 *
 * O arrasto sobrevive a camera sem saber dela: o `CanvasOverlay` converte
 * deslocamento de ponteiro em percentual dividindo pela caixa lida no
 * `pointerdown`, e `getBoundingClientRect` ja devolve a caixa TRANSFORMADA — as
 * duas medidas vivem no mesmo espaco, e a razao entre elas nao muda com o zoom.
 *
 * RN-02: nenhum dado do modelo do Power BI passa por aqui — o app nem tem acesso
 * a ele.
 */

/** Um gesto de deslocamento em andamento. */
interface Panning {
  pointerId: number;
  originPx: { x: number; y: number };
  from: Viewport;
}

/** Um retangulo sendo desenhado, em pixel DA PRANCHETA. */
interface Drawing {
  pointerId: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Quanto o ponteiro precisa andar para o gesto contar como DESENHO.
 *
 * Abaixo disso e um clique, e clique solta o componente no tamanho padrao. Sem
 * este piso, uma tremida de dois pixels criaria um componente de 2x2 — abaixo do
 * minimo da spec, e visualmente indistinguivel de "nao aconteceu nada".
 */
const DRAW_MIN_PX = 8;

/** Fracao da prancheta que um componente solto por clique ocupa. */
const DROP_W = 0.4;
const DROP_H = 0.3;

export function PreviewCanvas() {
  const spec = useEditorStore((s) => s.spec);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const setRect = useEditorStore((s) => s.setRect);
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
  // Percorre a arvore, entao memoizado pela spec. Devolve booleano e nao objeto,
  // entao nao ha o risco de re-render em laco dos seletores de zustand — mas
  // recalcular a cada movimento de ponteiro no canvas seria desperdicio.
  const selectable = useMemo(() => hasSelectableMarks(spec), [spec]);

  const paneRef = useRef<HTMLDivElement>(null);
  // `null` ate a primeira medicao. Distinto de zero de proposito: o painel de
  // largura zero e um estado real (janela minima) e nao deve virar "ainda nao
  // sei", que e o que segura o desenho da moldura.
  const [pane, setPane] = useState<Pane | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  // Espaco segurado arma o deslocamento; o gesto so comeca no pointerdown.
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panning = useRef<Panning | null>(null);
  const [dragging, setDragging] = useState(false);
  // O retangulo em desenho. Espelhado num ref pelo mesmo motivo do gesto do
  // canvas: os handlers de ponteiro rodam entre renders.
  const drawing = useRef<Drawing | null>(null);
  const [draft, setDraft] = useState<Drawing | null>(null);

  const artboard = artboardOf(spec);
  const scale = viewport?.scale ?? 1;

  useEffect(() => {
    const element = paneRef.current;
    // Sem `ResizeObserver` — jsdom, por exemplo — a prancheta fica sem medida e
    // nao e desenhada. Preferivel a desenha-la numa escala inventada.
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

  // Enquadra na PRIMEIRA medida — o `?? ` e o que garante isso. Reenquadrar a
  // cada `resize` desfaria o zoom do usuario sempre que ele mexesse na janela, e
  // a janela se mexe ao abrir o console, ao encaixar a aba, ao girar um tablet.
  // Trocar o tamanho da prancheta tambem nao reenquadra: quem quer isso tem o
  // Ctrl+1.
  useEffect(() => {
    if (!pane) return;
    setViewport((current) => current ?? fitToPane(artboard, pane));
  }, [pane, artboard]);

  // ...MAS reenquadra de novo quando o SHELL muda de forma.
  //
  // Recolher uma coluna devolve 20% da largura de uma vez, e manter o
  // enquadramento anterior deixaria a prancheta encostada num canto com um vazio
  // do outro lado — o usuario pediu espaco e recebeu espaco vazio.
  //
  // O gatilho e o `layoutEpoch`, um CONTADOR, e nao a medida do painel: o painel
  // muda de tamanho durante a animacao inteira, e reagir a medida reenquadraria
  // a cada quadro. O contador sobe uma vez por gesto.
  //
  // A primeira execucao e ignorada (`seenEpoch`): ela coincide com a montagem,
  // onde o enquadramento inicial acima ja fez o trabalho.
  const seenEpoch = useRef(layoutEpoch);
  useEffect(() => {
    if (layoutEpoch === seenEpoch.current) return;
    seenEpoch.current = layoutEpoch;
    if (!pane) return;
    setViewport(fitToPane(artboard, pane));
    // `pane` FORA das dependencias de proposito: ele muda junto, um quadro
    // depois, e inclui-lo dispararia este efeito uma segunda vez com a medida
    // nova — reenquadrando duas vezes por gesto.
  }, [layoutEpoch, artboard]);

  // Memoizado: um objeto novo a cada render faria o `SpecPreview` remontar a
  // arvore inteira a cada movimento do ponteiro, que e exatamente quando isso
  // mais custa.
  const edit = useMemo(
    () => ({
      selectedId,
      onSelect: select,
      onChange: setRect,
      onDuplicate: (id: string) => duplicateNode(id, { offset: false }),
      onMeasure: reportContainerSize,
      scale,
      onGestureStart: beginGesture,
      onGestureEnd: endGesture,
      // `null` quer dizer a raiz. Resolvido AQUI, e nao no renderizador: ele
      // percorre a arvore e nao deveria precisar saber qual no e a raiz.
      enteredId: enteredId ?? spec.root.id,
      onEnter: enterContainer,
    }),
    [
      selectedId,
      select,
      setRect,
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

  // Espaco arma o deslocamento, como em qualquer editor de desenho. Ignorado
  // com o foco num campo, onde espaco e um caractere.
  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const down = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || typing(event.target)) return;
      // Sem isto a barra rola o painel e ativa o botao que estiver com foco.
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    // A tecla pode ser solta com a janela fora de foco — e ai o `keyup` nunca
    // chega, e o editor fica preso em modo de deslocamento para sempre.
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

  /**
   * Roda do mouse.
   *
   * Com Ctrl/Cmd amplia; sozinha desloca. E a convencao que o trackpad impoe: um
   * gesto de pinca chega ao navegador como `wheel` com `ctrlKey`, e nao existe
   * evento proprio para ele. Tratar tudo como zoom faria a rolagem de dois dedos
   * ampliar sem parar.
   */
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

  /**
   * Comeca a deslocar: espaco segurado, ou botao do meio.
   *
   * Devolve `true` quando assumiu o gesto — e assim que o `pointerdown` sabe se
   * ainda deve limpar a selecao.
   */
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

  /**
   * Clique no vazio limpa a selecao.
   *
   * Vive AQUI, e nao no `CanvasOverlay`: a camada precisa continuar deixando o
   * ponteiro passar (`pointerEvents: 'none'` na raiz dela), senao o canvas
   * inteiro vira um vidro sobre o preview. Quem captura sao as caixas dos nos, e
   * elas param a propagacao — entao tudo o que chega ate este handler
   * atravessou o vazio.
   *
   * `pointerdown` e nao `click`: a selecao tem de sumir no instante em que o
   * botao desce, junto com o inicio de qualquer gesto, e nao no `mouseup`.
   */
  /** Ponto de tela -> pixel da prancheta. Desfaz o deslocamento e o zoom. */
  const toArtboard = (event: React.PointerEvent): { x: number; y: number } | null => {
    const box = paneRef.current?.getBoundingClientRect();
    if (!box || !viewport) return null;
    return {
      x: (event.clientX - box.left - viewport.tx) / viewport.scale,
      y: (event.clientY - box.top - viewport.ty) / viewport.scale,
    };
  };

  const onPointerDown = (event: React.PointerEvent): void => {
    if (beginPan(event)) return;
    if (event.button !== 0) return;

    // Com um tipo armado, o gesto na prancheta DESENHA — ele nao seleciona nem
    // limpa. Sem esta saida, comecar a desenhar apagaria a selecao no primeiro
    // quadro e o painel da direita piscaria para o estado de projeto.
    if (paletteKind !== null) {
      const point = toArtboard(event);
      if (!point) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drawing.current = { pointerId: event.pointerId, from: point, to: point };
      setDraft(drawing.current);
      return;
    }

    if (selectedId === null) return;
    select(null);
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

  /**
   * Fecha o desenho: cria o componente e desarma a paleta.
   *
   * Gesto curto vale como CLIQUE e solta no tamanho padrao, centrado no ponto.
   * Exigir um retangulo de quem so quis "poe um KPI aqui" seria pedir precisao
   * onde nao ha decisao nenhuma a tomar ainda.
   */
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

    // `clampRect` prende dentro do pai no store; aqui so se converte a unidade.
    addNodeAt(kind, {
      x: (box.x / artboard.width) * 100,
      y: (box.y / artboard.height) * 100,
      w: (box.w / artboard.width) * 100,
      h: (box.h / artboard.height) * 100,
    });
  };

  const endPointer = (event: React.PointerEvent): void => {
    endDraw(event);
    if (panning.current?.pointerId !== event.pointerId) return;
    panning.current = null;
    setDragging(false);
  };

  // Ctrl+0 volta a 100%, Ctrl+1 enquadra. Os mesmos dois de sempre num editor de
  // desenho, e os unicos que valem a pena: o resto e a roda.
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
        // A BANCADA. Escurece um passo em relacao ao editor e ganha uma trama de
        // pontos: sem ela o deslocamento nao tem referencia nenhuma — a
        // prancheta desliza sobre um vazio liso e o gesto parece nao responder.
        // A trama acompanha a camera, entao ela tambem DIZ a escala.
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
          // Sem isto o navegador rola a pagina no gesto de dois dedos, e o pan
          // do canvas nunca chega a acontecer.
          touchAction: 'none',
          // Deslocar ou desenhar sobre o preview selecionaria o texto dos
          // componentes junto, e o gesto terminaria com meio visual em azul.
          userSelect: dragging || draft ? 'none' : undefined,
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div
          // `bg-white` LITERAL, e nao `bg-card`. Esta caixa nao e interface do
          // editor: e a pagina do relatorio do Power BI, e ela e branca. Um
          // token que vira com o tema do editor escureceria a prancheta quando o
          // usuario troca o TEMA DELE, mentindo sobre onde o visual vai parar —
          // e as cores do proprio visual saem da spec, nao daqui.
          className="absolute left-0 top-0 origin-top-left overflow-hidden bg-white shadow-lg ring-1 ring-black/10"
          style={{
            width: artboard.width,
            height: artboard.height,
            // `translate` ANTES de `scale`: o deslocamento e em pixel de tela, e
            // na ordem inversa ele seria multiplicado pela escala.
            transform: `translate(${String(viewport?.tx ?? 0)}px, ${String(viewport?.ty ?? 0)}px) scale(${String(scale)})`,
            // Antes da medicao a prancheta apareceria em tamanho cheio no canto
            // do painel. Um frame de prancheta fora de lugar e pior que um frame
            // sem prancheta.
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
