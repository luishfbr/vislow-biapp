/**
 * Subcaminho `@vislow/visual-kit/nodes` — os componentes do construtor.
 *
 * FORA do barril de propósito, pelo mesmo motivo que `inspectPbiviz` vive em
 * `@vislow/config-schema/packaging`: quem importa so o barril nao deve pagar
 * pelo Recharts (~575 KB), contra o orcamento de 1 MB do RNF-04. Quem quer os
 * nos pede o subcaminho.
 */
export * from './frame.js';
export * from './mockFrame.js';
export * from './Container.js';
export * from './CanvasSlot.js';
export * from './TextNode.js';
export * from './KpiNode.js';
export * from './charts.js';
