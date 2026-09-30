/**
 * Provider-neutral contract between the agent and any LLM vendor.
 *
 * The agent only ever sees these types; vendor SDK types stay inside the adapters. This keeps the
 * orchestration logic (tool loop, grounding checks) testable with a scripted provider and lets the
 * vendor be swapped by configuration.
 */

export type JsonSchema = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema (object) for the tool input. */
  inputSchema: JsonSchema;
  /**
   * Ask the provider to guarantee schema-valid arguments. Requires a strict-compatible schema
   * (`additionalProperties: false`, every property listed in `required`).
   */
  strict?: boolean;
}

export type AssistantBlock =
  | { type: 'text'; text: string }
  /** `input` is the parsed arguments; a raw string if the model produced invalid JSON. */
  | { type: 'tool_call'; id: string; name: string; input: unknown };

export interface ToolResult {
  toolCallId: string;
  /** Tool output serialized for the model (JSON text). */
  content: string;
  isError?: boolean;
}

/**
 * The provider's own representation of an assistant turn. Replayed **verbatim** to the same
 * provider on the next request of the tool loop — some vendors require it (e.g. Claude's thinking
 * blocks are bound to the exact conversation that produced them). Ignored by other providers.
 */
export interface NativeContent {
  provider: string;
  content: unknown;
}

export type LlmMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; blocks: AssistantBlock[]; native?: NativeContent }
  | { role: 'tool_results'; results: ToolResult[] };

export interface LlmRequest {
  /** Must stay identical for the whole conversation (prompt caching, thinking-block binding). */
  system: string;
  messages: LlmMessage[];
  /** Must stay identical for the whole conversation, for the same reasons. */
  tools: ToolDefinition[];
}

export type LlmStopReason =
  | 'end_turn' // finished normally
  | 'tool_use' // wants tool results
  | 'max_tokens' // output cut off
  | 'refusal' // declined by the provider's safety systems
  | 'other';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export interface LlmResponse {
  stopReason: LlmStopReason;
  /** Text and tool calls only — provider-internal blocks (e.g. thinking) live in `native`. */
  blocks: AssistantBlock[];
  native: NativeContent;
  usage: LlmUsage;
  /** Model that actually served the request (may differ after a server-side fallback). */
  model: string;
}

export abstract class LlmProvider {
  abstract readonly name: string;
  abstract complete(request: LlmRequest): Promise<LlmResponse>;
}

export type LlmErrorKind =
  | 'rate_limited'
  | 'timeout'
  | 'unavailable' // 5xx / network
  | 'auth' // bad or missing credentials — a configuration problem
  | 'invalid_request' // we sent something the provider rejected — a bug
  | 'unknown';

const RETRYABLE: ReadonlySet<LlmErrorKind> = new Set(['rate_limited', 'timeout', 'unavailable']);

/**
 * Normalized provider failure. The message is safe to log; vendor details stay in `cause`.
 * `retryable` tells the caller whether trying again later can help (the SDKs have already retried).
 */
export class LlmError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly kind: LlmErrorKind,
    readonly provider: string,
    options?: { cause?: unknown },
  ) {
    super(`LLM provider "${provider}" failed: ${kind}`, options);
    this.name = 'LlmError';
    this.retryable = RETRYABLE.has(kind);
  }
}
