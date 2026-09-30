import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../common/errors/app-error.js';
import { EvidenceRegistry } from './evidence.js';
import { stripUnsupportedStrictKeywords, ToolRegistry } from './tool-registry.js';
import { defineTool } from './tool.types.js';

const echo = defineTool({
  name: 'echo',
  description: 'Echoes text',
  inputSchema: z.strictObject({
    text: z.string().max(5),
    times: z.number().int().min(1).optional(),
  }),
  async run({ text }) {
    return { echoed: text };
  },
  summarize: () => ({ echoed: true }),
});

const strictTool = defineTool({
  name: 'strict_tool',
  description: 'Strict',
  inputSchema: z.strictObject({
    n: z.number().int().min(0).max(10).nullable(),
    s: z.string().min(2),
  }),
  strict: true,
  async run() {
    return {};
  },
});

const failing = (error: unknown) =>
  defineTool({
    name: 'failing',
    description: 'Always fails',
    inputSchema: z.strictObject({}),
    async run() {
      throw error;
    },
  });

const ctx = () => ({ evidence: new EvidenceRegistry() });
const parse = (content: string) => JSON.parse(content);

describe('ToolRegistry', () => {
  it('exposes JSON-schema definitions without $schema, in registration order', () => {
    const defs = new ToolRegistry([echo, strictTool]).definitions();
    expect(defs.map((d) => d.name)).toEqual(['echo', 'strict_tool']);
    expect(defs[0]).toEqual({
      name: 'echo',
      description: 'Echoes text',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', maxLength: 5 },
          times: { type: 'integer', minimum: 1, maximum: expect.any(Number) },
        },
        required: ['text'],
        additionalProperties: false,
      },
    });
  });

  it('removes keywords unsupported by strict mode from strict tools only', () => {
    const def = new ToolRegistry([strictTool]).definitions()[0];
    expect(def.strict).toBe(true);
    expect(def.inputSchema).toEqual({
      type: 'object',
      properties: {
        n: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        s: { type: 'string' },
      },
      required: ['n', 's'],
      additionalProperties: false,
    });
  });

  it('never strips a property that happens to be named like a keyword', () => {
    expect(
      stripUnsupportedStrictKeywords({ properties: { maximum: { type: 'integer', maximum: 3 } } }),
    ).toEqual({ properties: { maximum: { type: 'integer' } } });
  });

  it('rejects duplicate tool names', () => {
    expect(() => new ToolRegistry([echo, echo])).toThrow('Duplicate');
  });

  it('runs a valid call and records an audit entry', async () => {
    const { result, execution } = await new ToolRegistry([echo]).execute(
      { id: 't1', name: 'echo', input: { text: 'hi' } },
      ctx(),
    );
    expect(result).toEqual({ toolCallId: 't1', content: '{"echoed":"hi"}' });
    expect(execution).toMatchObject({
      toolCallId: 't1',
      name: 'echo',
      ok: true,
      summary: { echoed: true },
    });
    expect(execution.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns an error result for an unknown tool, listing the valid ones', async () => {
    const { result } = await new ToolRegistry([echo]).execute(
      { id: 't1', name: 'drop_tables', input: {} },
      ctx(),
    );
    expect(result.isError).toBe(true);
    expect(parse(result.content)).toEqual({
      error: 'UNKNOWN_TOOL',
      message: 'Available tools: echo',
    });
  });

  it('never runs a tool with invalid arguments; explains what to fix without echoing input', async () => {
    const run = vi.spyOn(echo, 'run');
    const { result, execution } = await new ToolRegistry([echo]).execute(
      { id: 't1', name: 'echo', input: { text: 'much too long', sql: 'DROP' } },
      ctx(),
    );
    expect(run).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const body = parse(result.content);
    expect(body.error).toBe('INVALID_ARGUMENTS');
    expect(body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['(root)', 'text']);
    expect(result.content).not.toContain('much too long');
    expect(execution).toMatchObject({ ok: false, summary: { error: 'INVALID_ARGUMENTS' } });
  });

  it('rejects unparseable arguments (raw string from a provider)', async () => {
    const { result } = await new ToolRegistry([echo]).execute(
      { id: 't1', name: 'echo', input: '{"text":' },
      ctx(),
    );
    expect(parse(result.content).error).toBe('INVALID_ARGUMENTS');
  });

  it('turns domain errors into actionable error results', async () => {
    const error = AppError.validation([{ path: 'specialty', message: 'Valid values: cardiology' }]);
    const { result } = await new ToolRegistry([failing(error)]).execute(
      { id: 't1', name: 'failing', input: {} },
      ctx(),
    );
    expect(result.isError).toBe(true);
    expect(parse(result.content)).toEqual({
      error: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: [{ path: 'specialty', message: 'Valid values: cardiology' }],
    });
  });

  it('hides unexpected errors behind a generic result', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { result } = await new ToolRegistry([
      failing(new Error('connect ECONNREFUSED db:5432')),
    ]).execute({ id: 't1', name: 'failing', input: {} }, ctx());
    expect(parse(result.content).error).toBe('TOOL_FAILED');
    expect(result.content).not.toContain('ECONNREFUSED');
    expect(logged).toHaveBeenCalled(); // details go to the server log instead
  });
});
