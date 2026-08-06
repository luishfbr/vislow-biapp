import { CONTAINER_CANVAS, exposableFields, isExposable, NODE_DESCRIPTORS } from './registry.js';
import { NODE_NAME_MAX_LENGTH, RECT_MIN_SIZE, type NodeRect, type SpecNode } from './spec.js';

/**
 * Edicao da arvore — funcoes PURAS que devolvem uma raiz nova.
 *
 * Moram no registro, e nao no editor, por dois motivos:
 *
 *   1. sao as unicas operacoes que podem produzir uma arvore invalida (nó dentro
 *      de si mesmo, filho em folha, raiz removida), e a regra de "o que e valido"
 *      ja vive aqui, no descritor;
 *   2. sao testaveis sem React.
 *
 * CONVENCAO: toda mutacao devolve `null` quando a operacao e ilegal, em vez de
 * devolver a arvore intacta. Um no-op silencioso e indistinguivel de sucesso e ja
 * custou tempo neste projeto em outros lugares — aqui o chamador e obrigado a
 * tratar o caso.
 */

export function acceptsChildren(node: SpecNode): boolean {
  return NODE_DESCRIPTORS[node.kind].acceptsChildren;
}

/**
 * O no da a cada filho a sua propria caixa, em vez de empilhar?
 *
 * Vive aqui, e nao em cada consumidor, pelo mesmo motivo do `consumesData`: quem
 * precisa concordar sao o preview do editor e o codegen, que decidem se
 * embrulham o filho num `CanvasSlot`. Cada um com a sua copia da regra e a
 * divergencia mais barata de introduzir e mais cara de achar — o preview
 * mostraria a composicao posicionada e o pacote entregue sairia empilhado.
 */
export function positionsChildren(node: SpecNode): boolean {
  return acceptsChildren(node) && node.props.placement === CONTAINER_CANVAS;
}

/**
 * Faixas iguais ao longo da direcao em que o container empilhava.
 *
 * E o que um container ganha ao virar canvas: a composicao que estava na tela
 * continua na tela, e o usuario arrasta a partir dela. Converter para caixas
 * arbitrarias faria o visual dele se desmontar no clique que deveria dar mais
 * liberdade.
 */
export function bandRects(count: number, direction: unknown): NodeRect[] {
  if (count <= 0) return [];
  const size = 100 / count;
  return Array.from({ length: count }, (_, index) =>
    direction === 'row'
      ? clampRect({ x: index * size, y: 0, w: size, h: 100 })
      : clampRect({ x: 0, y: index * size, w: 100, h: size }),
  );
}

/**
 * Caixa de um no que acaba de cair num canvas.
 *
 * Em cascata, e nao sempre no mesmo lugar: dois nos exatamente sobrepostos
 * parecem um no so, e o usuario arrasta o de cima varias vezes sem entender por
 * que o de baixo nunca aparece.
 */
function droppedRect(index: number): NodeRect {
  const offset = (index % 8) * 5;
  return clampRect({ x: 5 + offset, y: 5 + offset, w: 40, h: 30 });
}

/**
 * Garante que todo filho de um canvas tem caixa.
 *
 * A invariante vive nas OPERACOES de arvore, e nao no editor: assim nao ha
 * caminho — inserir, mudar de pai, virar canvas — que produza um filho de canvas
 * sem geometria. O `validateSpec` cobre o mesmo caso para a spec que chega de
 * fora, onde nenhuma operacao passou.
 */
function withPlacedChildren(container: SpecNode): SpecNode {
  if (!positionsChildren(container)) return container;

  const children = container.children ?? [];
  if (children.every((child) => child.rect)) return container;

  // Ninguem posicionado ainda: e a conversao de empilhado para livre, e as
  // faixas preservam o que estava na tela. Com parte posicionada, o que falta e
  // no novo — esse cai em cascata, para nao sumir atras dos outros.
  const converting = children.every((child) => !child.rect);
  const bands = converting ? bandRects(children.length, container.props.direction) : [];

  return {
    ...container,
    children: children.map((child, index) => ({
      ...child,
      rect: child.rect ?? bands[index] ?? droppedRect(index),
    })),
  };
}

export function findNode(root: SpecNode, id: string): SpecNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Cadeia da raiz ate o no, inclusive. Vazia quando o id nao existe.
 * O ultimo elemento e o proprio no; o penultimo e o pai.
 */
export function ancestryOf(root: SpecNode, id: string): SpecNode[] {
  if (root.id === id) return [root];
  for (const child of root.children ?? []) {
    const chain = ancestryOf(child, id);
    if (chain.length > 0) return [root, ...chain];
  }
  return [];
}

export function parentOf(root: SpecNode, id: string): SpecNode | null {
  const chain = ancestryOf(root, id);
  return chain.length >= 2 ? (chain[chain.length - 2] ?? null) : null;
}

/** Ids do no e de toda a sua descendencia. Base da guarda de ciclo. */
export function subtreeIds(node: SpecNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const child of node.children ?? []) {
    for (const id of subtreeIds(child)) ids.add(id);
  }
  return ids;
}

/**
 * Reescreve um no da arvore preservando o resto por identidade referencial.
 *
 * Devolve `null` quando o id nao esta neste ramo — e assim que o chamador
 * recursivo sabe onde continuar procurando, e assim que uma edicao com id
 * inexistente vira rejeicao em vez de arvore intacta.
 *
 * So os ancestrais do no alterado sao recriados; os ramos irmaos continuam sendo
 * o MESMO objeto. E o que permite ao React pular a re-renderizacao deles.
 */
function replace(root: SpecNode, id: string, recipe: (node: SpecNode) => SpecNode): SpecNode | null {
  if (root.id === id) return recipe(root);
  if (!root.children) return null;

  for (const [index, child] of root.children.entries()) {
    const next = replace(child, id, recipe);
    if (!next) continue;

    const children = [...root.children];
    children[index] = next;
    return { ...root, children };
  }

  return null;
}

/**
 * Insere `node` como filho de `parentId`, na posicao `index` (default: no fim).
 *
 * Rejeita quando o pai nao existe ou e uma folha — e a mesma regra que o schema
 * cobra depois, aplicada no momento em que o usuario clica.
 */
export function insertChild(
  root: SpecNode,
  parentId: string,
  node: SpecNode,
  index?: number,
): SpecNode | null {
  const parent = findNode(root, parentId);
  if (!parent || !acceptsChildren(parent)) return null;

  return replace(root, parentId, (target) => {
    const children = [...(target.children ?? [])];
    const at = index === undefined ? children.length : clamp(index, 0, children.length);
    children.splice(at, 0, node);
    return withPlacedChildren({ ...target, children });
  });
}

/** Remove um no. Rejeita a raiz: uma arvore sem raiz nao e representavel. */
export function removeNode(root: SpecNode, id: string): SpecNode | null {
  if (root.id === id) return null;
  const parent = parentOf(root, id);
  if (!parent) return null;

  return replace(root, parent.id, (target) => ({
    ...target,
    children: (target.children ?? []).filter((child) => child.id !== id),
  }));
}

/**
 * Reordena um no entre os irmaos. `delta` e -1 (sobe) ou +1 (desce).
 * Rejeita quando ja esta na ponta — assim o botao desabilitado e a operacao
 * rejeitada concordam, em vez de o botao mentir.
 */
export function moveNode(root: SpecNode, id: string, delta: number): SpecNode | null {
  const parent = parentOf(root, id);
  if (!parent) return null;

  const siblings = parent.children ?? [];
  const from = siblings.findIndex((child) => child.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= siblings.length) return null;

  return replace(root, parent.id, (target) => {
    const children = [...(target.children ?? [])];
    const [moved] = children.splice(from, 1);
    if (moved) children.splice(to, 0, moved);
    return { ...target, children };
  });
}

/**
 * Move um no para outro pai.
 *
 * A guarda que importa e a de CICLO: soltar um container dentro de um
 * descendente seu destacaria o ramo inteiro da arvore. O resultado nao seria um
 * erro — seria um pedaco do visual desaparecendo sem mensagem nenhuma.
 */
export function reparentNode(
  root: SpecNode,
  id: string,
  newParentId: string,
  index?: number,
): SpecNode | null {
  const node = findNode(root, id);
  const parent = findNode(root, newParentId);
  if (!node || !parent || !acceptsChildren(parent)) return null;
  if (subtreeIds(node).has(newParentId)) return null;

  const detached = removeNode(root, id);
  if (!detached) return null;
  return insertChild(detached, newParentId, node, index);
}

/**
 * Apaga toda referencia a um papel na arvore.
 *
 * EXCECAO a convencao do modulo: devolve sempre uma raiz, nunca `null`. E uma
 * varredura, nao uma edicao dirigida — "nenhum no referenciava o papel" e
 * resultado legitimo, nao operacao ilegal.
 *
 * O campo fica AUSENTE em vez de vazio: e o mesmo estado de um no recem-criado,
 * que o schema reprova e o editor mostra como pendente. Deixar o nome do papel
 * apagado no prop produziria uma spec que pede uma coluna inexistente.
 */
export function unbindRole(root: SpecNode, roleName: string): SpecNode {
  const roleKeys = new Set(
    NODE_DESCRIPTORS[root.kind].fields
      .filter((field) => field.kind === 'role')
      .map((field) => field.key),
  );

  const props = Object.fromEntries(
    Object.entries(root.props).filter(
      ([key, value]) => !(roleKeys.has(key) && value === roleName),
    ),
  );

  const children = root.children?.map((child) => unbindRole(child, roleName));
  return children ? { ...root, props, children } : { ...root, props };
}

/**
 * Aplica valores de campo a um no. Nao valida: quem valida e `validateSpec`.
 *
 * A excecao e a geometria dos filhos, que nao e validacao e sim invariante:
 * trocar a disposicao para livre e o unico jeito de um container passar a
 * posicionar, e os filhos que ja estavam la precisam de caixa no mesmo passo. O
 * caminho contrario NAO apaga as caixas — ir e voltar preserva o arranjo, em vez
 * de punir quem quis so dar uma olhada.
 */
export function setNodeProps(
  root: SpecNode,
  id: string,
  patch: Record<string, unknown>,
): SpecNode | null {
  return replace(root, id, (target) =>
    withPlacedChildren({ ...target, props: { ...target.props, ...patch } }),
  );
}

/**
 * Titulo do no onde quer que ele apareca para um humano: o card do painel de
 * formatacao do visual gerado e a arvore do editor.
 *
 * O apelido e opcional, entao o fallback tem de existir num lugar so — o mesmo
 * motivo do `artboardOf`. Um `?? label` por chamada e uma chance por chamada de
 * um lado chamar o no de "Texto" e o outro de coisa nenhuma.
 */
export function titleOf(node: SpecNode): string {
  return node.name ?? NODE_DESCRIPTORS[node.kind].label;
}

/**
 * Apelido que o editor propoe ao publicar o primeiro campo de um no.
 *
 * Do CONTEUDO quando ha um, porque e assim que o autor reconhece o componente:
 * o card chamado "Receita total" e o titulo que ele esta vendo na prancheta.
 * Sem conteudo — um container — sobra o rotulo do descritor.
 */
export function suggestNodeName(node: SpecNode): string {
  const content = node.props.content;
  const text = typeof content === 'string' ? content.trim().replace(/\s+/g, ' ') : '';
  if (text === '') return NODE_DESCRIPTORS[node.kind].label;
  return text.slice(0, NODE_NAME_MAX_LENGTH);
}

/**
 * Troca o apelido do no. String vazia REMOVE o apelido, e o titulo volta a ser
 * o rotulo do descritor — apagar o campo no painel nao pode produzir um card
 * sem titulo nenhum.
 */
export function setNodeName(root: SpecNode, id: string, name: string): SpecNode | null {
  const clean = name.trim().slice(0, NODE_NAME_MAX_LENGTH);
  return replace(root, id, (target) => {
    const next: SpecNode = { ...target };
    if (clean === '') delete next.name;
    else next.name = clean;
    return next;
  });
}

/**
 * Publica ou despublica um campo no painel de formatacao do visual gerado.
 *
 * Rejeita (`null`) a chave que nao existe no descritor ou que nao e publicavel —
 * a mesma convencao do resto do modulo, e a mesma regra que `validateSpec` cobra
 * depois na spec que chega de fora.
 *
 * Duas invariantes moram aqui, e nao no editor:
 *
 *   1. a lista guarda a ORDEM DO DESCRITOR, nunca a ordem dos cliques. Ela vira
 *      a ordem dos slices dentro do card, e a ordem de clique faria dois autores
 *      com as mesmas escolhas gerarem pacotes diferentes — e o mesmo autor,
 *      dois, ao desmarcar e remarcar;
 *   2. publicar o PRIMEIRO campo batiza o no, se ele ainda nao tem apelido. O
 *      titulo do card e a unica coisa pela qual o consumidor identifica o
 *      componente, e um card chamado "Texto" nasce de um esquecimento que so
 *      aparece dentro do Power BI.
 *
 * Despublicar tudo NAO apaga o apelido: quem publica de novo reencontra o nome
 * que escolheu, e um apelido sozinho nao chega ao pacote.
 */
export function setFieldExposed(
  root: SpecNode,
  id: string,
  key: string,
  exposed: boolean,
): SpecNode | null {
  const node = findNode(root, id);
  if (!node) return null;

  const field = NODE_DESCRIPTORS[node.kind].fields.find((candidate) => candidate.key === key);
  if (!field || !isExposable(field)) return null;

  return replace(root, id, (target) => {
    const current = new Set(target.exposed ?? []);
    if (exposed) current.add(key);
    else current.delete(key);

    const next: SpecNode = { ...target };
    const keys = exposableFields(target.kind)
      .map((candidate) => candidate.key)
      .filter((candidate) => current.has(candidate));

    // Ausente, e nao `[]`: "fechado" tem uma representacao so. Duas fariam o
    // teste de "projeto sem nada publicado gera o pacote de antes" passar num
    // caminho e falhar no outro.
    if (keys.length === 0) delete next.exposed;
    else next.exposed = keys;

    if (keys.length > 0 && next.name === undefined) next.name = suggestNodeName(target);

    return next;
  });
}

/**
 * Prende uma caixa dentro do pai e arredonda para duas casas.
 *
 * PRENDER e nao rejeitar, porque o chamador e um arrasto: passar da borda quer
 * dizer "encosta na borda", nunca "cancela o movimento". A regra que REPROVA
 * caixa fora do pai continua em `validateSpec`, para a spec que chega por
 * importacao — la nao houve arrasto nenhum para prender.
 *
 * Arredondar nao e cosmetico: um arrasto produz `33.33333333333333`, e o codegen
 * despeja o numero literal no fonte gerado. Duas casas mantem o fonte legivel e
 * a diferenca visual e menor que um pixel em qualquer moldura plausivel.
 */
export function clampRect(rect: NodeRect): NodeRect {
  const w = round2(clamp(rect.w, RECT_MIN_SIZE, 100));
  const h = round2(clamp(rect.h, RECT_MIN_SIZE, 100));
  return {
    x: round2(clamp(rect.x, 0, 100 - w)),
    y: round2(clamp(rect.y, 0, 100 - h)),
    w,
    h,
  };
}

/** Move ou redimensiona um no dentro do pai. */
export function setNodeRect(root: SpecNode, id: string, rect: NodeRect): SpecNode | null {
  return replace(root, id, (target) => ({ ...target, rect: clampRect(rect) }));
}

/**
 * Onde a selecao deve cair depois de remover `id`.
 *
 * O irmao seguinte, senao o anterior, senao o pai. Deixar a selecao vazia faria
 * o painel de propriedades piscar para o estado vazio a cada exclusao.
 */
export function selectionAfterRemoval(root: SpecNode, id: string): string {
  const parent = parentOf(root, id);
  if (!parent) return root.id;

  const siblings = parent.children ?? [];
  const index = siblings.findIndex((child) => child.id === id);
  const next = siblings[index + 1] ?? siblings[index - 1];
  return next ? next.id : parent.id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
