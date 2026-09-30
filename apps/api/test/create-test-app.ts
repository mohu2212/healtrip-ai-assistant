import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { AppConfig, loadEnv } from '../src/config/env.schema.js';
import { PrismaService } from '../src/database/prisma.service.js';

export interface FakePrisma {
  isHealthy: ReturnType<typeof vi.fn>;
}

interface TestAppOptions {
  env?: Record<string, string>;
  controllers?: ModuleMetadata['controllers'];
  /** Replace providers (e.g. a repository) with test doubles. */
  overrides?: { provide: unknown; useValue: unknown }[];
  /** Use the real PrismaService (integration tests) instead of the fake. */
  realDatabase?: boolean;
}

/**
 * Builds the real AppModule through the production `configureApp`, with test config and — unless
 * `realDatabase` — a fake Prisma, so e2e tests cover the real middleware/guards/filters/pipes
 * without needing a database.
 */
export async function createTestApp(options: TestAppOptions = {}) {
  const config = loadEnv({
    NODE_ENV: 'test',
    LLM_PROVIDER: 'mock',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_PER_MINUTE: '1000',
    ...options.env,
  });
  const prisma: FakePrisma = { isHealthy: vi.fn().mockResolvedValue(true) };

  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(AppConfig)
    .useValue(config);
  if (!options.realDatabase) builder = builder.overrideProvider(PrismaService).useValue(prisma);
  for (const { provide, useValue } of options.overrides ?? []) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();
  return { app, prisma };
}
