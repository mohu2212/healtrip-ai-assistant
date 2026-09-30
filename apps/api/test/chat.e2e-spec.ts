import type { NestExpressApplication } from '@nestjs/platform-express';
import { LlmError, LlmProvider } from '../src/llm/llm.types.js';
import { ScriptedLlmProvider } from '../src/llm/providers/scripted.provider.js';
import { createChatTestApp } from './support/chat-test-app.js';
import type { InMemoryConversationRepository } from './support/in-memory-conversation.repository.js';

/**
 * The chat API over HTTP with the real middleware, agent, tools, triage rules and grounding — the
 * offline demo brain plays the model, catalog and conversation storage are in-memory fakes.
 */
describe('Chat API (e2e)', () => {
  let app: NestExpressApplication;
  let conversations: InMemoryConversationRepository;
  let harness: Awaited<ReturnType<typeof createChatTestApp>>;

  async function start(options: { env?: Record<string, string>; llm?: LlmProvider } = {}) {
    harness = await createChatTestApp(options);
    ({ app, conversations } = harness);
  }
  afterEach(() => app?.close());

  const http = () => harness.http();
  const newConversation = (locale = 'en') => harness.newConversation(locale);
  const send = (id: string, text: string) => harness.send(id, text);

  describe('happy path (demo brain)', () => {
    beforeEach(() => start());

    it('chest pain → screening questions → grounded specialist cards → history', async () => {
      const id = await newConversation();

      const first = await send(id, "I have chest pain and I'm not sure where to go").expect(201);
      expect(first.body.data.userMessage).toMatchObject({
        role: 'user',
        text: "I have chest pain and I'm not sure where to go",
      });
      expect(first.body.data.assistantMessage).toMatchObject({
        role: 'assistant',
        reply: { nextStep: 'NEED_MORE_INFO', emergency: false, language: 'en' },
        doctors: [],
        meta: { outcome: 'completed', model: 'healtrip-demo-brain' },
      });
      expect(first.body.data.assistantMessage.reply.clarifyingQuestions).toHaveLength(3);

      const second = await send(id, 'None of these. For weeks, 3/10, I am in Cairo.').expect(201);
      const answer = second.body.data.assistantMessage;
      expect(answer.reply).toMatchObject({
        nextStep: 'SPECIALIST',
        recommendedDoctorIds: ['doc_001'],
      });
      // Cards are full catalog records, not model text.
      expect(answer.doctors).toEqual([
        expect.objectContaining({
          id: 'doc_001',
          consultationFeeUsd: 60,
          hospital: expect.objectContaining({ id: 'hosp_01' }),
        }),
      ]);
      expect(answer.trace.map((t: { tool: string }) => t.tool)).toEqual([
        'assess_urgency',
        'search_doctors',
        'submit_response',
      ]);
      expect(JSON.stringify(answer.trace)).not.toContain('Cairo.'); // trace has no patient text

      const history = await http().get(`/api/conversations/${id}`).expect(200);
      expect(history.body.data).toMatchObject({ id, locale: 'en' });
      expect(history.body.data.messages.map((m: { role: string }) => m.role)).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ]);
      expect(history.body.data.messages[3].doctors[0].id).toBe('doc_001');
    });

    it('sends a patient with warning signs to the emergency department', async () => {
      const id = await newConversation();
      const res = await send(id, 'chest pain spreading to my left arm').expect(201);
      expect(res.body.data.assistantMessage).toMatchObject({
        reply: { nextStep: 'ER_NOW', emergency: true, urgency: 'emergency' },
        doctors: [],
        hospitals: [expect.objectContaining({ id: 'hosp_01', hasEmergency: true })],
      });
    });

    it('answers in Arabic', async () => {
      const id = await newConversation('ar');
      const res = await send(id, 'عندي ألم في صدري').expect(201);
      expect(res.body.data.assistantMessage.reply.language).toBe('ar');
    });

    it('creates a conversation without a body (English by default)', async () => {
      const res = await http().post('/api/conversations').expect(201);
      expect(res.body.data).toMatchObject({ locale: 'en', messages: [] });
    });
  });

  describe('validation and errors', () => {
    beforeEach(() => start());

    it.each([
      [{ text: '   ' }, 'text'],
      [{ text: 'x'.repeat(2001) }, 'text'],
      [{ text: 'hi', role: 'system' }, 'role'],
      [{}, 'text'],
    ])('rejects body %j', async (body, path) => {
      const id = await newConversation();
      const res = await http().post(`/api/conversations/${id}/messages`).send(body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details[0].path).toBe(path);
      expect(conversations.messages).toEqual([]);
    });

    it('rejects a non-UUID conversation ID and an unknown locale', async () => {
      expect(
        (await http().get('/api/conversations/123').expect(400)).body.error.details[0].path,
      ).toBe('id');
      await http().post('/api/conversations').send({ locale: 'fr' }).expect(400);
    });

    it('404s for an unknown conversation', async () => {
      const res = await send('00000000-0000-4000-8000-000000000000', 'hi').expect(404);
      expect(res.body.error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Conversation not found',
      });
    });
  });

  it('rate-limits chat messages more strictly than other endpoints', async () => {
    await start({ env: { CHAT_RATE_LIMIT_PER_MINUTE: '2' } });
    const id = await newConversation();
    await send(id, 'I have a headache').expect(201);
    await send(id, 'still a headache').expect(201);
    const res = await send(id, 'and again').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    await http().get(`/api/conversations/${id}`).expect(200); // other routes unaffected
  });

  it('returns 503 LLM_UNAVAILABLE on an LLM outage and stores nothing', async () => {
    await start({
      llm: new ScriptedLlmProvider(() => {
        throw new LlmError('unavailable', 'anthropic');
      }),
    });
    const id = await newConversation();
    const res = await send(id, 'I have had a mild headache for a week').expect(503);
    expect(res.body.error).toMatchObject({
      code: 'LLM_UNAVAILABLE',
      requestId: expect.any(String),
    });
    expect(conversations.messages).toEqual([]);
  });
});
