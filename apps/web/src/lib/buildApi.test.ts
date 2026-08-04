import type { BuildRecord } from '@vislow/build-contract';
import { createEmptySpec } from '@vislow/component-registry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestBuild, type BuildPhase } from './buildApi';

/**
 * O cliente da API de build.
 *
 * O que se prova aqui e o que so acontece com o servidor no meio: que o editor
 * espera ate um estado TERMINAL antes de baixar, que ele nunca lanca, e que um
 * codigo de erro do servidor vira uma frase que diz o que fazer. As tres coisas
 * so aparecem em runtime.
 */

const spec = createEmptySpec('Visual de teste');

const RECORD: BuildRecord = {
  id: 'b-1',
  status: 'done',
  fileName: 'Visual de teste.pbiviz',
  createdAt: '2026-07-30T12:00:00.000Z',
  metrics: { packageBytes: 229_500, jsBytes: 781_000, durationMs: 11_800 },
};

interface Step {
  json?: unknown;
  blob?: string;
  ok?: boolean;
}

/** Encadeia respostas na ordem em que o cliente as pede. */
function stubFetch(steps: Step[]): { calls: string[] } {
  const calls: string[] = [];
  let index = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url);
      const step = steps[Math.min(index++, steps.length - 1)] ?? {};
      return Promise.resolve({
        ok: step.ok ?? true,
        json: () => Promise.resolve(step.json),
        blob: () => Promise.resolve(new Blob([step.blob ?? ''])),
      });
    }),
  );

  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('build bem-sucedida', () => {
  it('sobe a spec, espera terminar e devolve o pacote', async () => {
    const { calls } = stubFetch([
      { json: { buildId: 'b-1', status: 'queued' } },
      { json: RECORD },
      { blob: 'PK-conteudo-do-pacote' },
    ]);

    const phases: BuildPhase['kind'][] = [];
    const result = await requestBuild(spec, (phase) => phases.push(phase.kind));

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.fileName).toBe('Visual de teste.pbiviz');
    expect(result.metrics?.packageBytes).toBe(229_500);
    expect(phases[0]).toBe('uploading');

    expect(calls[0]).toMatch(/\/builds$/);
    expect(calls[1]).toMatch(/\/builds\/b-1$/);
    expect(calls[2]).toMatch(/\/builds\/b-1\/artifact$/);
  });

  it('so baixa depois de um estado TERMINAL', async () => {
    vi.useFakeTimers();
    const { calls } = stubFetch([
      { json: { buildId: 'b-1', status: 'queued' } },
      { json: { ...RECORD, status: 'queued' } },
      { json: { ...RECORD, status: 'running' } },
      { json: RECORD },
      { blob: 'pacote' },
    ]);

    const phases: BuildPhase['kind'][] = [];
    const pending = requestBuild(spec, (phase) => phases.push(phase.kind));
    await vi.runAllTimersAsync();

    expect((await pending).kind).toBe('ok');
    // Baixar antes da hora traria um 409 do servidor, nao um pacote.
    expect(calls.filter((url) => url.endsWith('/artifact'))).toHaveLength(1);
    expect(phases).toContain('queued');
    expect(phases).toContain('running');
  });

  /**
   * A etapa e a posicao sao o unico sinal real que a barra tem. Se elas se
   * perdessem no caminho — e perder um campo num `JSON.parse` nao gera erro
   * nenhum — a interface voltaria a mostrar uma barra parada, sem sintoma.
   */
  it('repassa a etapa do servidor e a posicao na fila', async () => {
    vi.useFakeTimers();
    stubFetch([
      { json: { buildId: 'b-1', status: 'queued' } },
      { json: { ...RECORD, status: 'queued', queuePosition: 2 } },
      { json: { ...RECORD, status: 'running', step: 'compiling' } },
      { json: RECORD },
      { blob: 'pacote' },
    ]);

    const phases: BuildPhase[] = [];
    const pending = requestBuild(spec, (phase) => phases.push(phase));
    await vi.runAllTimersAsync();
    await pending;

    expect(phases).toContainEqual({ kind: 'queued', position: 2 });
    expect(phases).toContainEqual({ kind: 'running', step: 'compiling' });
  });

  /**
   * Um servidor mais velho responde sem `step`. Ali o cliente precisa escolher
   * um chute que so possa ser corrigido para a FRENTE — a primeira etapa —,
   * porque a barra e monotonica e um chute alto demais travaria o resto.
   */
  it('sem etapa no registro, assume a primeira', async () => {
    vi.useFakeTimers();
    stubFetch([
      { json: { buildId: 'b-1', status: 'queued' } },
      { json: { ...RECORD, status: 'running' } },
      { json: RECORD },
      { blob: 'pacote' },
    ]);

    const phases: BuildPhase[] = [];
    const pending = requestBuild(spec, (phase) => phases.push(phase));
    await vi.runAllTimersAsync();
    await pending;

    expect(phases).toContainEqual({ kind: 'running', step: 'validating' });
  });
});

describe('falhas', () => {
  it('spec recusada no POST vira mensagem com os problemas', async () => {
    stubFetch([
      {
        ok: false,
        json: {
          code: 'SPEC_INVALID',
          message: 'A spec do visual nao e valida.',
          issues: [{ path: 'root.children[0].props.measureRole', message: 'campo pendente' }],
        },
      },
    ]);

    const result = await requestBuild(spec, () => undefined);

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('campos pendentes');
    expect(result.issues).toHaveLength(1);
  });

  it('artefato reprovado na inspecao NAO e tratado como "tente de novo"', async () => {
    // ADR-11: o pacote existe e foi barrado de proposito. Mandar tentar de novo
    // esconderia um defeito nosso atras de um clique repetido.
    stubFetch([
      { json: { buildId: 'b-1', status: 'queued' } },
      {
        json: {
          ...RECORD,
          status: 'failed',
          error: { code: 'ARTIFACT_REJECTED', message: 'reprovado', detail: 'GUID divergente' },
        },
      },
    ]);

    const result = await requestBuild(spec, () => undefined);

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('nao passou na inspecao');
    expect(result.hint).toContain('GUID divergente');
  });

  it('servidor sem template aponta o comando de implantacao', async () => {
    stubFetch([
      { json: { buildId: 'b-1', status: 'queued' } },
      {
        json: {
          ...RECORD,
          status: 'failed',
          error: { code: 'TEMPLATE_NOT_STAGED', message: 'template ausente' },
        },
      },
    ]);

    const result = await requestBuild(spec, () => undefined);
    if (result.kind !== 'error') throw new Error('esperava erro');
    expect(result.hint).toContain('stage:vendor');
  });

  it('API fora do ar nao lanca — devolve erro com o comando para subir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await requestBuild(spec, () => undefined);

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.hint).toContain('pnpm dev:api');
  });
});
