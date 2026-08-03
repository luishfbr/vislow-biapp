import { describe, expect, it } from 'vitest';
import { isV2Spec, migrateV2ToV3, type V2Spec } from './migrate.js';
import { assertValidSpec, validateSpec } from './schema.js';
import { createEmptySpec } from './factory.js';
import { SPEC_VERSION } from './spec.js';

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

  it('o projeto do usuario continua abrindo — e valido na v3', () => {
    const spec = migrateV2ToV3(V2_CONGELADA);
    expect(() => assertValidSpec(spec)).not.toThrow();
    expect(spec.schemaVersion).toBe(SPEC_VERSION);
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

    const result = validateSpec(migrateV2ToV3(minima));
    expect(result.kind).toBe('valid');
  });
});
