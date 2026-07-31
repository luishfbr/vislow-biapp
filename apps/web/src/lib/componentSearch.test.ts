import { NODE_KINDS } from '@vislow/component-registry';
import { describe, expect, it } from 'vitest';
import { searchComponents } from './componentSearch';

describe('busca de componentes', () => {
  it('consulta vazia devolve o catalogo inteiro, na ordem do registro', () => {
    expect(searchComponents('')).toEqual([...NODE_KINDS]);
    expect(searchComponents('   ')).toEqual([...NODE_KINDS]);
  });

  it('acha pelo rotulo, ignorando acento e caixa', () => {
    expect(searchComponents('ÁREA')).toEqual(['areaChart']);
    expect(searchComponents('pizza')).toEqual(['pieChart']);
  });

  it('acha por termo alternativo que nao esta no rotulo nem na dica', () => {
    // O motivo de `keywords` existir: nenhum rotulo diz "donut" ou "cartao".
    expect(searchComponents('donut')).toEqual(['pieChart']);
    expect(searchComponents('cartao')).toEqual(['kpi']);
    expect(searchComponents('tempo')).toEqual(['lineChart', 'areaChart']);
  });

  it('quem comeca com o termo vem antes de quem apenas o contem', () => {
    // "Barras" vem antes de "Area" no registro, mas so "Area" COMECA com "ar" —
    // a relevancia manda, senao a primeira linha do dialogo (a que o Enter
    // adiciona) seria a errada.
    // "ar" ainda casa varios termos alternativos ("empilhar", "cartao"), e por
    // isso a assertiva e sobre a ORDEM, nao sobre o conjunto.
    expect(searchComponents('ar').slice(0, 2)).toEqual(['areaChart', 'barChart']);
  });

  it('acha pela dica quando o termo nao esta em lugar nenhum mais', () => {
    expect(searchComponents('categorias')).toContain('barChart');
  });

  it('dois termos restringem em vez de ampliar', () => {
    const um = searchComponents('grafico');
    const dois = searchComponents('grafico tempo');
    expect(um.length).toBeGreaterThan(dois.length);
    expect(dois).toEqual(['lineChart', 'areaChart']);
  });

  it('consulta sem correspondencia devolve lista vazia', () => {
    // O dialogo depende disto para desenhar o estado vazio em vez de uma lista
    // silenciosamente completa.
    expect(searchComponents('mapa de calor')).toEqual([]);
  });
});
