import { describe, expect, it } from 'vitest';
import { isValidCell } from '@vislow/config-schema';
import { createEmptySpec } from './factory.js';
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

/**
 * ==================== O QUE SAIU DAQUI NA SPEC 5.0.0 ========================
 * Havia aqui uma fixture `specComGrafico()` — um grafico de barras ligado nas
 * duas colunas default — e tres testes em cima dela:
 *
 *   - "apagar a coluna tira a celula de toda linha E desliga os nos"
 *   - "trocar o tipo desliga os nos SO quando o papel muda junto"
 *   - "desliga os nos, porque o campo passa a exigir o outro tipo"
 *
 * Os tres cobriam o `unbindRole`: apagar ou reclassificar uma coluna tem de
 * APAGAR o prop do no que a referenciava, deixando-o pendente, em vez de guardar
 * o nome de uma coluna que nao existe mais.
 *
 * Nenhum descritor declara campo de papel na 5.0.0, entao NAO HA COMO LIGAR uma
 * coluna a um no — a fixture nao tem como existir e os tres ficaram sem sujeito.
 * O `unbindRole` continua em `table.ts`, chamado por toda operacao de coluna, e
 * volta a ter o que desligar com o KPI Card da Fase 4. O teste logo abaixo
 * afirma a realidade de hoje, para que a lacuna seja uma decisao registrada e
 * nao um teste que sumiu sem deixar rastro.
 * ============================================================================
 */

/** Toda operacao tem de deixar a spec valida — e a invariante que paga o modulo. */
function esperaValida(spec: VisualSpec | null): VisualSpec {
  expect(spec).not.toBeNull();
  const result = validateSpec(spec);
  if (result.kind === 'invalid') {
    throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
  }
  return result.spec;
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

  it('apagar a coluna tira a celula de toda linha', () => {
    const antes = assertValidSpec(createEmptySpec('Tabela'));
    const spec = esperaValida(removeColumn(antes, 'receita'));

    expect(spec.data.columns.map((c) => c.name)).toEqual(['regiao']);
    for (const row of spec.data.rows) expect(row).toHaveLength(1);
  });

  it('nenhum no consome coluna na 5.0.0 — a contagem de uso e sempre zero', () => {
    // Nao e um teste vazio: e a AFIRMACAO de que o catalogo atual nao declara
    // campo de papel. No dia em que o KPI Card voltar, este teste falha, e
    // falhar aqui e o lembrete de descongelar os tres testes de `unbindRole`
    // descritos no cabecalho deste arquivo.
    const spec = createEmptySpec('Sem consumidor');
    for (const column of spec.data.columns) {
      expect(bindingCount(spec, column.name)).toBe(0);
    }
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

  it('trocar o tipo troca o papel junto quando o tipo pede', () => {
    const antes = assertValidSpec(createEmptySpec('Tabela'));

    // currency -> decimal: os dois sao medida.
    expect(columnOf(esperaValida(setColumnType(antes, 'receita', 'decimal')), 'receita')?.kind).toBe(
      'measure',
    );
    // currency -> text: vira agrupamento.
    expect(columnOf(esperaValida(setColumnType(antes, 'receita', 'text')), 'receita')?.kind).toBe(
      'grouping',
    );
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
