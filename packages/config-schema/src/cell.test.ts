import { describe, expect, it } from 'vitest';
import {
  cellToInput,
  coerceCell,
  COLUMN_TYPES,
  formatCell,
  isValidCell,
  parseCell,
  type CellValue,
  type ColumnType,
} from './cell.js';

describe('formatCell', () => {
  it('formata cada tipo com a convencao de pt-BR', () => {
    expect(formatCell('Sudeste', 'text')).toBe('Sudeste');
    expect(formatCell(184320, 'integer')).toBe('184.320');
    expect(formatCell(1234.5, 'decimal')).toBe('1.234,5');
    expect(formatCell(0.184, 'percent')).toBe('18,4%');
    expect(formatCell(1234.5, 'currency')).toMatch(/^R\$\s?1\.234,50$/);
    expect(formatCell(true, 'boolean')).toBe('Sim');
    expect(formatCell(false, 'boolean')).toBe('Não');
  });

  it('celula vazia vira texto vazio em qualquer tipo', () => {
    // Nao "-" nem "null": qualquer marcador inventado aqui vira uma categoria
    // com nome proprio no eixo do grafico.
    for (const type of COLUMN_TYPES) expect(formatCell(null, type), type).toBe('');
  });

  it('a data nao anda um dia para tras no fuso do Brasil', () => {
    // `new Date('2026-08-03')` e meia-noite UTC; formatar no fuso local (UTC-3)
    // devolveria 02/08. E o erro classico, e o unico motivo do `timeZone: UTC`.
    expect(formatCell('2026-08-03', 'date')).toBe('03/08/2026');
    expect(formatCell('2026-01-01', 'date')).toBe('01/01/2026');
  });
});

describe('parseCell', () => {
  it('aceita as duas convencoes de separador decimal', () => {
    // `1.234,56` sai do nosso proprio formatCell e volta por copiar e colar;
    // `1234.56` sai de qualquer planilha em ingles.
    expect(parseCell('1.234,56', 'decimal')).toBe(1234.56);
    expect(parseCell('1234.56', 'decimal')).toBe(1234.56);
    expect(parseCell('1.234.567', 'integer')).toBe(1234567);
    expect(parseCell('184320', 'integer')).toBe(184320);
  });

  it('percentual troca de unidade: digita-se 18,4 e guarda-se 0.184', () => {
    expect(parseCell('18,4', 'percent')).toBe(0.184);
    expect(parseCell('100', 'percent')).toBe(1);
    // Sem o arredondamento, 18.4/100 guarda 0.18400000000000002.
    expect(String(parseCell('18,4', 'percent'))).toBe('0.184');
  });

  it('inteiro arredonda', () => {
    expect(parseCell('12,7', 'integer')).toBe(13);
  });

  it('texto vazio e lixo viram celula vazia', () => {
    for (const type of COLUMN_TYPES) {
      expect(parseCell('', type), type).toBeNull();
      expect(parseCell('   ', type), type).toBeNull();
    }
    expect(parseCell('abc', 'currency')).toBeNull();
    expect(parseCell('2026-02-31', 'date')).toBeNull();
  });

  it('booleano aceita o que o usuario realmente digita', () => {
    for (const yes of ['Sim', 'sim', 'S', 'true', '1']) expect(parseCell(yes, 'boolean'), yes).toBe(true);
    for (const no of ['Não', 'nao', 'N', 'false', '0']) expect(parseCell(no, 'boolean'), no).toBe(false);
  });

  it('volta pelo campo de edicao sem perder o valor', () => {
    // cellToInput -> parseCell e o ciclo que acontece a cada foco/blur de
    // celula. Se ele nao for identidade, o valor deriva sozinho a cada visita.
    const casos: [CellValue, ColumnType][] = [
      [184320, 'integer'],
      [1234.56, 'decimal'],
      [0.184, 'percent'],
      [99.9, 'currency'],
      ['Sudeste', 'text'],
      ['2026-08-03', 'date'],
      [0, 'integer'],
      [null, 'decimal'],
    ];
    for (const [value, type] of casos) {
      expect(parseCell(cellToInput(value, type), type), `${String(value)} ${type}`).toEqual(value);
    }
  });
});

describe('isValidCell', () => {
  it('recusa valor que nao pertence ao tipo', () => {
    expect(isValidCell('abc', 'currency')).toBe(false);
    expect(isValidCell(12, 'text')).toBe(false);
    expect(isValidCell(12.5, 'integer')).toBe(false);
    expect(isValidCell('2026-13-01', 'date')).toBe(false);
    expect(isValidCell(Number.NaN, 'decimal')).toBe(false);
    expect(isValidCell('sim', 'boolean')).toBe(false);
  });

  it('celula vazia vale em qualquer tipo', () => {
    for (const type of COLUMN_TYPES) expect(isValidCell(null, type), type).toBe(true);
  });

  it('2026-02-31 casa o padrao mas nao existe no calendario', () => {
    // O `Date` aceita e rola para 3 de marco: a celula validaria e o preview
    // mostraria um dia que o usuario nunca digitou.
    expect(isValidCell('2026-02-31', 'date')).toBe(false);
    expect(isValidCell('2026-02-28', 'date')).toBe(true);
  });
});

describe('coerceCell', () => {
  it('converte quando da', () => {
    expect(coerceCell('1.234,5', 'decimal')).toBe(1234.5);
    expect(coerceCell(12.7, 'integer')).toBe(13);
    expect(coerceCell(184320, 'text')).toBe('184.320');
    expect(coerceCell(true, 'text')).toBe('Sim');
    expect(coerceCell('2026-08-03', 'date')).toBe('2026-08-03');
  });

  it('devolve vazio quando nao da, em vez de guardar valor invalido', () => {
    // Guardar "abc" numa coluna de moeda reprovaria a spec inteira na proxima
    // validacao e travaria o export com um erro que nao aponta para a celula.
    expect(coerceCell('abc', 'currency')).toBeNull();
    expect(coerceCell(42, 'date')).toBeNull();
    expect(coerceCell(true, 'decimal')).toBeNull();
  });

  it('o resultado SEMPRE vale para o tipo de destino', () => {
    const amostras: CellValue[] = [null, '', 'Sudeste', '1.234,5', '2026-08-03', 0, 42, 12.7, true, false];
    for (const value of amostras) {
      for (const type of COLUMN_TYPES) {
        expect(isValidCell(coerceCell(value, type), type), `${String(value)} -> ${type}`).toBe(true);
      }
    }
  });
});
