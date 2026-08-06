/**
 * O painel de formatacao do visual gerado. ESTATICO: identico em todo pacote.
 *
 * A divisao de trabalho e a mesma do `dataFrame.ts` e do `interaction.ts` — o
 * codegen emite DADO (a tabela `FORMATTING` do `visual.tsx`, com o que o autor
 * publicou) e a maquina que transforma esse dado em `FormattingModel` mora aqui,
 * onde se escreve uma vez e se testa uma vez. O `component-registry` NAO e
 * vendorizado para dentro do visual: rotulo, faixa e lista de opcoes chegam pela
 * tabela, nao por derivacao em runtime.
 *
 * Escrito a mao contra os tipos que ja vem no `powerbi-visuals-api` — nenhuma
 * dependencia nova entra no pacote por causa deste arquivo (ADR-19).
 *
 * FECHADO POR PADRAO: sem campo publicado, `FORMATTING` sai `[]`, o
 * `capabilities.json` sai sem `objects` e este arquivo devolve um modelo sem
 * cards. O painel some, em vez de aparecer vazio.
 *
 * COMPILA DUAS VEZES, com regimes diferentes: pela toolchain do `pbiviz` (sem
 * `strictNullChecks`) e pelo tsconfig do monorepo (estrito, com
 * `noUncheckedIndexedAccess`), que e o que permite testa-lo em
 * `test/formatting.test.ts` sem compilar um pacote. Escrever para o mais
 * estrito dos dois e o que mantem os dois honestos.
 */
import type powerbi from 'powerbi-visuals-api';

type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
type FormattingModel = powerbi.visuals.FormattingModel;
type FormattingCard = powerbi.visuals.FormattingCard;
type FormattingSlice = powerbi.visuals.FormattingSlice;
type FormattingDescriptor = powerbi.visuals.FormattingDescriptor;
type IEnumMember = powerbi.IEnumMember;

/**
 * O tipo do campo, vindo do `FieldSpec` do registro.
 *
 * STRING, nunca booleano: a toolchain do `pbiviz` compila sem
 * `strictNullChecks`, e sem ela o TypeScript nao estreita uniao por
 * discriminante booleano.
 */
export type ExposedKind = 'text' | 'length' | 'number' | 'token' | 'select' | 'color' | 'boolean';

/** O que um campo publicado pode valer. Espelha o que o schema aceita. */
export type ExposedValue = string | number | boolean;

export interface ExposedOption {
  value: string;
  /** Rotulo humano. Vem do mesmo mapa que o painel do editor usa. */
  label: string;
}

export interface ExposedField {
  key: string;
  label: string;
  kind: ExposedKind;
  /** `length` e `number`. */
  min?: number;
  max?: number;
  /** `text`. */
  maxLength?: number;
  /** `token` e `select`. */
  options?: ExposedOption[];
  /**
   * Secao dentro do card, vinda do descritor. Ausente = o bloco inicial sem
   * titulo, que e como `container` e `text` sempre desenharam.
   */
  group?: string;
  /**
   * A mesma condicao do descritor, avaliada contra o valor VIGENTE — o override
   * quando ha um, o valor do autor quando nao ha. Fundo desligado, "Cor de
   * fundo" nao aparece; o consumidor liga o interruptor e ela aparece.
   */
  showWhen?: { key: string; equals: string };
}

export interface ExposedNode {
  /** Id do no na arvore E `objectName` no `capabilities.json`. */
  id: string;
  /** Apelido do no, ou o rotulo do descritor. Titulo do card. */
  title: string;
  /**
   * Valores do AUTOR, por chave.
   *
   * Sao o default de cada slice e o fallback de todo override recusado. Inclui
   * as chaves que apenas GOVERNAM um `showWhen` sem terem sido publicadas — sem
   * elas a condicao seria avaliada contra nada, e o campo governado apareceria
   * (ou sumiria) ao contrario do que o autor deixou na tela.
   */
  values: Record<string, ExposedValue>;
  /** Campos publicados, na ordem do descritor. */
  fields: ExposedField[];
}

/** O que o codegen emite no `visual.tsx`. Vazio quando nada foi publicado. */
export type FormattingSpec = ExposedNode[];

/** Valores aceitos, por no e por chave. So o que sobreviveu a validacao. */
export type Overrides = Record<string, Record<string, ExposedValue>>;

const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * `ValidatorType.Min` e `.Max` sem TOCAR no const enum em posicao de valor.
 *
 * Um `const enum` de arquivo de declaracao some do JS emitido: o compilador
 * inlina o numero. Isso vale enquanto a toolchain compilar com verificacao de
 * tipos (o `pbiviz` usa `ts-loader` com `transpileOnly: false`) — em regime de
 * transpilacao isolada, a mesma linha viraria acesso a uma propriedade que nao
 * existe em runtime, e o painel quebraria sem erro de compilacao nenhum. O
 * numero literal com a asercao de tipo custa um comentario e nao depende disso.
 */
const MIN_VALIDATOR = 0 as powerbi.visuals.ValidatorType.Min;
const MAX_VALIDATOR = 1 as powerbi.visuals.ValidatorType.Max;

/**
 * O valor vigente de uma chave: o override aceito, senao o do autor.
 *
 * Serve aos dois consumidores — o render e o proprio painel, que precisa mostrar
 * no controle o valor que esta na tela.
 */
function currentValue(
  node: ExposedNode,
  overrides: Overrides,
  key: string,
): ExposedValue | undefined {
  const override = overrides[node.id]?.[key];
  return override === undefined ? node.values[key] : override;
}

/**
 * O valor que veio do host serve?
 *
 * Duas regras, e a diferenca entre elas nao e gosto:
 *
 *   - TIPO errado, ou valor fora de um conjunto FECHADO (cor que nao e
 *     `#rrggbb`, opcao que nao esta na lista, numero que nao e finito), e
 *     RECUSADO: nao ha valor proximo que signifique o que o consumidor quis
 *     dizer, e um `padding={NaN}` desenha caixa de tamanho zero sem avisar;
 *   - tipo certo fora da FAIXA declarada (pixel acima do maximo, texto mais
 *     longo que o teto) e NORMALIZADO. O controle do proprio Power BI ja limita
 *     o que da para digitar, entao um valor assim vem de JSON antigo ou editado
 *     a mao — e reverter um texto inteiro porque passou de 500 caracteres se
 *     leria como "o campo nao funciona".
 *
 * Devolve `undefined` quando recusa. Quem chama cai no valor do autor.
 */
function coerce(raw: unknown, field: ExposedField): ExposedValue | undefined {
  switch (field.kind) {
    case 'color': {
      // O host persiste `fill` embrulhado: `{ solid: { color: '#rrggbb' } }`.
      const wrapped = raw as { solid?: { color?: unknown } } | null;
      const color = wrapped?.solid === undefined ? raw : wrapped.solid.color;
      return typeof color === 'string' && COLOR_REGEX.test(color) ? color : undefined;
    }

    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined;

    case 'text': {
      if (typeof raw !== 'string') return undefined;
      return field.maxLength === undefined ? raw : raw.slice(0, field.maxLength);
    }

    case 'length':
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
      const rounded = field.kind === 'length' ? Math.round(raw) : raw;
      const floor = field.min === undefined ? rounded : Math.max(rounded, field.min);
      return field.max === undefined ? floor : Math.min(floor, field.max);
    }

    case 'token':
    case 'select':
      if (typeof raw !== 'string') return undefined;
      return (field.options ?? []).some((option) => option.value === raw) ? raw : undefined;
  }
}

/**
 * Le o que o consumidor do relatorio escolheu no painel.
 *
 * Os valores chegam em `dataViews[0].metadata.objects`, e chegam mesmo sem poco
 * de campos: e para isso que o `capabilities.json` gerado declara
 * `supportsEmptyDataView` quando ha algo publicado. Sem essa chave o painel
 * aparece, o consumidor mexe e nada muda na tela.
 *
 * O `?.` na lista de views nao e decoracao: o host chama `update` com
 * `dataViews` ausente em alguns tipos de atualizacao, e o tipo do API nao diz.
 */
export function readOverrides(options: VisualUpdateOptions, spec: FormattingSpec): Overrides {
  const objects = options.dataViews?.[0]?.metadata.objects;
  if (!objects) return {};

  const out: Overrides = {};

  for (const node of spec) {
    const stored = objects[node.id];
    if (!stored) continue;

    const accepted: Record<string, ExposedValue> = {};
    let any = false;

    for (const field of node.fields) {
      const value = coerce(stored[field.key], field);
      if (value === undefined) continue;
      accepted[field.key] = value;
      any = true;
    }

    if (any) out[node.id] = accepted;
  }

  return out;
}

/**
 * O valor de um campo, para o JSX gerado.
 *
 * O tipo sai do valor do AUTOR, que o codegen emite literal — entao
 * `pick(o, 'text-2', 'align', 'left')` continua sendo `'left'` aos olhos do
 * compilador, e cabe na uniao estreita que o componente pede. Em runtime pode
 * ser outra opcao da mesma lista, e nunca uma de fora: `coerce` so aceita valor
 * que esta no `options` declarado.
 */
export function pick<T extends ExposedValue>(
  overrides: Overrides,
  nodeId: string,
  key: string,
  authored: T,
): T {
  const value = overrides[nodeId]?.[key];
  // `typeof` e a ultima conferencia: o valor ja passou por `coerce`, e o que
  // resta e o campo ter trocado de tipo entre dois builds do mesmo relatorio —
  // um `padding` que virou texto voltaria como string.
  return typeof value === typeof authored ? (value as T) : authored;
}

function descriptorFor(nodeId: string, key: string): FormattingDescriptor {
  return { objectName: nodeId, propertyName: key };
}

function sliceFor(
  node: ExposedNode,
  field: ExposedField,
  value: ExposedValue | undefined,
): FormattingSlice {
  const uid = `${node.id}-${field.key}`;
  const descriptor = descriptorFor(node.id, field.key);

  switch (field.kind) {
    case 'color':
      return {
        uid,
        displayName: field.label,
        control: {
          type: 'ColorPicker',
          properties: { descriptor, value: { value: String(value) } },
        },
      };

    case 'boolean':
      return {
        uid,
        displayName: field.label,
        control: { type: 'ToggleSwitch', properties: { descriptor, value: value === true } },
      };

    case 'text':
      return {
        uid,
        displayName: field.label,
        control: {
          type: 'TextInput',
          properties: { descriptor, value: String(value), placeholder: '' },
        },
      };

    case 'length':
    case 'number': {
      const options: powerbi.visuals.NumUpDownFormat = {};
      // O sufixo diz a UNIDADE, que e a diferenca entre `length` e `number`: um
      // e pixel, o outro e um numero sem unidade nenhuma.
      if (field.kind === 'length') options.unitSymbol = 'px';
      if (field.min !== undefined) options.minValue = { type: MIN_VALIDATOR, value: field.min };
      if (field.max !== undefined) options.maxValue = { type: MAX_VALIDATOR, value: field.max };

      return {
        uid,
        displayName: field.label,
        control: {
          type: 'NumUpDown',
          properties: { descriptor, value: Number(value), options },
        },
      };
    }

    case 'token':
    case 'select': {
      const items: IEnumMember[] = (field.options ?? []).map((option) => ({
        value: option.value,
        displayName: option.label,
      }));
      // O item vigente EXISTE na lista sempre que o valor veio do autor ou
      // passou por `coerce`. O membro sintetizado cobre a lista vazia, que o
      // codegen nao emite — e evita um dropdown sem valor selecionado, que o
      // painel desenha em branco.
      const selected = items.find((item) => item.value === value);

      return {
        uid,
        displayName: field.label,
        control: {
          type: 'Dropdown',
          properties: {
            descriptor,
            value: selected ?? { value: String(value), displayName: String(value) },
            items,
          },
        },
      };
    }
  }
}

/** A condicao do descritor, contra o valor vigente. */
function isVisible(node: ExposedNode, overrides: Overrides, field: ExposedField): boolean {
  const showWhen = field.showWhen;
  if (!showWhen) return true;
  return String(currentValue(node, overrides, showWhen.key)) === showWhen.equals;
}

/**
 * O modelo que o host desenha no painel de formatacao.
 *
 * Um card por no publicado, na ordem da arvore; um slice por campo publicado, na
 * ordem do descritor. Card sem slice visivel nao entra: um card vazio no painel
 * do Power BI parece um visual quebrado.
 *
 * Os slices sao repartidos pelo `group` do descritor, na ordem da PRIMEIRA
 * aparicao de cada secao. Campo sem grupo cai num bloco inicial sem titulo — que
 * e o unico bloco que `container` e `text` produzem, entao os dois continuam
 * desenhando exatamente como desenhavam antes de o KPI existir, com o mesmo
 * `uid` de sempre.
 */
export function buildFormattingModel(spec: FormattingSpec, overrides: Overrides): FormattingModel {
  const cards: FormattingCard[] = [];

  for (const node of spec) {
    // Ordem de insercao, e nao a ordem alfabetica de um `Map` de chaves: as
    // secoes aparecem no painel na ordem em que o descritor as declara.
    const sections: { name: string; slices: FormattingSlice[] }[] = [];

    for (const field of node.fields) {
      if (!isVisible(node, overrides, field)) continue;
      const name = field.group ?? '';
      let section = sections.filter((candidate) => candidate.name === name)[0];
      if (!section) {
        section = { name, slices: [] };
        sections.push(section);
      }
      section.slices.push(sliceFor(node, field, currentValue(node, overrides, field.key)));
    }

    if (sections.length === 0) continue;

    cards.push({
      uid: node.id,
      displayName: node.title,
      groups: sections.map((section) => ({
        // O `uid` do bloco sem titulo continua sendo `<id>-group`, e nao um
        // indice: e o que mantem o modelo de um no sem grupos identico ao que o
        // Sprint B entregou.
        uid: section.name === '' ? `${node.id}-group` : `${node.id}-group-${section.name}`,
        displayName: section.name,
        // Sem grupos, um titulo repetido dentro do card so ocuparia espaco. Com
        // eles, o titulo E a razao de existirem.
        suppressDisplayName: section.name === '',
        slices: section.slices,
      })),
      // Cada campo publicado entra aqui, INCLUSIVE o escondido pelo `showWhen`:
      // e esta lista que o "Redefinir para o padrao" do Power BI percorre, e um
      // campo de fora dela ficaria com o valor do consumidor depois de um reset
      // que disse ter apagado tudo.
      revertToDefaultDescriptors: node.fields.map((field) => descriptorFor(node.id, field.key)),
    });
  }

  return { cards };
}
