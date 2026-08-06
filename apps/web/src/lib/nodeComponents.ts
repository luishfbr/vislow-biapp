import type { NodeKind } from '@vislow/component-registry';
import { Container, KpiCard, RankingList, TextBox } from '@vislow/visual-kit/nodes';
import type { ReactNode } from 'react';

/**
 * De `kind` para o COMPONENTE REAL.
 *
 * E o outro lado do ADR-04. O codegen resolve o mesmo mapeamento em texto —
 * `descriptor.component` vira um import nomeado no `visual.tsx` gerado. Aqui ele
 * vira a referencia de verdade que o preview renderiza. Os dois lados precisam
 * apontar para o mesmo componente, e `nodeComponents.test.ts` cobra isso
 * comparando o nome da funcao com o descritor: renomear de um lado so quebra o
 * teste, em vez de produzir um preview que mente sobre o resultado final.
 *
 * O import e NOMEADO tambem aqui, ainda que o editor nao tenha orcamento de
 * bundle: manter a mesma forma dos dois lados evita que alguem "simplifique"
 * para um import de namespace, que no lado do codegen levaria o catalogo inteiro
 * para dentro do visual compilado.
 */

const COMPONENTS = {
  container: Container,
  text: TextBox,
  kpi: KpiCard,
  ranking: RankingList,
  // `satisfies` cobra a cobertura EXATA das chaves: um `kind` novo no registro
  // sem componente aqui nao compila, e uma chave a mais tambem nao.
} satisfies Record<NodeKind, unknown>;

/**
 * Assinatura apagada de proposito.
 *
 * As props saem da spec como `unknown` e so ganham tipo no componente. A ponte e
 * este cast, num lugar so: quando a spec e valida ela ja passou pelo schema
 * DERIVADO dos mesmos descritores que tipam os componentes, entao a forma
 * confere por construcao. Quando nao e, o no nem chega aqui — o renderizador
 * mostra o estado pendente.
 */
export type NodeComponent = (props: Record<string, unknown>) => ReactNode;

export const NODE_COMPONENTS = COMPONENTS as unknown as Record<NodeKind, NodeComponent>;

/** Nomes de funcao, para o teste de correspondencia com o registro. */
export const COMPONENT_NAMES = COMPONENTS as unknown as Record<NodeKind, { name: string }>;
