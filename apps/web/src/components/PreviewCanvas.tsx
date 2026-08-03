'use client';

import { artboardOf } from '@vislow/component-registry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArtboardBar } from '@/components/ArtboardBar';
import { fitScale, type Pane } from '@/lib/artboard';
import { issuesByNode } from '@/lib/issues';
import { useEditorStore } from '@/store/useEditorStore';
import { SpecPreview } from './SpecPreview';

/**
 * Area de preview (RF-05).
 *
 * O canvas cuida do ENQUADRAMENTO — prancheta, moldura, fundo, escala. Quem
 * desenha a arvore e o `SpecPreview`, que e o gemeo do codegen. Separar os dois e
 * o que permite mexer na aparencia do editor sem risco de mexer no que o Power BI
 * vai mostrar.
 *
 * A PRANCHETA E DESENHADA EM PIXEL DE VERDADE e reduzida por escala uniforme para
 * caber no painel. E a unica forma de o tamanho declarado significar algo: a
 * geometria dos nos e proporcional (`NodeRect`), mas a tipografia nao, entao
 * desenhar so a proporcao faria 1920x1080 e 640x360 produzirem o mesmo preview e
 * composicoes diferentes. A escala e `transform`, que NAO altera o tamanho de
 * layout: os graficos continuam medindo a prancheta em px reais, e o que o
 * Recharts calcula aqui e o que ele calcularia numa moldura daquele tamanho.
 *
 * Num container que POSICIONA, o preview tem selecao e arrasto: a camada de
 * manipulacao e filha absoluta do container, fora do fluxo, e nao toca na cadeia
 * de flex que os graficos usam para medir (ADR-18). Num container que EMPILHA
 * continua sem — la nao ha geometria de onde derivar a camada, e a objecao da
 * ADR-14 segue de pe. A selecao pelo painel de arvore funciona nos dois casos.
 *
 * O arrasto sobrevive a escala sem saber dela: o `CanvasOverlay` converte
 * deslocamento de ponteiro em percentual dividindo pela caixa lida no
 * `pointerdown`, e `getBoundingClientRect` ja devolve a caixa TRANSFORMADA — as
 * duas medidas vivem no mesmo espaco, e a razao entre elas nao muda.
 *
 * RN-02: nenhum dado do modelo do Power BI passa por aqui — o app nem tem acesso
 * a ele.
 */

export function PreviewCanvas() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const setRect = useEditorStore((s) => s.setRect);
  const setArtboard = useEditorStore((s) => s.setArtboard);

  const paneRef = useRef<HTMLDivElement>(null);
  // `null` ate a primeira medicao. Distinto de zero de proposito: o painel de
  // largura zero e um estado real (janela minima) e nao deve virar "ainda nao
  // sei", que e o que segura o desenho da moldura.
  const [pane, setPane] = useState<Pane | null>(null);

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

  // Memoizado porque `issuesByNode` constroi Maps novos: sem isso o
  // `SpecPreview` re-renderiza a cada render do canvas, inclusive ao redimensionar
  // a janela, e os graficos remontam sem motivo.
  const byNode = useMemo(() => issuesByNode(spec, issues), [spec, issues]);

  // Memoizado pelo mesmo motivo do `byNode`: um objeto novo a cada render faria
  // o `SpecPreview` remontar os graficos a cada movimento do ponteiro, que e
  // exatamente quando isso mais custa.
  const edit = useMemo(
    () => ({ selectedId, onSelect: select, onChange: setRect }),
    [selectedId, select, setRect],
  );

  const artboard = artboardOf(spec);
  const scale = fitScale(artboard, pane);

  return (
    <main className="flex h-full flex-1 flex-col gap-2 overflow-hidden bg-slate-100 p-6 dark:bg-slate-950">
      {/* Legenda da figura, nao do controle: o que ela qualifica e o desenho
          acima dela — os numeros dos graficos sao inventados aqui (RN-02, o app
          nem tem acesso ao modelo). */}
      <p className="shrink-0 text-right text-[11px] text-slate-400">dados de exemplo</p>

      <div ref={paneRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          className="overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-slate-200 dark:ring-slate-700"
          style={{
            // A moldura tem o tamanho JA REDUZIDO; o conteudo dentro dela e que
            // guarda o tamanho declarado. Arredondado porque meio pixel de
            // moldura desenha um fio do fundo na borda.
            width: Math.round(artboard.width * scale),
            height: Math.round(artboard.height * scale),
            // Antes da medicao a moldura teria o tamanho cheio dentro de um
            // painel menor. Um frame de prancheta cortada e pior que um frame
            // sem prancheta.
            visibility: pane ? 'visible' : 'hidden',
          }}
        >
          <div
            className="origin-top-left"
            style={{ width: artboard.width, height: artboard.height, transform: `scale(${String(scale)})` }}
          >
            <SpecPreview spec={spec} issues={byNode} edit={edit} />
          </div>
        </div>
      </div>

      <ArtboardBar artboard={artboard} scale={scale} onChange={setArtboard} />
    </main>
  );
}
