import type { CellValue, ColumnType, ProjectIdentity } from '@vislow/config-schema';
import type { NodeKind, RoleKind } from './types.js';

/**
 * Versao do formato da arvore.
 *
 * MINOR NA 5.4.0: o tipo de no `gauge` (Medidor de Meta) e ADITIVO, pela mesma
 * razao da 5.3.0 — nenhum campo saiu, nenhum mudou de tipo, e toda spec 5.3.0
 * salva continua valida e continua gerando exatamente o mesmo pacote. O medidor
 * declara so MEDIDA, entao uma arvore sem ele nao muda nem o `capabilities.json`
 * nem a chave do `localStorage`.
 *
 * A coluna `meta` que o `DEFAULT_TABLE` ganhou junto nao e migracao: vale para
 * projeto NOVO, e projeto ja salvo continua com a tabela que tinha.
 *
 * MINOR NA 5.3.0: o tipo de no `ranking` e ADITIVO. Nenhum campo saiu, nenhum
 * mudou de tipo, e toda spec 5.2.0 salva continua valida e continua gerando
 * exatamente o mesmo pacote — uma arvore sem nenhum `ranking` nao declara papel
 * de agrupamento, entao o `capabilities.json` dela nao muda em nada. Pela mesma
 * razao da 5.1.0, a chave do `localStorage` NAO muda: nao ha o que descartar.
 *
 * MINOR NA 5.1.0, e minor de verdade: `name` e `exposed` sao ADITIVOS e
 * opcionais no no (RN-12). Spec 5.0.0 salva no navegador continua valida e
 * continua gerando o MESMO pacote — sem `exposed`, nao ha painel de formatacao,
 * nao ha `objects` no capabilities e o JSX sai so com literais. Por isso a chave
 * do `localStorage` NAO muda: nao ha nada para descartar.
 *
 * MAJOR NA 5.0.0 porque houve REMOCAO: os tipos `kpi`, `barChart`,
 * `lineChart`, `areaChart` e `pieChart` sairam do catalogo (RN-12 exige major
 * para remocao de schema). Uma spec 4.0.0 que contenha qualquer um deles nao
 * valida mais.
 *
 * E NAO HA MIGRACAO 4->5, por decisao explicita. A cadeia inteira de migracao
 * (`migrate.ts`, v1->v3->v4) foi apagada junto, porque sem o ultimo salto ela
 * produziria specs 4.0.0 que o validador garantidamente reprova — codigo vivo
 * gerando saida invalida e o pior dos dois mundos. Em vez disso, `persistence.ts`
 * mudou de CHAVE: o projeto antigo continua no navegador e nunca mais e lido.
 * Nada e descartado em silencio porque nada e sequer tentado.
 */
export const SPEC_VERSION = '5.4.0';

/**
 * Uma coluna da tabela de exemplo — que e, ao mesmo tempo, um CAMPO do visual.
 *
 * As duas coisas sao a mesma entidade vista de dois lados, e e de proposito que
 * nao existam duas listas. Do lado do editor, a coluna tem tipo e valores, e e
 * contra eles que o usuario compoe. Do lado do Power BI, ela vira um `dataRole`
 * no `capabilities.json` gerado: um encaixe no painel de campos, com o nome que
 * o usuario deu e o tipo que ele declarou.
 *
 * E isto que faz "comecar do zero" ser real: com compilacao por usuario, o
 * `capabilities.json` e gerado por visual, entao o usuario decide quais campos o
 * visual dele vai pedir — em vez de herdar as roles fixas de um runtime
 * pre-compilado.
 *
 * O codigo continua dizendo *role* onde o assunto e o encaixe no host
 * (`unbindRole`, `roleFieldsOf`, `ROLE_NAME_PATTERN`) porque esse e o nome do
 * conceito la; *column* e o nome deste lado. `column.name === role.name`.
 */
export interface DataColumn {
  /** Vira o `name` no capabilities.json. Precisa ser identificador estavel. */
  name: string;
  /** Rotulo que o usuario ve no painel de campos do Power BI. */
  displayName: string;
  kind: RoleKind;
  /**
   * Decide a formatacao no preview, o `kind` default (`KIND_FOR_TYPE`) e o
   * `requiredTypes` do capabilities — pelo qual o Power BI RECUSA arrastar uma
   * coluna de texto para um campo que o visual declarou numerico.
   */
  type: ColumnType;
}

/**
 * A tabela de exemplo do projeto.
 *
 * As LINHAS sao do editor e nao chegam ao pacote — mesma regra da prancheta, e
 * pelo mesmo motivo: um visual do Power BI mostra o modelo de quem o usa, e um
 * pacote que carregasse dado embutido mentiria sobre o que esta na tela. Um
 * teste do codegen reprova o build se um valor daqui vazar para o fonte gerado.
 *
 * As COLUNAS, ao contrario, sao metade do contrato do pacote: cada uma que
 * algum no consome vira campo declarado no `capabilities.json`.
 */
export interface SampleTable {
  columns: DataColumn[];
  /**
   * Linhas alinhadas a `columns` por INDICE — `rows[linha][coluna]`.
   *
   * Por indice e nao por nome porque a grade da tela e por posicao: a celula
   * que o usuario edita e `[linha][coluna]`, e um objeto por linha exigiria
   * reconciliar chave e ordem a cada render. O preco e que apagar uma coluna
   * tem de remover a celula de toda linha — feito num lugar so, em
   * `removeColumn`, e cobrado por `validateSpec`, que reprova linha de
   * comprimento diferente do numero de colunas.
   */
  rows: CellValue[][];
}

/**
 * Papel default de uma coluna, pelo tipo dela.
 *
 * E so o DEFAULT: quem decide e o usuario. Um "Ano" e inteiro e agrupa; um
 * "Codigo da loja" tambem. Sem a troca manual, os dois virariam soma no
 * grafico, que e exatamente o erro que o tipo deveria evitar.
 */
export const KIND_FOR_TYPE: Record<ColumnType, RoleKind> = {
  text: 'grouping',
  date: 'grouping',
  boolean: 'grouping',
  integer: 'measure',
  decimal: 'measure',
  percent: 'measure',
  currency: 'measure',
};

/**
 * Limites do nome do projeto.
 *
 * Estao aqui, e nao em literal dentro do `specSchema`, porque tem DOIS
 * consumidores: o JSON Schema, que reprova a spec, e o formulario do editor, que
 * precisa dizer ao usuario o que falta antes de ele chegar no export. Os numeros
 * escritos duas vezes seriam a lista paralela de sempre — divergiriam no dia em
 * que alguem afrouxasse um lado.
 */
export const PROJECT_NAME_MIN_LENGTH = 3;
export const PROJECT_NAME_MAX_LENGTH = 50;

/** Teto de colunas. Era o `maxItems` de `dataRoles` e continua valendo. */
export const MAX_COLUMNS = 10;

/**
 * Teto de linhas.
 *
 * Dado de EXEMPLO: serve para julgar o layout, nao para analisar nada. Cinquenta
 * linhas ja expoem rotulo longo, valor zero e eixo apertado, e o projeto inteiro
 * continua cabendo no `localStorage` com folga.
 */
export const MAX_ROWS = 50;

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

/**
 * Teto do apelido do no. O mesmo do nome do projeto: e um titulo de card no
 * painel do Power BI, que trunca bem antes disso.
 */
export const NODE_NAME_MAX_LENGTH = 50;

export interface SpecNode {
  /**
   * Unico dentro da arvore. Chave de React, alvo de selecao no editor E
   * `objectName` do `capabilities.json` quando o no publica algum campo — e por
   * ele que o valor escolhido pelo consumidor volta ao visual. Um id que mudasse
   * orfanaria em silencio o que ja esta gravado no relatorio; ele nasce em
   * `nextNodeId` e nunca muda.
   */
  id: string;
  kind: NodeKind;
  /** Valores dos campos do descritor. Validado contra o schema gerado. */
  props: Record<string, unknown>;
  /**
   * Apelido do no. Vira o TITULO do card no painel de formatacao do visual
   * gerado — o unico texto pelo qual o consumidor do relatorio identifica qual
   * componente ele esta ajustando.
   *
   * Opcional, e o editor o preenche sozinho ao publicar o primeiro campo (ver
   * `suggestNodeName`). Ausente, o codegen cai no rotulo do descritor: um card
   * chamado "Texto" e ruim, um card sem titulo nenhum e pior.
   */
  name?: string;
  /**
   * Chaves de campo que o autor PUBLICOU no painel do visual gerado.
   *
   * FECHADO POR PADRAO: ausente ou vazio quer dizer painel vazio. O inverso —
   * guardar o que esta travado — daria de graca "ausente = tudo destravado", e
   * com ele todo projeto ja salvo passaria a entregar cada cor e cada pixel ao
   * consumidor no proximo export, sem ninguem ter pedido. Fechado por padrao
   * tambem torna verificavel a propriedade que sustenta o resto: projeto que
   * ignora o Sprint B gera o pacote de antes, byte a byte.
   *
   * Chave publicada tem de existir no descritor e ser publicavel
   * (`isExposable`) — `validateSpec` reprova o resto.
   */
  exposed?: string[];
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
  data: SampleTable;
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

/**
 * O mesmo, mais a string vazia: campo de papel OPCIONAL nao ligado.
 *
 * Alternancia de dois ramos ANCORADOS, e nao um `anyOf` no schema: o Ajv reporta
 * um erro so por padrao que falha, e `anyOf` reportaria um por ramo — a mesma
 * razao pela qual `$defs.node` usa `if`/`then` em vez de `oneOf`.
 */
export const OPTIONAL_ROLE_NAME_PATTERN = `^$|${ROLE_NAME_PATTERN}`;

/** Padrao do id de no. */
export const NODE_ID_PATTERN = '^[A-Za-z0-9_-]{1,40}$';
