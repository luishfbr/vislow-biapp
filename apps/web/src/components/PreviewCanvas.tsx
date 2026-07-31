'use client';

import { useMemo, useState } from 'react';
import { issuesByNode } from '@/lib/issues';
import { useEditorStore } from '@/store/useEditorStore';
import { SpecPreview } from './SpecPreview';

/**
 * Area de preview (RF-05).
 *
 * O canvas cuida do ENQUADRAMENTO — proporcao, moldura, fundo. Quem desenha a
 * arvore e o `SpecPreview`, que e o gemeo do codegen. Separar os dois e o que
 * permite mexer na aparencia do editor sem risco de mexer no que o Power BI vai
 * mostrar.
 *
 * Num container que POSICIONA, o preview tem selecao e arrasto: a camada de
 * manipulacao e filha absoluta do container, fora do fluxo, e nao toca na cadeia
 * de flex que os graficos usam para medir (ADR-18). Num container que EMPILHA
 * continua sem — la nao ha geometria de onde derivar a camada, e a objecao da
 * ADR-14 segue de pe. A selecao pelo painel de arvore funciona nos dois casos.
 *
 * RN-02: nenhum dado do modelo do Power BI passa por aqui — o app nem tem acesso
 * a ele.
 */

const RATIOS = [
  { label: '16:9', value: 16 / 9 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
] as const;

export function PreviewCanvas() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const setRect = useEditorStore((s) => s.setRect);
  const [ratio, setRatio] = useState<number>(16 / 9);

  // Memoizado porque `issuesByNode` constroi Maps novos: sem isso o
  // `SpecPreview` re-renderiza a cada render do canvas, inclusive ao trocar a
  // proporcao, e os graficos remontam sem motivo.
  const byNode = useMemo(() => issuesByNode(spec, issues), [spec, issues]);

  // Memoizado pelo mesmo motivo do `byNode`: um objeto novo a cada render faria
  // o `SpecPreview` remontar os graficos a cada movimento do ponteiro, que e
  // exatamente quando isso mais custa.
  const edit = useMemo(
    () => ({ selectedId, onSelect: select, onChange: setRect }),
    [selectedId, select, setRect],
  );

  return (
    <main className="flex h-full flex-1 flex-col items-center justify-center gap-4 overflow-auto bg-slate-100 p-8 dark:bg-slate-950">
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-slate-200 dark:ring-slate-700"
        style={{ aspectRatio: String(ratio) }}
      >
        <SpecPreview spec={spec} issues={byNode} edit={edit} />
      </div>

      <div className="flex items-center gap-2">
        {RATIOS.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => {
              setRatio(r.value);
            }}
            aria-pressed={ratio === r.value}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              ratio === r.value
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600'
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-slate-400">dados de exemplo</span>
      </div>
    </main>
  );
}
