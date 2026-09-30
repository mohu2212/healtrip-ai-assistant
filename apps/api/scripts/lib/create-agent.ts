import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { AgentService } from '../../src/agent/agent.service.js';
import { CatalogRepository } from '../../src/catalog/catalog.repository.js';
import { CatalogService } from '../../src/catalog/catalog.service.js';
import { SystemClock } from '../../src/common/clock.js';
import { loadEnv } from '../../src/config/env.schema.js';
import { PrismaService } from '../../src/database/prisma.service.js';
import { createLlmProvider } from '../../src/llm/llm.module.js';
import { createToolRegistry } from '../../src/tools/tools.module.js';

/**
 * Builds the real agent (configured LLM provider + database) for CLI scripts. Explicit composition
 * instead of Nest DI because tsx doesn't emit decorator metadata — the wiring mirrors the app modules.
 */
export function createAgentForScripts() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  Logger.overrideLogger(['warn', 'error']);

  const config = loadEnv(process.env);
  const clock = new SystemClock();
  const prisma = new PrismaService(config);
  const catalog = new CatalogService(new CatalogRepository(prisma), clock);
  const llm = createLlmProvider(config);
  const agent = new AgentService(llm, createToolRegistry(catalog), clock, config);

  return { agent, catalog, config, provider: llm.name, close: () => prisma.$disconnect() };
}
