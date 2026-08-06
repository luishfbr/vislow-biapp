import type { VisualSpec } from '@vislow/component-registry';
import type { ColumnType } from '@vislow/config-schema';
import { exposedNodes, type ExposedField } from './exposure.js';
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
  requiredTypes?: Record<string, boolean>[] | undefined;
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
 * `date` fica de fora, e nao ha jeito de contornar: o `valueType` do
 * `schema.capabilities.json` oficial declara `additionalProperties: false` e so
 * aceita `bool | enumeration | fill | fillRule | formatting | integer | numeric
 * | filter | operations | text | scripting | geography`. Nao existe tipo
 * temporal na lista — `dateTime`, `date` e `temporal` reprovam os tres. E o
 * proprio `pbiviz package` que valida com Ajv e faz `throw new Error("Invalid
 * capabilities")`, entao emitir a chave quebrava a build inteira de quem ligava
 * uma coluna de data. `requiredTypes` e opcional no schema; omitir e a saida.
 *
 * O escape, quando o tipo aperta demais, e trocar o tipo da coluna no editor —
 * e o painel diz isso ao lado do seletor.
 */
const REQUIRED_TYPES: Partial<Record<ColumnType, Record<string, boolean>[]>> = {
  text: [{ text: true }],
  integer: [{ integer: true }],
  decimal: [{ numeric: true }],
  percent: [{ numeric: true }],
  currency: [{ numeric: true }],
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
  /**
   * A chave que faz o painel de formatacao FUNCIONAR num visual sem poco de
   * campos — o nosso caso desde a spec 5.0.0, em que `dataRoles` sai vazio.
   *
   * O schema oficial a descreve por extenso: "whether the visual can receive
   * formatting pane properties when it has no dataroles". Sem ela o painel
   * aparece, o consumidor mexe nos controles e o `update()` nunca recebe os
   * valores — o visual nao muda e nao ha erro em lugar nenhum.
   *
   * OPCIONAL, e ausente quando nada foi publicado: e o que mantem o
   * `capabilities.json` de um projeto sem painel identico ao de antes do
   * Sprint B.
   */
  supportsEmptyDataView?: boolean;
}

/**
 * O tipo do campo virando tipo de propriedade do host.
 *
 * E ele que decide o controle padrao do painel e o formato em que o valor volta
 * em `metadata.objects` — `fill` volta embrulhado em `{ solid: { color } }`, e e
 * por isso que o `formatting.ts` do template desembrulha.
 *
 * `length` sai como `integer` e nao `numeric`: meio pixel nao e uma escolha, e o
 * schema da spec ja reprova decimal no campo. `enumeration` leva o rotulo humano
 * do registro, o mesmo que o editor mostra.
 */
function valueTypeFor(field: ExposedField): Record<string, unknown> {
  switch (field.kind) {
    case 'text':
      return { text: true };
    case 'length':
      return { integer: true };
    case 'number':
      return { numeric: true };
    case 'boolean':
      return { bool: true };
    case 'color':
      return { fill: { solid: { color: true } } };
    case 'token':
    case 'select':
      return {
        enumeration: (field.options ?? []).map((option) => ({
          value: option.value,
          displayName: option.label,
        })),
      };
  }
}

/**
 * Um `object` por no publicado; uma propriedade por campo publicado.
 *
 * `objectName` e o ID do no — e por ele que o valor gravado no relatorio
 * reencontra o componente depois de um reexport. O apelido vira o `displayName`,
 * que e o titulo do card.
 */
function generateObjects(spec: VisualSpec): Record<string, unknown> {
  const objects: Record<string, unknown> = {};

  for (const node of exposedNodes(spec)) {
    const properties: Record<string, unknown> = {};
    for (const field of node.fields) {
      properties[field.key] = { displayName: field.label, type: valueTypeFor(field) };
    }
    objects[node.id] = { displayName: node.title, properties };
  }

  return objects;
}

export function generateCapabilities(spec: VisualSpec): Capabilities {
  const roles = usedRoles(spec);
  const objects = generateObjects(spec);
  // A chave so aparece quando ha painel. Presente com `false` seria uma terceira
  // situacao para o gate distinguir, e o teste de "nada publicado gera o
  // capabilities de antes" compara o objeto inteiro.
  const emptyDataView = Object.keys(objects).length > 0 ? { supportsEmptyDataView: true } : {};
  const groupings = roles.filter((role) => role.kind === 'grouping');
  const measures = roles.filter((role) => role.kind === 'measure');

  const dataRoles: CapabilityRole[] = roles.map((role) => {
    const base: CapabilityRole = {
      displayName: role.displayName,
      name: role.name,
      kind: role.kind === 'grouping' ? 'Grouping' : 'Measure',
    };
    const required = REQUIRED_TYPES[role.type];
    // A chave precisa estar AUSENTE, nao presente com `undefined`: o schema
    // oficial roda com `additionalProperties: false` e o portao compara o
    // objeto gerado com o que saiu de dentro do .pbiviz, ja passado por JSON.
    return required === undefined ? base : { ...base, requiredTypes: required };
  });

  // Uma arvore so de texto nao le o modelo. Emitir um mapeamento vazio seria
  // pedir ao host um DataView que ninguem consome; melhor nao declarar nenhum.
  if (dataRoles.length === 0) {
    return { dataRoles: [], dataViewMappings: [], objects, privileges: [], ...emptyDataView };
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
        // NAO acrescente `min` aqui. Ja tentamos: o host valida o estado que os
        // pocos TERIAM depois do arrasto contra a lista de condicoes, e uma
        // condicao unica exigindo `min: 1` em todos os papeis descreve so o
        // estado final. O estado apos o primeiro campo — um papel preenchido, o
        // resto vazio — nao satisfaz condicao nenhuma, entao o host descarta o
        // drop. Em silencio: nao ha erro, nao ha aviso, o campo so continua
        // vazio. O visual nunca sai de zero campos, e nada renderiza jamais.
        //
        // Quem responde por "falta campo" e o `EmptyState` do visual-kit, que
        // ja existe e ja e alimentado por `matchRoles`: papel declarado e nao
        // preenchido simplesmente nao entra no DataFrame.
        conditions: [Object.fromEntries(roles.map((role) => [role.name, { max: 1 }]))],
        categorical,
      },
    ],
    objects,
    privileges: [],
    ...emptyDataView,
  };
}
