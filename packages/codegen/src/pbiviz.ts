import type { VisualSpec } from '@vislow/component-registry';
import { slugify } from '@vislow/config-schema';

/**
 * `pbiviz.json` gerado — a identidade do visual.
 *
 * O grande ganho do ADR-08: a identidade agora nasce CERTA, declarada antes da
 * compilacao, em vez de ser reescrita a mao dentro de um bundle minificado
 * depois (ADR-03). Os achados 34, 35 e 36 — sufixo hex duplicado, ordem de
 * injecao, alternacao de regex — deixam de existir porque a reescrita deixa de
 * existir.
 *
 * O GUID continua sendo NOME DE VARIAVEL JS no `visualPlugin.ts` que a
 * toolchain gera, e nao um UUID: precisa casar `^[A-Za-z][A-Za-z0-9]*$`. O
 * `project.id` ja e produzido nesse formato por `createProjectId`.
 */

/** Precisa bater com o `powerbi-visuals-api` instalado no template. */
export const API_VERSION = '5.11.1';

export interface PbivizManifest {
  visual: {
    name: string;
    displayName: string;
    guid: string;
    visualClassName: string;
    version: string;
    description: string;
    supportUrl: string;
    gitHubUrl: string;
  };
  apiVersion: string;
  author: { name: string; email: string };
  assets: { icon: string };
  externalJS: null;
  style: string;
  capabilities: string;
  dependencies: null;
  stringResources: unknown[];
  version: string;
}

const SUPPORT_URL = 'https://github.com/luishfbr/vislow-biapp';

export function generatePbiviz(spec: VisualSpec): PbivizManifest {
  return {
    visual: {
      // `name` e o identificador interno; `displayName` e o que o usuario ve na
      // lista de visuais — e o unico que aceita acento e emoji.
      name: slugify(spec.project.name),
      displayName: spec.project.name,
      guid: spec.project.id,
      visualClassName: 'Visual',
      version: spec.project.packageVersion,
      description: `Visual gerado no Vislow: ${spec.project.name}`,
      supportUrl: SUPPORT_URL,
      gitHubUrl: SUPPORT_URL,
    },
    apiVersion: API_VERSION,
    author: { name: 'Vislow', email: 'contato@vislow.app' },
    assets: { icon: 'assets/icon.png' },
    externalJS: null,
    // O `style` do pbiviz.json e IGNORADO pela toolchain (achado do spike). O
    // CSS entra de verdade pelo `import` no visual.tsx. Declarado aqui so
    // porque a toolchain recusa o manifesto sem o campo.
    style: 'style/visual.less',
    capabilities: 'capabilities.json',
    dependencies: null,
    stringResources: [],
    version: spec.project.packageVersion,
  };
}
