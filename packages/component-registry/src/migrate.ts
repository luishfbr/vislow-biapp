/**
 * Migracao dos formatos antigos para a spec atual.
 *
 * Existe porque projetos antigos estao salvos no `localStorage` de quem ja usou
 * o editor, e exportados como `.vislow.json` na maquina dele. Descartar seria
 * perder o `project.id` — e com ele a capacidade de *atualizar* o visual no
 * Power BI em vez de duplicar (RF-10). A identidade e a parte insubstituivel; o
 * resto e aparencia.
 *
 * Dois saltos hoje:
 *   v1 -> config plano do editor pre-ADR-08;
 *   v2 -> arvore com `dataRoles`, antes de a tabela de exemplo existir.
 *
 * ATENCAO: `loadProject` DESCARTA em silencio a spec que nao valida. Uma
 * migracao errada aqui nao da erro na tela — ela apaga o projeto do usuario. E
 * por isso que `migrate.test.ts` congela uma fixture v2 real em vez de construir
 * uma com as funcoes de hoje, que evoluem junto com o codigo e esconderiam a
 * quebra.
 */
import type { CellValue, VisualConfig } from '@vislow/config-schema';
import { createNode, DEFAULT_TABLE } from './factory.js';
import {
  KIND_FOR_TYPE,
  SPEC_VERSION,
  type DataColumn,
  type SampleTable,
  type SpecNode,
  type VisualSpec,
} from './spec.js';
import type { RoleKind } from './types.js';

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
    schemaVersion: SPEC_VERSION,
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
    schemaVersion: SPEC_VERSION,
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
