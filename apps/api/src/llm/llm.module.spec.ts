import { loadEnv } from '../config/env.schema.js';
import { createLlmProvider } from './llm.module.js';
import { BudgetGuardedLlmProvider } from './budget/budget-guarded.provider.js';
import type { LlmUsageStore } from './budget/llm-usage.repository.js';
import { AnthropicLlmProvider } from './providers/anthropic.provider.js';
import { OpenAiLlmProvider } from './providers/openai.provider.js';
import { ScriptedLlmProvider } from './providers/scripted.provider.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost/db' };

describe('createLlmProvider', () => {
  it.each([
    [{ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }, AnthropicLlmProvider],
    [{ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }, OpenAiLlmProvider],
    [{ LLM_PROVIDER: 'mock' }, ScriptedLlmProvider],
  ])('selects the provider from config (%j)', (env, expected) => {
    expect(createLlmProvider(loadEnv({ ...base, ...env }))).toBeInstanceOf(expected);
  });
});

describe('createLlmProvider with a daily budget', () => {
  const budget = {
    usage: { tokensOn: async () => 0, record: async () => {} } satisfies LlmUsageStore,
    clock: { now: () => new Date() },
  };

  it('wraps the paid provider when a budget is configured', () => {
    const config = loadEnv({
      ...base,
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'k',
      LLM_DAILY_TOKEN_BUDGET: '1000',
    });
    expect(createLlmProvider(config, budget)).toBeInstanceOf(BudgetGuardedLlmProvider);
  });

  it('does not wrap without a budget or for the demo brain', () => {
    const noBudget = loadEnv({ ...base, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' });
    expect(createLlmProvider(noBudget, budget)).toBeInstanceOf(AnthropicLlmProvider);
    const mock = loadEnv({ ...base, LLM_PROVIDER: 'mock', LLM_DAILY_TOKEN_BUDGET: '1000' });
    expect(createLlmProvider(mock, budget)).toBeInstanceOf(ScriptedLlmProvider);
  });
});
