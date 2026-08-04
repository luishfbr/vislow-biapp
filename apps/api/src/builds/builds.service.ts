import { Injectable, Logger } from '@nestjs/common';
import type { VisualSpec } from '@vislow/component-registry';
import { BuildQueue } from './queue.js';
import {
  DEFAULT_TIMEOUT_MS,
  createBuildId,
  runBuildPipeline,
  type BuildOutcome,
  type PipelineOptions,
} from './pipeline.js';
import { BuildFailure, type BuildError, type BuildRecord } from './types.js';

/** Builds simultaneos. Um build ocupa uma CPU inteira por ~10 s. */
const DEFAULT_CONCURRENCY = 2;

/**
 * Quanto tempo um artefato pronto fica disponivel para download.
 *
 * Guardar em memoria e a escolha certa para o MVP — o artefato e efemero por
 * natureza, o usuario baixa em segundos — mas so vale com um teto: sem ele, uma
 * API de vida longa vira um vazamento de memoria de 200 KB por build.
 */
const ARTIFACT_TTL_MS = 30 * 60 * 1000;

interface StoredBuild {
  record: BuildRecord;
  artifact?: Buffer;
  expiresAt: number;
}

@Injectable()
export class BuildsService {
  private readonly logger = new Logger(BuildsService.name);
  private readonly builds = new Map<string, StoredBuild>();
  private readonly queue: BuildQueue;
  private readonly pipelineOptions: PipelineOptions;

  constructor(
    concurrency = DEFAULT_CONCURRENCY,
    options: PipelineOptions = { timeoutMs: DEFAULT_TIMEOUT_MS },
  ) {
    this.queue = new BuildQueue(concurrency);
    this.pipelineOptions = options;
  }

  /**
   * Enfileira e devolve na hora.
   *
   * Um build leva ~10 s: segurar a conexao HTTP por todo esse tempo entrega uma
   * barra de progresso que nao progride e morre no primeiro proxy com timeout
   * curto. O cliente recebe o id e pergunta o estado.
   */
  public enqueue(spec: VisualSpec): BuildRecord {
    const id = createBuildId();
    const record: BuildRecord = {
      id,
      status: 'queued',
      fileName: `${spec.project.name}.pbiviz`,
      createdAt: new Date().toISOString(),
    };

    this.builds.set(id, { record, expiresAt: Date.now() + ARTIFACT_TTL_MS });
    this.sweep();

    // Sem `await`: o controller responde 202 enquanto isto roda. O `void` diz
    // que a promessa e deliberadamente solta — todo erro ja vira estado do
    // registro, entao nao ha rejeicao para propagar.
    void this.process(id, spec);

    return record;
  }

  /**
   * O registro como o cliente o ve.
   *
   * A posicao na fila e DERIVADA aqui, e nao gravada: ela muda para todo mundo a
   * cada vaga que abre, e gravar significaria reescrever N registros por evento
   * para um numero que talvez ninguem consulte. Calculada na leitura, ela nunca
   * esta velha.
   */
  public find(id: string): BuildRecord | undefined {
    const record = this.builds.get(id)?.record;
    if (!record) return undefined;
    if (record.status !== 'queued') return record;

    const position = this.queue.positionOf(id);
    // `-1` e a janela entre ganhar a vaga e o `patch` para `running`: dizer
    // "ainda ha builds na frente" ali seria mentira, e `0` ja e a verdade.
    return { ...record, queuePosition: Math.max(0, position) };
  }

  /** O artefato so existe entre o fim do build e o vencimento do TTL. */
  public artifactOf(id: string): { artifact: Buffer; fileName: string } | undefined {
    const stored = this.builds.get(id);
    if (!stored?.artifact || stored.record.status !== 'done') return undefined;
    return { artifact: stored.artifact, fileName: stored.record.fileName };
  }

  private async process(id: string, spec: VisualSpec): Promise<void> {
    const started = Date.now();

    // O id e o token da fila: e o que permite responder "quantos na sua frente"
    // sem a fila conhecer o conceito de build.
    await this.queue.run(id, async () => {
      this.patch(id, { status: 'running' });
      this.logger.log(`build ${id} iniciada — ${spec.project.name}`);

      try {
        const outcome = await runBuildPipeline(spec, id, {
          ...this.pipelineOptions,
          // A etapa vira estado do registro na hora. O cliente pergunta a cada
          // segundo e le a ultima; nenhuma etapa precisa ser "entregue".
          onStep: (step) => {
            this.patch(id, { step });
          },
        });
        this.complete(id, outcome, Date.now() - started);
        this.logger.log(
          `build ${id} concluida em ${String(Date.now() - started)} ms — ` +
            `${String(outcome.packageBytes)} B`,
        );
      } catch (error) {
        const failure = toBuildError(error);
        this.patch(id, {
          status: 'failed',
          error: failure,
          finishedAt: new Date().toISOString(),
        });
        // Nivel `warn` e nao `error`: SPEC_INVALID e culpa do cliente e nao
        // merece acordar ninguem. O codigo distingue no log agregado.
        this.logger.warn(`build ${id} falhou — ${failure.code}: ${failure.message}`);
      }
    });
  }

  private complete(id: string, outcome: BuildOutcome, durationMs: number): void {
    const stored = this.builds.get(id);
    if (!stored) return;

    stored.artifact = outcome.artifact;
    stored.expiresAt = Date.now() + ARTIFACT_TTL_MS;
    stored.record = {
      ...stored.record,
      status: 'done',
      fileName: outcome.fileName,
      finishedAt: new Date().toISOString(),
      metrics: {
        packageBytes: outcome.packageBytes,
        jsBytes: outcome.jsBytes,
        durationMs,
      },
    };
  }

  private patch(id: string, patch: Partial<BuildRecord>): void {
    const stored = this.builds.get(id);
    if (stored) stored.record = { ...stored.record, ...patch };
  }

  /** Varre no enfileiramento: sem cron, sem timer pendurado nos testes. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, stored] of this.builds) {
      if (stored.expiresAt < now) this.builds.delete(id);
    }
  }
}

/**
 * Toda falha vira `BuildError` com codigo.
 *
 * O `catch` generico existe porque um erro inesperado nao pode virar 500 mudo:
 * o usuario ficaria com uma build eternamente "running" e nenhuma pista.
 */
function toBuildError(error: unknown): BuildError {
  if (error instanceof BuildFailure) {
    const built: BuildError = { code: error.code, message: error.message };
    if (error.issues) built.issues = error.issues;
    if (error.detail !== undefined && error.detail !== '') built.detail = error.detail;
    return built;
  }
  return {
    code: 'COMPILE_FAILED',
    message: error instanceof Error ? error.message : 'Falha inesperada na build.',
  };
}
