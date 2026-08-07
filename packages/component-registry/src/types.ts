import type { TokenKind } from '@vislow/config-schema';

/** Discriminante de STRING: o `pbiviz` compila sem `strictNullChecks` e nao estreita por booleano. */
export type NodeKind = 'container' | 'text' | 'kpi' | 'ranking';

export type RoleKind = 'grouping' | 'measure';

interface FieldBase {
  key: string;
  label: string;
  hint?: string;
  /** Mostra o campo so quando outro campo do MESMO no tem este valor. */
  showWhen?: { key: string; equals: string };
  /** O CODEGEN le para decidir a FORMA da arvore — por isso nunca e publicavel no painel do visual. */
  structural?: true;
  /** Secao nos DOIS paineis: cabecalho no editor, `FormattingGroup` no visual. Ausente cai num bloco sem titulo. */
  group?: string;
}

export type FieldSpec =
  | (FieldBase & { kind: 'token'; token: TokenKind; default: string })
  | (FieldBase & { kind: 'color'; default: string })
  | (FieldBase & { kind: 'boolean'; default: boolean })
  | (FieldBase & { kind: 'text'; default: string; maxLength: number })
  | (FieldBase & { kind: 'number'; default: number; min: number; max: number })
  | (FieldBase & { kind: 'length'; default: number; min: number; max: number })
  | (FieldBase & { kind: 'role'; roleKind: RoleKind; optional?: true })
  | (FieldBase & { kind: 'select'; options: string[]; default: string });

export interface NodeDescriptor {
  kind: NodeKind;
  label: string;
  hint: string;
  /** Termos alternativos que a busca casa. Aqui, e nao numa lista paralela em `apps/web`. */
  keywords: string[];
  /** Tecla que arma a ferramenta, em maiuscula. Mesma regra dos `keywords`. */
  shortcut: string;
  acceptsChildren: boolean;
  fields: FieldSpec[];
  /** Componente que o codegen importa do `visual-kit`: o pacote renderiza o MESMO do preview (ADR-04). */
  component: string;
}
