import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { validateSpec } from '@vislow/component-registry';
import { BuildsService } from './builds.service.js';
import type { BuildRecord } from './types.js';

/**
 * Contrato da API de build.
 *
 *   POST /builds              { spec }  -> 202 { buildId, status }
 *   GET  /builds/:id                    -> { status, error? , metrics? }
 *   GET  /builds/:id/artifact           -> .pbiviz
 */
@Controller('builds')
export class BuildsController {
  constructor(private readonly builds: BuildsService) {}

  /**
   * 202, nao 201: o recurso pedido — o artefato — ainda nao existe. O cliente
   * recebe o id e acompanha por `GET /builds/:id`.
   */
  @Post()
  @HttpCode(202)
  public create(@Body() body: unknown): { buildId: string; status: string } {
    const spec = (body as { spec?: unknown } | null)?.spec;

    // Validar aqui, e nao so no pipeline, e o que separa "pedido invalido" de
    // "build que falhou": um erro de campo vira 400 na hora, com o caminho do
    // campo, em vez de virar uma build enfileirada que morre 10 s depois.
    const validation = validateSpec(spec);
    if (validation.kind === 'invalid') {
      throw new BadRequestException({
        code: 'SPEC_INVALID',
        message: 'A spec do visual nao e valida.',
        issues: validation.issues,
      });
    }

    const record = this.builds.enqueue(validation.spec);
    return { buildId: record.id, status: record.status };
  }

  @Get(':id')
  public status(@Param('id') id: string): BuildRecord {
    const record = this.builds.find(id);
    if (!record) throw new NotFoundException({ code: 'BUILD_NOT_FOUND', message: 'Build inexistente ou expirada.' });
    return record;
  }

  @Get(':id/artifact')
  public download(@Param('id') id: string, @Res() response: Response): void {
    const record = this.builds.find(id);
    if (!record) {
      throw new NotFoundException({ code: 'BUILD_NOT_FOUND', message: 'Build inexistente ou expirada.' });
    }

    const ready = this.builds.artifactOf(id);
    if (!ready) {
      // 409 e nao 404: a build EXISTE, so nao terminou (ou falhou). Um 404 aqui
      // faria o cliente parar de perguntar, quando ele deveria seguir esperando.
      throw new ConflictException({
        code: 'BUILD_NOT_READY',
        message: `A build esta "${record.status}".`,
        status: record.status,
      });
    }

    response.setHeader('Content-Type', 'application/octet-stream');
    // `attachment` com nome ASCII e a variante `filename*`: o nome do visual
    // pode ter acento e emoji, que nao cabem no `filename` cru.
    response.setHeader('Content-Disposition', contentDisposition(ready.fileName));
    response.setHeader('Content-Length', String(ready.artifact.byteLength));
    response.end(ready.artifact);
  }
}

/**
 * `Content-Disposition` com nome nao-ASCII (RFC 5987/6266).
 *
 * O nome ja foi saneado no pipeline; aqui o que importa e o ESCAPE: aspas e
 * barras invertidas fechariam o parametro `filename` e um navegador antigo
 * salvaria o arquivo com o nome truncado, sem erro nenhum.
 */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
