import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import {
  COLOR_PATTERN,
  COLUMN_TYPES,
  isValidCell,
  PACKAGE_VERSION_PATTERN,
  PROJECT_ID_PATTERN,
  TOKEN_CATALOG,
  type ValidationIssue,
} from '@vislow/config-schema';
import { exposableFields, NODE_DESCRIPTORS, NODE_KINDS } from './registry.js';
import {
  ARTBOARD_MAX,
  ARTBOARD_MIN,
  MAX_COLUMNS,
  MAX_ROWS,
  NODE_ID_PATTERN,
  NODE_NAME_MAX_LENGTH,
  OPTIONAL_ROLE_NAME_PATTERN,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_NAME_MIN_LENGTH,
  RECT_MIN_SIZE,
  ROLE_NAME_PATTERN,
  SPEC_VERSION,
  type NodeRect,
  type VisualSpec,
} from './spec.js';
import { positionsChildren } from './tree.js';
import type { FieldSpec } from './types.js';

function fieldSchema(field: FieldSpec): Record<string, unknown> {
  switch (field.kind) {
    case 'token':
      return { enum: [...TOKEN_CATALOG[field.token]] };
    case 'color':
      return { type: 'string', pattern: COLOR_PATTERN };
    case 'boolean':
      return { type: 'boolean' };
    case 'text':
      return { type: 'string', maxLength: field.maxLength };
    case 'number':
      return { type: 'number', minimum: field.min, maximum: field.max };
    case 'length':
      return { type: 'integer', minimum: field.min, maximum: field.max };
    case 'select':
      return { enum: [...field.options] };
    case 'role':
      return {
        type: 'string',
        pattern: field.optional === true ? OPTIONAL_ROLE_NAME_PATTERN : ROLE_NAME_PATTERN,
      };
  }
}

// Que a caixa CABE no pai (`x + w <= 100`) e regra de `rectIssues`: JSON Schema nao relaciona irmas.
const AXIS_SCHEMA = { type: 'number', minimum: 0, maximum: 100 };
const SIZE_SCHEMA = { type: 'number', minimum: RECT_MIN_SIZE, maximum: 100 };

const rectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'w', 'h'],
  properties: { x: AXIS_SCHEMA, y: AXIS_SCHEMA, w: SIZE_SCHEMA, h: SIZE_SCHEMA },
};

const artboardSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['width', 'height'],
  properties: {
    width: { type: 'integer', minimum: ARTBOARD_MIN.width, maximum: ARTBOARD_MAX.width },
    height: { type: 'integer', minimum: ARTBOARD_MIN.height, maximum: ARTBOARD_MAX.height },
  },
};

function nodeSchemaFor(kind: (typeof NODE_KINDS)[number]): Record<string, unknown> {
  const descriptor = NODE_DESCRIPTORS[kind];
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of descriptor.fields) {
    properties[field.key] = fieldSchema(field);
    required.push(field.key);
  }

  const schema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'kind', 'props'],
    properties: {
      id: { type: 'string', pattern: NODE_ID_PATTERN },
      kind: { const: kind },
      props: { type: 'object', additionalProperties: false, required, properties },
      rect: rectSchema,
      name: { type: 'string', minLength: 1, maxLength: NODE_NAME_MAX_LENGTH },
      exposed: {
        type: 'array',
        uniqueItems: true,
        items: { enum: exposableFields(kind).map((field) => field.key) },
      },
      ...(descriptor.acceptsChildren
        ? { children: { type: 'array', items: { $ref: '#/$defs/node' }, maxItems: 50 } }
        : {}),
    },
  };

  return schema;
}

export const specSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `https://vislow.app/schemas/visual-spec/${SPEC_VERSION}.json`,
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'project', 'data', 'root'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    project: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'packageVersion'],
      properties: {
        id: { type: 'string', pattern: PROJECT_ID_PATTERN },
        name: {
          type: 'string',
          minLength: PROJECT_NAME_MIN_LENGTH,
          maxLength: PROJECT_NAME_MAX_LENGTH,
        },
        packageVersion: { type: 'string', pattern: PACKAGE_VERSION_PATTERN },
        artboard: artboardSchema,
      },
    },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['columns', 'rows'],
      properties: {
        columns: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_COLUMNS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'displayName', 'kind', 'type'],
            properties: {
              name: { type: 'string', pattern: ROLE_NAME_PATTERN },
              displayName: { type: 'string', minLength: 1, maxLength: 50 },
              kind: { enum: ['grouping', 'measure'] },
              type: { enum: [...COLUMN_TYPES] },
            },
          },
        },
        rows: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ROWS,
          items: {
            type: 'array',
            maxItems: MAX_COLUMNS,
            items: {
              anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }],
            },
          },
        },
      },
    },
    root: { $ref: '#/$defs/node' },
  },
  $defs: {
    node: {
      type: 'object',
      required: ['id', 'kind', 'props'],
      properties: { kind: { enum: [...NODE_KINDS] } },
      allOf: NODE_KINDS.map((kind) => ({
        if: { required: ['kind'], properties: { kind: { const: kind } } },
        then: nodeSchemaFor(kind),
      })),
    },
  },
} as const;

export type SpecValidationResult =
  | { kind: 'valid'; spec: VisualSpec }
  | { kind: 'invalid'; issues: ValidationIssue[] };

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  compiled ??= new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(
    specSchema,
  );
  return compiled;
}

/** Converte o JSON Pointer do Ajv para o mesmo formato que `walk` produz. */
function toIssue(error: ErrorObject): ValidationIssue {
  let path = '';
  for (const segment of error.instancePath.split('/')) {
    if (segment === '') continue;
    if (/^\d+$/.test(segment)) path += `[${segment}]`;
    else path += path === '' ? segment : `.${segment}`;
  }

  const missing = (error.params as { missingProperty?: string }).missingProperty;
  if (missing !== undefined) path = path === '' ? missing : `${path}.${missing}`;

  return { path: path || '(raiz)', message: error.message ?? 'invalido' };
}

export function walk(spec: VisualSpec): { node: VisualSpec['root']; path: string }[] {
  const out: { node: VisualSpec['root']; path: string }[] = [];
  const visit = (node: VisualSpec['root'], path: string): void => {
    out.push({ node, path });
    node.children?.forEach((child, index) => {
      visit(child, `${path}.children[${String(index)}]`);
    });
  };
  visit(spec.root, 'root');
  return out;
}

/** Descarta os erros de ROLLUP do `if`/`then` — o real vem junto e e o unico acionavel. */
function isInformative(error: ErrorObject): boolean {
  return error.keyword !== 'if';
}

/** Caixa que passa da borda nao some: e cortada, e o pedaco que falta some sem erro dentro do Power BI. */
function rectIssues(rect: NodeRect, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (rect.x + rect.w > 100) {
    issues.push({
      path: `${path}.rect`,
      message: `a caixa passa da borda direita do pai: x + largura = ${String(rect.x + rect.w)}`,
    });
  }
  if (rect.y + rect.h > 100) {
    issues.push({
      path: `${path}.rect`,
      message: `a caixa passa da borda inferior do pai: y + altura = ${String(rect.y + rect.h)}`,
    });
  }
  return issues;
}

/** Duas relacoes que JSON Schema nao alcanca, porque ligam uma propriedade a uma irma. */
function tableIssues(spec: VisualSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { columns, rows } = spec.data;

  rows.forEach((row, index) => {
    if (row.length !== columns.length) {
      issues.push({
        path: `data.rows[${String(index)}]`,
        message: `a linha tem ${String(row.length)} celulas, mas a tabela tem ${String(columns.length)} colunas`,
      });
      return;
    }

    row.forEach((cell, position) => {
      const column = columns[position];
      if (column && !isValidCell(cell, column.type)) {
        issues.push({
          path: `data.rows[${String(index)}][${String(position)}]`,
          message: `valor nao e ${column.type}: ${JSON.stringify(cell)}`,
        });
      }
    });
  });

  return issues;
}

export function validateSpec(value: unknown): SpecValidationResult {
  const validate = validator();
  if (!validate(value)) {
    const errors = validate.errors ?? [];
    const informative = errors.filter(isInformative);
    return { kind: 'invalid', issues: (informative.length > 0 ? informative : errors).map(toIssue) };
  }

  const spec = value as VisualSpec;
  const issues: ValidationIssue[] = [];

  const roles = new Map(spec.data.columns.map((column) => [column.name, column]));
  if (roles.size !== spec.data.columns.length) {
    issues.push({ path: 'data.columns', message: 'nomes de coluna duplicados' });
  }

  issues.push(...tableIssues(spec));

  const seenIds = new Set<string>();
  for (const { node, path } of walk(spec)) {
    if (seenIds.has(node.id)) {
      issues.push({ path, message: `id de no duplicado: ${node.id}` });
    }
    seenIds.add(node.id);

    if (node.rect) issues.push(...rectIssues(node.rect, path));

    if (positionsChildren(node)) {
      (node.children ?? []).forEach((child, index) => {
        if (!child.rect) {
          issues.push({
            path: `${path}.children[${String(index)}].rect`,
            message: 'falta a caixa: o pai posiciona os filhos livremente',
          });
        }
      });
    }

    for (const field of NODE_DESCRIPTORS[node.kind].fields) {
      if (field.kind !== 'role') continue;
      const referenced = node.props[field.key];
      if (field.optional === true && referenced === '') continue;
      const role = typeof referenced === 'string' ? roles.get(referenced) : undefined;

      if (!role) {
        issues.push({
          path: `${path}.props.${field.key}`,
          message: `papel nao declarado: ${String(referenced)}`,
        });
      } else if (role.kind !== field.roleKind) {
        issues.push({
          path: `${path}.props.${field.key}`,
          message: `papel "${role.name}" e ${role.kind}, mas o campo exige ${field.roleKind}`,
        });
      }
    }
  }

  return issues.length === 0 ? { kind: 'valid', spec } : { kind: 'invalid', issues };
}

export function assertValidSpec(value: unknown): VisualSpec {
  const result = validateSpec(value);
  if (result.kind === 'invalid') {
    const detail = result.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(`VisualSpec invalido — ${detail}`);
  }
  return result.spec;
}
