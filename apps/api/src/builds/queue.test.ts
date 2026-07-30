import { describe, expect, it } from 'vitest';
import { BuildQueue } from './queue.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('BuildQueue', () => {
  it('recusa concorrencia menor que 1', () => {
    expect(() => new BuildQueue(0)).toThrow();
  });

  /**
   * O invariante que importa: um build ocupa uma CPU inteira por ~10 s. Sem
   * teto, dez pedidos simultaneos derrubam a maquina e TODOS estouram o tempo.
   */
  it('nunca roda mais tarefas que a concorrencia', async () => {
    const queue = new BuildQueue(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let running = 0;
    let peak = 0;

    const tasks = gates.map((gate) =>
      queue.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
      }),
    );

    // Deixa o laco de eventos girar para as duas primeiras entrarem.
    await Promise.resolve();
    expect(peak).toBe(2);

    for (const gate of gates) gate.resolve();
    await Promise.all(tasks);
    expect(peak).toBe(2);
  });

  it('atende em ordem de chegada', async () => {
    const queue = new BuildQueue(1);
    const order: number[] = [];
    const tasks = [1, 2, 3].map((n) =>
      queue.run(async () => {
        order.push(n);
        await Promise.resolve();
      }),
    );

    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3]);
  });

  /**
   * Uma tarefa que falha PRECISA liberar a vaga. Se nao liberasse, a primeira
   * build com erro de compilacao travaria a fila para sempre — e o sintoma
   * seria "a API parou de responder", nao "um build falhou".
   */
  it('libera a vaga mesmo quando a tarefa falha', async () => {
    const queue = new BuildQueue(1);
    await expect(queue.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(queue.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('conta quantos esperam vaga', async () => {
    const queue = new BuildQueue(1);
    const gate = deferred();
    const first = queue.run(() => gate.promise);
    await Promise.resolve();

    const second = queue.run(() => Promise.resolve());
    expect(queue.queued).toBe(1);

    gate.resolve();
    await Promise.all([first, second]);
    expect(queue.queued).toBe(0);
  });
});
