import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { specWithEveryKind } from '@vislow/codegen';
import { BuildsController } from './builds.controller.js';
import { BuildsService } from './builds.service.js';
import type { BuildRecord } from './types.js';

/**
 * Contrato HTTP, sem compilar nada.
 *
 * O servico e substituido por um dublê: compilar de verdade custa ~15 s e ja e
 * coberto pelo gate de aceite (`compiledVisual.e2e.test.ts`). O que se testa
 * aqui e a fronteira — codigos de status, forma do corpo, cabecalhos.
 */
class FakeBuildsService {
  public readonly records = new Map<string, BuildRecord>();
  public artifact: Buffer | undefined;
  public lastSpecName: string | undefined;

  public enqueue(spec: { project: { name: string } }): BuildRecord {
    this.lastSpecName = spec.project.name;
    const record: BuildRecord = {
      id: 'abcd1234',
      status: 'queued',
      fileName: `${spec.project.name}.pbiviz`,
      createdAt: new Date().toISOString(),
    };
    this.records.set(record.id, record);
    return record;
  }

  public find(id: string): BuildRecord | undefined {
    return this.records.get(id);
  }

  public artifactOf(id: string): { artifact: Buffer; fileName: string } | undefined {
    const record = this.records.get(id);
    if (record?.status !== 'done' || !this.artifact) return undefined;
    return { artifact: this.artifact, fileName: record.fileName };
  }
}

describe('BuildsController', () => {
  let app: INestApplication;
  let fake: FakeBuildsService;

  /**
   * `getHttpServer()` devolve `any`. Estreitar num unico ponto mantem o lint
   * com informacao de tipos util no resto do arquivo, em vez de espalhar
   * supressoes por cada chamada.
   */
  const http = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  beforeAll(async () => {
    fake = new FakeBuildsService();
    const moduleRef = await Test.createTestingModule({
      controllers: [BuildsController],
      providers: [{ provide: BuildsService, useValue: fake }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * 202, nao 201: o recurso pedido — o artefato — ainda nao existe. Responder
   * 201 faria o cliente procurar um `Location` que so passa a valer segundos
   * depois.
   */
  it('POST /builds enfileira e responde 202 com o id', async () => {
    const spec = specWithEveryKind('Vendas por Região 🚀');
    const response = await request(http())
      .post('/builds')
      .send({ spec })
      .expect(202);

    expect(response.body).toEqual({ buildId: 'abcd1234', status: 'queued' });
    expect(fake.lastSpecName).toBe('Vendas por Região 🚀');
  });

  /**
   * Spec invalida e 400 na hora, com o CAMINHO do campo. Enfileirar para falhar
   * 10 s depois trocaria um erro de formulario por um erro de build.
   */
  it('POST /builds recusa spec invalida com 400 e o caminho do campo', async () => {
    const response = await request(http())
      .post('/builds')
      .send({ spec: { schemaVersion: '2.0.0' } })
      .expect(400);

    const body = response.body as { code: string; issues: { path: string }[] };
    expect(body.code).toBe('SPEC_INVALID');
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues[0]?.path).toBeDefined();
  });

  it('POST /builds recusa corpo sem spec', async () => {
    await request(http()).post('/builds').send({}).expect(400);
  });

  it('GET /builds/:id devolve o estado', async () => {
    const response = await request(http()).get('/builds/abcd1234').expect(200);
    expect((response.body as BuildRecord).status).toBe('queued');
  });

  it('GET /builds/:id de build inexistente e 404', async () => {
    await request(http()).get('/builds/naoexiste').expect(404);
  });

  /**
   * A etapa e a posicao na fila atravessam o fio inteiras.
   *
   * Parece trivial e nao e: sao os dois campos novos do `BuildRecord`, e um
   * serializador que filtrasse propriedades desconhecidas os apagaria em
   * silencio — o editor voltaria a mostrar uma barra parada, sem nenhum erro
   * para explicar por que.
   */
  it('GET /builds/:id leva a etapa e a posicao na fila ate o cliente', async () => {
    const base = fake.records.get('abcd1234')!;

    fake.records.set('abcd1234', { ...base, status: 'queued', queuePosition: 2 });
    const waiting = await request(http()).get('/builds/abcd1234').expect(200);
    expect((waiting.body as BuildRecord).queuePosition).toBe(2);

    fake.records.set('abcd1234', { ...base, status: 'running', step: 'compiling' });
    const running = await request(http()).get('/builds/abcd1234').expect(200);
    expect((running.body as BuildRecord).step).toBe('compiling');

    fake.records.set('abcd1234', base);
  });

  /**
   * 409, nao 404: a build EXISTE, so nao terminou. Um 404 faria o cliente parar
   * de perguntar justamente quando deveria continuar esperando.
   */
  it('GET /builds/:id/artifact e 409 enquanto a build nao termina', async () => {
    const response = await request(http())
      .get('/builds/abcd1234/artifact')
      .expect(409);
    expect((response.body as { code: string }).code).toBe('BUILD_NOT_READY');
  });

  it('GET /builds/:id/artifact entrega o pacote com o nome do usuario', async () => {
    const record = fake.records.get('abcd1234')!;
    fake.records.set('abcd1234', { ...record, status: 'done' });
    fake.artifact = Buffer.from('PKpacote falso');

    const response = await request(http())
      .get('/builds/abcd1234/artifact')
      .expect(200);

    expect(response.headers['content-type']).toBe('application/octet-stream');
    // Nome com emoji nao cabe no `filename` cru: precisa da variante RFC 5987.
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(response.headers['content-disposition']).toContain('attachment;');
    expect(Buffer.from(response.body as Buffer).toString()).toContain('pacote falso');
  });
});
