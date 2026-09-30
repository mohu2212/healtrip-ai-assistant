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

/**
 * Builds the real AppModule through the production `configureApp`, with test config and a fake
 * Prisma — so e2e tests cover the real middleware/guards/filters without needing a database.
 */
export async function createTestApp(
  options: { env?: Record<string, string>; controllers?: ModuleMetadata['controllers'] } = {},
) {
  const config = loadEnv({
    NODE_ENV: 'test',
    LLM_PROVIDER: 'mock',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    CORS_ORIGINS: 'http://localhost:3000',
    ...options.env,
  });
  const prisma: FakePrisma = { isHealthy: vi.fn().mockResolvedValue(true) };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(AppConfig)
    .useValue(config)
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();
  return { app, prisma };
}
