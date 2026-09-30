import type { PrismaService } from '../../database/prisma.service.js';
import type { LlmUsage } from '../llm.types.js';

/** Where daily LLM token usage is counted (a table, so the count survives restarts/sleeps). */
export interface LlmUsageStore {
  tokensOn(day: Date): Promise<number>;
  record(day: Date, usage: LlmUsage): Promise<void>;
}

export class LlmUsageRepository implements LlmUsageStore {
  constructor(private readonly prisma: PrismaService) {}

  async tokensOn(day: Date): Promise<number> {
    const row = await this.prisma.llmUsageDaily.findUnique({ where: { day } });
    return row ? row.inputTokens + row.outputTokens : 0;
  }

  /** Atomic increment (safe with concurrent requests). */
  async record(day: Date, usage: LlmUsage): Promise<void> {
    await this.prisma.llmUsageDaily.upsert({
      where: { day },
      create: { day, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, calls: 1 },
      update: {
        inputTokens: { increment: usage.inputTokens },
        outputTokens: { increment: usage.outputTokens },
        calls: { increment: 1 },
      },
    });
  }
}
