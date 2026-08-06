/**
 * Subcaminho `@vislow/visual-kit/nodes` — os componentes do construtor.
 *
 * FORA do barril de propósito, pelo mesmo motivo que `inspectPbiviz` vive em
 * `@vislow/config-schema/packaging`: quem importa so o barril nao deve pagar por
 * componente nenhum. Quem quer os nos pede o subcaminho.
 *
 * Ate a spec 4.0.0 este arquivo tambem exportava o KPI e os quatro graficos, e a
 * separacao existia para manter o Recharts (~575 KB) fora do barril, contra o
 * orcamento de 1 MB do RNF-04. Os cinco sairam na 5.0.0 e o Recharts foi embora
 * com eles. A separacao FICA, porque a razao dela nunca foi o Recharts e sim que
 * o barril carrega o que TODO consumidor precisa — e o editor importa `tokens` e
 * `highContrast` sem querer arvore de componentes junto.
 *
 * `frame.js` e `sampleFrame.js` voltaram a ter CONSUMIDOR na spec 5.2.0: o
 * `KpiCard` e o no que reocupou o contrato de dados. Continuam fora do barril
 * porque quem so compoe texto nao precisa deles.
 */
export * from './frame.js';
export * from './sampleFrame.js';
export * from './Container.js';
export * from './CanvasSlot.js';
export * from './TextBox.js';
export * from './KpiCard.js';
