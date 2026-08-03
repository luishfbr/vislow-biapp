import type { VisualSpec } from '@vislow/component-registry';
import type { ColumnType } from '@vislow/config-schema';
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
  requiredTypes: Record<string, boolean>[];
}

/**
 * O tipo da coluna virando restricao do host.
 *
 * `requiredTypes` e uma lista OU: o Power BI aceita a coluna que satisfizer
 * qualquer entrada, e RECUSA o arrasto das demais — a coluna nem chega ao campo.
 * E o que faz o tipo declarado no editor valer alguma coisa do lado de la, em
 * vez de ser so a formatacao do preview.
 *
 * `numeric` cobre decimal e inteiro; `integer` e mais estreito de proposito,
 * porque quem marcou a coluna como inteiro disse que casas decimais nao servem.
 * Percentual e moeda sao FORMATO, nao tipo — no modelo do Power BI os dois sao
 * numero, e exigir outra coisa recusaria a coluna certa.
 *
 * O escape, quando o tipo aperta demais, e trocar o tipo da coluna no editor —
 * e o painel diz isso ao lado do seletor.
 */
const REQUIRED_TYPES: Record<ColumnType, Record<string, boolean>[]> = {
  text: [{ text: true }],
  integer: [{ integer: true }],
  decimal: [{ numeric: true }],
  percent: [{ numeric: true }],
  currency: [{ numeric: true }],
  date: [{ dateTime: true }],
  boolean: [{ bool: true }],
};

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
    requiredTypes: REQUIRED_TYPES[role.type],
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
        // `max: 1` por papel: cada campo do construtor e uma coluna unica. Sem
        // a condicao, o usuario arrasta tres campos para "Valor" e o visual le
        // so o primeiro, sem dizer por que.
        //
        // `min: 1` e o "o visual EXIGE os campos": enquanto faltar um, o host
        // nao entrega DataView e mostra o proprio aviso de campos pendentes, em
        // vez de deixar o visual desenhar meia composicao. O `EmptyState` do kit
        // continua onde esta como segunda linha de defesa — e ele que responde
        // pelo caso diferente de "o filtro nao retornou linha nenhuma".
        conditions: [Object.fromEntries(roles.map((role) => [role.name, { min: 1, max: 1 }]))],
        categorical,
      },
    ],
    objects: {},
    privileges: [],
  };
}
