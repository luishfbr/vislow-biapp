import type { TokenKind } from '@vislow/config-schema';

/**
 * Vocabulario do construtor: o que o usuario pode colocar na tela.
 *
 * Discriminante de STRING pelo mesmo motivo de `ValidationResult`: a toolchain
 * do `pbiviz` compila sem `strictNullChecks`, e sem ela o TypeScript nao
 * estreita uniao por discriminante booleano.
 */
export type NodeKind =
  | 'container'
  | 'text'
  | 'kpi'
  | 'barChart'
  | 'lineChart'
  | 'areaChart'
  | 'pieChart';

/** Papel de dado no Power BI. `grouping` vira eixo/categoria; `measure`, valor. */
export type RoleKind = 'grouping' | 'measure';

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
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
  | (FieldBase & { kind: 'number'; default: number; min: number; max: number })
  /** Referencia a um papel de dado que o usuario declarou no projeto. */
  | (FieldBase & { kind: 'role'; roleKind: RoleKind })
  | (FieldBase & { kind: 'select'; options: string[]; default: string });

export interface NodeDescriptor {
  kind: NodeKind;
  /** Nome exibido na paleta do editor. */
  label: string;
  /** Uma linha explicando quando usar. Aparece na paleta. */
  hint: string;
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
