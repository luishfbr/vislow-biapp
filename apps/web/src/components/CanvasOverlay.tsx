'use client';

import { type NodeRect } from '@vislow/component-registry';
import { useRef, useState } from 'react';
import {
  applyGesture,
  byKeyboard,
  type Guide,
  type HandleId,
} from '@/lib/canvasGeometry';

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
}: {
  items: readonly OverlayChild[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChange: (id: string, rect: NodeRect) => void;
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

  const selected = items.find((child) => child.id === selectedId);

  const begin = (event: React.PointerEvent, handle: HandleId | 'move', rect: NodeRect): void => {
    // Botao secundario abre o menu do navegador; arrastar com ele nao existe.
    if (event.button !== 0) return;
    const box = rootRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();

    const next: Gesture = {
      pointerId: event.pointerId,
      handle,
      from: rect,
      boxPx: { width: box.width, height: box.height },
      originPx: { x: event.clientX, y: event.clientY },
    };
    live.current = next;
    setGesture(next);
  };

  const move = (event: React.PointerEvent): void => {
    const active = live.current;
    if (active?.pointerId !== event.pointerId || !selected) return;

    const deltaX = ((event.clientX - active.originPx.x) / active.boxPx.width) * 100;
    const deltaY = ((event.clientY - active.originPx.y) / active.boxPx.height) * 100;

    // Alt solta do encaixe: e o gesto que todo editor de desenho usa para dizer
    // "eu sei o que estou fazendo, sai da frente".
    const resolved = applyGesture({
      from: active.from,
      handle: active.handle,
      deltaX,
      deltaY,
      siblings: items,
      selectedId,
      freeform: event.altKey,
    });
    setGuides(resolved.guides);
    onChange(selectedId, resolved.rect);
  };

  const end = (event: React.PointerEvent): void => {
    if (live.current?.pointerId !== event.pointerId) return;
    live.current = null;
    setGesture(null);
    setGuides([]);
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

        if (!isSelected) {
          return (
            <button
              key={child.id}
              type="button"
              aria-label={`Selecionar ${child.label}`}
              onClick={() => {
                onSelect(child.id);
              }}
              className="absolute rounded-[3px] outline-none hover:bg-sky-500/5 hover:ring-1 hover:ring-sky-400/40 focus-visible:ring-2 focus-visible:ring-sky-500"
              style={{ ...box, pointerEvents: 'auto', touchAction: 'manipulation' }}
            />
          );
        }

        return (
          <div key={child.id} className="absolute" style={{ ...box, pointerEvents: 'none' }}>
            {/* Superficie de arrasto. E um `button` porque tem acao e precisa
                receber foco: sem ela, mover um componente exigiria mouse. */}
            <button
              type="button"
              aria-label={`Mover ${child.label}. Setas movem, Shift ajusta fino, Ctrl redimensiona.`}
              onPointerDown={(event) => {
                begin(event, 'move', child.rect);
              }}
              onKeyDown={(event) => {
                const next = byKeyboard(child.rect, event.key, {
                  fine: event.shiftKey,
                  resizing: event.ctrlKey || event.metaKey,
                });
                if (!next) return;
                event.preventDefault();
                onChange(child.id, next);
              }}
              className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              style={{
                pointerEvents: 'auto',
                cursor: dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
            />

            <Brackets />

            {HANDLES.map((handle) => (
              <button
                key={handle.id}
                type="button"
                aria-label={`Redimensionar ${handle.label}`}
                onPointerDown={(event) => {
                  begin(event, handle.id, child.rect);
                }}
                // Alca com foco redimensiona SEMPRE: quem chegou ate ela pelo
                // teclado ja disse o que quer, e exigir Ctrl aqui seria pedir
                // duas vezes.
                onKeyDown={(event) => {
                  const next = byKeyboard(child.rect, event.key, {
                    fine: event.shiftKey,
                    resizing: true,
                  });
                  if (!next) return;
                  event.preventDefault();
                  onChange(child.id, next);
                }}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-xs border border-sky-600 bg-white outline-none hover:border-sky-500 hover:bg-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-slate-900"
                style={{
                  left: `${String(handle.x * 100)}%`,
                  top: `${String(handle.y * 100)}%`,
                  cursor: handle.cursor,
                  pointerEvents: 'auto',
                  touchAction: 'none',
                }}
              />
            ))}

            {dragging && <Readout rect={child.rect} resizing={gesture.handle !== 'move'} />}
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
          {`${selected.label} em ${String(selected.rect.x)}, ${String(selected.rect.y)}, ` +
            `tamanho ${String(selected.rect.w)} por ${String(selected.rect.h)} por cento`}
        </span>
      )}
    </div>
  );
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
          className={`absolute h-3 w-3 border-sky-500 ${corner}`}
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
      className="absolute bg-slate-900 dark:bg-white"
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
function Readout({ rect, resizing }: { rect: NodeRect; resizing: boolean }) {
  const text = resizing
    ? `${String(rect.w)} × ${String(rect.h)}`
    : `${String(rect.x)}, ${String(rect.y)}`;

  // Acima da caixa, exceto quando ela esta colada no topo: la a moldura do
  // preview corta o balao, e o numero some justamente enquanto se arrasta.
  const inside = rect.y < 8;

  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow-sm dark:bg-white dark:text-slate-900 ${
        inside ? 'top-0.5' : '-top-5'
      }`}
      style={{ pointerEvents: 'none' }}
    >
      {text}
    </span>
  );
}
