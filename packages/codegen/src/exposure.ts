import {
  NODE_DESCRIPTORS,
  isExposable,
  selectOptions,
  titleOf,
  tokenOptions,
  walk,
  type FieldSpec,
  type SpecNode,
  type ValueOption,
  type VisualSpec,
} from '@vislow/component-registry';

/**
 * O que o autor PUBLICOU no painel de formatacao do visual gerado.
 *
 * Fonte unica dos dois artefatos que precisam concordar sobre isso: o
 * `capabilities.json`, que declara o `objects`, e o `visual.tsx`, que emite a
 * tabela `FORMATTING`. Duas travessias da arvore divergiriam no dia em que uma
 * delas esquecesse o `showWhen` — e o sintoma seria um card com um controle que
 * o visual nao le, so visivel dentro do Power BI.
 *
 * FECHADO POR PADRAO: no sem `exposed` nao aparece aqui, e uma spec sem nenhum
 * `exposed` produz lista vazia — o capabilities sai sem `objects`, o `visual.tsx`
 * sai sem `pick()` e o pacote e o mesmo de antes deste sprint, byte a byte.
 */

/** Espelha `ExposedKind` do `template/src/formatting.ts`. */
export type ExposedKind = Exclude<FieldSpec['kind'], 'role'>;

export interface ExposedField {
  key: string;
  label: string;
  kind: ExposedKind;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: ValueOption[];
  showWhen?: { key: string; equals: string };
  /** Secao dentro do card. Ausente = o bloco inicial sem titulo. */
  group?: string;
  /** O valor do AUTOR — o mesmo literal que sai no JSX. */
  value: string | number | boolean;
}

export interface ExposedNode {
  /** Id do no: `objectName` no capabilities e chave da tabela no visual.tsx. */
  id: string;
  /** Apelido do no, ou o rotulo do descritor. */
  title: string;
  fields: ExposedField[];
  /**
   * Chaves que so GOVERNAM um `showWhen` e nao foram publicadas.
   *
   * O valor delas viaja mesmo assim: sem ele o visual avaliaria a condicao
   * contra nada e mostraria (ou esconderia) o campo governado ao contrario do
   * que o autor deixou na tela. Sao poucas — so as citadas por algum campo
   * publicado.
   */
  governors: Record<string, string | number | boolean>;
}

/** Opcoes de um campo de escolha, com o rotulo humano do registro. */
function optionsFor(field: FieldSpec): ValueOption[] | undefined {
  if (field.kind === 'token') return tokenOptions(field.token);
  if (field.kind === 'select') return selectOptions(field.options);
  return undefined;
}

/**
 * O valor do campo neste no.
 *
 * Cai no default do descritor quando a prop nao existe — o mesmo que o painel do
 * editor faz. Uma spec valida sempre tem a chave, mas o default aqui e o que
 * impede um `undefined` de virar `value: undefined` no fonte gerado.
 */
function valueOf(node: SpecNode, field: FieldSpec): string | number | boolean {
  const raw = node.props[field.key];
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
  return field.kind === 'role' ? '' : field.default;
}

function exposedNodeOf(node: SpecNode): ExposedNode | null {
  const keys = new Set(node.exposed ?? []);
  if (keys.size === 0) return null;

  const descriptor = NODE_DESCRIPTORS[node.kind];
  const fields: ExposedField[] = [];
  const governors: Record<string, string | number | boolean> = {};

  // A ordem vem do DESCRITOR, como no JSX: e ela que vira a ordem dos slices
  // dentro do card, e a ordem do `exposed` (que o editor ja mantem assim) e uma
  // segunda fonte que poderia divergir na spec que chega por importacao.
  for (const field of descriptor.fields) {
    if (!keys.has(field.key) || !isExposable(field)) continue;

    const entry: ExposedField = {
      key: field.key,
      label: field.label,
      kind: field.kind as ExposedKind,
      value: valueOf(node, field),
    };

    if (field.kind === 'length' || field.kind === 'number') {
      entry.min = field.min;
      entry.max = field.max;
    }
    if (field.kind === 'text') entry.maxLength = field.maxLength;
    // A chave so viaja quando existe: um `group: undefined` na tabela emitida
    // seria uma diferenca no fonte gerado de todo no sem secao.
    if (field.group !== undefined) entry.group = field.group;

    const options = optionsFor(field);
    if (options) entry.options = options;

    if (field.showWhen) {
      entry.showWhen = { ...field.showWhen };
      // So entra em `governors` o que NAO foi publicado: o publicado ja leva o
      // proprio valor, e repetir daria duas fontes para a mesma chave.
      if (!keys.has(field.showWhen.key)) {
        const governing = descriptor.fields.find(
          (candidate) => candidate.key === field.showWhen?.key,
        );
        if (governing) governors[governing.key] = valueOf(node, governing);
      }
    }

    fields.push(entry);
  }

  if (fields.length === 0) return null;

  return { id: node.id, title: titleOf(node), fields, governors };
}

/** Nos publicados, na ordem da arvore (profundidade primeiro, como o `walk`). */
export function exposedNodes(spec: VisualSpec): ExposedNode[] {
  const out: ExposedNode[] = [];
  for (const { node } of walk(spec)) {
    const exposed = exposedNodeOf(node);
    if (exposed) out.push(exposed);
  }
  return out;
}

/** O no publicou esta chave? Decide se o JSX emite literal ou `pick()`. */
export function isExposedKey(node: SpecNode, key: string): boolean {
  return (node.exposed ?? []).includes(key);
}
