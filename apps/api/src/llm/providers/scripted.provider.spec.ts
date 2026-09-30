import { LlmError, type LlmRequest } from '../llm.types.js';
import { ScriptedLlmProvider, scripted } from './scripted.provider.js';

const req = (text: string): LlmRequest => ({
  system: 's',
  tools: [],
  messages: [{ role: 'user', text }],
});

describe('ScriptedLlmProvider', () => {
  it('replays a queue of responses and records requests', async () => {
    const provider = new ScriptedLlmProvider([
      scripted.toolCall('search_doctors', { city: 'Cairo' }),
      scripted.text('done'),
    ]);
    expect((await provider.complete(req('a'))).stopReason).toBe('tool_use');
    expect((await provider.complete(req('b'))).blocks).toEqual([{ type: 'text', text: 'done' }]);
    expect(provider.requests.map((r) => r.messages[0])).toEqual([
      { role: 'user', text: 'a' },
      { role: 'user', text: 'b' },
    ]);
  });

  it('fails loudly when the queue is exhausted', async () => {
    const provider = new ScriptedLlmProvider([]);
    await expect(provider.complete(req('a'))).rejects.toBeInstanceOf(LlmError);
  });

  it('supports script functions that react to the request', async () => {
    const provider = new ScriptedLlmProvider((request, i) =>
      scripted.text(`${i}:${request.messages.length}`),
    );
    expect((await provider.complete(req('a'))).blocks[0]).toEqual({ type: 'text', text: '0:1' });
  });

  it('records a snapshot, not a live reference', async () => {
    const provider = new ScriptedLlmProvider(() => scripted.text('ok'));
    const request = req('a');
    await provider.complete(request);
    request.messages.push({ role: 'user', text: 'mutated later' });
    expect(provider.requests[0].messages).toHaveLength(1);
  });
});
