'use client';

import { NODE_DESCRIPTORS, NODE_KINDS, type NodeKind } from '@vislow/component-registry';
import {
  ChartArea,
  ChartColumn,
  ChartLine,
  ChartPie,
  Frame,
  Gauge,
  MousePointer2,
  Type,
} from 'lucide-react';
import { useRef, type ComponentType, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { SELECT_SHORTCUT } from '@/lib/shortcuts';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * A barra de ferramentas — o que substituiu a paleta em trama da coluna esquerda.
 *
 * O MODELO E O DE EDITOR DE DESENHO: uma ferramenta fica armada, o ponteiro vira
 * mira sobre a prancheta, e o proximo arrasto desenha a caixa. Selecionar e uma
 * ferramenta como as outras, e e a de repouso — `Esc` sempre volta para ela.
 *
 * Antes eram TRES caminhos simultaneos para inserir: clicar na ficha, arrastar a
 * ficha e o `Ctrl+K`. O arrastar-da-ficha saiu: ele fazia o mesmo que armar e
 * desenhar, com um segundo codigo de gesto para manter. O `Ctrl+K` continua, e
 * continua sendo o caminho quando o catalogo crescer demais para caber aqui.
 *
 * Os ICONES sao a unica coisa deste arquivo que nao sai do catalogo, e por isso
 * o mapa e exaustivo por `NodeKind`: um tipo novo nao compila ate escolher um
 * icone. Nao da para derivar desenho de um `label`, mas da para impedir que o
 * tipo novo apareca sem desenho nenhum.
 */
const ICONS: Record<NodeKind, ComponentType<{ className?: string }>> = {
  container: Frame,
  text: Type,
  kpi: Gauge,
  barChart: ChartColumn,
  lineChart: ChartLine,
  areaChart: ChartArea,
  pieChart: ChartPie,
};

export function Toolbar() {
  const paletteKind = useEditorStore((s) => s.paletteKind);
  const armPalette = useEditorStore((s) => s.armPalette);
  const strip = useRef<HTMLDivElement>(null);

  /**
   * FOCO EM RODA — um unico ponto de parada no Tab, setas andam entre as
   * ferramentas.
   *
   * E o que `role="toolbar"` PROMETE, e a promessa nao e decorativa: sem ela,
   * chegar ao campo de nome pelo teclado custaria oito paradas de Tab, e quem
   * usa leitor de tela ouviria a barra inteira antes de cada uso do editor.
   *
   * A busca e por DOM, e nao por indice guardado em estado: a barra e derivada
   * do catalogo e um tipo de no novo entra sem que este codigo saiba.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const botoes = [...(strip.current?.querySelectorAll('button') ?? [])];
    if (botoes.length === 0) return;

    const atual = botoes.findIndex((b) => b === document.activeElement);
    // Circular: da ultima volta para a primeira. Numa fila curta e visivel,
    // parar na ponta so obriga a voltar apertando a seta sete vezes.
    const anda = (passo: number): number => (atual + passo + botoes.length) % botoes.length;

    const alvo =
      event.key === 'ArrowRight'
        ? anda(1)
        : event.key === 'ArrowLeft'
          ? anda(-1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? botoes.length - 1
              : null;

    if (alvo === null) return;
    event.preventDefault();
    botoes[alvo]?.focus();
  };

  return (
    <div
      ref={strip}
      role="toolbar"
      aria-label="Ferramentas"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex items-center gap-0.5"
    >
      <ToolButton
        icon={MousePointer2}
        label="Selecionar"
        hint="Selecionar, mover e redimensionar o que ja existe."
        shortcut={SELECT_SHORTCUT}
        armed={paletteKind === null}
        onArm={() => {
          armPalette(null);
        }}
      />

      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />

      {NODE_KINDS.map((kind) => {
        const descriptor = NODE_DESCRIPTORS[kind];
        return (
          <ToolButton
            key={kind}
            icon={ICONS[kind]}
            label={descriptor.label}
            hint={descriptor.hint}
            shortcut={descriptor.shortcut}
            armed={paletteKind === kind}
            onArm={() => {
              // Clicar na ferramenta ja armada volta para selecionar, em vez de
              // nao fazer nada: e a saida mais perto da mao de quem armou por
              // engano, e casa com o `Esc`.
              armPalette(paletteKind === kind ? null : kind);
            }}
          />
        );
      })}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  hint,
  shortcut,
  armed,
  onArm,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  shortcut: string;
  armed: boolean;
  onArm: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      // Alternancia, e nao acao: `aria-pressed` e o que conta o estado armado a
      // quem nao ve o destaque. A ferramenta de selecao entra no mesmo esquema
      // porque ela tambem TEM estado — e o estado de repouso.
      aria-pressed={armed}
      aria-keyshortcuts={shortcut}
      // O ponto de parada unico da barra e a ferramenta ARMADA — e sempre ha
      // uma, porque "selecionar" tambem e ferramenta. Entrar pelo Tab poe o foco
      // no que esta ativo, que e onde a atencao ja esta.
      tabIndex={armed ? 0 : -1}
      // O titulo carrega a tecla porque a barra e so de icones: sem ele, a unica
      // forma de descobrir o atalho seria adivinhar a inicial.
      title={`${label} (${shortcut}) — ${hint}`}
      aria-label={label}
      onClick={onArm}
      className={armed ? 'bg-primary/15 text-primary hover:bg-primary/20' : 'text-muted-foreground'}
    >
      <Icon />
    </Button>
  );
}
