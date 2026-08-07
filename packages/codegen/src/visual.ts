import {
  NODE_DESCRIPTORS,
  consumesData,
  positionsChildren,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { exposedNodes, isExposedKey, type ExposedNode } from './exposure.js';
import { indent, jsData, jsScalar, jsString, jsxValue } from './literal.js';
import { usedRoles } from './roles.js';

/** A regra vem do REGISTRO, nao daqui: o preview decide a mesma coisa com a mesma funcao. */
function needsFrame(node: SpecNode): boolean {
  return consumesData(node.kind);
}

function emitNode(node: SpecNode): string {
  const descriptor = NODE_DESCRIPTORS[node.kind];
  const attributes: string[] = [];

  if (needsFrame(node)) attributes.push('frame={frame}');

  for (const field of descriptor.fields) {
    const authored = node.props[field.key];

    if (!isExposedKey(node, field.key)) {
      attributes.push(`${field.key}=${jsxValue(authored)}`);
      continue;
    }

    const call = `pick(overrides, ${jsString(node.id)}, ${jsString(field.key)}, ${jsScalar(authored)})`;
    attributes.push(`${field.key}={${call}}`);
  }

  const open = `<${descriptor.component}`;
  const attrs = attributes.map((attr) => indent(attr, 1)).join('\n');
  const children = node.children ?? [];

  if (children.length === 0) {
    return `${open}\n${attrs}\n/>`;
  }

  const free = positionsChildren(node);
  const body = children
    .map((child) => indent(free ? emitSlot(child) : emitNode(child), 1))
    .join('\n');
  return `${open}\n${attrs}\n>\n${body}\n</${descriptor.component}>`;
}

/** A caixa e obrigatoria: `validateSpec` reprova antes, e um default aqui seria a segunda regra. */
function emitSlot(node: SpecNode): string {
  const rect = node.rect;
  if (!rect) throw new Error(`no "${node.id}" e filho de um canvas e nao tem caixa`);

  const attrs = (['x', 'y', 'w', 'h'] as const)
    .map((axis) => indent(`${axis}={${String(rect[axis])}}`, 1))
    .join('\n');

  return `<CanvasSlot\n${attrs}\n>\n${indent(emitNode(node), 1)}\n</CanvasSlot>`;
}

function usedComponents(spec: VisualSpec): string[] {
  const names = new Set<string>();
  const visit = (node: SpecNode): void => {
    names.add(NODE_DESCRIPTORS[node.kind].component);
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

function formattingTable(nodes: ExposedNode[]): unknown[] {
  return nodes.map((node) => ({
    id: node.id,
    title: node.title,
    values: {
      ...Object.fromEntries(node.fields.map((field) => [field.key, field.value])),
      ...node.governors,
    },
    fields: node.fields.map((field) => {
      const out: Record<string, unknown> = {
        key: field.key,
        label: field.label,
        kind: field.kind,
      };
      if (field.min !== undefined) out.min = field.min;
      if (field.max !== undefined) out.max = field.max;
      if (field.maxLength !== undefined) out.maxLength = field.maxLength;
      if (field.options) out.options = field.options;
      if (field.showWhen) out.showWhen = field.showWhen;
      if (field.group !== undefined) out.group = field.group;
      return out;
    }),
  }));
}

export function generateVisualSource(spec: VisualSpec, buildId: string): string {
  const components = usedComponents(spec);
  const roles = usedRoles(spec);
  const withFrame = treeUsesFrame(spec);
  const exposed = exposedNodes(spec);
  // Nada publicado, nada disto existe — o pacote sai igual ao de antes da spec 5.1.0, byte a byte.
  const withFormatting = exposed.length > 0;

  const nodeImports = [...components, 'EMPTY_FRAME', 'type DataFrame'];

  const roleList = roles.map((role) => jsString(role.name)).join(', ');

  const treeNames: string[] = [];
  const treeTypes: string[] = [];
  const treeArgs: string[] = [];
  if (withFrame) {
    treeNames.push('frame');
    treeTypes.push('frame: DataFrame');
    treeArgs.push('frame={frame}');
  }
  if (withFormatting) {
    treeNames.push('overrides');
    treeTypes.push('overrides: Overrides');
    treeArgs.push('overrides={overrides}');
  }
  const treeSignature =
    treeNames.length === 0 ? '' : `{ ${treeNames.join(', ')} }: { ${treeTypes.join('; ')} }`;
  const treeCall = treeArgs.length === 0 ? '' : `${treeArgs.join(' ')} `;

  const formattingImport = withFormatting
    ? `import {
  buildFormattingModel,
  pick,
  readOverrides,
  type FormattingSpec,
  type Overrides,
} from './formatting';
`
    : '';

  const formattingTableSource = withFormatting
    ? `
const FORMATTING: FormattingSpec = ${jsData(formattingTable(exposed))};
`
    : '';

  const overridesField = withFormatting
    ? `  /** O que o consumidor do relatorio escolheu, ja validado. */
  private overrides: Overrides = {};
`
    : '';

  const overridesRead = withFormatting
    ? `    this.overrides = readOverrides(options, FORMATTING);
`
    : '';

  const overridesLocal = withFormatting ? `    const overrides = this.overrides;\n` : '';

  const formattingModel = withFormatting
    ? `
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    return buildFormattingModel(FORMATTING, this.overrides);
  }
`
    : '';

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
import { ErrorBoundary, TruncationNotice, VisualRoot } from '@vislow/visual-kit';
import { ${nodeImports.join(', ')} } from '@vislow/visual-kit/nodes';
import { Interaction } from './interaction';
${formattingImport}
import '@vislow/visual-kit/styles.css';

type IVisual = powerbi.extensibility.visual.IVisual;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

// Nao aparece no caminho de sucesso: so no card de erro. Ver docs/build-visual.md.
const BUILD_ID = ${jsString(buildId)};

const ROLES = [${roleList}];
${formattingTableSource}
function Tree(${treeSignature}) {
  return (
${indent(emitNode(spec.root), 2)}
  );
}

export class Visual implements IVisual {
  private readonly root: Root;
  private readonly interaction: Interaction;
  private frame: DataFrame = EMPTY_FRAME;
${overridesField}
  constructor(options: VisualConstructorOptions) {
    this.root = createRoot(options.element);
    this.interaction = new Interaction(options, () => {
      this.render();
    });
  }

  public update(options: VisualUpdateOptions): void {
    this.frame = this.interaction.readFrame(options, ROLES);
${overridesRead}    this.render();
  }
${formattingModel}
  private render(): void {
    const frame = this.frame;
${overridesLocal}
    this.root.render(
      <StrictMode>
        <VisualRoot>
          <ErrorBoundary buildId={BUILD_ID}>
            <Tree ${treeCall}/>
          </ErrorBoundary>
          {/* RF-25: o host trunca em silencio; o visual conta. */}
          {frame.truncated && (
            <TruncationNotice shown={frame.truncated.shown} limit={frame.truncated.limit} />
          )}
        </VisualRoot>
      </StrictMode>,
    );
  }
}
`;
}
