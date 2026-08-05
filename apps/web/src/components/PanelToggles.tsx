'use client';

import { PanelLeft, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/store/useUiStore';

/**
 * Mostrar e ocultar as duas colunas.
 *
 * MORAM NA BARRA DO TOPO, e nao flutuando sobre o shell. A primeira versao os
 * ancorou em `absolute top-2 left-2/right-2` sobre a area de trabalho, com a
 * justificativa de que assim ficariam no mesmo lugar com a coluna aberta ou
 * recolhida. A justificativa nao sobrevive ao caso aberto: eles ficavam no mesmo
 * lugar COBRINDO o conteudo da coluna — o botao de adicionar componente, a
 * primeira linha das propriedades.
 *
 * Ancora-los na borda do canvas so mudaria o problema de lugar: na faixa
 * estreita a coluna aberta vira gaveta SOBRE o canvas, e o gatilho voltaria a
 * ficar por cima dela.
 *
 * Na barra do topo eles nao cobrem nada em largura nenhuma, nao se mexem quando
 * um divisor e arrastado, e ficam junto do seletor de tema — que e a outra coisa
 * ali que muda a VISTA e nao o projeto.
 */
export function PanelToggles() {
  const leftCollapsed = useUiStore((s) => s.leftCollapsed);
  const rightCollapsed = useUiStore((s) => s.rightCollapsed);
  const toggleLeft = useUiStore((s) => s.toggleLeft);
  const toggleRight = useUiStore((s) => s.toggleRight);

  return (
    <div className="flex items-center gap-0.5">
      <Toggle
        icon={PanelLeft}
        nome="a coluna da esquerda"
        collapsed={leftCollapsed}
        onToggle={toggleLeft}
      />
      <Toggle
        icon={PanelRight}
        nome="a coluna da direita"
        collapsed={rightCollapsed}
        onToggle={toggleRight}
      />
    </div>
  );
}

function Toggle({
  icon: Icon,
  nome,
  collapsed,
  onToggle,
}: {
  icon: typeof PanelLeft;
  nome: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const rotulo = `${collapsed ? 'Mostrar' : 'Ocultar'} ${nome}`;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      // Alternancia, como as ferramentas: `aria-pressed` conta se a coluna esta
      // a vista, que e o estado, e nao o que o clique vai fazer.
      aria-pressed={!collapsed}
      aria-label={rotulo}
      title={rotulo}
      onClick={onToggle}
      className={collapsed ? 'text-muted-foreground' : 'text-foreground'}
    >
      <Icon />
    </Button>
  );
}
