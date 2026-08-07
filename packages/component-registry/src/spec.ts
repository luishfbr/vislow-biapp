import type { CellValue, ColumnType, ProjectIdentity } from '@vislow/config-schema';
import type { NodeKind, RoleKind } from './types.js';

// MINOR na 5.3.0: o no `ranking` e aditivo. Remocao de campo exige MAJOR (RN-12).
export const SPEC_VERSION = '5.3.0';

/** Uma coluna da tabela de exemplo — que E, ao mesmo tempo, um campo do visual. Nao ha lista paralela. */
export interface DataColumn {
  name: string;
  displayName: string;
  kind: RoleKind;
  type: ColumnType;
}

/** As LINHAS sao do editor e nao chegam ao pacote; so o esquema viaja. Dois testes reprovam o vazamento. */
export interface SampleTable {
  columns: DataColumn[];
  /** Alinhadas a `columns` por INDICE — `rows[linha][coluna]`. */
  rows: CellValue[][];
}

/** So o DEFAULT: quem decide e o usuario. Um "Ano" e inteiro e ainda assim agrupa. */
export const KIND_FOR_TYPE: Record<ColumnType, RoleKind> = {
  text: 'grouping',
  date: 'grouping',
  boolean: 'grouping',
  integer: 'measure',
  decimal: 'measure',
  percent: 'measure',
  currency: 'measure',
};

export const PROJECT_NAME_MIN_LENGTH = 3;
export const PROJECT_NAME_MAX_LENGTH = 50;

export const MAX_COLUMNS = 10;

export const MAX_ROWS = 50;

/** Caixa do no dentro do pai, em % — nao pixel: um visual do Power BI nao tem tamanho proprio. */
export interface NodeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Piso de largura e altura, em %: no de tamanho zero some da tela e continua na arvore. */
export const RECT_MIN_SIZE = 2;

export const NODE_NAME_MAX_LENGTH = 50;

export interface SpecNode {
  id: string;
  kind: NodeKind;
  props: Record<string, unknown>;
  name?: string;
  exposed?: string[];
  rect?: NodeRect;
  children?: SpecNode[];
}

/** A prancheta do EDITOR. Nao vai para o pacote — um teste do codegen reprova o vazamento. */
export interface Artboard {
  width: number;
  height: number;
}

export const ARTBOARD_MIN: Artboard = { width: 100, height: 100 };

export const ARTBOARD_MAX: Artboard = { width: 1920, height: 1080 };

export const ARTBOARD_DEFAULT: Artboard = { width: 1280, height: 720 };

export interface SpecProject extends ProjectIdentity {
  artboard?: Artboard | undefined;
}

export interface VisualSpec {
  schemaVersion: string;
  project: SpecProject;
  data: SampleTable;
  root: SpecNode;
}

export function artboardOf(spec: VisualSpec): Artboard {
  return spec.project.artboard ?? ARTBOARD_DEFAULT;
}

export function clampArtboard(size: Artboard): Artboard {
  // `NaN` cai no default: `Math.round(NaN)` atravessa o clamp inteiro sem reclamar.
  const fit = (value: number, min: number, max: number, fallback: number): number =>
    Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : fallback;

  return {
    width: fit(size.width, ARTBOARD_MIN.width, ARTBOARD_MAX.width, ARTBOARD_DEFAULT.width),
    height: fit(size.height, ARTBOARD_MIN.height, ARTBOARD_MAX.height, ARTBOARD_DEFAULT.height),
  };
}

export const ROLE_NAME_PATTERN = '^[a-z][A-Za-z0-9]{1,29}$';

// Dois ramos ANCORADOS, e nao `anyOf`: o Ajv reportaria um erro por ramo.
export const OPTIONAL_ROLE_NAME_PATTERN = `^$|${ROLE_NAME_PATTERN}`;

export const NODE_ID_PATTERN = '^[A-Za-z0-9_-]{1,40}$';
