import type { ProjectIdentity } from '@vislow/config-schema';
import type { NodeKind, RoleKind } from './types.js';

/** Versao do formato da arvore. Distinta do `schemaVersion` do config plano v1. */
export const SPEC_VERSION = '2.0.0';

/**
 * Papel de dado declarado PELO USUARIO.
 *
 * E isto que faz "comecar do zero" ser real: com compilacao por usuario, o
 * `capabilities.json` e gerado por visual, entao o usuario decide quais campos o
 * visual dele vai pedir no Power BI — em vez de herdar as roles fixas de um
 * runtime pre-compilado.
 */
export interface DataRole {
  /** Vira o `name` no capabilities.json. Precisa ser identificador estavel. */
  name: string;
  /** Rotulo que o usuario ve no painel de campos do Power BI. */
  displayName: string;
  kind: RoleKind;
}

/**
 * Onde um no fica dentro do pai. Percentual do pai, 0 a 100.
 *
 * PROPORCIONAL, e nao pixel, porque um visual do Power BI nao tem tamanho: o
 * autor do relatorio arrasta a moldura para o que quiser, e a mesma composicao
 * precisa valer com 400 ou com 1600 de largura. Coordenada em pixel exigiria uma
 * prancheta fixa com `transform: scale()`, que entrega texto de 8px numa moldura
 * estreita e borrado numa larga.
 *
 * Fica FORA de `props` de proposito. `props` e espelho 1:1 dos campos do
 * descritor, e o codegen despeja cada chave como atributo JSX do componente —
 * mas geometria nao e propriedade do componente, e relacao com o pai. Dentro de
 * `props`, os sete descritores ganhariam quatro campos, o painel ofereceria
 * x/y/w/h a um no cujo pai empilha, e o codegen mandaria `x=` para o
 * `BarChartNode`.
 */
export interface NodeRect {
  /** Borda esquerda, em % da largura do pai. */
  x: number;
  /** Borda superior, em % da altura do pai. */
  y: number;
  /** Largura, em % da largura do pai. */
  w: number;
  /** Altura, em % da altura do pai. */
  h: number;
}

/**
 * Piso de largura e de altura, em %.
 *
 * Sem ele da para arrastar uma alca ate o tamanho zero e perder o no de vista —
 * e um no invisivel continua na arvore, continua no pacote entregue e nao ha
 * onde clicar para traze-lo de volta.
 */
export const RECT_MIN_SIZE = 2;

export interface SpecNode {
  /** Unico dentro da arvore. Chave de React e alvo de selecao no editor. */
  id: string;
  kind: NodeKind;
  /** Valores dos campos do descritor. Validado contra o schema gerado. */
  props: Record<string, unknown>;
  /**
   * Geometria dentro do pai. So tem efeito quando o PAI posiciona livremente;
   * num pai que empilha, quem manda no tamanho e a cadeia de flex.
   */
  rect?: NodeRect;
  /** Presente apenas em nos com `acceptsChildren`. */
  children?: SpecNode[];
}

export interface VisualSpec {
  schemaVersion: string;
  project: ProjectIdentity;
  dataRoles: DataRole[];
  root: SpecNode;
}

/** Padrao do nome de papel: identificador valido para o capabilities.json. */
export const ROLE_NAME_PATTERN = '^[a-z][A-Za-z0-9]{1,29}$';

/** Padrao do id de no. */
export const NODE_ID_PATTERN = '^[A-Za-z0-9_-]{1,40}$';
