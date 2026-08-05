'use client';

import { type NodeRect } from '@vislow/component-registry';
import { useEffect, useRef, useState } from 'react';
import {
  applyGesture,
  byKeyboard,
  type BoxPx,
  type Guide,
  type HandleId,
} from '@/lib/canvasGeometry';
import { rectToPx } from '@/lib/units';

/**
 * A camada de manipulacao de um container que posiciona livremente.
 *
 * POR QUE ELA PODE EXISTIR (ADR-18, que substitui a ADR-14 neste caso). A ADR-14
 * proibiu interacao no preview por MEDICAO: um elemento a mais na cadeia de flex
 * faz o `ResponsiveContainer` medir outra altura, e o preview deixa de valer como
 * referencia. Esta camada e filha ABSOLUTA de um container `relative` — esta fora
 * do fluxo, nao participa de cadeia de flex nenhuma e nao pode alterar a medida de
 * irmao algum. E, por estar dentro do proprio container, herda o sistema de
 * coordenadas dele: as caixas sao desenhadas com os MESMOS percentuais que estao
 * na spec, sem `ref`, sem `ResizeObserver`, sem medir nada para desenhar.
 *
 * Pixel so entra no gesto: converter o deslocamento do ponteiro em percentual
 * exige saber o tamanho do container, e isso e lido UMA vez, no `pointerdown` —
 * leitura de layout em evento, nunca em render.
 *
 * O QUE ELA CUSTA: dentro de um canvas, a camada fica por cima dos graficos, e o
 * tooltip do Recharts no preview deixa de aparecer ali. E troca deliberada — num
 * editor de composicao, selecionar e arrastar valem mais que o balao de exemplo.
 * O tooltip que importa e o do host, no visual compilado (RF-19), e esse nao e
 * afetado: nada disto vai para o pacote.
 *
 * DESENHO. As bordas do no selecionado sao marcadas por CANTONEIRAS, nao por um
 * retangulo inteiro: um contorno completo desenha uma borda falsa em volta do
 * componente, e e justamente a borda dele que o usuario esta julgando. As guias
 * de alinhamento nao tem cor propria — nucleo escuro com halo claro, que le sobre
 * qualquer fundo, porque a composicao do usuario pode ter qualquer hex.
 */

export interface OverlayChild {
  id: string;
  rect: NodeRect;
  /** Rotulo do tipo, para o nome acessivel das alcas. */
  label: string;
  /** Container que posiciona: duplo clique desce um nivel para dentro dele. */
  enterable?: boolean;
}

/**
 * As oito alcas. O rotulo ja vem com a preposicao porque canto e masculino e
 * borda e feminino — montar a frase com um artigo fixo produz "pelo borda
 * direita" em metade delas, que e como este teste apareceu.
 */
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
  /**
   * Quem o gesto move. NAO e lido de `selectedId` a cada movimento: com Alt o
   * gesto passa a mover uma COPIA criada no proprio `pointerdown`, e ler a
   * selecao do render anterior moveria o original por um quadro.
   */
  targetId: string;
  /** Caixa no inicio do gesto — o delta e sempre relativo a ela, nao acumulado. */
  from: NodeRect;
  /** Tamanho do container em px, lido uma vez no pointerdown. */
  boxPx: { width: number; height: number };
  originPx: { x: number; y: number };
}

export function CanvasOverlay({
  items,
  selectedId,
  onSelect,
  onChange,
  onDuplicate,
  onMeasure,
  scale = 1,
  onGestureStart,
  onGestureEnd,
  onEnter,
}: {
  items: readonly OverlayChild[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, rect: NodeRect) => void;
  /** Devolve o id da copia, para que o gesto passe a arrastar ELA. */
  onDuplicate?: ((id: string) => string | null) | undefined;
  /** Publica o tamanho do container em pixel DA PRANCHETA (sem o zoom). */
  onMeasure?: ((size: BoxPx) => void) | undefined;
  /** Zoom da camera, para tirar a ampliacao da medida publicada. */
  scale?: number;
  /** Delimitam UM passo de desfazer. Ver `beginGesture` no store. */
  onGestureStart?: (() => void) | undefined;
  onGestureEnd?: (() => void) | undefined;
  /** Duplo clique num container filho: desce um nivel. */
  onEnter?: ((id: string) => void) | undefined;
}) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  // Espelho do gesto para os handlers de ponteiro: eles rodam entre renders, e
  // ler do estado daria a caixa de um frame atras no meio do arrasto.
  const live = useRef<Gesture | null>(null);
  // A raiz da camada cobre exatamente o container (`inset-0`), entao a caixa dela
  // E a caixa do canvas em pixel. E a UNICA medicao do componente, e acontece no
  // pointerdown — nunca em render.
  const rootRef = useRef<HTMLDivElement>(null);
  // Marca que o gesto de ponteiro ja tratou esta interacao. O `click` que vem
  // depois de um arrasto e ruido: sem esta guarda, soltar uma copia feita com
  // Alt terminaria selecionando de volta o original.
  const handled = useRef(false);
  // Tamanho do container em pixel da prancheta. So para EXIBIR numero — o gesto
  // usa a caixa que ele mesmo leu no `pointerdown`, em pixel de tela.
  const [measured, setMeasured] = useState<BoxPx | undefined>(undefined);

  const selected = selectedId === null ? undefined : items.find((c) => c.id === selectedId);

  /**
   * Tamanho do container em pixel.
   *
   * Leitura de layout SEMPRE dentro de um evento, nunca em render — e a regra
   * que mantem esta camada barata. O gesto le uma vez no `pointerdown`; o
   * teclado le a cada tecla, que e raro o bastante para nao custar nada.
   */
  const measure = (): BoxPx | undefined => {
    const box = rootRef.current?.getBoundingClientRect();
    return box && box.width > 0 && box.height > 0
      ? { width: box.width, height: box.height }
      : undefined;
  };

  /**
   * Publica o tamanho do container para quem fala PIXEL — o painel da direita.
   *
   * O `ResizeObserver` observa o elemento QUE JA EXISTE: a raiz da camada e
   * `absolute inset-0` sobre o container, esta fora do fluxo e nao entra em
   * cadeia de flex nenhuma. Medir aqui nao acrescenta elemento nenhum, e a
   * objecao da ADR-14 continua respeitada.
   *
   * A medida e dividida pelo ZOOM antes de sair: quem consome quer pixel da
   * prancheta, que e o numero que o usuario digita. Publicar pixel de tela faria
   * a largura escrita no painel mudar sozinha ao girar a roda.
   */
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
    // Botao secundario abre o menu do navegador; arrastar com ele nao existe.
    if (event.button !== 0) return;

    // O canvas em volta limpa a selecao no `pointerdown`. Parar aqui e o que
    // separa "cliquei no vazio" de "cliquei num componente" — sem isto, todo
    // clique numa caixa desselecionaria no mesmo instante em que seleciona.
    event.stopPropagation();

    const box = measure();
    if (!box) return;

    handled.current = true;

    // ANTES da duplicacao: assim o Alt+arrastar inteiro — criar a copia e
    // leva-la ate onde ela para — e UM passo de desfazer, e nao dois.
    onGestureStart?.();

    // Alt duplica arrastando, como em qualquer editor de desenho: o original
    // fica onde estava e o ponteiro leva a copia. Sem copia possivel (raiz, ou
    // sem `onDuplicate`), o gesto continua sendo um mover comum.
    const target = (event.altKey && handle === 'move' ? onDuplicate?.(child.id) : null) ?? child.id;
    if (target !== selectedId) onSelect(target);

    // A captura fica no proprio botao, e ele NAO desmonta ao ser selecionado:
    // selecionado e nao selecionado renderizam o MESMO elemento, e so a moldura
    // em volta muda. Foi por isto que os dois ramos foram unificados — trocar de
    // elemento no `pointerdown` perderia a captura e mataria o arrasto no berco.
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();

    const next: Gesture = {
      pointerId: event.pointerId,
      handle,
      targetId: target,
      from: child.rect,
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

    // Ctrl/Cmd solta do encaixe. Antes era Alt, que agora duplica — e duplicar
    // e o significado que Alt tem em todo editor de desenho, entao quem mudou
    // de lugar foi o escape do encaixe.
    const resolved = applyGesture({
      from: active.from,
      handle: active.handle,
      deltaX,
      deltaY,
      siblings: items,
      selectedId: active.targetId,
      freeform: event.ctrlKey || event.metaKey,
      axisLock: event.shiftKey,
      proportional: event.shiftKey,
      // A MESMA caixa lida no `pointerdown`: e ela que converte a tolerancia de
      // encaixe de pixel de tela para % do container.
      boxPx: active.boxPx,
    });
    setGuides(resolved.guides);
    onChange(active.targetId, resolved.rect);
  };

  const end = (event: React.PointerEvent): void => {
    if (live.current?.pointerId !== event.pointerId) return;
    live.current = null;
    setGesture(null);
    setGuides([]);
    // Fecha o passo de desfazer e paga de uma vez o que o arrasto adiou:
    // revalidar a spec e gravar.
    onGestureEnd?.();
  };

  const dragging = gesture !== null;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{
        // A camada nao captura ponteiro por si — quem captura sao as caixas.
        // Assim a area vazia do canvas continua entregando o clique a quem
        // estiver embaixo, em vez de virar um vidro sobre o preview inteiro.
        pointerEvents: 'none',
        // Sem isto, arrastar sobre um texto do preview seleciona o texto junto e
        // o gesto termina com meio visual em azul de selecao.
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {items.map((child) => {
        const isSelected = child.id === selectedId;
        const box = {
          left: `${String(child.rect.x)}%`,
          top: `${String(child.rect.y)}%`,
          width: `${String(child.rect.w)}%`,
          height: `${String(child.rect.h)}%`,
        };

        return (
          <div key={child.id} className="absolute" style={{ ...box, pointerEvents: 'none' }}>
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
                isSelected
                  ? `Mover ${child.label}. Setas movem, Shift ajusta fino, Ctrl redimensiona.`
                  : `Selecionar ${child.label}`
              }
              onPointerDown={(event) => {
                begin(event, 'move', child);
              }}
              // Caminho do TECLADO e da ativacao programatica. O `click` que o
              // navegador emite depois de um arrasto e descartado: quem estava
              // arrastando ja disse o que queria no `pointerdown`.
              onClick={() => {
                if (handled.current) {
                  handled.current = false;
                  return;
                }
                onSelect(child.id);
              }}
              // Duplo clique DESCE um nivel, e so em quem tem nivel. Sobre um
              // grafico ou um texto ele nao faz nada — e o certo: nao ha para
              // onde descer, e reagir mesmo assim ensinaria um gesto que falha
              // na maior parte dos alvos.
              onDoubleClick={() => {
                if (child.enterable === true) onEnter?.(child.id);
              }}
              onKeyDown={(event) => {
                if (!isSelected) return;
                const next = byKeyboard(child.rect, event.key, {
                  coarse: event.shiftKey,
                  resizing: event.ctrlKey || event.metaKey,
                  boxPx: measure(),
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

            {isSelected && HANDLES.map((handle) => (
              <button
                key={handle.id}
                type="button"
                aria-label={`Redimensionar ${handle.label}`}
                onPointerDown={(event) => {
                  begin(event, handle.id, child);
                }}
                // Alca com foco redimensiona SEMPRE: quem chegou ate ela pelo
                // teclado ja disse o que quer, e exigir Ctrl aqui seria pedir
                // duas vezes.
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
                // `bg-white` literal: a alca fica sobre a prancheta. O sky pode
                // ser token — ele e a mesma familia nos dois temas e le bem
                // sobre branco —, mas o miolo da alca, nao.
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

            {isSelected && dragging && (
              <Readout
                rect={child.rect}
                parent={measured}
                resizing={gesture.handle !== 'move'}
              />
            )}
          </div>
        );
      })}

      {guides.map((guide) => (
        <Guideline key={`${guide.axis}-${String(guide.at)}`} guide={guide} />
      ))}

      {/* Quem move pelo teclado nao ve o `Readout`, que e visual e so aparece no
          arrasto. Sem esta regiao, a seta muda a caixa e nada e anunciado — o
          componente "funciona" pelo teclado e mesmo assim e inutilizavel sem
          enxergar. `polite` para nao interromper: a posicao e informacao de
          acompanhamento, nao alerta. */}
      {selected && (
        <span aria-live="polite" className="sr-only">
          {announce(selected.label, selected.rect, measured)}
        </span>
      )}
    </div>
  );
}

/**
 * O que o leitor de tela anuncia a cada mudanca de caixa.
 *
 * Na MESMA unidade do `Readout` e do painel. Antes desta funcao a regiao viva
 * dizia percentual enquanto o resto do editor passou a dizer pixel — quem navega
 * por leitor de tela ouviria "20" onde o campo mostra "256", e nao teria como
 * saber que os dois falam da mesma coisa.
 */
function announce(label: string, rect: NodeRect, parent: BoxPx | undefined): string {
  const px = rectToPx(rect, parent);
  return px
    ? `${label} em ${String(px.x)}, ${String(px.y)} pixels, ` +
        `tamanho ${String(px.w)} por ${String(px.h)} pixels`
    : `${label} em ${String(rect.x)}, ${String(rect.y)}, ` +
        `tamanho ${String(rect.w)} por ${String(rect.h)} por cento`;
}

/**
 * Cantoneiras de registro, em vez de contorno completo.
 *
 * Um retangulo fechado desenha uma borda que o componente nao tem, e a borda do
 * componente e exatamente o que o usuario esta avaliando no preview. As
 * cantoneiras marcam a extensao sem encostar nas arestas.
 */
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

/**
 * Guia de alinhamento: nucleo escuro com halo claro.
 *
 * Sem cor propria de proposito. Uma guia colorida compete com a composicao — que
 * pode ter qualquer hex, inclusive o mesmo — e some justamente sobre o fundo que
 * o usuario escolheu. O par nucleo/halo le sobre qualquer coisa.
 */
function Guideline({ guide }: { guide: Guide }) {
  const vertical = guide.axis === 'x';
  return (
    <span
      aria-hidden="true"
      // Slate-900 literal: a guia e desenhada SOBRE a prancheta, que e branca
      // nos dois temas. `bg-foreground` a deixaria branca no escuro — uma guia
      // invisivel sobre o fundo que ela deveria cortar.
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

/**
 * Leitura numerica presa ao no, so durante o gesto.
 *
 * Aparece junto da caixa e nao no painel porque quem arrasta esta olhando para a
 * caixa; um numero do outro lado da tela nao e lido no meio do movimento.
 */
function Readout({
  rect,
  parent,
  resizing,
}: {
  rect: NodeRect;
  parent: BoxPx | undefined;
  resizing: boolean;
}) {
  // Pixel quando o pai foi medido, percentual enquanto nao foi. Sem o `%` no
  // fim, os dois numeros seriam indistinguiveis e o de reserva mentiria.
  const px = rectToPx(rect, parent);
  const text = px
    ? resizing
      ? `${String(px.w)} × ${String(px.h)}`
      : `${String(px.x)}, ${String(px.y)}`
    : resizing
      ? `${String(rect.w)}% × ${String(rect.h)}%`
      : `${String(rect.x)}%, ${String(rect.y)}%`;

  // Acima da caixa, exceto quando ela esta colada no topo: la a moldura do
  // preview corta o balao, e o numero some justamente enquanto se arrasta.
  const inside = rect.y < 8;

  return (
    <span
      aria-hidden="true"
      // Mesma razao da guia: a leitura fica sobre a prancheta branca, entao a
      // etiqueta e escura com texto claro nos DOIS temas do editor.
      className={`absolute left-0 rounded bg-slate-900 px-1.5 py-0.5 text-micro font-medium tabular-nums text-white shadow-sm ${
        inside ? 'top-0.5' : '-top-5'
      }`}
      style={{ pointerEvents: 'none' }}
    >
      {text}
    </span>
  );
}
