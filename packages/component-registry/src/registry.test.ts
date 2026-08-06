import { describe, expect, it } from 'vitest';
import { TOKEN_CATALOG } from '@vislow/config-schema';
import {
  createEmptySpec,
  createNode,
  DEFAULT_TABLE,
  nextNodeId,
  suggestRoleBindings,
} from './factory.js';
import { defaultPropsFor, NODE_DESCRIPTORS, NODE_KINDS, roleFieldsOf } from './registry.js';
import { assertValidSpec, validateSpec, walk } from './schema.js';
import {
  ARTBOARD_DEFAULT,
  ARTBOARD_MAX,
  ARTBOARD_MIN,
  artboardOf,
  clampArtboard,
  NODE_ID_PATTERN,
  ROLE_NAME_PATTERN,
  type SpecNode,
  type VisualSpec,
} from './spec.js';
import { insertChild } from './tree.js';

/**
 * Arvore valida com um no de cada tipo, para exercitar o schema inteiro.
 *
 * Monta por `insertChild`, e nao por atribuicao: a raiz de um projeto novo
 * posiciona livremente, e e a operacao de arvore que da caixa a cada filho.
 * Atribuir direto produziria a arvore que so o editor nunca cria.
 */
/**
 * Um no do tipo pedido, com os papeis OBRIGATORIOS ja ligados a tabela padrao.
 *
 * Ligar aqui e o que mantem a fixture valida: papel obrigatorio sem ligacao
 * reprova no schema de proposito (RF-12), e uma fixture invalida faria todo teste
 * de estrutura falhar pela razao errada.
 *
 * A tabela de um projeto novo tem UMA medida (`receita`), entao o `compareRole`
 * do KPI fica no `''` com que nasce — que e exatamente o caso de um papel
 * opcional nao ligado, e vale a pena que a fixture o exercite.
 */
function specWithEveryNode(): VisualSpec {
  const spec = createEmptySpec('Todos os nos');
  let root = spec.root;
  for (const kind of NODE_KINDS) {
    root = insertChild(root, root.id, createNode(kind, suggestRoleBindings(kind, spec.data.columns)))!;
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

  it('papel OBRIGATORIO nao tem default; papel OPCIONAL nasce em branco', () => {
    /*
     * A ausencia e o mecanismo, nao um detalhe.
     *
     * O papel obrigatorio fica DE FORA dos defaults de proposito: o no nasce
     * reprovado pelo schema, o painel e a arvore apontam a pendencia e o export
     * fica bloqueado (RF-12) ate o autor ligar a coluna. Um KPI exportavel sem
     * medida entregaria um pacote que so sabe mostrar o estado vazio.
     *
     * O opcional nasce `''` — "declarado, nao ligado". Sem isso o no nasceria
     * pendente por causa de um campo que a maioria dos KPIs nunca liga.
     */
    for (const kind of NODE_KINDS) {
      const defaults = defaultPropsFor(kind);
      for (const field of roleFieldsOf(kind)) {
        if (field.optional === true) {
          expect(defaults[field.key], `${kind}.${field.key} nasce em branco`).toBe('');
        } else {
          expect(
            Object.keys(defaults),
            `${kind}.${field.key} nao pode ter default`,
          ).not.toContain(field.key);
        }
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

describe('prancheta do editor', () => {
  /** Spec com uma prancheta arbitraria, para exercitar o schema do campo. */
  function specWithArtboard(artboard: unknown): VisualSpec {
    const spec = createEmptySpec('Com prancheta');
    return { ...spec, project: { ...spec.project, artboard } as never };
  }

  it('projeto novo nasce com a prancheta declarada por extenso', () => {
    const spec = createEmptySpec('Novo');
    expect(spec.project.artboard).toEqual(ARTBOARD_DEFAULT);
    expect(validateSpec(spec).kind).toBe('valid');
  });

  it('projeto salvo antes do campo continua valido e recebe o default', () => {
    // O caso real: o `localStorage` de quem ja usava o editor. Uma migracao
    // obrigatoria aqui reprovaria a spec de todo mundo na primeira abertura.
    const spec = createEmptySpec('Antigo');
    delete spec.project.artboard;

    expect(validateSpec(spec).kind).toBe('valid');
    expect(artboardOf(spec)).toEqual(ARTBOARD_DEFAULT);
  });

  it('aceita os extremos da faixa', () => {
    expect(validateSpec(specWithArtboard(ARTBOARD_MIN)).kind).toBe('valid');
    expect(validateSpec(specWithArtboard(ARTBOARD_MAX)).kind).toBe('valid');
  });

  it('reprova fora da faixa, meio pixel e campo desconhecido', () => {
    expect(validateSpec(specWithArtboard({ width: 99, height: 720 })).kind).toBe('invalid');
    expect(validateSpec(specWithArtboard({ width: 1921, height: 720 })).kind).toBe('invalid');
    expect(validateSpec(specWithArtboard({ width: 1280, height: 1081 })).kind).toBe('invalid');
    expect(validateSpec(specWithArtboard({ width: 1280.5, height: 720 })).kind).toBe('invalid');
    expect(validateSpec(specWithArtboard({ width: 1280, height: 720, depth: 3 })).kind).toBe(
      'invalid',
    );
    expect(validateSpec(specWithArtboard({ width: 1280 })).kind).toBe('invalid');
  });

  it('o problema aponta o campo da prancheta, e nao a raiz', () => {
    const result = validateSpec(specWithArtboard({ width: 5000, height: 720 }));
    if (result.kind !== 'invalid') throw new Error('esperava invalido');
    expect(result.issues[0]?.path).toBe('project.artboard.width');
  });

  it('clampArtboard prende nos dois extremos e arredonda para pixel inteiro', () => {
    expect(clampArtboard({ width: 5000, height: 5000 })).toEqual(ARTBOARD_MAX);
    expect(clampArtboard({ width: -40, height: 0 })).toEqual(ARTBOARD_MIN);
    expect(clampArtboard({ width: 1280.4, height: 719.6 })).toEqual({ width: 1280, height: 720 });
  });

  it('clampArtboard troca NaN pelo default em vez de propagar', () => {
    // Um campo numerico vazio chega assim. `Math.round(NaN)` atravessa o clamp
    // inteiro sem reclamar e sairia como largura de moldura: prancheta de
    // tamanho zero, invisivel e sem erro.
    expect(clampArtboard({ width: Number.NaN, height: 400 })).toEqual({
      width: ARTBOARD_DEFAULT.width,
      height: 400,
    });
  });

  it('o resultado de clampArtboard sempre passa no schema', () => {
    for (const size of [
      { width: 0, height: 0 },
      { width: 99.4, height: 1080.6 },
      { width: 99999, height: -1 },
      { width: Number.NaN, height: Number.NaN },
    ]) {
      expect(validateSpec(specWithArtboard(clampArtboard(size))).kind).toBe('valid');
    }
  });
});

describe('os problemas apontam o campo certo', () => {
  /**
   * Um texto sem `fontSize` — campo obrigatorio do tipo, apagado a mao.
   *
   * Ate a spec 4.0.0 o sujeito aqui era um `barChart` sem papel ligado, que
   * nascia invalido de proposito. Sem campo de papel no catalogo, nenhum no
   * nasce invalido, e o jeito de chegar a este estado passa a ser o de sempre no
   * mundo real: uma spec importada ou editada a mao com um campo faltando.
   */
  function textoQuebrado() {
    const node = createNode('text');
    delete node.props.fontSize;
    return validateSpec(specWithChild(node, 'Pendente'));
  }

  it('so fala dos campos do TIPO declarado, nunca dos das outras variantes', () => {
    // Com `oneOf`, um no invalido acusava tambem "falta direction" e "falta gap"
    // — campos de container. Erro de outro tipo de no manda o usuario procurar
    // um controle que a tela dele nem tem. E o que a ADR-15 resolve com
    // `if`/`then` por kind.
    const result = textoQuebrado();
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;

    const alheios = result.issues.filter((issue) =>
      ['direction', 'gap', 'placement', 'borderColor'].some((campo) => issue.path.endsWith(campo)),
    );
    expect(alheios).toEqual([]);
  });

  it('o caminho aponta o CAMPO, no formato do walk', () => {
    // `required` do Ajv aponta o objeto; sem anexar a propriedade, o editor
    // saberia que "algo em props falta" e nao qual controle acender.
    const result = textoQuebrado();
    if (result.kind !== 'invalid') throw new Error('esperava invalido');

    expect(result.issues.map((issue) => issue.path)).toContain('root.children[0].props.fontSize');
  });

  it('nao devolve invalido com lista de problemas vazia', () => {
    const result = textoQuebrado();
    if (result.kind !== 'invalid') throw new Error('esperava invalido');
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('validacao semantica', () => {
  /*
   * ================ AS TRES REGRAS DE PAPEL ESTAO DORMENTES ==================
   * Havia aqui tres testes sobre as regras semanticas de papel, que o JSON
   * Schema nao consegue expressar e `validateSpec` verifica a mao:
   *
   *   - "rejeita no que referencia papel nao declarado"
   *   - "rejeita papel do tipo errado — grouping onde se exige measure"
   *   - "rejeita no com papel nao ligado — o default nao existe de proposito"
   *
   * Os tres precisavam de um no que DECLARASSE campo de papel, e nenhum
   * descritor declara na spec 5.0.0. As regras continuam em `schema.ts`, sem
   * nada que as acione, e voltam a morder com o KPI Card da Fase 4.
   * ==========================================================================
   */

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

  it('rejeita nomes de coluna duplicados', () => {
    const spec = createEmptySpec('Colunas repetidas');
    spec.data.columns = [DEFAULT_TABLE.columns[0]!, { ...DEFAULT_TABLE.columns[0]! }];
    spec.data.rows = spec.data.rows.map((row) => [row[0]!, row[0]!]);
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

  it('colunas default casam com o padrao de nome', () => {
    for (const column of DEFAULT_TABLE.columns) {
      expect(column.name).toMatch(new RegExp(ROLE_NAME_PATTERN));
    }
  });
});

/*
 * ================= A BATERIA DE MIGRACAO SAIU NA SPEC 5.0.0 ==================
 * Havia aqui `describe('migracao v1 -> spec atual')`, com sete testes sobre
 * `migrateV1` / `migrateToCurrent` / `isV1Config`: identidade do projeto
 * preservada (RF-10), arvore valida a partir de um config de barras e de um de
 * KPI, moldura convertida de token para pixel, titulo desligado que nao vira no.
 *
 * A cadeia inteira de migracao foi APAGADA. A 5.0.0 removeu tipos de no, e nao
 * ha ponte 4->5: mantida, `migrate.ts` continuaria rodando, produzindo spec
 * 4.0.0 e entregando-a a um validador que garantidamente reprova — apagando o
 * projeto do usuario sem dizer nada. Sem os testes de migracao acima nao ha o
 * que testar; o que protege quem tinha projeto salvo agora e a CHAVE do
 * `localStorage`, que pulou para `vislow:project:v5` e simplesmente nao procura
 * o que nao sabe ler (ver `apps/web/src/lib/persistence.ts`).
 * ============================================================================
 */

describe('T-XX: o atalho de ferramenta e unico e vem do catalogo', () => {
  /**
   * A guarda que torna seguro guardar o atalho no descritor.
   *
   * Sem ela, um tipo de no novo entraria no catalogo com a letra de outro e a
   * barra de ferramentas passaria a armar o tipo errado — em silencio, porque
   * dois botoes com a mesma tecla nao sao erro de compilacao nem de lint. E a
   * mesma classe do achado 47: catalogo cresce, consumidor nao percebe.
   */
  it('nenhuma letra se repete entre os tipos', () => {
    const letras = NODE_KINDS.map((kind) => NODE_DESCRIPTORS[kind].shortcut);
    expect(new Set(letras).size).toBe(letras.length);
  });

  it('cada atalho e uma unica letra maiuscula', () => {
    for (const kind of NODE_KINDS) {
      expect(NODE_DESCRIPTORS[kind].shortcut, `atalho de ${kind}`).toMatch(/^[A-Z]$/);
    }
  });

  /**
   * `V` e a ferramenta de SELECAO, que nao e um tipo de no e por isso nao tem
   * descritor. E a convencao de editor de desenho, e um tipo novo que a tomasse
   * deixaria o usuario sem como voltar para selecionar.
   */
  it('nenhum tipo toma o V da ferramenta de selecao', () => {
    const letras = NODE_KINDS.map((kind) => NODE_DESCRIPTORS[kind].shortcut);
    expect(letras).not.toContain('V');
  });
});
