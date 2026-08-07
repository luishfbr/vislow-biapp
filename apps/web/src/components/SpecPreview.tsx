'use client';

import {
  NODE_DESCRIPTORS,
  consumesData,
  positionsChildren,
  type NodeRect,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { ErrorBoundary, VisualRoot } from '@vislow/visual-kit';
import { CanvasSlot, sampleFrame, type DataFrame } from '@vislow/visual-kit/nodes';
import { createElement, type ReactNode } from 'react';
import { CanvasOverlay } from '@/components/CanvasOverlay';
import { NODE_COMPONENTS } from '@/lib/nodeComponents';
import { previewHost } from '@/lib/previewHost';

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
 * SEM PLACEHOLDER DE NO PENDENTE — e por que ele saiu na spec 5.0.0.
 *
 * Ate a 4.0.0 um grafico nascia INVALIDO de proposito: o campo de papel nao tem
 * default, e o no ficava pendente ate o usuario ligar uma coluna. Renderiza-lo
 * assim passaria `undefined` como nome de papel, entao o preview trocava o no
 * inteiro por uma ficha ambar. Nenhum descritor declara campo de papel agora, e
 * no nenhum nasce invalido.
 *
 * O estado ainda e alcancavel — o campo hexadecimal do `ColorField` grava a cada
 * tecla, e `#1e2` e invalido no caminho para `#1e293b`. Mas trocar o no inteiro
 * por uma ficha no meio da digitacao e PIOR do que deixar o navegador ignorar
 * uma cor que ele nao entende: quem digita perde de vista o que esta editando. O
 * erro continua sendo dito onde importa — embaixo do proprio campo, no painel —
 * e continua bloqueando o export.
 */

/**
 * Manipulacao direta, quando o preview esta no editor.
 *
 * Opcional porque o `SpecPreview` tambem e montado por teste e podera ser
 * montado em contexto sem edicao. Sem ela, o preview volta a ser exatamente o
 * que era: desenho, e nada mais.
 */
export interface PreviewEdit {
  /** Vazio quando nada esta selecionado — o clique no vazio limpa a selecao. */
  selectedIds: readonly string[];
  onSelect: (id: string | null) => void;
  /** Shift+clique: poe ou tira um no da selecao. */
  onToggle: (id: string) => void;
  onChange: (id: string, rect: NodeRect) => void;
  /** Arrasto de bloco: N caixas numa unica edicao. */
  onChangeMany: (entries: readonly { id: string; rect: NodeRect }[]) => void;
  /**
   * Duplica os nos arrastados quando o gesto comeca com Alt, e devolve os ids
   * das copias — o gesto precisa deles para passar a arrastar ELAS, e nao os
   * originais.
   */
  onDuplicate?: ((ids: readonly string[]) => readonly string[]) | undefined;
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
  /**
   * Embrulho de cada no da camada — e por onde o menu de contexto entra. Vem
   * daqui e nao de dentro do `CanvasOverlay` para aquele continuar sem store, e
   * nao deste arquivo para o gemeo do codegen ficar sem movel do editor.
   */
  menu?: ((id: string, children: ReactNode) => ReactNode) | undefined;
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

function renderNode(node: SpecNode, frame: DataFrame, edit: PreviewEdit | undefined): ReactNode {
  const descriptor = NODE_DESCRIPTORS[node.kind];

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
    const rendered = renderNode(child, frame, edit);
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
          selectedIds={edit.selectedIds}
          onSelect={edit.onSelect}
          onToggle={edit.onToggle}
          onChange={edit.onChange}
          onChangeMany={edit.onChangeMany}
          onDuplicate={edit.onDuplicate}
          onMeasure={measureOf(node.id, edit)}
          scale={edit.scale ?? 1}
          onGestureStart={edit.onGestureStart}
          onGestureEnd={edit.onGestureEnd}
          onEnter={edit.onEnter}
          menu={edit.menu}
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
  edit,
  simulateSelection = false,
}: {
  spec: VisualSpec;
  edit?: PreviewEdit | undefined;
  /**
   * Faz o host reportar a primeira linha do quadro como selecionada, para o
   * autor poder DESENHAR o estado esmaecido sem exportar. Vem do `useUiStore`
   * (movel) por prop, e nao lido daqui: este componente e o gemeo do codegen e
   * fica testavel sem store.
   */
  simulateSelection?: boolean;
}) {
  // O preview desenha o que o USUARIO digitou na tabela de exemplo. Antes o
  // quadro era fabricado a partir do nome do papel, e ele compunha contra
  // numeros que nao eram dele.
  //
  // O HOST entra por spread, e nao dentro do `sampleFrame`: aquele arquivo mora
  // no kit, que vai inteiro para o bundle do visual — um host de simulacao nao
  // tem o que fazer no pacote que o consumidor final instala.
  const frame = { ...sampleFrame(spec.data), host: previewHost(simulateSelection) };

  return (
    // O MESMO componente que o codegen emite em volta da arvore — nao uma string
    // de classes repetida dos dois lados, que era como isto funcionava ate a
    // spec 4.0.0. Divergir ali daria ao preview uma moldura e ao pacote outra, e
    // a diferenca so apareceria dentro do Power BI.
    <VisualRoot>
      {/* O ErrorBoundary tambem aqui: a arvore em edicao passa por estados que o
          componente pode nao suportar, e travar o editor seria pior que mostrar
          o card de erro — o mesmo raciocinio da RN-04, do lado do editor. */}
      <ErrorBoundary>{renderNode(spec.root, frame, edit)}</ErrorBoundary>
    </VisualRoot>
  );
}
