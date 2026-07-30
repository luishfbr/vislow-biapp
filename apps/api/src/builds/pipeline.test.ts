import { describe, expect, it } from 'vitest';
import { artifactFileName } from './pipeline.js';
import { contentDisposition } from './builds.controller.js';

describe('artifactFileName', () => {
  it('preserva o nome que o usuario deu, com acento e emoji', () => {
    expect(artifactFileName('Vendas por Região 🚀')).toBe('Vendas por Região 🚀.pbiviz');
  });

  /**
   * O nome atravessa um sistema de arquivos. Um `/` ou um `..\\` viraria
   * travessia de caminho no momento em que alguem salvasse o arquivo pelo nome
   * que veio no cabecalho.
   */
  it.each([
    // Os pontos sobrevivem — sao legais num nome — mas sem separador de caminho
    // nao ha travessia possivel, que e o que importa.
    ['../../etc/passwd', '.. .. etc passwd.pbiviz'],
    ['C:\\Windows\\System32', 'C Windows System32.pbiviz'],
    ['relatorio: "final"', 'relatorio final.pbiviz'],
    ['a\u0000b', 'a b.pbiviz'],
  ])('neutraliza %j', (input, expected) => {
    expect(artifactFileName(input)).toBe(expected);
  });

  it('nunca devolve nome vazio', () => {
    expect(artifactFileName('///')).toBe('visual.pbiviz');
    expect(artifactFileName('   ')).toBe('visual.pbiviz');
  });

  it('limita o comprimento', () => {
    expect(artifactFileName('x'.repeat(200))).toBe(`${'x'.repeat(60)}.pbiviz`);
  });
});

describe('contentDisposition', () => {
  it('leva o nome em ASCII e a variante UTF-8', () => {
    const header = contentDisposition('Vendas por Região.pbiviz');
    expect(header).toContain('attachment;');
    expect(header).toContain("filename*=UTF-8''");
    // O parametro `filename` cru so aceita ASCII.
    expect(header.split(';')[1]).toMatch(/^ filename="[\x20-\x7e]*"$/);
  });

  /**
   * Aspas fechariam o parametro `filename` e um cliente antigo salvaria o
   * arquivo com o nome truncado — sem erro nenhum, que e o pior tipo de falha.
   */
  it('escapa aspas e barra invertida', () => {
    const header = contentDisposition('a"b\\c.pbiviz');
    expect(header).toContain('filename="a_b_c.pbiviz"');
  });
});
