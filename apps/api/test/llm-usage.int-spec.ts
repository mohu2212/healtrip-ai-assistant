import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../src/database/prisma.service.js';
import { LlmUsageRepository } from '../src/llm/budget/llm-usage.repository.js';
import { createTestApp } from './create-test-app.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('LLM usage counter (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const day = new Date('2000-01-01T00:00:00Z'); // a day no real traffic uses

  beforeAll(async () => {
    ({ app } = await createTestApp({
      realDatabase: true,
      env: { DATABASE_URL: TEST_DATABASE_URL! },
    }));
    prisma = app.get(PrismaService);
    await prisma.llmUsageDaily.deleteMany({ where: { day } });
  });
  afterAll(async () => {
    await prisma?.llmUsageDaily.deleteMany({ where: { day } });
    await app?.close();
  });

  // Upsert on the primary key runs as INSERT … ON CONFLICT DO UPDATE (atomic in PostgreSQL).
  // Calls are sequential here because the local Prisma dev server doesn't handle parallel connections.
  it('creates the day row and increments it on every call', async () => {
    const repo = new LlmUsageRepository(prisma);
    for (let i = 0; i < 10; i++) await repo.record(day, { inputTokens: 70, outputTokens: 30 });
    expect(await repo.tokensOn(day)).toBe(1000);
    expect((await prisma.llmUsageDaily.findUnique({ where: { day } }))?.calls).toBe(10);
  });
});
