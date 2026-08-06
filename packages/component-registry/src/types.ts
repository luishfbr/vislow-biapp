import type { TokenKind } from '@vislow/config-schema';

/**
 * Vocabulario do construtor: o que o usuario pode colocar na tela.
 *
 * Discriminante de STRING pelo mesmo motivo de `ValidationResult`: a toolchain
 * do `pbiviz` compila sem `strictNullChecks`, e sem ela o TypeScript nao
 * estreita uniao por discriminante booleano.
 */
export type NodeKind = 'container' | 'text' | 'kpi';

/** Papel de dado no Power BI. `grouping` vira eixo/categoria; `measure`, valor. */
export type RoleKind = 'grouping' | 'measure';

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
  /**
   * Mostra o campo so quando outro campo do MESMO no tem este valor.
   *
   * Existe porque um container que posiciona livremente ignora `direction` e
   * `gap`: deixa-los na tela seria oferecer dois controles que nao fazem nada, e
   * o usuario gira o de espacamento tres vezes antes de concluir que o editor
   * esta quebrado. Vive AQUI, no descritor, e nao numa lista de excecoes no
   * painel — a mesma regra de sempre, senao a proxima condicao nasce na tela e o
   * catalogo deixa de descrever o que a tela mostra.
   */
  showWhen?: { key: string; equals: string };
  /**
   * O CODEGEN le este campo para decidir a FORMA da arvore emitida.
   *
   * Consequencia: ele nao pode ir para o painel de formatacao do visual gerado,
   * porque a escolha ja foi gasta em tempo de geracao. `placement` e o unico
   * hoje — e ele que decide se o codegen embrulha cada filho num `CanvasSlot`
   * (`positionsChildren`). Um override em runtime deixaria filhos absolutos
   * dentro de um pai que empilha: composicao desmontada, sem erro nenhum.
   *
   * Vive AQUI, no descritor, e nao numa lista de excecoes dentro do codegen,
   * pela mesma regra do `showWhen`: a proxima excecao nasceria do outro lado e o
   * catalogo deixaria de descrever o que o pacote faz.
   */
  structural?: true;
  /**
   * Secao a que o campo pertence, nos DOIS paineis.
   *
   * O painel do editor desenha um cabecalho por grupo; o card do visual gerado
   * emite um `FormattingGroup` de verdade por grupo, que e para isso que a API do
   * Power BI tem `groups[]` — ate a spec 5.1.0 emitiamos um so, com
   * `displayName: ''`. Fica AQUI, e nao num mapa dentro de cada painel, pela
   * mesma regra de `keywords` e `shortcut`: duas listas paralelas divergem, e a
   * divergencia so aparece dentro do Power BI.
   *
   * OPCIONAL, e ausente e' o estado de `container` e `text`: campo sem grupo cai
   * num bloco inicial sem titulo, entao os dois nos continuam desenhando
   * exatamente como desenhavam. Passou a existir com o KPI Card, cujos 27 campos
   * viram um paredao sem secao.
   */
  group?: string;
}

/**
 * Uniao discriminada, seguindo o padrao ja usado nos controles do editor: o
 * dado extra so existe — e e obrigatorio — no tipo que o usa. Elimina assercao
 * nao-nula no ponto de uso e faz o compilador garantir o que era convencao.
 */
export type FieldSpec =
  /** Valor de um enum do catalogo de tokens. Herda os valores validos do schema. */
  | (FieldBase & { kind: 'token'; token: TokenKind; default: string })
  | (FieldBase & { kind: 'color'; default: string })
  | (FieldBase & { kind: 'boolean'; default: boolean })
  | (FieldBase & { kind: 'text'; default: string; maxLength: number })
  /**
   * Numero SEM unidade: opacidade em pontos percentuais, espessura de traco,
   * raio interno de uma rosca em % do raio externo.
   *
   * HOJE NENHUM DESCRITOR USA. Fica pelo mesmo motivo que `role`: e a metade
   * viva de uma distincao — `number` contra `length` — que o painel, o schema e
   * o codegen ja sabem tratar, e que volta inteira com os graficos da Fase 4.
   * Apaga-lo custaria mais para reescrever do que custa manter.
   */
  | (FieldBase & { kind: 'number'; default: number; min: number; max: number })
  /**
   * MEDIDA, em pixel inteiro.
   *
   * Distinta de `number` porque tem unidade, e a unidade muda o controle (o
   * campo mostra "px") e o schema (inteiro, nao decimal — meio pixel de
   * espacamento nao e uma escolha, e um engano de digitacao).
   *
   * Distinta de `token` porque e LIVRE: ate a spec 3.0.0 toda medida era um enum
   * de seis degraus, e nao havia como pedir 13px. O valor chega ao visual
   * compilado por `style` inline, como a cor — nunca como classe do Tailwind,
   * que precisa ser literal no fonte (ver `visual-kit/src/tokens.ts`).
   */
  | (FieldBase & { kind: 'length'; default: number; min: number; max: number })
  /**
   * Referencia a um papel de dado que o usuario declarou no projeto.
   *
   * `optional` muda DUAS coisas de uma vez, e por isso e uma so bandeira: o
   * campo nasce com `''` em vez de ausente (`defaultPropsFor`), e o schema aceita
   * a string vazia como "nao ligado". Sem ela o no nasce INVALIDO de proposito —
   * o que e o certo para o papel obrigatorio, porque exportar um KPI sem medida
   * entregaria um pacote que so sabe mostrar o estado vazio (RF-12).
   *
   * Papel vazio nao vira `dataRole`: `usedRoles` filtra `spec.data.columns` pelo
   * nome ligado, e `''` nao casa com coluna nenhuma.
   */
  | (FieldBase & { kind: 'role'; roleKind: RoleKind; optional?: true })
  | (FieldBase & { kind: 'select'; options: string[]; default: string });

export interface NodeDescriptor {
  kind: NodeKind;
  /** Nome exibido na paleta do editor. */
  label: string;
  /** Uma linha explicando quando usar. Aparece na busca e no painel. */
  hint: string;
  /**
   * Termos alternativos que a busca do dialogo de componentes tambem casa.
   *
   * Existem porque o rotulo e uma palavra so: quem procura "donut", "cartao" ou
   * "tempo" nao acha nada casando so `label` e `hint`. Ficam AQUI, e nao no
   * editor, pela mesma regra do resto do catalogo — uma lista de sinonimos em
   * `apps/web` seria a lista paralela que este registro existe para evitar, e a
   * primeira a esquecer o tipo de no seguinte.
   */
  keywords: string[];
  /**
   * A tecla que arma esta ferramenta na barra do editor, em maiuscula.
   *
   * Fica AQUI pela mesma regra dos `keywords`: um mapa de atalhos em `apps/web`
   * seria a lista paralela que este registro existe para evitar, e a primeira a
   * esquecer o tipo de no seguinte — que entraria na barra sem tecla nenhuma, ou
   * pior, roubando a de outro. `registry.test.ts` reprova letra repetida.
   */
  shortcut: string;
  /** Se aceita filhos. So o container aceita — arvore com folhas bem definidas. */
  acceptsChildren: boolean;
  fields: FieldSpec[];
  /**
   * Componente que o codegen importa do `visual-kit`.
   *
   * O visual compilado renderiza EXATAMENTE o mesmo componente que o preview do
   * editor — e o que preserva o ADR-04 depois do pivo para compilacao real. O
   * codegen emite imports nomeados so dos nos usados, entao o bundle nao carrega
   * o catalogo inteiro.
   */
  component: string;
}
