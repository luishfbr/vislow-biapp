import { createProjectId, INITIAL_PACKAGE_VERSION, type ColumnType } from '@vislow/config-schema';
import { CONTAINER_CANVAS, defaultPropsFor, roleFieldsOf } from './registry.js';
import {
  ARTBOARD_DEFAULT,
  KIND_FOR_TYPE,
  SPEC_VERSION,
  type DataColumn,
  type SampleTable,
  type SpecNode,
  type VisualSpec,
} from './spec.js';
import type { NodeKind } from './types.js';

let counter = 0;

/** Id curto e unico por sessao. Casa com NODE_ID_PATTERN. */
export function nextNodeId(kind: NodeKind): string {
  counter += 1;
  return `${kind}-${String(counter)}`;
}

/**
 * Cria um no com os defaults do descritor.
 *
 * Todo no nasce VALIDO na spec 5.0.0. Ate a 4.0.0 nao era assim: campo de papel
 * nao tem default — nao ha escolha sensata —, entao um grafico nascia pendente e
 * de proposito, com o export bloqueado ate o usuario ligar uma coluna. Nenhum
 * descritor declara campo de papel agora, e a funcao voltou a ser so os defaults.
 * Quando o KPI Card da Fase 4 trouxer o papel de volta, o parametro de ligacao
 * volta com ele.
 */
export function createNode(kind: NodeKind, roleBindings: Record<string, string> = {}): SpecNode {
  const props: Record<string, unknown> = { ...defaultPropsFor(kind) };
  for (const field of roleFieldsOf(kind)) {
    const bound = roleBindings[field.key];
    if (bound !== undefined) props[field.key] = bound;
  }

  const node: SpecNode = { id: nextNodeId(kind), kind, props };
  if (kind === 'container') node.children = [];
  return node;
}

/**
 * Papeis que um no novo deve ligar: a primeira coluna livre de cada tipo exigido.
 *
 * Existe para o EDITOR. `createNode` sozinho deixa o campo em branco de
 * proposito, e isso e certo como default do dominio — mas na tela significaria
 * que todo KPI nasce no estado vazio, com o usuario tendo de ligar um campo antes
 * de ver qualquer coisa. Ligar no palpite obvio e reversivel em um clique; a tela
 * vazia so parece defeito.
 *
 * UMA COLUNA POR CAMPO: os dois papeis de medida do KPI nao caem na mesma coluna,
 * senao o card nasceria comparando um numero com ele mesmo — variacao zero, que e
 * o unico resultado que nao ensina nada sobre o que o componente faz.
 *
 * Sem coluna do tipo certo, o campo continua pendente — que ai e a informacao
 * correta, e o export trava ate o autor resolver.
 *
 * Apagada na spec 5.0.0, quando o catalogo ficou sem campo de papel e ela nao
 * tinha o que sugerir. Voltou com o KPI Card.
 */
export function suggestRoleBindings(
  kind: NodeKind,
  columns: readonly DataColumn[],
): Record<string, string> {
  const bindings: Record<string, string> = {};
  const taken = new Set<string>();

  for (const field of roleFieldsOf(kind)) {
    const match = columns.find(
      (column) => column.kind === field.roleKind && !taken.has(column.name),
    );
    if (!match) continue;
    bindings[field.key] = match.name;
    taken.add(match.name);
  }

  return bindings;
}

/**
 * Copia um no e toda a sua descendencia com IDS NOVOS.
 *
 * O id novo em cada nivel nao e detalhe: `NODE_ID_PATTERN` nao exige unicidade,
 * mas `validateSpec` reprova id repetido, e antes disso `findNode` e `replace`
 * param no PRIMEIRO que casam — uma copia com o id do original faria toda edicao
 * do duplicado acertar o original, em silencio.
 *
 * As props e a caixa vem por copia rasa de proposito: sao objetos de valor que
 * ninguem muta no lugar (toda escrita passa por `setNodeProps`/`setNodeRect`,
 * que criam objeto novo).
 */
export function cloneSubtree(node: SpecNode): SpecNode {
  const copy: SpecNode = {
    id: nextNodeId(node.kind),
    kind: node.kind,
    props: { ...node.props },
  };
  if (node.rect) copy.rect = { ...node.rect };
  // O apelido e a lista de publicados acompanham a copia: duplicar um
  // componente ja publicado e pedir outro igual, e nao um que perde o painel de
  // formatacao em silencio. O `objectName` do capabilities e o ID, que e novo —
  // entao os dois cards existem separados no Power BI, como devem.
  if (node.name !== undefined) copy.name = node.name;
  if (node.exposed) copy.exposed = [...node.exposed];
  if (node.children) copy.children = node.children.map(cloneSubtree);
  return copy;
}

/**
 * Nome tecnico de uma coluna, derivado do rotulo.
 *
 * Precisa casar `ROLE_NAME_PATTERN` porque vira o `name` do `capabilities.json`.
 * Sem acento, sem separador: o Power BI le esse campo como identificador.
 */
function slugifyRoleName(label: string): string {
  const words = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);

  const camel = words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');

  // O padrao exige comecar com letra minuscula e ter ao menos 2 caracteres: um
  // rotulo so de digitos ou de emoji cairia fora sem este piso.
  const safe = /^[a-z]/.test(camel) ? camel : `campo${camel}`;
  return safe.slice(0, 30).padEnd(2, 'x');
}

/**
 * Cria uma coluna com nome unico e ESTAVEL.
 *
 * O `name` nasce do rotulo e nunca mais muda — mesma logica do `project.id`.
 * Deixar o usuario reescrever o `name` obrigaria a reescrever toda referencia na
 * arvore junto, e uma reescrita que falhasse pela metade produziria um visual
 * pedindo uma coluna que nenhum no le. O que o usuario edita e o `displayName`,
 * que e o que ele ve no Power BI.
 *
 * O papel sai do tipo (`KIND_FOR_TYPE`) e pode ser trocado depois, em
 * `setColumnKind` — o tipo e a escolha mais forte, mas nao e a ultima palavra.
 */
export function createColumn(
  label: string,
  type: ColumnType,
  existing: readonly DataColumn[],
): DataColumn {
  const base = slugifyRoleName(label);
  const taken = new Set(existing.map((column) => column.name));

  let name = base;
  for (let suffix = 2; taken.has(name); suffix += 1) {
    name = `${base.slice(0, 28)}${String(suffix)}`;
  }

  return { name, displayName: label, kind: KIND_FOR_TYPE[type], type };
}

/**
 * A tabela de um projeto novo.
 *
 * As categorias e as magnitudes vinham do `mockFrame` do `visual-kit`, e foram
 * escolhidas para EXPOR problema de layout, nao para ficar bonito: nome curto ao
 * lado de nome longo (que e o que quebra eixo e legenda), magnitudes bem
 * diferentes e um zero. Agora que o dado de exemplo e do usuario, elas mudam de
 * casa e viram o ponto de partida que ele edita.
 *
 * O registry nao pode importar o kit — o kit e folha do grafo de pacotes.
 */
export const DEFAULT_TABLE: SampleTable = {
  columns: [
    { name: 'regiao', displayName: 'Região', kind: 'grouping', type: 'text' },
    { name: 'receita', displayName: 'Receita', kind: 'measure', type: 'currency' },
    /*
     * A SEGUNDA MEDIDA, acrescentada na spec 5.4.0.
     *
     * `suggestRoleBindings` liga cada campo de papel a primeira coluna LIVRE do
     * tipo certo. Com uma medida so, o segundo campo de medida de qualquer no
     * nascia sem candidato: o Medidor nasceria em estado vazio pedindo a meta, e
     * tela vazia parece defeito — que e exatamente o problema que a sugestao
     * existe para evitar. De quebra, o `compareRole` do KPI ganha sugestao pela
     * primeira vez desde que passou a existir.
     *
     * As magnitudes nao acompanham a receita de propósito: a meta do Sudeste
     * fica ABAIXO do realizado e a do Sul acima, entao o medidor de exemplo
     * mostra os dois estados — o entalhe e a barra curta — sem ninguem editar
     * nada.
     */
    { name: 'meta', displayName: 'Meta', kind: 'measure', type: 'currency' },
  ],
  rows: [
    ['Sul', 184320, 240000],
    ['Sudeste', 921450, 800000],
    ['Centro-Oeste e Norte', 47800, 60000],
    ['Nordeste', 312990, 300000],
    ['Exterior', 0, 50000],
  ],
};

/**
 * Projeto novo: tela em branco de verdade — um container vazio e nada dentro.
 *
 * O `id` e gerado UMA vez aqui e nunca muda: e o que faz reexportar atualizar o
 * visual no Power BI em vez de duplicar (RN-01 / RF-10).
 */
export function createEmptySpec(name: string): VisualSpec {
  counter = 0;

  // A raiz de um projeto NOVO posiciona livremente; o default do descritor
  // continua sendo empilhar. A diferenca nao e mais compatibilidade com spec
  // salva (nao ha migracao na 5.0.0) — e que sao dois usos: a RAIZ e uma
  // prancheta, onde se desenha; um container solto DENTRO de outro quase sempre
  // e uma pilha, e nascer canvas obrigaria a posicionar cada filho a mao.
  const root = createNode('container');
  root.props.placement = CONTAINER_CANVAS;

  return {
    schemaVersion: SPEC_VERSION,
    project: {
      id: createProjectId(name),
      name,
      packageVersion: INITIAL_PACKAGE_VERSION,
      // Escrito por extenso, e nao deixado em branco para cair no default:
      // projeto novo tem uma prancheta declarada, e mudar o default depois nao
      // reescreve em silencio o tamanho de quem ja estava desenhando.
      artboard: { ...ARTBOARD_DEFAULT },
    },
    data: {
      columns: DEFAULT_TABLE.columns.map((column) => ({ ...column })),
      rows: DEFAULT_TABLE.rows.map((row) => [...row]),
    },
    root,
  };
}
