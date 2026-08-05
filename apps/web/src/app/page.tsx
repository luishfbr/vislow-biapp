'use client';

import { useEffect, type ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Header } from '@/components/Header';
import { PreviewCanvas } from '@/components/PreviewCanvas';
import { ProjectPanel } from '@/components/ProjectPanel';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { SmallScreenNotice } from '@/components/SmallScreenNotice';
import { StatusBar } from '@/components/StatusBar';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useEditorShortcuts } from '@/lib/useEditorShortcuts';
import { useEditorStore } from '@/store/useEditorStore';
import { useUiStore } from '@/store/useUiStore';

/**
 * O shell do editor.
 *
 * TRES FAIXAS DE LARGURA, e cada uma tem um comportamento declarado:
 *
 *   >= 1280  como abaixo, e o rotulo do campo de nome volta a aparecer na barra
 *            (`xl:not-sr-only` no `Header`);
 *   >= 1024  as duas colunas ancoradas, arrastaveis e recolhiveis, com a
 *            prancheta entre elas;
 *   >=  768  a prancheta ocupa a largura toda e as colunas viram GAVETA sobre
 *            ela, recolhidas por padrao — uma coluna aberta cobre o canvas em
 *            vez de espremer;
 *   <   768  o editor nao se oferece (`SmallScreenNotice`).
 *
 * Ate este sprint nao havia faixa nenhuma: `w-72` e `w-80` fixos, `shrink-0` nos
 * dois, e o canvas absorvendo todo o encolhimento ate chegar a zero. Havia UM
 * prefixo de breakpoint em todo o `apps/web`.
 */
export default function EditorPage() {
  const hydrate = useEditorStore((s) => s.hydrate);
  const hydrated = useEditorStore((s) => s.hydrated);
  const hydrateUi = useUiStore((s) => s.hydrate);

  useEditorShortcuts();

  // A leitura do localStorage acontece so no cliente: fazer no render causaria
  // divergencia de hidratacao com o HTML gerado no build estatico. Vale para os
  // dois stores, pelo mesmo motivo.
  useEffect(() => {
    hydrate();
    hydrateUi();
  }, [hydrate, hydrateUi]);

  return (
    <>
      <SmallScreenNotice />
      <div className="hidden h-full flex-col md:flex">
        <Header />
        {hydrated ? <Workbench /> : <Loading />}
        <StatusBar />
      </div>
    </>
  );
}

function Workbench() {
  const leftWidth = useUiStore((s) => s.leftWidth);
  const rightWidth = useUiStore((s) => s.rightWidth);
  const leftCollapsed = useUiStore((s) => s.leftCollapsed);
  const rightCollapsed = useUiStore((s) => s.rightCollapsed);
  const setLeftWidth = useUiStore((s) => s.setLeftWidth);
  const setRightWidth = useUiStore((s) => s.setRightWidth);
  const collapseBoth = useUiStore((s) => s.collapseBoth);

  // Acima de 1024px cabem tres colunas lado a lado. Abaixo, a coluna aberta vira
  // GAVETA sobre o canvas — espremer prancheta, camadas e propriedades em 900px
  // entrega as tres inutilizaveis em vez de uma util.
  const roomy = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    if (!roomy) collapseBoth();
  }, [roomy, collapseBoth]);

  return (
    <div className="relative flex min-h-0 flex-1">
      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        {roomy && !leftCollapsed && (
          <>
            <Panel
              id="existe"
              order={1}
              defaultSize={leftWidth}
              minSize={12}
              maxSize={32}
              onResize={setLeftWidth}
              className="min-h-0"
            >
              <ProjectPanel />
            </Panel>
            <ColumnHandle label="Redimensionar a coluna da esquerda" />
          </>
        )}

        <Panel id="prancheta" order={2} minSize={30} className="min-h-0">
          <PreviewCanvas />
        </Panel>

        {roomy && !rightCollapsed && (
          <>
            <ColumnHandle label="Redimensionar a coluna da direita" />
            <Panel
              id="selecionado"
              order={3}
              defaultSize={rightWidth}
              minSize={14}
              maxSize={34}
              onResize={setRightWidth}
              className="min-h-0"
            >
              <PropertiesPanel />
            </Panel>
          </>
        )}
      </PanelGroup>

      {/* As gavetas da faixa estreita. Sem `role="dialog"` e sem retencao de
          foco: elas nao sao modais — a prancheta continua clicavel ao lado, e e
          justamente isso que se quer ao arrastar um componente com a arvore a
          vista. O que elas ganham e sombra e largura fixa. */}
      {!roomy && !leftCollapsed && (
        <Drawer side="left">
          <ProjectPanel />
        </Drawer>
      )}
      {!roomy && !rightCollapsed && (
        <Drawer side="right">
          <PropertiesPanel />
        </Drawer>
      )}

    </div>
  );
}

/**
 * A coluna como gaveta, na faixa estreita. Largura em `rem` e nao em `%`: o
 * painel de propriedades tem uma grade de duas colunas com a da direita fixa em
 * 9rem, e um percentual de uma janela de 800px a esmagaria.
 */
function Drawer({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-y-0 z-20 w-72 shadow-xl ${side === 'left' ? 'left-0' : 'right-0'}`}
    >
      {children}
    </div>
  );
}

/** A alca entre duas colunas: 1px de linha, 6px de area de agarrar. */
function ColumnHandle({ label }: { label: string }) {
  return (
    <PanelResizeHandle
      aria-label={label}
      className="group relative w-1.5 shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-ring group-data-[resize-handle-state=drag]:bg-ring"
      />
    </PanelResizeHandle>
  );
}

/**
 * Os paineis esperam a hidratacao junto com o canvas: montar a arvore sobre a
 * spec inicial e troca-la logo depois faria a selecao saltar sozinha na primeira
 * interacao.
 */
function Loading() {
  return (
    <div className="flex min-h-0 flex-1 gap-px bg-border" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando projeto…</span>
      {/* Esqueleto com a FORMA do shell, e nao uma linha de texto centralizada:
          o layout que vai aparecer ja esta anunciado, entao a chegada do
          conteudo nao reposiciona nada. */}
      <div className="w-[18%] animate-pulse bg-card" />
      <div className="flex-1 animate-pulse bg-background" />
      <div className="w-[20%] animate-pulse bg-card" />
    </div>
  );
}
