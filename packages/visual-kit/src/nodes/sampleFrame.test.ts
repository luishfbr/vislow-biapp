import { describe, expect, it } from 'vitest';
import { seriesOf, sumOf } from './frame.js';
import { sampleFrame, type SampleInput } from './sampleFrame.js';

const TABELA: SampleInput = {
  columns: [
    { name: 'regiao', displayName: 'Região', type: 'text' },
    { name: 'receita', displayName: 'Receita', type: 'currency' },
    { name: 'margem', displayName: 'Margem', type: 'percent' },
    { name: 'ativa', displayName: 'Ativa', type: 'boolean' },
  ],
  rows: [
    ['Sul', 184320, 0.184, true],
    ['Sudeste', 921450, 0.212, true],
    ['Exterior', 0, null, false],
  ],
};

describe('sampleFrame', () => {
  it('transpoe linhas em colunas, na ordem das linhas', () => {
    const frame = sampleFrame(TABELA);
    expect(frame.roles.regiao?.values).toEqual(['Sul', 'Sudeste', 'Exterior']);
    expect(frame.roles.receita?.values).toEqual([184320, 921450, 0]);
  });

  it('o titulo e o rotulo do usuario — e o que vai ao eixo e a legenda', () => {
    expect(sampleFrame(TABELA).roles.receita?.title).toBe('Receita');
  });

  it('formata cada coluna pelo TIPO dela', () => {
    // Era o que faltava: antes toda medida saia com a mesma cara, e "Receita" e
    // "Margem" ficavam indistinguiveis na tela.
    const frame = sampleFrame(TABELA);
    expect(frame.roles.receita?.formatted[0]).toMatch(/^R\$\s?184\.320,00$/);
    expect(frame.roles.margem?.formatted[0]).toBe('18,4%');
    expect(frame.roles.ativa?.formatted[2]).toBe('Não');
  });

  it('coluna nao declarada fica ausente — e o que dispara o estado vazio (RN-04)', () => {
    expect(sampleFrame(TABELA).roles.inexistente).toBeUndefined();
  });

  it('celula vazia vira valor nulo e texto vazio, nunca NaN', () => {
    const frame = sampleFrame(TABELA);
    expect(frame.roles.margem?.values[2]).toBeNull();
    expect(frame.roles.margem?.formatted[2]).toBe('');
  });

  it('booleano vira Sim/Nao nos valores brutos — o eixo nao desenha `true`', () => {
    expect(sampleFrame(TABELA).roles.ativa?.values).toEqual(['Sim', 'Sim', 'Não']);
  });

  it('duas medidas da MESMA linha ficam coerentes entre si', () => {
    // O ganho real sobre o quadro fabricado por hash: um KPI ao lado de um
    // grafico passa a contar a mesma historia, porque agora ha linha.
    const serie = seriesOf(sampleFrame(TABELA), 'regiao', 'receita');
    expect(serie?.map((ponto) => ponto.category)).toEqual(['Sul', 'Sudeste', 'Exterior']);
    expect(serie?.map((ponto) => ponto.value)).toEqual([184320, 921450, 0]);
    expect(sumOf(sampleFrame(TABELA), 'receita')?.total).toBe(1105770);
  });

  it('respeita o locale do host', () => {
    const frame = sampleFrame(TABELA, 'en-US');
    expect(frame.roles.margem?.formatted[0]).toBe('18.4%');
  });

  it('linha mais curta que a tabela nao produz `undefined` na coluna', () => {
    // O schema reprova linha curta, mas o preview roda ANTES da validacao — e
    // um `undefined` atravessaria o grafico inteiro sem erro, saindo como barra
    // de altura zero, indistinguivel de um zero real.
    const torta: SampleInput = { columns: TABELA.columns, rows: [['Sul']] };
    expect(sampleFrame(torta).roles.receita?.values).toEqual([null]);
  });
});
