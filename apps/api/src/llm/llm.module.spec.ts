import { loadEnv } from '../config/env.schema.js';
import { createLlmProvider } from './llm.module.js';
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
