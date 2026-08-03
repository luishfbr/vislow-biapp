import {
  NODE_DESCRIPTORS,
  consumesData,
  positionsChildren,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { indent, jsString, jsxValue } from './literal.js';
import { usedRoles } from './roles.js';

/**
 * Gera o `src/visual.tsx` do projeto pbiviz.
 *
 * ADR-10: o codegen emite IMPORTS NOMEADOS dos mesmos componentes do
 * `visual-kit` que o preview do editor renderiza. Nao emite JSX de Recharts cru
 * e nao existe interpretador generico da arvore em runtime. Duas consequencias
 * que valem o desenho:
 *
 *   1. WYSIWYG continua garantido por construcao depois do pivo — preview e
 *      visual final sao literalmente o mesmo componente (ADR-04).
 *   2. Import nomeado da tree-shaking: o bundle leva so os tipos de no que o
 *      usuario usou, que e o que sustenta o orcamento de 1 MB.
 *
 * RN-11: a arvore e DADO. Nada aqui interpreta ou compila algo que o usuario
 * escreveu — os componentes vem de uma whitelist (o registro) e os valores saem
 * como literais (ver `literal.ts`).
 */

/**
 * Nos cujo descritor tem campo de papel precisam do quadro.
 *
 * A regra vem do REGISTRO, nao daqui: o preview do editor decide a mesma coisa,
 * e duas copias divergiriam sem nada quebrar em tempo de compilacao.
 */
function needsFrame(node: SpecNode): boolean {
  return consumesData(node.kind);
}

function emitNode(node: SpecNode): string {
  const descriptor = NODE_DESCRIPTORS[node.kind];
  const attributes: string[] = [];

  if (needsFrame(node)) attributes.push('frame={frame}');

  // A ORDEM vem do descritor, nao do objeto `props`: a ordem das chaves de um
  // objeto vindo de JSON e do cliente, e o fonte gerado precisa ser
  // deterministico para que dois builds da mesma spec batam byte a byte.
  for (const field of descriptor.fields) {
    attributes.push(`${field.key}=${jsxValue(node.props[field.key])}`);
  }

  const open = `<${descriptor.component}`;
  const attrs = attributes.map((attr) => indent(attr, 1)).join('\n');
  const children = node.children ?? [];

  if (children.length === 0) {
    return `${open}\n${attrs}\n/>`;
  }

  // GEMEO de `renderNode` no editor: quem decide o embrulho e o pai, com a mesma
  // funcao do registro. Divergir aqui faria o preview mostrar a composicao
  // posicionada e o pacote entregue sair empilhado — sem erro nos dois lados.
  const free = positionsChildren(node);
  const body = children
    .map((child) => indent(free ? emitSlot(child) : emitNode(child), 1))
    .join('\n');
  return `${open}\n${attrs}\n>\n${body}\n</${descriptor.component}>`;
}

/**
 * Embrulha um filho posicionado.
 *
 * A caixa e obrigatoria aqui — nao ha default. Uma spec sem ela nao chega ao
 * codegen: `validateSpec` roda no editor antes de enviar e de novo na API antes
 * de compilar, e essa e a spec que ja passou duas vezes.
 */
function emitSlot(node: SpecNode): string {
  const rect = node.rect;
  if (!rect) throw new Error(`no "${node.id}" e filho de um canvas e nao tem caixa`);

  const attrs = (['x', 'y', 'w', 'h'] as const)
    .map((axis) => indent(`${axis}={${String(rect[axis])}}`, 1))
    .join('\n');

  return `<CanvasSlot\n${attrs}\n>\n${indent(emitNode(node), 1)}\n</CanvasSlot>`;
}

/** Componentes usados na arvore, em ordem alfabetica (import deterministico). */
function usedComponents(spec: VisualSpec): string[] {
  const names = new Set<string>();
  const visit = (node: SpecNode): void => {
    names.add(NODE_DESCRIPTORS[node.kind].component);
    // O embrulho entra como qualquer outro no — import nomeado —, e so quando ha
    // filho posicionado: quem so empilha nao paga por ele no bundle.
    if (positionsChildren(node) && (node.children ?? []).length > 0) names.add('CanvasSlot');
    node.children?.forEach(visit);
  };
  visit(spec.root);
  return [...names].sort();
}

function treeUsesFrame(spec: VisualSpec): boolean {
  const visit = (node: SpecNode): boolean =>
    needsFrame(node) || (node.children ?? []).some(visit);
  return visit(spec.root);
}

export function generateVisualSource(spec: VisualSpec, buildId: string): string {
  const components = usedComponents(spec);
  const roles = usedRoles(spec);
  const withFrame = treeUsesFrame(spec);

  // `EMPTY_FRAME` e `DataFrame` entram SEMPRE, mesmo numa arvore so de texto: o
  // quadro deixou de ser apenas dado no Sprint 6 — e por ele que a interacao
  // com o host viaja, e um visual sem papel nenhum ainda precisa de menu de
  // contexto e alto contraste.
  const nodeImports = [...components, 'EMPTY_FRAME', 'type DataFrame'];

  const roleList = roles.map((role) => jsString(role.name)).join(', ');

  return `/**
 * GERADO POR @vislow/codegen — NAO EDITE.
 *
 * Este arquivo nasce da arvore que o usuario montou no editor. Qualquer edicao
 * some no proximo build.
 *
 * build: ${buildId}
 * visual: ${spec.project.name}
 */
import type powerbi from 'powerbi-visuals-api';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary, TruncationNotice } from '@vislow/visual-kit';
import { ${nodeImports.join(', ')} } from '@vislow/visual-kit/nodes';
import { Interaction } from './interaction';

// O campo \`style\` do pbiviz.json e ignorado pela toolchain: o CSS entra por
// AQUI. Sem este import o build reporta sucesso e o visual sai sem estilo.
import '@vislow/visual-kit/styles.css';

type IVisual = powerbi.extensibility.visual.IVisual;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

/**
 * Impressao digital do pacote.
 *
 * NAO aparece no caminho de sucesso: o selo do canto foi removido a pedido, para
 * o visual nao carregar um hash sobre o relatorio de quem o usa. Sobra o card de
 * erro de renderizacao e o cabecalho deste arquivo, que viaja no bundle.
 *
 * O custo e de diagnostico: com o visual renderizando normalmente, nao ha como
 * ler da tela QUAL pacote esta ali. Ao investigar comportamento no Desktop,
 * confirme a procedencia do arquivo antes de concluir qualquer coisa — "importou
 * o pacote antigo" e "a correcao nao funcionou" ficaram indistinguiveis.
 */
const BUILD_ID = ${jsString(buildId)};

/** Papeis que a arvore consome. Bate com os declarados no capabilities.json. */
const ROLES = [${roleList}];

function Tree(${withFrame ? '{ frame }: { frame: DataFrame }' : ''}) {
  return (
${indent(emitNode(spec.root), 2)}
  );
}

export class Visual implements IVisual {
  private readonly root: Root;
  /**
   * Servicos do host (selecao, tooltip, alto contraste, menu de contexto).
   * O codigo dela e ESTATICO, vem do template — o que muda por build e so a
   * arvore. Ela re-renderiza sozinha quando a selecao muda, inclusive a que
   * vem de outro visual do relatorio (RF-18).
   */
  private readonly interaction: Interaction;
  private frame: DataFrame = EMPTY_FRAME;

  constructor(options: VisualConstructorOptions) {
    this.root = createRoot(options.element);
    this.interaction = new Interaction(options, () => {
      this.render();
    });
  }

  public update(options: VisualUpdateOptions): void {
    this.frame = this.interaction.readFrame(options, ROLES);
    this.render();
  }

  private render(): void {
    const frame = this.frame;

    // RN-04: o visual NUNCA renderiza em branco. Um try/catch em volta do
    // render nao basta — no modo concorrente a fase de render e assincrona e a
    // excecao acontece fora do bloco. Só o ErrorBoundary captura.
    this.root.render(
      <StrictMode>
        <div className="pbi:relative pbi:w-full pbi:h-full pbi:flex pbi:flex-col">
          <ErrorBoundary buildId={BUILD_ID}>
            <Tree ${withFrame ? 'frame={frame}' : ''}/>
          </ErrorBoundary>
          {/* RF-25: o host trunca em silencio; o visual conta. */}
          {frame.truncated && (
            <TruncationNotice shown={frame.truncated.shown} limit={frame.truncated.limit} />
          )}
        </div>
      </StrictMode>,
    );
  }
}
`;
}
