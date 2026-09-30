import type { z } from 'zod';
import type { EvidenceRegistry } from './evidence.js';

export interface ToolContext {
  /** Per-turn record of entities returned by tools (used for grounding). */
  evidence: EvidenceRegistry;
}

/**
 * A capability the agent may use. Inputs are validated with `inputSchema` before `run` is called,
 * so `run` receives typed, trusted data. Tools are read-only.
 */
export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  /** Written for the model: when to use the tool and how to use its result. */
  description: string;
  inputSchema: S;
  /** Strict mode (schema-guaranteed arguments) — only for schemas with every property required. */
  strict?: boolean;
  run(input: z.output<S>, ctx: ToolContext): Promise<unknown>;
  /** Compact, patient-text-free summary of the output for the audit log. */
  summarize?(output: unknown): Record<string, unknown>;
}

/** Audit record of one tool call (persisted as ToolCallLog by the agent). */
export interface ToolExecution {
  toolCallId: string;
  name: string;
  input: unknown;
  ok: boolean;
  latencyMs: number;
  summary: Record<string, unknown>;
}

/** Helper that keeps `run`'s input typed from the schema. */
export function defineTool<S extends z.ZodType>(tool: AgentTool<S>): AgentTool<S> {
  return tool;
}
