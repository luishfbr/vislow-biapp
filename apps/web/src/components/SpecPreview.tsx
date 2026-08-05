'use client';

import {
  NODE_DESCRIPTORS,
  consumesData,
  positionsChildren,
  type NodeRect,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { ErrorBoundary } from '@vislow/visual-kit';
import { CanvasSlot, sampleFrame, type DataFrame } from '@vislow/visual-kit/nodes';
import { createElement, type ReactNode } from 'react';
import { CanvasOverlay } from '@/components/CanvasOverlay';
import type { NodeIssues } from '@/lib/issues';
import { NODE_COMPONENTS } from '@/lib/nodeComponents';

/**
 * Renderiza a arvore com os componentes de verdade (RF-05 / ADR-04).
 *
 * Este arquivo e o GEMEO de `generateVisualSource` em `@vislow/codegen`. Ele faz
 * em runtime o que o codegen faz em texto: percorre a arvore, resolve o
 * componente pelo `kind`, passa as props na ordem do descritor e injeta o
 * `frame` nos nos que leem dados. Se um dos dois mudar de regra sem o outro, o
 * preview passa a mentir sobre o pacote entregue.
 *
 * NAO existe interpretador generico aqui nem la: o componente vem de uma
 * whitelist (o registro) e o dado do usuario e so valor de prop (RN-11).
 */

/**
 * Um no com campo pendente nao pode ser renderizado com honestidade.
 *
 * Renderizar assim mesmo passaria `undefined` como nome de papel e o kit
 * mostraria "campo undefined faltando" — uma mensagem sobre o nosso bug, nao
 * sobre o que o usuario precisa fazer. Este placeholder some sozinho quando ele
 * liga o campo, e nao existe no visual compilado porque uma spec pendente nunca
 * chega ao compilador (o export fica bloqueado).
 */
function PendingNode({ label, problems }: { label: string; problems: string[] }) {
  return (
    // Ambar LITERAL, sem token e sem `dark:`. Este no e desenhado DENTRO da
    // prancheta, que e branca nos dois temas — `text-warning` viraria amber-400
    // sobre branco quando o usuario poe o editor no escuro, e o aviso ficaria
    // ilegivel exatamente onde ele precisa ser lido.
    <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-amber-400 bg-amber-50/70 p-3 text-center">
      <span className="text-xs font-semibold text-amber-700">{label}: campo pendente</span>
      {problems.map((problem) => (
        <span key={problem} className="text-micro text-amber-600">
          {problem}
        </span>
      ))}
    </div>
  );
}

/**
 * Manipulacao direta, quando o preview esta no editor.
 *
 * Opcional porque o `SpecPreview` tambem e montado por teste e podera ser
 * montado em contexto sem edicao. Sem ela, o preview volta a ser exatamente o
 * que era: desenho, e nada mais.
 */
export interface PreviewEdit {
  /** `null` quando nada esta selecionado — o clique no vazio limpa a selecao. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, rect: NodeRect) => void;
  /**
   * Duplica o no arrastado quando o gesto comeca com Alt, e devolve o id da
   * copia — o gesto precisa dele para passar a arrastar ELA, e nao o original.
   */
  onDuplicate?: ((id: string) => string | null) | undefined;
  /**
   * Publica o tamanho de um container que posiciona, em pixel da prancheta.
   * E o que permite ao painel da direita falar pixel: a spec guarda percentual
   * do pai, e converter exige saber o tamanho do pai.
   */
  onMeasure?: ((containerId: string, size: { width: number; height: number }) => void) | undefined;
  /** Zoom da camera, para tirar a ampliacao da medida publicada. */
  scale?: number | undefined;
  /**
   * Abre e fecha um gesto continuo. Entre os dois, a escrita nao empilha
   * historico nem revalida — um arrasto e UM passo de desfazer, nao duzentos.
   */
  onGestureStart?: (() => void) | undefined;
  onGestureEnd?: (() => void) | undefined;
  /**
   * O container em que o ponteiro trabalha. So ELE mostra caixas selecionaveis.
   *
   * Sem isto todas as camadas ficam ativas ao mesmo tempo, e a de dentro cobre a
   * de fora: clicar num container aninhado sempre pegava um filho dele, e o
   * proprio container so era selecionavel pela arvore.
   */
  enteredId: string;
  /** Duplo clique num container filho: desce um nivel. */
  onEnter: (id: string) => void;
}

/**
 * Cache de `onMeasure` amarrado ao container.
 *
 * A camada observa o proprio tamanho num `useEffect` que depende desta funcao.
 * Uma closure nova a cada render faria o efeito desligar e religar o
 * `ResizeObserver` — e ler o layout — a cada quadro de arrasto, que e
 * exatamente quando isso mais custa. `renderNode` nao e componente e nao tem
 * `useMemo`, entao a estabilidade vem daqui.
 *
 * `WeakMap` para nao segurar viva a spec de um projeto ja fechado.
 */
const measureCache = new WeakMap<
  NonNullable<PreviewEdit['onMeasure']>,
  Map<string, (size: { width: number; height: number }) => void>
>();

function measureOf(
  containerId: string,
  edit: PreviewEdit,
): ((size: { width: number; height: number }) => void) | undefined {
  const publish = edit.onMeasure;
  if (!publish) return undefined;

  let byId = measureCache.get(publish);
  if (!byId) {
    byId = new Map();
    measureCache.set(publish, byId);
  }

  const cached = byId.get(containerId);
  if (cached) return cached;

  const bound = (size: { width: number; height: number }): void => {
    publish(containerId, size);
  };
  byId.set(containerId, bound);
  return bound;
}

function renderNode(
  node: SpecNode,
  frame: DataFrame,
  issues: ReadonlyMap<string, NodeIssues>,
  edit: PreviewEdit | undefined,
): ReactNode {
  const descriptor = NODE_DESCRIPTORS[node.kind];
  const problem = issues.get(node.id);

  if (problem && problem.byField.size > 0) {
    return (
      <PendingNode
        key={node.id}
        label={descriptor.label}
        problems={[...problem.byField.keys()].map(
          (field) => descriptor.fields.find((f) => f.key === field)?.label ?? field,
        )}
      />
    );
  }

  // A ORDEM vem do descritor, nao do objeto `props` — pelo mesmo motivo do
  // codegen: a ordem das chaves de um JSON e do cliente.
  const props: Record<string, unknown> = { key: node.id };
  // A regra do `frame` vem do registro, a mesma que o codegen consulta.
  if (consumesData(node.kind)) props.frame = frame;
  for (const field of descriptor.fields) {
    props[field.key] = node.props[field.key];
  }

  // O embrulho e decidido pelo PAI, com a regra que o codegen tambem consulta.
  // Filho de canvas sem caixa nao acontece — as operacoes de arvore garantem, e
  // o `validateSpec` reprova a spec importada que tentar.
  const free = positionsChildren(node);
  const children: ReactNode[] = (node.children ?? []).map((child) => {
    const rendered = renderNode(child, frame, issues, edit);
    const rect = child.rect;
    return free && rect ? (
      <CanvasSlot key={child.id} x={rect.x} y={rect.y} w={rect.w} h={rect.h}>
        {rendered}
      </CanvasSlot>
    ) : (
      rendered
    );
  });

  // A camada de manipulacao entra como ultimo filho do proprio canvas, e nao
  // por cima do preview: dentro dele ela herda o sistema de coordenadas e
  // desenha com os mesmos percentuais da spec, sem medir nada (ADR-18). Sendo
  // `absolute`, esta fora do fluxo e nao altera a medida de irmao nenhum — que
  // era a objecao da ADR-14.
  // UM NIVEL DE CADA VEZ. Antes a camada entrava em todo container que
  // posiciona, e as de dentro cobriam as de fora — clicar num container
  // aninhado sempre pegava um filho dele.
  if (edit && free && node.id === edit.enteredId) {
    const placed = (node.children ?? []).flatMap((child) =>
      child.rect
        ? [
            {
              id: child.id,
              rect: child.rect,
              label: NODE_DESCRIPTORS[child.kind].label,
              // Entrar so faz sentido em quem POSICIONA: num container que
              // empilha nao ha camada para mostrar depois de entrar.
              enterable: positionsChildren(child),
            },
          ]
        : [],
    );
    if (placed.length > 0) {
      children.push(
        <CanvasOverlay
          key={`overlay-${node.id}`}
          items={placed}
          selectedId={edit.selectedId}
          onSelect={edit.onSelect}
          onChange={edit.onChange}
          onDuplicate={edit.onDuplicate}
          onMeasure={measureOf(node.id, edit)}
          scale={edit.scale ?? 1}
          onGestureStart={edit.onGestureStart}
          onGestureEnd={edit.onGestureEnd}
          onEnter={edit.onEnter}
        />,
      );
    }
  }

  // `createElement` e nao JSX: o componente vem de um mapa, e escrever
  // `<Component />` obrigaria a nomear a variavel em maiuscula sem ganho nenhum.
  return children.length > 0
    ? createElement(NODE_COMPONENTS[node.kind], props, children)
    : createElement(NODE_COMPONENTS[node.kind], props);
}

export function SpecPreview({
  spec,
  issues,
  edit,
}: {
  spec: VisualSpec;
  issues: ReadonlyMap<string, NodeIssues>;
  edit?: PreviewEdit | undefined;
}) {
  // O preview desenha o que o USUARIO digitou na tabela de exemplo. Antes o
  // quadro era fabricado a partir do nome do papel, e ele compunha contra
  // numeros que nao eram dele.
  const frame = sampleFrame(spec.data);

  return (
    // A moldura e a MESMA que o codegen emite em volta da arvore. Sem ela o
    // preview daria altura diferente aos filhos flexiveis e o grafico mediria
    // outro tamanho — divergencia silenciosa, do tipo que so aparece no Desktop.
    <div className="pbi:relative pbi:w-full pbi:h-full pbi:flex pbi:flex-col">
      {/* O ErrorBoundary tambem aqui: a arvore em edicao passa por estados que o
          componente pode nao suportar, e travar o editor seria pior que mostrar
          o card de erro — o mesmo raciocinio da RN-04, do lado do editor. */}
      <ErrorBoundary>{renderNode(spec.root, frame, issues, edit)}</ErrorBoundary>
    </div>
  );
}
