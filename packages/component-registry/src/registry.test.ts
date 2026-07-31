import { describe, expect, it } from 'vitest';
import { createDefaultConfig, TOKEN_CATALOG } from '@vislow/config-schema';
import { createEmptySpec, createNode, DEFAULT_ROLES, nextNodeId } from './factory.js';
import { isV1Config, migrateV1ToV2 } from './migrate.js';
import { defaultPropsFor, NODE_DESCRIPTORS, NODE_KINDS, roleFieldsOf } from './registry.js';
import { assertValidSpec, validateSpec, walk } from './schema.js';
import { NODE_ID_PATTERN, ROLE_NAME_PATTERN, type SpecNode, type VisualSpec } from './spec.js';
import { insertChild } from './tree.js';

/**
 * Arvore valida com um no de cada tipo, para exercitar o schema inteiro.
 *
 * Monta por `insertChild`, e nao por atribuicao: a raiz de um projeto novo
 * posiciona livremente, e e a operacao de arvore que da caixa a cada filho.
 * Atribuir direto produziria a arvore que so o editor nunca cria.
 */
function specWithEveryNode(): VisualSpec {
  const spec = createEmptySpec('Todos os nos');
  let root = spec.root;
  for (const kind of NODE_KINDS.filter((kind) => kind !== 'container')) {
    root = insertChild(root, root.id, createNode(kind, {
      categoryRole: 'categoria',
      measureRole: 'valor',
    }))!;
  }
  return { ...spec, root };
}

/** Um unico filho na raiz de um projeto novo, ja posicionado. */
function specWithChild(child: SpecNode, name = 'Um filho'): VisualSpec {
  const spec = createEmptySpec(name);
  return { ...spec, root: insertChild(spec.root, spec.root.id, child)! };
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

  it('todo no declara termos de busca', () => {
    // Sem isto o tipo de no novo entra no catalogo achavel so pelo rotulo, que
    // e uma palavra so — e o dialogo de componentes passa a esconder o que
    // acabou de ganhar.
    for (const kind of NODE_KINDS) {
      const { keywords } = NODE_DESCRIPTORS[kind];
      expect(keywords.length, `${kind} sem keywords`).toBeGreaterThan(0);
      for (const term of keywords) {
        expect(term, `${kind}: "${term}" deve ser minusculo e sem espaco nas pontas`).toBe(
          term.trim().toLowerCase(),
        );
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
    const inner = createNode('container');
    inner.children = [createNode('text')];
    expect(validateSpec(specWithChild(inner, 'Aninhado')).kind).toBe('valid');
  });
});

describe('geometria do no', () => {
  /** Spec com um texto posicionado, para exercitar o `rect`. */
  function specWithRect(rect: unknown): VisualSpec {
    const spec = createEmptySpec('Com geometria');
    spec.root.children = [{ ...createNode('text'), rect } as never];
    return spec;
  }

  it('num pai que empilha o rect e opcional', () => {
    const spec = createEmptySpec('Sem geometria');
    spec.root.props.placement = 'stack';
    spec.root.children = [createNode('text')];
    expect(validateSpec(spec).kind).toBe('valid');
    expect(spec.root.children[0]?.rect).toBeUndefined();
  });

  it('num pai que posiciona, filho sem caixa e reprovado', () => {
    // Sem caixa o filho sai com zero por zero: invisivel, e sem erro nenhum. As
    // operacoes de arvore ja garantem a caixa — esta regra pega a spec que
    // chegou por importacao, onde nenhuma operacao passou.
    const spec = createEmptySpec('Canvas sem caixa');
    spec.root.children = [createNode('text')];

    const result = validateSpec(spec);
    if (result.kind !== 'invalid') throw new Error('esperava invalido');
    expect(result.issues.map((issue) => issue.path)).toEqual(['root.children[0].rect']);
  });

  it('inserir num canvas ja da a caixa — o caminho do editor nunca reprova', () => {
    expect(validateSpec(specWithChild(createNode('text'))).kind).toBe('valid');
  });

  it('aceita uma caixa dentro dos limites do pai', () => {
    expect(validateSpec(specWithRect({ x: 25, y: 0, w: 50, h: 33.33 })).kind).toBe('valid');
    // As bordas exatas sao validas: encostar no limite e o resultado normal de
    // arrastar ate o canto.
    expect(validateSpec(specWithRect({ x: 50, y: 50, w: 50, h: 50 })).kind).toBe('valid');
  });

  it('reprova caixa que passa da borda do pai, apontando o rect', () => {
    // Passar da borda nao gera erro no navegador: o pedaco de fora e cortado em
    // silencio, e o usuario ve metade de um grafico sem saber por que.
    const result = validateSpec(specWithRect({ x: 60, y: 90, w: 50, h: 20 }));
    if (result.kind !== 'invalid') throw new Error('esperava invalido');

    expect(result.issues.map((issue) => issue.path)).toEqual([
      'root.children[0].rect',
      'root.children[0].rect',
    ]);
    expect(result.issues[0]?.message).toContain('direita');
    expect(result.issues[1]?.message).toContain('inferior');
  });

  it('reprova tamanho abaixo do piso — no invisivel nao tem como ser reselecionado', () => {
    expect(validateSpec(specWithRect({ x: 0, y: 0, w: 0, h: 50 })).kind).toBe('invalid');
    expect(validateSpec(specWithRect({ x: 0, y: 0, w: 50, h: 1 })).kind).toBe('invalid');
  });

  it('reprova eixo negativo, fora da escala e campo desconhecido', () => {
    expect(validateSpec(specWithRect({ x: -5, y: 0, w: 50, h: 50 })).kind).toBe('invalid');
    expect(validateSpec(specWithRect({ x: 0, y: 0, w: 120, h: 50 })).kind).toBe('invalid');
    expect(validateSpec(specWithRect({ x: 0, y: 0, w: 50, h: 50, z: 3 })).kind).toBe('invalid');
    expect(validateSpec(specWithRect({ x: 0, y: 0, w: 50 })).kind).toBe('invalid');
  });

  it('reprova NaN — um campo numerico vazio no painel chega assim', () => {
    expect(validateSpec(specWithRect({ x: Number.NaN, y: 0, w: 50, h: 50 })).kind).toBe('invalid');
  });
});

describe('os problemas apontam o campo certo', () => {
  /** Um `barChart` sem papel ligado — o estado pendente que o editor mostra. */
  function pendingBar() {
    return validateSpec(specWithChild(createNode('barChart'), 'Pendente'));
  }

  it('so fala dos campos do TIPO declarado, nunca dos das outras variantes', () => {
    // Com `oneOf`, um barChart sem medida acusava tambem "falta direction" e
    // "falta gap" — campos de container. Erro de outro tipo de no manda o
    // usuario procurar um controle que a tela dele nem tem.
    const result = pendingBar();
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;

    const alheios = result.issues.filter((issue) =>
      ['direction', 'gap', 'content', 'innerRadius'].some((campo) => issue.path.endsWith(campo)),
    );
    expect(alheios).toEqual([]);
  });

  it('o caminho aponta o CAMPO, no formato do walk', () => {
    // `required` do Ajv aponta o objeto; sem anexar a propriedade, o editor
    // saberia que "algo em props falta" e nao qual controle acender.
    const result = pendingBar();
    if (result.kind !== 'invalid') throw new Error('esperava invalido');

    expect(result.issues.map((issue) => issue.path)).toContain(
      'root.children[0].props.measureRole',
    );
  });

  it('o formato do caminho e o MESMO nas duas validacoes', () => {
    // Schema e regras semanticas alimentam a mesma lista. Formatos diferentes
    // impediriam qualquer consumidor de ligar um problema a um no.
    const spec = specWithChild(
      createNode('barChart', { categoryRole: 'categoria', measureRole: 'inexistente' }),
      'Papel fantasma',
    );
    const semantico = validateSpec(spec);
    if (semantico.kind !== 'invalid') throw new Error('esperava invalido');

    expect(semantico.issues[0]?.path).toBe('root.children[0].props.measureRole');
  });

  it('nao devolve invalido com lista de problemas vazia', () => {
    const result = pendingBar();
    if (result.kind !== 'invalid') throw new Error('esperava invalido');
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('validacao semantica de papeis', () => {
  it('rejeita no que referencia papel nao declarado', () => {
    const spec = specWithChild(
      createNode('barChart', { categoryRole: 'categoria', measureRole: 'inexistente' }),
      'Papel fantasma',
    );

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
