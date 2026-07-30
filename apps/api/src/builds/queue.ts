/**
 * Fila com concorrencia limitada, em processo.
 *
 * Um build custa ~10 s de CPU cheia (medido: 2 s de `npm ci` com cache + 7,5 s
 * de `pbiviz package`). Sem limite, dez requisicoes simultaneas derrubam a
 * maquina e TODAS estouram o tempo — falha pior do que enfileirar.
 *
 * In-process de proposito, para o MVP. A interface e estreita justamente para
 * que trocar por BullMQ seja substituir esta classe, quando doer: quando a API
 * precisar de mais de uma instancia, ou quando perder a fila num restart deixar
 * de ser aceitavel.
 */
export class BuildQueue {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly concurrency: number) {
    if (concurrency < 1) throw new Error('A concorrencia da fila precisa ser >= 1.');
  }

  /** Quantos builds esperam por uma vaga. Vai para o `GET /builds/:id`. */
  public get queued(): number {
    return this.waiting.length;
  }

  public async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running += 1;
    try {
      return await task();
    } finally {
      this.running -= 1;
      // `shift`, nao `pop`: quem chegou primeiro roda primeiro. Com `pop`, uma
      // fila que nunca esvazia deixaria o primeiro pedido esperando para sempre.
      this.waiting.shift()?.();
    }
  }
}
