import { describe, expect, it } from 'vitest';
import { formatClockTime, formatKilobytes, formatSeconds } from './formatNumber';

/**
 * A guarda do achado 62.
 *
 * O que estes testes protegem nao e "o numero esta certo" — e que o SEPARADOR
 * seja o do leitor. Uma regressao aqui e alguem trocar `Intl` por `toFixed` de
 * volta "porque e mais simples", e o sintoma seria um ponto no lugar da virgula,
 * que ninguem nota lendo o diff.
 *
 * O espaco entre numero e unidade e insecavel (U+00A0) de proposito. Um teste que
 * o comparasse com espaco comum passaria por engano em quase todo editor, entao
 * ele e afirmado pelo ponto de codigo, nao pela aparencia.
 */

const NBSP = '\u00a0';

describe('formatKilobytes: tamanho de pacote em pt-BR', () => {
  it('usa virgula decimal, nao ponto (achado 62)', () => {
    // 1000 KB exatos nao exercitam separador nenhum; 1_265_000 bytes sim.
    expect(formatKilobytes(1_265_000)).toBe(`1.235${NBSP}KB`);
  });

  it('separa milhar com ponto, como manda o pt-BR', () => {
    expect(formatKilobytes(226_406_400)).toBe(`221.100${NBSP}KB`);
  });

  it('arredonda para inteiro', () => {
    expect(formatKilobytes(1536)).toBe(`2${NBSP}KB`);
  });

  it('liga numero e unidade com espaco insecavel', () => {
    expect(formatKilobytes(2048)).toContain(NBSP);
    expect(formatKilobytes(2048)).not.toContain(' KB');
  });
});

describe('formatSeconds: tempo decorrido', () => {
  it('mostra o decimo abaixo de 10 s, com virgula', () => {
    expect(formatSeconds(4300)).toBe(`4,3${NBSP}s`);
  });

  it('forca a casa decimal mesmo quando ela e zero', () => {
    // Sem `minimumFractionDigits` isto sairia "5 s" e a barra pareceria travada
    // entre 5,0 e 5,9.
    expect(formatSeconds(5000)).toBe(`5,0${NBSP}s`);
  });

  it('abandona o decimo a partir de 10 s', () => {
    expect(formatSeconds(42_700)).toBe(`43${NBSP}s`);
  });

  it('atravessa o limiar dos 10 s sem casa decimal', () => {
    expect(formatSeconds(10_000)).toBe(`10${NBSP}s`);
  });
});

describe('formatClockTime: hora do ultimo export', () => {
  it('usa 24 horas com dois digitos, como o pt-BR', () => {
    expect(formatClockTime(new Date(2026, 7, 4, 14, 32))).toBe('14:32');
  });

  it('preenche a hora com zero a esquerda', () => {
    expect(formatClockTime(new Date(2026, 7, 4, 9, 5))).toBe('09:05');
  });
});
