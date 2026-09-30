import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/errors/app-error.js';
import type { ToolDefinition, ToolResult } from '../llm/llm.types.js';
import type { AgentTool, ToolContext, ToolExecution } from './tool.types.js';

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Owns the agent's tools: exposes their definitions to the LLM and executes calls safely.
 *
 * Execution never throws — every failure becomes an `isError` tool result the model can read and
 * correct (wrong arguments, unknown specialty, …). Nothing the model sends reaches a tool without
 * passing the tool's zod schema first.
 */
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools: Map<string, AgentTool>;
  private readonly cachedDefinitions: ToolDefinition[];

  constructor(tools: AgentTool[]) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
    if (this.tools.size !== tools.length) throw new Error('Duplicate tool names');
    // Computed once: the tool list must be byte-identical across requests (caching, thinking).
    this.cachedDefinitions = tools.map(toDefinition);
  }

  definitions(): ToolDefinition[] {
    return this.cachedDefinitions;
  }

  async execute(
    call: ToolCall,
    ctx: ToolContext,
  ): Promise<{ result: ToolResult; execution: ToolExecution }> {
    const started = performance.now();
    const finish = (ok: boolean, output: unknown, summary: Record<string, unknown>) => ({
      result: {
        toolCallId: call.id,
        content: JSON.stringify(output),
        ...(ok ? {} : { isError: true }),
      },
      execution: {
        toolCallId: call.id,
        name: call.name,
        input: call.input,
        ok,
        latencyMs: Math.round(performance.now() - started),
        summary,
      },
    });

    const tool = this.tools.get(call.name);
    if (!tool) {
      return finish(
        false,
        { error: 'UNKNOWN_TOOL', message: `Available tools: ${[...this.tools.keys()].join(', ')}` },
        { error: 'UNKNOWN_TOOL' },
      );
    }

    const parsed = tool.inputSchema.safeParse(call.input);
    if (!parsed.success) {
      return finish(
        false,
        {
          error: 'INVALID_ARGUMENTS',
          message: 'Fix the arguments and call the tool again.',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.') || '(root)',
            message: i.message,
          })),
        },
        { error: 'INVALID_ARGUMENTS' },
      );
    }

    try {
      const output = await tool.run(parsed.data, ctx);
      return finish(true, output, tool.summarize?.(output) ?? {});
    } catch (error) {
      if (error instanceof AppError) {
        // Domain errors carry a safe, actionable message (e.g. the list of valid specialties).
        return finish(
          false,
          { error: error.code, message: error.message, details: error.details },
          { error: error.code },
        );
      }
      this.logger.error({ err: error, tool: call.name }, 'Tool failed unexpectedly');
      return finish(
        false,
        { error: 'TOOL_FAILED', message: 'The tool failed. Do not guess its result.' },
        { error: 'TOOL_FAILED' },
      );
    }
  }
}

function toDefinition(tool: AgentTool): ToolDefinition {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(tool.inputSchema, { io: 'input' });
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.strict ? stripUnsupportedStrictKeywords(jsonSchema) : jsonSchema,
    ...(tool.strict ? { strict: true } : {}),
  };
}

/**
 * Strict tool schemas don't support numeric/string/array bound keywords. They are removed from
 * what the model sees; the zod schema still enforces them when the call is executed.
 */
const UNSUPPORTED_IN_STRICT = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'default',
]);

export function stripUnsupportedStrictKeywords<T>(node: T): T {
  if (Array.isArray(node)) return node.map(stripUnsupportedStrictKeywords) as T;
  if (node === null || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !UNSUPPORTED_IN_STRICT.has(key))
      .map(([key, value]) => [
        key,
        // `properties` maps names → schemas: recurse into values without filtering property names.
        key === 'properties'
          ? Object.fromEntries(
              Object.entries(value as object).map(([k, v]) => [
                k,
                stripUnsupportedStrictKeywords(v),
              ]),
            )
          : stripUnsupportedStrictKeywords(value),
      ]),
  ) as T;
}
