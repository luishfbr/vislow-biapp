import {
  NODE_DESCRIPTORS,
  consumesData,
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

  const body = children.map((child) => indent(emitNode(child), 1)).join('\n');
  return `${open}\n${attrs}\n>\n${body}\n</${descriptor.component}>`;
}

/** Componentes usados na arvore, em ordem alfabetica (import deterministico). */
function usedComponents(spec: VisualSpec): string[] {
  const names = new Set<string>();
  const visit = (node: SpecNode): void => {
    names.add(NODE_DESCRIPTORS[node.kind].component);
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

  // `DataFrame` so entra no import quando a arvore usa dados. Sem isso um visual
  // so de texto carregaria um import de tipo sem uso — inofensivo, mas o fonte
  // gerado e lido por gente quando um build falha.
  const nodeImports = withFrame ? [...components, 'type DataFrame'] : components;

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
import { BuildStamp, ErrorBoundary } from '@vislow/visual-kit';
import { ${nodeImports.join(', ')} } from '@vislow/visual-kit/nodes';
import { readDataFrame } from './dataFrame';

// O campo \`style\` do pbiviz.json e ignorado pela toolchain: o CSS entra por
// AQUI. Sem este import o build reporta sucesso e o visual sai sem estilo.
import '@vislow/visual-kit/styles.css';

type IVisual = powerbi.extensibility.visual.IVisual;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

/** Impressao digital do pacote. Aparece no canto do visual e no card de erro. */
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
  /** Guardado pelo \`locale\`: e o host que sabe a cultura do relatorio (RF-17). */
  private readonly host: powerbi.extensibility.visual.IVisualHost;

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.root = createRoot(options.element);
  }

  public update(options: VisualUpdateOptions): void {
    const frame = readDataFrame(options, ROLES, this.host.locale);

    // RN-04: o visual NUNCA renderiza em branco. Um try/catch em volta do
    // render nao basta — no modo concorrente a fase de render e assincrona e a
    // excecao acontece fora do bloco. Só o ErrorBoundary captura.
    this.root.render(
      <StrictMode>
        <div className="pbi:relative pbi:w-full pbi:h-full pbi:flex pbi:flex-col">
          <ErrorBoundary buildId={BUILD_ID}>
            <Tree ${withFrame ? 'frame={frame}' : ''}/>
          </ErrorBoundary>
          <BuildStamp id={BUILD_ID} />
        </div>
      </StrictMode>,
    );
  }
}
`;
}
