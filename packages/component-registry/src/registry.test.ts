import { describe, expect, it } from 'vitest';
import { createDefaultConfig, TOKEN_CATALOG } from '@vislow/config-schema';
import { createEmptySpec, createNode, DEFAULT_ROLES, nextNodeId } from './factory.js';
import { isV1Config, migrateV1ToV2 } from './migrate.js';
import { defaultPropsFor, NODE_DESCRIPTORS, NODE_KINDS, roleFieldsOf } from './registry.js';
import { assertValidSpec, validateSpec, walk } from './schema.js';
import { NODE_ID_PATTERN, ROLE_NAME_PATTERN, type VisualSpec } from './spec.js';

/** Arvore valida com um no de cada tipo, para exercitar o schema inteiro. */
function specWithEveryNode(): VisualSpec {
  const spec = createEmptySpec('Todos os nos');
  spec.root.children = NODE_KINDS.filter((kind) => kind !== 'container').map((kind) =>
    createNode(kind, { categoryRole: 'categoria', measureRole: 'valor' }),
  );
  return spec;
}

describe('registro de componentes', () => {
  it('todo descritor tem kind coerente com a chave do mapa', () => {
    for (const kind of NODE_KINDS) {
      expect(NODE_DESCRIPTORS[kind].kind).toBe(kind);
    }
  });

  it('so o container aceita filhos', () => {
    const withChildren = NODE_KINDS.filter((k) => NODE_DESCRIPTORS[k].acceptsChildren);
    expect(withChildren).toEqual(['container']);
  });

  it('nenhuma chave de campo se repete dentro de um no', () => {
    for (const kind of NODE_KINDS) {
      const keys = NODE_DESCRIPTORS[kind].fields.map((f) => f.key);
      expect(new Set(keys).size, `${kind} tem chave duplicada`).toBe(keys.length);
    }
  });

  it('todo campo de token referencia um token que existe no catalogo', () => {
    for (const kind of NODE_KINDS) {
      for (const field of NODE_DESCRIPTORS[kind].fields) {
        if (field.kind !== 'token') continue;
        const values: readonly string[] = TOKEN_CATALOG[field.token];
        expect(values, `${kind}.${field.key}`).toBeDefined();
        // O default precisa ser um valor valido, senao o no nasce invalido.
        expect(values, `${kind}.${field.key} default fora do catalogo`).toContain(field.default);
      }
    }
  });

  it('defaults nao incluem campos de papel', () => {
    for (const kind of NODE_KINDS) {
      const defaults = Object.keys(defaultPropsFor(kind));
      for (const field of roleFieldsOf(kind)) {
        expect(defaults, `${kind}.${field.key} nao pode ter default`).not.toContain(field.key);
      }
    }
  });

  it('todo no declara um componente para o codegen importar', () => {
    for (const kind of NODE_KINDS) {
      expect(NODE_DESCRIPTORS[kind].component).toMatch(/^[A-Z][A-Za-z0-9]*$/);
    }
  });
});

describe('schema gerado a partir do registro', () => {
  it('aceita uma arvore com um no de cada tipo', () => {
    expect(() => assertValidSpec(specWithEveryNode())).not.toThrow();
  });

  it('projeto novo e valido — tela em branco de verdade', () => {
    const spec = createEmptySpec('Meu visual');
    expect(validateSpec(spec).kind).toBe('valid');
    expect(spec.root.kind).toBe('container');
    expect(spec.root.children).toEqual([]);
  });

  it('rejeita tipo de no que nao existe no registro', () => {
    const spec = specWithEveryNode() as unknown as { root: { children: unknown[] } };
    spec.root.children = [{ id: 'x-1', kind: 'mapaDeCalor', props: {} }];
    expect(validateSpec(spec).kind).toBe('invalid');
  });

  it('rejeita valor de token fora do catalogo', () => {
    const spec = createEmptySpec('Token invalido');
    spec.root.props.padding = 'gigantesco';
    const result = validateSpec(spec);
    expect(result.kind).toBe('invalid');
  });

  it('rejeita cor fora do padrao #RRGGBB', () => {
    const spec = createEmptySpec('Cor invalida');
    spec.root.props.background = 'branco';
    expect(validateSpec(spec).kind).toBe('invalid');
  });

  it('rejeita filho em no que nao aceita filhos', () => {
    const spec = createEmptySpec('Folha com filho');
    const text = createNode('text') as unknown as { children: unknown[] };
    text.children = [];
    spec.root.children = [text as never];
    expect(validateSpec(spec).kind).toBe('invalid');
  });

  it('aceita aninhamento de containers', () => {
    const spec = createEmptySpec('Aninhado');
    const inner = createNode('container');
    inner.children = [createNode('text')];
    spec.root.children = [inner];
    expect(validateSpec(spec).kind).toBe('valid');
  });
});

describe('validacao semantica de papeis', () => {
  it('rejeita no que referencia papel nao declarado', () => {
    const spec = createEmptySpec('Papel fantasma');
    spec.root.children = [
      createNode('barChart', { categoryRole: 'categoria', measureRole: 'inexistente' }),
    ];

    const result = validateSpec(spec);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues.some((i) => i.message.includes('papel nao declarado'))).toBe(true);
    }
  });

  it('rejeita papel do tipo errado — grouping onde se exige measure', () => {
    const spec = createEmptySpec('Tipo trocado');
    spec.root.children = [
      // `categoria` e grouping; o campo measureRole exige measure.
      createNode('barChart', { categoryRole: 'categoria', measureRole: 'categoria' }),
    ];

    const result = validateSpec(spec);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues.some((i) => i.message.includes('exige measure'))).toBe(true);
    }
  });

  it('rejeita no com papel nao ligado — o default nao existe de proposito', () => {
    const spec = createEmptySpec('Papel pendente');
    spec.root.children = [createNode('barChart')];
    expect(validateSpec(spec).kind).toBe('invalid');
  });

  it('rejeita ids de no duplicados', () => {
    const spec = createEmptySpec('Ids repetidos');
    const a = createNode('text');
    const b = createNode('text');
    b.id = a.id;
    spec.root.children = [a, b];

    const result = validateSpec(spec);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues.some((i) => i.message.includes('id de no duplicado'))).toBe(true);
    }
  });

  it('rejeita nomes de papel duplicados', () => {
    const spec = createEmptySpec('Papeis repetidos');
    spec.dataRoles = [DEFAULT_ROLES[0]!, { ...DEFAULT_ROLES[0]! }];
    const result = validateSpec(spec);
    expect(result.kind).toBe('invalid');
  });

  it('walk visita a raiz e todos os descendentes', () => {
    const spec = createEmptySpec('Percurso');
    const inner = createNode('container');
    inner.children = [createNode('text'), createNode('text')];
    spec.root.children = [inner];

    expect(walk(spec)).toHaveLength(4); // raiz + inner + 2 textos
  });
});

describe('identificadores', () => {
  it('id de no gerado casa com o padrao do schema', () => {
    for (const kind of NODE_KINDS) {
      expect(nextNodeId(kind)).toMatch(new RegExp(NODE_ID_PATTERN));
    }
  });

  it('papeis default casam com o padrao de nome', () => {
    for (const role of DEFAULT_ROLES) {
      expect(role.name).toMatch(new RegExp(ROLE_NAME_PATTERN));
    }
  });
});

describe('migracao v1 -> v2', () => {
  it('preserva a identidade do projeto — e o ponto da migracao (RF-10)', () => {
    const v1 = createDefaultConfig('Projeto Antigo', 'bar');
    const v2 = migrateV1ToV2(v1);

    expect(v2.project.id).toBe(v1.project.id);
    expect(v2.project.name).toBe(v1.project.name);
    expect(v2.project.packageVersion).toBe(v1.project.packageVersion);
  });

  it('produz arvore valida a partir de um config de barras', () => {
    const v2 = migrateV1ToV2(createDefaultConfig('Barras v1', 'bar'));
    expect(() => assertValidSpec(v2)).not.toThrow();
    expect(walk(v2).some(({ node }) => node.kind === 'barChart')).toBe(true);
  });

  it('produz arvore valida a partir de um config de KPI', () => {
    const v2 = migrateV1ToV2(createDefaultConfig('KPI v1', 'kpi'));
    expect(() => assertValidSpec(v2)).not.toThrow();
    expect(walk(v2).some(({ node }) => node.kind === 'kpi')).toBe(true);
  });

  it('leva os tokens da moldura v1 para o container raiz', () => {
    const v1 = createDefaultConfig('Moldura', 'bar');
    v1.layout.padding = 'xl';
    v1.layout.surfaceColor = '#0f172a';

    const v2 = migrateV1ToV2(v1);
    expect(v2.root.props.padding).toBe('xl');
    expect(v2.root.props.background).toBe('#0f172a');
  });

  it('omite o texto quando o titulo estava desligado', () => {
    const v1 = createDefaultConfig('Sem titulo', 'bar');
    v1.header.show = false;

    const v2 = migrateV1ToV2(v1);
    expect(walk(v2).some(({ node }) => node.kind === 'text')).toBe(false);
  });

  it('isV1Config distingue os dois formatos', () => {
    expect(isV1Config(createDefaultConfig('v1', 'bar'))).toBe(true);
    expect(isV1Config(createEmptySpec('v2'))).toBe(false);
    expect(isV1Config(null)).toBe(false);
    expect(isV1Config({})).toBe(false);
  });
});
