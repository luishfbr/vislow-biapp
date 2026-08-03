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

/**
 * Tamanho da PRANCHETA em que o usuario desenha, em pixels de CSS.
 *
 * NAO vai para o pacote. Um visual do Power BI nao escolhe o proprio tamanho — o
 * autor do relatorio arrasta a moldura, e o `visual.tsx` gerado continua sendo
 * `w-full h-full` dentro do que ele desenhar. Isto e a prancheta do EDITOR: o
 * alvo concreto contra o qual a composicao e julgada.
 *
 * Ela precisa existir porque a geometria e proporcional (ver `NodeRect`) mas a
 * tipografia nao: um texto de 12px ocupa metade de uma caixa de 25% numa
 * prancheta de 640 e um oitavo dela numa de 1920. Sem tamanho declarado, o
 * preview desenha uma proporcao e o usuario adivinha a escala.
 *
 * Fica no `project` e nao no no raiz de proposito. Nao e propriedade de nenhum
 * componente — o codegen despeja `props` como atributo JSX, e `width` viraria
 * atributo do `Container`. E tambem nao entra em `ProjectIdentity`, que e
 * compartilhada com o config plano v1 e tem `additionalProperties: false` no
 * schema dele.
 */
export interface Artboard {
  /** Largura em px. */
  width: number;
  /** Altura em px. */
  height: number;
}

/**
 * Piso da prancheta. Abaixo disso nao ha o que julgar — e e mais estreita que
 * qualquer visual que alguem colocaria num relatorio de verdade.
 */
export const ARTBOARD_MIN: Artboard = { width: 100, height: 100 };

/** Teto da prancheta: Full HD, o maior relatorio que se desenha na pratica. */
export const ARTBOARD_MAX: Artboard = { width: 1920, height: 1080 };

/**
 * Prancheta de quem nao escolheu.
 *
 * 16:9 — a mesma proporcao que o preview ja usava por padrao — num tamanho que
 * cabe na area do editor com pouca reducao. Vale para projeto novo E para
 * projeto salvo antes deste campo existir: o campo e opcional, e `artboardOf` e
 * quem responde por ele.
 */
export const ARTBOARD_DEFAULT: Artboard = { width: 1280, height: 720 };

/**
 * Identidade do projeto MAIS o que so o editor usa.
 *
 * `ProjectIdentity` vive em `config-schema` e alimenta o `pbiviz.json`. A
 * prancheta nao alimenta nada do pacote, entao entra aqui e nao la.
 */
export interface SpecProject extends ProjectIdentity {
  artboard?: Artboard | undefined;
}

export interface VisualSpec {
  schemaVersion: string;
  project: SpecProject;
  dataRoles: DataRole[];
  root: SpecNode;
}

/**
 * A prancheta da spec, com o default de quem nao tem uma.
 *
 * Mesmo motivo do `hostOf(frame)` no kit: um `?? ARTBOARD_DEFAULT` por chamada e
 * uma chance por chamada de esquecer, e o esquecimento aqui desenha a prancheta
 * com `NaN` de largura — moldura de tamanho zero, sem erro nenhum.
 */
export function artboardOf(spec: VisualSpec): Artboard {
  return spec.project.artboard ?? ARTBOARD_DEFAULT;
}

/**
 * Prende um tamanho digitado na faixa valida, em pixel inteiro.
 *
 * Mesma divisao de trabalho do `clampRect`/`validateSpec`: aqui PRENDE, porque
 * quem chama e um campo de formulario e digitar 5000 quer dizer "o maior que
 * der"; o schema REPROVA, porque quem chega por importacao ja deveria ter um
 * valor valido e um numero fora da faixa ali e sinal de arquivo adulterado.
 */
export function clampArtboard(size: Artboard): Artboard {
  // `NaN` cai no default em vez de propagar: um `Math.round(NaN)` atravessa
  // clamp inteiro sem reclamar e sai como largura de moldura — prancheta de
  // tamanho zero, invisivel e sem erro. E o padrao de falha desta casa.
  const fit = (value: number, min: number, max: number, fallback: number): number =>
    Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : fallback;

  return {
    width: fit(size.width, ARTBOARD_MIN.width, ARTBOARD_MAX.width, ARTBOARD_DEFAULT.width),
    height: fit(size.height, ARTBOARD_MIN.height, ARTBOARD_MAX.height, ARTBOARD_DEFAULT.height),
  };
}

/** Padrao do nome de papel: identificador valido para o capabilities.json. */
export const ROLE_NAME_PATTERN = '^[a-z][A-Za-z0-9]{1,29}$';

/** Padrao do id de no. */
export const NODE_ID_PATTERN = '^[A-Za-z0-9_-]{1,40}$';
