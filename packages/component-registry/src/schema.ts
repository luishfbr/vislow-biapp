/**
 * Schema JSON da arvore, GERADO a partir do registro.
 *
 * Escrever o schema a mao criaria uma segunda lista de tipos de no, que
 * divergiria do registro na primeira adicao. Derivando, um tipo novo passa a ser
 * validado no mesmo commit em que passa a existir — mesma logica do ADR-02, um
 * nivel acima.
 *
 * Ajv 2020-12: importar `ajv/dist/2020.js`. O entrypoint padrao e draft-07 e
 * ignora o dialeto declarado em `$schema`, falhando so em runtime.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import {
  COLOR_PATTERN,
  PACKAGE_VERSION_PATTERN,
  PROJECT_ID_PATTERN,
  TOKEN_CATALOG,
  type ValidationIssue,
} from '@vislow/config-schema';
import { NODE_DESCRIPTORS, NODE_KINDS } from './registry.js';
import {
  NODE_ID_PATTERN,
  RECT_MIN_SIZE,
  ROLE_NAME_PATTERN,
  SPEC_VERSION,
  type NodeRect,
  type VisualSpec,
} from './spec.js';
import type { FieldSpec } from './types.js';

/** Schema de um campo, derivado do seu descritor. */
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
    case 'select':
      return { enum: [...field.options] };
    case 'role':
      // A existencia do papel referenciado NAO da para expressar em JSON Schema
      // — e verificada semanticamente em `validateSpec`.
      return { type: 'string', pattern: ROLE_NAME_PATTERN };
  }
}

/**
 * Geometria opcional do no.
 *
 * O schema garante que cada eixo e um numero na faixa; que a caixa CABE dentro
 * do pai (`x + w <= 100`) e regra semantica, em `validateSpec` — JSON Schema nao
 * relaciona duas propriedades irmas sem `dependentSchemas` acrobatico, e o erro
 * dele nao diria qual das duas esta errada.
 */
const AXIS_SCHEMA = { type: 'number', minimum: 0, maximum: 100 };
const SIZE_SCHEMA = { type: 'number', minimum: RECT_MIN_SIZE, maximum: 100 };

const rectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'w', 'h'],
  properties: { x: AXIS_SCHEMA, y: AXIS_SCHEMA, w: SIZE_SCHEMA, h: SIZE_SCHEMA },
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
  required: ['schemaVersion', 'project', 'dataRoles', 'root'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    project: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'packageVersion'],
      properties: {
        id: { type: 'string', pattern: PROJECT_ID_PATTERN },
        name: { type: 'string', minLength: 3, maxLength: 50 },
        packageVersion: { type: 'string', pattern: PACKAGE_VERSION_PATTERN },
      },
    },
    dataRoles: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'displayName', 'kind'],
        properties: {
          name: { type: 'string', pattern: ROLE_NAME_PATTERN },
          displayName: { type: 'string', minLength: 1, maxLength: 50 },
          kind: { enum: ['grouping', 'measure'] },
        },
      },
    },
    root: { $ref: '#/$defs/node' },
  },
  $defs: {
    /**
     * Uniao discriminada por `kind`, despachada com `if`/`then`.
     *
     * NAO e `oneOf`. Com `oneOf` o Ajv avalia as SETE variantes e reporta o erro
     * de todas: um `barChart` sem medida ligada acusava tambem "falta
     * `direction`" e "falta `gap`" — campos de container. Erro de outro tipo de
     * no e pior que erro nenhum, porque manda o usuario procurar um campo que a
     * tela dele nem tem.
     *
     * Com `if`/`then`, o `if` que nao casa nao produz erro, entao so a variante
     * do `kind` declarado fala. O `enum` no `kind` e quem cobre o caso de um tipo
     * inexistente, que antes era o unico servico util do `oneOf`.
     */
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

/**
 * Caminho do Ajv no MESMO formato que `walk` produz.
 *
 * O Ajv devolve JSON Pointer (`/root/children/0/props`) e o `walk` devolve
 * `root.children[0]`. As duas formas conviviam na mesma lista de problemas — a
 * do schema e a das regras semanticas —, entao quem consome nao conseguia ligar
 * um problema a um no sem saber de qual dos dois validadores ele veio.
 *
 * Erro de `required` aponta para o OBJETO que nao tem a propriedade. Anexar o
 * nome que falta faz o caminho apontar para o CAMPO, como todos os outros — sem
 * isso, "falta uma propriedade em props" nao diz qual controle da tela acender.
 */
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

/** Percorre a arvore em profundidade, incluindo a raiz. */
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

/**
 * Valida a arvore contra o schema e depois as regras que JSON Schema nao
 * alcanca: papel referenciado existe e e do tipo certo, e id de no e unico.
 *
 * Um papel inexistente passaria pelo schema e so quebraria na geracao do
 * `capabilities.json` — ou pior, produziria um visual que pede um campo que o
 * codegen nao declarou.
 */
/**
 * Descarta os erros de ROLLUP do `if`/`then`.
 *
 * Cada `then` que falha gera, alem do erro real, um `must match "then" schema`
 * em cada ancestral ate a raiz. Eles nao dizem nada que o erro especifico ja nao
 * diga e, num aninhamento de tres containers, sao a maioria da lista — o que faz
 * o problema de verdade sumir no meio.
 */
function isInformative(error: ErrorObject): boolean {
  return error.keyword !== 'if';
}

/**
 * A caixa cabe dentro do pai?
 *
 * Uma caixa que passa da borda nao some — ela e cortada, e o pedaco que falta
 * some sem erro nenhum dentro do Power BI. O editor PRENDE a caixa na borda
 * enquanto o usuario arrasta (ver `clampRect`); esta regra existe para a spec que
 * chega por importacao de arquivo, onde ninguem prendeu nada.
 */
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

export function validateSpec(value: unknown): SpecValidationResult {
  const validate = validator();
  if (!validate(value)) {
    const errors = validate.errors ?? [];
    const informative = errors.filter(isInformative);
    // Se o filtro levar tudo, o rollup era a unica informacao que havia. Melhor
    // um erro vago do que uma spec reprovada sem nenhum problema listado.
    return { kind: 'invalid', issues: (informative.length > 0 ? informative : errors).map(toIssue) };
  }

  const spec = value as VisualSpec;
  const issues: ValidationIssue[] = [];

  const roles = new Map(spec.dataRoles.map((role) => [role.name, role]));
  if (roles.size !== spec.dataRoles.length) {
    issues.push({ path: 'dataRoles', message: 'nomes de papel duplicados' });
  }

  const seenIds = new Set<string>();
  for (const { node, path } of walk(spec)) {
    if (seenIds.has(node.id)) {
      issues.push({ path, message: `id de no duplicado: ${node.id}` });
    }
    seenIds.add(node.id);

    if (node.rect) issues.push(...rectIssues(node.rect, path));

    for (const field of NODE_DESCRIPTORS[node.kind].fields) {
      if (field.kind !== 'role') continue;
      const referenced = node.props[field.key];
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

/** Versao que lanca. Util em testes e onde a spec ja deveria ser valida. */
export function assertValidSpec(value: unknown): VisualSpec {
  const result = validateSpec(value);
  if (result.kind === 'invalid') {
    const detail = result.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(`VisualSpec invalido — ${detail}`);
  }
  return result.spec;
}
