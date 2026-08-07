'use client';

import {
  NODE_DESCRIPTORS,
  acceptsChildren,
  parentOf,
  type SpecNode,
} from '@vislow/component-registry';
import { ArrowDown, ArrowUp, Circle, SlidersHorizontal, X } from 'lucide-react';
import { useMemo } from 'react';
import { PanelSection } from '@/components/PanelSection';
import { Button } from '@/components/ui/button';
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
  const spec = useEditorStore((s) => s.spec);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const select = useEditorStore((s) => s.select);
  const toggleSelected = useEditorStore((s) => s.toggleSelected);
  const setSelection = useEditorStore((s) => s.setSelection);

  const selected = selectedIds.includes(node.id);
  const faulty = faultyIds.has(node.id);
  const published = node.exposed?.length ?? 0;

  /**
   * Shift estende POR INTERVALO, entre irmaos.
   *
   * A ancora e o PRIMEIRO da selecao em ordem de arvore, e nao o ultimo
   * clicado: guardar o ultimo clicado seria estado novo so para isto, e com a
   * lista ja em ordem de arvore os dois dao o mesmo intervalo nos dois sentidos.
   * No de outro pai TROCA a selecao — a mesma regra do canvas.
   */
  const extendTo = (): void => {
    const anchor = selectedIds[0];
    const parent = anchor === undefined ? null : parentOf(spec.root, anchor);
    const kids = parent?.children ?? [];
    const from = kids.findIndex((child) => child.id === anchor);
    const to = kids.findIndex((child) => child.id === node.id);

    if (from < 0 || to < 0) {
      select(node.id);
      return;
    }

    const [lo, hi] = from <= to ? [from, to] : [to, from];
    setSelection(kids.slice(lo, hi + 1).map((child) => child.id));
  };

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          if (event.shiftKey) extendTo();
          else if (event.ctrlKey || event.metaKey) toggleSelected(node.id);
          else select(node.id);
        }}
        // `aria-pressed` e nao `aria-current`: com multi-selecao varias linhas
        // ficam marcadas ao mesmo tempo, e `aria-current` existe para apontar
        // UMA. Cada linha conta o proprio estado, como as ferramentas da barra.
        aria-pressed={selected}
        style={{ paddingLeft: `${String(depth * 0.75 + 0.5)}rem` }}
        // Anel explicito, como em todo alvo clicavel daqui. A linha da arvore
        // ficava so com o anel padrao do navegador — que existe, mas nao e o
        // mesmo desenho do resto do editor, e some contra o realce da selecao.
        className={`flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-body transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          selected
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        <span className="truncate">{describe(node)}</span>
        {published > 0 && (
          // O MESMO glifo do alternador do painel de propriedades: e a mesma
          // informacao vista de outro lugar. A arvore e o unico lugar em que da
          // para responder "o que o consumidor do relatorio vai poder mexer?"
          // sem abrir no por no.
          //
          // Icone que E a informacao precisa ser declarado — o lucide so omite o
          // `aria-hidden` quando ja ha prop de acessibilidade.
          <SlidersHorizontal
            role="img"
            aria-label={`publica ${String(published)} ${published === 1 ? 'campo' : 'campos'} no painel do Power BI`}
            className="ml-auto size-3 shrink-0 text-primary"
          />
        )}
        {faulty && (
          // Marca tambem os ANCESTRAIS: um problema num no profundo deixaria o
          // export bloqueado sem indicio nenhum na parte visivel da arvore.
          <Circle
            role="img"
            aria-label="tem campo pendente"
            className="ml-auto size-2 shrink-0 fill-current text-warning"
          />
        )}
      </button>
      {node.children?.map((child) => (
        <TreeRow key={child.id} node={child} depth={depth + 1} faultyIds={faultyIds} />
      ))}
    </>
  );
}

export function TreePanel() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const selectedIds = useEditorStore((s) => s.selectedIds);
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

  const anchor = selectedIds[0];
  const parent = anchor === undefined ? null : parentOf(spec.root, anchor);
  const siblings = parent?.children ?? [];
  const indexes = selectedIds
    .map((id) => siblings.findIndex((child) => child.id === id))
    .filter((index) => index >= 0);

  // O botao so fica ativo quando a operacao seria aceita — as mesmas condicoes
  // que `moveNode` e `removeNode` checam. Botao ativo que nao faz nada e a
  // versao de interface do no-op silencioso. Sem selecao cai no mesmo caso da
  // raiz: nao ha no para subir, descer ou apagar.
  //
  // Com VARIOS o criterio e a PONTA do bloco, porque `moveSelected` e tudo ou
  // nada: com o de cima ja no topo, subir seria recusado para todos, e um botao
  // ativo que nao move nada e pior que um desabilitado.
  const isRoot = parent === null;
  const canMoveUp = !isRoot && indexes.length > 0 && Math.min(...indexes) > 0;
  const canMoveDown =
    !isRoot && indexes.length > 0 && Math.max(...indexes) < siblings.length - 1;

  const empty = (spec.root.children?.length ?? 0) === 0;

  return (
    <PanelSection
      title="Composicao"
      grow
      className="px-3 pb-3"
      actions={
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveUp}
            onClick={() => {
              moveSelected(-1);
            }}
            title="Mover para cima"
            aria-label="Mover para cima"
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveDown}
            onClick={() => {
              moveSelected(1);
            }}
            title="Mover para baixo"
            aria-label="Mover para baixo"
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isRoot}
            onClick={removeSelected}
            title={isRoot ? 'A raiz nao pode ser removida' : 'Remover'}
            aria-label={
              selectedIds.length > 1
                ? `Remover ${String(selectedIds.length)} componentes`
                : 'Remover'
            }
          >
            <X />
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-card py-1">
        <TreeRow node={spec.root} depth={0} faultyIds={faultyIds} />
        {empty && (
          // Estado vazio: a raiz sozinha nao explica que falta alguma coisa, e o
          // export fica bloqueado sem que nada na tela diga o porque.
          <p className="px-3 py-3 text-label leading-relaxed text-muted-foreground">
            A composicao esta vazia. Use <strong className="font-medium">Adicionar componente</strong>{' '}
            para colocar a primeira peca dentro do container.
          </p>
        )}
      </div>
    </PanelSection>
  );
}
