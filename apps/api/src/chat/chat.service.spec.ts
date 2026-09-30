import type { AgentService, AgentTurnResult } from '../agent/agent.service.js';
import { toDoctorDto } from '../catalog/catalog.mapper.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import { doctorRow } from '../catalog/testing/catalog.fixtures.js';
import type { Clock } from '../common/clock.js';
import { AppError } from '../common/errors/app-error.js';
import { loadEnv } from '../config/env.schema.js';
import { InMemoryConversationRepository } from '../../test/support/in-memory-conversation.repository.js';
import { ChatService } from './chat.service.js';
import type { ConversationRepository } from './conversation.repository.js';

function turnResult(overrides: Partial<AgentTurnResult['reply']> = {}): AgentTurnResult {
  return {
    reply: {
      message: 'See a cardiologist.',
      language: 'en',
      nextStep: 'SPECIALIST',
      urgency: 'routine',
      emergency: false,
      clarifyingQuestions: [],
      quickReplies: [],
      recommendedDoctorIds: ['doc_002', 'doc_001', 'doc_gone'],
      recommendedHospitalIds: [],
      ...overrides,
    },
    trace: [
      {
        toolCallId: 'c1',
        name: 'search_doctors',
        input: { specialty: 'cardiology' },
        ok: true,
        latencyMs: 12,
        summary: { count: 2 },
      },
    ],
    outcome: 'completed',
    grounding: { corrections: 0, problems: [], droppedDoctorIds: [], droppedHospitalIds: [] },
    emergencyGuard: { suspected: false, matches: [] },
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
    iterations: 3,
    model: 'test-model',
  };
}

describe('ChatService', () => {
  let repo: InMemoryConversationRepository;
  let agent: { runTurn: ReturnType<typeof vi.fn> };
  let catalog: {
    searchDoctors: ReturnType<typeof vi.fn>;
    searchHospitals: ReturnType<typeof vi.fn>;
  };
  let service: ChatService;

  const setup = (env: Record<string, string> = {}) => {
    repo = new InMemoryConversationRepository();
    agent = { runTurn: vi.fn().mockResolvedValue(turnResult()) };
    catalog = {
      // Returned in "rating" order, i.e. not the recommendation order.
      searchDoctors: vi
        .fn()
        .mockResolvedValue([
          toDoctorDto(doctorRow({ id: 'doc_001' })),
          toDoctorDto(doctorRow({ id: 'doc_002' })),
        ]),
      searchHospitals: vi.fn().mockResolvedValue([]),
    };
    let t = Date.parse('2026-10-01T10:00:00Z');
    const clock: Clock = { now: () => new Date((t += 1000)) };
    service = new ChatService(
      repo as unknown as ConversationRepository,
      agent as unknown as AgentService,
      catalog as unknown as CatalogService,
      clock,
      loadEnv({ DATABASE_URL: 'postgresql://u:p@h/db', LLM_PROVIDER: 'mock', ...env }),
    );
  };
  beforeEach(() => setup());

  it('runs a turn, stores it with its audit trail, and returns DB-hydrated cards in recommendation order', async () => {
    const { id } = await service.createConversation('en');
    const result = await service.sendMessage(id, 'I have chest pain', 'req-123');

    expect(agent.runTurn).toHaveBeenCalledWith({
      history: [],
      userText: 'I have chest pain',
      locale: 'en',
      requestId: 'req-123',
    });
    expect(catalog.searchDoctors).toHaveBeenCalledWith({
      ids: ['doc_002', 'doc_001', 'doc_gone'],
      limit: 20,
    });
    // Order follows the recommendation; IDs no longer in the catalog are skipped.
    expect(result.assistantMessage.doctors.map((d) => d.id)).toEqual(['doc_002', 'doc_001']);
    expect(result.assistantMessage.trace).toEqual([
      { tool: 'search_doctors', ok: true, latencyMs: 12, summary: { count: 2 } },
    ]);
    expect(result.assistantMessage.meta).toEqual({
      outcome: 'completed',
      fallbackReason: null,
      model: 'test-model',
    });
    expect(result.userMessage).toMatchObject({ role: 'user', text: 'I have chest pain' });

    expect(repo.messages.map((m) => [m.role, m.requestId])).toEqual([
      ['USER', 'req-123'],
      ['ASSISTANT', 'req-123'],
    ]);
    expect(repo.messages[1].toolCalls).toHaveLength(1);
  });

  it('sends earlier turns to the agent as plain text, within the history window', async () => {
    setup({ CHAT_HISTORY_TURNS: '1' });
    const { id } = await service.createConversation('ar');
    await service.sendMessage(id, 'first', null);
    agent.runTurn.mockResolvedValue(turnResult({ message: 'second answer' }));
    await service.sendMessage(id, 'second', null);
    await service.sendMessage(id, 'third', null);

    expect(agent.runTurn.mock.calls[2][0]).toMatchObject({
      history: [
        { role: 'user', text: 'second' },
        { role: 'assistant', text: 'second answer' },
      ],
      locale: 'ar',
    });
  });

  it('returns the full hydrated history', async () => {
    const { id } = await service.createConversation('en');
    await service.sendMessage(id, 'hello', null);
    const conversation = await service.getConversation(id);

    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conversation.messages[1]).toMatchObject({
      doctors: [{ id: 'doc_002' }, { id: 'doc_001' }],
    });
  });

  it('404s for an unknown conversation', async () => {
    await expect(
      service.sendMessage('00000000-0000-4000-8000-000000000000', 'hi', null),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Conversation not found',
    });
  });

  it('caps the number of turns per conversation', async () => {
    setup({ CHAT_MAX_TURNS: '1' });
    const { id } = await service.createConversation('en');
    await service.sendMessage(id, 'one', null);
    await expect(service.sendMessage(id, 'two', null)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  });

  it('rejects a second message while a reply is still being generated', async () => {
    const { id } = await service.createConversation('en');
    let release!: () => void;
    agent.runTurn.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(turnResult()))),
    );

    const first = service.sendMessage(id, 'one', null);
    await vi.waitFor(() => expect(agent.runTurn).toHaveBeenCalled());
    await expect(service.sendMessage(id, 'two', null)).rejects.toMatchObject({ code: 'CONFLICT' });

    release();
    await first;
    await expect(service.sendMessage(id, 'three', null)).resolves.toBeDefined(); // lock released
  });

  it('stores nothing when the agent fails, and releases the lock', async () => {
    const { id } = await service.createConversation('en');
    agent.runTurn.mockRejectedValueOnce(new AppError('LLM_UNAVAILABLE', 'down', 503));

    await expect(service.sendMessage(id, 'hi', null)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
    expect(repo.messages).toEqual([]);
    await expect(service.sendMessage(id, 'retry', null)).resolves.toBeDefined();
  });

  it('skips catalog lookups when nothing was recommended', async () => {
    agent.runTurn.mockResolvedValue(
      turnResult({ recommendedDoctorIds: [], nextStep: 'NEED_MORE_INFO' }),
    );
    const { id } = await service.createConversation('en');
    await service.sendMessage(id, 'hi', null);
    expect(catalog.searchDoctors).not.toHaveBeenCalled();
  });
});
