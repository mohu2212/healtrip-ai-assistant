import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AgentModule } from './agent/agent.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { isChatThrottled } from './chat/chat-throttle.js';
import { ChatModule } from './chat/chat.module.js';
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
    // Per-client rate limits: a global one, plus a stricter "chat" limit that only applies to
    // routes marked @ChatThrottle() (each chat message costs LLM calls).
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: config.rateLimitPerMinute },
          {
            name: 'chat',
            ttl: 60_000,
            limit: config.chat.rateLimitPerMinute,
            skipIf: (context) => !isChatThrottled(context),
          },
        ],
      }),
    }),
    DatabaseModule,
    ClockModule,
    CatalogModule,
    LlmModule,
    ToolsModule,
    AgentModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
