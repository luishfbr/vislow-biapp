import { BUILD_STEP_ORDER } from '@vislow/build-contract';
import { describe, expect, it } from 'vitest';
import { baseOf, progressOf, weightOf, type ProgressInput } from './buildProgress';

/**
 * A barra do export.
 *
 * O que se prova aqui e o que o olho nao consegue julgar em doze segundos: que a
 * barra nunca volta, que o rastejo dentro de uma etapa nunca invade a proxima, e
 * que uma build muito mais lenta que o previsto continua se mexendo. Sao os tres
 * jeitos de uma barra de progresso mentir.
 */

const at = (input: Partial<ProgressInput> & { phase: ProgressInput['phase'] }) =>
  progressOf({ elapsedInStepMs: 0, previousRatio: 0, ...input });

describe('as fatias', () => {
  it('somam a barra inteira', () => {
    const total = BUILD_STEP_ORDER.reduce((sum, step) => sum + weightOf(step), 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('cada etapa comeca onde a anterior termina', () => {
    let expected = 0;
    for (const step of BUILD_STEP_ORDER) {
      expect(baseOf(step)).toBeCloseTo(expected, 10);
      expected += weightOf(step);
    }
    expect(expected).toBeCloseTo(1, 10);
  });

  /**
   * `pbiviz package` e ~7,5 s dos ~10,7 s medidos. Se a compilacao nao dominasse
   * a barra, ela andaria aos trancos e depois congelaria — que e exatamente o
   * defeito que este arquivo existe para impedir.
   */
  it('dao a maior parte da barra a compilacao', () => {
    expect(weightOf('compiling')).toBeGreaterThan(0.5);
    for (const step of BUILD_STEP_ORDER) {
      if (step !== 'compiling') expect(weightOf(step)).toBeLessThan(weightOf('compiling'));
    }
  });
});

describe('o rastejo dentro da etapa', () => {
  it('nunca alcanca o inicio da proxima etapa, por mais que o relogio ande', () => {
    const limit = baseOf('compiling') + weightOf('compiling');

    for (const elapsed of [0, 1_000, 7_500, 60_000, 10 ** 9]) {
      const { ratio } = at({ phase: { kind: 'running', step: 'compiling' }, elapsedInStepMs: elapsed });
      expect(ratio).toBeGreaterThanOrEqual(baseOf('compiling'));
      expect(ratio).toBeLessThan(limit);
    }
  });

  /** Uma build lenta e o caso em que a barra parada assusta. Ela precisa andar. */
  it('continua avancando depois do tempo previsto', () => {
    const running = { kind: 'running', step: 'compiling' } as const;
    const previsto = at({ phase: running, elapsedInStepMs: 7_500 }).ratio;
    const dobro = at({ phase: running, elapsedInStepMs: 15_000 }).ratio;
    const triplo = at({ phase: running, elapsedInStepMs: 22_500 }).ratio;

    expect(dobro).toBeGreaterThan(previsto);
    expect(triplo).toBeGreaterThan(dobro);
  });

  it('a troca de etapa e sempre um avanco, nao um salto para tras', () => {
    // Pior caso: a etapa anterior rastejou o quanto pode antes de a proxima chegar.
    const esgotada = at({
      phase: { kind: 'running', step: 'linking' },
      elapsedInStepMs: 10 ** 6,
    }).ratio;
    const proxima = at({ phase: { kind: 'running', step: 'compiling' }, elapsedInStepMs: 0 }).ratio;

    expect(proxima).toBeGreaterThan(esgotada);
  });
});

describe('monotonicidade', () => {
  /**
   * O poll e de 1 s e as respostas chegam fora de ordem de vez em quando. Sem
   * esta garantia, a barra recuaria na frente do usuario — o sintoma que faz
   * qualquer um concluir que o sistema esta quebrado.
   */
  it('uma etapa que chega atrasada nao faz a barra voltar', () => {
    const avancado = at({ phase: { kind: 'running', step: 'compiling' }, elapsedInStepMs: 5_000 }).ratio;
    const atrasado = progressOf({
      phase: { kind: 'running', step: 'generating' },
      elapsedInStepMs: 0,
      previousRatio: avancado,
    });

    expect(atrasado.ratio).toBe(avancado);
    // O ROTULO, porem, segue a verdade do servidor: so a barra e monotonica.
    expect(atrasado.stepIndex).toBe(BUILD_STEP_ORDER.indexOf('generating'));
  });

  it('o erro congela a barra onde ela estava', () => {
    const erro = progressOf({
      phase: { kind: 'error', message: 'A compilacao falhou.', hint: null, issues: [] },
      elapsedInStepMs: 0,
      previousRatio: 0.42,
    });

    expect(erro.ratio).toBe(0.42);
    expect(erro.label).toBe('A compilacao falhou.');
  });
});

describe('as fases sem etapa', () => {
  it('a fila fica em zero e diz quantos estao na frente', () => {
    const proxima = at({ phase: { kind: 'queued', position: 0 } });
    expect(proxima.ratio).toBe(0);
    expect(proxima.detail).toContain('próxima');
    expect(at({ phase: { kind: 'queued', position: 1 } }).detail).toContain('1 build');
    expect(at({ phase: { kind: 'queued', position: 3 } }).detail).toContain('3 builds');
  });

  it('o fim preenche a barra inteira', () => {
    const pronto = at({ phase: { kind: 'done', fileName: 'x.pbiviz', metrics: null } });
    expect(pronto.ratio).toBe(1);
    expect(pronto.stepIndex).toBe(BUILD_STEP_ORDER.length);
  });
});
