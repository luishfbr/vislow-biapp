import { describe, expect, it } from 'vitest';
import { isV2Spec, isV3Spec, migrateToCurrent, migrateV2ToV3, type V2Spec } from './migrate.js';
import { assertValidSpec, validateSpec } from './schema.js';
import { createEmptySpec } from './factory.js';
import { SPEC_VERSION, type VisualSpec } from './spec.js';

/**
 * Uma spec v2 REAL, escrita a mao e CONGELADA.
 *
 * Nao e construida com as funcoes de hoje de proposito. Uma fixture derivada do
 * codigo atual evolui junto com ele e passaria a testar a migracao contra o
 * formato de destino, que e exatamente o que ela nao pode fazer — no dia em que
 * a v3 mudasse, a fixture mudaria junto e o teste continuaria verde enquanto o
 * arquivo do usuario deixaria de abrir.
 *
 * O que esta em jogo: `loadProject` DESCARTA em silencio a spec que nao valida.
 * Migracao quebrada nao da erro na tela — apaga o projeto de quem abriu o
 * editor. Este e o teste que fica entre o usuario e essa perda.
 */
const V2_CONGELADA: V2Spec = {
  schemaVersion: '2.0.0',
  project: {
    id: 'VendasporRegiao7f3a',
    name: 'Vendas por Região',
    packageVersion: '1.0.0.4',
    artboard: { width: 1280, height: 720 },
  },
  dataRoles: [
    { name: 'categoria', displayName: 'Categoria', kind: 'grouping' },
    { name: 'valor', displayName: 'Valor', kind: 'measure' },
    { name: 'meta', displayName: 'Meta', kind: 'measure' },
  ],
  root: {
    id: 'container-1',
    kind: 'container',
    props: {
      placement: 'canvas',
      direction: 'column',
      gap: 'md',
      padding: 'md',
      radius: 'lg',
      border: 'thin',
      shadow: 'sm',
      background: '#ffffff',
      borderColor: '#e2e8f0',
    },
    children: [
      {
        id: 'text-2',
        kind: 'text',
        props: {
          content: 'Receita por região',
          fontSize: 'lg',
          fontWeight: 'semibold',
          align: 'left',
          color: '#0f172a',
        },
        rect: { x: 2, y: 2, w: 96, h: 14 },
      },
      {
        id: 'barChart-3',
        kind: 'barChart',
        props: {
          categoryRole: 'categoria',
          measureRole: 'valor',
          color: '#3b82f6',
          layout: 'vertical',
          showGrid: true,
          showTooltip: true,
          showXAxis: true,
          showYAxis: true,
        },
        rect: { x: 2, y: 18, w: 96, h: 80 },
      },
    ],
  },
};

describe('migracao v2 -> v3', () => {
  it('reconhece a v2 pela forma, e nao pelo numero da versao', () => {
    // Confiar no `schemaVersion` seria confiar justamente no campo que um
    // arquivo adulterado tem mais chance de trazer errado.
    expect(isV2Spec(V2_CONGELADA)).toBe(true);
    expect(isV2Spec({ ...V2_CONGELADA, schemaVersion: '9.9.9' })).toBe(true);
    expect(isV2Spec(createEmptySpec('Ja e v3'))).toBe(false);
    expect(isV2Spec(null)).toBe(false);
    expect(isV2Spec({})).toBe(false);
  });

  it('a saida NAO se declara atual — ela ainda tem medida em token', () => {
    // Carimbar `SPEC_VERSION` aqui faria a saida mentir sobre o proprio
    // formato, e o salto v3 -> v4 seria pulado por quem confiasse no numero.
    const spec = migrateV2ToV3(V2_CONGELADA);
    expect(spec.schemaVersion).not.toBe(SPEC_VERSION);
    expect(isV3Spec(spec)).toBe(true);
  });

  it('o projeto do usuario continua abrindo — valido depois da cadeia inteira', () => {
    const spec = migrateToCurrent(V2_CONGELADA);
    expect(() => { assertValidSpec(spec); }).not.toThrow();
    expect((spec as VisualSpec).schemaVersion).toBe(SPEC_VERSION);
  });

  it('preserva a identidade — sem ela o Power BI duplica em vez de atualizar (RF-10)', () => {
    const spec = migrateV2ToV3(V2_CONGELADA);
    expect(spec.project.id).toBe('VendasporRegiao7f3a');
    expect(spec.project.name).toBe('Vendas por Região');
    expect(spec.project.packageVersion).toBe('1.0.0.4');
    expect(spec.project.artboard).toEqual({ width: 1280, height: 720 });
  });

  it('preserva a arvore e as ligacoes inteiras', () => {
    const spec = migrateV2ToV3(V2_CONGELADA);
    expect(spec.root).toEqual(V2_CONGELADA.root);
  });

  it('cada papel vira uma coluna, na mesma ordem e com o mesmo nome', () => {
    // O `name` amarra a ligacao na arvore E o `capabilities.json`. Se ele mudar
    // aqui, todo no do projeto passa a apontar para coluna inexistente.
    const spec = migrateV2ToV3(V2_CONGELADA);
    expect(spec.data.columns).toEqual([
      { name: 'categoria', displayName: 'Categoria', kind: 'grouping', type: 'text' },
      { name: 'valor', displayName: 'Valor', kind: 'measure', type: 'decimal' },
      { name: 'meta', displayName: 'Meta', kind: 'measure', type: 'decimal' },
    ]);
  });

  it('o tipo adivinhado nao aperta nada que a v2 ja nao apertasse', () => {
    // Texto e decimal sao os dois tipos que nao restringem o `requiredTypes`
    // alem do que a v2 restringia. Chutar moeda ou percentual faria um projeto
    // migrado passar a RECUSAR uma coluna do modelo que antes ele aceitava.
    const spec = migrateV2ToV3(V2_CONGELADA);
    for (const column of spec.data.columns) {
      expect(column.type, column.name).toBe(column.kind === 'grouping' ? 'text' : 'decimal');
      // O papel tem de sobreviver a migracao: era ele que o no ja consumia.
      const original = V2_CONGELADA.dataRoles.find((role) => role.name === column.name);
      expect(column.kind, column.name).toBe(original?.kind);
    }
  });

  it('a tabela nasce com as linhas que o preview da v2 fabricava', () => {
    // Migrar nao pode MUDAR o desenho na tela: o usuario leria isso como o
    // editor tendo estragado a composicao dele.
    const spec = migrateV2ToV3(V2_CONGELADA);

    expect(spec.data.rows).toHaveLength(5);
    for (const row of spec.data.rows) expect(row).toHaveLength(3);

    const categorias = spec.data.rows.map((row) => row[0]);
    expect(new Set(categorias).size).toBe(5);
    expect(categorias).toContain('Centro-Oeste e Norte'); // o nome longo que quebra eixo
    expect(spec.data.rows.map((row) => row[1])).toContain(0); // o zero
  });

  it('duas medidas diferentes desenham series diferentes', () => {
    // Era o servico do `seedOf` no `mockFrame` da v2: sem ele, dois graficos
    // lado a lado ficam identicos e o preview deixa de mostrar que o usuario
    // ligou os campos trocados.
    const spec = migrateV2ToV3(V2_CONGELADA);
    const valor = spec.data.rows.map((row) => row[1]);
    const meta = spec.data.rows.map((row) => row[2]);
    expect(valor).not.toEqual(meta);
  });

  it('sobrevive a um projeto de uma coluna so', () => {
    const minima: V2Spec = {
      ...V2_CONGELADA,
      dataRoles: [{ name: 'valor', displayName: 'Valor', kind: 'measure' }],
      root: { id: 'container-1', kind: 'container', props: V2_CONGELADA.root.props, children: [] },
    };

    const result = validateSpec(migrateToCurrent(minima));
    expect(result.kind).toBe('valid');
  });
});

/**
 * Uma spec v3 REAL, escrita a mao e CONGELADA — o formato em que as medidas
 * ainda eram token.
 *
 * Este e o formato que esta no `localStorage` de TODO usuario do produto no dia
 * em que a 4.0.0 sobe, e na mesma chave (`vislow:project:v3`). Nao ha chave nova
 * para separar o antigo do novo: o que distingue os dois e a forma. Uma
 * migracao quebrada aqui nao da erro na tela — `loadProject` descarta a spec que
 * nao valida, e o projeto do usuario some.
 *
 * Escrita a mao, e nao gerada por `createEmptySpec`, pelo mesmo motivo da
 * fixture v2: uma fixture derivada do codigo de hoje evolui junto com ele e
 * passaria a testar a migracao contra o formato de destino.
 */
const V3_CONGELADA = {
  schemaVersion: '3.0.0',
  project: {
    id: 'PainelDeVendas9c21',
    name: 'Painel de vendas',
    packageVersion: '1.0.0.7',
    artboard: { width: 1280, height: 720 },
  },
  data: {
    columns: [
      { name: 'regiao', displayName: 'Regiao', kind: 'grouping', type: 'text' },
      { name: 'receita', displayName: 'Receita', kind: 'measure', type: 'currency' },
    ],
    rows: [
      ['Sul', 184320],
      ['Sudeste', 921450],
    ],
  },
  root: {
    id: 'container-1',
    kind: 'container',
    props: {
      placement: 'canvas',
      direction: 'column',
      gap: 'md',
      padding: 'lg',
      radius: 'xl',
      border: 'thin',
      shadow: 'sm',
      background: '#ffffff',
      borderColor: '#e2e8f0',
    },
    children: [
      {
        id: 'text-2',
        kind: 'text',
        props: {
          content: 'Receita por regiao',
          fontSize: '2xl',
          fontWeight: 'bold',
          align: 'left',
          color: '#0f172a',
        },
        rect: { x: 2, y: 2, w: 96, h: 14 },
      },
      {
        id: 'kpi-3',
        kind: 'kpi',
        props: {
          measureRole: 'receita',
          label: 'Total',
          valueFontSize: '4xl',
          valueColor: '#3b82f6',
          labelColor: '#64748b',
        },
        rect: { x: 2, y: 20, w: 40, h: 30 },
      },
    ],
  },
};

describe('migracao v3 -> v4 (token -> pixel)', () => {
  it('reconhece a v3 pela forma: alguma medida ainda e string', () => {
    expect(isV3Spec(V3_CONGELADA)).toBe(true);
    expect(isV3Spec(createEmptySpec('Ja e v4'))).toBe(false);
    expect(isV3Spec(null)).toBe(false);
    expect(isV3Spec({})).toBe(false);
  });

  it('acha a medida em token NO FUNDO da arvore, nao so na raiz', () => {
    // Uma raiz ja convertida a mao com um filho ainda em token existe: e o
    // estado de um arquivo editado. Olhar so a raiz deixaria o filho passar, e
    // ele seria reprovado pelo schema depois — apagando o projeto.
    const soNoFilho = {
      ...V3_CONGELADA,
      root: {
        ...V3_CONGELADA.root,
        props: { ...V3_CONGELADA.root.props, padding: 24, gap: 16, radius: 12, border: 1 },
      },
    };
    expect(isV3Spec(soNoFilho)).toBe(true);
  });

  it('o projeto salvo continua abrindo — e valido na 4.0.0', () => {
    const spec = migrateToCurrent(V3_CONGELADA);
    expect(() => { assertValidSpec(spec); }).not.toThrow();
    expect((spec as VisualSpec).schemaVersion).toBe(SPEC_VERSION);
  });

  it('cada token vira o pixel que a classe do Tailwind ja produzia', () => {
    // Se `lg` virasse 12 em vez de 24, todo projeto salvo mudaria de aparencia
    // no dia em que o usuario abrisse o editor — e ele leria isso como o
    // produto tendo estragado o trabalho dele.
    const spec = migrateToCurrent(V3_CONGELADA) as VisualSpec;
    expect(spec.root.props).toMatchObject({
      padding: 24, // lg
      gap: 16, // md
      radius: 12, // xl
      borderWidth: 1, // thin
    });
    expect(spec.root.children?.[0]?.props.fontSize).toBe(24); // 2xl
    expect(spec.root.children?.[1]?.props.valueFontSize).toBe(36); // 4xl
  });

  it('`border` some e `borderWidth` entra — o nome antigo nao pode sobrar', () => {
    // `additionalProperties: false` no schema: deixar `border` para tras
    // reprovaria a spec inteira, e o projeto seria descartado em silencio.
    const spec = migrateToCurrent(V3_CONGELADA) as VisualSpec;
    expect(spec.root.props).not.toHaveProperty('border');
    expect(spec.root.props).toHaveProperty('borderWidth');
  });

  it('o que NAO e medida atravessa intacto', () => {
    const spec = migrateToCurrent(V3_CONGELADA) as VisualSpec;
    expect(spec.root.props).toMatchObject({
      placement: 'canvas',
      shadow: 'sm',
      background: '#ffffff',
    });
    expect(spec.root.children?.[0]?.props).toMatchObject({ fontWeight: 'bold', align: 'left' });
  });

  it('preserva identidade, geometria e ligacoes', () => {
    const spec = migrateToCurrent(V3_CONGELADA) as VisualSpec;
    expect(spec.project.id).toBe('PainelDeVendas9c21');
    expect(spec.project.packageVersion).toBe('1.0.0.7');
    expect(spec.root.children?.[0]?.rect).toEqual({ x: 2, y: 2, w: 96, h: 14 });
    expect(spec.root.children?.[1]?.props.measureRole).toBe('receita');
  });

  it('token inventado cai no default do campo, nao em zero', () => {
    // Zero produziria um componente colado nas bordas e um texto de 0px — que
    // se leem como defeito do editor, e nao como "o arquivo estava estranho".
    const adulterada = {
      ...V3_CONGELADA,
      root: { ...V3_CONGELADA.root, props: { ...V3_CONGELADA.root.props, padding: 'gigantesco' } },
    };
    const spec = migrateToCurrent(adulterada) as VisualSpec;
    expect(spec.root.props.padding).toBe(16); // o default do descritor
    expect(validateSpec(spec).kind).toBe('valid');
  });

  it('migrar duas vezes nao muda mais nada', () => {
    // `loadProject` chama o migrador em TODA leitura, inclusive na de uma spec
    // ja atual. Uma segunda passagem que mexesse em algo corromperia o projeto
    // a cada abertura do editor.
    const uma = migrateToCurrent(V3_CONGELADA);
    expect(migrateToCurrent(uma)).toEqual(uma);
  });
});
