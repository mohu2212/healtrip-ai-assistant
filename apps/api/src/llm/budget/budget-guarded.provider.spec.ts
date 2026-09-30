import { Logger } from '@nestjs/common';
import type { Clock } from '../../common/clock.js';
import type { LlmRequest, LlmUsage } from '../llm.types.js';
import { ScriptedLlmProvider, scripted } from '../providers/scripted.provider.js';
import { BudgetGuardedLlmProvider, utcDay } from './budget-guarded.provider.js';
import type { LlmUsageStore } from './llm-usage.repository.js';

class MemoryUsage implements LlmUsageStore {
  readonly days = new Map<string, number>();
  async tokensOn(day: Date) {
    return this.days.get(day.toISOString()) ?? 0;
  }
  async record(day: Date, usage: LlmUsage) {
    const key = day.toISOString();
    this.days.set(key, (this.days.get(key) ?? 0) + usage.inputTokens + usage.outputTokens);
  }
}

const request: LlmRequest = { system: 's', tools: [], messages: [{ role: 'user', text: 'hi' }] };
const withUsage = (inputTokens: number, outputTokens: number) => ({
  ...scripted.text('from primary'),
  usage: { inputTokens, outputTokens },
  model: 'claude-opus-5-5',
});

describe('BudgetGuardedLlmProvider', () => {
  let now: Date;
  let usage: MemoryUsage;
  let primary: ScriptedLlmProvider;
  let fallback: ScriptedLlmProvider;
  let guarded: BudgetGuardedLlmProvider;

  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterAll(() => vi.restoreAllMocks());

  beforeEach(() => {
    now = new Date('2026-10-01T22:00:00Z');
    usage = new MemoryUsage();
    primary = new ScriptedLlmProvider(() => withUsage(600, 400)); // 1000 tokens per call
    fallback = new ScriptedLlmProvider(() => scripted.text('from demo brain'));
    const clock: Clock = { now: () => now };
    guarded = new BudgetGuardedLlmProvider(primary, fallback, usage, clock, 2500);
  });

  it('uses the paid model and records its usage while under budget', async () => {
    const response = await guarded.complete(request);
    expect(response.model).toBe('claude-opus-5-5');
    expect(await usage.tokensOn(utcDay(now))).toBe(1000);
    expect(guarded.name).toBe('mock'); // reports the primary's name
  });

  it('switches to the fallback once the daily budget is used, until the next UTC day', async () => {
    for (let i = 0; i < 3; i++) await guarded.complete(request); // 3000 ≥ 2500
    const capped = await guarded.complete(request);
    expect(capped.blocks).toEqual([{ type: 'text', text: 'from demo brain' }]);
    expect(primary.requests).toHaveLength(3);

    now = new Date('2026-10-02T00:00:01Z'); // new UTC day → budget resets
    expect((await guarded.complete(request)).model).toBe('claude-opus-5-5');
  });

  it('never breaks a turn because usage accounting fails', async () => {
    vi.spyOn(usage, 'tokensOn').mockRejectedValue(new Error('db down'));
    vi.spyOn(usage, 'record').mockRejectedValue(new Error('db down'));
    await expect(guarded.complete(request)).resolves.toMatchObject({ model: 'claude-opus-5-5' });
  });

  it('computes the UTC day key', () => {
    expect(utcDay(new Date('2026-10-01T23:59:59+02:00')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
});
