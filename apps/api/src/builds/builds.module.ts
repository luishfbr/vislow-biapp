import { Module } from '@nestjs/common';
import { BuildsController } from './builds.controller.js';
import { BuildsService } from './builds.service.js';
import { DEFAULT_TIMEOUT_MS } from './pipeline.js';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Module({
  controllers: [BuildsController],
  providers: [
    {
      provide: BuildsService,
      // Fabrica em vez de injecao por decorator: os parametros do servico sao
      // valores primitivos vindos do ambiente, nao dependencias — e um token de
      // DI para cada numero seria cerimonia sem ganho.
      useFactory: () =>
        new BuildsService(envNumber('VISLOW_BUILD_CONCURRENCY', 2), {
          timeoutMs: envNumber('VISLOW_BUILD_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
        }),
    },
  ],
})
export class BuildsModule {}
