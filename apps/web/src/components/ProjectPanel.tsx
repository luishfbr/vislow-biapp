'use client';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AddComponentButton } from '@/components/AddComponentDialog';
import { DataPanel } from '@/components/DataPanel';
import { TreePanel } from '@/components/TreePanel';
import { MIN_LAYERS, useUiStore } from '@/store/useUiStore';

/**
 * Coluna esquerda: O QUE EXISTE no projeto.
 *
 * A regra do shell e uma so e vale para as duas colunas — esquerda: o que
 * existe; direita: o que esta selecionado. E o modelo do Figma, e e o que faz
 * "onde acho isso?" ter uma resposta em vez de varias.
 *
 * A PALETA SAIU DAQUI. Virou a barra de ferramentas do topo, onde nao disputa
 * altura com a arvore. Sobraram duas faixas, e agora elas dividem a altura por um
 * DIVISOR ARRASTAVEL em vez de por alturas fixas.
 *
 * O defeito que isso conserta: a coluna era `overflow-hidden` com tres faixas de
 * altura fixa e uma elastica, entao numa tela baixa a arvore encolhia para perto
 * de zero E NAO HAVIA O QUE ROLAR — nem na faixa, que ja nao tinha altura, nem na
 * coluna, que nao rolava. O `minSize` do painel de camadas torna esse estado
 * inalcancavel, em vez de improvavel.
 */
export function ProjectPanel() {
  const layersHeight = useUiStore((s) => s.layersHeight);
  const setLayersHeight = useUiStore((s) => s.setLayersHeight);

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-card">
      <div className="shrink-0 p-3">
        <AddComponentButton />
      </div>

      <PanelGroup direction="vertical" className="min-h-0 flex-1">
        <Panel
          id="camadas"
          order={1}
          defaultSize={layersHeight}
          minSize={MIN_LAYERS}
          onResize={setLayersHeight}
          className="flex min-h-0 flex-col"
        >
          <TreePanel />
        </Panel>

        <PanelResizeHandle
          className="group relative h-1.5 shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Redimensionar as camadas"
        >
          {/* A linha e de 1px, mas a area de agarrar tem 6px: uma alca de 1px e
              alcancavel com o mouse e impossivel com trackpad. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-ring group-data-[resize-handle-state=drag]:bg-ring"
          />
        </PanelResizeHandle>

        <Panel id="dados" order={2} minSize={15} className="flex min-h-0 flex-col">
          <DataPanel />
        </Panel>
      </PanelGroup>
    </aside>
  );
}
