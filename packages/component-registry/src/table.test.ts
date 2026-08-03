import { describe, expect, it } from 'vitest';
import { isValidCell } from '@vislow/config-schema';
import { createEmptySpec, createNode } from './factory.js';
import { assertValidSpec, validateSpec } from './schema.js';
import { MAX_COLUMNS, MAX_ROWS, type VisualSpec } from './spec.js';
import {
  addColumn,
  addRow,
  bindingCount,
  columnOf,
  removeColumn,
  removeRow,
  setCell,
  setColumnKind,
  setColumnLabel,
  setColumnType,
} from './table.js';

/** Projeto com um grafico ligado nas duas colunas default (`regiao`/`receita`). */
function specComGrafico(): VisualSpec {
  const spec = createEmptySpec('Tabela');
  const bar = createNode('barChart', { categoryRole: 'regiao', measureRole: 'receita' });
  bar.rect = { x: 0, y: 0, w: 100, h: 100 };
  spec.root.children = [bar];
  return assertValidSpec(spec);
}

/** Toda operacao tem de deixar a spec valida — e a invariante que paga o modulo. */
function esperaValida(spec: VisualSpec | null): VisualSpec {
  expect(spec).not.toBeNull();
  const result = validateSpec(spec);
  if (result.kind === 'invalid') {
    throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
  }
  return result.spec;
}

/**
 * Operacao que deu certo, mas cuja spec fica INVALIDA de proposito.
 *
 * E o caso de toda operacao que desliga no: `unbindRole` APAGA o prop, e o
 * schema exige todo campo do descritor. O no volta ao estado de recem-criado —
 * pendente na tela, export travado — em vez de guardar o nome de uma coluna que
 * nao existe mais. A alternativa (deixar o nome apagado no prop) produziria um
 * pacote pedindo ao Power BI uma coluna que nenhum no le.
 */
function esperaPendente(spec: VisualSpec | null, campo: string): VisualSpec {
  expect(spec).not.toBeNull();
  const result = validateSpec(spec);
  expect(result.kind).toBe('invalid');
  if (result.kind === 'invalid') {
    expect(result.issues.some((issue) => issue.path.endsWith(campo))).toBe(true);
  }
  return spec!;
}

describe('colunas', () => {
  it('coluna nova entra com celula vazia em toda linha', () => {
    const spec = esperaValida(addColumn(createEmptySpec('Projeto'), 'Margem', 'percent'));

    expect(spec.data.columns).toHaveLength(3);
    expect(columnOf(spec, 'margem')).toEqual({
      name: 'margem',
      displayName: 'Margem',
      kind: 'measure', // derivado de `percent`
      type: 'percent',
    });
    for (const row of spec.data.rows) {
      expect(row).toHaveLength(3);
      expect(row[2]).toBeNull();
    }
  });

  it('nome de coluna repetido ganha sufixo, e o rotulo fica como o usuario escreveu', () => {
    const spec = esperaValida(addColumn(createEmptySpec('Projeto'), 'Região', 'text'));
    expect(spec.data.columns.map((c) => c.name)).toEqual(['regiao', 'receita', 'regiao2']);
    expect(columnOf(spec, 'regiao2')?.displayName).toBe('Região');
  });

  it('recusa passar do teto de colunas', () => {
    let spec = createEmptySpec('Projeto');
    while (spec.data.columns.length < MAX_COLUMNS) {
      spec = esperaValida(addColumn(spec, `Coluna ${String(spec.data.columns.length)}`, 'decimal'));
    }
    expect(addColumn(spec, 'Uma a mais', 'text')).toBeNull();
  });

  it('apagar a coluna tira a celula de toda linha E desliga os nos', () => {
    const antes = specComGrafico();
    expect(bindingCount(antes, 'receita')).toBe(1);

    const spec = esperaPendente(removeColumn(antes, 'receita'), 'measureRole');

    expect(spec.data.columns.map((c) => c.name)).toEqual(['regiao']);
    for (const row of spec.data.rows) expect(row).toHaveLength(1);
    expect(bindingCount(spec, 'receita')).toBe(0);
    expect(spec.root.children?.[0]?.props.measureRole).toBeUndefined();
  });

  it('a ultima coluna nao sai', () => {
    const spec = esperaValida(removeColumn(createEmptySpec('Projeto'), 'receita'));
    expect(removeColumn(spec, 'regiao')).toBeNull();
  });

  it('so o rotulo muda; o nome e imutavel (ADR-13)', () => {
    const spec = esperaValida(setColumnLabel(createEmptySpec('Projeto'), 'receita', 'Faturamento'));
    expect(columnOf(spec, 'receita')?.displayName).toBe('Faturamento');
    expect(columnOf(spec, 'receita')?.name).toBe('receita');
  });
});

describe('troca de tipo', () => {
  it('converte a coluna inteira e re-deriva o papel', () => {
    const spec = esperaValida(setColumnType(createEmptySpec('Projeto'), 'receita', 'text'));

    expect(columnOf(spec, 'receita')?.kind).toBe('grouping');
    // 184320 (moeda) vira o texto que o usuario lia na celula.
    expect(spec.data.rows[0]?.[1]).toBe('184.320');
  });

  it('o valor que nao cabe no tipo novo vira celula vazia, nunca lixo', () => {
    // Guardar "Sul" numa coluna de moeda reprovaria a spec inteira na proxima
    // validacao, com um erro que aponta para o no e nao para a celula.
    const spec = esperaValida(setColumnType(createEmptySpec('Projeto'), 'regiao', 'currency'));

    expect(columnOf(spec, 'regiao')?.type).toBe('currency');
    for (const row of spec.data.rows) expect(row[0]).toBeNull();
  });

  it('trocar o tipo desliga os nos SO quando o papel muda junto', () => {
    const antes = specComGrafico();

    // currency -> decimal: os dois sao medida, a ligacao sobrevive.
    const mesmoPapel = esperaValida(setColumnType(antes, 'receita', 'decimal'));
    expect(bindingCount(mesmoPapel, 'receita')).toBe(1);

    // currency -> text: vira agrupamento, e o campo exigia medida.
    const outroPapel = esperaPendente(setColumnType(antes, 'receita', 'text'), 'measureRole');
    expect(bindingCount(outroPapel, 'receita')).toBe(0);
  });

  it('trocar para o mesmo tipo e operacao ilegal, nao no-op silencioso', () => {
    expect(setColumnType(createEmptySpec('Projeto'), 'receita', 'currency')).toBeNull();
  });
});

describe('troca manual de papel', () => {
  it('o "Ano" pode ser inteiro E agrupar', () => {
    let spec = esperaValida(addColumn(createEmptySpec('Projeto'), 'Ano', 'integer'));
    expect(columnOf(spec, 'ano')?.kind).toBe('measure'); // default do tipo

    spec = esperaValida(setColumnKind(spec, 'ano', 'grouping'));
    expect(columnOf(spec, 'ano')?.kind).toBe('grouping');
    expect(columnOf(spec, 'ano')?.type).toBe('integer'); // o tipo nao se mexe
  });

  it('desliga os nos, porque o campo passa a exigir o outro tipo', () => {
    const spec = esperaPendente(setColumnKind(specComGrafico(), 'receita', 'grouping'), 'measureRole');
    expect(bindingCount(spec, 'receita')).toBe(0);
  });
});

describe('linhas e celulas', () => {
  it('linha nova nasce toda vazia, com uma celula por coluna', () => {
    const spec = esperaValida(addRow(createEmptySpec('Projeto')));
    expect(spec.data.rows).toHaveLength(6);
    expect(spec.data.rows[5]).toEqual([null, null]);
  });

  it('recusa passar do teto de linhas', () => {
    let spec = createEmptySpec('Projeto');
    while (spec.data.rows.length < MAX_ROWS) spec = esperaValida(addRow(spec));
    expect(addRow(spec)).toBeNull();
  });

  it('a ultima linha nao sai — preview sem linha nenhuma parece visual quebrado', () => {
    let spec = createEmptySpec('Projeto');
    while (spec.data.rows.length > 1) spec = esperaValida(removeRow(spec, 0));
    expect(removeRow(spec, 0)).toBeNull();
  });

  it('a celula e prendida ao tipo da coluna', () => {
    const spec = esperaValida(setCell(createEmptySpec('Projeto'), 0, 1, 'nao e numero'));
    expect(spec.data.rows[0]?.[1]).toBeNull();

    const ok = esperaValida(setCell(createEmptySpec('Projeto'), 0, 1, 42));
    expect(ok.data.rows[0]?.[1]).toBe(42);
  });

  it('celula fora da tabela e operacao ilegal', () => {
    const spec = createEmptySpec('Projeto');
    expect(setCell(spec, 99, 0, 'x')).toBeNull();
    expect(setCell(spec, 0, 99, 'x')).toBeNull();
  });
});

describe('a tabela nunca sai de um estado valido', () => {
  it('uma sequencia de edicoes mantem linha e tipo em dia', () => {
    // O que o schema cobra depois — comprimento de linha e tipo de celula — as
    // operacoes tem de manter sozinhas. Sem isso, o usuario so descobre a
    // quebra na hora de exportar, num erro que fala de outra coisa.
    let spec: VisualSpec = createEmptySpec('Sequencia');
    spec = esperaValida(addColumn(spec, 'Margem', 'percent'));
    spec = esperaValida(addRow(spec));
    spec = esperaValida(setCell(spec, 5, 0, 'Centro'));
    spec = esperaValida(setCell(spec, 5, 2, 0.42));
    spec = esperaValida(setColumnType(spec, 'margem', 'integer'));
    spec = esperaValida(removeColumn(spec, 'receita'));
    spec = esperaValida(removeRow(spec, 0));

    for (const row of spec.data.rows) {
      expect(row).toHaveLength(spec.data.columns.length);
      row.forEach((cell, index) => {
        expect(isValidCell(cell, spec.data.columns[index]!.type)).toBe(true);
      });
    }
  });
});
