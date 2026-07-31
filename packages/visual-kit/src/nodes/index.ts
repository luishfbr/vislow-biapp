/**
 * Subcaminho `@vislow/visual-kit/nodes` — os componentes do construtor.
 *
 * FORA do barril de propósito, pelo mesmo motivo que `buildPbiviz` vive em
 * `@vislow/config-schema/packaging`: o Runtime Core importa o barril, e
 * reexportar daqui levaria Recharts (~575 KB) para dentro do bundle dele,
 * contra o orcamento de 1 MB. Quem quer os nos pede o subcaminho.
 */
export * from './frame.js';
export * from './mockFrame.js';
export * from './Container.js';
export * from './TextNode.js';
export * from './KpiNode.js';
export * from './charts.js';
