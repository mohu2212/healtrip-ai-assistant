/**
 * Manual smoke test against the configured LLM provider (costs a few tokens; not run in CI).
 *
 *   pnpm --filter @healtrip/api llm:smoke
 *
 * Verifies one full tool round-trip through the provider-neutral interface:
 * user → tool call → tool result (with verbatim native replay) → final text.
 */
import { existsSync } from 'node:fs';
import { loadEnv } from '../src/config/env.schema.js';
import { createLlmProvider } from '../src/llm/llm.module.js';
import type { LlmMessage, LlmRequest } from '../src/llm/llm.types.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = loadEnv(process.env);
const provider = createLlmProvider(config);

if (provider.name === 'mock') {
  console.log('LLM_PROVIDER=mock — nothing to smoke-test. Set anthropic/openai and an API key.');
  process.exit(0);
}

const tools: LlmRequest['tools'] = [
  {
    name: 'lookup_city_hospitals',
    description: 'Returns the number of partner hospitals in a city.',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string', description: 'City name in English' } },
      required: ['city'],
      additionalProperties: false,
    },
    strict: true,
  },
];
const system = 'You are a test assistant. Use the lookup_city_hospitals tool to answer.';
const messages: LlmMessage[] = [
  { role: 'user', text: 'How many partner hospitals are there in Cairo? Answer in one sentence.' },
];

const first = await provider.complete({ system, tools, messages });
console.log('1st call →', first.stopReason, JSON.stringify(first.blocks), first.usage, first.model);

const call = first.blocks.find((b) => b.type === 'tool_call');
if (!call || call.type !== 'tool_call') {
  console.error('✗ Expected a tool call (tool_choice is auto; the prompt steers the model).');
  process.exit(1);
}

messages.push({ role: 'assistant', blocks: first.blocks, native: first.native });
messages.push({
  role: 'tool_results',
  results: [{ toolCallId: call.id, content: JSON.stringify({ city: 'Cairo', hospitals: 2 }) }],
});

const second = await provider.complete({ system, tools, messages });
console.log('2nd call →', second.stopReason, JSON.stringify(second.blocks), second.usage);
console.log(second.stopReason === 'end_turn' ? '✓ round-trip OK' : '✗ unexpected stop reason');
