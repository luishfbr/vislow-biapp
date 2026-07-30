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

export interface SpecNode {
  /** Unico dentro da arvore. Chave de React e alvo de selecao no editor. */
  id: string;
  kind: NodeKind;
  /** Valores dos campos do descritor. Validado contra o schema gerado. */
  props: Record<string, unknown>;
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
