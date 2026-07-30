import type { VisualSpec } from '@vislow/component-registry';
import { usedRoles } from './roles.js';

/**
 * `capabilities.json` gerado POR VISUAL.
 *
 * E isto que faz "comecar do zero" ser real (ADR-08). No modelo antigo o
 * arquivo era fixo dentro do Runtime Core, entao todo visual pedia as mesmas
 * duas colunas. Agora cada visual pede exatamente os campos que a arvore dele
 * consome — nem um a mais.
 */

interface CapabilityRole {
  displayName: string;
  name: string;
  kind: 'Grouping' | 'Measure';
}

/**
 * Limite de linhas que o host entrega. Acima disso o Power BI aplica o
 * `dataReductionAlgorithm` e trunca — o visual avisa (RF-25) em vez de mentir.
 */
export const CATEGORY_LIMIT = 1000;

export interface Capabilities {
  dataRoles: CapabilityRole[];
  dataViewMappings: unknown[];
  objects: Record<string, unknown>;
  privileges: unknown[];
}

export function generateCapabilities(spec: VisualSpec): Capabilities {
  const roles = usedRoles(spec);
  const groupings = roles.filter((role) => role.kind === 'grouping');
  const measures = roles.filter((role) => role.kind === 'measure');

  const dataRoles: CapabilityRole[] = roles.map((role) => ({
    displayName: role.displayName,
    name: role.name,
    kind: role.kind === 'grouping' ? 'Grouping' : 'Measure',
  }));

  // Uma arvore so de texto nao le o modelo. Emitir um mapeamento vazio seria
  // pedir ao host um DataView que ninguem consome; melhor nao declarar nenhum.
  if (dataRoles.length === 0) {
    return { dataRoles: [], dataViewMappings: [], objects: {}, privileges: [] };
  }

  const categorical: Record<string, unknown> = {};
  if (groupings.length > 0) {
    categorical.categories = {
      select: groupings.map((role) => ({ for: { in: role.name } })),
      dataReductionAlgorithm: { top: { count: CATEGORY_LIMIT } },
    };
  }
  if (measures.length > 0) {
    categorical.values = {
      select: measures.map((role) => ({ bind: { to: role.name } })),
    };
  }

  return {
    dataRoles,
    dataViewMappings: [
      {
        // `max: 1` por papel: cada papel do construtor e uma coluna unica. Sem a
        // condicao, o usuario arrasta tres campos para "Valor" e o visual le so
        // o primeiro, sem dizer por que.
        conditions: [Object.fromEntries(roles.map((role) => [role.name, { max: 1 }]))],
        categorical,
      },
    ],
    objects: {},
    privileges: [],
  };
}
