import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseOklch, readCustomProperties, type Rgb } from './contrast';

/**
 * A guarda do achado 60.
 *
 * Ate 2026-08-04 a rampa do editor reprovava em contraste em dois papeis e o CI
 * estava verde: `sky-600` com rotulo branco dava 4.10 contra o piso de 4.5, e
 * `sky-500` sobre a prancheta dava 2.77 contra o piso de 3.0. Nenhum teste olhava
 * para cor, e conferir no olho nao pega 4.10 — pega 2.0.
 *
 * Este teste le o `globals.css` DE VERDADE, nao uma copia da rampa. Uma copia
 * viraria a segunda lista que diverge na primeira edicao (o mesmo erro que o
 * `NODE_DESCRIPTORS` existe para nao deixar acontecer).
 *
 * A PRANCHETA E BRANCA NOS DOIS TEMAS. Ela representa a moldura do relatorio e
 * nao segue o tema do editor, entao `--ring` — que pinta alca, guia de encaixe e
 * anel de foco no canvas — precisa passar sobre branco nos dois. Foi exatamente
 * essa combinacao que ninguem tinha conferido: o sky passava folgado sobre o
 * chrome (7.26) e reprovava sobre a prancheta.
 */

const CSS = readFileSync(
  fileURLToPath(new URL('../app/globals.css', import.meta.url)),
  'utf8',
);

/** A prancheta, em `PreviewCanvas`, e `bg-white` literal e fora do tema. */
const PRANCHETA: Rgb = [1, 1, 1];

/** Pisos da WCAG 2.1: 4.5 para texto normal, 3.0 para elemento grafico e borda de controle. */
const TEXTO = 4.5;
const GRAFICO = 3;

/**
 * Piso DA CASA, nao da WCAG — a norma nao estabelece minimo para linha
 * decorativa. O trabalho dele e pegar o divisor invisivel: o caso em que alguem
 * aproxima `--border` do fundo e a tela perde as arestas entre painel e canvas
 * sem que nada acuse. Foi assim que `zinc-800` sobre `zinc-950` (1.34) quase
 * entrou.
 */
const DIVISOR = 1.5;

function rampa(seletor: '\\:root' | '\\.dark'): Map<string, Rgb> {
  const bloco = new RegExp(`${seletor}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS);
  const corpo = bloco?.[1];
  if (corpo === undefined) {
    throw new Error(`bloco ${seletor} nao encontrado em globals.css`);
  }
  const cores = new Map<string, Rgb>();
  for (const [nome, valor] of readCustomProperties(corpo)) {
    if (valor.startsWith('oklch(')) {
      cores.set(nome, parseOklch(valor));
    }
  }
  return cores;
}

const TEMAS = { claro: rampa('\\:root'), escuro: rampa('\\.dark') } as const;

/** Cada linha e um par que existe na tela, com o piso que se aplica a ele. */
const PARES: readonly (readonly [string, string, string, number])[] = [
  ['texto primario sobre o fundo', '--foreground', '--background', TEXTO],
  ['texto primario sobre o painel', '--card-foreground', '--card', TEXTO],
  ['texto primario sobre o popover', '--popover-foreground', '--popover', TEXTO],
  ['texto secundario sobre o fundo', '--muted-foreground', '--background', TEXTO],
  ['texto secundario sobre o painel', '--muted-foreground', '--card', TEXTO],
  ['texto secundario sobre o hover', '--muted-foreground', '--muted', TEXTO],
  ['rotulo do botao primario', '--primary-foreground', '--primary', TEXTO],
  ['botao primario sobre o fundo', '--primary', '--background', GRAFICO],
  ['botao primario sobre o painel', '--primary', '--card', GRAFICO],
  ['texto de pendencia sobre o painel', '--warning', '--card', TEXTO],
  ['texto de pendencia sobre o fundo', '--warning', '--background', TEXTO],
  ['texto de erro sobre o painel', '--destructive', '--card', TEXTO],
  ['texto de erro sobre o fundo', '--destructive', '--background', TEXTO],
  ['texto secundario sobre o secundario', '--secondary-foreground', '--secondary', TEXTO],
  ['texto do acento sobre o acento', '--accent-foreground', '--accent', TEXTO],
  ['divisor sobre o fundo', '--border', '--background', DIVISOR],
  ['divisor sobre o painel', '--border', '--card', DIVISOR],
  // `--input` e borda de CONTROLE, nao divisor: a WCAG 1.4.11 pede 3.0.
  ['borda de campo sobre o painel', '--input', '--card', GRAFICO],
  ['borda de campo sobre o fundo', '--input', '--background', GRAFICO],
  ['anel de foco sobre o fundo', '--ring', '--background', GRAFICO],
  ['anel de foco sobre o painel', '--ring', '--card', GRAFICO],
];

describe('RN-A11y: a rampa do editor passa nos pisos de contraste (achado 60)', () => {
  for (const [tema, cores] of Object.entries(TEMAS)) {
    describe(`tema ${tema}`, () => {
      for (const [rotulo, frente, fundo, piso] of PARES) {
        it(`${rotulo} atinge ${String(piso)}:1`, () => {
          const a = cores.get(frente);
          const b = cores.get(fundo);
          expect(a, `${frente} nao existe no tema ${tema}`).toBeDefined();
          expect(b, `${fundo} nao existe no tema ${tema}`).toBeDefined();
          expect(contrastRatio(a!, b!)).toBeGreaterThanOrEqual(piso);
        });
      }
    });
  }

  /**
   * O par que o achado 60 deixou passar. Nao esta no laco acima porque a
   * prancheta nao e um token: e branco literal, nos dois temas.
   */
  it('o anel de foco se ve sobre a prancheta branca nos DOIS temas', () => {
    for (const [tema, cores] of Object.entries(TEMAS)) {
      const anel = cores.get('--ring');
      expect(anel, `--ring nao existe no tema ${tema}`).toBeDefined();
      expect(
        contrastRatio(anel!, PRANCHETA),
        `--ring do tema ${tema} sobre a prancheta`,
      ).toBeGreaterThanOrEqual(GRAFICO);
    }
  });

  /**
   * `--ring` e o mesmo nos dois temas de proposito: e a parada do acento que
   * encosta na prancheta, e a prancheta nao muda com o tema. Se alguem divergir
   * os dois, o teste acima ja cobre o contraste — este cobre a INTENCAO, que e o
   * que a proxima pessoa vai querer saber.
   */
  it('--ring e a mesma parada nos dois temas, porque a prancheta nao muda', () => {
    expect(TEMAS.claro.get('--ring')).toEqual(TEMAS.escuro.get('--ring'));
  });

  it('nenhum token morto sobrou na rampa', () => {
    const vivos = [...TEMAS.escuro.keys()];
    expect(vivos.filter((nome) => nome.startsWith('--sidebar'))).toEqual([]);
    expect(vivos.filter((nome) => nome.startsWith('--chart'))).toEqual([]);
  });
});
