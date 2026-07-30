import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { assertTemplateStaged } from '@vislow/visual-template';
import { AppModule } from './app.module.js';

/**
 * A spec de um visual grande e um JSON de alguns KB, nao de alguns MB. O teto
 * baixo e a defesa mais barata contra um corpo gigante ocupar memoria antes de
 * qualquer validacao.
 */
const MAX_BODY = '256kb';

async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');

  // Falhar aqui, e nao na primeira build, e o que distingue "erro de
  // implantacao" de "erro do usuario". Sem isto, um servidor sem o template
  // preparado aceita pedidos e reprova todos, um a um.
  await assertTemplateStaged();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.useBodyParser('json', { limit: MAX_BODY });

  // O editor e um export estatico, servido de outra origem.
  app.enableCors({ origin: process.env.VISLOW_CORS_ORIGIN ?? '*' });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  logger.log(`API de build ouvindo em http://localhost:${String(port)}`);
}

await bootstrap();
