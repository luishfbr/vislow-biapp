import { Module } from '@nestjs/common';
import { BuildsModule } from './builds/builds.module.js';

@Module({ imports: [BuildsModule] })
export class AppModule {}
