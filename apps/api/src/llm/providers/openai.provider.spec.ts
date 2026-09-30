import OpenAI from 'openai';
import { LlmError, type LlmRequest } from '../llm.types.js';
import { OpenAiLlmProvider, type OpenAiClient } from './openai.provider.js';

const OPTIONS = { model: 'gpt-5', effort: 'medium', maxTokens: 16000 } as const;

function completion(message: Record<string, unknown>, finish_reason = 'stop') {
  return {
    id: 'cmpl_1',
    model: 'gpt-5',
    choices: [
      { index: 0, finish_reason, message: { role: 'assistant', refusal: null, ...message } },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 40 },
    },
  };
}

function setup(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  const client = { chat: { completions: { create } } } as unknown as OpenAiClient;
  return { provider: new OpenAiLlmProvider(client, OPTIONS), create };
}

const request = (messages: LlmRequest['messages']): LlmRequest => ({
  system: 'SYSTEM',
  tools: [
    {
      name: 'search_doctors',
      description: 'Search',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      strict: true,
    },
  ],
  messages,
});

describe('OpenAiLlmProvider', () => {
  it('builds a Chat Completions request with strict function tools and no forced tool choice', async () => {
    const { provider, create } = setup(completion({ content: 'Hi' }));
    await provider.complete(request([{ role: 'user', text: 'hello' }]));

    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      model: 'gpt-5',
      max_completion_tokens: 16000,
      reasoning_effort: 'medium',
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'hello' },
      ],
      tools: [{ type: 'function', function: { name: 'search_doctors', strict: true } }],
    });
    expect(params).not.toHaveProperty('tool_choice');
  });

  it('maps tool calls, parses arguments, and keeps invalid JSON as a raw string', async () => {
    const { provider } = setup(
      completion(
        {
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'search_doctors', arguments: '{"city":"Cairo"}' },
            },
            {
              id: 'c2',
              type: 'function',
              function: { name: 'search_doctors', arguments: '{"city":' },
            },
          ],
        },
        'tool_calls',
      ),
    );
    const result = await provider.complete(request([{ role: 'user', text: 'x' }]));

    expect(result.stopReason).toBe('tool_use');
    expect(result.blocks).toEqual([
      { type: 'tool_call', id: 'c1', name: 'search_doctors', input: { city: 'Cairo' } },
      { type: 'tool_call', id: 'c2', name: 'search_doctors', input: '{"city":' },
    ]);
    expect(result.usage).toEqual({ inputTokens: 50, outputTokens: 10, cacheReadTokens: 40 });
  });

  it('replays assistant turns and sends one tool message per result', async () => {
    const { provider, create } = setup(completion({ content: 'done' }));
    const native = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'search_doctors', arguments: '{}' } },
      ],
    };
    await provider.complete(
      request([
        { role: 'user', text: 'x' },
        { role: 'assistant', blocks: [], native: { provider: 'openai', content: native } },
        {
          role: 'tool_results',
          results: [
            { toolCallId: 'c1', content: '{"doctors":[]}' },
            { toolCallId: 'c2', content: '{"error":"x"}', isError: true },
          ],
        },
      ]),
    );
    const { messages } = create.mock.calls[0][0];
    expect(messages.slice(2)).toEqual([
      native,
      { role: 'tool', tool_call_id: 'c1', content: '{"doctors":[]}' },
      { role: 'tool', tool_call_id: 'c2', content: 'ERROR: {"error":"x"}' },
    ]);
  });

  it('treats refusals and content filtering as refusal', async () => {
    const refused = setup(completion({ content: null, refusal: 'I cannot help with that' }));
    expect(
      (await refused.provider.complete(request([{ role: 'user', text: 'x' }]))).stopReason,
    ).toBe('refusal');
    const filtered = setup(completion({ content: '' }, 'content_filter'));
    expect(
      (await filtered.provider.complete(request([{ role: 'user', text: 'x' }]))).stopReason,
    ).toBe('refusal');
  });

  it.each([
    [new OpenAI.RateLimitError(429, {}, 'slow down', new Headers()), 'rate_limited'],
    [new OpenAI.APIConnectionTimeoutError(), 'timeout'],
    [new OpenAI.AuthenticationError(401, {}, 'bad key', new Headers()), 'auth'],
    [new OpenAI.InternalServerError(503, {}, 'down', new Headers()), 'unavailable'],
  ])('normalizes %s', async (sdkError, kind) => {
    const create = vi.fn().mockRejectedValue(sdkError);
    const provider = new OpenAiLlmProvider(
      { chat: { completions: { create } } } as unknown as OpenAiClient,
      OPTIONS,
    );
    const error = await provider.complete(request([{ role: 'user', text: 'x' }])).catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe(kind);
  });
});
