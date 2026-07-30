import type { DataPoint, KpiDatum } from './types.js';

/**
 * Dataset de exemplo do preview (RF-06).
 *
 * Mora no visual-kit, e nao no editor, porque tambem serve de fixture nos testes
 * de componente — o mesmo dado exercita preview e teste.
 *
 * Escolhido para expor problemas de layout de proposito: nome curto e nome
 * longo, ordens de grandeza diferentes, valor zero e valor negativo.
 */
export const MOCK_BARS: DataPoint[] = [
  { category: 'Sul', value: 184_320.5, formattedValue: 'R$ 184,3 mil', selected: false },
  { category: 'Sudeste', value: 921_450.0, formattedValue: 'R$ 921,5 mil', selected: false },
  {
    category: 'Centro-Oeste e Norte',
    value: 47_800.25,
    formattedValue: 'R$ 47,8 mil',
    selected: false,
  },
  { category: 'Nordeste', value: 312_990.75, formattedValue: 'R$ 313,0 mil', selected: false },
  { category: 'Exterior', value: 0, formattedValue: 'R$ 0', selected: false },
];

export const MOCK_KPI: KpiDatum = {
  formattedValue: 'R$ 1,47 mi',
  label: 'Receita total',
  comparison: {
    formattedValue: 'R$ 1,32 mi',
    deltaRatio: 0.1136,
    formattedDelta: '11,4%',
  },
};
