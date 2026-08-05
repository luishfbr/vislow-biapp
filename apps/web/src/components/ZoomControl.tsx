'use client';

import { Minus, Plus, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCALE_MAX, SCALE_MIN, ZOOM_STEP } from '@/lib/viewport';

/**
 * A camera, flutuando sobre a prancheta.
 *
 * Antes a escala era uma legenda de texto acima do canvas e os unicos comandos
 * eram atalhos (`Ctrl+0`, `Ctrl+1`, `Ctrl+roda`) — descobriveis so por quem lesse
 * o rodape. Aqui ela vira controle, e os atalhos continuam valendo.
 *
 * NAO HA MATEMATICA DE CAMERA NESTE ARQUIVO. `zoomAt`, `zoomToScale` e
 * `fitToPane` vivem em `lib/viewport.ts`, sem React, e e la que se testam; este
 * componente so decide qual pedir. Uma segunda implementacao do zoom aqui seria
 * a que diverge no dia em que os limites mudarem.
 *
 * Flutua ancorado embaixo e a direita, e nao numa faixa propria: faixa custaria
 * altura permanente do canvas, que e o que este sprint inteiro esta tentando
 * devolver.
 */
export function ZoomControl({
  scale,
  onZoom,
  onScale,
  onFit,
}: {
  scale: number;
  /** Multiplica a escala atual, ancorando no centro do painel. */
  onZoom: (factor: number) => void;
  /** Vai para uma escala exata. */
  onScale: (scale: number) => void;
  /** Reenquadra a prancheta inteira. */
  onFit: () => void;
}) {
  const percent = Math.round(scale * 100);

  return (
    <div
      // `absolute` e fora do fluxo: a prancheta e medida pelo painel inteiro, e
      // um controle no fluxo mudaria a medida de que o enquadramento depende.
      className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur-sm"
      role="group"
      aria-label="Zoom"
    >
      <div className="pointer-events-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reduzir"
          title="Reduzir (Ctrl+roda)"
          disabled={scale <= SCALE_MIN}
          onClick={() => {
            onZoom(1 / ZOOM_STEP);
          }}
        >
          <Minus />
        </Button>

        {/* O numero e um BOTAO: clicar volta para 100%, que e o gesto que todo
            editor de desenho tem e ninguem precisa aprender. */}
        <Button
          variant="ghost"
          size="sm"
          className="min-w-14 font-mono tabular-nums"
          title="Voltar para 100% (Ctrl+0)"
          onClick={() => {
            onScale(1);
          }}
        >
          {percent}%
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Ampliar"
          title="Ampliar (Ctrl+roda)"
          disabled={scale >= SCALE_MAX}
          onClick={() => {
            onZoom(ZOOM_STEP);
          }}
        >
          <Plus />
        </Button>

        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

        {/* So "enquadrar". O "ver em 100%" seria um segundo botao para o que o
            proprio numero ja faz ao ser clicado. */}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Enquadrar a prancheta"
          title="Enquadrar a prancheta (Ctrl+1)"
          onClick={onFit}
        >
          <Scan />
        </Button>
      </div>
    </div>
  );
}
