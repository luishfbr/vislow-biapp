'use client';

import { MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * O interruptor de "simular selecao", flutuando sobre a prancheta.
 *
 * ============================ O PROBLEMA QUE RESOLVE ========================
 * Uma marca que filtra o relatorio tem DOIS estados de repouso, nao um: cheia, e
 * esmaecida porque a selecao esta em outro item. O segundo pode ocupar quase a
 * tela inteira de uma Lista de Ranking, e e um estado que o autor precisa
 * DESENHAR — a opacidade e um campo dele.
 *
 * Ate a spec 5.3.0 esse estado era invisivel no editor: `sampleFrame` monta o
 * quadro sem `host`, `hostOf` cai no `INERT_HOST` e `hasSelection` e sempre
 * falso. O autor so via como fica depois de exportar, importar no Power BI
 * Desktop e clicar. Este botao troca esse ciclo por um clique.
 * ============================================================================
 *
 * E um INTERRUPTOR e nao um clique na linha da lista: pressionar um no ja
 * seleciona e arrasta no mesmo gesto, e somar "alterna o filtro" faria o autor
 * bagunçar selecoes ao mover o componente. Detalhe em `useUiStore`.
 *
 * Ancorado embaixo e a ESQUERDA, espelhando a camera a direita, e `absolute`
 * pelo mesmo motivo dela: um controle no fluxo mudaria a medida do painel de que
 * o enquadramento depende.
 *
 * Nao se desenha quando a arvore nao tem marca selecionavel — ver
 * `hasSelectableMarks`. Interruptor que nao muda nada na tela e pior do que
 * interruptor nenhum.
 */
export function SelectionSimControl({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 flex items-center rounded-lg border border-border bg-card/95 p-1 shadow-md backdrop-blur-sm"
      role="group"
      aria-label="Simulacao"
    >
      <Button
        variant={active ? 'secondary' : 'ghost'}
        size="sm"
        className="pointer-events-auto gap-1.5"
        // `aria-pressed` e nao `aria-checked`: e um botao que alterna um modo, e
        // nao uma caixa de selecao dentro de um formulario. O leitor de tela
        // anuncia "pressionado", que e o que o autor precisa saber.
        aria-pressed={active}
        title={
          active
            ? 'Mostrando como fica quando a selecao esta em outro item'
            : 'Ver como as marcas ficam quando ha selecao no relatorio'
        }
        onClick={onToggle}
      >
        <MousePointerClick />
        Simular selecao
      </Button>
    </div>
  );
}
