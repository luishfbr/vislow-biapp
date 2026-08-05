/**
 * Migracao dos formatos antigos para a spec atual.
 *
 * Existe porque projetos antigos estao salvos no `localStorage` de quem ja usou
 * o editor, e exportados como `.vislow.json` na maquina dele. Descartar seria
 * perder o `project.id` — e com ele a capacidade de *atualizar* o visual no
 * Power BI em vez de duplicar (RF-10). A identidade e a parte insubstituivel; o
 * resto e aparencia.
 *
 * Tres saltos hoje:
 *   v1 -> config plano do editor pre-ADR-08;
 *   v2 -> arvore com `dataRoles`, antes de a tabela de exemplo existir;
 *   v3 -> medidas como TOKEN (`padding: 'md'`), antes de virarem pixel livre.
 *
 * ATENCAO: `loadProject` DESCARTA em silencio a spec que nao valida. Uma
 * migracao errada aqui nao da erro na tela — ela apaga o projeto do usuario. E
 * por isso que `migrate.test.ts` congela fixtures reais em vez de construi-las
 * com as funcoes de hoje, que evoluem junto com o codigo e esconderiam a quebra.
 */
import type { CellValue, VisualConfig } from '@vislow/config-schema';
import { createNode, DEFAULT_TABLE } from './factory.js';
import { NODE_DESCRIPTORS } from './registry.js';
import {
  KIND_FOR_TYPE,
  SPEC_VERSION,
  type DataColumn,
  type SampleTable,
  type SpecNode,
  type VisualSpec,
} from './spec.js';
import type { NodeKind, RoleKind } from './types.js';

/**
 * A versao que as migracoes ANTERIORES a ultima produzem.
 *
 * `migrateV2ToV3` nao pode carimbar `SPEC_VERSION`: o que ela devolve tem
 * medidas em token, e portanto ainda nao e a spec atual. Carimbar a versao de
 * destino ali faria a saida MENTIR sobre o proprio formato — e o encadeador,
 * que confere a forma e nao o numero, migraria certo enquanto o arquivo
 * gravado dissesse outra coisa.
 */
const V3_VERSION = '3.0.0';

/**
 * ============================ TOKEN -> PIXEL (v3 -> v4) ======================
 *
 * Os numeros NAO sao escolhidos agora: sao os pixels que cada classe do Tailwind
 * ja produzia no visual compilado. Migrar tem de deixar a composicao do usuario
 * IDENTICA na tela — se `md` virasse 12 em vez de 16, todo projeto salvo mudaria
 * de aparencia no dia em que ele abrisse o editor, e ele leria isso como o
 * produto tendo estragado o trabalho dele.
 *
 * Os mapas ficam AQUI, e nao no `visual-kit`, porque descrevem um formato que
 * nao existe mais. Deixa-los junto do codigo vivo convidaria alguem a "atualizar
 * o valor de `md`" — e o valor de `md` e historia, nao decisao.
 * =============================================================================
 */
const SPACING_PX: Record<string, number> = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const RADIUS_PX: Record<string, number> = {
  none: 0,
  sm: 2,
  md: 6,
  lg: 8,
  xl: 12,
  // `rounded-full` era 9999px — a receita de "pilula". Em pixel o teto do campo
  // e 200, e 200 arredonda por completo qualquer caixa plausivel.
  full: 200,
};

const BORDER_PX: Record<string, number> = {
  none: 0,
  thin: 1,
  medium: 2,
};

const FONT_SIZE_PX: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '4xl': 36,
};

/**
 * Onde cada token vira pixel, por chave de prop.
 *
 * `border` sai e `borderWidth` entra: o campo virou medida, e o nome antigo se
 * leria como um enum cujo segundo valor foi escolhido.
 */
const LENGTH_MIGRATIONS: { from: string; to: string; table: Record<string, number> }[] = [
  { from: 'padding', to: 'padding', table: SPACING_PX },
  { from: 'gap', to: 'gap', table: SPACING_PX },
  { from: 'radius', to: 'radius', table: RADIUS_PX },
  { from: 'border', to: 'borderWidth', table: BORDER_PX },
  { from: 'fontSize', to: 'fontSize', table: FONT_SIZE_PX },
  { from: 'valueFontSize', to: 'valueFontSize', table: FONT_SIZE_PX },
];

/**
 * Reconhece a v3 pela FORMA: alguma medida ainda e string.
 *
 * Mesma regra do `isV2Spec` — a versao escrita no arquivo e justamente o campo
 * que um arquivo editado a mao tem mais chance de trazer errado. E o teste e
 * barato: na v4 nenhuma dessas chaves e string em no nenhum.
 */
export function isV3Spec(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const root = (value as { root?: unknown }).root;
  return typeof root === 'object' && root !== null && hasTokenLength(root as SpecNode);
}

function hasTokenLength(node: SpecNode): boolean {
  // O tipo promete `props`, mas o valor vem de JSON de fora — de um arquivo que
  // o usuario pode ter editado. `as SpecNode` calou o compilador na fronteira;
  // aqui a conferencia e de verdade.
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  for (const { from } of LENGTH_MIGRATIONS) {
    if (typeof props[from] === 'string') return true;
  }
  return (node.children ?? []).some(hasTokenLength);
}

/**
 * v3 -> v4: cada medida em token vira pixel.
 *
 * Token desconhecido cai no DEFAULT DO CAMPO, e nao em zero: um `padding`
 * inventado por edicao manual vira o espacamento padrao, que e o que o usuario
 * veria num no novo — e nao um componente colado nas bordas, que se leria como
 * defeito do editor.
 */
export function migrateV3ToV4(spec: VisualSpec): VisualSpec {
  return { ...spec, schemaVersion: SPEC_VERSION, root: pixelize(spec.root) };
}

function pixelize(node: SpecNode): SpecNode {
  // Reconstruido por FILTRO, e nao mutado com `delete`: `border` tem de sumir
  // junto com a entrada de `borderWidth`, e o schema tem
  // `additionalProperties: false` — a chave antiga sobrevivente reprova a spec
  // inteira, e `loadProject` a descarta em silencio.
  const retired = new Set(
    LENGTH_MIGRATIONS.filter(({ from }) => typeof node.props[from] === 'string').map((m) => m.from),
  );
  const props: Record<string, unknown> = Object.fromEntries(
    Object.entries(node.props).filter(([key]) => !retired.has(key)),
  );

  for (const { from, to, table } of LENGTH_MIGRATIONS) {
    const current = node.props[from];
    if (typeof current !== 'string') continue;
    props[to] = table[current] ?? defaultLengthFor(node.kind, to);
  }

  const children = node.children?.map(pixelize);
  return children ? { ...node, props, children } : { ...node, props };
}

function defaultLengthFor(kind: NodeKind, key: string): number {
  const field = NODE_DESCRIPTORS[kind].fields.find((f) => f.key === key);
  return field?.kind === 'length' ? field.default : 0;
}

/**
 * Leva qualquer formato conhecido ate a spec atual.
 *
 * UM ponto de entrada, e nao uma cadeia montada a mao em cada chamador: o
 * `localStorage` e o import de arquivo precisam concordar sobre quais saltos
 * existem e em que ordem, e duas copias da cadeia divergem no salto seguinte —
 * um deles ganharia o v3 e o outro nao, e so um dos dois caminhos apagaria o
 * projeto do usuario.
 */
export function migrateToCurrent(value: unknown): unknown {
  const afterV2 = isV2Spec(value) ? migrateV2ToV3(value) : value;
  return isV3Spec(afterV2) ? migrateV3ToV4(afterV2 as VisualSpec) : afterV2;
}

/** Reconhece um documento no formato v1 sem confiar apenas no schemaVersion. */
export function isV1Config(value: unknown): value is VisualConfig {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<VisualConfig> & { root?: unknown };
  return (
    candidate.root === undefined &&
    typeof candidate.chartType === 'string' &&
    typeof candidate.layout === 'object'
  );
}

/** O papel de dado da v2, antes de ganhar tipo e virar coluna. */
interface V2Role {
  name: string;
  displayName: string;
  kind: RoleKind;
}

/** A arvore da v2: mesma raiz de hoje, com `dataRoles` no lugar de `data`. */
export interface V2Spec {
  schemaVersion: string;
  project: VisualSpec['project'];
  dataRoles: V2Role[];
  root: SpecNode;
}

/**
 * Reconhece a v2 pela FORMA, e nao pelo `schemaVersion`.
 *
 * Um arquivo com `dataRoles` e sem `data` e v2 mesmo que alguem tenha editado a
 * versao a mao — e confiar no numero seria confiar justamente no campo que um
 * arquivo adulterado tem mais chance de trazer errado.
 */
export function isV2Spec(value: unknown): value is V2Spec {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { dataRoles?: unknown; data?: unknown; root?: unknown };
  return (
    Array.isArray(candidate.dataRoles) &&
    candidate.data === undefined &&
    typeof candidate.root === 'object' &&
    candidate.root !== null
  );
}

export function migrateV1(config: VisualConfig): VisualSpec {
  const { layout, header, chartType } = config;

  const children: SpecNode[] = [];

  if (header.show && header.text !== '') {
    const text = createNode('text');
    text.props = {
      ...text.props,
      content: header.text,
      fontSize: header.fontSize,
      fontWeight: header.fontWeight,
      align: header.align,
      color: header.textColor,
    };
    children.push(text);
  }

  if (chartType === 'bar') {
    const bar = createNode('barChart', { categoryRole: 'regiao', measureRole: 'receita' });
    bar.props = {
      ...bar.props,
      color: config.bar?.accentColor ?? '#3b82f6',
      showGrid: config.bar?.showGridLines ?? true,
    };
    children.push(bar);
  } else {
    const kpi = createNode('kpi', { measureRole: 'receita' });
    kpi.props = {
      ...kpi.props,
      valueFontSize: config.kpi?.valueFontSize ?? '4xl',
      valueColor: config.kpi?.accentColor ?? '#3b82f6',
      labelColor: config.kpi?.labelColor ?? '#64748b',
    };
    children.push(kpi);
  }

  // A moldura do v1 vira o container raiz: mesmo papel, mesmos tokens.
  const root = createNode('container');
  root.props = {
    ...root.props,
    direction: 'column',
    padding: layout.padding,
    radius: layout.radius,
    border: layout.border,
    shadow: layout.shadow,
    background: layout.surfaceColor,
    borderColor: layout.borderColor,
  };
  root.children = children;

  return {
    // A v1 produz uma arvore com medidas em TOKEN: e uma spec v3, e o
    // encadeador leva ela ate a atual. Emitir `SPEC_VERSION` aqui pularia o
    // salto v3 -> v4 e entregaria `padding: 'md'` a um schema que so aceita
    // inteiro — o projeto seria descartado em silencio.
    schemaVersion: V3_VERSION,
    // Preservado integralmente — e o ponto da migracao.
    project: { ...config.project },
    data: {
      columns: DEFAULT_TABLE.columns.map((column) => ({ ...column })),
      rows: DEFAULT_TABLE.rows.map((row) => [...row]),
    },
    root,
  };
}

/**
 * v2 -> v3: cada papel vira uma coluna, e a tabela ganha as linhas que o preview
 * da v2 fabricava.
 *
 * O tipo tem de ser ADIVINHADO, porque a v2 nao tinha nenhum: agrupamento vira
 * texto e medida vira decimal. Sao os dois tipos que nao restringem nada no
 * `capabilities.json` alem do que a v2 ja restringia — nenhum projeto migrado
 * passa a recusar uma coluna que antes aceitava. Quem quiser moeda ou percentual
 * troca no editor, e a troca so aperta o que ele mesmo pediu.
 *
 * As linhas reproduzem o `mockFrame` da v2 (mesmas categorias, mesma variacao
 * por nome) para que o projeto abra com o preview IDENTICO ao que o usuario
 * deixou. Sem isso, migrar mudaria o desenho na tela — e o usuario leria isso
 * como o editor tendo estragado a composicao dele.
 */
export function migrateV2ToV3(spec: V2Spec): VisualSpec {
  const columns: DataColumn[] = spec.dataRoles.map((role) => {
    const type = role.kind === 'grouping' ? 'text' : 'decimal';
    return { name: role.name, displayName: role.displayName, kind: KIND_FOR_TYPE[type], type };
  });

  // Campo a campo, e nao `{ ...spec }`: o espalhamento carregaria `dataRoles`
  // junto, e o schema tem `additionalProperties: false` na raiz — o projeto
  // migrado seria REPROVADO, e `loadProject` o descartaria em silencio. Foi
  // exatamente assim que a primeira versao desta funcao quebrou.
  return {
    schemaVersion: V3_VERSION,
    project: spec.project,
    data: legacyTable(columns),
    root: spec.root,
  };
}

/**
 * As cinco linhas que o `mockFrame` da v2 gerava.
 *
 * Categorias escolhidas para EXPOR problema de layout, nao para ficar bonito:
 * nome curto ao lado de nome longo, que e o que quebra eixo e legenda.
 */
const LEGACY_CATEGORIES = ['Sul', 'Sudeste', 'Centro-Oeste e Norte', 'Nordeste', 'Exterior'];

/** Magnitudes diferentes, um zero e um valor pequeno — o mesmo criterio. */
const LEGACY_VALUES = [184_320, 921_450, 47_800, 312_990, 0];

/** Variacao deterministica por nome de papel, igual a da v2. */
function seedOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash;
}

function legacyTable(columns: DataColumn[]): SampleTable {
  const cells = columns.map((column) => {
    if (column.kind === 'grouping') {
      const offset = seedOf(column.name) % LEGACY_CATEGORIES.length;
      return LEGACY_CATEGORIES.map(
        (_, index) => LEGACY_CATEGORIES[(index + offset) % LEGACY_CATEGORIES.length] ?? '',
      );
    }
    const factor = 0.4 + (seedOf(column.name) % 13) / 10;
    return LEGACY_VALUES.map((base) => Math.round(base * factor));
  });

  const rows: CellValue[][] = LEGACY_CATEGORIES.map((_, row) =>
    cells.map((column) => column[row] ?? null),
  );

  return { columns, rows };
}
