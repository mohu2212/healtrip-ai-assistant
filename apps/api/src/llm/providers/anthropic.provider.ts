import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaStopReason,
  BetaTool,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
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

export interface AnthropicProviderOptions {
  model: string;
  effort: LlmEffort;
  maxTokens: number;
}

/** Only the SDK surface this adapter uses — lets tests inject a fake client. */
export type AnthropicClient = { beta: { messages: Pick<Anthropic['beta']['messages'], 'create'> } };

const PROVIDER = 'anthropic';

/**
 * Server-side refusal fallback: if a safety classifier declines the request, the API re-runs it
 * on the model Anthropic recommends for that refusal category instead of returning a refusal.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const STOP_REASONS: Record<BetaStopReason, LlmStopReason> = {
  end_turn: 'end_turn',
  stop_sequence: 'end_turn',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
  model_context_window_exceeded: 'max_tokens',
  refusal: 'refusal',
  pause_turn: 'other',
  compaction: 'other',
};

/**
 * Claude via the Messages API.
 *
 * - Thinking is left at the model default (adaptive, always on for Claude Opus 5.5); depth is
 *   controlled with `output_config.effort`, set explicitly.
 * - `tool_choice` is never forced (rejected by current models); the agent steers from the prompt
 *   and checks that the expected tool was called.
 * - Assistant turns are replayed verbatim from `native` so thinking blocks stay valid within the
 *   tool loop (they are bound to the exact conversation prefix that produced them).
 * - Top-level `cache_control` caches the stable prefix (tools + system + earlier turns).
 * - Retries (408/409/429/5xx/connection) and timeouts are handled by the SDK client.
 */
export class AnthropicLlmProvider extends LlmProvider {
  readonly name = PROVIDER;

  constructor(
    private readonly client: AnthropicClient,
    private readonly options: AnthropicProviderOptions,
  ) {
    super();
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const params: MessageCreateParamsNonStreaming = {
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      system: request.system,
      messages: request.messages.map(toAnthropicMessage),
      tools: request.tools.map((tool): BetaTool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as BetaTool.InputSchema,
        ...(tool.strict ? { strict: true } : {}),
      })),
      output_config: { effort: this.options.effort },
      cache_control: { type: 'ephemeral' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    };

    let response;
    try {
      response = await this.client.beta.messages.create(params);
    } catch (error) {
      throw new LlmError(classifyError(error), PROVIDER, { cause: error });
    }

    return {
      stopReason: (response.stop_reason && STOP_REASONS[response.stop_reason]) || 'other',
      blocks: response.content.flatMap(toAssistantBlock),
      native: { provider: PROVIDER, content: response.content },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? undefined,
      },
      model: response.model,
    };
  }
}

function toAnthropicMessage(message: LlmMessage): BetaMessageParam {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.text };
    case 'assistant':
      if (message.native?.provider === PROVIDER) {
        // Verbatim replay (includes thinking / fallback blocks the agent never sees).
        return { role: 'assistant', content: message.native.content as BetaContentBlockParam[] };
      }
      return {
        role: 'assistant',
        content: message.blocks.map((block): BetaContentBlockParam =>
          block.type === 'text'
            ? { type: 'text', text: block.text }
            : { type: 'tool_use', id: block.id, name: block.name, input: block.input },
        ),
      };
    case 'tool_results':
      // All results of one assistant turn go back in a single user message.
      return {
        role: 'user',
        content: message.results.map((result) => ({
          type: 'tool_result',
          tool_use_id: result.toolCallId,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        })),
      };
  }
}

function toAssistantBlock(block: BetaContentBlock): AssistantBlock[] {
  if (block.type === 'text') return [{ type: 'text', text: block.text }];
  if (block.type === 'tool_use') {
    return [{ type: 'tool_call', id: block.id, name: block.name, input: block.input }];
  }
  return []; // thinking, fallback markers, … — kept only in `native`
}

function classifyError(error: unknown): LlmErrorKind {
  // Most specific first: the timeout error is a subclass of the connection error.
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof Anthropic.APIConnectionError) return 'unavailable';
  if (error instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return 'auth';
  }
  if (
    error instanceof Anthropic.BadRequestError ||
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.UnprocessableEntityError
  ) {
    return 'invalid_request';
  }
  if (error instanceof Anthropic.InternalServerError) return 'unavailable';
  if (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500) return 'unavailable';
  return 'unknown';
}
