import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions';
import type { LlmEffort } from '../../config/env.schema.js';
import {
  LlmError,
  LlmProvider,
  type AssistantBlock,
  type LlmErrorKind,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmStopReason,
} from '../llm.types.js';

export interface OpenAiProviderOptions {
  model: string;
  effort: LlmEffort;
  maxTokens: number;
}

export type OpenAiClient = { chat: { completions: Pick<OpenAI['chat']['completions'], 'create'> } };

const PROVIDER = 'openai';

const STOP_REASONS: Record<string, LlmStopReason> = {
  stop: 'end_turn',
  tool_calls: 'tool_use',
  length: 'max_tokens',
  content_filter: 'refusal',
};

/**
 * OpenAI via Chat Completions with function tools — a second adapter proving the agent is not tied
 * to one vendor. Same contract as the Anthropic adapter: no forced tool choice, strict schemas when
 * requested, SDK-managed retries/timeouts, normalized errors.
 */
export class OpenAiLlmProvider extends LlmProvider {
  readonly name = PROVIDER;

  constructor(
    private readonly client: OpenAiClient,
    private readonly options: OpenAiProviderOptions,
  ) {
    super();
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model: this.options.model,
      max_completion_tokens: this.options.maxTokens,
      reasoning_effort: this.options.effort,
      messages: [
        { role: 'system', content: request.system },
        ...request.messages.flatMap(toOpenAiMessages),
      ],
      tools: request.tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          ...(tool.strict ? { strict: true } : {}),
        },
      })),
    };

    let completion: ChatCompletion;
    try {
      completion = await this.client.chat.completions.create(params);
    } catch (error) {
      throw new LlmError(classifyError(error), PROVIDER, { cause: error });
    }

    const choice = completion.choices[0];
    if (!choice) throw new LlmError('unknown', PROVIDER);
    const message = choice.message;

    const blocks: AssistantBlock[] = [];
    if (message.content) blocks.push({ type: 'text', text: message.content });
    for (const call of message.tool_calls ?? []) {
      if (call.type !== 'function') continue;
      blocks.push({
        type: 'tool_call',
        id: call.id,
        name: call.function.name,
        input: parseArguments(call.function.arguments),
      });
    }

    // Replayable assistant message (only fields accepted as request input).
    const native: ChatCompletionAssistantMessageParam = {
      role: 'assistant',
      content: message.content,
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
    };

    return {
      stopReason: message.refusal ? 'refusal' : (STOP_REASONS[choice.finish_reason] ?? 'other'),
      blocks,
      native: { provider: PROVIDER, content: native },
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        cacheReadTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? undefined,
      },
      model: completion.model,
    };
  }
}

function toOpenAiMessages(message: LlmMessage): ChatCompletionMessageParam[] {
  switch (message.role) {
    case 'user':
      return [{ role: 'user', content: message.text }];
    case 'assistant': {
      if (message.native?.provider === PROVIDER) {
        return [message.native.content as ChatCompletionAssistantMessageParam];
      }
      const text = message.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
      const toolCalls = message.blocks.flatMap((b) =>
        b.type === 'tool_call'
          ? [
              {
                id: b.id,
                type: 'function' as const,
                function: { name: b.name, arguments: JSON.stringify(b.input) },
              },
            ]
          : [],
      );
      return [
        {
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
      ];
    }
    case 'tool_results':
      // Chat Completions has no error flag on tool messages; mark failures in the content.
      return message.results.map((result) => ({
        role: 'tool' as const,
        tool_call_id: result.toolCallId,
        content: result.isError ? `ERROR: ${result.content}` : result.content,
      }));
  }
}

/** Arguments arrive as a JSON string; keep the raw string if invalid so validation rejects it. */
function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function classifyError(error: unknown): LlmErrorKind {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof OpenAI.APIConnectionError) return 'unavailable';
  if (error instanceof OpenAI.RateLimitError) return 'rate_limited';
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  ) {
    return 'auth';
  }
  if (
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.NotFoundError ||
    error instanceof OpenAI.UnprocessableEntityError
  ) {
    return 'invalid_request';
  }
  if (error instanceof OpenAI.InternalServerError) return 'unavailable';
  if (error instanceof OpenAI.APIError && (error.status ?? 0) >= 500) return 'unavailable';
  return 'unknown';
}
