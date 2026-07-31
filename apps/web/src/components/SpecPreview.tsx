'use client';

import {
  NODE_DESCRIPTORS,
  consumesData,
  positionsChildren,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { ErrorBoundary } from '@vislow/visual-kit';
import { CanvasSlot, mockFrame, type DataFrame } from '@vislow/visual-kit/nodes';
import { createElement, type ReactNode } from 'react';
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
    <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-amber-400 bg-amber-50/70 p-3 text-center dark:bg-amber-950/30">
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
        {label}: campo pendente
      </span>
      {problems.map((problem) => (
        <span key={problem} className="text-[10px] text-amber-600 dark:text-amber-400">
          {problem}
        </span>
      ))}
    </div>
  );
}

function renderNode(
  node: SpecNode,
  frame: DataFrame,
  issues: ReadonlyMap<string, NodeIssues>,
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
  const children = (node.children ?? []).map((child) => {
    const rendered = renderNode(child, frame, issues);
    const rect = child.rect;
    return free && rect ? (
      <CanvasSlot key={child.id} x={rect.x} y={rect.y} w={rect.w} h={rect.h}>
        {rendered}
      </CanvasSlot>
    ) : (
      rendered
    );
  });

  // `createElement` e nao JSX: o componente vem de um mapa, e escrever
  // `<Component />` obrigaria a nomear a variavel em maiuscula sem ganho nenhum.
  return children.length > 0
    ? createElement(NODE_COMPONENTS[node.kind], props, children)
    : createElement(NODE_COMPONENTS[node.kind], props);
}

export function SpecPreview({
  spec,
  issues,
}: {
  spec: VisualSpec;
  issues: ReadonlyMap<string, NodeIssues>;
}) {
  const frame = mockFrame(spec.dataRoles);

  return (
    // A moldura e a MESMA que o codegen emite em volta da arvore. Sem ela o
    // preview daria altura diferente aos filhos flexiveis e o grafico mediria
    // outro tamanho — divergencia silenciosa, do tipo que so aparece no Desktop.
    <div className="pbi:relative pbi:w-full pbi:h-full pbi:flex pbi:flex-col">
      {/* O ErrorBoundary tambem aqui: a arvore em edicao passa por estados que o
          componente pode nao suportar, e travar o editor seria pior que mostrar
          o card de erro — o mesmo raciocinio da RN-04, do lado do editor. */}
      <ErrorBoundary>{renderNode(spec.root, frame, issues)}</ErrorBoundary>
    </div>
  );
}
