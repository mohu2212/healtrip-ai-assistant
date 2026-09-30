import { LlmError, LlmProvider, type LlmRequest, type LlmResponse } from '../llm.types.js';

/** Produces the next response from the request (and how many calls came before it). */
export type LlmScript = (
  request: LlmRequest,
  callIndex: number,
) => LlmResponse | Promise<LlmResponse>;

const PROVIDER = 'mock';

/**
 * Deterministic, offline provider. Used by tests (assert on the exact requests the agent sends)
 * and for a keyless demo (`LLM_PROVIDER=mock`). Accepts either a script function or a fixed queue.
 */
export class ScriptedLlmProvider extends LlmProvider {
  readonly name = PROVIDER;
  /** Deep copies of every request received, in order. */
  readonly requests: LlmRequest[] = [];
  private readonly script: LlmScript;

  constructor(script: LlmScript | LlmResponse[]) {
    super();
    this.script = Array.isArray(script) ? queueScript(script) : script;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const callIndex = this.requests.length;
    this.requests.push(structuredClone(request));
    return this.script(request, callIndex);
  }
}

function queueScript(responses: LlmResponse[]): LlmScript {
  return (_request, callIndex) => {
    const next = responses[callIndex];
    if (!next) {
      throw new LlmError('unknown', PROVIDER, {
        cause: new Error(`Scripted provider exhausted after ${responses.length} responses`),
      });
    }
    return next;
  };
}

/** Helpers for building responses in scripts and tests. */
export const scripted = {
  text(text: string): LlmResponse {
    return response('end_turn', [{ type: 'text', text }]);
  },
  toolCall(name: string, input: unknown, id = `call_${name}`): LlmResponse {
    return response('tool_use', [{ type: 'tool_call', id, name, input }]);
  },
  refusal(): LlmResponse {
    return response('refusal', []);
  },
};

function response(
  stopReason: LlmResponse['stopReason'],
  blocks: LlmResponse['blocks'],
): LlmResponse {
  return {
    stopReason,
    blocks,
    native: { provider: PROVIDER, content: blocks },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: 'scripted',
  };
}
