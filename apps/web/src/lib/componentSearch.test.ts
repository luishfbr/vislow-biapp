import { NODE_KINDS } from '@vislow/component-registry';
import { describe, expect, it } from 'vitest';
import { searchComponents } from './componentSearch';

/**
 * O CATALOGO ENCOLHEU PARA DOIS TIPOS NA SPEC 5.0.0, e isso muda o que estes
 * testes conseguem afirmar.
 *
 * Varios deles mediam RANKING entre sete candidatos — "quem comeca com o termo
 * vem antes de quem apenas o contem", "dois termos restringem em vez de
 * ampliar" — e ranking entre dois nao mede quase nada. Eles nao foram
 * reescritos para casar com o catalogo de hoje: seriam testes que passam sem
 * exercitar o que tem nome. Voltam com os tipos da Fase 4.
 *
 * O que fica e o que continua tendo sujeito com dois tipos: casar por rotulo
 * ignorando acento e caixa, casar por termo alternativo que nao esta no rotulo
 * (a razao de `keywords` existir), conjuncao entre termos e a lista vazia.
 */
describe('busca de componentes', () => {
  it('consulta vazia devolve o catalogo inteiro, na ordem do registro', () => {
    expect(searchComponents('')).toEqual([...NODE_KINDS]);
    expect(searchComponents('   ')).toEqual([...NODE_KINDS]);
  });

  it('acha pelo rotulo, ignorando acento e caixa', () => {
    expect(searchComponents('TÉXTO')).toEqual(['text']);
    expect(searchComponents('container')).toEqual(['container']);
  });

  it('acha por termo alternativo que nao esta no rotulo nem na dica', () => {
    // O motivo de `keywords` existir: nenhum rotulo diz "rodape" nem "secao".
    expect(searchComponents('legenda')).toEqual(['text']);
    expect(searchComponents('secao')).toEqual(['container']);
  });

  it('dois termos restringem em vez de ampliar', () => {
    // "caixa" esta nos dois catalogos de sinonimos; "titulo" so no do texto.
    expect(searchComponents('caixa')).toHaveLength(2);
    expect(searchComponents('caixa titulo')).toEqual(['text']);
  });

  it('consulta sem correspondencia devolve lista vazia', () => {
    // O dialogo depende disto para desenhar o estado vazio em vez de uma lista
    // silenciosamente completa.
    expect(searchComponents('mapa de calor')).toEqual([]);
  });
});
