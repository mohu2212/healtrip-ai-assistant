import { Logger } from '@nestjs/common';
import type { Clock } from '../../common/clock.js';
import { LlmProvider, type LlmRequest, type LlmResponse } from '../llm.types.js';
import type { LlmUsageStore } from './llm-usage.repository.js';

/**
 * Caps the paid model's token spend per UTC day. Once today's budget is used, requests go to the
 * fallback provider (the offline demo brain) until midnight UTC — the public demo keeps working
 * and the bill can't run away. Usage accounting never breaks a patient's turn: if the counter
 * can't be read or written, the request proceeds and the problem is logged.
 *
 * Switching providers in the middle of a turn is safe: the fallback reads the normalized messages,
 * and each provider only replays its own native content.
 */
export class BudgetGuardedLlmProvider extends LlmProvider {
  private readonly logger = new Logger(BudgetGuardedLlmProvider.name);
  private exhaustedDay: string | null = null;

  constructor(
    private readonly primary: LlmProvider,
    private readonly fallback: LlmProvider,
    private readonly usage: LlmUsageStore,
    private readonly clock: Clock,
    private readonly dailyTokenBudget: number,
  ) {
    super();
  }

  get name(): string {
    return this.primary.name;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const day = utcDay(this.clock.now());

    if (await this.isExhausted(day)) {
      const key = day.toISOString().slice(0, 10);
      if (this.exhaustedDay !== key) {
        this.exhaustedDay = key;
        this.logger.warn(
          { day: key, budget: this.dailyTokenBudget },
          'Daily LLM budget reached — using the fallback model',
        );
      }
      return this.fallback.complete(request);
    }

    const response = await this.primary.complete(request);
    await this.usage.record(day, response.usage).catch((err: unknown) => {
      this.logger.error({ err }, 'Could not record LLM usage');
    });
    return response;
  }

  private async isExhausted(day: Date): Promise<boolean> {
    try {
      return (await this.usage.tokensOn(day)) >= this.dailyTokenBudget;
    } catch (err) {
      this.logger.error({ err }, 'Could not read LLM usage — allowing the request');
      return false;
    }
  }
}

/** Midnight UTC of the given instant (the key of the daily counter). */
export function utcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}
