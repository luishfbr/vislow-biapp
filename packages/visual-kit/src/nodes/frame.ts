/**
 * Contrato de dados dos nos do construtor.
 *
 * Depois do pivo para compilacao por usuario (ADR-08) os papeis de dado deixam
 * de ser fixos: cada visual declara os seus no `capabilities.json` gerado. O
 * componente, portanto, nao pode mais receber `DataPoint[]` pronto — ele recebe
 * o quadro inteiro e diz de quais papeis precisa, pelo nome que o USUARIO deu.
 *
 * Este e o mesmo contrato dos dois lados do ADR-04: o visual compilado monta o
 * `DataFrame` a partir do `DataView` do Power BI, o preview do editor monta a
 * partir de dados mock. Mesmo componente, mesma entrada.
 */
import type { HighContrastPalette } from '../types.js';

export type { HighContrastPalette };

export interface RoleColumn {
  /** Nome do campo que o usuario arrastou no relatorio. Vai para eixos e legenda. */
  title: string;
  /** Valores brutos, na ordem das linhas. */
  values: (string | number | null)[];
  /**
   * Valores ja formatados pelo host (locale + format da medida, RF-17).
   * Indice paralelo a `values`.
   */
  formatted: string[];
}

/** Ponto na tela, em coordenadas de cliente. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * O que o HOST oferece e o quadro nao: selecao, tooltip nativo e a paleta de
 * alto contraste (RF-18, RF-19, RF-21).
 *
 * Chega pelo QUADRO, e nao por prop de cada no, de proposito. Uma prop por
 * capacidade obrigaria a inventar um campo em cada descritor do registro para
 * algo que o usuario nunca configura, e o codegen teria de emitir seis
 * atributos por no. O quadro ja atravessa a arvore inteira; carregar os
 * servicos junto nao custa nada e nao introduz hook (achado 39).
 *
 * `kind` e STRING, nao booleano: a toolchain do `pbiviz` compila sem
 * `strictNullChecks` e o TypeScript nao estreita uniao por discriminante
 * booleano (erro 30 do Anexo A).
 */
export interface FrameHost {
  /**
   * `inert` e o host do preview do editor: nao ha relatorio para filtrar nem
   * servico de tooltip. Os nos consultam para decidir o que desenhar — o
   * preview mantem o balao do Recharts, o visual compilado usa o nativo.
   */
  kind: 'host' | 'inert';

  /**
   * RF-18 — filtra o relatorio pela linha `index` do papel de agrupamento
   * `role`. `multi` vem de Ctrl/Cmd, como nos visuais nativos.
   */
  select(role: string, index: number, multi: boolean): void;

  /** A linha esta na selecao ativa? Vale para selecao vinda de OUTROS visuais. */
  isSelected(role: string, index: number): boolean;

  /** Ha selecao ativa em qualquer visual? E o que liga o esmaecimento. */
  hasSelection: boolean;

  /**
   * RF-19 — tooltip NATIVO do host. `roles` vira as linhas do balao, na ordem
   * pedida; o host resolve titulo e valor formatado de cada uma.
   */
  showTooltip(roles: readonly string[], index: number, at: ScreenPoint): void;
  hideTooltip(): void;

  /**
   * RF-21 — presente so quando o host esta em alto contraste. Os nos de HTML
   * nao precisam ler daqui (usam as variaveis de `highContrast.ts`); os
   * graficos precisam, porque `var()` nao funciona em atributo de SVG.
   */
  highContrast?: HighContrastPalette | undefined;
}

/** RF-25 — o `dataReductionAlgorithm` do host cortou o conjunto. */
export interface Truncation {
  shown: number;
  limit: number;
}

export interface DataFrame {
  /**
   * Coluna por nome de papel. Um papel declarado mas NAO preenchido no relatorio
   * fica ausente — e o que dispara o estado vazio da RN-04 em vez de tela branca.
   */
  roles: Record<string, RoleColumn | undefined>;
  /** Locale do host. Usado para formatar agregados que o host nao formatou. */
  locale: string;
  /** Ausente no preview do editor. Use `hostOf`, nunca leia direto. */
  host?: FrameHost | undefined;
  /** Presente so quando o host truncou. Ausente = conjunto inteiro. */
  truncated?: Truncation | undefined;
}

export interface SeriesPoint {
  category: string;
  value: number;
  /** Formatado pelo host. Vai para o tooltip e para os rotulos. */
  formatted: string;
  /** Linha de origem no quadro. E por ela que o host resolve o selection id. */
  index: number;
  /** Na selecao ativa do relatorio (RF-18). Sempre `false` no preview. */
  selected: boolean;
}

/**
 * Host de mentira: tudo desligado.
 *
 * Existe para que nenhum no precise escrever `frame.host?.select?.(...)`. Um
 * encadeamento opcional por chamada e uma chance por chamada de esquecer o
 * `?.` — e o esquecimento so aparece no preview, que e onde o host falta.
 */
export const INERT_HOST: FrameHost = {
  kind: 'inert',
  select: () => undefined,
  isSelected: () => false,
  hasSelection: false,
  showTooltip: () => undefined,
  hideTooltip: () => undefined,
};

/** Sempre um host. Ponto unico onde a ausencia vira comportamento inerte. */
export function hostOf(frame: DataFrame): FrameHost {
  return frame.host ?? INERT_HOST;
}

/** Quadro vazio. Usado antes do primeiro `update` e nos testes. */
export const EMPTY_FRAME: DataFrame = { roles: {}, locale: 'pt-BR' };

/**
 * Une categoria e medida numa serie.
 *
 * Devolve `null` — e nao uma serie vazia — quando um dos papeis nao esta
 * preenchido, porque os dois casos pedem telas diferentes: papel faltando e
 * estado vazio com instrucao (RF-20); serie vazia e um filtro que nao retornou
 * linhas. Confundir os dois faz o visual acusar campo faltando quando o usuario
 * so filtrou demais.
 *
 * O `selected` de cada ponto sai do host, aqui e nao no componente: sao cinco
 * tipos de grafico e cada um que perguntasse por conta propria seria um lugar a
 * mais para esquecer da selecao vinda de outro visual.
 */
export function seriesOf(
  frame: DataFrame,
  categoryRole: string,
  measureRole: string,
): SeriesPoint[] | null {
  const categories = frame.roles[categoryRole];
  const measures = frame.roles[measureRole];
  if (!categories || !measures) return null;

  const host = hostOf(frame);
  return categories.values.map((raw, index) => ({
    category: String(raw ?? ''),
    value: Number(measures.values[index]) || 0,
    formatted: measures.formatted[index] ?? '',
    index,
    selected: host.isSelected(categoryRole, index),
  }));
}

/** Papeis referenciados que faltam no quadro, na ordem em que foram pedidos. */
export function missingRoles(frame: DataFrame, ...roles: string[]): string[] {
  return roles.filter((role) => !frame.roles[role]);
}

/**
 * Soma da medida. E a agregacao do KPI.
 *
 * Formatar o total pelo `formatted` do host nao da: o host formata cada linha,
 * nao o agregado. Cair no `Intl` com o locale do host e o mais proximo — o
 * numero fica com o separador certo mesmo sem herdar o formato da medida.
 */
export function sumOf(frame: DataFrame, measureRole: string): { total: number; formatted: string } | null {
  const column = frame.roles[measureRole];
  if (!column) return null;

  const total = column.values.reduce<number>((acc, raw) => acc + (Number(raw) || 0), 0);
  // Uma linha so: o host ja formatou esse valor exato, entao vale mais que o
  // nosso Intl — preserva moeda, percentual e casas decimais da medida.
  if (column.values.length === 1) {
    return { total, formatted: column.formatted[0] ?? String(total) };
  }
  return {
    total,
    formatted: new Intl.NumberFormat(frame.locale, { maximumFractionDigits: 2 }).format(total),
  };
}
