import { INK, PAPER, RADIUS, RULE, SPACE, STROKE, TYPE_SCALE } from '@vislow/config-schema';
import type { FieldSpec, NodeDescriptor, NodeKind } from './types.js';

/**
 * O catalogo de componentes. FONTE UNICA de tres consumidores:
 *
 *   1. a paleta e o painel de propriedades do editor;
 *   2. o schema JSON que valida a arvore (gerado daqui — ver `schema.ts`);
 *   3. o codegen do backend, que emite JSX a partir dos descritores.
 *
 * Adicionar um tipo de no e uma entrada aqui. Nao ha lista de tipos duplicada em
 * lugar nenhum: o schema e derivado, entao nao ha como divergir.
 */

/**
 * As duas disposicoes de um container.
 *
 * Constantes, e nao strings soltas, porque o valor e comparado em cinco lugares
 * — descritor, `showWhen`, o proprio componente, o preview e o codegen — e um
 * erro de digitacao em qualquer um deles nao quebra nada: o container so volta a
 * empilhar em silencio.
 */
export const CONTAINER_STACK = 'stack';
export const CONTAINER_CANVAS = 'canvas';

/**
 * Teto das medidas de moldura, em pixel.
 *
 * Nao e o tamanho da prancheta: espacamento de 200px ja e mais do que qualquer
 * composicao plausivel usa, e um teto folgado demais transforma um zero a mais
 * digitado por engano num componente que sumiu da tela sem explicacao.
 */
const LENGTH_MAX = 200;

/**
 * Campos de moldura, repetidos em todo no que desenha uma superficie.
 *
 * OS DEFAULTS CITAM `design.ts` — nao ha hex nem numero solto aqui. Ate a spec
 * 4.0.0 eram `#ffffff`, `#e2e8f0` e raio 8: o slate do Tailwind, escolhido por
 * estar a mao, e todo visual gerado nascia com cara de painel de SaaS.
 *
 * A borda nasce com UM PIXEL, e nao zero, e a sombra nasce em `none`. Essa e a
 * tese da linguagem visual escrita por extenso: um componente Vislow se separa
 * da tela do relatorio por TOM e por FIO, nunca por elevacao — e tom e fio
 * sobrevivem a impressao e a exportacao em PDF, onde sombra some ou suja.
 */
const SURFACE_FIELDS: FieldSpec[] = [
  { key: 'padding', label: 'Espacamento', kind: 'length', default: SPACE.lg, min: 0, max: LENGTH_MAX },
  { key: 'radius', label: 'Raio de borda', kind: 'length', default: RADIUS.md, min: 0, max: LENGTH_MAX },
  {
    // `borderWidth`, e nao `border`: o campo e uma MEDIDA, e `border: 2` se
    // leria como um enum cujo segundo valor foi escolhido. O nome mudou junto
    // com o tipo, para nao deixar um rastro do enum antigo num campo que ja nao
    // e enum.
    key: 'borderWidth',
    label: 'Espessura da borda',
    kind: 'length',
    default: STROKE.hairline,
    min: 0,
    max: 24,
  },
  { key: 'shadow', label: 'Sombra', kind: 'token', token: 'shadow', default: 'none' },
  { key: 'background', label: 'Cor de fundo', kind: 'color', default: PAPER },
  { key: 'borderColor', label: 'Cor da borda', kind: 'color', default: RULE },
];

/**
 * Faixa do tamanho de fonte, em pixel.
 *
 * O piso de 8 nao e arbitrario: abaixo disso o texto e ilegivel em qualquer
 * moldura, e oferecer o valor seria oferecer um jeito de esconder conteudo sem
 * perceber.
 */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 200;

export const NODE_DESCRIPTORS: Record<NodeKind, NodeDescriptor> = {
  container: {
    kind: 'container',
    label: 'Container',
    hint: 'Agrupa outros componentes: empilhados, ou posicionados livremente.',
    keywords: ['grupo', 'caixa', 'secao', 'layout', 'empilhar', 'painel', 'canvas', 'prancheta'],
    shortcut: 'C',
    acceptsChildren: true,
    component: 'Container',
    fields: [
      {
        // `placement`, e nao `layout`: quando os graficos existiam, o de barras
        // tinha um campo `layout` que queria dizer ORIENTACAO. Dois campos de
        // mesmo nome e sentido diferente nao quebram compilacao — quebram a
        // leitura do fonte gerado, e um teste deste repo ja mediu o campo errado
        // por causa disso. O nome fica como esta para que a Fase 4 possa trazer
        // o `layout` de volta sem reabrir a colisao.
        key: 'placement',
        label: 'Disposicao',
        hint: 'Empilhar divide o espaco sozinho; livre da a cada filho a sua propria caixa.',
        // O codegen le esta chave para decidir se embrulha os filhos em
        // `CanvasSlot`. E a definicao de `structural`: a escolha ja foi gasta
        // quando o pacote foi gerado, entao ela nao vai ao painel do Power BI.
        structural: true,
        kind: 'select',
        options: [CONTAINER_STACK, CONTAINER_CANVAS],
        // `stack` e o default para que toda spec ja salva continue igual sem
        // migracao nenhuma: o campo ausente vira o comportamento de sempre.
        default: CONTAINER_STACK,
      },
      {
        key: 'direction',
        label: 'Direcao',
        kind: 'select',
        options: ['row', 'column'],
        default: 'column',
        showWhen: { key: 'placement', equals: CONTAINER_STACK },
      },
      {
        key: 'gap',
        label: 'Espaco entre itens',
        kind: 'length',
        default: SPACE.sm,
        min: 0,
        max: LENGTH_MAX,
        showWhen: { key: 'placement', equals: CONTAINER_STACK },
      },
      ...SURFACE_FIELDS,
    ],
  },

  /**
   * A caixa de texto. Onze campos, e a escolha nao foi so estetica: eles cobrem
   * os SEIS tipos de `FieldSpec` que um no pode declarar — `text`, `length`,
   * `token`, `color`, `boolean` e `select`. Um componente so exercita, ponta a
   * ponta, todo o caminho generico que o painel, o schema e o codegen percorrem;
   * o que passar aqui passa para qualquer componente futuro.
   */
  text: {
    kind: 'text',
    label: 'Texto',
    hint: 'Titulo, rotulo ou nota, dentro de uma caixa. Nao le dados do modelo.',
    keywords: ['titulo', 'rotulo', 'legenda', 'nota', 'paragrafo', 'cabecalho', 'caixa'],
    shortcut: 'T',
    acceptsChildren: false,
    component: 'TextBox',
    fields: [
      // 500, e nao os 200 de antes: a caixa passou a quebrar linha, e um teto de
      // 200 num campo que agora aceita paragrafo cortaria a frase no meio sem
      // dizer por que.
      { key: 'content', label: 'Conteudo', kind: 'text', default: 'Texto', maxLength: 500 },
      {
        key: 'fontSize',
        label: 'Tamanho',
        kind: 'length',
        default: TYPE_SCALE.title,
        min: FONT_SIZE_MIN,
        max: FONT_SIZE_MAX,
      },
      { key: 'fontWeight', label: 'Peso', kind: 'token', token: 'fontWeight', default: 'semibold' },
      { key: 'align', label: 'Alinhamento', kind: 'token', token: 'align', default: 'left' },
      {
        key: 'valign',
        label: 'Alinhamento vertical',
        hint: 'Onde o texto fica quando a caixa e mais alta que ele.',
        kind: 'token',
        token: 'valign',
        default: 'top',
      },
      { key: 'color', label: 'Cor do texto', kind: 'color', default: INK },
      {
        // Interruptor, e nao uma cor "transparente": `COLOR_PATTERN` so aceita
        // `#rrggbb`, e abrir o padrao para oito digitos mudaria a validacao de
        // TODA cor do produto por causa deste caso. O interruptor ainda diz
        // melhor: desligar o fundo nao apaga a cor ja escolhida.
        key: 'showBackground',
        label: 'Fundo',
        kind: 'boolean',
        default: false,
      },
      {
        key: 'background',
        label: 'Cor de fundo',
        kind: 'color',
        default: PAPER,
        showWhen: { key: 'showBackground', equals: 'true' },
      },
      {
        key: 'padding',
        label: 'Espacamento',
        kind: 'length',
        default: SPACE.sm,
        min: 0,
        max: LENGTH_MAX,
      },
      {
        key: 'radius',
        label: 'Raio de borda',
        kind: 'length',
        default: RADIUS.md,
        min: 0,
        max: LENGTH_MAX,
      },
      {
        key: 'overflow',
        label: 'Quando nao cabe',
        hint: 'Quebrar em varias linhas, ou cortar com reticencias numa linha so.',
        kind: 'select',
        options: ['wrap', 'truncate'],
        default: 'wrap',
      },
    ],
  },
};

export const NODE_KINDS = Object.keys(NODE_DESCRIPTORS) as NodeKind[];

export function descriptorFor(kind: NodeKind): NodeDescriptor {
  return NODE_DESCRIPTORS[kind];
}

/** Papeis de dados que um no consome, na ordem em que aparecem nos campos. */
export function roleFieldsOf(kind: NodeKind): Extract<FieldSpec, { kind: 'role' }>[] {
  return NODE_DESCRIPTORS[kind].fields.filter(
    (field): field is Extract<FieldSpec, { kind: 'role' }> => field.kind === 'role',
  );
}

/**
 * O campo pode ser publicado no painel de formatacao do visual gerado?
 *
 * Duas exclusoes, e as duas sao por natureza do campo, nao por gosto:
 *
 *   - `structural`, porque o codegen ja consumiu a escolha para decidir a forma
 *     da arvore (ver `FieldBase.structural`);
 *   - `role`, porque campo de papel nao e formatacao: e a ligacao com uma coluna
 *     do modelo, e quem a troca e o poco de campos do Power BI, nao um slice.
 *
 * FONTE UNICA dos tres consumidores de sempre — o painel do editor, que decide
 * onde desenhar o alternador; o `validateSpec`, que reprova chave publicada que
 * nao poderia ser; e o codegen, que emite o `objects` do capabilities.
 */
export function isExposable(field: FieldSpec): boolean {
  return field.kind !== 'role' && field.structural !== true;
}

/** Campos publicaveis de um tipo de no, na ordem do descritor. */
export function exposableFields(kind: NodeKind): FieldSpec[] {
  return NODE_DESCRIPTORS[kind].fields.filter(isExposable);
}

/**
 * O no le o `DataFrame`?
 *
 * Vive AQUI porque tem dois consumidores que precisam concordar: o codegen, que
 * decide se emite `frame={frame}` no JSX gerado, e o preview do editor, que
 * decide se passa a prop `frame`. Cada um com a sua copia da regra e a
 * divergencia mais barata de introduzir e mais cara de achar — o preview
 * desenharia dados e o pacote entregue cairia no estado vazio.
 *
 * DORMENTE na spec 5.0.0: nenhum descritor declara campo de papel, entao isto
 * devolve `false` sempre e o `capabilities` gerado sai com `dataRoles: []` — o
 * visual nao tem poco de campos no Power BI. A tabela de exemplo do projeto
 * continua servindo ao preview. Volta a morder com o KPI Card da Fase 4, e e por
 * isso que a funcao fica: e ela que impede preview e codegen de divergirem.
 */
export function consumesData(kind: NodeKind): boolean {
  return roleFieldsOf(kind).length > 0;
}

/**
 * Props default de um tipo de no.
 *
 * Campos de papel NAO entram: eles referenciam um papel que o usuario declarou
 * no projeto, e nao ha default sensato — quem cria o no escolhe.
 */
export function defaultPropsFor(kind: NodeKind): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const field of NODE_DESCRIPTORS[kind].fields) {
    if (field.kind !== 'role') props[field.key] = field.default;
  }
  return props;
}
