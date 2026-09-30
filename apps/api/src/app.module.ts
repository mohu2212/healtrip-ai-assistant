import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CatalogModule } from './catalog/catalog.module.js';
import { ClockModule } from './common/clock.js';
import { buildLoggerParams } from './common/logging/logger.config.js';
import { ConfigModule } from './config/config.module.js';
import { AppConfig } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { LlmModule } from './llm/llm.module.js';
import { ToolsModule } from './tools/tools.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: buildLoggerParams,
    }),
    // Global per-IP rate limit; expensive endpoints (chat) tighten it with @Throttle().
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: config.rateLimitPerMinute }],
      }),
    }),
    DatabaseModule,
    ClockModule,
    CatalogModule,
    LlmModule,
    ToolsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
