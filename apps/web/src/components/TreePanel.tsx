'use client';

import {
  NODE_DESCRIPTORS,
  acceptsChildren,
  parentOf,
  type SpecNode,
} from '@vislow/component-registry';
import { useMemo } from 'react';
import { issuesByNode, markedAncestors } from '@/lib/issues';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Arvore navegavel (RF-04).
 *
 * E aqui que a selecao mora, e nao no preview: envolver cada no do preview num
 * elemento clicavel mudaria a cadeia de flex que os graficos usam para medir
 * altura, e o preview deixaria de valer como referencia do resultado final
 * (ADR-04). Na arvore a selecao nao custa nada.
 */

/**
 * Um rotulo que diz QUAL no e, nao so de que tipo.
 *
 * Numa composicao com tres textos, "Texto, Texto, Texto" nao ajuda ninguem. O
 * conteudo ou o papel ligado e o que o usuario reconhece.
 */
function describe(node: SpecNode): string {
  const descriptor = NODE_DESCRIPTORS[node.kind];
  const content = node.props.content;
  if (typeof content === 'string' && content.trim() !== '') {
    return `${descriptor.label} — ${content.slice(0, 24)}`;
  }

  const measure = node.props.measureRole;
  if (typeof measure === 'string') return `${descriptor.label} — ${measure}`;

  const children = node.children?.length ?? 0;
  if (acceptsChildren(node)) {
    return `${descriptor.label} (${String(children)})`;
  }
  return descriptor.label;
}

/** Os conjuntos vem prontos de cima: recalcular por linha seria O(n²). */
function TreeRow({
  node,
  depth,
  faultyIds,
}: {
  node: SpecNode;
  depth: number;
  faultyIds: ReadonlySet<string>;
}) {
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);

  const selected = node.id === selectedId;
  const faulty = faultyIds.has(node.id);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          select(node.id);
        }}
        aria-current={selected}
        style={{ paddingLeft: `${String(depth * 0.75 + 0.5)}rem` }}
        className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-xs transition-colors ${
          selected
            ? 'bg-sky-100 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-100'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        <span className="truncate">{describe(node)}</span>
        {faulty && (
          // Marca tambem os ANCESTRAIS: um problema num no profundo deixaria o
          // export bloqueado sem indicio nenhum na parte visivel da arvore.
          <span
            aria-label="tem campo pendente"
            className="ml-auto shrink-0 text-[10px] text-amber-600 dark:text-amber-400"
          >
            ●
          </span>
        )}
      </button>
      {node.children?.map((child) => (
        <TreeRow key={child.id} node={child} depth={depth + 1} faultyIds={faultyIds} />
      ))}
    </>
  );
}

const TOOL =
  'rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 ' +
  'enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 ' +
  'dark:border-slate-600 dark:text-slate-300 dark:enabled:hover:bg-slate-800';

export function TreePanel() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const selectedId = useEditorStore((s) => s.selectedId);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const moveSelected = useEditorStore((s) => s.moveSelected);

  // Nos com problema PROPRIO, unidos aos ancestrais que os contem — calculado
  // uma vez para a arvore inteira.
  const faultyIds = useMemo(() => {
    const own = new Set(issuesByNode(spec, issues).keys());
    const withAncestors = new Set(own);
    for (const id of markedAncestors(spec, own)) withAncestors.add(id);
    return withAncestors;
  }, [spec, issues]);

  const parent = parentOf(spec.root, selectedId);
  const siblings = parent?.children ?? [];
  const index = siblings.findIndex((child) => child.id === selectedId);

  // O botao so fica ativo quando a operacao seria aceita — as mesmas condicoes
  // que `moveNode` e `removeNode` checam. Botao ativo que nao faz nada e a
  // versao de interface do no-op silencioso.
  const isRoot = parent === null;
  const canMoveUp = !isRoot && index > 0;
  const canMoveDown = !isRoot && index >= 0 && index < siblings.length - 1;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Composicao
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            className={TOOL}
            disabled={!canMoveUp}
            onClick={() => {
              moveSelected(-1);
            }}
            title="Mover para cima"
            aria-label="Mover para cima"
          >
            ↑
          </button>
          <button
            type="button"
            className={TOOL}
            disabled={!canMoveDown}
            onClick={() => {
              moveSelected(1);
            }}
            title="Mover para baixo"
            aria-label="Mover para baixo"
          >
            ↓
          </button>
          <button
            type="button"
            className={TOOL}
            disabled={isRoot}
            onClick={removeSelected}
            title={isRoot ? 'A raiz nao pode ser removida' : 'Remover'}
            aria-label="Remover"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded border border-slate-200 py-1 dark:border-slate-700">
        <TreeRow node={spec.root} depth={0} faultyIds={faultyIds} />
      </div>
    </section>
  );
}
