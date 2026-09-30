import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmRequest } from '../llm.types.js';
import { AnthropicLlmProvider, type AnthropicClient } from './anthropic.provider.js';

const OPTIONS = { model: 'claude-opus-5-5', effort: 'medium', maxTokens: 16000 } as const;

const TOOL = {
  name: 'search_doctors',
  description: 'Search doctors',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  },
  strict: true,
};

function apiResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Hello', citations: null }],
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80 },
    ...overrides,
  };
}

function setup(response: unknown = apiResponse()) {
  const create = vi.fn().mockResolvedValue(response);
  const client = { beta: { messages: { create } } } as unknown as AnthropicClient;
  return { provider: new AnthropicLlmProvider(client, OPTIONS), create };
}

const request = (messages: LlmRequest['messages']): LlmRequest => ({
  system: 'You are a triage assistant.',
  tools: [TOOL],
  messages,
});

describe('AnthropicLlmProvider', () => {
  it('builds the request: strict tools, explicit effort, prompt caching, refusal fallback', async () => {
    const { provider, create } = setup();
    await provider.complete(request([{ role: 'user', text: 'I have chest pain' }]));

    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: 'You are a triage assistant.',
      messages: [{ role: 'user', content: 'I have chest pain' }],
      tools: [
        {
          name: 'search_doctors',
          description: 'Search doctors',
          input_schema: TOOL.inputSchema,
          strict: true,
        },
      ],
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    // Forced tool choice is rejected by current models; thinking stays at the model default.
    expect(params).not.toHaveProperty('tool_choice');
    expect(params).not.toHaveProperty('thinking');
  });

  it('replays native assistant content verbatim (thinking blocks included)', async () => {
    const native = [
      { type: 'thinking', thinking: '', signature: 'sig-abc' },
      { type: 'tool_use', id: 'toolu_1', name: 'search_doctors', input: { city: 'Cairo' } },
    ];
    const { provider, create } = setup();
    await provider.complete(
      request([
        { role: 'user', text: 'Find a cardiologist in Cairo' },
        {
          role: 'assistant',
          blocks: [
            { type: 'tool_call', id: 'toolu_1', name: 'search_doctors', input: { city: 'Cairo' } },
          ],
          native: { provider: 'anthropic', content: native },
        },
        {
          role: 'tool_results',
          results: [
            { toolCallId: 'toolu_1', content: '{"doctors":[]}' },
            { toolCallId: 'toolu_2', content: '{"error":"bad input"}', isError: true },
          ],
        },
      ]),
    );

    const { messages } = create.mock.calls[0][0];
    expect(messages[1]).toEqual({ role: 'assistant', content: native });
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"doctors":[]}' },
        {
          type: 'tool_result',
          tool_use_id: 'toolu_2',
          content: '{"error":"bad input"}',
          is_error: true,
        },
      ],
    });
  });

  it('rebuilds assistant turns that came from another provider', async () => {
    const { provider, create } = setup();
    await provider.complete(
      request([
        { role: 'user', text: 'hi' },
        {
          role: 'assistant',
          blocks: [{ type: 'text', text: 'Hello' }],
          native: { provider: 'openai', content: { role: 'assistant' } },
        },
      ]),
    );
    expect(create.mock.calls[0][0].messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello' }],
    });
  });

  it('maps the response: text and tool calls only, thinking kept in native', async () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Let me search.', citations: null },
      { type: 'tool_use', id: 'toolu_9', name: 'search_doctors', input: { city: 'Dubai' } },
    ];
    const { provider } = setup(apiResponse({ stop_reason: 'tool_use', content }));
    const result = await provider.complete(request([{ role: 'user', text: 'hi' }]));

    expect(result).toEqual({
      stopReason: 'tool_use',
      blocks: [
        { type: 'text', text: 'Let me search.' },
        { type: 'tool_call', id: 'toolu_9', name: 'search_doctors', input: { city: 'Dubai' } },
      ],
      native: { provider: 'anthropic', content },
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 80 },
      model: 'claude-opus-5-5',
    });
  });

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'max_tokens'],
    ['model_context_window_exceeded', 'max_tokens'],
    ['stop_sequence', 'end_turn'],
    ['pause_turn', 'other'],
  ])('maps stop_reason %s → %s', async (apiReason, expected) => {
    const { provider } = setup(apiResponse({ stop_reason: apiReason, content: [] }));
    const result = await provider.complete(request([{ role: 'user', text: 'hi' }]));
    expect(result.stopReason).toBe(expected);
  });

  it.each([
    [new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers()), 'rate_limited', true],
    [new Anthropic.APIConnectionTimeoutError(), 'timeout', true],
    [new Anthropic.APIConnectionError({ message: 'socket hang up' }), 'unavailable', true],
    [new Anthropic.InternalServerError(529, {}, 'overloaded', new Headers()), 'unavailable', true],
    [new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers()), 'auth', false],
    [new Anthropic.BadRequestError(400, {}, 'bad', new Headers()), 'invalid_request', false],
    [new Error('boom'), 'unknown', false],
  ])('normalizes %s', async (sdkError, kind, retryable) => {
    const create = vi.fn().mockRejectedValue(sdkError);
    const provider = new AnthropicLlmProvider(
      { beta: { messages: { create } } } as unknown as AnthropicClient,
      OPTIONS,
    );
    const error = await provider.complete(request([{ role: 'user', text: 'hi' }])).catch((e) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind, retryable, provider: 'anthropic' });
    expect(error.cause).toBe(sdkError);
    expect(error.message).not.toContain('x-api-key'); // vendor detail stays in `cause`
  });
});
